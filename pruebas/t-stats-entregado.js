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

const FUNCIONES = ['totalesMes', 'renderOnline', '_card', '_fila'].map(cuerpo).join('\n');

const ent = {
  medioKeyDeVenta: v => 'efectivo',
  _sp: n => '$' + Number(n || 0).toLocaleString('es-AR'),
};
const nombres = Object.keys(ent);
const api = new Function(...nombres, FUNCIONES +
  '\nreturn {totalesMes:totalesMes,renderOnline:renderOnline};')(...nombres.map(n => ent[n]));

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

console.log('\nSin pedidos no se divide por cero');
const t4 = api.totalesMes({ ventas: [], pedidos: [], porDia: {} });
t('conversion 0 y no NaN', t4.conversion === 0, t4.conversion);

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
