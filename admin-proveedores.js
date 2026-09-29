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
let _provFiltro = '';        /* lo escrito en el buscador de la lista */

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
  return partes.join(' + ') || '-';
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
    const [bruto] = await Promise.all([
      _provCargarVentas(dias),
      /* Las compras las trae admin-compras.js. Si ese modulo no cargo, la
         pantalla sigue funcionando sin la mitad de gasto en vez de romperse. */
      (typeof cargarCompras === 'function') ? cargarCompras(dias) : Promise.resolve(null),
      /* Las deudas tienen su propia consulta y NO dependen del período: una compra
         impaga de hace ocho meses se sigue debiendo. */
      (typeof cargarDeudas === 'function') ? cargarDeudas(true) : Promise.resolve(null),
    ]);
    if (req !== window._provReq) return;
    _provDatos = Object.assign({}, bruto, { porLista: _provAgrupar(bruto) });
    delete _provDatos.ventas;   /* ya está resumido: no se guardan cientos de docs */
    renderProveedores();
  } catch (e) {
    cont.innerHTML = '<p style="color:var(--danger);font-size:0.88rem">No se pudo cargar: ' + esc(e.message) + '</p>';
  }
}

/* ============================ PANTALLA ============================ */

function _provCard(titulo, cuerpo, accion) {
  return '<div class="card" style="padding:1.15rem 1.25rem">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:0.6rem;margin-bottom:0.85rem">' +
      '<h3 style="font-size:0.92rem;font-weight:700">' + titulo + '</h3>' +
      (accion || '') +
    '</div>' + cuerpo + '</div>';
}

function _provFila(etq, val, sangria) {
  return '<div style="display:flex;justify-content:space-between;gap:1rem;padding:0.33rem 0;font-size:0.86rem">' +
    '<span style="color:var(--text-dim)' + (sangria ? ';padding-left:0.9rem' : '') + '">' + etq + '</span>' +
    '<span style="font-weight:600;white-space:nowrap">' + val + '</span></div>';
}

/* Los del catálogo que no aparecieron en ninguna venta del período. Es lo que
   hay que mirar antes de volver a comprarles. Vive aparte porque lo usan la
   pantalla y la exportación, y si se calculara dos veces el día que cambie el
   criterio uno de los dos se quedaría con el viejo. */
/* La categoría de un producto, para agrupar en la exportación. Los productos
   sin categoría van todos juntos al final en vez de desaparecer: si a alguien
   se le paso clasificar uno, tiene que verlo, no perderlo. */
function _provCategoria(p) {
  const c = p && String(p.categoria || '').trim();
  return c || 'Sin categoría';
}

/* Agrupa por categoría y devuelve los grupos ordenados alfabéticamente, con
   "Sin categoría" siempre al final. */
function _provPorCategoria(prods) {
  const grupos = {};
  (prods || []).forEach(p => {
    const c = _provCategoria(p);
    (grupos[c] = grupos[c] || []).push(p);
  });
  return Object.keys(grupos).sort((a, b) => {
    if (a === 'Sin categoría') return 1;
    if (b === 'Sin categoría') return -1;
    return a.localeCompare(b);
  }).map(c => ({ categoria: c, productos: grupos[c] }));
}

function _provNoVendidos(lista, r) {
  const vendidosIds = new Set(r.top.map(p => p.id).filter(Boolean));
  return (typeof allProducts !== 'undefined' ? allProducts : [])
    .filter(p => p.lista === lista.id && !vendidosIds.has(p.id) && p.depurado !== true)
    .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || '')));
}

/* LOS TAMAÑOS DE UN MISMO PRODUCTO, JUNTOS (pedido del dueño, 29/09/2026). Un producto con
   bolsas o presentaciones es UNO, como en Productos, Stock y Compras. En la ficha, "Mani RC"
   de 1 kg salía con el nombre de la tienda ("Mani Recubierto de Chocolate") y el de 3 kg por
   otro lado, como si fueran dos productos. Ahora, en lo vendido, en lo que no se vendió y en
   la exportación, sus tamaños van juntos, con el nombre del producto arriba y cada uno con su
   tamaño ("Mani RC x 1 kg"). El agrupado es el de Stock (agruparParaStock, admin-variantes.js):
   sin ese archivo, todo sale como antes. Los números de la ficha (productos en el catálogo,
   cuántos se vendieron) siguen contando cada tamaño, como la pantalla de Productos. */

