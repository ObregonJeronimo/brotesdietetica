/**
 * EL tipoVenta QUE SE PIERDE AL VOLVER A ABRIR UNA VENTA O UN PEDIDO GUARDADO.
 *
 * admin.html:1541 ya lo dice: "El subtotal SIEMPRE se calcula con subtotalItem().
 * La formula estaba repetida en cinco lugares (...) con dos modos de venta, cinco
 * copias es una garantia de que alguna quede mal y una venta salga mil veces mas
 * cara o mas barata."
 *
 * La formula se unifico. Lo que NO se unifico es el dato que la alimenta.
 * subtotalItem() decide el /1000 mirando `i.tipoVenta`, y ese campo se cae en cada
 * lugar donde un item GUARDADO vuelve a la pantalla: los map de rehidratacion se
 * escribieron antes de que existiera la venta por peso y el merge no los volvio a
 * mirar. addVentaItem() -el alta desde el mostrador, que es el camino que se probo-
 * si lo pone, y por eso nunca se noto.
 *
 * Que produce, en plata:
 *   250 g de nueces a $18.000 el kilo = $4.500.
 *   Sin tipoVenta, subtotalItem hace 18000 * 250 = $4.500.000.
 *
 * Y no queda en pantalla. saveVenta() guarda `tipoVenta: i.tipoVenta || 'unidad'`:
 * ese `|| 'unidad'` convierte la perdida en CORRUPCION. Abrir una venta a granel
 * para cambiarle el medio de pago y guardarla la reescribe como venta por unidad,
 * con el total x1000, y ya no hay como saber que era a granel.
 *
 * Dos capas, como en t-etiqueta.js:
 *   1. que subtotalItem REAL de admin.html de x1000 sin el campo. Si algun dia
 *      dejara de importar, la capa 2 sola no lo notaria.
 *   2. que cada sitio que arma o rehidrata items lo lleve. Es la regresion exacta.
 */
const fs = require('fs');
const src = fs.readFileSync('admin.html', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');

function cuerpo(nombre, fuente) {
  const s = fuente || src;
  const i = s.indexOf('function ' + nombre + '(');
  if (i < 0) throw new Error('no encontre ' + nombre);
  let prof = 0, k;
  for (k = s.indexOf('{', i); k < s.length; k++) {
    if (s[k] === '{') prof++;
    else if (s[k] === '}') { prof--; if (!prof) break; }
  }
  return s.slice(i, k + 1);
}

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + extra + ']' : '')); }
};

/* ---------- capa 1: las funciones REALES del panel, ejecutadas ---------- */
const CALC = ['esPorPeso', 'precioConDsc', 'subtotalItem', 'costoItem', 'fmtPeso', 'fmtCantidad'];
const F = eval('(function(){' + CALC.map(n => cuerpo(n)).join('\n') + '\nreturn {' + CALC.join(',') + '};})()');

/* Nueces: $18.000 el kilo, 250 gramos. El comercio cobra $4.500. */
const GRANEL = { id: 'nuez', nombre: 'Nueces', precio: 18000, costo: 12000, cantidad: 250, tipoVenta: 'peso' };
const SIN = { id: 'nuez', nombre: 'Nueces', precio: 18000, costo: 12000, cantidad: 250 };  /* el mismo item con el campo perdido */

console.log('\nLa cuenta real de admin.html, con el campo y sin el campo');
t('250 g a $18.000 el kilo son $4.500', F.subtotalItem(GRANEL) === 4500, F.subtotalItem(GRANEL));
t('sin tipoVenta la MISMA funcion da $4.500.000', F.subtotalItem(SIN) === 4500000, F.subtotalItem(SIN));
t('o sea exactamente x1000', F.subtotalItem(SIN) === F.subtotalItem(GRANEL) * 1000);
t('el costo tambien se va x1000 (el margen queda al reves)',
  F.costoItem(SIN) === F.costoItem(GRANEL) * 1000, F.costoItem(GRANEL) + ' -> ' + F.costoItem(SIN));
t('y la cantidad deja de mostrarse en gramos',
  F.fmtCantidad(GRANEL) === '250 g' && F.fmtCantidad(SIN) === '250',
  F.fmtCantidad(GRANEL) + ' -> ' + F.fmtCantidad(SIN));

/* ---------- capa 2: cada sitio que arma items tiene que llevar el campo ---------- */
/* Un item llega a la pantalla por dos caminos: nace del catalogo (push) o vuelve de
   un documento guardado (map). Los dos tienen que traer tipoVenta, porque el que
   guarda hace `i.tipoVenta || 'unidad'` y lo que no llegue se escribe como unidad. */
