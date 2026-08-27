/**
 * CONVERTIR UN PEDIDO WEB EN VENTA NO PUEDE RECOTIZAR EL ENVIO.
 *
 * El cliente vio un total en el resumen del checkout, apreto Confirmar, y ese numero
 * le llego por WhatsApp y por Telegram. Cuando el comercio abre el pedido y lo pasa a
 * venta, `convertirPedidoEnVentaDesdeModal` nunca leia `p.envio`: solo arrastraba
 * `p.tipoEntrega`, y `calcularTotalesVenta` volvia a cotizar con ENVIO_PRECIO y
 * ENVIO_GRATIS_DESDE, que son los de HOY.
 *
 * Consecuencia: si el comercio sube el envio de $2.000 a $3.000, TODOS los pedidos que
 * todavia no facturo cambian de precio solos. El ticket sale $27.000 contra los $26.000
 * que el cliente confirmo y tiene por escrito en el telefono.
 *
 * La proteccion ya existia -es la que respeta el envio al EDITAR una venta vieja- pero
 * estaba atada a `editingVentaId`, que en la conversion entra en null.
 *
 * Aca se ejecuta la conversion real y se mide el envio que sale de calcularTotalesVenta,
 * que es exactamente el numero que despues guarda saveVenta.
 *
 * De paso se mide el otro lado del mismo cambio: estas asignaciones estaban DESPUES de
 * renderVentaItems, que es quien dibuja el total, asi que la primera pantalla que ve el
 * comercio salia sin el cupon tampoco.
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

const CATALOGO = [
  { id: 'nuez', nombre: 'Nueces mariposa', precio: 18000, costo: 11000, tipoVenta: 'peso' },
  { id: 'yerba', nombre: 'Yerba', precio: 1500, costo: 900, tipoVenta: 'unidad' },
];

/* El pedido que el cliente confirmo: $6.900 de productos, $1.000 de cupon,
   $2.000 de envio => $7.900. Ese es el numero que tiene en el telefono. */
function pedidoWeb(extra) {
  return Object.assign({
    docId: 'ped1', numero: 2, origen: 'web', estado: 'pendiente', ventaId: null,
    cliente: 'Ana Gomez', clienteAuthUid: 'uid-ana', clienteId: null, clienteEmail: 'ana@x.com',
    telefono: '351111', direccion: 'Colon 123',
    tipoEntrega: 'envio', envio: 2000, medioPago: 'Efectivo',
    cupon: { codigo: 'BROTES10', monto: 1000 },
    subtotal: 6900, total: 7900,
    items: [
      { id: 'nuez', nombre: 'Nueces mariposa', precio: 18000, cantidad: 300, tipoVenta: 'peso', subtotal: 5400 },
      { id: 'yerba', nombre: 'Yerba', precio: 1500, cantidad: 1, tipoVenta: 'unidad', subtotal: 1500 },
    ],
  }, extra || {});
}

const FUNCIONES = ['esc', 'esPorPeso', 'tipoVentaDe', 'precioConDsc', 'subtotalItem', 'hoyAR',
  'openVentaModal', 'closeVentaModal', 'calcularTotalesVenta',
  'convertirPedidoEnVentaDesdeModal'].map(cuerpo).join('\n');

