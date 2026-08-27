/**
 * LAS ESTADISTICAS SE OLVIDABAN DE LOS PEDIDOS ENTREGADOS.
 *
 * `totalesMes` contaba asi:
 *     if (p.estado === 'confirmado') t.pedidosConfirmados++;
 *     else if (p.estado === 'cancelado') t.pedidosCancelados++;
 *
 * 'cancelado' no lo escribe ningun flujo del panel: es una rama muerta e inofensiva.
 * El que si se escribe -y es el estado FINAL normal de un pedido que se cumplio- es
 * 'entregado', y estaba afuera de las dos ramas. Resultado: cada pedido entregado se
 * caia del contador de confirmados, y la tarjeta "Tienda online" lo mostraba en
 * "Sin resolver", en amarillo (renderOnline hace recibidos - confirmados - cancelados).
 *
 * O sea: cuanto MEJOR trabaja el negocio -mas pedidos entregados- peor se ve la
 * conversion. Un mes con todo entregado mostraba 0%.
 *
 * Se ejecutan totalesMes y renderOnline reales de admin-stats.js.
 */
const fs = require('fs');
const src = fs.readFileSync('admin-stats.js', 'utf8');

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

const FUNCIONES = ['totalesMes', 'renderOnline', 'renderTopProductos', '_cantTop', '_card', '_fila']
  .map(cuerpo).join('\n');

const ent = {
  medioKeyDeVenta: v => 'efectivo',
  _sp: n => '$' + Number(n || 0).toLocaleString('es-AR'),
  /* renderTopProductos escapa el nombre del producto: los nombres entran por el Excel
     del proveedor, que no lo escribe el comercio. */
  esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
};
const nombres = Object.keys(ent);
const api = new Function(...nombres, FUNCIONES +
  '\nreturn {totalesMes:totalesMes,renderOnline:renderOnline,renderTopProductos:renderTopProductos};'
)(...nombres.map(n => ent[n]));

/* Un mes de trabajo normal: 4 pedidos web, todos resueltos. Uno recien confirmado
   (lo facturaron hoy) y tres ya entregados. */
const MES = {
  ventas: [
    { _neto: 6900, _online: true, envio: 2000, descuentoMonto: 0, items: [], medioPago: 'Efectivo' },
    { _neto: 5000, _online: true, envio: 0, descuentoMonto: 0, items: [], medioPago: 'Efectivo' },
    { _neto: 4000, _online: true, envio: 2000, descuentoMonto: 0, items: [], medioPago: 'Efectivo' },
    { _neto: 3000, _online: true, envio: 0, descuentoMonto: 0, items: [], medioPago: 'Efectivo' },
  ],
  pedidos: [
    { estado: 'confirmado' },
    { estado: 'entregado' },
    { estado: 'entregado' },
    { estado: 'entregado' },
  ],
  porDia: {},
};

console.log('\nUN MES CON TODO RESUELTO: 1 confirmado + 3 entregados');
const tot = api.totalesMes(MES);
t('cuenta los 4 como resueltos', tot.pedidosConfirmados === 4, tot.pedidosConfirmados);
t('   (antes contaba 1 y los otros 3 se perdian)', tot.pedidosConfirmados !== 1);
t('la conversion es 100%', Math.round(tot.conversion) === 100, tot.conversion.toFixed(1) + '%');
t('recibidos sigue siendo 4', tot.pedidosRecibidos === 4);
t('cancelados sigue en 0', tot.pedidosCancelados === 0);

console.log('\nLa tarjeta "Tienda online" que ve el comercio');
const html = api.renderOnline(tot);
t('no queda ninguno en "Sin resolver"', /Sin resolver[\s\S]{0,200}?>0</.test(html), html.replace(/\s+/g, ' ').slice(0, 400));
t('no pinta de amarillo lo que ya se entrego', !/EDB833/.test(html));
t('muestra 100% de conversion', /100%/.test(html));

