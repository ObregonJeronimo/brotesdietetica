/**
 * LA PANTALLA DE PROVEEDORES.
 *
 * Cruza las ventas con el catalogo para decir que deja cada proveedor. Dos cosas
 * que tienen que salir bien si o si:
 *
 * 1. EL ORDEN VA POR FACTURACION, NUNCA POR CANTIDAD. Un producto por peso vende
 *    GRAMOS y uno normal UNIDADES. Ordenando por cantidad, 500 g de nueces (500)
 *    le gana a un producto que se vendio de a 2 por 250 a 1, y el top sale al
 *    reves de la realidad. Son 202 productos por peso sobre 636.
 *
 * 2. EL MONTO SALE DE `subtotal`, NO DE precio x cantidad. En un producto por
 *    peso el precio es POR KILO: multiplicarlo por los gramos da mil veces de mas.
 *
 * Las funciones salen del fuente real: si alguien las cambia, esto se entera.
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'admin-proveedores.js'), 'utf8');

function cuerpo(n) {
  const i = src.indexOf('function ' + n + '(');
  if (i < 0) throw new Error('no encontre ' + n + ' en admin-proveedores.js');
  let p = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') p++;
    else if (src[k] === '}') { p--; if (!p) break; }
  }
  return src.slice(i, k + 1);
}

const hacerAgrupar = new Function('allProducts', cuerpo('_provAgrupar') + '\nreturn _provAgrupar;');
const cant = new Function(cuerpo('_provCant') + '\nreturn _provCant;')();

let ok = 0, fail = 0;
const t = (d, c) => { if (c) { ok++; console.log('  OK   ' + d); } else { fail++; console.log('  FALLA ' + d); } };

const PRODS = [
  { id: 'p1', nombre: 'Nueces',   lista: 'L1', tipoVenta: 'peso' },
  { id: 'p2', nombre: 'Galletas', lista: 'L1', tipoVenta: 'unidad' },
  { id: 'p3', nombre: 'Yerba',    lista: 'L2', tipoVenta: 'unidad' },
];
const agrupar = hacerAgrupar(PRODS);

console.log('\nCruce de ventas contra el catalogo');
const r = agrupar({ ventas: [
  { items: [ { id: 'p1', nombre: 'Nueces', cantidad: 300, tipoVenta: 'peso', subtotal: 4200 },
             { id: 'p2', nombre: 'Galletas', cantidad: 2, subtotal: 30000 } ] },
  { items: [ { id: 'p1', nombre: 'Nueces', cantidad: 200, tipoVenta: 'peso', subtotal: 2800 } ] },
  { items: [ { id: 'p3', nombre: 'Yerba', cantidad: 1, subtotal: 5000 } ] },
  { items: [ { id: 'BORRADO', nombre: 'Uno que ya no existe', cantidad: 1, subtotal: 900 } ] },
] });

t('separa por proveedor', Object.keys(r).sort().join(',') === 'L1,L2,__sin__');
t('suma la facturacion de cada uno', r.L1.facturado === 37000 && r.L2.facturado === 5000);
t('cuenta en cuantas VENTAS aparecio, no items', r.L1.ventas === 2);
t('un producto borrado no desaparece de los totales', r.__sin__.facturado === 900);

console.log('\nEl orden del top');
const top = Object.values(r.L1.productos).sort((a, b) => b.monto - a.monto);
t('primero el que mas factura', top[0].nombre === 'Galletas' && top[0].monto === 30000);
t('aunque haya vendido MENOS cantidad que el otro', top[0].unidades === 2 && top[1].gramos === 500);
t('gramos y unidades no se mezclan', top[1].unidades === 0 && top[0].gramos === 0);
t('el monto sale de subtotal, no de precio x cantidad', top[1].monto === 7000);

console.log('\nEl tipo de venta se toma del catalogo si el item no lo trae');
const r2 = agrupar({ ventas: [ { items: [ { id: 'p1', nombre: 'Nueces', cantidad: 250, subtotal: 3500 } ] } ] });
t('sin tipoVenta en el item, igual cuenta gramos', Object.values(r2.L1.productos)[0].gramos === 250);

console.log('\nUna venta sin items no rompe nada');
const r3 = agrupar({ ventas: [ { items: [] }, { } ] });
t('no explota', typeof r3 === 'object');
t('y no inventa proveedores', Object.keys(r3).length === 0);

console.log('\nComo se escribe la cantidad');
t('gramos', cant({ gramos: 300, unidades: 0 }) === '300 g');
t('pasa a kilos', cant({ gramos: 1500, unidades: 0 }) === '1,5 kg');
t('unidades', cant({ gramos: 0, unidades: 3 }) === '3 u');
t('los dos, separados', cant({ gramos: 500, unidades: 2 }).indexOf('+') > 0);
t('sin datos', cant({}) === '-');

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
