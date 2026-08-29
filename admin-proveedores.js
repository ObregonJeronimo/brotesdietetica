/* =============================================================================
   PROVEEDORES  —  Brotes Dietética
   =============================================================================
   Qué deja cada proveedor. El catálogo ya sabía de quién es cada producto —cada
   uno apunta a una `lista`, y la pantalla de Productos las llama "Listas de
   proveedores"— pero ese dato no se usaba para nada más que filtrar y armar el
   PDF semanal. Acá se cruza con las ventas para poder decidir qué reponer.

   NO SE CREA UNA ENTIDAD "PROVEEDOR". `listas` ya es eso. Un segundo modelo en
   paralelo obligaría a que cada producto llevara dos campos que dicen lo mismo, y
   en unos meses uno de los dos estaría desactualizado. Es exactamente lo que ya
   pasó en este proyecto con la tarjeta de venta mayorista y con renderStockList.

   LO QUE TODAVÍA NO ESTÁ: cuánto se le GASTA a cada proveedor. El egreso de caja
   "Pago a proveedor" guarda concepto, monto y un detalle de texto libre, pero no
   a quién se le pagó, así que no hay forma de sumarlo por proveedor. Eso llega
   con la carga de compras; hasta entonces esta pantalla muestra la mitad de
   venta, que es la que sí se puede calcular sin inventar datos.

   EL RANKING VA POR FACTURACIÓN, NUNCA POR CANTIDAD. Un producto por peso vende
   GRAMOS y uno normal UNIDADES: ordenar por cantidad pone 300 g de nueces (300)
   arriba de un producto que se vendió de a 2, y el top sale al revés de la
   realidad. Son 202 productos por peso sobre 636. La cantidad se muestra, pero
   con su unidad y sin mezclarse en el orden.
   ============================================================================= */

const PROV_PERIODOS = [
  { dias: 30,  etq: 'Últimos 30 días' },
  { dias: 90,  etq: 'Últimos 90 días' },
  { dias: 180, etq: 'Últimos 6 meses' },
];
/* 90 días por defecto: con 30 se decide mal a principio de mes, cuando todavía
   casi no hay ventas cargadas, y 180 es mucha lectura para lo que agrega. */
let _provDias = 90;
let _provDatos = null;       /* { desde, hasta, dias, porLista } */
let _provAbierto = null;     /* id de la lista abierta */

/* Con prefijo propio: _pesos ya existe en admin-caja.js y dos const con el
   mismo nombre en el scope global tiran SyntaxError al cargar. */
const _provPesos = n => '$' + Math.round(Number(n || 0)).toLocaleString('es-AR');

/* Cantidad legible, sin mezclar gramos con unidades. */
function _provCant(p) {
  const partes = [];
  const g = Number(p.gramos || 0);
  if (g) partes.push(g < 1000
    ? g.toLocaleString('es-AR') + ' g'
    : (g / 1000).toLocaleString('es-AR', { maximumFractionDigits: 2 }) + ' kg');
  if (p.unidades) partes.push(Number(p.unidades).toLocaleString('es-AR') + ' u');
  return partes.join(' + ') || '—';
}

function _provFecha(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
}

/* ============================ DATOS ============================ */

/* Las ventas del período, de las dos colecciones. Se pide una vez por período y
   queda en memoria: cambiar de proveedor no vuelve a consultar. */
async function _provCargarVentas(dias) {
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - dias * 86400000);
  const dDesde = _provFecha(desde), dHasta = _provFecha(hasta);
  const pedir = async (col, tipo) => {
    try {
      const q = await db.collection(col)
        .where('fecha', '>=', new Date(dDesde + 'T00:00:00'))
        .where('fecha', '<=', new Date(dHasta + 'T23:59:59')).get();
      const out = [];
      q.forEach(d => out.push(Object.assign({ docId: d.id, _tipo: tipo }, d.data())));
      return out;
    } catch (e) { console.warn('proveedores/' + col + ':', e); return []; }
  };
  const [min, may] = await Promise.all([
    pedir('ventas', 'minorista'), pedir('ventasMayoristas', 'mayorista'),
  ]);
  return { ventas: min.concat(may), desde: dDesde, hasta: dHasta, dias: dias };
}

