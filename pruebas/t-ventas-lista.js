/**
 * LA LISTA DE VENTAS CON OTRA CARA (pedido del comercio, 26/09/2026: "modernizar la
 * parte de ventas, que es muy básica y se ve rara").
 *
 * Las ventas van agrupadas por día, con lo cobrado ese día arriba; cada una en una fila
 * con la hora, el número, el cliente, etiquetas de color y los mismos botones de siempre.
 * Corre las funciones de verdad de admin.html (vtListaHtml, vtFilaHtml y lo que usan).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + JSON.stringify(extra).slice(0, 300) + ']' : '')); }
};
function cuerpo(n) {
  const i = html.indexOf('function ' + n + '(');
  if (i < 0) throw new Error('falta ' + n);
  let b = html.indexOf('{', i), prof = 0, k;
  for (k = b; k < html.length; k++) { if (html[k] === '{') prof++; else if (html[k] === '}') { prof--; if (!prof) break; } }
  return html.slice(i, k + 1);
}

const ctx = {
  console, Math, Number, String, Object, Array, Date, JSON,
  NEGOCIO: { nroVenta: n => '#' + String(n).padStart(6, '0') },
  esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
};
vm.createContext(ctx);
vm.runInContext(['hoyAR', 'esPorPeso', 'fmtPeso', 'fmtCantidad', 'precioConDsc', 'subtotalItem', 'netoVenta', 'keyDeMedio',
  'medioKeyDeVenta', 'nroVta'].map(cuerpo).join('\n') + '\n' + (html.match(/const _VT_MEDIOS=[^;]*;/) || [''])[0] +
  '\n' + (html.match(/const _vtOk=[^;]*;/) || [''])[0] +
  '\n' + ['_vtDiaTxt', 'vtListaHtml', 'vtFilaHtml'].map(cuerpo).join('\n') +
  '\nthis._VT_MEDIOS = _VT_MEDIOS;', ctx);

const hoy = new Date(); hoy.setHours(15, 5, 0, 0);
const ayer = new Date(hoy.getTime() - 86400000); ayer.setHours(9, 30, 0, 0);
const venta = (o) => Object.assign({ docId: 'V' + o.numero, cliente: 'Consumidor Final', medioPago: 'Efectivo', items: [] }, o);
const ventas = [
  venta({ numero: 42, fecha: hoy, total: 1000, items: [{ nombre: 'Alfajor', cantidad: 2, precio: 500, subtotal: 1000, tipoVenta: 'unidad' }] }),
  venta({ numero: 41, fecha: new Date(hoy.getTime() - 3600000), total: 2000, cliente: 'Ana <b>', medioPago: 'Cuenta Corriente',
    items: [{ nombre: 'Maní', cantidad: 250, precio: 8000, descuento: 10, subtotal: 1800, tipoVenta: 'peso' }] }),
  venta({ numero: 40, fecha: ayer, total: 5300, envio: 300, medioPago: 'Transferencia', origen: 'web', pedidoId: 'P1', tipoEntrega: 'envio' }),
  venta({ numero: 39, fecha: ayer, total: 700, medioPago: 'Cuenta Corriente', ccPagado: true }),
];

console.log('\n-- agrupada por día --');
{
  const h = ctx.vtListaHtml(ventas.slice(0, 3), ventas, v => ctx.vtFilaHtml(v, 'min'));
  const dias = h.match(/<div class="vt-dia">[\s\S]*?<\/div>/g) || [];
  t('un encabezado por día, en el orden de la lista', dias.length === 2 && dias[0].indexOf('Hoy · ') > 0 && dias[1].indexOf('Ayer · ') > 0, dias);
  t('  con cuántas ventas y lo cobrado ese día: hoy 2 ventas, $3.000', dias[0].indexOf('2 ventas · <b>$3.000</b>') > 0);
  t('  el total del día cuenta TODAS las filtradas, no solo las de esta página, y sin envíos como "Facturado": ayer 2 ventas, $5.700',
    dias[1].indexOf('2 ventas · <b>$5.700</b>') > 0, dias[1]);
  const rota = ctx.vtListaHtml([venta({ numero: 9, fecha: new Date('nada'), total: 10 })], [], v => ctx.vtFilaHtml(v, 'min'));
  t('una fecha rota va a "Sin fecha" en vez de romper la lista', rota.indexOf('Sin fecha') > 0 && rota.indexOf('<b>#000009</b>') > 0);
  t('los días que no son hoy ni ayer van con el nombre del día', /^[A-ZÁÉÍÓÚ][a-záéíóú]+ \d+ de [a-z]+$/.test(ctx._vtDiaTxt(new Date(2026, 8, 18))),
    ctx._vtDiaTxt(new Date(2026, 8, 18)));
}

console.log('\n-- la fila --');
{
  const f = ctx.vtFilaHtml(ventas[0], 'min');
  t('la hora en 24 horas y el número', f.indexOf('<b>15:05</b><span>#000042</span>') > 0, f.slice(0, 200));
  t('el medio de pago como etiqueta de color', f.indexOf('vt-chip efectivo') > 0 && f.indexOf('bi-cash') > 0);
  t('el total grande', f.indexOf('<div class="vt-fila-total">$1.000</div>') > 0);
  t('los botones de siempre: Editar, Factura, Ticket y Eliminar', f.indexOf("openEditVentaModal('V42')") > 0 && f.indexOf("showFactura('V42')") > 0 &&
    f.indexOf("reimprimirTicket('V42')") > 0 && f.indexOf("deleteVenta('V42',42)") > 0);
  t('tocar la fila despliega los productos, salvo en los botones', f.indexOf("if(!event.target.closest('.vt-fila-acc'))this.classList.toggle('abierta')") > 0 &&
    f.indexOf('<div class="vt-item"><span>Alfajor</span><span>2 u × $500 = <b>$1.000</b></span></div>') > 0);
  const fiado = ctx.vtFilaHtml(ventas[1], 'min');
  t('el cliente va escapado', fiado.indexOf('Ana &lt;b&gt;') > 0 && fiado.indexOf('Ana <b>') < 0);
  t('fiado sin cobrar, en rojo', fiado.indexOf('vt-chip debe') > 0 && fiado.indexOf('Fiado sin cobrar') > 0);
  t('  a granel: los gramos, el precio del kilo y el descuento', fiado.indexOf('250 g × $8.000 el kilo = <b>$1.800</b>') > 0 && fiado.indexOf('-10%') > 0);
  t('  y "1 producto" en singular', fiado.indexOf('1 producto ') > 0);
  const web = ctx.vtFilaHtml(ventas[2], 'min');
  t('la que vino de la tienda online y con envío lo dice', web.indexOf('Tienda online') > 0 && web.indexOf('vt-chip envio') > 0 && web.indexOf('vt-chip transferencia') > 0);
  t('fiado ya cobrado', ctx.vtFilaHtml(ventas[3], 'min').indexOf('Fiado cobrado') > 0);
  const may = ctx.vtFilaHtml(Object.assign({}, ventas[0], { id: 'M7', docId: undefined, descuentoPct: 15 }), 'may');
  t('la mayorista: la misma fila, con sus botones (Editar y Eliminar) y su descuento', may.indexOf('vt-fila may') > 0 &&
    may.indexOf("openVentaMayModal('M7')") > 0 && may.indexOf("deleteVentaMay('M7','000042')") > 0 && may.indexOf('showFactura') < 0 &&
    may.indexOf('-15%') > 0);
  t('  sin hora: se guarda a las 12:00 y no dice nada', may.indexOf('15:05') < 0 && may.indexOf('12:00') < 0 &&
    may.indexOf('<div class="vt-fila-hora"><b>#000042</b></div>') > 0);
  t('  el descuento va como número', ctx.vtFilaHtml(Object.assign({}, ventas[0], { id: 'M8', descuentoPct: '<b>x' }), 'may').indexOf('<b>x') < 0);
}

console.log('\n-- el panel --');
{
  const rv = cuerpo('renderVentas');
  t('la minorista usa la lista por día', rv.indexOf("vtListaHtml(shown,ventasFiltered,v=>vtFilaHtml(v,'min'))") > 0);
  t('  la mayorista, la misma fila (y la tarjeta vieja ya no está)', cuerpo('renderVentasMay').indexOf("vtFilaHtml(v,'may')") > 0 &&
    html.indexOf('function _ventaMayCardHtml(') < 0);
  t('la venta (minorista y mayorista) arranca en Retiro (pedido del dueño, 26/09)', cuerpo('openVentaModal').indexOf("ventaTipoEntrega='retiro';") > 0 &&
    cuerpo('openVentaMayModal').indexOf("ventaMayTipoEntrega='retiro';") > 0 && cuerpo('openVentaModal').indexOf("==='retiro'));") > 0);
  t('el buscador mayorista busca también por medio de pago', cuerpo('filterVentasMay').indexOf("(v.medioPago||'').toLowerCase().includes(q)") > 0);
  t('"Fiado sin cobrar" no cuenta lo ya cobrado', cuerpo('renderResumenVentas').indexOf('_esFiadoImpago(v)') > 0);
  t('un granel de dos bolsas cuenta como un producto (ticketPedidoLineas)', cuerpo('vtFilaHtml').indexOf("ticketPedidoLineas(v.items||[])") > 0);
  t('los estilos de ventas van DESPUÉS de los originales (antes perdían)', html.indexOf('=== VENTAS (26/09/2026)') > html.indexOf('.venta-items{max-height:200px') &&
    html.indexOf('=== VENTAS (26/09/2026)') > html.indexOf('.entrega-btn{flex:1'));
  t('los números de arriba conservan sus ids (los llena renderResumenVentas)', ['vtStatTotal', 'vtStatTotal$', 'vtStatEnvios', 'vtStatProm',
    'vtStatFiado', 'vtStatPeriodo', 'vtMayStatTotal', 'vtMayStatTotal$', 'vtMayStatProm', 'vtMayStatFiado', 'vtMayStatPeriodo']
    .every(id => html.split('id="' + id + '"').length === 2));
  t('  y el buscador sigue en un .search-box (el atajo "/" lo busca ahí)', /<div class="search-box campo-destacado"><i class="bi bi-search"><\/i><input type="text" placeholder="Buscar por cliente, número o medio de pago\.\.\." id="ventaSearch"/.test(html));
}

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
