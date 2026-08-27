/**
 * UN PEDIDO WEB NO SE PUEDE ENTREGAR SIN REGISTRAR LA VENTA.
 *
 * El tablero de Pedidos tiene DOS caminos para cambiar de estado:
 *   - arrastrar la tarjeta (kanbanDrop), y
 *   - el modal de estado (aplicarEstadoPedido), que en CELULAR es el unico que
 *     existe, porque ahi no hay drag&drop.
 * Todas las guardas estaban escritas una sola vez, adentro de kanbanDrop. El modal
 * hacia un update pelado que no miraba `ventaId` en ninguna linea. Desde el telefono
 * se podia entonces:
 *
 *   1. Confirmar o entregar un pedido web SIN facturarlo. Y no se nota: el stock
 *      igual queda bien, porque lo descuenta la Cloud Function al crearse el pedido.
 *      Lo que se pierde es la PLATA. No entra a caja, no entra a estadisticas, el
 *      cliente queda con 0 compras en su ficha, y el boton "Convertir a venta"
 *      desaparecia justo cuando el estado pasaba a 'entregado'. Con 0 pedidos en la
 *      base, el primer pedido real tiene muchas chances de irse por aca.
 *   2. Volverlo a pendiente sin borrar la venta ni devolver el stock, salteando toda
 *      la reversion que kanbanDrop si hacia.
 *
 * Y la guarda del tablero tampoco alcanzaba: exigia que el destino fuera EXACTAMENTE
 * 'confirmado', asi que arrastrar de pendiente DIRECTO a entregado -que es lo normal
 * cuando el cliente retira en el momento- salteaba la facturacion igual.
 *
 * Aca abajo se ejecutan las funciones REALES del panel, incluida actualizarEstadoPedido,
 * asi que lo que se mide es lo que se le escribe a Firestore. No mira el fuente.
 *
 * La segunda mitad es el otro lado del mismo nudo: borrar la venta desde la seccion
 * Ventas no le sacaba el `ventaId` al pedido. El pedido quedaba apuntando a un
 * documento borrado y openPedidoModal esconde "Convertir a venta" con !!p.ventaId:
 * no se podia facturar NUNCA MAS, sin cartel y sin error.
 */
const fs = require('fs');
const src = fs.readFileSync('admin.html', 'utf8');

