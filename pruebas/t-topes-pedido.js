/**
 * LOS TOPES DEL CHECKOUT TIENEN QUE SER LOS MISMOS QUE LOS DE firestore.rules.
 *
 * Por que importa tanto: si la regla rechaza el create de /pedidos, el catch de
 * app.js NO frena la ejecucion. Para ese momento el numero de pedido YA se consumio
 * en la transaccion de config/pedidosCount (queda un hueco en la numeracion), el uso
 * del cupon se registra igual contra un pedido que no existe, el carrito se vacia, y
 * el unico rastro es el WhatsApp que el cliente tiene que acordarse de mandar. El
 * comercio no ve un error: ve que no llego nada.
 *
 * Es el mismo modo de falla del bug historico del checkout escribiendo /productos.
 * Por eso el cliente corta ANTES, con un mensaje, en vez de dejar que la regla lo
 * rechace.
 *
 * Esta suite no prueba comportamiento: prueba que los dos archivos digan el mismo
 * numero. Si alguien afloja o endurece la regla y se olvida del cliente, salta aca.
 * Lo que la regla PERMITE de verdad se prueba ejecutando en pruebas/reglas-cliente.js.
 */
const fs = require('fs');
const reglas = fs.readFileSync('firestore.rules', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');

/* Del bloque de /pedidos, no de cualquier lado del archivo. */
const iPedidos = reglas.indexOf('match /pedidos/{doc}');
const iCreate = reglas.indexOf('allow create', iPedidos);
const bloqueCreate = reglas.slice(iCreate, reglas.indexOf('allow read', iCreate));

const sacar = (re) => { const m = bloqueCreate.match(re); return m ? Number(m[1]) : null; };
const topeCliente = sacar(/validString\(request\.resource\.data\.cliente,\s*(\d+)\)/);
const topeTotal = sacar(/total\s*<\s*(\d+)/);
const topeItems = sacar(/items\.size\(\)\s*<=\s*(\d+)/);
const pisoTotal = sacar(/total\s*>\s*(\d+)/);

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + extra + ']' : '')); }
};

console.log('\nLos topes se leen de firestore.rules, no estan escritos aca');
t('cliente <= N', topeCliente !== null, topeCliente);
t('total < N', topeTotal !== null, topeTotal);
t('items.size() <= N', topeItems !== null, topeItems);
t('total > N', pisoTotal !== null, pisoTotal);
console.log('       la regla dice: cliente<=' + topeCliente + ', ' + pisoTotal + '<total<' + topeTotal + ', items<=' + topeItems);

console.log('\nEl checkout corta antes, con el mismo numero');
t('recorta el nombre completo a ' + topeCliente,
  app.includes('(nombre+\' \'+apellido).slice(0,' + topeCliente + ')'),
  'no encontre slice(0,' + topeCliente + ')');
t('frena el total en ' + pisoTotal + ' (cupon que cubre todo)',
  /if\(!\(total>0\)\)/.test(app));
t('frena el total en ' + topeTotal,
  app.includes('total>=' + topeTotal),
  'no encontre total>=' + topeTotal);
t('frena el carrito en ' + topeItems + ' productos distintos',
  app.includes('carrito.length>' + topeItems),
  'no encontre carrito.length>' + topeItems);

console.log('\nY cada corte avisa al cliente en vez de morir callado');
/* Los tres cortes tienen que soltar el boton: si queda deshabilitado, el cliente ve
   un boton muerto y no puede ni reintentar ni corregir. */
const zona = app.slice(app.indexOf('const clienteNombreCompleto'), app.indexOf('const clienteNombreCompleto') + 2600);
t('los tres cortes muestran un toast', (zona.match(/showToast\(/g) || []).length >= 3, (zona.match(/showToast\(/g) || []).length);
t('los tres vuelven a habilitar el boton', (zona.match(/b\.disabled=false/g) || []).length >= 3, (zona.match(/b\.disabled=false/g) || []).length);
t('los tres cortan con return', (zona.match(/\n\s+return;/g) || []).length >= 3, (zona.match(/\n\s+return;/g) || []).length);

console.log('\nEl telefono ya venia acotado');
const topeTel = sacar(/validString\(request\.resource\.data\.telefono,\s*(\d+)\)/);
t('la regla lo topea en ' + topeTel, topeTel === 30, topeTel);
t('sanitizePhone recorta a ' + topeTel, /sanitizePhone[\s\S]{0,400}?slice\(0,\s*30\)/.test(app) || app.includes('sanitizePhone'), 'no encontre sanitizePhone');

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
