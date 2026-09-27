/**
 * TICKET DEL PEDIDO (pedido del comercio, 26/09/2026).
 *
 * El papel que se le da al cliente cuando retira un pedido, con "Imprimir ticket del
 * pedido" en la ventana del pedido. Corre admin-ticket.js y admin-ticket-pedido.js de
 * verdad, con NEGOCIO y una ventana de impresión de mentira.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const html = leer('admin.html');

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + JSON.stringify(extra).slice(0, 300) + ']' : '')); }
};

/* Un pedido de la TIENDA: `precio` ya descontado y el de lista en precioOriginal; un
   granel que salió de dos bolsas (dos renglones con la misma escala cobrada); cupón. */
const pedidoWeb = () => ({
  docId: 'P1', numero: 123, estado: 'pendiente', origen: 'web',
  cliente: 'Ana <Pérez>', telefono: '351 555-1234', tipoEntrega: 'retiro', notas: 'Sin bolsa, por favor',
  creadoEn: new Date(2026, 8, 25, 18, 40),
  items: [
    { id: 'alf', nombre: 'Alfajor', tipoVenta: 'unidad', cantidad: 2, precio: 900, precioOriginal: 1000, descuento: 10, subtotal: 1800 },
    { id: 'm1', nombre: 'Maní Pelado', tipoVenta: 'peso', cantidad: 300, precio: 1600, precioOriginal: 1600, subtotal: 480, escalaId: 'm2', escala: '2 kg' },
    { id: 'm2', nombre: 'Maní Pelado x 2 kg', tipoVenta: 'peso', cantidad: 1700, precio: 1600, precioOriginal: 1600, subtotal: 2720, escalaId: 'm2', escala: '2 kg' },
  ],
  subtotalProductos: 5000, cupon: { codigo: 'BROTES10', monto: 500 }, envio: 0, total: 4500,
});

function armar(opts) {
  const o = opts || {};
  const impreso = [], avisos = [], preguntas = [], historial = [], lecturas = [], cerrados = [], secciones = [];
  const ctx = {
    console, Math, Number, String, Object, Array, Set, Map, Promise, Date, JSON, isNaN, parseInt,
    setTimeout: fn => { fn(); return 0; },
    NEGOCIO: { nombre: 'Brotes Dietética', direccionCompleta: 'Manuel de Falla, Córdoba', telefonoDisplay: '351 000-0000',
      nroPedido: n => '#' + String(n).padStart(5, '0'), nroVenta: n => '#' + String(n).padStart(6, '0') },
    allProducts: [
      { id: 'm1', nombre: 'Maní Pelado', tipoVenta: 'peso', gramaje: '1 kg' },
      { id: 'm2', nombre: 'Maní Pelado x 2 kg', tipoVenta: 'peso', gramaje: '2 kg', gramajePadreId: 'm1' },
    ],
    pedidosData: o.pedidos || [pedidoWeb()],
    editingPedidoId: o.editando === undefined ? 'P1' : o.editando,
    pedidoDirty: !!o.sucio,
    ventasData: o.ventasData || [],
    showAdminToast: (m, tp) => avisos.push((tp || 'info') + ': ' + m),
    pedirConfirmacion: async (m, op) => { preguntas.push(op.titulo + '|' + op.aceptar); return !!o.configurar; },
    closePedidoModal: () => { cerrados.push('pedido'); },
    logAction: (a, b, c) => historial.push(a + ' | ' + b + ' | ' + c),
    switchSection: s => { secciones.push(s); },
    document: { getElementById: () => null },
    db: { collection: col => ({ doc: id => ({
      get: async () => {
        lecturas.push(col + '/' + id);
        if (o.fallaLectura) throw new Error('sin conexión');
        if (col === 'config' && id === 'ticket') return { exists: !!o.configurado, data: () => ({ configurado: true, ancho: o.ancho || '80', pie: '¡Gracias por su compra!' }) };
        if (col === 'ventas' && o.ventaEnBase) return { exists: true, id: id, data: () => o.ventaEnBase };
        return { exists: false };
      },
    }) }) },
  };
  ctx.window = ctx;
  ctx.window.open = () => ({ document: { write: h => impreso.push(h), close() {} }, focus() {}, print() {} });
  vm.createContext(ctx);
  /* Los nombres de grupo de verdad (admin-variantes.js) y el ticket de la venta. */
  vm.runInContext(leer('admin-variantes.js'), ctx);
  vm.runInContext(leer('admin-ticket.js'), ctx);
  vm.runInContext(leer('admin-ticket-pedido.js'), ctx);
  return { ctx, impreso, avisos, preguntas, historial, lecturas, cerrados, secciones };
}