const SITIOS = [
  ['openEditVentaModal', 'ventaItems=(v.items||[]).map(', 'abrir una venta guardada para editarla'],
  ['convertirPedidoEnVentaDesdeModal', 'ventaItems=(p.items||[]).map(', 'pasar un pedido web a venta'],
  ['openPedidoModal', 'pedItems=(p.items||[]).map(', 'abrir un pedido guardado'],
  ['addPedItem', 'pedItems.push({', 'agregar un producto a un pedido desde el panel'],
  ['savePedidoDesdeModal', 'items:pedItems.map(', 'guardar el pedido (lo que queda en la base)'],
  ['openVentaMayModal', 'ventaMayItems=(v.items||[]).map(', 'abrir una venta mayorista guardada'],
];

/* Del cuerpo de la funcion, el pedazo que arma los items: desde la marca hasta que
   cierran los parentesis que abrio. Mirar la funcion entera daria falsos verdes,
   porque varias nombran tipoVenta en otro lado. */
function armadoDeItems(nombreFn, marca) {
  const b = cuerpo(nombreFn);
  const i = b.indexOf(marca);
  if (i < 0) throw new Error('no encontre "' + marca + '" en ' + nombreFn);
  let prof = 0, k;
  for (k = i + marca.length - 1; k < b.length; k++) {
    const c = b[k];
    if (c === '(' || c === '{') prof++;
    else if (c === ')' || c === '}') { prof--; if (prof <= 0) break; }
  }
  return b.slice(i, k + 1);
}

console.log('\nCada item que llega a la pantalla tiene que traer su tipoVenta');
for (const [fn, marca, qué] of SITIOS) {
  let frag = '';
  try { frag = armadoDeItems(fn, marca); } catch (e) { t(fn + ' - ' + qué, false, e.message); continue; }
  t(fn + '() - ' + qué, /tipoVenta/.test(frag), 'el map no nombra tipoVenta');
}

console.log('\nY el que ya lo hacia bien tiene que seguir haciendolo (no romper el merge)');
t('addVentaItem() - alta desde el mostrador', /tipoVenta/.test(cuerpo('addVentaItem')));
t('saveVenta() guarda tipoVenta en cada item', /tipoVenta:i\.tipoVenta\|\|'unidad'/.test(cuerpo('saveVenta')));

/* ---------- capa 3: la tienda tampoco puede multiplicar derecho ---------- */
/* app.js guarda un `subtotal` por item adentro del pedido. El total del pedido usa
   subtotalCarrito() y esta bien, pero ese subtotal por item se escribia como
   precio*cantidad: el renglon del ticket y de la factura A4 salen de ahi
   (buildEtiquetaFooter y buildFacturaA4Items leen it.subtotal), asi que el
   comprobante impreso mostraba el granel x1000 aunque el TOTAL estuviera bien. */
console.log('\nLa tienda guarda el subtotal de cada item del pedido');
const mapItems = (app.match(/items:carrito\.map\([^\n]*?\)\),/) || [''])[0];
t('encontre el map de items del checkout', mapItems.length > 0);
t('usa subtotalCarrito(i), que sabe de gramos', /subtotal:subtotalCarrito\(i\)/.test(mapItems),
  mapItems.slice(0, 200));
t('ya no multiplica derecho', !/subtotal:i\.precio\*i\.cantidad/.test(mapItems));
t('sigue guardando tipoVenta en el item', /tipoVenta:i\.tipoVenta\|\|'unidad'/.test(mapItems));

/* ---------- capa 4: el renglon del resumen del checkout, EJECUTADO ---------- */
/* Es la pantalla donde el cliente aprieta Confirmar. El carrito (renderCartItems) ya
   mostraba bien el granel, pero el resumen del checkout es OTRO render y quedo con
   precio*cantidad y con "x"+cantidad: el renglon decia $4.500.000 y "x250" justo
   arriba de un TOTAL de $4.500. Aca se corre el codigo real de app.js, no un regex. */
const MARCA = 'const itemsList = carrito.map(i => {';
const i0 = app.indexOf(MARCA);
const i1 = app.indexOf("}).join('');", i0);
const cuerpoRenglon = (i0 >= 0 && i1 > i0) ? app.slice(i0 + MARCA.length, i1) : null;