/* El nombre: en un producto con tamaños, el interno con su tamaño; en los demás, el de siempre. */
function _provNombre(p) {
  const n = (p && (p.nombreMostrado || p.nombre)) || '';
  return typeof _nombreConPresentacion === 'function' ? _nombreConPresentacion(p, n) : n;
}

/* La lista con los de un mismo producto juntos: los sueltos como vienen, y cada producto con
   tamaños como { grupo: { nombre, que, total, principal, miembros } }, con solo los tamaños que
   vienen en la lista, de menor a mayor (total dice cuántos tiene el producto). */
function _provJuntar(prods) {
  if (typeof agruparParaStock !== 'function') return prods;
  return agruparParaStock(prods).map(x => {
    if (!x.__stockGrupo) return x;
    const g = x.__stockGrupo;
    return { grupo: { nombre: g.nombre, que: g.que, total: g.miembros.length, principal: g.principal,
      miembros: g.miembros.filter(m => m.coincide).map(m => m.producto) } };
  });
}

/* Lo vendido con los tamaños de un mismo producto juntos: un puesto por producto, con lo que
   sumaron entre todos, y en `miembros` lo de cada tamaño, de menor a mayor y con su nombre de
   ahora. Sigue ordenado por lo facturado, ahora del producto entero. Lo que ya no está en el
   catálogo (un producto borrado) va suelto, como siempre. */
function _provTopJuntos(top) {
  const porId = new Map((typeof allProducts !== 'undefined' ? allProducts : []).map(p => [p.id, p]));
  const grupoDe = new Map();
  _provJuntar(top.map(x => x.id && porId.get(x.id)).filter(Boolean))
    .forEach(x => { if (x.grupo) x.grupo.miembros.forEach(p => grupoDe.set(p.id, x.grupo)); });
  if (!grupoDe.size) return top;
  const out = [];
  const hechos = new Set();
  top.forEach(x => {
    const g = x.id ? grupoDe.get(x.id) : null;
    if (!g) { out.push(x); return; }
    if (hechos.has(g)) return;
    hechos.add(g);
    const miembros = g.miembros.map(p => Object.assign({}, top.find(y => y.id === p.id), { nombre: _provNombre(p) }));
    const suma = k => miembros.reduce((s, m) => s + Number(m[k] || 0), 0);
    out.push({ grupo: g, nombre: g.nombre, miembros: miembros,
      monto: suma('monto'), gramos: suma('gramos'), unidades: suma('unidades'), veces: suma('veces') });
  });
  return out.sort((a, b) => b.monto - a.monto);
}

/* La cabecera de un producto con tamaños: "Mani RC · 2 bolsas". */
function _provCabGrupo(g) {
  return '<span class="prov-grupo-n"><i class="bi bi-stack"></i> ' + esc(g.nombre) +
    ' <span class="prov-grupo-que">&middot; ' + g.total + ' ' + g.que + '</span></span>';
}

