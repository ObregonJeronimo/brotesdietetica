/**
 * LO QUE ROMPIO LA PRIMERA TANDA DE ARREGLOS, Y UNA PUERTA QUE HABIA QUEDADO ABIERTA.
 *
 * Los arreglos de la tanda 5 pasaron por una pasada adversarial que buscaba justamente
 * lo que hubieran roto. Encontro cuatro regresiones de verdad, y midiendo en el navegador
 * apareció una quinta cosa: el mismo bug del envio, por otra puerta. Esta suite existe
 * para que ninguna de las cinco vuelva.
 *
 *  R1  Al derivar a facturar se perdia el destino. La guarda nueva manda a facturar, pero
 *      `saveVenta` escribia `estado:'confirmado'` con un LITERAL: arrastrar de pendiente
 *      directo a ENTREGADO -el cliente retira y paga en el momento- terminaba dejando la
 *      tarjeta en Confirmado. Habia que repetir el gesto entero y nada lo avisaba; el
 *      cliente, mientras, veia "Confirmado" en Mis Pedidos (app.js escucha con onSnapshot)
 *      sobre algo que ya tenia en la mano. Antes del arreglo ese arrastre dejaba
 *      'entregado' pero SIN facturar: el arreglo habia quedado a mitad de camino.
 *
 *  R2  `deleteVenta` bajaba a 'pendiente' un pedido ya ENTREGADO. Borrar la venta para
 *      rehacerla con otro medio de pago le retrocedia dos casilleros a mercaderia que ya
 *      salio del local, y al cliente le cambiaba la etiqueta en vivo.
 *
 *  R3  Y el historial afirmaba "vuelto a pendiente y liberado" aunque el update hubiera
 *      fallado —o aunque el pedido ya no existiera—. Es la misma forma de mentir que ya
 *      costo mercaderia en `kanbanDrop`.
 *
 *  R4  El envio congelado pisaba el ENVIO GRATIS del propio negocio: si el admin agregaba
 *      mercaderia en el mostrador y el pedido cruzaba el minimo, se le seguia cobrando el
 *      flete. Congelar el envio esta para no cobrarle MAS de lo que confirmo, nunca para
 *      cobrarle algo que segun la regla del negocio hoy no se paga.
 *
 *  R5  `openVentaModal` soltaba `_pedidoCuponVenta` y `_pedidoEnvioVenta` pero NO
 *      `_pedidoOrigenVentaId`, que solo limpiaba `closeVentaModal`. Y Escape
 *      (admin-atajos.js) cierra el modal sacandole la clase 'show', sin pasar por ahi.
 *
 *  h10 Guardar un pedido web desde el modal —aunque sea solo para elegirle el cliente—
 *      recotizaba el envio con la tarifa de HOY y lo escribia encima del que el cliente
 *      confirmo. Y como la conversion a venta despues lee `p.envio`, esto ANULABA el
 *      arreglo del envio: alcanzaba con abrir y guardar el pedido una sola vez.
 *
 * Todo se ejecuta contra las funciones REALES del panel.
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

/* El pedazo de saveVenta que le marca el estado al pedido de origen no es una funcion
   aparte: vive adentro de una linea larguisima. Se saca el tramo exacto y se envuelve,
   asi lo que se prueba es el codigo que corre de verdad. */
function tramoMarcarPedido() {
  const ini = src.indexOf('const _destinoPed=');
  const fin = src.indexOf(`}catch(e){console.warn('No se pudo marcar pedido como confirmado:'`, ini);
  if (ini < 0 || fin < 0) throw new Error('no encontre el tramo de saveVenta que marca el pedido');
  return 'async function _marcarPedido(ventaDocId){' + src.slice(ini, fin) + '}';
}

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + extra + ']' : '')); }
};

const CATALOGO = [
  { id: 'nuez', nombre: 'Nueces mariposa', precio: 18000, costo: 11000, tipoVenta: 'peso' },
  { id: 'yerba', nombre: 'Yerba', precio: 1500, costo: 900, tipoVenta: 'unidad' },
  { id: 'sincosto', nombre: 'Almendras', precio: 17500, costo: 0, tipoVenta: 'unidad' },
];

