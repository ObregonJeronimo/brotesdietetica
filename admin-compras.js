/* =============================================================================
   COMPRAS A PROVEEDORES  —  Brotes Dietética
   =============================================================================
   La contracara de una venta. Una venta saca stock y entra plata; una compra mete
   stock y sale plata. El sistema tenía solo la mitad del circuito: sabía todo lo
   que se vendía y nada de lo que se compraba.

   Antes, cuando llegaba el proveedor, pasaban tres cosas sueltas y ninguna se
   conectaba con las otras: en Caja quedaba un egreso "Pago a proveedor" que no
   decía a quién, el stock había que subirlo a mano con la carga en tanda, y la
   factura terminaba en un cajón. Una compra junta las tres.

   TRES DECISIONES, tomadas con el cliente:

   1) EL STOCK NO SE SUMA SIEMPRE. Hay una casilla, encendida por defecto. Se
      apaga cuando la mercadería ya se contó a mano, o cuando se carga una compra
      vieja para tener el histórico de gasto: sumar ahí duplicaría el inventario.
      Apagada, la pantalla lo dice con un cartel, porque es justo el caso en el
      que después nadie se acuerda de por qué el stock no subió.

   2) LOS COSTOS NO SE PISAN SOLOS. Si pagaste $14.000 el kilo y el producto
      tenía $12.000, la compra NO lo cambia: al guardar se pregunta, con la lista
      de los que cambiaron y de cuánto a cuánto. Un costo que se mueve solo mueve
      el margen de toda la pantalla de Ganancia sin que nadie lo haya decidido.

   3) EL COSTO ES POR LA MISMA UNIDAD QUE EL PRECIO. En un producto por peso el
      precio es POR KILO y el stock va en GRAMOS. Entonces la compra pide los
      gramos que entraron y el costo POR KILO, y el subtotal divide por mil. Si se
      cargara el costo "por lo que entró", el margen de todos los productos a
      granel saldría mil veces mal y nadie lo notaría hasta cerrar el mes.

   BORRAR UNA COMPRA DEVUELVE EL STOCK que había sumado. Sin eso, una compra
   cargada dos veces por error se arregla borrando una y el inventario queda
   inflado para siempre, sin rastro de por qué.
   ============================================================================= */

let _compraItems = [];        /* los renglones que se están cargando */
let _compraArchivo = null;    /* la factura elegida, todavía sin subir */
let _compraProveedor = null;  /* id de lista */
let _comprasCache = null;     /* { dias, porProveedor, lista } */

const _cpPesos = n => '$' + Math.round(Number(n || 0)).toLocaleString('es-AR');

function _cpEsPeso(p) { return !!(p && p.tipoVenta === 'peso'); }

/* LAS BOLSAS DE UN GRANEL (pedido del dueño, 29/09/2026). Un producto con varias bolsas
   (Mani RC de 1 kg y de 3 kg) es UNO, como en Productos, Stock y la venta: en la lista para
   agregar y en "Lo que entró" sus bolsas van juntas, en un recuadro, cada una con su tamaño
   ("Mani RC x 1 kg"). Y una bolsa se carga por lo que costó la bolsa, como en el formulario
   del producto, con lo que queda el kilo al lado. El costo se sigue guardando por kilo
   (kiloDeBolsa), que es como lo lee todo lo demás. Las cuentas y el agrupado son los de
   admin-variantes.js: gramosDeBolsa, costoDeBolsa, kiloDeBolsa y agruparParaStock. */
/* Los gramos de la bolsa, si se carga por bolsa. En un producto con varias bolsas, la suya
   (gramosDeBolsa). En uno por peso sin otras bolsas (pedido del dueño, 30/09/2026), la bolsa que
   se le compra al proveedor: la que quedó anotada aparte (bolsaGramos, de una compra o de su
   ficha) o la que dice el nombre ("Lenteja x 5 kg"). Gramaje / Presentación no: es lo que ve el
   cliente en la lista de precios y en las etiquetas (pedido del dueño, 01/10). Si no lo sabe,
   null: la fila lo pregunta. Es solo de Cargar compra: la ventana de costos sigue por kilo en
   esos productos (Thiago, 30/09: no complicarlo). */
function _cpGramosBolsa(p) {
  /* Sin admin-variantes.js no hay bolsas, como antes: las cuentas de la bolsa viven ahí
     (costoDeBolsa; revisión del 01/10). */
  if (typeof gramosDeBolsa !== 'function') return null;
  const g = gramosDeBolsa(p);
  if (g || !p || p.tipoVenta !== 'peso' || p.depurado === true) return g;
  if (Number(p.bolsaGramos) > 0) return Math.round(Number(p.bolsaGramos));
  return typeof bolsaDelNombre === 'function' ? bolsaDelNombre(p.nombre) : null;
}
/* Un producto por peso, sin otras bolsas, que no dice de cuánto es la bolsa: la compra se lo
   pregunta en la fila, y al guardar queda anotado en el producto (pedido del dueño, 30/09).
   Con otras bolsas no: ahí el tamaño de cada una se pone en el producto. */
function _cpSinTam(p) {
  return _cpEsPeso(p) && typeof contenidoDeVariante === 'function' && typeof tieneVariantes === 'function' &&
    !tieneVariantes(p, (typeof allProducts !== 'undefined' && allProducts) || []) && !_cpGramosBolsa(p);
}
/* De cuánto es la bolsa, como se escribe en la compra: el número, y al lado, en el selector, si
   son kilos o gramos (de entrada, kilos). Pedido del dueño (30/09): la unidad la elige el que
   carga, no se adivina por el número. "2,5" kg son 2.500 g. En gramos, o null si no es un
   número. */
function _cpGramosEscritos(numero, unidad) {
  let s = String(numero == null ? '' : numero).trim();
  /* En gramos el punto es de miles: "1.500" son 1.500 g, no 1,5 (revisión del 01/10). */
  if (unidad === 'g') s = s.replace(/\.(?=\d{3}(?!\d))/g, '');
  /* "5," o ",5", a medio escribir, también. */
  if (!/^(\d+([.,]\d*)?|[.,]\d+)$/.test(s)) return null;
  const n = Number(s.replace(',', '.'));
  const g = Math.round(unidad === 'g' ? n : n * 1000);
  return g > 0 ? g : null;
}
/* El tamaño de una bolsa para leer: "5 kg", "2,5 kg", "500 g". */
function _cpTamTxt(g) { return _cpCant({ tipoVenta: 'peso', cantidad: g }); }
/* Al lado del costo: en una bolsa, el kilo, el precio y el mayorista; en uno por unidad, el precio y
   el mayorista (pedido del dueño, 01/10). Los que quedan si se actualiza el costo, como en la ventana
   de costos (_costoVistaHtml, admin-costos.js): con el costo de siempre, los precios que ya tiene;
   con otro, los que salen con el mismo porcentaje. */
function _cpVistaHtml(it) {
  const p = ((typeof allProducts !== 'undefined' && allProducts) || []).find(x => x && x.id === it.id);
  if (!p || typeof _costoVistaHtml !== 'function') return _cpPesos(it.costoUnitario) + (_cpEsPeso(it) ? ' el kilo' : '');
  const g = Number(it.gramosBolsa) || null;
  const c = Number(it.costoUnitario || 0);
  /* Si "Actualizar" no se va a ofrecer (el costo da igual al que tiene, redondeado: la misma cuenta
     que ofrecerActualizarCostos), los precios que ya tiene. Con $9.000,40 contra $9.000 mostraba
     $14.401 y $11.750, que no se guardaban, y en uno sin % de ganancia "Sin mayorista" aunque lo
     tuviera (02/10, revisando después de subir). */
  if (Math.round(c) === Math.round(Number(p.costo || 0))) return _costoVistaHtml(p, Math.round(Number(p.costo || 0)), g);
  /* Si se va a ofrecer, lo que se guardaría, con centavos si los tiene: así da lo mismo que el aviso
     (revisión del 01/10: con $1.154,40 mostraba $1.500 de mayorista y se guardaba $1.550). Sin % de
     ganancia el precio no cambia (ver ofrecerActualizarCostos): el que tiene, con el mayorista que
     quedaría. */
  if (!(Number(p.porcentaje) > 0) && typeof preciosDesdeCosto === 'function') {
    const cr = Math.round(c);
    return _costoVistaHtml(Object.assign({}, p, { costo: cr, precioMayorista: preciosDesdeCosto(p, c).precioMayorista }), cr, g);
  }
  return _costoVistaHtml(p, c, g);
}
/* " de 2 kg": de cuánto es la bolsa, si el nombre no lo dice ya (pedido del dueño, 30/09). En
   "Mani RC" no se veía en ningún lado que la bolsa guardada era de 2 kg; en "Lenteja x 5 kg" o
   "Mani RC x 3 kg" ya se lee, y no se repite. */
function _cpDeBolsa(nombre, g) {
  if (!(g > 0)) return '';
  const c = typeof contenidoDeVariante === 'function' ? contenidoDeVariante({ nombre: nombre }) : null;
  return c && c.unidad === 'g' && c.valor === g ? '' : ' de ' + _cpTamTxt(g);
}
function _cpEsBolsa(it) { return !!it && it.tipoVenta === 'peso' && Number(it.gramosBolsa) > 0; }
/* El nombre: en un producto con tamaños, el interno con su tamaño ("Mani RC x 1 kg"); en
   los demás, el de siempre. */
function _cpNombre(p) {
  const n = (p && (p.nombreMostrado || p.nombre)) || '';
  return typeof _nombreConPresentacion === 'function' ? _nombreConPresentacion(p, n) : n;
}
/* Lo que cuesta, como se carga: "$999 la bolsa", "$14.000 el kilo" o "$2.000 c/u". */
function _cpCostoTxt(it) {
  if (_cpEsBolsa(it)) return _cpPesos(it.costoBolsa) + ' la bolsa' + _cpDeBolsa(it.nombre, Number(it.gramosBolsa));
  return _cpPesos(it.costoUnitario) + (it.tipoVenta === 'peso' ? ' el kilo' : ' c/u');
}
/* La lista con los de un mismo producto juntos: los sueltos como vienen, y cada producto con
   tamaños como { grupo: { nombre, miembros } }. Van solo los miembros que vienen en la lista
   (de este proveedor, sin los que ya están en la compra), de menor a mayor. */
function _cpAgrupar(prods) {
  if (typeof agruparParaStock !== 'function') return prods;
  return agruparParaStock(prods).map(x => {
    if (!x.__stockGrupo) return x;
    const g = x.__stockGrupo;
    return { grupo: { nombre: g.nombre,
      miembros: g.miembros.filter(m => m.coincide).map(m => m.producto) } };
  });
}
/* La cabecera del recuadro: solo el nombre del producto, "Mani RC". Decía también "· 2
   bolsas" (los tamaños que tiene el producto) y se sacó a pedido del dueño (29/09): se leía
   como las bolsas que entraron, y a veces el recuadro mostraba una sola. */
function _cpCabGrupo(g) {
  return '<div class="cp-grupo-cab"><i class="bi bi-stack"></i> ' + esc(g.nombre) + '</div>';
}

/* UNA COMPRA GUARDADA (pedido del dueño, 29/09/2026): al verla, al exportarla y en Deudas,
   las bolsas de un mismo producto van juntas, como al cargarla. Arriba el producto y lo que
   se pagó por todas sus bolsas; abajo cada bolsa, con cuántas entraron. */