console.log('\nUn mes de verdad a medias: 2 entregados, 1 confirmado, 2 sin tocar');
const mixto = Object.assign({}, MES, { pedidos: [
  { estado: 'entregado' }, { estado: 'entregado' }, { estado: 'confirmado' },
  { estado: 'pendiente' }, { estado: 'pendiente' },
] });
const t2 = api.totalesMes(mixto);
t('resueltos = 3', t2.pedidosConfirmados === 3, t2.pedidosConfirmados);
t('sin resolver = 2, que son los pendientes de verdad',
  (t2.pedidosRecibidos - t2.pedidosConfirmados - t2.pedidosCancelados) === 2);
t('conversion 60%', Math.round(t2.conversion) === 60, t2.conversion.toFixed(1) + '%');

console.log('\nLa rama de cancelado sigue funcionando si alguna vez se escribe');
const conCancel = Object.assign({}, MES, { pedidos: [
  { estado: 'entregado' }, { estado: 'cancelado' },
] });
const t3 = api.totalesMes(conCancel);
t('el entregado cuenta como resuelto', t3.pedidosConfirmados === 1, t3.pedidosConfirmados);
t('el cancelado cuenta como cancelado, no como resuelto', t3.pedidosCancelados === 1);
t('y no se pisan entre si', t3.pedidosConfirmados + t3.pedidosCancelados === 2);

console.log('\nEL RANKING NO PUEDE SUMAR GRAMOS Y UNIDADES');
/* Un producto a granel vende GRAMOS y uno normal UNIDADES. El contador los sumaba en la
   misma columna, asi que 300 g de nueces figuraban como "300u" arriba de un producto que
   se vendio de a 2 por mucha mas plata. El ORDEN siempre fue por monto y estaba bien: lo
   unico mal era como se decia la cantidad. */
const mesGranel = {
  ventas: [{ _neto: 28200, _online: true, envio: 0, descuentoMonto: 0, medioPago: 'Efectivo', items: [
    { nombre: 'Nueces mariposa', cantidad: 300, tipoVenta: 'peso', subtotal: 5400 },
    { nombre: 'Producto de ejemplo', cantidad: 2, tipoVenta: 'unidad', subtotal: 22800 },
    { nombre: 'Almendras', cantidad: 1500, tipoVenta: 'peso', subtotal: 3000 },
  ] }],
  pedidos: [], porDia: {},
};
const tg = api.totalesMes(mesGranel);
t('el granel cuenta GRAMOS y no unidades',
  tg.productos['Nueces mariposa'].gramos === 300 && tg.productos['Nueces mariposa'].unidades === 0,
  JSON.stringify(tg.productos['Nueces mariposa']));
t('el de unidad cuenta UNIDADES y no gramos',
  tg.productos['Producto de ejemplo'].unidades === 2 && tg.productos['Producto de ejemplo'].gramos === 0,
  JSON.stringify(tg.productos['Producto de ejemplo']));

const top = api.renderTopProductos(tg);
t('el ranking dice "300 g", NO "300u"', /300 g/.test(top) && !/300u/.test(top),
  top.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 180));
t('1.500 g se dicen como "1,5 kg"', /1,5 kg/.test(top));
t('y lo que se vende por unidad sigue diciendo "2u"', /2u/.test(top));
t('el orden sigue siendo por monto, no por el numero de la cantidad',
  top.indexOf('Producto de ejemplo') < top.indexOf('Nueces mariposa'),
  'ejemplo=' + top.indexOf('Producto de ejemplo') + ' nueces=' + top.indexOf('Nueces mariposa'));

console.log('\nUn producto viejo sin tipoVenta se cuenta como unidad');
const tv = api.totalesMes({ ventas: [{ _neto: 1000, _online: false, envio: 0, descuentoMonto: 0,
  medioPago: 'Efectivo', items: [{ nombre: 'Yerba', cantidad: 3, subtotal: 1000 }] }],
  pedidos: [], porDia: {} });
t('sin tipoVenta va a unidades', tv.productos['Yerba'].unidades === 3 && tv.productos['Yerba'].gramos === 0,
  JSON.stringify(tv.productos['Yerba']));

console.log('\nSin pedidos no se divide por cero');
const t4 = api.totalesMes({ ventas: [], pedidos: [], porDia: {} });
t('conversion 0 y no NaN', t4.conversion === 0, t4.conversion);

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
