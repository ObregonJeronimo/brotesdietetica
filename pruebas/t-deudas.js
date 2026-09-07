/**
 * DEUDAS CON PROVEEDORES.
 *
 * Una deuda es una compra sin saldar: no hay colección aparte. La compra guarda
 * `pagado` -un monto, no un sí/no, porque a un proveedor se le paga en partes- y
 * `pagos` con cada pago.
 *
 * LO QUE ESTA PRUEBA CUIDA, EN ORDEN DE GRAVEDAD
 *
 * 1. Que las compras VIEJAS no aparezcan como deuda. Son las que ya estaban
 *    cargadas sin ninguno de estos campos. Si "sin campo" contara como impaga, la
 *    clienta abriría el panel y vería una deuda inventada de cientos de miles de
 *    pesos. Es el error más caro que podría tener esto.
 *
 * 2. Que no se pueda pagar de más. Un pago mayor al saldo deja el número en
 *    negativo y a partir de ahí no significa nada.
 *
 * 3. Que borrar una compra con pagos avise. Los pagos viven adentro de la compra:
 *    borrarla borra el registro de plata que se pagó de verdad.
 */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

const src = fs.readFileSync(path.join(RAIZ, 'admin-deudas.js'), 'utf8');
/* Se corta antes de la parte de pantalla: esa necesita DOM y Firestore. */
const soloLogica = src.slice(0, src.indexOf('/* ======================== LA CARGA'));
const M = new Function(soloLogica + `;return {
  estado: deudaEstado, esDeuda: deudaEsDeuda, porProveedor: deudasPorProveedor,
  validar: deudaValidarPago, MEDIOS: DEU_MEDIOS };`)();

let ok = 0, fail = 0;
const t = (d, c) => { if (c) { ok++; console.log('  OK   ' + d); } else { fail++; console.log('  FALLA ' + d); } };

/* ============================================ LAS COMPRAS VIEJAS NO SON DEUDA */
console.log('\n-- las compras de antes --');
const vieja = { total: 50000, items: [] };
t('una compra sin los campos nuevos queda "sin registro"',
  M.estado(vieja).estado === 'sin-registro');
t('y su saldo es cero, no su total', M.estado(vieja).saldo === 0);
t('no cuenta como deuda', !M.esDeuda(vieja));
t('no entra en el agrupado por proveedor',
  Object.keys(M.porProveedor([Object.assign({ proveedorId: 'L1' }, vieja)])).length === 0);
/* pagado en null es lo mismo que no tenerlo: un documento a medio migrar. */
t('pagado en null tambien es "sin registro"',
  M.estado({ total: 100, pagado: null }).estado === 'sin-registro');
/* Y no se puede pagar algo de lo que no sabemos nada. */
t('no deja registrar un pago sobre una compra vieja', !M.validar(vieja, 100).ok);

/* ==================================================================== ESTADOS */
console.log('\n-- los cuatro estados --');
const impaga = { total: 200000, pagado: 0, saldada: false, pagos: [] };
const parcial = { total: 100000, pagado: 40000, saldada: false, pagos: [{ monto: 40000 }] };
const pagada = { total: 70000, pagado: 70000, saldada: true, pagos: [{ monto: 70000 }] };

t('sin pagar', M.estado(impaga).estado === 'impaga');
t('  con el saldo entero', M.estado(impaga).saldo === 200000);
t('pagada en parte', M.estado(parcial).estado === 'parcial');
t('  y el saldo es la resta', M.estado(parcial).saldo === 60000);
t('pagada', M.estado(pagada).estado === 'pagada');
t('  con saldo cero', M.estado(pagada).saldo === 0);
t('las dos primeras son deuda', M.esDeuda(impaga) && M.esDeuda(parcial));
t('la pagada no', !M.esDeuda(pagada));
/* Pagar de mas nunca deberia pasar -esta validado- pero si un documento quedara
   asi, el saldo no puede salir negativo y contaminar la suma del proveedor. */