console.log('\nEl renglon del resumen del checkout, corrido de verdad');
t('encontre el render del resumen', cuerpoRenglon !== null);
if (cuerpoRenglon !== null) {
  const AYUDA = ['esPesoProd', 'fmtGramos', 'subtotalCarrito', 'formatPrice'].map(n => cuerpo(n, app)).join('\n');
  const ESC = 'function esc(s){return String(s==null?"":s).replace(/[&<>]/g,function(c){' +
              'return c==="&"?"&amp;":(c==="<"?"&lt;":"&gt;");});}';
  const renglon = eval('(function(){' + AYUDA + '\n' + ESC + '\nreturn function(i){' + cuerpoRenglon + '};})()');

  const hGranel = renglon({ nombre: 'Nueces', precio: 18000, cantidad: 250, tipoVenta: 'peso' });
  const hUnidad = renglon({ nombre: 'Yerba', precio: 1500, cantidad: 3, tipoVenta: 'unidad' });

  t('250 g de nueces cobra $4.500', hGranel.indexOf('$4.500<') >= 0, hGranel.replace(/<[^>]*>/g, '|'));
  t('y NO $4.500.000', hGranel.indexOf('4.500.000') < 0);
  t('la cantidad se lee "250 g", no "x250"', hGranel.indexOf('250 g') >= 0 && hGranel.indexOf('x250') < 0);
  t('3 unidades de yerba siguen siendo $4.500', hUnidad.indexOf('$4.500<') >= 0);
  t('y siguen mostrandose como x3', hUnidad.indexOf('x3') >= 0);
  t('el nombre del producto se escapa (entra por el Excel del proveedor)',
    renglon({ nombre: '<img src=x onerror=alert(1)>', precio: 100, cantidad: 1 }).indexOf('&lt;img') >= 0);
}

/* ---------- capa 5: el respaldo del ticket impreso ---------- */
/* buildEtiquetaFooter suma it.subtotal y, si falta, tenia precio*cantidad de respaldo.
   Ese respaldo es el que corre con cualquier documento guardado antes de esto. */
console.log('\nEl subtotal del ticket impreso');
t('el respaldo usa subtotalItem(it), no precio*cantidad',
  /it\.subtotal\|\|subtotalItem\(it\)\|\|0/.test(cuerpo('buildEtiquetaFooter')),
  'sigue con it.precio*it.cantidad');

/* ---------- capa 6: el resto de la familia x1000 ---------- */
/* La venta por peso se mergeo y quedo bien SOLO en el camino que se probo: el alta de
   una venta desde el mostrador. Todo lo demas -rehidratar, imprimir, listar, repetir,
   calcular margen- se habia escrito antes y multiplica precio por cantidad sin
   preguntar. Cada linea de aca es un lugar donde un granel salia x1000. */
const FAMILIA_ADMIN = [
  ['gananciaDe', 'esPorPeso(i)', 'la ganancia de la ficha del cliente y de las estadisticas'],
  ['setVentaItemDsc', 'subtotalItem(', 'tocar el % de descuento en un renglon de venta'],
  ['setPedItemDsc', 'subtotalItem(', 'tocar el % de descuento en un renglon de pedido'],
  ['setVentaMayItemDsc', 'subtotalItem(', 'tocar el % de descuento en un renglon mayorista'],
  ['renderPedItems', 'costoItem(i)', 'el costo total del pedido en el modal'],
  ['buildFacturaA4Items', 'fmtCantidad(i)', 'la columna Cant de la factura A4'],
  ['buildEtiquetaItems', 'fmtCantidad(it)', 'la cantidad en el ticket termico'],
  ['savePedidoDesdeModal', 'fmtCantidad(i)', 'la lista de items del aviso al guardar'],
];
console.log('\nEl resto de los lugares que multiplicaban derecho (panel)');
for (const [fn, debe, qué] of FAMILIA_ADMIN) {
  let b = '';
  try { b = cuerpo(fn); } catch (e) { t(fn + ' - ' + qué, false, e.message); continue; }
  t(fn + '() - ' + qué, b.indexOf(debe) >= 0, 'no encontre ' + debe);
}

console.log('\nY los dos de la tienda');
t('repetirPedido() rearma el carrito con tipoVenta del catalogo',
  /tipoVenta:\s*modoAhora/.test(cuerpo('repetirPedido', app)),
  'el carrito vuelve sin tipoVenta y el granel se cotiza x1000');
t('repetirPedido() omite el item si cambio la forma de venta',
  /cambio la forma de venta/.test(cuerpo('repetirPedido', app)));
t('_renderPedidosCliente() muestra los gramos como gramos',
  /esPesoProd\(i\)\s*\?\s*fmtGramos\(i\.cantidad\)/.test(cuerpo('_renderPedidosCliente', app)),
  'Mis Pedidos sigue diciendo x250 al lado de un granel');

/* Y que nadie vuelva a escribir la cuenta a mano: las dos formulas viven en UNA
   funcion por archivo, igual que dice el comentario de admin.html. */
console.log('\nLa formula sigue viviendo en un solo lugar por archivo');
t('en el panel, solo subtotalItem() y costoItem() dividen por 1000',
  (src.match(/cant\s*\/\s*1000|cantidad\s*\/\s*1000/g) || []).length <= 4,
  'aparecio otra division por 1000 suelta: ' + (src.match(/cant\s*\/\s*1000|cantidad\s*\/\s*1000/g) || []).join(' | '));
t('en la tienda, subtotalCarrito() es la unica',
  (app.match(/pr\s*\*\s*c\s*\/\s*1000/g) || []).length === 1);

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