/* Cuántas bolsas son: "2 bolsas", "1 bolsa", "3,33 bolsas". Vacío si no es una bolsa. */
function _cpBolsasTxt(it) {
  if (!_cpEsBolsa(it)) return '';
  const n = Math.round(Number(it.cantidad || 0) / Number(it.gramosBolsa) * 100) / 100;
  return n.toLocaleString('es-AR', { maximumFractionDigits: 2 }) + (n === 1 ? ' bolsa' : ' bolsas');
}
/* La cantidad, y en una bolsa cuántas bolsas son: "6 kg (2 bolsas)". */
function _cpCantBolsas(it) {
  return _cpCant(it) + (_cpEsBolsa(it) ? ' (' + _cpBolsasTxt(it) + _cpDeBolsa(it.nombre, Number(it.gramosBolsa)) + ')' : '');
}
/* Lo que se pagó por las filas de un bloque. */
function _cpSumaFilas(items, filas) {
  return filas.reduce((s, k) => s + Number(items[k].subtotal || 0), 0);
}
/* Los renglones de una compra guardada, para verla: los sueltos como siempre, y las bolsas de
   un mismo producto en un recuadro con el nombre del producto y el total. */
function _cpRenglonesGuardados(items) {
  const renglon = i =>
    '<div style="display:flex;gap:0.6rem;align-items:baseline;padding:0.3rem 0;font-size:0.84rem">' +
      '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(i.nombre) + '</span>' +
      '<span style="color:var(--text-dim);font-size:0.78rem;white-space:nowrap">' + _cpCantBolsas(i) + '</span>' +
      '<span style="color:var(--text-dim);font-size:0.78rem;white-space:nowrap">' + (_cpEsBolsa(i)
        ? _cpPesos(i.costoBolsa) + '/bolsa' : _cpPesos(i.costoUnitario) + (i.tipoVenta === 'peso' ? '/kg' : '')) + '</span>' +
      '<span style="font-weight:600;white-space:nowrap;min-width:5rem;text-align:right">' + _cpPesos(i.subtotal) + '</span>' +
    '</div>';
  return _cpBloques(items).map(b => b.grupo
    ? '<div class="cp-grupo"><div class="cp-grupo-cab"><i class="bi bi-stack"></i> ' + esc(b.grupo.nombre) +
        '<span class="cp-grupo-tot">' + _cpPesos(_cpSumaFilas(items, b.filas)) + '</span></div>' +
      b.filas.map(k => renglon(items[k])).join('') + '</div>'
    : renglon(items[b.filas[0]])).join('');
}

/* Lo que se cobra por un renglón. En los de peso el costo es por kilo y la
   cantidad son gramos: por eso divide por mil. Es la misma cuenta que
   subtotalItem() hace del lado de las ventas. */
function _cpSubtotal(it) {
  const c = Number(it.costoUnitario || 0), q = Number(it.cantidad || 0);
  /* Sin saber todavía de cuánto es la bolsa (30/09), no hay costo: $0, no el kilo de antes. */
  if (it.sinTam && !(Number(it.gramosBolsa) > 0)) return 0;
  /* Una bolsa (29/09) se paga por bolsa: lo que costó la bolsa por las bolsas que entraron,
     sin pasar por el kilo redondeado (3 kg a $1.000 son $1.000, no $999). */
  if (it.tipoVenta === 'peso' && Number(it.gramosBolsa) > 0 && it.costoBolsa != null) {
    return Math.round(Number(it.costoBolsa || 0) * q / Number(it.gramosBolsa));
  }
  return it.tipoVenta === 'peso' ? Math.round(c * q / 1000) : Math.round(c * q);
}

function _cpTotal() { return _compraItems.reduce((s, i) => s + _cpSubtotal(i), 0); }

function _cpUnidad(it) { return it.tipoVenta === 'peso' ? 'g' : 'u'; }

function _cpCant(it) {
  const q = Number(it.cantidad || 0);
  if (it.tipoVenta !== 'peso') return q.toLocaleString('es-AR') + ' u';
  return q < 1000 ? q.toLocaleString('es-AR') + ' g'
                  : (q / 1000).toLocaleString('es-AR', { maximumFractionDigits: 3 }) + ' kg';
}

/* ============================ CARGA ============================ */

async function cargarCompras(dias) {
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - dias * 86400000);
  try {
    const q = await db.collection('compras')
      .where('fecha', '>=', desde).where('fecha', '<=', hasta).get();
    const lista = [];
    q.forEach(d => lista.push(Object.assign({ docId: d.id }, d.data())));
    lista.sort((a, b) => _cpMs(b.fecha) - _cpMs(a.fecha));
    const porProveedor = {};
    lista.forEach(c => {
      const k = c.proveedorId || '__sin__';
      const p = (porProveedor[k] = porProveedor[k] || { total: 0, count: 0, compras: [] });
      p.total += Number(c.total || 0); p.count++; p.compras.push(c);
    });
    _comprasCache = { dias: dias, porProveedor: porProveedor, lista: lista };
  } catch (e) {
    console.warn('compras:', e);
    _comprasCache = { dias: dias, porProveedor: {}, lista: [] };
  }
  return _comprasCache;
}

function _cpMs(f) {
  if (!f) return 0;
  if (f.seconds) return f.seconds * 1000;
  const d = new Date(f);
  return isNaN(d) ? 0 : d.getTime();
}