/* Todo lo que se sabe de un proveedor, venga o no de las ventas. */
function _provResumen(lista) {
  /* Los depurados no se cuentan: la ficha tiene que decir lo mismo que la tabla de
     Productos filtrada por este proveedor. */
  const prods = (typeof allProducts !== 'undefined' ? allProducts : []).filter(p => p.lista === lista.id && p.depurado !== true);
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
    /* Lo que se le pago en el periodo. Sale de las compras cargadas; sin compras
       queda en 0 y la pantalla no muestra la fila. */
    gastado: ((typeof _comprasCache !== 'undefined' && _comprasCache &&
               _comprasCache.porProveedor[lista.id]) || { total: 0 }).total,
    debe: (typeof deudaDe === 'function' ? deudaDe(lista.id).saldo : 0),
    deudas: (typeof deudaDe === 'function' ? deudaDe(lista.id).cuantas : 0),
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

  /* Cada proveedor es una fila de la lista de la izquierda. El rotulo del monto
     NO va en cada fila -asi estaba antes y con 27 proveedores chocaba con el
     nombre-: va una sola vez, como encabezado de la columna.
     Van TODOS, y los que no coinciden con el buscador, escondidos: provBuscar
     filtra escondiendo y mostrando. Antes se dibujaban solo los que coincidian, y
     despues de elegir uno con algo escrito, al borrar la busqueda no volvian los
     otros: la lista quedaba con lo que habia encontrado (29/09/2026). */
  const coinciden = new Set(_provFiltrados(resumenes));
  const filas = resumenes.map(r => {
    const sel = _provAbierto === r.lista.id;
    /* El primero del ranking de la ficha, con los tamaños de un producto juntos (29/09):
       con el de cada tamaño por separado, aca podia decir otro que el primero de la ficha. */
    const mejor = _provTopJuntos(r.top)[0];
    return '<button type="button" class="prov-item' + (sel ? ' sel' : '') + '" ' +
      (coinciden.has(r) ? '' : 'style="display:none" ') +
      'onclick="provAbrir(\'' + r.lista.id + '\')">' +
      '<span class="prov-item-top">' +
        '<span class="prov-item-n">' + esc(r.lista.nombre) + '</span>' +
        '<span class="prov-item-m' + (r.facturado ? '' : ' cero') + '">' +
          _provPesos(r.facturado) + '</span>' +
      '</span>' +
      '<span class="prov-item-d">' +
        r.productos + ' producto' + (r.productos === 1 ? '' : 's') +
        ' &middot; ' + r.ventas + ' venta' + (r.ventas === 1 ? '' : 's') +
        (r.sinVender ? ' &middot; ' + r.sinVender + ' sin vender' : '') +
        (r.gastado ? ' &middot; le compraste ' + _provPesos(r.gastado) : '') +
      '</span>' +
      (r.debe ? '<span class="prov-item-x prov-deuda">' +
        '<i class="bi bi-exclamation-circle"></i> Le deb&eacute;s ' + _provPesos(r.debe) +
        '</span>' : '') +
      (mejor ? '<span class="prov-item-x">Lo que m\u00e1s deja: ' + esc(mejor.nombre) + '</span>' : '') +
      '</button>';
  }).join('');

  /* Si lo escrito no coincide con ninguno, el cartel va despues de las filas
     escondidas, como lo pone provBuscar, que lo saca cuando vuelve a haber. */
  const lista = !filas ? '<p class="prov-vacio">No hay proveedores.</p>'
    : filas + (coinciden.size ? '' : '<p class="prov-vacio">Ning\u00fan proveedor coincide con la b\u00fasqueda.</p>');

  cont.innerHTML = cab +
    (sinProv && sinProv.facturado
      ? '<p style="font-size:0.82rem;color:#EDB833;margin-bottom:1rem">' +
        'Adem\u00e1s se vendieron ' + _provPesos(sinProv.facturado) + ' de productos sin proveedor asignado ' +
        '(o de productos que se borraron despu\u00e9s de venderse).</p>'
      : '') +
    '<div class="prov-split">' +
      '<div class="prov-lado">' +
        /* El buscador va DENTRO de la columna, no arriba de las dos: asi
           arranca a la misma altura que el panel de la derecha. */
        /* Como los otros buscadores del panel: con lupa y bien a la vista (26/09). */
        '<div class="search-box campo-destacado prov-buscar"><i class="bi bi-search"></i>' +
          '<input type="text" id="provBuscarInput" placeholder="Buscar proveedor..." value="' + esc(_provFiltro) + '" ' +
          'oninput="provBuscar(this.value)"></div>' +
        '<div class="prov-cab"><span>Proveedor</span><span>Monto generado</span></div>' +
        '<div class="prov-lista">' + lista + '</div>' +
      '</div>' +
      '<div id="provDetalle">' +
        (_provAbierto ? '' :
          '<div class="card" style="padding:2.5rem 1.5rem;text-align:center">' +
            '<i class="bi bi-truck" style="font-size:1.8rem;color:var(--text-dim);display:block;margin-bottom:0.6rem"></i>' +
            '<p style="font-size:0.9rem;color:var(--text-dim);line-height:1.6;max-width:44ch;margin:0 auto">' +
            'Eleg\u00ed un proveedor de la lista para ver qu\u00e9 se le vendi\u00f3, qu\u00e9 no sali\u00f3 ' +
            'y las compras que le cargaste.</p></div>') +
      '</div>' +
    '</div>';

  if (_provAbierto) _provRenderDetalle();
}