function cuerpo(nombre) {
  let i = src.indexOf('function ' + nombre + '(');
  if (i < 0) throw new Error('no encontre ' + nombre);
  /* Si la declaracion es `async function`, hay que llevarse el async: sacarla sin el
     da sintaxis valida y explota recien al ejecutar, con un await suelto. */
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

/* Una venta con un producto por unidad y uno a granel: a granel la cantidad viaja
   en GRAMOS, asi que el stock devuelto tienen que ser 250, no 250.000. */
const VENTA = {
  docId: 'vta1', pedidoId: 'ped1', stockDescontado: true,
  items: [
    { id: 'yerba', nombre: 'Yerba', precio: 1500, cantidad: 4, tipoVenta: 'unidad' },
    { id: 'nuez', nombre: 'Nueces', precio: 18000, cantidad: 250, tipoVenta: 'peso' },
  ],
  insumosUsados: [{ id: 'bolsa', nombre: 'Bolsa', cantidad: 2 }],
};

function entornoBase(reg, pedidos, ventas) {
  return {
    window: { _estadoPedidoId: 'ped1' },
    pedidosData: pedidos,
    ventasData: ventas,
    nroPed: n => String(n).padStart(5, '0'),
    openPedidoModal: id => reg.modalPedido.push(id),
    closeEstadoPedidoModal: () => { reg.modalEstadoCerrado++; },
    closePedidoModal: () => {},
    loadPedidos: () => { reg.recargas++; },
    renderPedidos: () => { reg.renders++; },
    filterVentas: () => {},
    showAdminToast: m => reg.toasts.push(m),
    pedirConfirmacion: async () => true,
    aplicarStockProductos: async d => { reg.stockProd = d; },
    aplicarStockInsumos: async d => { reg.stockIns = d; },
    logAction: (a, b, c) => reg.logs.push(c),
    firebase: { firestore: { FieldValue: {
      delete: () => '<<borrar>>',
      serverTimestamp: () => '<<ahora>>',
    } } },
    db: { collection: col => ({ doc: id => ({
      get: async () => {
        const v = ventas.concat([VENTA]).find(x => x && x.docId === id);
        return (col === 'ventas' && v && reg.ventaEnBase)
          ? { exists: true, id: id, data: () => JSON.parse(JSON.stringify(v)) }
          : { exists: false, id: id, data: () => null };
      },
      delete: async () => { reg.borradas.push(col + '/' + id); },
      update: async u => { reg.updates.push(col + '/' + id + ' ' + JSON.stringify(u)); },
    }) }) },
  };
}

/* ================= PARTE 1: cambiar de estado ================= */

const CAMBIO = ['deltasDeItems', 'deltasDeInsumos',
  'transicionEstadoPedido', 'actualizarEstadoPedido', 'aplicarEstadoPedido'].map(cuerpo).join('\n');

function cambiar({ estado, ventaId, destino, porElModal, conVenta }) {
  const reg = { updates: [], borradas: [], toasts: [], modalPedido: [], modalEstadoCerrado: 0,
                recargas: 0, renders: 0, stockProd: null, stockIns: null, logs: [], ventaEnBase: true };
  const pedido = { docId: 'ped1', numero: 2, estado: estado, ventaId: ventaId || null };
  const ent = entornoBase(reg, [pedido], conVenta ? [JSON.parse(JSON.stringify(VENTA))] : []);
  const nombres = Object.keys(ent);
  const api = new Function(...nombres,
    CAMBIO + '\nreturn {transicionEstadoPedido:transicionEstadoPedido,aplicarEstadoPedido:aplicarEstadoPedido};'
  )(...nombres.map(n => ent[n]));
  const p = porElModal ? api.aplicarEstadoPedido(destino) : api.transicionEstadoPedido('ped1', destino);
  return p.then(r => ({ reg, pedido, r }));
}

/* Lo que de verdad importa: ¿quedo escrito el estado nuevo en Firestore? */
const seEscribio = reg => reg.updates.some(u => /^pedidos\/ped1 .*"estado"/.test(u));

(async () => {
  console.log('\nDESDE EL MODAL DE ESTADO — el unico camino que hay en celular');

  let { reg, r } = await cambiar({ estado: 'pendiente', ventaId: null, destino: 'confirmado', porElModal: true });
  t('pendiente -> confirmado sin venta: deriva a facturar', r === 'derivado', r);
  t('   y NO escribe el estado', !seEscribio(reg), reg.updates.join(' | '));
  t('   abre el modal del pedido', reg.modalPedido.indexOf('ped1') >= 0);
  t('   no recarga la lista como si hubiera pasado algo', reg.recargas === 0);

  ({ reg, r } = await cambiar({ estado: 'pendiente', ventaId: null, destino: 'entregado', porElModal: true }));
  t('pendiente -> ENTREGADO de una sola vez: tambien deriva', r === 'derivado', r);
  t('   y NO escribe el estado', !seEscribio(reg), reg.updates.join(' | '));

  ({ reg, r } = await cambiar({ estado: 'confirmado', ventaId: null, destino: 'entregado', porElModal: true }));
  t('confirmado-sin-venta -> entregado: deriva', r === 'derivado', r);
  t('   y NO escribe el estado', !seEscribio(reg), reg.updates.join(' | '));

  console.log('\nCon la venta ya registrada, el pedido avanza normalmente');
  ({ reg, r } = await cambiar({ estado: 'confirmado', ventaId: 'vta1', destino: 'entregado', porElModal: true, conVenta: true }));
  t('confirmado-CON-venta -> entregado: pasa', r === 'hecho', r);
  t('   escribe estado entregado', /"estado":"entregado"/.test(reg.updates.join(' ')), reg.updates.join(' | '));
  t('   deja fecha de actualizacion', /"actualizadoEn"/.test(reg.updates.join(' ')));
  t('   cierra el modal de estado', reg.modalEstadoCerrado === 1);
  t('   y recarga la lista', reg.recargas === 1);

  console.log('\nARRASTRANDO en el tablero (la guarda vieja solo miraba "confirmado")');
  ({ reg, r } = await cambiar({ estado: 'pendiente', ventaId: null, destino: 'entregado' }));
  t('pendiente -> entregado arrastrando: deriva a facturar', r === 'derivado', r);
  t('   y NO escribe el estado', !seEscribio(reg), reg.updates.join(' | '));

  ({ reg, r } = await cambiar({ estado: 'pendiente', ventaId: null, destino: 'confirmado' }));
  t('pendiente -> confirmado arrastrando: sigue derivando, como antes', r === 'derivado', r);

  console.log('\nVOLVER A PENDIENTE DESDE EL MODAL — antes salteaba toda la reversion');
  let pedido;
  ({ reg, r, pedido } = await cambiar({ estado: 'entregado', ventaId: 'vta1', destino: 'pendiente', porElModal: true, conVenta: true }));
  t('borra la venta asociada', reg.borradas.indexOf('ventas/vta1') >= 0, reg.borradas.join(' | '));
  t('devuelve las 4 unidades de yerba', reg.stockProd && reg.stockProd.yerba === 4, JSON.stringify(reg.stockProd));
  t('devuelve 250 GRAMOS de nueces, no 250 kilos', reg.stockProd && reg.stockProd.nuez === 250);
  t('devuelve los insumos', reg.stockIns && reg.stockIns.bolsa === 2);
  t('le saca el ventaId al pedido', /pedidos\/ped1.*ventaId/.test(reg.updates.join(' ')));
  t('y lo deja en pendiente', /"estado":"pendiente"/.test(reg.updates.join(' ')), reg.updates.join(' | '));

  console.log('\nUn estado que no cambia nada no toca la base');
  ({ reg, r } = await cambiar({ estado: 'pendiente', ventaId: null, destino: 'pendiente', porElModal: true }));
  t('pendiente -> pendiente: no hace nada', r === 'nada', r);
  t('   ni cierra el modal (no paso nada que mostrar)', reg.modalEstadoCerrado === 0);

  /* ================= PARTE 2: borrar la venta ================= */

  const BORRAR = ['deltasDeItems', 'deltasDeInsumos', 'deleteVenta'].map(cuerpo).join('\n');

  function borrar({ enCache, pedidoId, estadoPedido }) {
    const venta = Object.assign({}, VENTA, { pedidoId: pedidoId === undefined ? 'ped1' : pedidoId });
    const reg = { updates: [], borradas: [], toasts: [], modalPedido: [], modalEstadoCerrado: 0,
                  recargas: 0, renders: 0, stockProd: null, stockIns: null, logs: [], ventaEnBase: true };
    const pedido = { docId: 'ped1', numero: 2, estado: estadoPedido || 'confirmado', ventaId: 'vta1' };
    const ent = entornoBase(reg, [pedido], enCache ? [JSON.parse(JSON.stringify(venta))] : []);
    /* la venta que devuelve la BASE tiene que ser esta, no la constante */
    ent.db = { collection: col => ({ doc: id => ({
      /* deleteVenta ahora LEE el pedido antes de escribirle: sirve para no pisarle el
         estado a uno ya entregado, y para no mandarle un update a uno que ya no existe. */
      get: async () => (col === 'ventas' && id === 'vta1')
        ? { exists: true, id: id, data: () => JSON.parse(JSON.stringify(venta)) }
        : (col === 'pedidos' && id === pedido.docId)
          ? { exists: true, id: id, data: () => ({ estado: pedido.estado }) }
          : { exists: false, id: id, data: () => null },
      delete: async () => { reg.borradas.push(col + '/' + id); },
      update: async u => { reg.updates.push(col + '/' + id + ' ' + JSON.stringify(u)); },
    }) }) };
    const nombres = Object.keys(ent);
    const fn = new Function(...nombres, BORRAR + '\nreturn deleteVenta;')(...nombres.map(n => ent[n]));
    return fn('vta1', 2).then(() => ({ reg, pedido }));
  }

  console.log('\nBORRAR LA VENTA DE UN PEDIDO WEB');
  let res = await borrar({ enCache: true });
  t('borra la venta', res.reg.borradas.indexOf('ventas/vta1') >= 0);
  t('le saca el ventaId al pedido', /pedidos\/ped1.*"ventaId"/.test(res.reg.updates.join(' ')), res.reg.updates.join(' | '));
  t('y lo devuelve a pendiente para poder refacturarlo', /"estado":"pendiente"/.test(res.reg.updates.join(' ')));
  t('la copia en memoria queda sin ventaId', !res.pedido.ventaId, JSON.stringify(res.pedido));
  t('la copia en memoria queda en pendiente', res.pedido.estado === 'pendiente');
  t('el historial dice que solto el pedido', /vuelto a pendiente/.test(res.reg.logs.join(' ')), res.reg.logs.join(' | '));

  console.log('\nCON LA CACHE DE VENTAS VACIA (si entraste derecho a Pedidos)');
  res = await borrar({ enCache: false });
  t('IGUAL encuentra el pedido leyendo el documento', /pedidos\/ped1.*"ventaId"/.test(res.reg.updates.join(' ')), res.reg.updates.join(' | '));
  t('IGUAL lo devuelve a pendiente', /"estado":"pendiente"/.test(res.reg.updates.join(' ')));

  console.log('\nUna venta de mostrador no tiene pedido que desenganchar');
  res = await borrar({ enCache: true, pedidoId: null });
  t('borra la venta igual', res.reg.borradas.indexOf('ventas/vta1') >= 0);
  t('y no toca ningun pedido', !/^pedidos\//.test(res.reg.updates.join(' ')), res.reg.updates.join(' | '));

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})();