/* envioHoy: la tarifa que tiene cargada el comercio EL DIA que factura. */
function armar(pedido, { envioHoy, gratisDesde }) {
  const DOM = {};
  const reg = { toasts: [], alRenderizar: [] };
  function elem(id) {
    return {
      _id: id, value: '', innerHTML: '', textContent: '', disabled: false, title: '',
      style: { display: '', cssText: '' },
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      parentNode: { insertBefore() {} },
      getAttribute() { return null; }, setAttribute() {},
      closest() { return elem('closest:' + id); },
      querySelector() { return elem('q:' + id); },
      focus() {}, remove() {}, appendChild() {},
    };
  }
  const pedir = id => (DOM[id] = DOM[id] || elem(id));
  const ventana = {};

  const ent = {
    window: ventana,
    document: {
      getElementById: pedir, querySelector: pedir, querySelectorAll: () => [],
      createElement: () => {
        const o = elem('nuevo');
        delete o.innerHTML; delete o.textContent;
        o._t = '';
        Object.defineProperty(o, 'textContent', { get: () => o._t, set: v => { o._t = v; } });
        Object.defineProperty(o, 'innerHTML', {
          get: () => String(o._t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
          set: v => { o._t = v; },
        });
        return o;
      },
    },
    allProducts: CATALOGO,
    allClientes: [{ id: 'cli1', nombre: 'Ana Gomez' }],
    clientesAuthData: [{ uid: 'uid-ana', nombre: 'Ana' }],
    insumosData: [{ id: 'bolsa', nombre: 'Bolsa', stockActual: 10 }],
    pedidosData: [pedido],
    HACE_ENVIOS: true,
    ENVIO_PRECIO: envioHoy,
    ENVIO_GRATIS_DESDE: gratisDesde,
    nroPed: n => String(n).padStart(5, '0'),
    showAdminToast: m => reg.toasts.push(m),
    loadProducts: async () => {}, loadClientes: () => {},
    closePedidoModal: () => {},
    /* El doble anota si, EN EL MOMENTO de dibujar el total, el envio del pedido ya
       estaba puesto. Antes estas asignaciones venian despues de este render. */
    renderVentaItems: () => { reg.alRenderizar.push({
      envio: ventana._pedidoEnvioVenta ? 'puesto' : 'todavia no',
      cupon: ventana._pedidoCuponVenta ? 'puesto' : 'todavia no' }); },
    renderVentaInsumosUsados: () => {}, filterVentaProducts: () => {},
    refreshVentaInsumosSelect: () => {},
    firebase: { firestore: { FieldValue: { serverTimestamp: () => '<<ahora>>' } } },
    db: {
      collection: () => ({
        doc: () => ({ get: async () => ({ exists: false, data: () => null }), update: async () => {} }),
        orderBy: () => ({ get: async () => ({ docs: [] }) }),
      }),
    },
  };

  const nombres = Object.keys(ent);
  const api = new Function(...nombres,
    'let ventaItems=[],ventaInsumosUsados=[],ventaTipoEntrega="envio",ventaClienteSelected=false,' +
    'editingVentaId=null,editingVentaOriginal=null,editingPedidoId=null,ventasData=[];\n' +
    FUNCIONES +
    '\nreturn {convertir:function(id){editingPedidoId=id;return convertirPedidoEnVentaDesdeModal();},' +
    'totales:function(){return calcularTotalesVenta();},' +
    'nuevaVenta:openVentaModal,cerrar:closeVentaModal,' +
    'entrega:function(v){ventaTipoEntrega=v;},' +
    'ver:function(){return {ventaItems:ventaItems,ventaTipoEntrega:ventaTipoEntrega};}};'
  )(...nombres.map(n => ent[n]));

  return { api, DOM, reg, ventana };
}

(async () => {
  console.log('\nEL COMERCIO SUBIO EL ENVIO DE $2.000 A $3.000 Y RECIEN AHI FACTURA');
  let { api, reg, ventana } = armar(pedidoWeb(), { envioHoy: 3000, gratisDesde: 50000 });
  await api.convertir('ped1');
  let tot = api.totales();

  t('el envio sigue siendo los $2.000 que confirmo el cliente', tot.envio === 2000, '$' + tot.envio);
  t('   y NO los $3.000 de la tarifa de hoy', tot.envio !== 3000);
  t('el subtotal de productos es $6.900', tot.subtotal === 6900, '$' + tot.subtotal);
  t('el total es $7.900, el mismo que le llego por WhatsApp', tot.total === 7900, '$' + tot.total);
  t('el envio quedo guardado con su tipo de entrega',
    ventana._pedidoEnvioVenta && ventana._pedidoEnvioVenta.envio === 2000
      && ventana._pedidoEnvioVenta.tipoEntrega === 'envio', JSON.stringify(ventana._pedidoEnvioVenta));

  console.log('\nY el total ya estaba bien en la PRIMERA pantalla');
  const ultimo = reg.alRenderizar[reg.alRenderizar.length - 1] || {};
  t('el envio ya estaba puesto al dibujar el total', ultimo.envio === 'puesto', JSON.stringify(reg.alRenderizar));
  t('el cupon tambien (antes se asignaba despues del render)', ultimo.cupon === 'puesto');

  console.log('\nSI CAMBIA EL TIPO DE ENTREGA, ahi si hay que recotizar');
  ({ api } = armar(pedidoWeb(), { envioHoy: 3000, gratisDesde: 50000 }));
  await api.convertir('ped1');
  api.entrega('retiro');
  tot = api.totales();
  t('pasar a retiro deja el envio en $0', tot.envio === 0, '$' + tot.envio);
  t('y el total baja a $5.900', tot.total === 5900, '$' + tot.total);

  console.log('\nUN PEDIDO QUE TUVO ENVIO GRATIS SIGUE TENIENDOLO');
  ({ api } = armar(pedidoWeb({ envio: 0, total: 5900 }), { envioHoy: 3000, gratisDesde: 50000 }));
  await api.convertir('ped1');
  tot = api.totales();
  t('envio 0 se respeta: 0 es un valor, no "falta el dato"', tot.envio === 0, '$' + tot.envio);

  console.log('\nUN PEDIDO VIEJO SIN EL CAMPO envio SE RECOTIZA, no hay otra');
  ({ api, ventana } = armar(pedidoWeb({ envio: undefined }), { envioHoy: 3000, gratisDesde: 50000 }));
  await api.convertir('ped1');
  tot = api.totales();
  t('sin envio guardado usa la tarifa de hoy', tot.envio === 3000, '$' + tot.envio);
  t('y no inventa un objeto vacio', ventana._pedidoEnvioVenta === null, JSON.stringify(ventana._pedidoEnvioVenta));

  console.log('\nUNA VENTA NUEVA NO HEREDA EL ENVIO DEL PEDIDO ANTERIOR');
  ({ api, ventana } = armar(pedidoWeb(), { envioHoy: 3000, gratisDesde: 50000 }));
  await api.convertir('ped1');
  t('despues de convertir, el envio del pedido esta puesto', ventana._pedidoEnvioVenta !== null);
  api.nuevaVenta();
  t('abrir "Nueva Venta" lo suelta', ventana._pedidoEnvioVenta === null, JSON.stringify(ventana._pedidoEnvioVenta));
  t('   y tambien suelta el cupon', !ventana._pedidoCuponVenta);

  console.log('\nY cerrar el modal tambien lo suelta');
  ({ api, ventana } = armar(pedidoWeb(), { envioHoy: 3000, gratisDesde: 50000 }));
  await api.convertir('ped1');
  api.cerrar();
  t('cerrar el modal deja el envio en null', ventana._pedidoEnvioVenta === null, JSON.stringify(ventana._pedidoEnvioVenta));

  console.log('\nEl granel entra a la venta como granel (300 g, no 300 kilos)');
  ({ api } = armar(pedidoWeb(), { envioHoy: 2000, gratisDesde: 50000 }));
  await api.convertir('ped1');
  const its = api.ver().ventaItems;
  t('el item a granel conserva tipoVenta peso', its[0].tipoVenta === 'peso', JSON.stringify(its[0]));
  t('y su costo salio del catalogo', its[0].costo === 11000, 'costo=' + its[0].costo);
  t('el subtotal de productos NO es de millones', api.totales().subtotal === 6900, api.totales().subtotal);

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})();