function elem(id) {
  return {
    _id: id, value: '', innerHTML: '', textContent: '', disabled: false, title: '',
    style: { display: '', cssText: '' },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    parentNode: { insertBefore() {} },
    getAttribute() { return null; }, setAttribute() {},
    closest() { return elem('c:' + id); }, querySelector() { return elem('q:' + id); },
    focus() {}, remove() {}, appendChild() {},
  };
}
function documentoFalso(DOM) {
  const pedir = id => (DOM[id] = DOM[id] || elem(id));
  return {
    getElementById: pedir, querySelector: pedir, querySelectorAll: () => [],
    createElement: () => {
      const o = elem('nuevo'); delete o.innerHTML; delete o.textContent; o._t = '';
      Object.defineProperty(o, 'textContent', { get: () => o._t, set: v => { o._t = v; } });
      Object.defineProperty(o, 'innerHTML', {
        get: () => String(o._t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
        set: v => { o._t = v; } });
      return o;
    },
  };
}

(async () => {

/* ================= R1: el destino no se pierde ================= */
console.log('\nR1 — PEDIR "ENTREGADO" TIENE QUE TERMINAR EN ENTREGADO');

function armarEstado(pedido, opciones) {
  const reg = { updates: [], toasts: [], modalPedido: [], borradas: [], logs: [], stockProd: null, stockIns: null,
                modalEstadoCerrado: 0, recargas: 0 };
  const ventana = Object.assign({ _estadoPedidoId: pedido.docId }, opciones || {});
  const ent = {
    window: ventana, pedidosData: [pedido], ventasData: [],
    nroPed: n => String(n).padStart(5, '0'),
    openPedidoModal: id => reg.modalPedido.push(id),
    closeEstadoPedidoModal: () => { reg.modalEstadoCerrado++; },
    loadPedidos: () => { reg.recargas++; }, renderPedidos: () => {},
    showAdminToast: m => reg.toasts.push(m), pedirConfirmacion: async () => true,
    aplicarStockProductos: async d => { reg.stockProd = d; },
    aplicarStockInsumos: async d => { reg.stockIns = d; },
    logAction: (a, b, c) => reg.logs.push(c),
    console: { warn() {} },
    firebase: { firestore: { FieldValue: { delete: () => '<<borrar>>', serverTimestamp: () => '<<ahora>>' } } },
    db: { collection: col => ({ doc: id => ({
      get: async () => ({ exists: false, id: id, data: () => null }),
      delete: async () => { reg.borradas.push(col + '/' + id); },
      update: async u => { reg.updates.push({ col, id, data: u }); },
    }) }) },
  };
  const nombres = Object.keys(ent);
  const api = new Function(...nombres,
    ['deltasDeItems', 'deltasDeInsumos', 'transicionEstadoPedido', 'actualizarEstadoPedido',
     'aplicarEstadoPedido'].map(cuerpo).join('\n') + '\n' + tramoMarcarPedido() +
    '\nreturn {transicion:transicionEstadoPedido,aplicar:aplicarEstadoPedido,marcar:_marcarPedido};'
  )(...nombres.map(n => ent[n]));
  return { api, reg, ventana, pedido };
}

let a = armarEstado({ docId: 'ped1', numero: 2, estado: 'pendiente', ventaId: null });
let r = await a.api.transicion('ped1', 'entregado');
t('derivar a facturar se acuerda de que el destino era ENTREGADO',
  a.ventana._pedidoEstadoDestino === 'entregado', a.ventana._pedidoEstadoDestino);
t('   y sigue sin escribir el estado', !a.reg.updates.length, JSON.stringify(a.reg.updates));

a = armarEstado({ docId: 'ped1', numero: 2, estado: 'pendiente', ventaId: null });
await a.api.transicion('ped1', 'confirmado');
t('pedir confirmado se acuerda de confirmado', a.ventana._pedidoEstadoDestino === 'confirmado');

/* y ahora el tramo real de saveVenta */
a = armarEstado({ docId: 'ped1', numero: 2, estado: 'pendiente', ventaId: null },
  { _pedidoOrigenVentaId: 'ped1', _pedidoEstadoDestino: 'entregado' });
await a.api.marcar('vta9');
t('saveVenta escribe estado ENTREGADO, no confirmado',
  a.reg.updates[0] && a.reg.updates[0].data.estado === 'entregado',
  JSON.stringify(a.reg.updates[0] && a.reg.updates[0].data));
t('   y la copia en memoria queda igual', a.pedido.estado === 'entregado', a.pedido.estado);
t('   con el ventaId enganchado', a.reg.updates[0].data.ventaId === 'vta9');

a = armarEstado({ docId: 'ped1', numero: 2, estado: 'pendiente', ventaId: null },
  { _pedidoOrigenVentaId: 'ped1', _pedidoEstadoDestino: null });
await a.api.marcar('vta9');
t('sin destino pedido, sigue cayendo en confirmado como siempre',
  a.reg.updates[0] && a.reg.updates[0].data.estado === 'confirmado', JSON.stringify(a.reg.updates[0].data));

/* ================= R2 + R3: deleteVenta ================= */
console.log('\nR2/R3 — BORRAR LA VENTA NO PUEDE DESENTREGAR UN PEDIDO NI MENTIR');

const VENTA = { docId: 'vta1', pedidoId: 'ped1', stockDescontado: true,
  items: [{ id: 'yerba', nombre: 'Yerba', precio: 1500, cantidad: 4, tipoVenta: 'unidad' }],
  insumosUsados: [] };

function armarBorrado({ estadoPedido, existePedido, updateFalla }) {
  const reg = { updates: [], borradas: [], toasts: [], logs: [] };
  const pedido = { docId: 'ped1', numero: 2, estado: estadoPedido, ventaId: 'vta1' };
  const ent = {
    pedidosData: [pedido], ventasData: [JSON.parse(JSON.stringify(VENTA))],
    showAdminToast: m => reg.toasts.push(m), pedirConfirmacion: async () => true,
    aplicarStockProductos: async () => {}, aplicarStockInsumos: async () => {},
    logAction: (accion, titulo, det) => reg.logs.push(det),
    filterVentas: () => {}, renderPedidos: () => {},
    firebase: { firestore: { FieldValue: { delete: () => '<<borrar>>' } } },
    db: { collection: col => ({ doc: id => ({
      get: async () => (col === 'ventas' && id === 'vta1')
        ? { exists: true, id, data: () => JSON.parse(JSON.stringify(VENTA)) }
        : (col === 'pedidos' && id === 'ped1' && existePedido)
          ? { exists: true, id, data: () => ({ estado: estadoPedido }) }
          : { exists: false, id, data: () => null },
      delete: async () => { reg.borradas.push(col + '/' + id); },
      update: async u => {
        if (col === 'pedidos' && updateFalla) throw new Error('NOT_FOUND');
        reg.updates.push({ col, id, data: u });
      },
    }) }) },
  };
  const nombres = Object.keys(ent);
  const fn = new Function(...nombres,
    ['deltasDeItems', 'deltasDeInsumos', 'deleteVenta'].map(cuerpo).join('\n') + '\nreturn deleteVenta;'
  )(...nombres.map(n => ent[n]));
  return fn('vta1', 3).then(() => ({ reg, pedido }));
}

let b = await armarBorrado({ estadoPedido: 'confirmado', existePedido: true });
let upd = b.reg.updates.find(u => u.col === 'pedidos');
t('un pedido CONFIRMADO vuelve a pendiente', upd && upd.data.estado === 'pendiente', JSON.stringify(upd));
t('   y se le saca el ventaId', upd && upd.data.ventaId === '<<borrar>>');
t('   el historial lo dice', /liberado y vuelto a pendiente/.test(b.reg.logs.join(' ')), b.reg.logs.join(' | '));

b = await armarBorrado({ estadoPedido: 'entregado', existePedido: true });
upd = b.reg.updates.find(u => u.col === 'pedidos');
t('un pedido ENTREGADO no retrocede', upd && !('estado' in upd.data), JSON.stringify(upd));
t('   pero igual se le saca el ventaId, para poder refacturarlo',
  upd && upd.data.ventaId === '<<borrar>>');
t('   la copia en memoria sigue entregada', b.pedido.estado === 'entregado', b.pedido.estado);
t('   y el historial explica por que', /se deja entregado/.test(b.reg.logs.join(' ')), b.reg.logs.join(' | '));

b = await armarBorrado({ estadoPedido: 'confirmado', existePedido: false });
t('si el pedido ya no existe, no se le escribe', !b.reg.updates.some(u => u.col === 'pedidos'),
  JSON.stringify(b.reg.updates));
t('   el historial dice que ya no existia', /ya no existia/.test(b.reg.logs.join(' ')), b.reg.logs.join(' | '));
t('   y NO afirma que lo libero', !/liberado y vuelto/.test(b.reg.logs.join(' ')));
t('   la venta se borra igual', b.reg.borradas.indexOf('ventas/vta1') >= 0);

b = await armarBorrado({ estadoPedido: 'confirmado', existePedido: true, updateFalla: true });
t('si el update falla, el historial NO dice que lo libero',
  !/liberado y vuelto/.test(b.reg.logs.join(' ')), b.reg.logs.join(' | '));
t('   dice que no se pudo', /NO se pudo liberar/.test(b.reg.logs.join(' ')));
t('   y avisa en pantalla', b.reg.toasts.some(m => /quedo enganchado/.test(m)), b.reg.toasts.join(' | '));

/* ================= R4 + R5 + R6: el modal de venta ================= */
console.log('\nR4/R5/R6 — EL MODAL DE VENTA');

function armarVenta(pedido, { envioHoy, gratisDesde }) {
  const DOM = {}; const reg = { toasts: [] }; const ventana = {};
  const ent = {
    window: ventana, document: documentoFalso(DOM),
    allProducts: CATALOGO, allClientes: [], clientesAuthData: [{ uid: 'x' }],
    insumosData: [{ id: 'bolsa', nombre: 'Bolsa', stockActual: 10 }],
    pedidosData: [pedido], HACE_ENVIOS: true,
    ENVIO_PRECIO: envioHoy, ENVIO_GRATIS_DESDE: gratisDesde,
    nroPed: n => String(n).padStart(5, '0'),
    showAdminToast: m => reg.toasts.push(m),
    loadProducts: async () => {}, loadClientes: () => {}, closePedidoModal: () => {},
    renderVentaItems: () => {}, renderVentaInsumosUsados: () => {},
    filterVentaProducts: () => {}, refreshVentaInsumosSelect: () => {},
    firebase: { firestore: { FieldValue: { serverTimestamp: () => '<<ahora>>' } } },
    db: { collection: () => ({ doc: () => ({ get: async () => ({ exists: false, data: () => null }), update: async () => {} }),
                               orderBy: () => ({ get: async () => ({ docs: [] }) }) }) },
  };
  const nombres = Object.keys(ent);
  const api = new Function(...nombres,
    'let ventaItems=[],ventaInsumosUsados=[],ventaTipoEntrega="envio",ventaClienteSelected=false,' +
    'editingVentaId=null,editingVentaOriginal=null,editingPedidoId=null,ventasData=[];\n' +
    ['esc', 'esPorPeso', 'tipoVentaDe', 'precioConDsc', 'subtotalItem', 'hoyAR', '_precioCobradoItem',
     'gananciaDe', 'openVentaModal', 'closeVentaModal', 'calcularTotalesVenta',
     'convertirPedidoEnVentaDesdeModal'].map(cuerpo).join('\n') +
    '\nreturn {convertir:function(id){editingPedidoId=id;return convertirPedidoEnVentaDesdeModal();},' +
    'totales:function(){return calcularTotalesVenta();},nuevaVenta:openVentaModal,' +
    'agregar:function(it){ventaItems.push(it);},ganancia:function(){return gananciaDe({items:ventaItems},false);},' +
    'items:function(){return ventaItems;}};'
  )(...nombres.map(n => ent[n]));
  return { api, ventana, reg };
}

const PEDIDO = { docId: 'ped1', numero: 2, origen: 'web', estado: 'pendiente', ventaId: null,
  cliente: 'Ana', clienteAuthUid: 'uid-ana', telefono: '351', direccion: 'Colon 123',
  tipoEntrega: 'envio', envio: 2000, medioPago: 'Efectivo', cupon: null,
  items: [{ id: 'yerba', nombre: 'Yerba', precio: 1500, cantidad: 1, tipoVenta: 'unidad', subtotal: 1500 }] };

let v = armarVenta(PEDIDO, { envioHoy: 2000, gratisDesde: 50000 });
await v.api.convertir('ped1');
t('R4 con el pedido chico se respeta el envio confirmado', v.api.totales().envio === 2000, v.api.totales().envio);
v.api.agregar({ id: 'caja', nombre: 'Caja regalo', precio: 60000, cantidad: 1, descuento: 0, tipoVenta: 'unidad', costo: 30000 });
t('R4 al cruzar el minimo de envio gratis, el envio pasa a $0',
  v.api.totales().envio === 0, '$' + v.api.totales().envio);
t('   (el subtotal quedo arriba del minimo)', v.api.totales().subtotal === 61500, v.api.totales().subtotal);

v = armarVenta(PEDIDO, { envioHoy: 3000, gratisDesde: 50000 });
await v.api.convertir('ped1');
v.api.agregar({ id: 'yerba2', nombre: 'Otra yerba', precio: 1500, cantidad: 1, descuento: 0, tipoVenta: 'unidad', costo: 900 });
t('R4 si NO cruza el minimo, sigue valiendo el envio del cliente',
  v.api.totales().envio === 2000, '$' + v.api.totales().envio);

v = armarVenta(PEDIDO, { envioHoy: 2000, gratisDesde: 50000 });
await v.api.convertir('ped1');
t('R5 convertir engancha el pedido de origen', v.ventana._pedidoOrigenVentaId === 'ped1');
v.api.nuevaVenta();
t('R5 abrir "Nueva Venta" lo SUELTA (antes solo lo soltaba cerrar el modal)',
  v.ventana._pedidoOrigenVentaId === null, v.ventana._pedidoOrigenVentaId);
t('R5 y tambien suelta el destino de estado', !v.ventana._pedidoEstadoDestino);

/* Esta se escapo de la primera version de la prueba y la cazó abrir la página: como
   convertirPedidoEnVentaDesdeModal llama a openVentaModal(), que es justo donde se
   limpian los window._pedido*, el destino se borraba antes de que saveVenta lo leyera y
   pedir "entregado" volvia a terminar en "confirmado". La prueba de R1 no lo veia porque
   seteaba el destino a mano y saltaba openVentaModal. */
v = armarVenta(PEDIDO, { envioHoy: 2000, gratisDesde: 50000 });
v.ventana._pedidoEstadoDestino = 'entregado';
await v.api.convertir('ped1');
t('R1 el destino SOBREVIVE a la conversion entera, no solo al tramo de saveVenta',
  v.ventana._pedidoEstadoDestino === 'entregado', v.ventana._pedidoEstadoDestino);

const PEDIDO_SIN_COSTO = Object.assign({}, PEDIDO, {
  items: [{ id: 'sincosto', nombre: 'Almendras', precio: 17500, cantidad: 1, tipoVenta: 'unidad', subtotal: 17500 }] });
v = armarVenta(PEDIDO_SIN_COSTO, { envioHoy: 2000, gratisDesde: 50000 });
await v.api.convertir('ped1');
t('R6 un producto con costo 0 en el catalogo entra como null, no como 0',
  v.api.items()[0].costo === null, 'costo=' + v.api.items()[0].costo);
t('R6 y la ganancia se declara INCOMPLETA en vez de mostrar la facturacion entera',
  v.api.ganancia().completa === false, JSON.stringify(v.api.ganancia()));

/* ================= h10: guardar el pedido no recotiza ================= */
console.log('\nh10 — GUARDAR EL PEDIDO DESDE EL MODAL NO PUEDE RECOTIZAR EL ENVIO');

function armarPedido(pedido, { envioHoy, gratisDesde }) {
  const DOM = {}; const reg = { updates: [], toasts: [] }; const ventana = {};
  const ent = {
    window: ventana, document: documentoFalso(DOM),
    allProducts: CATALOGO, allClientes: [], insumosData: [], pedidosData: [pedido],
    HACE_ENVIOS: true, ENVIO_PRECIO: envioHoy, ENVIO_GRATIS_DESDE: gratisDesde,
    nroPed: n => String(n).padStart(5, '0'),
    showAdminToast: m => reg.toasts.push(m),
    loadProducts: () => {}, loadClientes: () => {},
    renderPedItems: () => {}, renderPedInsumosUsados: () => {}, filterPedProducts: () => {},
    refreshPedInsumosSelect: () => {}, closePedidoModal: () => {}, sendTelegramMsg: () => {},
    markPedidoDirty: () => {}, esc: s => String(s == null ? '' : s),
    firebase: { firestore: { FieldValue: { serverTimestamp: () => '<<ahora>>' } } },
    db: { collection: col => ({
      doc: id => ({ get: async () => ({ exists: false, data: () => null }),
                    update: async u => { reg.updates.push({ col, id, data: u }); } }),
      add: async d => { reg.updates.push({ col, id: '(nuevo)', data: d }); return { id: 'n' }; },
      orderBy: () => ({ get: async () => ({ docs: [] }) }) }),
      runTransaction: async fn => fn({ get: async () => ({ exists: false }), set: () => {} }) },
  };
  const nombres = Object.keys(ent);
  const api = new Function(...nombres,
    'let pedItems=[],pedInsumosUsados=[],pedTipoEntrega="envio",pedClienteSelected=false,' +
    'editingPedidoId=null,pedidoDirty=false,_pedidoCupon=null;\n' +
    ['esPorPeso', 'tipoVentaDe', 'fmtPeso', 'fmtCantidad', 'precioConDsc', 'subtotalItem',
     'costoItem', 'calcPedTotales', 'openPedidoModal', 'savePedidoDesdeModal'].map(cuerpo).join('\n') +
    '\nreturn {abrir:openPedidoModal,totales:calcPedTotales,guardar:savePedidoDesdeModal,' +
    'agregar:function(it){pedItems.push(it);},dom:function(){return arguments;}};'
  )(...nombres.map(n => ent[n]));
  return { api, DOM, reg, ventana };
}

let p = armarPedido(PEDIDO, { envioHoy: 3000, gratisDesde: 50000 });
p.api.abrir('ped1');
t('el envio del pedido queda guardado al abrirlo',
  p.ventana._pedidoEnvioOriginal && p.ventana._pedidoEnvioOriginal.envio === 2000,
  JSON.stringify(p.ventana._pedidoEnvioOriginal));
t('y calcPedTotales lo respeta contra la tarifa de hoy ($3.000)',
  p.api.totales().envio === 2000, '$' + p.api.totales().envio);

p.DOM['pedClienteId'].value = 'cli1'; p.DOM['pedCliente'].value = 'Ana';
await p.api.guardar();
let esc = p.reg.updates.find(u => u.col === 'pedidos');
t('y lo que queda ESCRITO son los $2.000, no los $3.000 de hoy',
  esc && esc.data.envio === 2000, esc && '$' + esc.data.envio);
t('   (antes esto anulaba el arreglo del envio: la conversion despues lee p.envio)',
  esc && esc.data.envio !== 3000);

p = armarPedido(PEDIDO, { envioHoy: 3000, gratisDesde: 50000 });
p.api.abrir('ped1');
p.api.agregar({ id: 'caja', nombre: 'Caja regalo', precio: 60000, cantidad: 1, descuento: 0, tipoVenta: 'unidad', costo: 30000 });
t('si el admin agrega mercaderia y cruza el minimo, el envio pasa a $0',
  p.api.totales().envio === 0, '$' + p.api.totales().envio);

p = armarPedido(PEDIDO, { envioHoy: 3000, gratisDesde: 50000 });
p.api.abrir(null);
t('un pedido NUEVO del panel cotiza con la tarifa de hoy, como corresponde',
  p.ventana._pedidoEnvioOriginal === null, JSON.stringify(p.ventana._pedidoEnvioOriginal));
p.api.agregar({ id: 'yerba', nombre: 'Yerba', precio: 1500, cantidad: 1, descuento: 0, tipoVenta: 'unidad', costo: 900 });
t('   y le cobra los $3.000 de hoy', p.api.totales().envio === 3000, '$' + p.api.totales().envio);

const SIN_ENVIO = Object.assign({}, PEDIDO); delete SIN_ENVIO.envio;
p = armarPedido(SIN_ENVIO, { envioHoy: 3000, gratisDesde: 50000 });
p.api.abrir('ped1');
t('un pedido viejo sin campo envio se recotiza, no hay otra',
  p.api.totales().envio === 3000, '$' + p.api.totales().envio);

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
})();