function _provRenderDetalle() {
  const cont = document.getElementById('provDetalle');
  if (!cont) return;
  const lista = (listasData || []).find(l => l.id === _provAbierto);
  if (!lista) { cont.innerHTML = ''; return; }
  const r = _provResumen(lista);
  const dias = (_provDatos && _provDatos.dias) || _provDias;

  /* Los tamaños de un mismo producto, juntos (29/09): el producto entero es un puesto. */
  const vendido = _provTopJuntos(r.top);
  const top = vendido.slice(0, 10);
  const resto = vendido.slice(10);

  /* Un renglón de lo vendido: el puesto (vacío en un tamaño dentro de su producto), el
     nombre, la cantidad y lo facturado. La cabecera de un producto con tamaños (cabecera)
     baja de línea en vez de cortarse: cortada, en la tarjeta angosta no se leía cuántas
     bolsas tiene. */
  const renglon = (nombreHtml, cant, monto, puesto, chico, cabecera) =>
    '<div style="display:flex;gap:0.6rem;align-items:baseline;padding:0.38rem 0;font-size:' + (chico ? '0.8rem' : '0.85rem') + ';border-bottom:1px solid rgba(255,255,255,0.04)">' +
      '<span style="color:var(--text-dim);font-size:0.75rem;width:1.4rem;flex:0 0 auto">' + puesto + '</span>' +
      '<span style="flex:1;' + (cabecera ? 'min-width:0' : 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap') + '">' + nombreHtml + '</span>' +
      '<span style="color:var(--text-dim);font-size:0.76rem;white-space:nowrap">' + cant + '</span>' +
      '<span style="font-weight:600;white-space:nowrap;min-width:5.5rem;text-align:right">' + monto + '</span>' +
    '</div>';
  /* Un producto con tamaños va en un recuadro: arriba su puesto y el total, y abajo lo de cada
     tamaño. La cantidad total va solo en las bolsas: sumar unidades de presentaciones
     distintas (x1 con x12) da un número que no dice nada. */
  const filaProd = (p, i) => !p.grupo
    ? renglon(esc(p.nombre), _provCant(p), _provPesos(p.monto), i + 1)
    : '<div class="prov-grupo">' +
        renglon(_provCabGrupo(p.grupo), p.grupo.que === 'bolsas' ? _provCant(p) : '', _provPesos(p.monto), i + 1, false, true) +
        p.miembros.map(m => renglon(esc(m.nombre), _provCant(m), _provPesos(m.monto), '', true)).join('') +
      '</div>';

  const nadaVendido = '<p style="font-size:0.85rem;color:var(--text-dim)">No se vendió ningún producto de este proveedor en el período.</p>';

  const quietos = _provNoVendidos(lista, r);
  /* Un producto que no se vendió, con su stock. Los tamaños de un mismo producto van juntos,
     en un recuadro (29/09). */
  const filaQuieto = p =>
    '<div style="display:flex;gap:0.6rem;align-items:baseline;padding:0.3rem 0;font-size:0.84rem;border-bottom:1px solid rgba(255,255,255,0.04)">' +
      '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(_provNombre(p)) + '</span>' +
      (p.oculto === true ? '<span style="font-size:0.72rem;color:var(--text-dim)">oculto</span>' : '') +
      '<span style="font-size:0.76rem;white-space:nowrap;color:' +
        (Number(p.stock || 0) <= 0 ? '#EDB833' : 'var(--text-dim)') + '">' +
        (Number(p.stock || 0) <= 0 ? 'sin stock'
          : (p.tipoVenta === 'peso' ? _provCant({ gramos: Number(p.stock || 0) }) : Number(p.stock || 0) + ' u')) +
      '</span></div>';

  cont.innerHTML =
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:1rem">' +
      _provCard(esc(lista.nombre) + ' <span style="font-weight:400;color:var(--text-dim);font-size:0.82rem">· últimos ' + dias + ' días</span>',
        _provFila('Facturado', _provPesos(r.facturado)) +
        _provFila('Ventas con productos suyos', String(r.ventas)) +
        (r.debe
          ? _provFila('<span style="color:var(--danger)">Le debés</span>',
              '<span style="color:var(--danger)">' + _provPesos(r.debe) + '</span>')
          : '') +
        (r.gastado
          ? _provFila('Le compraste', _provPesos(r.gastado)) +
            /* La resta cruda, sin llamarla "ganancia": lo comprado no es lo
               vendido. Lo que entro puede seguir en la gondola y lo que salio
               puede haberse comprado el mes pasado. */
            _provFila('Diferencia del período', _provPesos(r.facturado - r.gastado))
          : '') +
        '<div style="margin-top:0.6rem;padding-top:0.5rem;border-top:1px solid var(--border)">' +
        _provFila('Productos en el catálogo', String(r.productos)) +
        _provFila('Se vendieron', String(r.vendidos), true) +
        _provFila('No se vendió ninguno', String(r.sinVender), true) +
        (r.porPeso ? _provFila('Se venden por peso', String(r.porPeso), true) : '') +
        (r.ocultos ? _provFila('Ocultos en la tienda', String(r.ocultos), true) : '') +
        (r.sinStock ? _provFila('Sin stock', String(r.sinStock), true) : '') +
        '</div>',
        '<button class="btn btn-secondary" style="width:auto;flex:0 0 auto;padding:0.28rem 0.7rem;font-size:0.78rem" ' +
          'onclick="openProvExportModal()"><i class="bi bi-download"></i> Exportar</button>') +
      _provCard('Los 10 productos más vendidos de este proveedor',
        top.length ? top.map(filaProd).join('') : nadaVendido) +
      ((typeof renderComprasDeProveedor === 'function')
        ? renderComprasDeProveedor(lista.id, dias) : '') +
    '</div>' +
    (resto.length ? '<div style="margin-top:1rem">' + _provCard(
        'El resto de lo vendido (' + resto.length + ')',
        resto.map((p, i) => filaProd(p, i + 10)).join('')) + '</div>' : '') +
    (quietos.length ? '<div style="margin-top:1rem">' + _provCard(
        'No se vendieron en ' + dias + ' días (' + quietos.length + ')',
        '<p style="font-size:0.82rem;color:var(--text-dim);margin-bottom:0.6rem;line-height:1.5">' +
        'Están en el catálogo y no salió ninguno. Conviene mirarlos antes de volver a pedirlos.</p>' +
        _provJuntar(quietos).map(x => x.grupo
          ? '<div class="prov-grupo"><div class="prov-grupo-cab">' + _provCabGrupo(x.grupo) + '</div>' +
            x.grupo.miembros.map(filaQuieto).join('') + '</div>'
          : filaQuieto(x)).join('')) + '</div>' : '');
}

/* ============================ EXPORTAR ============================ */

/* El documento que se va a bajar, en PDF o en Excel. Devuelve la estructura
   que entiende admin-exportar.js: es el mismo objeto para los dos formatos,
   asi que no pueden mostrar cosas distintas.

   Es una funcion aparte y sin tocar el DOM a proposito: se puede probar el
   contenido del export sin abrir el navegador. */
function _provDocExportar(lista, incluirNoVendidos) {
  const r = _provResumen(lista);
  const dias = (_provDatos && _provDatos.dias) || _provDias;
  /* desde y hasta YA VIENEN formateados: _provCargarVentas los pasa por
     _provFecha antes de guardarlos, porque los usa para armar el rango de la
     consulta. Volver a pasarlos rompia con "d.getFullYear is not a function",
     y como provExportar() no atajaba nada, el boton Exportar no hacia
     absolutamente nada: ni exportaba ni avisaba. */
  const periodo = 'Últimos ' + dias + ' días' +
    (_provDatos && _provDatos.desde ? ' · del ' + _provDatos.desde + ' al ' + _provDatos.hasta : '');

  const resumen = [
    ['Facturado', _provPesos(r.facturado)],
    ['Ventas con productos suyos', String(r.ventas)],
  ];
  /* Lo comprado solo aparece si hay compras cargadas, igual que en pantalla:
     una fila "Le compraste $0" hace pensar que no se le compro nunca, cuando
     lo que pasa es que todavia nadie cargo una compra. */
  /* La deuda va SIEMPRE que exista, no solo si hay compras en el periodo: se
     puede deber una compra de hace ocho meses y no haberle comprado nada desde
     entonces. Un informe de un proveedor sin la plata que se le debe es un
     informe que miente por omision. */
  if (r.debe) resumen.push(['Le debés', _provPesos(r.debe)]);
  if (r.gastado) {
    resumen.push(['Le compraste', _provPesos(r.gastado)]);
    resumen.push(['Diferencia del período', _provPesos(r.facturado - r.gastado)]);
  }
  resumen.push(['Productos en el catálogo', String(r.productos)]);
  resumen.push(['Se vendieron', String(r.vendidos)]);
  resumen.push(['No se vendió ninguno', String(r.sinVender)]);
  if (r.porPeso) resumen.push(['Se venden por peso', String(r.porPeso)]);
  if (r.ocultos) resumen.push(['Ocultos en la tienda', String(r.ocultos)]);
  if (r.sinStock) resumen.push(['Sin stock', String(r.sinStock)]);

  const bloques = [{ tipo: 'pares', titulo: 'Resumen', filas: resumen }];

  /* El detalle de lo que se debe, compra por compra: es lo que sirve para
     sentarse a arreglar con el proveedor. */
  const _deudas = (typeof deudaDe === 'function') ? deudaDe(lista.id) : { compras: [] };
  if (_deudas.compras && _deudas.compras.length) {
    bloques.push({
      tipo: 'tabla',
      titulo: 'Lo que se le debe (' + _provPesos(_deudas.saldo) + ')',
      columnas: ['Compra', 'Fecha', 'Total', 'Pagado', 'Debe'],
      anchos: [22, 26, 34, 34, 34],
      derecha: [2, 3, 4],
      filas: _deudas.compras.map(c => {
        const e = deudaEstado(c);
        return ['#' + String(c.numero || 0).padStart(4, '0'),
                (typeof _cpFechaTxt === 'function' ? _cpFechaTxt(c.fecha) : ''),
                _provPesos(e.total), _provPesos(e.pagado), _provPesos(e.saldo)];
      }),
    });
  }

  /* El top NO se agrupa: es un ranking, y partirlo por categoría lo deshace.
     Se le agrega la categoría como columna, que da el mismo dato sin romper el
     orden. Sale del catálogo, porque lo que quedó guardado en la venta es el
     nombre y el precio, no la categoría. */
  const catDe = (id) => {
    const p = (typeof allProducts !== 'undefined' ? allProducts : []).find(x => x.id === id);
    return p ? _provCategoria(p) : 'Sin categoría';
  };
  /* Con los tamaños de un mismo producto juntos, como en pantalla (29/09): el producto con su
     puesto y el total, y abajo cada tamaño con lo suyo. */
  const top = _provTopJuntos(r.top).slice(0, 10);
  bloques.push({
    tipo: 'tabla',
    titulo: 'Los 10 productos más vendidos de este proveedor',
    columnas: ['#', 'Producto', 'Categoría', 'Cantidad', 'Monto'],
    anchos: [9, 68, 42, 26, 27],
    derecha: [3, 4],
    filas: top.length
      ? top.flatMap((x, i) => !x.grupo
          ? [[i + 1, x.nombre, catDe(x.id), _provCant(x), _provPesos(x.monto)]]
          : [[i + 1, x.nombre + ' (' + x.grupo.total + ' ' + x.grupo.que + ')', catDe(x.grupo.principal.id),
              x.grupo.que === 'bolsas' ? _provCant(x) : '', _provPesos(x.monto)]]
              .concat(x.miembros.map(m => ['', '· ' + m.nombre, '', _provCant(m), _provPesos(m.monto)])))
      : [['', 'No se vendió ningún producto de este proveedor en el período.', '', '', '']],
  });

  if (incluirNoVendidos) {
    const quietos = _provNoVendidos(lista, r);
    if (!quietos.length) {
      bloques.push({
        tipo: 'tabla',
        titulo: 'No se vendieron en ' + dias + ' días (0)',
        columnas: ['Producto', 'Stock'],
        anchos: [130, 40],
        derecha: [1],
        filas: [['Todos los productos de este proveedor se vendieron al menos una vez.', '']],
      });
    } else {
      /* Un bloque por categoría en vez de una lista de 600 nombres seguidos.
         Esta lista se usa para decidir qué reponer, y eso se decide por
         sector de la góndola: sin separar, hay que ir leyendo producto por
         producto y cruzando de memoria a qué categoría pertenece cada uno.

         Van como bloques separados y no como una columna más porque así el
         corte sale igual en el PDF y en el Excel, sin tocar el exportador. */
      const stockTxt = (x) => Number(x.stock || 0) <= 0 ? 'sin stock'
        : (x.tipoVenta === 'peso' ? _provCant({ gramos: Number(x.stock || 0) })
                                  : Number(x.stock || 0) + ' u');
      /* Los tamaños de un producto van todos en la categoría de su principal (revisión del
         29/09): cada tamaño guarda la suya, y un producto con dos categorías salía partido en
         dos bloques. */
      const catDe = new Map();
      _provJuntar(quietos).forEach(x => {
        if (x.grupo) x.grupo.miembros.forEach(m => catDe.set(m.id, x.grupo.principal.categoria));
      });
      const porCategoria = _provPorCategoria(quietos.map(p =>
        catDe.has(p.id) ? Object.assign({}, p, { categoria: catDe.get(p.id) }) : p));
      bloques.push({
        tipo: 'pares',
        titulo: 'No se vendieron en ' + dias + ' días (' + quietos.length + ')',
        filas: porCategoria.map(g => [g.categoria, String(g.productos.length)]),
      });
      porCategoria.forEach(g => {
        bloques.push({
          tipo: 'tabla',
          titulo: g.categoria + ' (' + g.productos.length + ')',
          columnas: ['Producto', 'Stock'],
          anchos: [130, 40],
          derecha: [1],
          /* Los tamaños de un mismo producto, juntos: el producto y abajo cada uno (29/09). */
          filas: _provJuntar(g.productos).flatMap(x => !x.grupo
            ? [[_provNombre(x), stockTxt(x)]]
            : [[x.grupo.nombre + ' (' + x.grupo.total + ' ' + x.grupo.que + ')', '']]
                .concat(x.grupo.miembros.map(m => ['· ' + _provNombre(m), stockTxt(m)]))),
        });
      });
    }
  }

  return {
    titulo: 'Proveedor ' + (lista.nombre || ''),
    subtitulo: periodo,
    archivo: 'proveedor_' + (lista.nombre || ''),
    bloques: bloques,
  };
}

function openProvExportModal() {
  const m = document.getElementById('provExportModal');
  if (!m || !_provAbierto) return;
  const lista = (listasData || []).find(l => l.id === _provAbierto);
  if (!lista) return;
  const t = document.getElementById('provExportQue');
  if (t) {
    const dias = (_provDatos && _provDatos.dias) || _provDias;
    t.textContent = lista.nombre + ' · últimos ' + dias + ' días';
  }
  m.classList.add('show');
}

function closeProvExportModal() {
  const m = document.getElementById('provExportModal');
  if (m) m.classList.remove('show');
}

function provExportar() {
  const lista = (listasData || []).find(l => l.id === _provAbierto);
  if (!lista) { showAdminToast('Abrí un proveedor primero', 'error'); return; }
  const fmt = (document.getElementById('provExportFormato') || {}).value || 'pdf';
  const noVend = !!(document.getElementById('provExportNoVendidos') || {}).checked;
  /* Armar el documento tambien puede fallar, no solo dibujarlo. exportarDoc()
     ataja lo suyo, pero si revienta antes -en _provDocExportar- el error se
     escapaba y el boton se quedaba mudo: ni archivo ni mensaje. Un boton que no
     responde es de lo peor que le podes dejar a alguien, porque no tiene forma
     de saber si fallo o si tarda. */
  let doc;
  try {
    doc = _provDocExportar(lista, noVend);
  } catch (e) {
    showAdminToast('No se pudo preparar la exportación: ' + e.message, 'error');
    return;
  }
  if (exportarDoc(doc, fmt)) closeProvExportModal();
}

/* ============================ ACCIONES ============================ */

/* Los que pasan el buscador. Compara sin acentos y sin mayusculas: nadie
   escribe "HERBOLERIA" con tilde para encontrarla. */
function _provNormalizar(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function _provFiltrados(resumenes) {
  const q = _provNormalizar(_provFiltro).trim();
  if (!q) return resumenes;
  return resumenes.filter(r => _provNormalizar(r.lista.nombre).indexOf(q) >= 0);
}

/* Filtra la lista SIN volver a dibujarla: solo esconde y muestra los botones
   que ya estan.

   Dos motivos, y los dos salieron de probarlo:

     - Si se rehiciera la pantalla entera en cada tecla, el input perderia el
       foco y habria que hacer click de nuevo para escribir la segunda letra.

     - La primera version reemplazaba el contenido de la lista por el cartel de
       "ningun proveedor coincide". Eso BORRABA los botones, y al borrar la
       busqueda no volvia ninguno: la lista quedaba vacia para siempre hasta
       recargar. Por eso el cartel se agrega al final y se saca, sin tocar lo
       que hay.

   El nombre se lee del DOM en vez de recalcular los resumenes: es el mismo
   dato y evita rehacer la cuenta de 600 productos en cada tecla. */
function provBuscar(q) {
  _provFiltro = String(q || '');
  const cont = document.getElementById('provBody');
  if (!cont) return;
  const caja = cont.querySelector('.prov-lista');
  if (!caja) { renderProveedores(); return; }

  const items = caja.querySelectorAll('.prov-item');
  if (!items.length) return;   /* no hay proveedores: su cartel ya esta puesto */

  const busca = _provNormalizar(_provFiltro).trim();
  let algo = false;
  items.forEach(b => {
    const n = b.querySelector('.prov-item-n');
    const ver = !busca || _provNormalizar(n ? n.textContent : '').indexOf(busca) >= 0;
    b.style.display = ver ? '' : 'none';
    if (ver) algo = true;
  });

  const aviso = caja.querySelector('.prov-vacio');
  if (algo) { if (aviso) aviso.remove(); }
  else if (!aviso) {
    caja.insertAdjacentHTML('beforeend',
      '<p class="prov-vacio">Ningún proveedor coincide con la búsqueda.</p>');
  }
}

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
window.provBuscar = provBuscar;
window.openProvExportModal = openProvExportModal;
window.closeProvExportModal = closeProvExportModal;
window.provExportar = provExportar;