/* Cruza las ventas con el catálogo y arma, por proveedor, qué se vendió de él. */
function _provAgrupar(bruto) {
  /* El item de una venta guarda el id del producto; de ahí sale la lista. Si el
     producto se borró después de venderse, el id ya no resuelve: esa venta va a
     "Sin proveedor" en vez de desaparecer de los totales. */
  const porId = {};
  (typeof allProducts !== 'undefined' ? allProducts : []).forEach(p => { porId[p.id] = p; });

  const porLista = {};
  const tocar = id => (porLista[id] = porLista[id] || {
    listaId: id, facturado: 0, ventas: 0, productos: {},
  });

  bruto.ventas.forEach(v => {
    const tocadas = new Set();
    (v.items || []).forEach(i => {
      if (!i) return;
      const prod = porId[i.id];
      const lid = (prod && prod.lista) || '__sin__';
      const L = tocar(lid);
      const clave = i.id || ('n:' + (i.nombre || ''));
      const p = (L.productos[clave] = L.productos[clave] || {
        id: i.id || null, nombre: i.nombre || (prod && prod.nombre) || '(sin nombre)',
        unidades: 0, gramos: 0, monto: 0, veces: 0,
      });
      const esPeso = (i.tipoVenta === 'peso') || (prod && prod.tipoVenta === 'peso');
      if (esPeso) p.gramos += Number(i.cantidad || 0);
      else p.unidades += Number(i.cantidad || 0);
      /* subtotal es lo que se cobró de verdad por ese renglón, con su descuento
         ya aplicado. Recalcularlo con precio x cantidad da mil veces de más en
         los productos por peso, donde el precio es POR KILO. */
      const sub = Number(i.subtotal || 0);
      p.monto += sub; p.veces++;
      L.facturado += sub;
      tocadas.add(lid);
    });
    tocadas.forEach(lid => { tocar(lid).ventas++; });
  });
  return porLista;
}

async function loadProveedores() {
  const cont = document.getElementById('provBody');
  if (!cont) return;
  cont.innerHTML = '<p style="color:var(--text-dim);font-size:0.88rem;padding:1rem 0">Cargando...</p>';
  /* Un token por pedido: cambiar de período dos veces rápido dejaba dos cargas en
     vuelo y pintaba la que terminaba última, que no es la que se pidió última. */
  const req = (window._provReq = (window._provReq || 0) + 1);
  const dias = _provDias;
  try {
    const bruto = await _provCargarVentas(dias);
    if (req !== window._provReq) return;
    _provDatos = Object.assign({}, bruto, { porLista: _provAgrupar(bruto) });
    delete _provDatos.ventas;   /* ya está resumido: no se guardan cientos de docs */
    renderProveedores();
  } catch (e) {
    cont.innerHTML = '<p style="color:var(--danger);font-size:0.88rem">No se pudo cargar: ' + esc(e.message) + '</p>';
  }
}

/* ============================ PANTALLA ============================ */

function _provCard(titulo, cuerpo) {
  return '<div class="card" style="padding:1.15rem 1.25rem">' +
    '<h3 style="font-size:0.92rem;font-weight:700;margin-bottom:0.85rem">' + titulo + '</h3>' + cuerpo + '</div>';
}

function _provFila(etq, val, sangria) {
  return '<div style="display:flex;justify-content:space-between;gap:1rem;padding:0.33rem 0;font-size:0.86rem">' +
    '<span style="color:var(--text-dim)' + (sangria ? ';padding-left:0.9rem' : '') + '">' + etq + '</span>' +
    '<span style="font-weight:600;white-space:nowrap">' + val + '</span></div>';
}

/* Todo lo que se sabe de un proveedor, venga o no de las ventas. */
function _provResumen(lista) {
  const prods = (typeof allProducts !== 'undefined' ? allProducts : []).filter(p => p.lista === lista.id);
  const d = (_provDatos && _provDatos.porLista[lista.id]) || { facturado: 0, ventas: 0, productos: {} };
  const vendidos = Object.keys(d.productos).length;
  return {
    lista: lista,
    productos: prods.length,
    ocultos: prods.filter(p => p.oculto === true).length,
    sinStock: prods.filter(p => Number(p.stock || 0) <= 0).length,
    porPeso: prods.filter(p => p.tipoVenta === 'peso').length,
    facturado: d.facturado,
    ventas: d.ventas,
    vendidos: vendidos,
    /* Los que existen en el catálogo y NO se vendieron ni una vez en el período.
       Es el dato que dice qué dejar de comprar. */
    sinVender: Math.max(0, prods.length - vendidos),
    top: Object.values(d.productos).sort((a, b) => b.monto - a.monto),
  };
}

