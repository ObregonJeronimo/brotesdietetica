/**
 * EL PANEL DEL DIA EN ESTADISTICAS.
 *
 * Decia "Ventas: 1" y ahi terminaba: para saber QUE se habia vendido y como se
 * habia cobrado habia que salir a la seccion de ventas y buscarlo a mano.
 *
 * Ahora abre por tipo (minorista / mayorista), por medio de pago, y tiene un
 * boton que abre el mismo dialogo a detalle que usa la caja.
 *
 * La funcion sale del fuente real: si alguien la cambia, esto se entera.
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'admin-stats.js'), 'utf8');

function cuerpo(n) {
  const i = src.indexOf('function ' + n + '(');
  if (i < 0) throw new Error('no encontre ' + n + ' en admin-stats.js');
  let p = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') p++;
    else if (src[k] === '}') { p--; if (!p) break; }
  }
  return src.slice(i, k + 1);
}

const MEDIOS = src.match(/const _STATS_MEDIOS = \{[^}]*\};/)[0];
const _sp = n => '$' + Math.round(Number(n || 0)).toLocaleString('es-AR');
const _fila = (e, v) => '<div><span>' + e + '</span><span>' + v + '</span></div>';
const detalle = new Function('_sp', '_fila',
  MEDIOS + '\n' + cuerpo('_detalleVentasDelDia') + '\nreturn _detalleVentasDelDia;')(_sp, _fila);

let ok = 0, fail = 0;
const t = (d, c) => { if (c) { ok++; console.log('  OK   ' + d); } else { fail++; console.log('  FALLA ' + d); } };
const tiene = (h, s) => h.indexOf(s) >= 0;

console.log('\nUn dia con ventas de los dos tipos');
const x = {
  count: 3, local: 8000, online: 3000,
  porTipo: { minorista: { count: 2, total: 4000 }, mayorista: { count: 1, total: 7000 } },
  porMedio: { efectivo: 2500, tarjeta: 1500, transferencia: 7000 }
};
const h = detalle('2026-08-28', x);
t('abre minorista con su total', tiene(h, 'Minorista - 2 ventas') && tiene(h, '$4.000'));
t('abre mayorista con su total', tiene(h, 'Mayorista - 1 venta') && tiene(h, '$7.000'));
t('lista los tres medios', tiene(h, 'Efectivo') && tiene(h, 'Tarjeta') && tiene(h, 'Transferencia'));
t('ordena los medios de mayor a menor', h.indexOf('Transferencia') < h.indexOf('Efectivo'));
t('sigue mostrando mostrador y web', tiene(h, 'Mostrador') && tiene(h, 'Web'));
t('el boton dice cuantas son', tiene(h, 'Ver las 3 ventas'));
t('y lleva la fecha del dia', tiene(h, "statsVerVentasDelDia('2026-08-28')"));
t('las etiquetas div cierran', h.split('<div').length === h.split('</div>').length);

console.log('\nUn dia sin ventas');
const v = detalle('2026-08-29', { count: 0, local: 0, online: 0 });
t('no ofrece ver ventas', !tiene(v, 'Ver '));
t('no muestra medios de pago', !tiene(v, 'cobró'));
t('pero sigue mostrando mostrador y web', tiene(v, 'Mostrador') && tiene(v, 'Web'));

console.log('\nUna sola venta, de un solo tipo');
const u = detalle('2026-08-30', {
  count: 1, local: 500, online: 0,
  porTipo: { minorista: { count: 1, total: 500 }, mayorista: { count: 0, total: 0 } },
  porMedio: { efectivo: 500 }
});
t('el boton va en singular', tiene(u, 'Ver la venta'));
t('no inventa la fila del tipo que no hubo', !tiene(u, 'Mayorista'));

/* Un dia viejo, guardado antes de que existieran porTipo y porMedio, no puede
   romper la pantalla entera de Estadisticas. */
console.log('\nUn dia sin los campos nuevos');
const viejo = detalle('2026-08-31', { count: 2, local: 100, online: 0 });
t('no explota', typeof viejo === 'string' && viejo.length > 0);
t('y muestra el boton igual', tiene(viejo, 'Ver las 2 ventas'));

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