function _cpFechaTxt(f) {
  const ms = _cpMs(f);
  if (!ms) return '-';
  return new Date(ms).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/* ============================ TARJETA EN LA FICHA ============================ */

/* El boton de deudas del proveedor. Si el modulo de deudas no cargo, no se dibuja
   nada: el resto de la ficha sigue andando. */
/* El boton de deudas del proveedor. Si el modulo de deudas no cargo, no se dibuja
   nada: el resto de la ficha sigue andando. */
function _cpBotonDeudas(listaId) {
  if (typeof deudaDe !== 'function') return '';
  const d = deudaDe(listaId);
  const hay = d.saldo > 0;
  /* No hay clase btn-danger en el panel: el rojo se pone a mano. */
  const rojo = hay ? 'background:var(--danger);border-color:var(--danger);color:#fff;' : '';
  return '<button class="btn btn-secondary" ' +
    'style="width:100%;margin:0.55rem 0 0.6rem;font-size:0.82rem;padding:0.4rem;' + rojo + '" ' +
    'onclick="openDeudasModal(\'' + listaId + '\')">' +
    '<i class="bi bi-cash-stack"></i> ' +
    (hay ? 'Deudas &middot; le deb\u00e9s ' + _cpPesos(d.saldo) +
           ' en ' + d.cuantas + ' compra' + (d.cuantas === 1 ? '' : 's')
         : 'Deudas &middot; no le deb\u00e9s nada') +
    '</button>';
}


/* El bloque de compras que se dibuja dentro de la ficha del proveedor. */
function renderComprasDeProveedor(listaId, dias) {
  const d = (_comprasCache && _comprasCache.porProveedor[listaId]) || { total: 0, count: 0, compras: [] };
  const filas = d.compras.slice(0, 8).map(c =>
    '<div style="display:flex;gap:0.6rem;align-items:baseline;padding:0.4rem 0;font-size:0.84rem;border-bottom:1px solid rgba(255,255,255,0.04)">' +
      '<span style="color:var(--text-dim);font-size:0.76rem;white-space:nowrap;width:4.2rem;flex:0 0 auto">' + _cpFechaTxt(c.fecha) + '</span>' +
      '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
        (c.comprobante ? esc(c.comprobante) : '<span style="color:var(--text-dim)">sin comprobante</span>') +
        (c.sumoStock === false ? ' <span style="font-size:0.68rem;color:#EDB833">sin stock</span>' : '') +
        (c.facturaUrl ? ' <i class="bi bi-paperclip" style="font-size:0.72rem;color:var(--text-dim)"></i>' : '') +
      '</span>' +
      '<span style="font-weight:600;white-space:nowrap">' + _cpPesos(c.total) + '</span>' +
      '<button class="btn btn-secondary" style="width:auto;flex:0 0 auto;padding:0.12rem 0.45rem;font-size:0.7rem" ' +
        'onclick="verCompra(\'' + c.docId + '\')">Ver</button>' +
    '</div>').join('');

  return '<div class="card" style="padding:1.15rem 1.25rem">' +
    '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:0.6rem;margin-bottom:0.6rem">' +
      '<h3 style="font-size:0.92rem;font-weight:700">Compras</h3>' +
      '<button class="btn btn-primary" style="width:auto;flex:0 0 auto;padding:0.3rem 0.75rem;font-size:0.78rem" ' +
        'onclick="openCompraModal(\'' + listaId + '\')"><i class="bi bi-plus-lg"></i> Cargar compra</button>' +
    '</div>' +
    '<div style="display:flex;justify-content:space-between;gap:1rem;padding:0.33rem 0;font-size:0.86rem">' +
      '<span style="color:var(--text-dim)">Gastado en ' + dias + ' días</span>' +
      '<span style="font-weight:700;white-space:nowrap">' + _cpPesos(d.total) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;gap:1rem;padding:0.33rem 0;font-size:0.86rem">' +
      '<span style="color:var(--text-dim)">Compras cargadas</span>' +
      '<span style="font-weight:600">' + d.count + '</span></div>' +
    /* El boton de deudas va acá, pegado a las compras, porque una deuda ES una
       compra sin saldar. El monto se muestra en el boton: si hay que apretar para
       saber si se debe algo, nadie lo aprieta. */
    _cpBotonDeudas(listaId) +
    (filas || '<p style="font-size:0.83rem;color:var(--text-dim);line-height:1.5">' +
      'Todavía no hay compras cargadas de este proveedor. Cargando una queda el gasto, ' +
      'la factura y -si querés- el stock que entró.</p>') +
    (d.compras.length > 8 ? '<p style="font-size:0.76rem;color:var(--text-dim);margin-top:0.4rem">y ' +
      (d.compras.length - 8) + ' más</p>' : '') +
    '</div>';
}

/* ============================ EL FORMULARIO ============================ */

function openCompraModal(listaId) {
  _compraItems = [];
  _compraArchivo = null;
  _compraProveedor = listaId || null;
  const m = document.getElementById('compraModal');
  if (!m) return;
  const sel = document.getElementById('compraProveedor');
  if (sel) {
    sel.innerHTML = (listasData || []).map(l =>
      '<option value="' + l.id + '"' + (l.id === listaId ? ' selected' : '') + '>' + esc(l.nombre) + '</option>').join('');
  }
  const hoy = new Date();
  const f = document.getElementById('compraFecha');
  if (f) f.value = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0');
  ['compraComprobante', 'compraNotas', 'compraBuscar'].forEach(id => {
    const e = document.getElementById(id); if (e) e.value = '';
  });
  const chk = document.getElementById('compraSumarStock');
  if (chk) chk.checked = true;
  const fi = document.getElementById('compraFactura');
  if (fi) fi.value = '';
  /* El input se vacia, pero los dos carteles que lo acompanan quedaban con lo de
     la vez anterior: el modal se abria diciendo "remito-5.pdf" y "4 productos
     agregados" con la lista vacia. Se limpian junto con el resto. */
  _cpLimpiarFactura();
  /* Siempre arranca en "ya la pagué": es el caso comun, y dejar el toggle donde lo
     habia dejado la vez anterior es como se cargan deudas sin querer. */
  const rp = document.querySelector('input[name="compraPago"][value="pagada"]');
  if (rp) rp.checked = true;
  compraPagoCambio();
  renderCompraItems();
  compraBuscarProd('');
  m.classList.add('show');
}

function closeCompraModal() {
  const m = document.getElementById('compraModal');
  if (m) m.classList.remove('show');
  _compraItems = []; _compraArchivo = null;
  _cpLimpiarFactura();
}

/* Borra el nombre del archivo y el resumen de la lectura. Los dos carteles hablan
   del archivo elegido: si el archivo no esta, no pueden seguir hablando. */
function _cpLimpiarFactura() {
  const nom = document.getElementById('compraFacturaNombre');
  if (nom) nom.textContent = '';
  const caja = document.getElementById('compraLectura');
  if (caja) { caja.style.display = 'none'; caja.innerHTML = ''; }
}

/* Buscador: solo los productos del proveedor elegido. Comprarle a FRUTICOR un
   producto que en el catálogo figura de otro proveedor casi siempre es que se
   eligió mal el proveedor, no que el producto cambió de mano. */
function compraBuscarProd(q) {
  const cont = document.getElementById('compraLista');
  if (!cont) return;
  const prov = (document.getElementById('compraProveedor') || {}).value || _compraProveedor;
  const t = String(q || '').trim().toLowerCase();
  const yaEsta = new Set(_compraItems.map(i => i.id));
  let prods = (typeof allProducts !== 'undefined' ? allProducts : []).filter(p => p.lista === prov && p.depurado !== true);
  /* Por el nombre público, el interno, el código o el que se ve en la lista ("Mani RC x 1 kg",
     29/09: buscando "Mani RC" no salía la de 1 kg, que en la tienda es "Maní Recubierto de
     Chocolate"). El que se ve, al final: es el único que cuesta armar. */
  const dice = s => String(s || '').toLowerCase().includes(t);
  if (t) prods = prods.filter(p => dice(p.nombreMostrado) || dice(p.nombre) || dice(p.codigo) || dice(_cpNombre(p)));
  prods = prods.filter(p => !yaEsta.has(p.id)).slice(0, 40);
  if (!prods.length) {
    cont.innerHTML = '<p style="font-size:0.82rem;color:var(--text-dim);padding:0.5rem 0">' +
      (t ? 'Ningún producto de este proveedor coincide con la búsqueda.'
         : 'Este proveedor no tiene productos en el catálogo.') + '</p>';
    return;
  }
  /* Una bolsa dice lo que costó la bolsa, y el kilo entre paréntesis (29/09); la de 1 kg
     no, que es lo mismo (como en la tabla de Productos). */
  const boton = p => {
    const g = _cpGramosBolsa(p);
    const costo = g ? _cpPesos(costoDeBolsa(p.costo, g)) + ' la bolsa' + _cpDeBolsa(_cpNombre(p), g) +
                      (g !== 1000 ? ' (' + _cpPesos(p.costo) + ' el kilo)' : '')
                    : _cpPesos(p.costo) + (_cpEsPeso(p) ? ' el kilo' : '');
    return '<button type="button" class="cp-prod" onclick="compraAgregar(\'' + p.id + '\')">' +
      '<span class="cp-prod-n">' + esc(_cpNombre(p)) + '</span>' +
      '<span class="cp-prod-d">' + esc(p.codigo || '') + ' · costo ' + costo + '</span>' +
    '</button>';
  };
  cont.innerHTML = _cpAgrupar(prods).map(x => x.grupo
    ? '<div class="cp-grupo">' + _cpCabGrupo(x.grupo) + x.grupo.miembros.map(boton).join('') + '</div>'
    : boton(x)).join('');
}

function compraAgregar(id) {
  const p = (allProducts || []).find(x => x.id === id);
  if (!p) return;
  const g = _cpGramosBolsa(p);
  _compraItems.push(Object.assign({
    id: p.id, nombre: _cpNombre(p),
    tipoVenta: _cpEsPeso(p) ? 'peso' : 'unidad',
    cantidad: 0,
    /* Arranca con el costo que ya tiene cargado: la mayoría de las veces no
       cambió, y así solo hay que tocar los que sí. */
    costoUnitario: Number(p.costo || 0),
    costoAnterior: Number(p.costo || 0),
  /* Una bolsa: sus gramos y lo que cuesta la bolsa, desde el kilo que tiene cargado. Por peso
     y sin decir de cuánto es la bolsa (30/09): se pregunta en la fila (sinTam). */
  }, g ? { gramosBolsa: g, costoBolsa: costoDeBolsa(p.costo, g) } : {},
     !g && _cpSinTam(p) ? { sinTam: true } : {}));
  renderCompraItems();
  compraBuscarProd((document.getElementById('compraBuscar') || {}).value || '');
}

/* Le lleva el foco a la cantidad de una fila y le selecciona el contenido, para
   poder escribir el numero encima sin borrar nada. Es el paso siguiente natural
   despues de escanear: la pistola pone el producto, la persona pone cuanto. */
function _cpFocoCantidad(i) {
  const el = document.getElementById('cpCant' + i);
  if (!el) return;
  el.focus();
  if (el.select) el.select();
}

/* Un escaneo con el modal de compra abierto. La pistola reemplaza a buscar el
   producto y hacerle click.

   Las dos validaciones de aca abajo NO son paranoia: la lista del buscador ya
   filtra por proveedor y esconde los que ya estan en la compra, asi que
   compraAgregar() confia en eso y no valida nada. El escaneo saltea esa lista
   por completo, y sin estas dos guardas se podia cargar la mercaderia de un
   proveedor como comprada a otro -que despues sale mal en Proveedores sin que
   nadie entienda por que- o duplicar la misma fila apretando el gatillo dos
   veces, que con una pistola pasa todo el tiempo. */
function compraEscanear(prod) {
  if (!prod) return;
  const prov = (document.getElementById('compraProveedor') || {}).value || _compraProveedor;
  const nombre = prod.nombreMostrado || prod.nombre || 'el producto';

  if (prov && prod.lista !== prov) {
    showAdminToast('"' + nombre + '" no es de este proveedor: no se agrega.', 'error');
    return;
  }
  /* Un depurado que llega en una compra vuelve a estar en uso: se ofrece
     restaurarlo antes de agregarlo, para que su stock no quede escondido. Va DESPUES
     de mirar el proveedor: antes se restauraba y recien ahi salia "no es de este
     proveedor", y quedaba restaurado sin haberse comprado. */
  if (prod.depurado === true) {
    if (typeof depuracionOfrecerRestaurar === 'function') {
      depuracionOfrecerRestaurar(prod, 'volver a comprarlo').then(ok => { if (ok) compraEscanear(prod); });
    }
    return;
  }

  const i = _compraItems.findIndex(x => x.id === prod.id);
  if (i >= 0) {
    /* Ya estaba. No se duplica: se le lleva el foco a su cantidad, que es lo que
       uno quiere cuando vuelve a pasar el mismo producto por el lector. */
    _cpFocoCantidad(i);
    showAdminToast('"' + nombre + '" ya estaba en la compra', 'info');
    return;
  }

  compraAgregar(prod.id);
  _cpFocoCantidad(_compraItems.length - 1);
  showAdminToast('Agregado: ' + nombre, 'success');
}

/* AVISO TEMPORAL SOBRE LA LECTURA DEL PDF.

   Esta aca mientras el lector no entienda los remitos que cuentan BOLSAS. Un
   renglon como "MANI TOSTADO X 5 KG   2   4900   9800" -dos bolsas de 5 kg a
   $4.900 cada una- se lee como 2.000 g a $4.900 el kilo, cuando entraron
   10.000 g a $980. Y sale marcado como verificado: el KG de la descripcion
   pasa por la marca de kilos, y 2 x 4.900 = 9.800 cierra la cuenta igual.

   Los renglones que traen la cantidad en kilos se leen bien, pero no hay forma
   de saber de antemano como escribe sus remitos cada proveedor. Hasta que eso
   se arregle, el cartel pide revisar todo antes de guardar.

   Va adentro de compraLectura y no suelto en el modal, a proposito: esa caja
   se vacia sola al cerrar, al reabrir y al cambiar de archivo, asi que el
   cartel no puede quedar colgado de una compra anterior. Y como esa caja esta
   debajo de la fila Factura/Notas -el porque, en admin.html-, el cartel va de
   punta a punta. Lleva display:flex porque .cp-aviso arranca oculto -el de
   stock lo prende desde el codigo-.

   Cuando el lector entienda las bolsas: borrar esta constante y su uso en
   _aviso, adentro de _cpLeerRemito. */
const _CP_AVISO_LECTURA_PDF =
  '<div class="cp-aviso" style="display:flex;margin:0 0 0.45rem;color:var(--text)">' +
    '<i class="bi bi-exclamation-triangle" style="color:#EDB833;flex:0 0 auto;margin-top:1px"></i>' +
    '<div><b>AVISO:</b> La lectura automática de archivos PDF puede presentar <b>errores o inconsistencias</b> ' +
    'al interpretar la información. Esto se debe a que <b>cada proveedor utiliza diferentes formatos</b> y ' +
    'criterios para cargar y declarar sus productos y la información asociada.' +
    '<div style="margin-top:0.3rem">Por favor, <b>revise cuidadosamente</b> toda la información cargada ' +
    '<b>antes de confirmar</b> y aceptar la compra.</div></div>' +
  '</div>';

/* Lee el remito y precarga los items. No pisa lo que ya haya cargado a mano:
   agrega lo que falta y avisa lo que salteo. */
async function _cpLeerRemito(file) {
  const caja = document.getElementById('compraLectura');
  if (caja) { caja.style.display = 'none'; caja.innerHTML = ''; }
  if (!file || file.type !== 'application/pdf') return;
  if (typeof remitoLeerPdf !== 'function' || typeof remitoAItems !== 'function') return;

  const prov = (document.getElementById('compraProveedor') || {}).value || _compraProveedor;
  const _aviso = (html, color) => {
    if (!caja) return;
    caja.style.display = 'block';
    caja.style.color = color || 'var(--text-dim)';
    caja.innerHTML = _CP_AVISO_LECTURA_PDF + html;
  };
  _aviso('<i class="bi bi-arrow-repeat spin"></i> Leyendo el remito...');

  let lineas;
  try {
    lineas = await remitoLeerPdf(file);
  } catch (e) {
    /* Un PDF escaneado -una foto adentro de un PDF- no tiene texto y no tira
       error: devuelve cero lineas. Un error de verdad es otra cosa. */
    _aviso('No se pudo leer el PDF (' + esc(e.message) + '). Cargá los productos a mano.');
    return;
  }

  const r = remitoAItems(lineas, (typeof allProducts !== 'undefined' ? allProducts : []), prov);

  /* Lo que ya estaba cargado a mano manda: no se pisa ni se duplica. */
  const yaEsta = new Set(_compraItems.map(i => i.id));
  const nuevos = r.items.filter(i => !yaEsta.has(i.id));
  nuevos.forEach(i => _compraItems.push(i));
  if (nuevos.length) {
    renderCompraItems();
    compraBuscarProd((document.getElementById('compraBuscar') || {}).value || '');
  }

  /* El resumen dice lo que NO se pudo tanto como lo que si: sin eso, un remito
     de 20 renglones del que entraron 6 se ve igual que uno de 6 renglones. */
  const partes = [];
  if (!lineas.length) {
    _aviso('<b>Este PDF no tiene texto</b>: es una foto adentro de un archivo. ' +
           'Los productos hay que cargarlos a mano.', '#EDB833');
    return;
  }
  if (!r.items.length) {
    _aviso('Le&iacute; ' + lineas.length + ' renglones pero no reconoc&iacute; ning&uacute;n producto: ' +
           'este remito no trae los c&oacute;digos del proveedor, o son de otra lista. ' +
           'Carg&aacute; los productos a mano.', '#EDB833');
    return;
  }
  partes.push('<b style="color:var(--accent-light)">' + nuevos.length + ' producto' +
              (nuevos.length === 1 ? '' : 's') + ' agregado' + (nuevos.length === 1 ? '' : 's') + '</b>');
  const conCant = nuevos.filter(i => i.verificado).length;
  partes.push(conCant + ' con la cantidad ya puesta');
  if (r.dudosos.length) {
    partes.push('<span style="color:#EDB833">' + r.dudosos.length +
                ' sin cantidad, revisalos</span>');
  }
  let html = partes.join(' &middot; ');
  /* Los de peso van juntos: son muchos y el motivo es siempre el mismo. Uno por
     renglon tapaba a los que de verdad hay que mirar. */
  const dudPeso = r.dudosos.filter(d => d.porPeso);
  const dudOtros = r.dudosos.filter(d => !d.porPeso);
  if (dudPeso.length) {
    html += '<div style="color:#EDB833;margin-top:0.25rem">&middot; <b>' + dudPeso.length +
      (dudPeso.length === 1 ? ' producto por peso</b>' : ' productos por peso</b>') +
      ': el remito no dice si el n&uacute;mero son kilos o bultos, as&iacute; que la cantidad y el ' +
      'costo van a mano (' + esc(dudPeso.slice(0, 4).map(d => d.nombre).join(', ')) +
      (dudPeso.length > 4 ? ' y ' + (dudPeso.length - 4) + ' m&aacute;s' : '') + ').</div>';
  }
  if (dudOtros.length) {
    html += '<div style="color:#EDB833;margin-top:0.25rem">' +
      dudOtros.map(d => '&middot; ' + esc(d.nombre) + ': ' + esc(d.motivo)).join('<br>') + '</div>';
  }
  if (r.ignoradas.length) {
    html += '<div style="color:var(--text-dim);margin-top:0.25rem">' +
      r.ignoradas.length + ' rengl' + (r.ignoradas.length === 1 ? '&oacute;n' : 'ones') +
      ' sin usar: ' + esc(r.ignoradas.slice(0, 3).map(x => x.motivo).join('; ')) +
      (r.ignoradas.length > 3 ? '...' : '') + '</div>';
  }
  const depEnRemito = nuevos.filter(i => {
    const p = (allProducts || []).find(x => x.id === i.id);
    return p && p.depurado === true;
  });
  if (depEnRemito.length) {
    html += '<div style="color:#EDB833;margin-top:0.25rem">&middot; ' + depEnRemito.length +
      (depEnRemito.length === 1 ? ' est&aacute; depurado' : ' est&aacute;n depurados') + ' (' + esc(depEnRemito.map(i => i.nombre).join(', ')) +
      '): al guardar la compra se ofrece restaurarlos.</div>';
  }
  html += '<div style="color:var(--text-dim);margin-top:0.35rem">' +
    'Revis&aacute; las cantidades contra el papel antes de guardar.</div>';
  _aviso(html);
}

/* Si queda a deber, se dice con todas las letras dónde va a aparecer. */
function compraPagoCambio() {
  const nota = document.getElementById('compraPagoNota');
  if (!nota) return;
  nota.textContent = _cpQuedaDebiendo()
    ? 'Va a figurar como deuda en la ficha del proveedor, hasta que la marques pagada.'
    : '';
  nota.style.color = _cpQuedaDebiendo() ? '#EDB833' : 'var(--text-dim)';
}

function _cpQuedaDebiendo() {
  const r = document.querySelector('input[name="compraPago"]:checked');
  return !!r && r.value === 'deuda';
}

function compraQuitar(i) {
  _compraItems.splice(i, 1);
  renderCompraItems();
  compraBuscarProd((document.getElementById('compraBuscar') || {}).value || '');
}

function compraCampo(i, campo, valor) {
  const it = _compraItems[i];
  if (!it) return;
  if (campo === 'costoBolsa') {
    /* Lo que costó la bolsa: el kilo sale solo, con la cuenta del formulario. Si es la
       misma bolsa que ya tenía, el kilo que ya tenía: la cuenta de ida y vuelta no es
       exacta ($3.001 el kilo en 500 g se ve $1.501, que vuelve como $3.002), y salía
       como un costo que cambió (como _costoDeFila, admin-costos.js). */
    it.costoBolsa = Math.max(0, Number(valor) || 0);
    it.costoTocado = true;
    if (Number(it.gramosBolsa) > 0) {
      it.costoUnitario = it.costoBolsa === costoDeBolsa(it.costoAnterior, it.gramosBolsa)
        ? Number(it.costoAnterior || 0) : kiloDeBolsa(it.costoBolsa, it.gramosBolsa);
      const k = document.getElementById('cpKilo' + i);
      if (k) k.innerHTML = _cpVistaHtml(it);
    }
  } else if (campo === 'bolsa' || campo === 'bolsaUnidad') {
    /* De cuánto es la bolsa, escrito en la compra (30/09): el número, o kg / g en el selector
       de al lado. Mientras no se entienda, no hay bolsa: el costo de la bolsa espera apagado.
       Si todavía no se escribió el costo, arranca con el del kilo que tiene el producto; si ya
       se escribió, se respeta. */
    if (campo === 'bolsa') it.bolsaTxt = String(valor || '');
    else it.bolsaUnidad = valor === 'g' ? 'g' : 'kg';
    const g = _cpGramosEscritos(it.bolsaTxt, it.bolsaUnidad);
    if (g) {
      it.gramosBolsa = g;
      if (!it.costoTocado || it.costoBolsa == null) it.costoBolsa = costoDeBolsa(it.costoAnterior, g);
      it.costoUnitario = it.costoBolsa === costoDeBolsa(it.costoAnterior, g)
        ? Number(it.costoAnterior || 0) : kiloDeBolsa(it.costoBolsa, g);
    } else {
      delete it.gramosBolsa;
      it.costoUnitario = Number(it.costoAnterior || 0);
    }
    const etq = document.getElementById('cpBolsaEtq' + i);
    if (etq) etq.textContent = g ? 'Bolsa de ' + _cpTamTxt(g) : '¿De cuánto es la bolsa?';
    const cb = document.getElementById('cpBolsa' + i);
    if (cb) { cb.disabled = !g; cb.value = g ? (it.costoBolsa || '') : ''; }
    const k = document.getElementById('cpKilo' + i);
    if (k) {
      k.innerHTML = g ? _cpVistaHtml(it) : 'falta la bolsa';
      k.className = 'cp-kilo' + (g ? ' cp-vista' : ' falta');
    }
  } else {
    it[campo] = Math.max(0, Number(valor) || 0);
    /* El costo c/u: al lado, el precio y el mayorista con los que queda (01/10). */
    if (campo === 'costoUnitario') {
      const k = document.getElementById('cpKilo' + i);
      if (k) k.innerHTML = _cpVistaHtml(it);
    }
  }
  const t = document.getElementById('compraTotal');
  if (t) t.textContent = _cpPesos(_cpTotal());
  const sub = document.getElementById('cpSub' + i);
  if (sub) sub.textContent = _cpPesos(_cpSubtotal(_compraItems[i]));
}

function renderCompraItems() {
  const cont = document.getElementById('compraItems');
  if (!cont) return;
  if (!_compraItems.length) {
    cont.innerHTML = '<p style="font-size:0.83rem;color:var(--text-dim);padding:0.6rem 0">' +
      'Buscá un producto de la lista de abajo para empezar a cargar la compra.</p>';
  } else {
    const fila = (it, i) =>
      '<div class="cp-row' + (it.deRemito ? (it.verificado ? ' cp-leido' : ' cp-dudoso') : '') + '">' +
        '<span class="cp-row-n">' + esc(it.nombre) +
          (it.tipoVenta === 'peso' ? ' <span class="cp-tag">por peso</span>' : '') +
          (it.deRemito ? ' <span class="cp-marca' + (it.verificado ? '' : ' dudoso') + '">' +
            (it.verificado ? 'del remito' : 'revisar') + '</span>' : '') + '</span>' +
        '<label class="cp-f"><span>' + (it.tipoVenta === 'peso' ? 'Gramos' : 'Unidades') + '</span>' +
          '<input type="number" min="0" step="1" class="form-input" id="cpCant' + i + '" ' +
          'value="' + (it.cantidad || '') + '" ' +
          'oninput="compraCampo(' + i + ',\'cantidad\',this.value)"></label>' +
        /* De cuánto es la bolsa, si el producto no lo dice (30/09): se escribe acá, y al guardar
           queda anotado en el producto. El número, y al lado kg o g (de entrada kg). */
        (it.sinTam
          ? '<label class="cp-f cp-f-bolsa"><span id="cpBolsaEtq' + i + '">' +
              (_cpEsBolsa(it) ? 'Bolsa de ' + _cpTamTxt(it.gramosBolsa) : '¿De cuánto es la bolsa?') + '</span>' +
              '<span class="cp-bolsa-tam">' +
                '<input type="text" inputmode="decimal" maxlength="5" class="form-input" placeholder="Ej: 5" value="' + esc(it.bolsaTxt || '') + '" ' +
                'oninput="compraCampo(' + i + ',\'bolsa\',this.value)">' +
                '<select class="form-input" aria-label="Kilos o gramos" onchange="compraCampo(' + i + ',\'bolsaUnidad\',this.value)">' +
                  '<option value="kg"' + (it.bolsaUnidad === 'g' ? '' : ' selected') + '>kg</option>' +
                  '<option value="g"' + (it.bolsaUnidad === 'g' ? ' selected' : '') + '>g</option>' +
                '</select></span></label>'
          : '') +
        /* Una bolsa (29/09): lo que costó la bolsa, como en el formulario, y al lado el kilo. Sin
           saber todavía de cuánto es la bolsa, el costo espera apagado. */
        (_cpEsBolsa(it) || it.sinTam
          ? '<label class="cp-f cp-f-costo"><span>Costo de la bolsa' +
              /* "de 2 kg" no se parte: si no entra, baja entero al otro renglón. */
              (it.sinTam || !_cpDeBolsa(it.nombre, Number(it.gramosBolsa)) ? ''
                : ' <span style="white-space:nowrap">' + _cpDeBolsa(it.nombre, Number(it.gramosBolsa)).trim() + '</span>') + '</span>' +
              '<input type="number" min="0" step="0.01" class="form-input" id="cpBolsa' + i + '" value="' +
                (_cpEsBolsa(it) ? (it.costoBolsa || '') : '') + '"' + (_cpEsBolsa(it) ? '' : ' disabled') + ' ' +
              'oninput="compraCampo(' + i + ',\'costoBolsa\',this.value)"></label>' +
            /* Al lado: el kilo, el precio y el mayorista con los que queda (01/10). */
            '<span class="cp-kilo' + (_cpEsBolsa(it) ? ' cp-vista' : ' falta') + '" id="cpKilo' + i + '">' +
              (_cpEsBolsa(it) ? _cpVistaHtml(it) : 'falta la bolsa') + '</span>'
          : '<label class="cp-f"><span>Costo' + (it.tipoVenta === 'peso' ? ' por kilo' : ' c/u') + '</span>' +
              '<input type="number" min="0" step="0.01" class="form-input" value="' + (it.costoUnitario || '') + '" ' +
              'oninput="compraCampo(' + i + ',\'costoUnitario\',this.value)"></label>' +
            /* Al lado: el precio y el mayorista con los que queda (01/10). */
            '<span class="cp-kilo cp-vista" id="cpKilo' + i + '">' + _cpVistaHtml(it) + '</span>') +
        '<span class="cp-sub" id="cpSub' + i + '">' + _cpPesos(_cpSubtotal(it)) + '</span>' +
        '<button type="button" class="cp-x" onclick="compraQuitar(' + i + ')" title="Sacar de la compra">&times;</button>' +
      '</div>';
    /* Las bolsas de un mismo producto, juntas en un recuadro, donde entró la primera; con el
       "?" del redondeo si hay alguna bolsa (el kilo se guarda sin centavos). */
    cont.innerHTML = _cpBloques().map(b => b.grupo
      ? '<div class="cp-grupo">' + _cpCabGrupo(b.grupo) + b.filas.map(i => fila(_compraItems[i], i)).join('') +
        (b.filas.some(i => _cpEsBolsa(_compraItems[i])) && typeof ayudaRedondeoLineaHtml === 'function' ? ayudaRedondeoLineaHtml(true) : '') +
        '</div>'
      : fila(_compraItems[b.filas[0]], b.filas[0])).join('');
  }
  const t = document.getElementById('compraTotal');
  if (t) t.textContent = _cpPesos(_cpTotal());
  compraAvisoStock();
}

/* "Lo que entró" en bloques: { filas: [i] } para un renglón suelto, o { grupo, filas } para
   las bolsas de un mismo producto, de menor a mayor. Cada bloque va donde entró su primer
   renglón, así que la lista no se reordena al agregar. Con items, los de una compra ya
   guardada (al verla, al exportarla y en Deudas). */
function _cpBloques(items) {
  const lista = items || _compraItems;
  const catalogo = (typeof allProducts !== 'undefined' && allProducts) || [];
  const prods = lista.map(it => catalogo.find(p => p.id === it.id)).filter(Boolean);
  const grupoDe = new Map();
  _cpAgrupar(prods).forEach(x => { if (x.grupo) x.grupo.miembros.forEach(p => grupoDe.set(p.id, x.grupo)); });
  const hechos = new Set();
  const out = [];
  lista.forEach((it, i) => {
    const g = grupoDe.get(it.id);
    if (!g) { out.push({ filas: [i] }); return; }
    if (hechos.has(g)) return;
    hechos.add(g);
    /* Todas sus filas: si un producto quedara dos veces, no se esconde ninguna. */
    const filas = [];
    g.miembros.forEach(p => lista.forEach((x, k) => { if (x.id === p.id) filas.push(k); }));
    out.push({ grupo: g, filas: filas });
  });
  return out;
}

/* El cartel de que el stock NO se va a sumar. Va bien visible porque es
   exactamente lo que después nadie recuerda haber desmarcado. */
function compraAvisoStock() {
  const chk = document.getElementById('compraSumarStock');
  const av = document.getElementById('compraAvisoStock');
  if (!chk || !av) return;
  av.style.display = chk.checked ? 'none' : 'flex';
}

function compraArchivoElegido(input) {
  const f = input.files && input.files[0];
  const nom = document.getElementById('compraFacturaNombre');
  if (!f) { _compraArchivo = null; if (nom) nom.textContent = ''; return; }
  if (f.size > 10 * 1024 * 1024) {
    showAdminToast('La factura no puede pesar más de 10 MB', 'error');
    input.value = ''; _compraArchivo = null; if (nom) nom.textContent = '';
    return;
  }
  const ok = /^image\//.test(f.type) || f.type === 'application/pdf';
  if (!ok) {
    showAdminToast('La factura tiene que ser una imagen o un PDF', 'error');
    input.value = ''; _compraArchivo = null; if (nom) nom.textContent = '';
    return;
  }
  _compraArchivo = f;
  if (nom) nom.textContent = f.name + ' · ' + Math.round(f.size / 1024) + ' KB';
  /* El PDF ya NO se lee (pedido del comercio, 24/09/2026): se adjunta como comprobante
     y los productos se cargan a mano. Cada proveedor arma el remito a su manera, y la
     lectura automatica metia errores que no se veian: los productos por peso ya habian
     tenido que quedar afuera por eso. El lector sigue en admin-remito.js y en
     _cpLeerRemito, sin que nada lo llame, por si algun dia se quiere volver a usar. */
}

/* ============================ GUARDAR ============================ */

async function guardarCompra() {
  const prov = (document.getElementById('compraProveedor') || {}).value;
  if (!prov) return showAdminToast('Elegí el proveedor', 'error');
  const conCantidad = _compraItems.filter(i => Number(i.cantidad || 0) > 0);
  if (!conCantidad.length) return showAdminToast('Cargá al menos un producto con cantidad', 'error');
  /* De cuánto es la bolsa (30/09): sin eso no se sabe el kilo. Si se compró suelto, "1 kg". */
  const sinBolsa = conCantidad.filter(i => i.sinTam && !_cpEsBolsa(i));
  if (sinBolsa.length) {
    /* Los nombres escapados: el aviso es HTML (revisión del 01/10). */
    return showAdminToast('Falta de cuánto es la bolsa de: ' + sinBolsa.map(i => esc(i.nombre)).join(', '), 'error');
  }
  /* Los renglones en cero se descartan. Si eso pasa callado, el que leyo un
     remito cree que cargo todo y no cargo todo: hay que avisarlo. */
  const enCero = _compraItems.filter(i => Number(i.cantidad || 0) <= 0);
  if (enCero.length) {
    /* Con el dialogo del panel y no con el cuadrito gris del navegador: ver
       admin-dialogo.js. Leyendo un remito esta lista son casi siempre los productos
       por peso, que van a mano, asi que el boton de cancelar ofrece volver. */
    const nombres = enCero.slice(0, 8).map(i => '• ' + i.nombre).join(String.fromCharCode(10)) +
      (enCero.length > 8 ? String.fromCharCode(10) + '• y ' + (enCero.length - 8) + ' más' : '');
    const seguir = await pedirConfirmacion(
      (enCero.length === 1
        ? 'Este producto quedó sin cantidad, así que NO se va a cargar:'
        : 'Estos ' + enCero.length + ' productos quedaron sin cantidad, así que NO se van a cargar:') +
      String.fromCharCode(10, 10) + nombres + String.fromCharCode(10, 10) +
      'Podés volver, ponerles la cantidad y guardar de nuevo.',
      { titulo: 'Quedaron productos sin cantidad', aceptar: 'Guardar igual',
        cancelar: 'Volver y completar', icono: 'bi-exclamation-triangle' });
    if (!seguir) return;
  }
  /* UNA BOLSA CON MENOS DE UNA BOLSA (revisión del 29/09). La cantidad va en gramos y el
     costo por bolsa: escribir 2 pensando en 2 bolsas de 3 kg carga 2 g, y la cuenta sale $8
     en vez de $24.000 sin que nada lo marque. Se pregunta antes de guardar. */
  const pocas = conCantidad.filter(i => _cpEsBolsa(i) && Number(i.cantidad) < Number(i.gramosBolsa));
  if (pocas.length) {
    const nl = String.fromCharCode(10);
    const seguir = await pedirConfirmacion(
      'La cantidad va en gramos, y esto es menos de una bolsa:' + nl + nl +
      pocas.map(i => '• ' + i.nombre + ': ' + _cpCant(i) + ' (una bolsa son ' +
        _cpCant({ tipoVenta: 'peso', cantidad: i.gramosBolsa }) + ')').join(nl) + nl + nl +
      'Por ejemplo, 2 bolsas de 3 kg son 6000 gramos.',
      { titulo: 'Revisá la cantidad', aceptar: 'Guardar igual',
        cancelar: 'Volver y corregir', icono: 'bi-exclamation-triangle' });
    if (!seguir) return;
  }
  const sinCosto = conCantidad.filter(i => Number(i.costoUnitario || 0) <= 0);
  if (sinCosto.length) {
    return showAdminToast('Falta el costo de: ' + sinCosto.map(i => i.nombre).join(', '), 'error');
  }
  const fechaTxt = (document.getElementById('compraFecha') || {}).value;
  if (!fechaTxt) return showAdminToast('Elegí la fecha de la compra', 'error');
  const fecha = new Date(fechaTxt + 'T12:00:00');
  if (isNaN(fecha)) return showAdminToast('La fecha no es válida', 'error');

  const sumaStock = !!(document.getElementById('compraSumarStock') || {}).checked;
  const lista = (listasData || []).find(l => l.id === prov);
  const total = conCantidad.reduce((s, i) => s + _cpSubtotal(i), 0);

  const resumen = conCantidad.map(i => '- ' + i.nombre + ': ' + _cpCant(i) + ' a ' + _cpCostoTxt(i) +
    (i.sinTam && _cpEsBolsa(i) ? ' (el tamaño queda anotado en el producto)' : '')).join('\n');
  const aviso = sumaStock
    ? '\nEl stock de esos productos va a subir.'
    : '\nOJO: el stock NO se va a tocar, porque destildaste la casilla.';
  if (!await pedirConfirmacion(
      'Compra a ' + ((lista && lista.nombre) || 'proveedor') + ' por ' + _cpPesos(total) +
      (_cpQuedaDebiendo() ? '\n\nQueda como DEUDA: no se marca como pagada.' : '') +
      '\n\n' + resumen + '\n' + aviso,
      { titulo: 'Guardar compra', aceptar: 'Guardar' })) return;

  const quedaDebiendo = _cpQuedaDebiendo();
  const btn = document.getElementById('compraGuardarBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Guardando...'; }
  try {
    /* La factura primero: si falla la subida, no queda una compra apuntando a un
       archivo que no existe. */
    let facturaUrl = '', facturaNombre = '';
    if (_compraArchivo) {
      const ext = (_compraArchivo.name.split('.').pop() || 'dat').toLowerCase().replace(/[^a-z0-9]/g, '');
      const ref = storage.ref('compras/' + Date.now() + '_' + prov + '.' + ext);
      const snap = await ref.put(_compraArchivo, { contentType: _compraArchivo.type });
      facturaUrl = await snap.ref.getDownloadURL();
      facturaNombre = _compraArchivo.name;
    }

    /* Número de compra, con transacción: dos admins cargando a la vez sacaban el
       mismo número, igual que pasaba con las ventas. */
    const cnt = db.collection('config').doc('comprasCount');
    const numero = await db.runTransaction(async tx => {
      const sn = await tx.get(cnt);
      const n = (sn.exists ? (parseInt(sn.data().count) || 0) : 0) + 1;
      tx.set(cnt, { count: n });
      return n;
    });

    /* Una bolsa guarda además lo que costó la bolsa y de cuántos gramos era (29/09). */
    const items = conCantidad.map(i => Object.assign({
      id: i.id, nombre: i.nombre, tipoVenta: i.tipoVenta,
      cantidad: Number(i.cantidad), costoUnitario: Number(i.costoUnitario),
      subtotal: _cpSubtotal(i),
    }, _cpEsBolsa(i) ? { costoBolsa: Number(i.costoBolsa), gramosBolsa: Number(i.gramosBolsa) } : {}));

    const doc = {
      numero: numero, proveedorId: prov, proveedorNombre: (lista && lista.nombre) || '',
      fecha: fecha, comprobante: ((document.getElementById('compraComprobante') || {}).value || '').trim(),
      items: items, total: total,
      facturaUrl: facturaUrl, facturaNombre: facturaNombre,
      sumoStock: sumaStock,
      /* Si con "Actualizar" cambian costos, la compra anota cómo estaban (costosCambiados) para
         volverlos atrás si se borra (pedido del dueño, 02/10). Las de antes no lo tienen. */
      anotaCostos: true,
      /* Deuda. `pagado` es el monto, no un si/no: a un proveedor se le paga en
         partes. `saldada` existe solo para poder filtrar -Firestore no compara dos
         campos del mismo documento- y se escribe siempre junto con `pagado`. */
      pagado: quedaDebiendo ? 0 : total,
      saldada: !quedaDebiendo,
      pagos: quedaDebiendo ? [] : [{
        fecha: _cpFechaTxt(fecha), monto: total, medio: 'Sin especificar',
        nota: 'Marcada como pagada al cargar la compra',
        usuario: (auth && auth.currentUser && auth.currentUser.email) || '',
      }],
      notas: ((document.getElementById('compraNotas') || {}).value || '').trim(),
      usuario: (auth && auth.currentUser && auth.currentUser.email) || '',
      creadoEn: firebase.firestore.FieldValue.serverTimestamp(),
    };
    const ref = await db.collection('compras').add(doc);

    if (sumaStock) {
      const lote = db.batch();
      items.forEach(i => {
        lote.update(db.collection('productos').doc(i.id),
          { stock: firebase.firestore.FieldValue.increment(Number(i.cantidad)) });
      });
      await lote.commit();
      /* En memoria también, para no releer los 636. */
      items.forEach(i => {
        const p = (allProducts || []).find(x => x.id === i.id);
        if (p) p.stock = Number(p.stock || 0) + Number(i.cantidad);
      });
    }

    await _cpAnotarBolsas(conCantidad);

    if (typeof logAction === 'function') {
      logAction('crear', 'Compra #' + String(numero).padStart(4, '0') + ' - ' + _cpPesos(total),
        ((lista && lista.nombre) || '') + ' | ' + items.length + ' items' + (sumaStock ? ' | stock sumado' : ' | sin tocar stock'));
    }
    showAdminToast('Compra #' + String(numero).padStart(4, '0') + ' guardada', 'success');
    closeCompraModal();

    /* Recién ahora se ofrece mover los costos: la compra ya está guardada, así
       que decir que no acá no pierde nada. */
    await ofrecerActualizarCostos(conCantidad, ref.id);

    /* Si trajo productos depurados, entraron de nuevo al local. Sin restaurarlos
       su stock queda sumado pero escondido de todas las listas. */
    const depEnCompra = conCantidad.map(i => (allProducts || []).find(x => x.id === i.id))
      .filter(p => p && p.depurado === true);
    if (depEnCompra.length && typeof depuracionRestaurar === 'function' && await pedirConfirmacion(
        'Esta compra incluye ' + depEnCompra.length + ' producto' + (depEnCompra.length === 1 ? '' : 's') + ' depurado' +
        (depEnCompra.length === 1 ? '' : 's') + ': ' + depEnCompra.slice(0, 5).map(p => p.nombreMostrado || p.nombre).join(', ') +
        (depEnCompra.length > 5 ? '...' : '') + '.\n\nSin restaurarlos, su stock queda sumado pero no aparecen en ninguna lista.',
        { titulo: 'Productos depurados', aceptar: 'Restaurar' })) {
      await depuracionRestaurar(depEnCompra.map(p => p.id), 'volvieron a comprarse');
    }

    if (typeof _refrescarAlertas === 'function') _refrescarAlertas(true);
    if (typeof loadProveedores === 'function') loadProveedores();
  } catch (e) {
    console.error('guardarCompra:', e);
    showAdminToast('No se pudo guardar: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg"></i> Guardar compra'; }
  }
}

/* De cuánto es la bolsa, escrito en la compra: queda anotado en el producto, aparte
   (bolsaGramos), para que la próxima compra ya pida la bolsa (pedido del dueño, 30/09). No en
   Gramaje / Presentación: eso lo ve el cliente en la lista de precios y en las etiquetas, y ahí
   "2 kg" al lado del precio del kilo confunde (01/10). Solo si el producto sigue sin decirlo. Si
   falla, la compra ya se guardó: se avisa aparte, sin decir que no se guardó. */
async function _cpAnotarBolsas(items) {
  const anotar = items.filter(i => i.sinTam && _cpEsBolsa(i))
    .map(i => ({ i: i, p: (allProducts || []).find(x => x.id === i.id) }))
    .filter(x => x.p && _cpSinTam(x.p));
  if (!anotar.length) return;
  try {
    const lote = db.batch();
    anotar.forEach(x => lote.update(db.collection('productos').doc(x.i.id), { bolsaGramos: Number(x.i.gramosBolsa) }));
    await lote.commit();
    anotar.forEach(x => { x.p.bolsaGramos = Number(x.i.gramosBolsa); });
    if (typeof logAction === 'function') {
      logAction('editar', 'Tamaño de bolsa anotado desde una compra: ' + anotar.length,
        anotar.map(x => x.i.nombre + ': ' + _cpTamTxt(x.i.gramosBolsa)).join(' | ').slice(0, 900));
    }
    if (typeof _reRenderProductos === 'function') _reRenderProductos();
  } catch (e) {
    showAdminToast('La compra se guardó, pero no se pudo anotar de cuánto es la bolsa: ' + e.message, 'error');
  }
}

/* Los costos NO se pisan solos: se muestran los que cambiaron y decide la
   persona. Un costo que se mueve solo mueve el margen de toda la pantalla de
   Ganancia sin que nadie lo haya decidido.
   Al actualizar, el precio y el mayorista se recalculan con el mismo porcentaje, como en la
   ventana de costos y en la ficha (pedido del dueño, 01/10): antes cambiaba solo el costo, y si el
   proveedor aumentaba se seguía vendiendo al precio viejo sin que nada avisara (en la prueba, el
   mayorista quedó igual al costo); y al abrir después la ficha, el precio saltaba al guardar. El
   aviso muestra los precios nuevos, con los de antes. */
async function ofrecerActualizarCostos(items, compraId) {
  const cambian = items.filter(i => {
    const p = (allProducts || []).find(x => x.id === i.id);
    return p && Math.round(Number(p.costo || 0)) !== Math.round(Number(i.costoUnitario || 0));
  });
  if (!cambian.length) return;
  /* Sin la cuenta de la ventana de costos (admin-costos.js) no se ofrece: actualizar solo el costo
     dejaría el precio atrasado. */
  if (typeof preciosDesdeCosto !== 'function') return;
  const nuevos = new Map();
  const detalle = cambian.map(i => {
    const p = (allProducts || []).find(x => x.id === i.id);
    /* Cada producto con lo que tenía cargado y lo que se pagó, en dos renglones (pedido del
       dueño, 30/09: con flechas no se entendía). Una bolsa se dice como se cargó: la bolsa, y
       el kilo entre paréntesis (29/09). */
    const costo = (kilo, bolsa) => _cpEsBolsa(i)
      ? _cpPesos(bolsa) + ' la bolsa' + _cpDeBolsa(i.nombre, Number(i.gramosBolsa)) +
        (Number(i.gramosBolsa) !== 1000 ? ' (' + _cpPesos(kilo) + ' el kilo)' : '')
      : _cpPesos(kilo) + (i.tipoVenta === 'peso' ? ' el kilo' : '');
    const calc = preciosDesdeCosto(p, Number(i.costoUnitario));
    /* Sin % de ganancia el precio no se toca: la cuenta daría el costo, y se vendería sin ganar
       nada (revisión del 01/10: 69 productos ocultos tienen precio y ningún %). */
    const sinPct = !(Number(p.porcentaje) > 0);
    const r = { precio: sinPct ? Number(p.precio || 0) : calc.precio, precioMayorista: calc.precioMayorista };
    nuevos.set(i.id, r);
    const kg = i.tipoVenta === 'peso' ? ' el kilo' : '';
    /* Sin % mayorista no hay precio mayorista (01/10): se dice, no "$0". */
    const may = n => (Number(n) > 0 ? _cpPesos(n) : '');
    /* Si un precio nuevo queda más bajo que el que tiene, se marca: uno redondeado a mano baja
       aunque el costo suba (revisión del 01/10). */
    const sube = Number(i.costoUnitario) > Number(p.costo || 0);
    const baja = (nuevo, antes) => (nuevo < antes ? (sube ? ': ojo, baja aunque el costo subió' : ', baja') : '');
    return i.nombre + '\n' +
      '- Tenía cargado: ' + costo(p.costo, _cpEsBolsa(i) ? costoDeBolsa(p.costo, i.gramosBolsa) : 0) + '\n' +
      '- En esta compra: ' + costo(i.costoUnitario, i.costoBolsa) + '\n' +
      (sinPct ? '- Precio: queda en ' + _cpPesos(p.precio) + kg + ' (no tiene % de ganancia cargado)\n'
        : '- Precio nuevo: ' + _cpPesos(r.precio) + kg + ' (antes ' + _cpPesos(p.precio) + baja(r.precio, Number(p.precio || 0)) + ')\n') +
      '- Mayorista nuevo: ' + (may(r.precioMayorista) ? may(r.precioMayorista) + kg : 'ninguno, se cobra el de mostrador') +
        ' (antes ' + (may(p.precioMayorista) || 'ninguno') + (may(r.precioMayorista) ? baja(r.precioMayorista, Number(p.precioMayorista || 0)) : '') + ')';
  }).join('\n\n');
  const uno = cambian.length === 1;
  if (!await pedirConfirmacion(
      'En esta compra pagaste distinto de lo que ' + (uno ? 'tenía cargado el producto' : 'tenían cargado estos productos') + ':\n\n' +
      detalle + '\n\n' +
      'Si tocás "Actualizar", ' + (uno ? 'el producto queda' : 'quedan') + ' con el costo de esta compra, ' +
      'y el precio y el mayorista se recalculan con el mismo porcentaje de siempre.',
      { titulo: uno ? '¿Actualizar el costo?' : '¿Actualizar los costos?', aceptar: 'Actualizar', cancelar: 'Dejar como estaba' })) return;
  /* Si una bolsa queda más cara por kilo que una más chica del mismo producto, se avisa y se
     pregunta (pedido del dueño, 01/10): al vender, el que lleva más pagaría más por kilo.
     "No actualizar" deja como estaban solo las bolsas de ese producto y el resto se actualiza:
     antes no se actualizaba nada, y el aumento de los otros quedaba sin aplicar (revisión del
     01/10). Arranca en "No actualizar": un doble Enter no lo acepta sin leerlo. */
  let aActualizar = cambian;
  const saltos = typeof bolsasMasCarasPorKilo === 'function' ? bolsasMasCarasPorKilo(nuevos) : [];
  if (saltos.length) {
    const bolsas = new Set([].concat(...saltos.map(s => s.grupo || [s.chica.id, s.grande.id])));
    const resto = cambian.filter(i => !bolsas.has(i.id));
    if (!await pedirConfirmacion(textoBolsasMasCaras(saltos) + '\n\n' +
        'Si tocás "No actualizar", esas bolsas quedan con el costo y el precio de antes' +
        (resto.length ? ' y lo demás de la compra se actualiza igual' : '') + '. La compra ya quedó guardada. ¿Querés actualizar igual?',
        { titulo: 'Ojo: la bolsa más grande quedaría más cara', aceptar: 'Actualizar igual', cancelar: 'No actualizar',
          icono: 'bi-exclamation-triangle', cuidado: true, focoEnNo: true })) aActualizar = resto;
  }
  if (!aActualizar.length) return;
  try {
    /* La fecha del costo va en la misma escritura y en memoria, como en la ventana de costos
       (admin-costos.js): sin eso el panel la seguía viendo vieja hasta apretar F5, y el Centro
       de avisos y el aviso al vender lo daban por desactualizado (revisión del 01/10). */
    const hora = firebase.firestore.FieldValue.serverTimestamp();
    const lote = db.batch();
    const campos = i => ({ costo: Number(i.costoUnitario), precio: nuevos.get(i.id).precio, precioMayorista: nuevos.get(i.id).precioMayorista });
    aActualizar.forEach(i => lote.update(db.collection('productos').doc(i.id), Object.assign(campos(i), { costoActualizadoEn: hora })));
    /* En la compra, cómo estaba cada producto antes y cómo quedó: si se borra la compra, vuelve a
       como estaba (borrarCompra; pedido del dueño, 02/10). En el mismo lote: o se anota todo o nada. */
    if (compraId) {
      lote.update(db.collection('compras').doc(compraId), {
        costosCambiados: aActualizar.map(i => {
          const p = (allProducts || []).find(x => x.id === i.id) || {};
          return {
            id: i.id, nombre: i.nombre,
            antes: { costo: Number(p.costo || 0), precio: Number(p.precio || 0), precioMayorista: Number(p.precioMayorista || 0),
              costoActualizadoEn: p.costoActualizadoEn || null },
            despues: campos(i),
          };
        }),
      });
    }
    await lote.commit();
    aActualizar.forEach(i => {
      const p = (allProducts || []).find(x => x.id === i.id);
      if (p) Object.assign(p, campos(i), { costoActualizadoEn: new Date() });
    });
    if (typeof logAction === 'function') {
      logAction('editar', 'Costos y precios actualizados desde una compra: ' + aActualizar.length,
        aActualizar.map(i => i.nombre + ' -> costo ' + _cpPesos(i.costoUnitario) + ', precio ' + _cpPesos(nuevos.get(i.id).precio) +
          ', mayorista ' + _cpPesos(nuevos.get(i.id).precioMayorista)).join(' | ').slice(0, 900));
    }
    showAdminToast(aActualizar.length + ' costo' + (aActualizar.length === 1 ? '' : 's') + ' actualizado' + (aActualizar.length === 1 ? '' : 's') +
      ', con su precio nuevo', 'success');
    if (typeof _reRenderProductos === 'function') _reRenderProductos();
  } catch (e) {
    showAdminToast('No se pudieron actualizar los costos: ' + e.message, 'error');
  }
}

/* ============================ VER Y BORRAR ============================ */

function verCompra(docId) {
  const c = (_comprasCache && _comprasCache.lista.find(x => x.docId === docId));
  if (!c) return;
  const body = document.getElementById('compraVerBody');
  const tit = document.getElementById('compraVerTitulo');
  if (!body) return;
  if (tit) tit.innerHTML = '<i class="bi bi-bag-check"></i> Compra #' + String(c.numero || 0).padStart(4, '0');
  const fila = (e, v) => '<div style="display:flex;justify-content:space-between;gap:1rem;padding:0.3rem 0;font-size:0.86rem">' +
    '<span style="color:var(--text-dim)">' + e + '</span><span style="font-weight:600;white-space:nowrap">' + v + '</span></div>';
  body.innerHTML =
    fila('Proveedor', esc(c.proveedorNombre || '-')) +
    fila('Fecha', _cpFechaTxt(c.fecha)) +
    fila('Comprobante', c.comprobante ? esc(c.comprobante) : '<span style="color:var(--text-dim)">sin comprobante</span>') +
    fila('Total', _cpPesos(c.total)) +
    fila('Cargada por', esc(c.usuario || '-')) +
    (c.sumoStock === false
      ? '<p style="font-size:0.82rem;color:#EDB833;margin:0.5rem 0;line-height:1.5">' +
        'Esta compra <b>no sumó stock</b>: se guardó con la casilla destildada.</p>' : '') +
    '<div style="margin-top:0.7rem;padding-top:0.55rem;border-top:1px solid var(--border)">' +
      _cpRenglonesGuardados(c.items || []) +
    '</div>' +
    (c.notas ? '<p style="font-size:0.82rem;color:var(--text-dim);margin-top:0.6rem;line-height:1.5"><b>Notas:</b> ' + esc(c.notas) + '</p>' : '') +
    (c.facturaUrl
      ? '<div style="margin-top:0.8rem"><a href="' + esc(c.facturaUrl) + '" target="_blank" rel="noopener" ' +
        'class="btn btn-secondary" style="width:auto;display:inline-flex"><i class="bi bi-paperclip"></i> Ver la factura</a></div>'
      : '<p style="font-size:0.8rem;color:var(--text-dim);margin-top:0.7rem">Sin factura adjunta.</p>');
  _cpVerActual = c;
  const del = document.getElementById('compraVerBorrar');
  if (del) del.setAttribute('onclick', "borrarCompra('" + docId + "')");
  document.getElementById('compraVerModal').classList.add('show');
}

function closeCompraVerModal() {
  const m = document.getElementById('compraVerModal');
  if (m) m.classList.remove('show');
}

/* El stock que queda al devolver una compra. El piso es 0: si de lo que entro
   ya se vendio parte, restar todo lo comprado daria negativo, y un stock
   negativo rompe los avisos de stock bajo y deja el inventario sin sentido.
   Aparte para poder probarla sola. */
function _cpStockTrasDevolver(antes, quita) {
  return Math.max(0, Number(antes || 0) - Number(quita || 0));
}

/* Lo que va a quedar clavado en 0 por haberse vendido. Se calcula con lo que
   ya está en memoria: es solo para avisar antes de confirmar, la cuenta de
   verdad la hace la transacción. */
function _cpAvisoVendidos(c, devuelve) {
  if (!devuelve) return '';
  const cortos = (c.items || []).filter(i => {
    const p = (allProducts || []).find(x => x.id === i.id);
    return p && Number(p.stock || 0) < Number(i.cantidad || 0);
  });
  if (!cortos.length) return '';
  return '\n\nOJO: de ' + cortos.map(i => i.nombre).join(', ') +
    ' ya se vendió parte de lo que entró con esta compra. Su stock va a quedar en 0, ' +
    'no en negativo, así que el inventario no va a coincidir con la resta exacta.';
}

/* Borra del bucket el archivo de la factura.

   Es el primer borrado de archivo del panel: hasta ahora se subian y no se
   sacaba ninguno nunca. Borrar la compra sacaba el documento de Firestore y
   dejaba la imagen o el PDF dando vueltas para siempre, sin nada que lo
   apuntara. Un remito sacado con el celular pesa entre 2 y 5 MB -no se
   comprime, a proposito, porque despues hay que poder LEERLO-, asi que cada
   compra borrada se llevaba puesto ese espacio sin devolverlo.

   No tira nunca: la compra ya se borro cuando esto corre, y que el archivo
   quede colgado no puede convertir una operacion que salio bien en un error
   en la cara del usuario. Si falla, queda en la consola. */
async function _cpBorrarFactura(url) {
  if (typeof borrarArchivoDeStorage !== 'function') return;
  await borrarArchivoDeStorage(url, 'La compra se borro', 'compras/');
}

/* La compra, lista para bajar. Misma estructura que usa el export de
   proveedores, asi que el PDF y el Excel salen del mismo lado. */
function _cpDocExportar(c) {
  const cab = [
    ['Proveedor', c.proveedorNombre || '-'],
    ['Fecha', _cpFechaTxt(c.fecha)],
    ['Comprobante', c.comprobante || 'sin comprobante'],
    ['Total', _cpPesos(c.total)],
    ['Cargada por', c.usuario || '-'],
    ['Stock', c.sumoStock === false ? 'NO se sumó al inventario' : 'se sumó al inventario'],
  ];
  if (c.notas) cab.push(['Notas', c.notas]);

  return {
    titulo: 'Compra #' + String(c.numero || 0).padStart(4, '0'),
    subtitulo: (c.proveedorNombre || '') + ' · ' + _cpFechaTxt(c.fecha),
    archivo: 'compra_' + String(c.numero || 0).padStart(4, '0') + '_' + (c.proveedorNombre || ''),
    bloques: [
      { tipo: 'pares', titulo: 'Datos de la compra', filas: cab },
      {
        tipo: 'tabla',
        titulo: 'Lo que entró',
        columnas: ['Producto', 'Cantidad', 'Costo', 'Subtotal'],
        anchos: [85, 30, 30, 30],
        derecha: [1, 2, 3],
        /* Las bolsas de un mismo producto, juntas, como en pantalla (29/09): el producto y abajo
           cada bolsa, con cuántas entraron. El producto va sin monto: en la columna de
           subtotales se sumaría dos veces. */
        filas: _cpBloques(c.items || []).flatMap(b => {
          const fila = (i, antes) => [
            antes + (i.nombre || '') + (_cpEsBolsa(i) ? ' (' + _cpBolsasTxt(i) + _cpDeBolsa(i.nombre, Number(i.gramosBolsa)) + ')' : ''),
            _cpCant(i),
            _cpEsBolsa(i) ? _cpPesos(i.costoBolsa) + '/bolsa' : _cpPesos(i.costoUnitario) + (i.tipoVenta === 'peso' ? '/kg' : ''),
            _cpPesos(i.subtotal),
          ];
          return b.grupo
            ? [[b.grupo.nombre, '', '', '']].concat(b.filas.map(k => fila(c.items[k], '· ')))
            : [fila(c.items[b.filas[0]], '')];
        }).concat([['TOTAL', '', '', _cpPesos(c.total)]]),
      },
    ],
  };
}

/* La compra que se esta viendo, para que el boton del pie sepa cual bajar. */
let _cpVerActual = null;

function openCompraExportModal() {
  if (!_cpVerActual) return;
  const m = document.getElementById('compraExportModal');
  if (!m) return;
  const t = document.getElementById('compraExportQue');
  if (t) t.textContent = 'Compra #' + String(_cpVerActual.numero || 0).padStart(4, '0') +
                         ' · ' + (_cpVerActual.proveedorNombre || '');
  m.classList.add('show');
}

function closeCompraExportModal() {
  const m = document.getElementById('compraExportModal');
  if (m) m.classList.remove('show');
}

function compraExportar() {
  if (!_cpVerActual) { showAdminToast('Abrí una compra primero', 'error'); return; }
  const fmt = (document.getElementById('compraExportFormato') || {}).value || 'pdf';
  /* Igual que en proveedores: armar el documento tambien puede fallar. */
  let doc;
  try {
    doc = _cpDocExportar(_cpVerActual);
  } catch (e) {
    showAdminToast('No se pudo preparar la exportación: ' + e.message, 'error');
    return;
  }
  if (exportarDoc(doc, fmt)) closeCompraExportModal();
}

/* Lo que se pierde de plata al borrar una compra. Vacio si no se le pago nada. */
function _cpAvisoPagos(c) {
  const pagos = (c && Array.isArray(c.pagos)) ? c.pagos : [];
  const pagado = Number((c && c.pagado) || 0);
  if (!pagos.length && pagado <= 0) return '';
  return '\n\nOJO: esta compra tiene ' + pagos.length + ' pago' + (pagos.length === 1 ? '' : 's') +
    ' registrado' + (pagos.length === 1 ? '' : 's') + ' por ' + _cpPesos(pagado) +
    '. Ese registro se borra con la compra y no queda en ningún lado.';
}

/* LOS COSTOS QUE CAMBIÓ UNA COMPRA, AL BORRARLA (pedido del dueño, 02/10). Con "Actualizar", la
   compra anota cómo estaba cada producto antes (costosCambiados, ofrecerActualizarCostos). Al
   borrarla vuelve a como estaba, pero solo si el producto sigue como lo dejó la compra: si después
   le cambiaron el costo o el precio (otra compra, la ficha, la ventana de costos), lo de ahora es lo
   que vale y no se toca. Las compras de antes del 02/10 no lo anotaban. */
function _cpCostosCambiados(c) {
  return ((c && c.costosCambiados) || []).filter(x => x && x.id && x.antes && x.despues);
}
function _cpSigueComoLaDejo(p, despues) {
  return !!p && !!despues && Number(p.costo || 0) === Number(despues.costo || 0) &&
    Number(p.precio || 0) === Number(despues.precio || 0) && Number(p.precioMayorista || 0) === Number(despues.precioMayorista || 0);
}
/* Lo que se escribe para volver atrás: el costo, el precio, el mayorista y la fecha del costo de
   antes. Sin fecha, se saca: la función de la nube ve que la escritura la cambia y no pone la de hoy. */
function _cpCostoDeAntes(antes) {
  return {
    costo: Number(antes.costo || 0), precio: Number(antes.precio || 0), precioMayorista: Number(antes.precioMayorista || 0),
    costoActualizadoEn: antes.costoActualizadoEn || firebase.firestore.FieldValue.delete(),
  };
}
/* El aviso de borrar: qué costos vuelven y cuáles no, con lo que se ve en el panel (al borrar se
   mira la base). */
function _cpAvisoCostos(c) {
  const lista = _cpCostosCambiados(c);
  if (!lista.length) {
    return c && c.anotaCostos ? ''
      : '\n\nSi con esta compra actualizaste costos, esos no vuelven atrás: la compra es de antes de que el sistema anotara cómo estaban.';
  }
  const prods = (typeof allProducts !== 'undefined' && allProducts) || [];
  const may = n => (Number(n) > 0 ? _cpPesos(n) : 'ninguno');
  return '\n\nLos costos que se actualizaron con esta compra vuelven a como estaban:\n' + lista.map(x => {
    const p = prods.find(y => y && y.id === x.id);
    if (!_cpSigueComoLaDejo(p, x.despues)) return '- ' + x.nombre + ': no se toca, porque su costo o su precio cambiaron después de esta compra';
    const kg = _cpEsPeso(p) ? ' el kilo' : '';
    return '- ' + x.nombre + ': el costo vuelve de ' + _cpPesos(x.despues.costo) + ' a ' + _cpPesos(x.antes.costo) + kg +
      ' y el precio, de ' + _cpPesos(x.despues.precio) + ' a ' + _cpPesos(x.antes.precio) + kg +
      (Number(x.despues.precioMayorista || 0) !== Number(x.antes.precioMayorista || 0)
        ? ' (el mayorista, de ' + may(x.despues.precioMayorista) + ' a ' + may(x.antes.precioMayorista) + ')' : '');
  }).join('\n');
}

async function borrarCompra(docId) {
  const c = (_comprasCache && _comprasCache.lista.find(x => x.docId === docId));
  if (!c) return;
  const devuelve = c.sumoStock !== false;
  const cambiados = _cpCostosCambiados(c);
  if (!await pedirConfirmacion(
      'Compra #' + String(c.numero || 0).padStart(4, '0') + ' de ' + esc(c.proveedorNombre || '') +
      ' por ' + _cpPesos(c.total) + '.\n\n' +
      (devuelve
        ? 'Como esta compra sumó stock, se le va a RESTAR a esos productos lo que había sumado.'
        : 'Esta compra no había sumado stock, así que el inventario no se toca.') +
      _cpAvisoVendidos(c, devuelve) +
      /* Los costos que cambió esta compra vuelven a como estaban (02/10). */
      _cpAvisoCostos(c) +
      /* Los pagos viven adentro de la compra: borrarla borra tambien el registro de
         plata que se le pago al proveedor de verdad. Eso no puede pasar callado. */
      _cpAvisoPagos(c) +
      '\n\nEsto no se puede deshacer.',
      { titulo: 'Eliminar compra', peligro: true })) return;
  try {
    let _tocados = [], _costos = [];
    const items = devuelve ? (c.items || []).filter(i => i.id) : [];
    if (items.length || cambiados.length) {
      /* Antes esto era un batch con increment(-cantidad), a ciegas. Si algo de lo
         que entró con la compra YA SE VENDIÓ, restar todo lo comprado deja el
         stock en negativo: pasó con el Hornito de Yeso, entraron 2, se vendió 1,
         se revirtió la compra y quedó en -1.

         Un stock negativo no es solo un número feo: la tienda lo trata como
         "hay menos que cero", los avisos de stock bajo se vuelven locos y el
         inventario deja de servir para pedir mercadería.

         Ahora se lee el stock real y se baja hasta 0 como piso. Va en una
         transacción -todas las lecturas primero, después las escrituras- para
         que una venta que entre en el medio no se pierda.

         Los costos van en la misma transacción (02/10): vuelve todo o nada, y un producto que
         está en las dos cosas se escribe una sola vez. */
      const ids = [...new Set(items.map(i => i.id).concat(cambiados.map(x => x.id)))];
      const res = await db.runTransaction(async tx => {
        const refs = ids.map(id => db.collection('productos').doc(id));
        const snaps = [];
        for (const r of refs) snaps.push(await tx.get(r));
        const stock = [], costos = [];
        snaps.forEach((sn, k) => {
          if (!sn.exists) return;
          const d = sn.data() || {};
          const upd = {};
          const suyos = items.filter(i => i.id === ids[k]);
          if (suyos.length) {
            const antes = Number(d.stock || 0);
            const quita = suyos.reduce((s, i) => s + Number(i.cantidad || 0), 0);
            const despues = _cpStockTrasDevolver(antes, quita);
            upd.stock = despues;
            stock.push({ id: ids[k], nombre: suyos[0].nombre, antes: antes,
                         quita: quita, despues: despues, faltaba: antes - quita < 0 });
          }
          const cc = cambiados.find(x => x.id === ids[k]);
          if (cc) {
            const vuelve = _cpSigueComoLaDejo(d, cc.despues);
            if (vuelve) Object.assign(upd, _cpCostoDeAntes(cc.antes));
            costos.push({ id: ids[k], nombre: cc.nombre, vuelve: vuelve, antes: cc.antes });
          }
          if (Object.keys(upd).length) tx.update(refs[k], upd);
        });
        return { stock: stock, costos: costos };
      });
      _tocados = res.stock;
      _costos = res.costos;
      _tocados.forEach(x => {
        const p = (allProducts || []).find(y => y.id === x.id);
        if (p) p.stock = x.despues;
      });
      _costos.filter(x => x.vuelve).forEach(x => {
        const p = (allProducts || []).find(y => y.id === x.id);
        if (!p) return;
        Object.assign(p, { costo: Number(x.antes.costo || 0), precio: Number(x.antes.precio || 0),
          precioMayorista: Number(x.antes.precioMayorista || 0) });
        if (x.antes.costoActualizadoEn) p.costoActualizadoEn = x.antes.costoActualizadoEn;
        else delete p.costoActualizadoEn;
      });
    }
    await db.collection('compras').doc(docId).delete();
    /* DESPUES de borrar el documento, nunca antes. Si el borrado del documento
       fallara, no queremos haber destruido la factura de una compra que sigue
       existiendo y que quizas haya que reclamarle al proveedor. Al reves, el
       peor caso es un archivo huerfano, que es exactamente lo que pasaba
       siempre hasta ahora. */
    await _cpBorrarFactura(c.facturaUrl);
    const _vuelven = _costos.filter(x => x.vuelve), _quedan = _costos.filter(x => !x.vuelve);
    if (typeof logAction === 'function') {
      logAction('eliminar', 'Compra #' + String(c.numero || 0).padStart(4, '0') + ' eliminada',
        (c.proveedorNombre || '') + ' | ' + _cpPesos(c.total) + (devuelve ? ' | stock devuelto' : ' | sin stock que devolver') +
        (_vuelven.length ? ' | costos de antes: ' + _vuelven.map(x => x.nombre + ' ' + _cpPesos(x.antes.costo)).join(', ') : '') +
        (_quedan.length ? ' | costos que no se tocaron (cambiaron después): ' + _quedan.map(x => x.nombre).join(', ') : ''));
    }
    const _clavados = _tocados.filter(x => x.faltaba);
    if (_clavados.length) {
      showAdminToast('Compra eliminada. De ' + _clavados.length + ' producto' +
        (_clavados.length === 1 ? '' : 's') + ' ya se había vendido parte: su stock quedó en 0, no en negativo.', 'info');
    } else {
      showAdminToast('Compra eliminada' + (_vuelven.length ? '. Los costos volvieron a como estaban.' : ''), 'success');
    }
    if (_quedan.length) {
      showAdminToast(_quedan.length === 1
        ? 'El costo de ' + _quedan[0].nombre + ' no se tocó: cambió después de esta compra.'
        : 'Los costos de ' + _quedan.map(x => x.nombre).join(', ') + ' no se tocaron: cambiaron después de esta compra.', 'info');
    }
    if (_vuelven.length && typeof _reRenderProductos === 'function') _reRenderProductos();
    closeCompraVerModal();
    if (typeof _refrescarAlertas === 'function') _refrescarAlertas(true);
    if (typeof loadProveedores === 'function') loadProveedores();
  } catch (e) {
    showAdminToast('No se pudo eliminar: ' + e.message, 'error');
  }
}

window.openCompraModal = openCompraModal;
window.closeCompraModal = closeCompraModal;
window.compraBuscarProd = compraBuscarProd;
window.compraAgregar = compraAgregar;
window.compraQuitar = compraQuitar;
window.compraCampo = compraCampo;
window.compraAvisoStock = compraAvisoStock;
window.compraArchivoElegido = compraArchivoElegido;
window.guardarCompra = guardarCompra;
window.verCompra = verCompra;
window.closeCompraVerModal = closeCompraVerModal;
window.borrarCompra = borrarCompra;
window.openCompraExportModal = openCompraExportModal;
window.closeCompraExportModal = closeCompraExportModal;
window.compraExportar = compraExportar;
window.compraEscanear = compraEscanear;
window._cpLeerRemito = _cpLeerRemito;
window.compraPagoCambio = compraPagoCambio;
window._cpQuedaDebiendo = _cpQuedaDebiendo;
window._cpAvisoPagos = _cpAvisoPagos;