function renderProveedores() {
  const cont = document.getElementById('provBody');
  if (!cont) return;
  const listas = (typeof listasData !== 'undefined' && listasData) ? listasData.slice() : [];
  const per = PROV_PERIODOS.map(p =>
    '<button class="btn ' + (p.dias === _provDias ? 'btn-primary' : 'btn-secondary') + '" ' +
    'style="width:auto;flex:0 0 auto;padding:0.3rem 0.8rem;font-size:0.78rem" ' +
    'onclick="provPeriodo(' + p.dias + ')">' + p.etq + '</button>').join('');

  let cab =
    '<div class="toolbar" style="margin-bottom:1rem;align-items:center">' +
      '<h3 style="font-size:1.05rem;font-weight:700;flex:1">Proveedores</h3>' +
      '<div style="display:flex;gap:0.4rem;flex-wrap:wrap">' + per + '</div>' +
    '</div>' +
    '<p style="font-size:0.83rem;color:var(--text-dim);line-height:1.55;margin-bottom:1rem;max-width:70ch">' +
      'Qué se vendió de cada proveedor en el período, para decidir qué reponer. ' +
      'El orden es por <b>facturación</b> y no por cantidad: un producto suelto vende gramos y ' +
      'uno envasado unidades, y sumarlos en el mismo número pone a cualquier granel arriba de todo.' +
    '</p>';

  if (!listas.length) {
    cont.innerHTML = cab + _provCard('Sin proveedores',
      '<p style="font-size:0.85rem;color:var(--text-dim)">Todavía no hay ninguna lista de proveedor cargada. ' +
      'Se crean desde Productos, en "Listas de proveedores".</p>');
    return;
  }

  const resumenes = listas.map(_provResumen).sort((a, b) => b.facturado - a.facturado);
  const sinProv = (_provDatos && _provDatos.porLista['__sin__']) || null;

  const tarjetas = resumenes.map(r => {
    const abierto = _provAbierto === r.lista.id;
    const mejor = r.top[0];
    return '<button type="button" onclick="provAbrir(\'' + r.lista.id + '\')" class="card" ' +
      'style="padding:1rem 1.1rem;text-align:left;cursor:pointer;border:' +
      (abierto ? '2px solid var(--accent)' : '1px solid var(--border)') + ';width:100%">' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:0.6rem;margin-bottom:0.45rem">' +
        '<span style="font-weight:700;font-size:0.95rem">' + esc(r.lista.nombre) + '</span>' +
        '<span style="font-weight:700;white-space:nowrap">' + _provPesos(r.facturado) + '</span>' +
      '</div>' +
      '<div style="font-size:0.78rem;color:var(--text-dim);line-height:1.5">' +
        r.productos + ' producto' + (r.productos === 1 ? '' : 's') +
        ' &middot; ' + r.ventas + ' venta' + (r.ventas === 1 ? '' : 's') +
        (r.sinVender ? ' &middot; ' + r.sinVender + ' sin vender' : '') +
      '</div>' +
      (mejor ? '<div style="font-size:0.78rem;color:var(--accent-light);margin-top:0.3rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
        'Lo que más deja: ' + esc(mejor.nombre) + '</div>' : '') +
      '</button>';
  }).join('');

  cont.innerHTML = cab +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:0.85rem;margin-bottom:1.25rem">' +
      tarjetas + '</div>' +
    (sinProv && sinProv.facturado
      ? '<p style="font-size:0.82rem;color:#EDB833;margin-bottom:1rem">' +
        'Además se vendieron ' + _provPesos(sinProv.facturado) + ' de productos sin proveedor asignado ' +
        '(o de productos que se borraron después de venderse).</p>'
      : '') +
    '<div id="provDetalle"></div>';

  if (_provAbierto) _provRenderDetalle();
}

