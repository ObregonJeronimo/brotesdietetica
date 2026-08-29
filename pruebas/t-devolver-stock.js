/**
 * BORRAR UNA COMPRA NO PUEDE DEJAR EL STOCK EN NEGATIVO.
 *
 * Paso en produccion: entraron 2 Hornitos de Yeso con una compra, se vendio 1,
 * se borro la compra y el producto quedo en stock -1.
 *
 * El motivo era un increment(-cantidad) a ciegas: restaba TODO lo que la compra
 * habia sumado, sin mirar si parte de eso ya se habia vendido. Un stock negativo
 * no es solo un numero feo -los avisos de stock bajo se vuelven locos y el
 * inventario deja de servir para saber que hay que pedir-.
 *
 * El piso es 0. Cuando se toca el piso, el inventario NO coincide con la resta
 * exacta, y eso hay que decirlo: por eso se avisa antes de confirmar y despues
 * de borrar.
 */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(RAIZ, 'admin-compras.js'), 'utf8');

function cuerpo(n) {
  const i = src.indexOf('function ' + n + '(');
  if (i < 0) throw new Error('no encontre ' + n + ' en admin-compras.js');
  let p = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') p++;
    else if (src[k] === '}') { p--; if (!p) break; }
  }
  return src.slice(i, k + 1);
}

let ok = 0, fail = 0;
const t = (d, c) => { if (c) { ok++; console.log('  OK   ' + d); } else { fail++; console.log('  FALLA ' + d); } };

const stock = new Function(cuerpo('_cpStockTrasDevolver') + '\nreturn _cpStockTrasDevolver;')();

/* --------------------------------------------------------- el caso que paso */
t('el caso real: habia 1, la compra sumo 2 -> queda 0, no -1', stock(1, 2) === 0);

/* --------------------------------------------------------------- lo normal */
t('nada vendido: habia 2, se devuelven 2 -> 0', stock(2, 2) === 0);
t('habia 10, se devuelven 3 -> 7', stock(10, 3) === 7);
t('se vendio todo: habia 0, se devuelven 2 -> 0', stock(0, 2) === 0);
t('no toca lo que no compro: habia 5, se devuelve 0 -> 5', stock(5, 0) === 5);

/* -------------------------------------------------------------- los bordes */
t('sin stock cargado (undefined) -> 0', stock(undefined, 2) === 0);
t('sin cantidad (undefined) no cambia nada', stock(7, undefined) === 7);
t('stock nulo -> 0', stock(null, 1) === 0);
t('gramos: habia 500, entraron 1000 -> 0 y no -500', stock(500, 1000) === 0);
t('gramos: habia 1500, se devuelven 1000 -> 500', stock(1500, 1000) === 500);
t('numeros como texto igual dan bien', stock('10', '4') === 6);

/* nunca, bajo ninguna combinacion, un negativo */
let negativos = 0;
for (let a = 0; a <= 40; a++) {
  for (let q = 0; q <= 40; q++) if (stock(a, q) < 0) negativos++;
}
t('ninguna de las 1681 combinaciones da negativo', negativos === 0);

/* ------------------------------------------------- que no vuelva el a ciegas
   El increment(-...) es exactamente lo que causo el -1. Si alguien lo reescribe
   asi porque es mas corto, esto lo frena. */
const bloque = src.slice(src.indexOf('async function borrarCompra('));
/* Se busca la forma REAL del codigo. Con 'increment(-' a secas la prueba se
   matcheaba con el comentario de arriba, que justamente explica por que se saco:
   quedaba en rojo con el arreglo ya puesto. */
t('borrarCompra ya no resta a ciegas con increment', bloque.indexOf('FieldValue.increment(-') < 0);
t('borrarCompra lee el stock real y usa el piso', bloque.indexOf('_cpStockTrasDevolver(') > 0);
t('la devolucion va en una transaccion', bloque.indexOf('runTransaction') > 0);

/* --------------------------------------------------------------- el aviso */
const aviso = new Function(
  'var allProducts;' + cuerpo('_cpAvisoVendidos') +
  '\nreturn function(c, d, prods){ allProducts = prods; return _cpAvisoVendidos(c, d); };')();

const compra = { items: [{ id: 'a', nombre: 'Hornito De Yeso', cantidad: 2 },
                         { id: 'b', nombre: 'Mix Clasico', cantidad: 3 }] };

t('avisa cuando de un producto ya se vendio parte',
  aviso(compra, true, [{ id: 'a', stock: 1 }, { id: 'b', stock: 3 }]).indexOf('Hornito De Yeso') > 0);
t('no nombra al que si alcanza',
  aviso(compra, true, [{ id: 'a', stock: 1 }, { id: 'b', stock: 3 }]).indexOf('Mix Clasico') < 0);
t('no avisa nada si alcanza para todos',
  aviso(compra, true, [{ id: 'a', stock: 2 }, { id: 'b', stock: 3 }]) === '');
t('no avisa si la compra nunca sumo stock',
  aviso(compra, false, [{ id: 'a', stock: 0 }, { id: 'b', stock: 0 }]) === '');
t('avisa por los dos cuando faltan los dos',
  ['Hornito De Yeso', 'Mix Clasico'].every(n =>
    aviso(compra, true, [{ id: 'a', stock: 0 }, { id: 'b', stock: 0 }]).indexOf(n) > 0));
t('el aviso dice que va a quedar en 0',
  aviso(compra, true, [{ id: 'a', stock: 0 }, { id: 'b', stock: 3 }]).indexOf('en 0') > 0);

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