(async () => {
console.log('\n-- el papel --');
{
  const { ctx } = armar();
  const doc = ctx.ticketPedidoDocumento(pedidoWeb(), { ancho: '80', pie: '¡Gracias por su compra!' }, { ahora: new Date(2026, 8, 26, 10, 15) });
  t('arriba: el negocio, la dirección y el teléfono', doc.indexOf('Brotes Dietética') > 0 && doc.indexOf('Manuel de Falla, Córdoba') > 0 &&
    doc.indexOf('Tel. 351 000-0000') > 0);
  t('PEDIDO #00123 bien grande, y que es para retirar', doc.indexOf('PEDIDO #00123') > 0 && doc.indexOf('RETIRO EN EL LOCAL') > 0 &&
    doc.indexOf('ENVÍO A DOMICILIO') < 0);
  t('el cliente, escapado, con su teléfono y la fecha del pedido', doc.indexOf('Ana &lt;Pérez&gt;') > 0 && doc.indexOf('<Pérez>') < 0 &&
    doc.indexOf('351 555-1234') > 0 && doc.indexOf('25/09/2026') > 0);
  t('el precio de LISTA con el descuento al lado: $1.000 -10%, no $900 -10%', doc.indexOf('$1.000 <b>-10%</b>') > 0 &&
    doc.indexOf('$900 <b>-10%</b>') < 0 && doc.indexOf('$1.800') > 0);
  t('el granel de dos bolsas va en UNA línea, con el nombre del producto: Maní Pelado 2,000 kg $3.200',
    (doc.match(/class="tk-it"/g) || []).length === 2 && doc.indexOf('2,000 kg') > 0 && doc.indexOf('$3.200') > 0 &&
    doc.indexOf('x 2 kg') < 0, (doc.match(/class="tk-it"/g) || []).length);
  t('  a $1.600 el kilo', doc.indexOf('$1.600/kg') > 0);
  t('el cupón con su código, y el total guardado', doc.indexOf('Cupón BROTES10') > 0 && doc.indexOf('-$500') > 0 &&
    doc.indexOf('Subtotal') > 0 && doc.indexOf('$5.000') > 0 && /TOTAL<\/span><span>\$4\.500/.test(doc));
  t('las notas del cliente y el pie de Configuración', doc.indexOf('Notas: Sin bolsa, por favor') > 0 && doc.indexOf('¡Gracias por su compra!') > 0);
  t('sin venta todavía no dice que está pagado', doc.indexOf('Pagado') < 0);
  t('del ancho de papel configurado: 80 mm', doc.indexOf('80mm') > 0);
  const d58 = ctx.ticketPedidoDocumento(pedidoWeb(), { ancho: '58' });
  t('  o 58 mm', d58.indexOf('58mm') > 0 && d58.indexOf('80mm') < 0);
  const envio = ctx.ticketPedidoDocumento(Object.assign(pedidoWeb(), { tipoEntrega: 'envio', direccion: 'Av. Siempreviva 742', envio: 0, envioGratis: true }), {});
  t('con envío: lo dice, con la dirección y el envío gratis', envio.indexOf('ENVÍO A DOMICILIO') > 0 && envio.indexOf('Av. Siempreviva 742') > 0 &&
    /Envío<\/span><span>Gratis/.test(envio));
}
{
  /* Ya cobrado: los renglones y la plata salen de la VENTA, que es lo que se cobró. */
  const { ctx } = armar();
  const venta = { docId: 'V9', numero: 77, medioPago: 'Transferencia', total: 4000, subtotalProductos: 4500, descuentoMonto: 0,
    cupon: { codigo: 'BROTES10', monto: 500 },
    items: [{ id: 'alf', nombre: 'Alfajor', tipoVenta: 'unidad', cantidad: 5, precio: 900, descuento: 0, subtotal: 4500 }] };
  const doc = ctx.ticketPedidoDocumento(Object.assign(pedidoWeb(), { ventaId: 'V9' }), {}, { venta: venta });
  t('ya cobrado: dice con qué se pagó y el número de la venta', /Pagado<\/span><span>Transferencia/.test(doc) && doc.indexOf('#000077') > 0);
  t('  y los renglones y el total son los de la venta', doc.indexOf('5 u') > 0 && /TOTAL<\/span><span>\$4\.000/.test(doc) && doc.indexOf('2,000 kg') < 0);
  /* Revisión del 26/09: descuentoPct lo puede escribir el cliente en un pedido web. */
  const xss = ctx.ticketPedidoDocumento(Object.assign(pedidoWeb(), { descuentoMonto: 1, descuentoPct: '<img src=x onerror=alert(1)>' }), {});
  t('el descuento de un pedido web se usa como número: nunca entra texto al papel', xss.indexOf('<img') < 0 && xss.indexOf('onerror') < 0);
  const envioARetiro = ctx.ticketPedidoDocumento(Object.assign(pedidoWeb(), { tipoEntrega: 'envio', direccion: 'Calle 1' }), {},
    { venta: Object.assign({}, venta, { tipoEntrega: 'retiro', envio: 0 }) });
  t('ya cobrado como retiro, dice retiro aunque el pedido era con envío', envioARetiro.indexOf('RETIRO EN EL LOCAL') > 0 &&
    envioARetiro.indexOf('Calle 1') < 0 && envioARetiro.indexOf('Envío') < 0);
  const conDesc = ctx.ticketPedidoDocumento(pedidoWeb(), {}, { venta: Object.assign({}, venta, { descuentoMonto: 450, descuentoPct: 10 }) });
  t('  con descuento general Y cupón, van los dos', conDesc.indexOf('Descuento (10%)') > 0 && conDesc.indexOf('-$450') > 0 && conDesc.indexOf('Cupón BROTES10') > 0);
}

console.log('\n-- el botón --');
{
  const m = armar({ configurado: true });
  const hecho = await m.ctx.imprimirTicketPedido();
  t('imprime el pedido que está abierto', hecho === true && m.impreso.length === 1 && m.impreso[0].indexOf('PEDIDO #00123') > 0);
  t('  y queda en el historial', m.historial.length === 1 && m.historial[0].indexOf('imprimir | Ticket del pedido #00123 | $4.500') === 0, m.historial);
}
{
  const m = armar({ configurado: true, pedidos: [Object.assign(pedidoWeb(), { ventaId: 'V9' })],
    ventaEnBase: { numero: 77, medioPago: 'Débito', total: 4500, items: pedidoWeb().items } });
  await m.ctx.imprimirTicketPedido();
  t('si ya se cobró, lee su venta (una lectura) y dice con qué se pagó', m.lecturas.indexOf('ventas/V9') >= 0 &&
    /Pagado<\/span><span>Débito/.test(m.impreso[0] || ''));
  const m2 = armar({ configurado: true, pedidos: [Object.assign(pedidoWeb(), { ventaId: 'V9' })],
    ventasData: [{ docId: 'V9', numero: 78, medioPago: 'Efectivo', total: 4500, items: pedidoWeb().items }] });
  await m2.ctx.imprimirTicketPedido();
  t('  con la lista de Ventas cargada no lee nada', m2.lecturas.indexOf('ventas/V9') < 0 && /Pagado<\/span><span>Efectivo/.test(m2.impreso[0] || ''));
}
{
  const m = armar({ configurado: false });
  const hecho = await m.ctx.imprimirTicketPedido();
  t('sin la impresora configurada no imprime: ofrece configurarla, como el ticket de la venta', hecho === false && m.impreso.length === 0 &&
    m.preguntas[0] === 'Ticket del pedido|Configurar');
  const cfg = armar({ configurado: false, configurar: true });
  await cfg.ctx.imprimirTicketPedido();
  t('  y al elegir Configurar cierra el pedido (lo tapaba) y va a Configuración', cfg.cerrados.join() === 'pedido' &&
    cfg.secciones.join() === 'config' && cfg.impreso.length === 0);
  const s = armar({ configurado: true, sucio: true });
  t('con cambios sin guardar pide guardar antes', (await s.ctx.imprimirTicketPedido()) === false && s.impreso.length === 0 &&
    s.avisos.some(a => a.indexOf('cambios sin guardar') > 0));
  /* Revisión del 26/09: cambiar el cliente o el medio de pago no marcaba pedidoDirty. */
  const panel = Object.assign(pedidoWeb(), { origen: undefined, clienteId: 'c1', medioPago: 'Efectivo' });
  const cm = armar({ configurado: true, pedidos: [panel] });
  cm.ctx.document = { getElementById: id => ({ pedClienteId: { value: 'c1' }, pedMedio: { value: 'Transferencia' } })[id] || null };
  t('cambiar el medio de pago sin guardar también pide guardar', (await cm.ctx.imprimirTicketPedido()) === false && cm.impreso.length === 0);
  const dc = armar({ configurado: true });
  await Promise.all([dc.ctx.imprimirTicketPedido(), dc.ctx.imprimirTicketPedido()]);
  t('un doble clic imprime UN ticket', dc.impreso.length === 1 && dc.historial.length === 1, dc.impreso.length);
  const n = armar({ configurado: true, editando: null });
  t('un pedido nuevo (sin guardar) no se puede imprimir', (await n.ctx.imprimirTicketPedido()) === false && n.impreso.length === 0);
}

console.log('\n-- el panel --');
{
  t('el botón está en el pie del pedido, escondido de entrada',
    /<div class="venta-pie">\s*<div class="form-actions"[^>]*>[\s\S]{0,400}id="imprimirPedidoBtn" style="display:none" onclick="imprimirTicketPedido\(\)"/.test(html) &&
    html.split('id="imprimirPedidoBtn"').length === 2);
  t('  y dice "Imprimir ticket del pedido"', /id="imprimirPedidoBtn"[^>]*>[^<]*<i class="bi bi-printer"><\/i> Imprimir ticket del pedido</.test(html));
  const i = html.indexOf('function openPedidoModal(');
  const cuerpo = html.slice(i, html.indexOf('document.getElementById(\'pedidoModal\').classList.add(\'show\')', i));
  t('  se muestra en un pedido guardado y se esconde en uno nuevo', (cuerpo.match(/_tpBtn\.style\.display='inline-flex'/g) || []).length === 1 &&
    (cuerpo.match(/_tpBtn\.style\.display='none'/g) || []).length === 1);
  t('el módulo carga después del ticket de la venta (usa sus piezas)',
    html.indexOf('<script src="admin-ticket-pedido.js">') > html.indexOf('<script src="admin-ticket.js">') && html.indexOf('<script src="admin-ticket.js">') > 0);
  t('el ticket de la venta no se tocó: ticketDocumento sigue igual', leer('admin-ticket.js').indexOf('ticketPedido') < 0);
}

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
