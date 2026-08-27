/**
 * EL MODAL DE UN PEDIDO WEB: EL COSTO, EL CUPON Y EL BOTON DE FACTURAR.
 *
 * Tres cosas que solo se ven cuando el panel abre un pedido nacido en la tienda, o
 * sea nunca hasta ahora: hay 0 pedidos en la base.
 *
 * 1) EL COSTO (lo caro). Un pedido web NUNCA trae costo: app.js arma los items solo
 *    con precio. openPedidoModal hacia `costo:i.costo||0` y savePedidoDesdeModal
 *    escribia ese 0. Y 0 no es lo mismo que null: los dos rescates que existen
 *    -el de convertirPedidoEnVentaDesdeModal y el de gananciaDe- preguntan por
 *    `costo!=null`, asi que un 0 los APAGA. La venta nacia con costo 0 y la ganancia
 *    que mostraba el panel era la facturacion entera. Aca se mide en pesos.
 *
 * 2) EL CUPON. app.js lo guarda como {codigo, monto}; el panel imprimia
 *    `_pedidoCupon.porcentaje`, campo que no existe en el pedido (vive en el
 *    documento de /cupones), y dibujaba "Cupon BROTES10 (-undefined%)". Peor: al
 *    guardar escribia porcentaje:null, asi que la segunda apertura decia "(-null%)".
 *
 * 3) EL BOTON "Convertir a venta". Se escondia con `p.estado!=='entregado'`, o sea
 *    justo en el pedido que mas lo necesita: uno que llego a entregado sin venta se
 *    quedaba sin ninguna forma de facturarse.
 *
 * Se ejecutan las funciones REALES del panel contra un DOM de mentira que registra
 * lo que le escriben. No mira el fuente: mira el resultado.
 */
const fs = require('fs');
const src = fs.readFileSync('admin.html', 'utf8');

function cuerpo(nombre) {
  let i = src.indexOf('function ' + nombre + '(');
  if (i < 0) throw new Error('no encontre ' + nombre);
  if (src.slice(Math.max(0, i - 6), i) === 'async ') i -= 6;
  let prof = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (!prof) break; }
  }
  return src.slice(i, k + 1);
}

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + extra + ']' : '')); }
};

/* Nueces a granel: el precio es POR KILO y la cantidad va en GRAMOS. */
const CATALOGO = [
  { id: 'nuez', nombre: 'Nueces mariposa', precio: 18000, costo: 11000, tipoVenta: 'peso', stock: 5000 },
  { id: 'yerba', nombre: 'Yerba', precio: 1500, costo: 900, tipoVenta: 'unidad', stock: 20 },
];

/* Tal cual lo escribe app.js: sin `costo` en ningun item, y el cupon con {codigo, monto}. */
function pedidoWeb(extra) {
  return Object.assign({
    docId: 'ped1', numero: 2, origen: 'web', estado: 'pendiente', ventaId: null,
    cliente: 'Ana Gomez', clienteAuthUid: 'uid-ana', clienteId: null, clienteEmail: 'ana@x.com',
    telefono: '351111', direccion: 'Colon 123', notas: 'timbre B',
    tipoEntrega: 'envio', envio: 2000, medioPago: 'Efectivo',
    creadoEn: new Date(2026, 7, 27, 10, 30),
    cupon: { codigo: 'BROTES10', monto: 1000 },
    items: [
      { id: 'nuez', nombre: 'Nueces mariposa', precio: 18000, cantidad: 300, tipoVenta: 'peso', subtotal: 5400 },
      { id: 'yerba', nombre: 'Yerba', precio: 1500, cantidad: 1, tipoVenta: 'unidad', subtotal: 1500 },
    ],
  }, extra || {});
}

const FUNCIONES = ['esc', 'esPorPeso', 'tipoVentaDe', 'fmtPeso', 'fmtCantidad',
  'precioConDsc', 'subtotalItem', 'costoItem', '_precioCobradoItem', 'gananciaDe',
  'calcPedTotales', 'renderPedItems', 'openPedidoModal', 'savePedidoDesdeModal'].map(cuerpo).join('\n');

/* Un DOM de mentira: cada id devuelve siempre el mismo objeto, y lo que el panel le
   escriba queda registrado ahi para poder mirarlo despues. */