function _provRenderDetalle() {
  const cont = document.getElementById('provDetalle');
  if (!cont) return;
  const lista = (listasData || []).find(l => l.id === _provAbierto);
  if (!lista) { cont.innerHTML = ''; return; }
  const r = _provResumen(lista);
  const dias = (_provDatos && _provDatos.dias) || _provDias;

  const top = r.top.slice(0, 10);
  const resto = r.top.slice(10);

  const filaProd = (p, i) =>
    '<div style="display:flex;gap:0.6rem;align-items:baseline;padding:0.38rem 0;font-size:0.85rem;border-bottom:1px solid rgba(255,255,255,0.04)">' +
      '<span style="color:var(--text-dim);font-size:0.75rem;width:1.4rem;flex:0 0 auto">' + (i + 1) + '</span>' +
      '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p.nombre) + '</span>' +
      '<span style="color:var(--text-dim);font-size:0.76rem;white-space:nowrap">' + _provCant(p) + '</span>' +
      '<span style="font-weight:600;white-space:nowrap;min-width:5.5rem;text-align:right">' + _provPesos(p.monto) + '</span>' +
    '</div>';

  const nadaVendido = '<p style="font-size:0.85rem;color:var(--text-dim)">No se vendió ningún producto de este proveedor en el período.</p>';

  /* Los del catálogo que no aparecieron en ninguna venta. Es lo que hay que
     mirar antes de volver a comprarles. */
  const vendidosIds = new Set(r.top.map(p => p.id).filter(Boolean));
  const quietos = (typeof allProducts !== 'undefined' ? allProducts : [])
    .filter(p => p.lista === lista.id && !vendidosIds.has(p.id))
    .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || '')));

  cont.innerHTML =
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:1rem">' +
      _provCard(esc(lista.nombre) + ' <span style="font-weight:400;color:var(--text-dim);font-size:0.82rem">· últimos ' + dias + ' días</span>',
        _provFila('Facturado', _provPesos(r.facturado)) +
        _provFila('Ventas con productos suyos', String(r.ventas)) +
        '<div style="margin-top:0.6rem;padding-top:0.5rem;border-top:1px solid var(--border)">' +
        _provFila('Productos en el catálogo', String(r.productos)) +
        _provFila('Se vendieron', String(r.vendidos), true) +
        _provFila('No se vendió ninguno', String(r.sinVender), true) +
        (r.porPeso ? _provFila('Se venden por peso', String(r.porPeso), true) : '') +
        (r.ocultos ? _provFila('Ocultos en la tienda', String(r.ocultos), true) : '') +
        (r.sinStock ? _provFila('Sin stock', String(r.sinStock), true) : '') +
        '</div>') +
      _provCard('Los 10 que más dejan',
        top.length ? top.map(filaProd).join('') : nadaVendido) +
    '</div>' +
    (resto.length ? '<div style="margin-top:1rem">' + _provCard(
        'El resto de lo vendido (' + resto.length + ')',
        resto.map((p, i) => filaProd(p, i + 10)).join('')) + '</div>' : '') +
    (quietos.length ? '<div style="margin-top:1rem">' + _provCard(
        'No se vendieron en ' + dias + ' días (' + quietos.length + ')',
        '<p style="font-size:0.82rem;color:var(--text-dim);margin-bottom:0.6rem;line-height:1.5">' +
        'Están en el catálogo y no salió ninguno. Conviene mirarlos antes de volver a pedirlos.</p>' +
        quietos.map(p =>
          '<div style="display:flex;gap:0.6rem;align-items:baseline;padding:0.3rem 0;font-size:0.84rem;border-bottom:1px solid rgba(255,255,255,0.04)">' +
            '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p.nombreMostrado || p.nombre) + '</span>' +
            (p.oculto === true ? '<span style="font-size:0.72rem;color:var(--text-dim)">oculto</span>' : '') +
            '<span style="font-size:0.76rem;white-space:nowrap;color:' +
              (Number(p.stock || 0) <= 0 ? '#EDB833' : 'var(--text-dim)') + '">' +
              (Number(p.stock || 0) <= 0 ? 'sin stock'
                : (p.tipoVenta === 'peso' ? _provCant({ gramos: Number(p.stock || 0) }) : Number(p.stock || 0) + ' u')) +
            '</span></div>').join('')) + '</div>' : '');
}

/* ============================ ACCIONES ============================ */

function provPeriodo(dias) {
  if (_provDias === dias) return;
  _provDias = dias;
  loadProveedores();
}

function provAbrir(id) {
  _provAbierto = (_provAbierto === id) ? null : id;
  renderProveedores();
}

window.loadProveedores = loadProveedores;
window.provPeriodo = provPeriodo;
window.provAbrir = provAbrir;