t('un pagado mayor al total no deja el saldo en negativo',
  M.estado({ total: 100, pagado: 150 }).saldo === 0);
t('un pagado negativo se trata como cero',
  M.estado({ total: 100, pagado: -50 }).pagado === 0);
t('sin total no rompe', M.estado({ pagado: 0 }).saldo === 0);
t('null no rompe', M.estado(null).estado === 'sin-registro');

/* Los centavos: sumar en punto flotante deja restos y una compra pagada entera
   nunca se daria por saldada. */
const centavos = { total: 0.1 + 0.2, pagado: 0.3 };
t('0,1 + 0,2 pagado con 0,3 cuenta como pagada', M.estado(centavos).estado === 'pagada');

/* ================================================================= AGRUPADO */
console.log('\n-- el total por proveedor --');
const compras = [
  Object.assign({ proveedorId: 'L1', fecha: '2026-08-20' }, impaga),
  Object.assign({ proveedorId: 'L1', fecha: '2026-08-10' }, parcial),
  Object.assign({ proveedorId: 'L1' }, pagada),
  Object.assign({ proveedorId: 'L2' }, { total: 33000, pagado: 0, saldada: false }),
  Object.assign({ proveedorId: 'L1' }, vieja),
];
const g = M.porProveedor(compras);
t('suma solo lo que se debe', g.L1.saldo === 260000);
t('y cuenta solo las compras que son deuda', g.L1.cuantas === 2);
t('cada proveedor va por su lado', g.L2.saldo === 33000);
/* La mas vieja primero: es la que hay que pagar antes. */
t('las deudas salen de la mas vieja a la mas nueva',
  g.L1.compras[0].fecha === '2026-08-10');
t('un proveedor sin deudas no aparece', g.L3 === undefined);
t('sin compras no rompe', Object.keys(M.porProveedor(null)).length === 0);
/* Una compra sin proveedor no se puede perder: va a una bolsa aparte. */
t('una compra sin proveedor no se descarta',
  M.porProveedor([{ total: 100, pagado: 0 }]).__sin__.saldo === 100);

/* ================================================================ EL PAGO */
console.log('\n-- registrar un pago --');
t('un pago normal pasa', M.validar(impaga, 50000).ok);
const v = M.validar(impaga, 50000);
t('  y deja el pagado acumulado', v.pagado === 50000);
t('  con el saldo nuevo', v.saldo === 150000);
t('  y no la da por saldada', v.saldada === false);
const vt = M.validar(impaga, 200000);
t('pagar justo el saldo la salda', vt.saldada === true && vt.saldo === 0);
/* El limite: nunca mas de lo que se debe. */
t('no deja pagar de mas', !M.validar(impaga, 200001).ok);
t('  y lo explica con el saldo', /200\.000/.test(M.validar(impaga, 200001).motivo));
t('no deja pagar cero', !M.validar(impaga, 0).ok);
t('no deja pagar negativo', !M.validar(impaga, -1000).ok);
t('no deja pagar texto', !M.validar(impaga, 'mil').ok);
t('no deja pagar sobre una ya pagada', !M.validar(pagada, 100).ok);
t('sobre una parcial, el tope es el saldo y no el total',
  M.validar(parcial, 60000).ok && !M.validar(parcial, 60001).ok);

/* ============================================================ EL CABLEADO */
console.log('\n-- que este enchufado --');
const html = fs.readFileSync(path.join(RAIZ, 'admin.html'), 'utf8');
const compra = fs.readFileSync(path.join(RAIZ, 'admin-compras.js'), 'utf8');
const prov = fs.readFileSync(path.join(RAIZ, 'admin-proveedores.js'), 'utf8');
const deu = fs.readFileSync(path.join(RAIZ, 'admin-deudas.js'), 'utf8');