function armar(pedido, catalogo) {
  const DOM = {};
  const reg = { updates: [], agregados: [], toasts: [] };
  function elem(id) {
    return {
      _id: id, value: '', innerHTML: '', textContent: '', disabled: false, title: '',
      style: { display: '' },
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      getAttribute() { return null; }, setAttribute() {},
      closest() { return elem('closest:' + id); },
      querySelector() { return elem('q:' + id); },
      focus() {}, remove() {}, appendChild() {},
    };
  }
  const pedir = id => (DOM[id] = DOM[id] || elem(id));

  const ent = {
    /* openPedidoModal guarda ahi el envio que confirmo el cliente (h10) */
    window: {},
    document: {
      getElementById: pedir,
      querySelector: pedir,
      querySelectorAll: () => [],
      /* esc() usa createElement+textContent+innerHTML: este doble escapa de verdad,
         asi que el HTML que se mide es el que saldria en pantalla. */
      createElement: () => {
        const o = { _t: '' };
        Object.defineProperty(o, 'textContent', { get: () => o._t, set: v => { o._t = v; } });
        Object.defineProperty(o, 'innerHTML', {
          get: () => String(o._t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
          set: v => { o._t = v; },
        });
        return o;
      },
    },
    allProducts: catalogo,
    allClientes: [{ id: 'cli1', nombre: 'Ana Gomez' }],
    insumosData: [],
    pedidosData: [pedido],
    HACE_ENVIOS: true,
    ENVIO_PRECIO: 2000,
    ENVIO_GRATIS_DESDE: 50000,
    nroPed: n => String(n).padStart(5, '0'),
    showAdminToast: m => reg.toasts.push(m),
    loadProducts: () => {}, loadClientes: () => {},
    renderPedInsumosUsados: () => {}, filterPedProducts: () => {},
    refreshPedInsumosSelect: () => {}, closePedidoModal: () => {},
    sendTelegramMsg: () => {}, markPedidoDirty: () => {},
    firebase: { firestore: { FieldValue: { serverTimestamp: () => '<<ahora>>', delete: () => '<<borrar>>' } } },
    db: {
      collection: col => ({
        doc: id => ({
          get: async () => ({ exists: false, data: () => null }),
          update: async u => { reg.updates.push({ col, id, data: u }); },
        }),
        add: async d => { reg.agregados.push({ col, data: d }); return { id: 'nuevo' }; },
        orderBy: () => ({ get: async () => ({ docs: [] }) }),
      }),
      runTransaction: async fn => fn({ get: async () => ({ exists: false }), set: () => {} }),
    },
  };

  const nombres = Object.keys(ent);
  const api = new Function(...nombres,
    'let pedItems=[],pedInsumosUsados=[],pedTipoEntrega="envio",pedClienteSelected=false,' +
    'editingPedidoId=null,pedidoDirty=false,_pedidoCupon=null;\n' +
    FUNCIONES +
    '\nreturn {openPedidoModal:openPedidoModal,renderPedItems:renderPedItems,' +
    'savePedidoDesdeModal:savePedidoDesdeModal,gananciaDe:gananciaDe,costoItem:costoItem,' +
    'ver:function(){return {pedItems:pedItems,_pedidoCupon:_pedidoCupon,editingPedidoId:editingPedidoId};}};'
  )(...nombres.map(n => ent[n]));

  return { api, DOM, reg };
}

(async () => {
  console.log('\nEL COSTO DE UN PEDIDO WEB (que llega sin costo en ningun item)');
  let { api, DOM, reg } = armar(pedidoWeb(), CATALOGO);
  api.openPedidoModal('ped1');
  let items = api.ver().pedItems;

  t('el granel rescata su costo del catalogo', items[0].costo === 11000, 'costo=' + items[0].costo);
  t('   y NO queda en 0, que es lo que apagaba los rescates', items[0].costo !== 0);
  t('la yerba tambien', items[1].costo === 900, 'costo=' + items[1].costo);
  t('el granel sigue siendo granel', items[0].tipoVenta === 'peso');
  t('el costo del renglon a granel es POR KILO: 300 g de $11.000 = $3.300',
    api.costoItem(items[0]) === 3300, api.costoItem(items[0]));

  console.log('\nLo que eso significa en plata (facturado $6.900)');
  const g = api.gananciaDe({ items: items }, false);
  t('la ganancia es $2.700, no la facturacion entera', g.ganancia === 2700, '$' + g.ganancia);
  t('y el panel la da por completa (sabe todos los costos)', g.completa === true);
  const gViejo = api.gananciaDe({ items: items.map(i => Object.assign({}, i, { costo: 0 })) }, false);
  t('con el costo:0 de antes daba $6.900 (x2,5)', gViejo.ganancia === 6900, '$' + gViejo.ganancia);

  console.log('\nSi el catalogo todavia no cargo, se deja null: null es "no se sabe"');
  ({ api } = armar(pedidoWeb(), []));
  api.openPedidoModal('ped1');
  items = api.ver().pedItems;
  t('el costo queda en null, NO en 0', items[0].costo === null, 'costo=' + items[0].costo);
  const gSin = api.gananciaDe({ items: items }, false);
  t('y la ganancia se declara incompleta en vez de inventar 100% de margen',
    gSin.completa === false);

  console.log('\nEL CUPON DIBUJADO EN EL MODAL');
  ({ api, DOM } = armar(pedidoWeb(), CATALOGO));
  api.openPedidoModal('ped1');
  api.renderPedItems();
  const bd = DOM['pedTotalBreakdown'].innerHTML;
  t('se nombra el cupon', /BROTES10/.test(bd), bd.slice(0, 200));
  t('NO dice "(-undefined%)"', !/undefined/.test(bd), bd.slice(0, 300));
  t('NO dice "(-null%)"', !/null/.test(bd));
  t('y el descuento en pesos si esta', /-\$1\.000/.test(bd), bd.slice(0, 300));

  console.log('\nLO QUE QUEDA ESCRITO AL GUARDAR EL PEDIDO DESDE EL MODAL');
  ({ api, DOM, reg } = armar(pedidoWeb(), CATALOGO));
  api.openPedidoModal('ped1');
  DOM['pedClienteId'].value = 'cli1';
  DOM['pedCliente'].value = 'Ana Gomez';
  /* pedClienteSelected ya lo deja en true openPedidoModal */
  await api.savePedidoDesdeModal();
  t('escribio el pedido', reg.updates.length === 1, JSON.stringify(reg.updates.map(u => u.col)));
  const d = reg.updates[0] ? reg.updates[0].data : {};
  const it = d.items || [];
  t('el costo del granel quedo guardado en 11.000', it[0] && it[0].costo === 11000, JSON.stringify(it[0]));
  t('el de la yerba en 900', it[1] && it[1].costo === 900);
  t('NINGUN item quedo con costo 0', it.every(i => i.costo !== 0), JSON.stringify(it.map(i => i.costo)));
  t('el granel conserva tipoVenta peso', it[0] && it[0].tipoVenta === 'peso');
  t('el subtotal del granel son $5.400, no $5.400.000', it[0] && it[0].subtotal === 5400, it[0] && it[0].subtotal);
  t('el cupon se guarda con codigo y monto', d.cupon && d.cupon.codigo === 'BROTES10' && d.cupon.monto === 1000,
    JSON.stringify(d.cupon));
  t('y SIN el campo porcentaje, que es el que dibujaba "(-null%)"',
    d.cupon && !('porcentaje' in d.cupon), JSON.stringify(d.cupon));

  console.log('\nGuardar y volver a abrir no ensucia nada (el ida y vuelta completo)');
  const guardado = pedidoWeb(Object.assign({}, d, { docId: 'ped1', numero: 2, origen: 'web', creadoEn: new Date(2026, 7, 27) }));
  let a2 = armar(guardado, CATALOGO);
  a2.api.openPedidoModal('ped1');
  a2.api.renderPedItems();
  const bd2 = a2.DOM['pedTotalBreakdown'].innerHTML;
  t('la segunda apertura tampoco dice "(-null%)"', !/null/.test(bd2), bd2.slice(0, 300));
  t('y los costos siguen ahi', a2.api.ver().pedItems[0].costo === 11000);

  console.log('\nEL BOTON "Convertir a venta"');
  const casos = [
    { estado: 'pendiente', ventaId: null, esperado: 'inline-flex', que: 'pendiente sin venta: se ve' },
    { estado: 'confirmado', ventaId: null, esperado: 'inline-flex', que: 'confirmado sin venta: se ve' },
    { estado: 'entregado', ventaId: null, esperado: 'inline-flex', que: 'ENTREGADO sin venta: se ve (antes desaparecia)' },
    { estado: 'entregado', ventaId: 'vta1', esperado: 'none', que: 'entregado CON venta: escondido' },
    { estado: 'confirmado', ventaId: 'vta1', esperado: 'none', que: 'confirmado CON venta: escondido, no se factura dos veces' },
  ];
  for (const c of casos) {
    const a = armar(pedidoWeb({ estado: c.estado, ventaId: c.ventaId }), CATALOGO);
    a.api.openPedidoModal('ped1');
    t(c.que, a.DOM['convertirVentaBtn'].style.display === c.esperado,
      'display=' + a.DOM['convertirVentaBtn'].style.display);
  }

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})();
