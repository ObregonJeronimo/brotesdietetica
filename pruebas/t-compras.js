/**
 * LA CARGA DE COMPRAS A PROVEEDORES.
 *
 * Lo que tiene que salir bien si o si:
 *
 * 1. EL SUBTOTAL DE UN PRODUCTO POR PESO. El costo es POR KILO y la cantidad va
 *    en GRAMOS, igual que del lado de las ventas. Multiplicar derecho da MIL
 *    veces de mas, y ese numero se convierte en el costo del producto, que es lo
 *    que despues muestra Ganancia. Nadie lo notaria hasta cerrar el mes.
 *
 * 2. LOS COSTOS NO SE PISAN SOLOS. Solo se ofrecen los que de verdad cambiaron.
 *
 * Las funciones salen del fuente real.
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'admin-compras.js'), 'utf8');

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

const sub = new Function(cuerpo('_cpSubtotal') + '\nreturn _cpSubtotal;')();
const cant = new Function(cuerpo('_cpCant') + '\nreturn _cpCant;')();
const esPeso = new Function(cuerpo('_cpEsPeso') + '\nreturn _cpEsPeso;')();

let ok = 0, fail = 0;
const t = (d, c) => { if (c) { ok++; console.log('  OK   ' + d); } else { fail++; console.log('  FALLA ' + d); } };

console.log('\nEl subtotal de cada renglon');
t('unidades: 6 x $2.000 = $12.000',
  sub({ tipoVenta: 'unidad', cantidad: 6, costoUnitario: 2000 }) === 12000);
t('peso: 500 g a $14.000 el kilo = $7.000',
  sub({ tipoVenta: 'peso', cantidad: 500, costoUnitario: 14000 }) === 7000);
t('peso: 5 kg (5000 g) a $14.000 = $70.000',
  sub({ tipoVenta: 'peso', cantidad: 5000, costoUnitario: 14000 }) === 70000);
t('y NO da mil veces mas', sub({ tipoVenta: 'peso', cantidad: 500, costoUnitario: 14000 }) !== 7000000);
t('sin cantidad da 0', sub({ tipoVenta: 'peso', cantidad: 0, costoUnitario: 14000 }) === 0);
t('sin costo da 0', sub({ tipoVenta: 'unidad', cantidad: 3, costoUnitario: 0 }) === 0);
t('redondea a peso entero',
  Number.isInteger(sub({ tipoVenta: 'peso', cantidad: 333, costoUnitario: 14000 })));

console.log('\nComo se escribe la cantidad');
t('unidades', cant({ tipoVenta: 'unidad', cantidad: 6 }) === '6 u');
t('gramos', cant({ tipoVenta: 'peso', cantidad: 500 }) === '500 g');
t('pasa a kilos', cant({ tipoVenta: 'peso', cantidad: 5000 }) === '5 kg');
t('con decimales', cant({ tipoVenta: 'peso', cantidad: 1500 }) === '1,5 kg');

console.log('\nQue producto es por peso');
t('lo dice tipoVenta', esPeso({ tipoVenta: 'peso' }) === true);
t('ausente = unidad', esPeso({}) === false);
t('null no rompe', esPeso(null) === false);

/* El total de la compra es la suma de los renglones, cada uno con su propia
   cuenta. Una compra mixta es el caso normal en una dietetica. */
console.log('\nUna compra mixta');
const items = [
  { tipoVenta: 'peso',   cantidad: 5000, costoUnitario: 14000 },  /* 5 kg de nueces  = 70.000 */
  { tipoVenta: 'unidad', cantidad: 12,   costoUnitario: 1800 },   /* 12 paquetes     = 21.600 */
  { tipoVenta: 'peso',   cantidad: 250,  costoUnitario: 40000 },  /* 250 g almendras = 10.000 */
];
const total = items.reduce((s, i) => s + sub(i), 0);
t('el total suma 101.600', total === 101600);
t('y no lo domina el renglon por peso', sub(items[0]) === 70000);

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