t('admin.html carga el modulo', html.indexOf('<script src="admin-deudas.js"></script>') > 0);
t('existe el modal', html.indexOf('id="deudasModal"') > 0);
t('hay un toggle al cargar la compra', html.indexOf('name="compraPago"') > 0);
t('arranca en "ya la pague"', /value="pagada" checked/.test(html));
t('el toggle avisa a donde va la deuda', compra.indexOf('function compraPagoCambio') > 0);
t('al abrir el modal el toggle vuelve a "pagada"',
  /function openCompraModal[\s\S]*?compraPago"\]\[value="pagada"\]/.test(compra));

/* Los tres campos se escriben juntos: si `saldada` quedara sin escribir, la
   consulta no encontraria nunca esa deuda. */
t('la compra guarda pagado', /pagado: quedaDebiendo \? 0 : total/.test(compra));
t('y saldada', /saldada: !quedaDebiendo/.test(compra));
t('y la lista de pagos', /pagos: quedaDebiendo \? \[\]/.test(compra));

/* La consulta NO puede salir del cache de compras: ese trae solo el periodo. */
t('las deudas tienen su propia consulta',
  deu.indexOf("db.collection('compras').where('saldada', '==', false)") > 0);
t('y se cargan junto con el panel de proveedores',
  prov.indexOf('cargarDeudas(true)') > 0);
t('el monto sale en la tarjeta de la lista, sin hacer clic',
  prov.indexOf('prov-deuda') > 0 && prov.indexOf('Le deb') > 0);
t('y hay un boton en la ficha', compra.indexOf('function _cpBotonDeudas') > 0 &&
  compra.indexOf('openDeudasModal(') > 0);
t('el boton dice cuanto se debe sin apretarlo',
  /Deudas &middot; le deb\\u00e9s ' \+ _cpPesos\(d\.saldo\)/.test(compra));

/* El pago se valida DOS veces: contra la pantalla y contra lo que dice la base
   adentro de la transaccion. Si alguien pago desde otra sesion, el segundo pago
   se frena en vez de dejar el saldo en negativo. */
t('el pago se escribe en una transaccion', deu.indexOf('db.runTransaction') > 0);
t('y se vuelve a validar contra la base adentro',
  /const vv = deudaValidarPago\(actual, v\.monto\)/.test(deu));
t('los tres campos se escriben en el mismo update',
  /tx\.update\(ref, \{ pagado: vv\.pagado, saldada: vv\.saldada, pagos: pagos \}\)/.test(deu));
t('el pago queda en el historial de acciones', deu.indexOf("logAction('editar', 'Pago a proveedor") > 0);

/* Borrar una compra con pagos borra el registro de plata pagada. */
t('avisa antes de borrar una compra con pagos', compra.indexOf('function _cpAvisoPagos') > 0);
t('y lo dice con el monto', /Ese registro se borra con la compra/.test(compra));
t('el aviso esta enganchado en borrarCompra',
  /function borrarCompra[\s\S]*?_cpAvisoPagos\(c\)/.test(compra));

/* Borrar una lista deja sus compras apuntando a un proveedor que ya no existe: el
   documento sigue diciendo que se debe, pero no hay tarjeta que lo muestre y la
   plata desaparece de la pantalla. */
t('eliminar una lista avisa si se le debe plata',
  /const _d=\(typeof deudaDe==='function'\)\?deudaDe\(id\)/.test(html) &&
  html.indexOf('esa deuda va a dejar de verse en el panel') > 0);

/* Un informe de proveedor sin la plata que se le debe miente por omision: se le
   manda al contador y justo falta lo que hay que pagar. */
t('la exportacion incluye la deuda en el resumen',
  prov.indexOf("resumen.push(['Le deb") > 0 && /_provPesos\(r\.debe\)/.test(prov));
t('y el detalle compra por compra', prov.indexOf('Lo que se le debe') > 0);
t('sin deuda no agrega el bloque de detalle',
  /if \(_deudas\.compras && _deudas\.compras\.length\)/.test(prov));
/* La deuda va aunque no haya compras en el periodo: se puede deber algo de hace
   ocho meses y no haberle comprado nada desde entonces. */
t('la deuda no depende de que haya compras en el periodo',
  prov.indexOf('if (r.debe) resumen.push') < prov.indexOf('if (r.gastado) {'));

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
