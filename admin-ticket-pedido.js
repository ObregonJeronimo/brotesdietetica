/* =============================================================================
   TICKET DEL PEDIDO  —  Brotes Dietética
   =============================================================================
   Pedido del comercio (26/09/2026): el papel que se le da al cliente cuando viene a
   retirar un pedido. Se imprime desde el pedido, con "Imprimir ticket del pedido".

   Sale por la misma impresora y con el mismo formato que el ticket de la venta
   (admin-ticket.js: el ancho de 58 u 80 mm y el pie de Configuración -> Impresión), y
   usa sus mismas piezas para la plata y los kilos. ticketDocumento no se tocó: el
   ticket de la venta sale igual que siempre.

   LO QUE LO HACE DISTINTO DEL DE LA VENTA:
   - Arriba: PEDIDO #00123, si es para retirar o con envío, y el cliente (nombre,
     teléfono y, con envío, la dirección), con la fecha en que se hizo el pedido.
   - Si el pedido YA SE COBRÓ (tiene su venta), los renglones y la plata salen de la
     venta, que es lo que de verdad se cobró, y dice con qué se pagó. Si todavía no,
     salen del pedido.
   - Un granel que salió de dos bolsas va en UNA línea: el pedido y la venta lo guardan
     en un renglón por bolsa (ver PENDIENTE.md, M, pendiente 4).
   - El precio de lista y el descuento se leen bien en los dos tipos de pedido: el de la
     tienda guarda en `precio` el precio YA descontado y el de lista en precioOriginal;
     el del panel guarda el de lista. Leer `precio` a secas en uno de la tienda
     mostraba "$800 -20%" cuando se cobró $800.
   - El cupón va en el pie con su código: sin él, Subtotal y TOTAL no cerraban.
   ============================================================================= */

const _tpEsc = s => (typeof _tkEsc === 'function' ? _tkEsc(s) : String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
const _tpPlata = n => (typeof _tkPesos === 'function' ? _tkPesos(n) : '$' + Math.round(Number(n || 0)).toLocaleString('es-AR'));

/* #00123, como en el tablero de pedidos. */
function _tpNro(p) {
  const n = (p && (p.numero || p.nro)) || 0;
  if (typeof NEGOCIO !== 'undefined' && NEGOCIO.nroPedido && n) return NEGOCIO.nroPedido(n);
  return '#' + String(n).padStart(5, '0');
}

/* El nombre del producto de un granel con bolsas, sin el tamaño de la bolsa: el
   cliente se llevó "Maní Pelado", no "Maní Pelado x 2 kg". */
function _tpNombreGrupo(i) {
  const prods = (typeof allProducts !== 'undefined' && Array.isArray(allProducts)) ? allProducts : [];
  const p = prods.find(x => x && x.id === i.id);
  if (p && typeof principalDeVariante === 'function' && typeof nombreDeGrupo === 'function') {
    const n = nombreDeGrupo(principalDeVariante(p, prods));
    if (n) return n;
  }
  return i.nombre || i.nombreMostrado || '-';
}

/* Los renglones del papel: los de un mismo granel (misma escala cobrada) en uno solo,
   con los gramos y la plata sumados de cada bolsa. */
function ticketPedidoLineas(items) {
  const out = [], porEscala = new Map();
  (items || []).forEach(i => {
    if (!i) return;
    const peso = typeof _tkEsPeso === 'function' ? _tkEsPeso(i) : i.tipoVenta === 'peso';
    if (!(i.escalaId && peso)) { out.push(i); return; }
    let g = porEscala.get(i.escalaId);
    if (!g) {
      g = Object.assign({}, i, { cantidad: 0, subtotal: 0, nombre: _tpNombreGrupo(i) });
      porEscala.set(i.escalaId, g);
      out.push(g);
    }
    g.cantidad += Number(i.cantidad || 0);
    g.subtotal += (typeof _tkSubtotal === 'function' ? _tkSubtotal(i) : Number(i.subtotal || 0));
  });
  return out;
}

/* Un renglón como el del ticket de la venta, pero con el precio de LISTA (el de la
   tienda viene en precioOriginal) y el descuento al lado. */
function _tpRenglon(i) {
  const lista = Object.assign({}, i, { precio: Number(i.precioOriginal != null ? i.precioOriginal : i.precio) || 0 });
  const unit = typeof _tkPrecioUnit === 'function' ? _tkPrecioUnit(lista) : _tpPlata(lista.precio);
  const cant = typeof _tkCant === 'function' ? _tkCant(i) : String(i.cantidad || 0);
  const sub = typeof _tkSubtotal === 'function' ? _tkSubtotal(i) : Number(i.subtotal || 0);
  return '<div class="tk-it">' +
    '<div class="tk-l1"><span class="tk-nom">' + _tpEsc(i.nombre || i.nombreMostrado || '-') + '</span>' +
    '<span class="tk-cant">' + _tpEsc(cant) + '</span></div>' +
    '<div class="tk-l2"><span>' + _tpEsc(unit) +
    (Number(i.descuento || 0) > 0 ? ' <b>-' + Number(i.descuento) + '%</b>' : '') +
    '</span><span>' + _tpPlata(sub) + '</span></div>' +
  '</div>';
}

const _tpFila = (a, b, clase) => '<div class="' + (clase || 'tk-row') + '"><span>' + a + '</span><span>' + b + '</span></div>';

/* El documento entero. `extra.venta`: la venta del pedido, si ya se cobró.
   `extra.ahora`: cuándo se imprime. */
function ticketPedidoDocumento(pedido, cfg, extra) {
  const c = Object.assign({}, (typeof TICKET_CFG_DEFAULTS !== 'undefined' ? TICKET_CFG_DEFAULTS : {}), cfg || {});
  const anchos = (typeof TICKET_ANCHOS !== 'undefined') ? TICKET_ANCHOS : { '80': { mm: 80, fuente: 12, pad: 3 } };
  const a = anchos[String(c.ancho)] || anchos['80'];
  const p = pedido || {};
  const x = extra || {};
  const venta = x.venta || null;
  /* Lo cobrado manda: si hay venta, sus renglones y su plata. */
  const base = venta || p;
  const items = ticketPedidoLineas(Array.isArray(base.items) ? base.items : []);
  const sumaItems = items.reduce((s, i) => s + (typeof _tkSubtotal === 'function' ? _tkSubtotal(i) : Number(i.subtotal || 0)), 0);
  const sub = Number(base.subtotalProductos != null ? base.subtotalProductos : sumaItems);
  /* La venta puede tener las dos cosas: el descuento general y el cupón del pedido, que se
     topea contra lo que queda después del descuento (calcularTotalesVenta, admin.html). */
  const desc = Number(base.descuentoMonto || 0);
  const cupon = (base.cupon && Number(base.cupon.monto) > 0) ? base.cupon : null;
  const cuponMonto = cupon ? Math.min(Number(cupon.monto), Math.max(0, sub - desc)) : 0;
  const conEnvio = (p.tipoEntrega || base.tipoEntrega) === 'envio';
  const envio = Number(base.envio || 0);
  const total = (base.total != null) ? Number(base.total) : Math.max(0, sub - desc - cuponMonto) + envio;
  const fecha = f => (typeof _tkFechaHora === 'function' ? _tkFechaHora(f) : String(f || ''));
  const nombreNeg = (typeof _tkNombreNegocio === 'function') ? _tkNombreNegocio()
    : ((typeof NEGOCIO !== 'undefined' && NEGOCIO.nombre) || 'Comprobante');
  const neg = (typeof NEGOCIO !== 'undefined') ? NEGOCIO : {};

  let plata = '';
  if (cupon || desc > 0 || conEnvio) plata += _tpFila('Subtotal', _tpPlata(sub));
  if (desc > 0) plata += _tpFila('Descuento' + (base.descuentoPct ? ' (' + base.descuentoPct + '%)' : ''), '-' + _tpPlata(desc));
  if (cupon) plata += _tpFila('Cupón ' + _tpEsc(cupon.codigo || ''), '-' + _tpPlata(cuponMonto));
  if (conEnvio) plata += _tpFila('Envío', envio > 0 ? _tpPlata(envio) : 'Gratis');

  let pago = '';
  if (venta) {
    pago = _tpFila('Pagado', _tpEsc(venta.medioPago || 'Efectivo')) +
      (venta.numero && typeof NEGOCIO !== 'undefined' && NEGOCIO.nroVenta ? _tpFila('Venta', _tpEsc(NEGOCIO.nroVenta(venta.numero))) : '');
  } else if (p.medioPago) {
    pago = _tpFila('Medio de pago', _tpEsc(p.medioPago));
  }

  const datos = [];
  if (p.cliente) datos.push(_tpFila('Cliente', _tpEsc(p.cliente), 'tk-dat'));
  if (p.telefono) datos.push(_tpFila('Teléfono', _tpEsc(p.telefono), 'tk-dat'));
  if (conEnvio && p.direccion) datos.push(_tpFila('Dirección', _tpEsc(p.direccion), 'tk-dat'));
  datos.push(_tpFila('Pedido del', _tpEsc(fecha(p.creadoEn || p.fecha)), 'tk-dat'));

  return '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">' +
    '<title>Ticket del pedido ' + _tpEsc(_tpNro(p)) + '</title><style>' +
    '@page{size:' + a.mm + 'mm auto;margin:0}' +
    'body{width:' + a.mm + 'mm;margin:0;padding:' + a.pad + 'mm;box-sizing:border-box;' +
    'font:' + a.fuente + 'px/1.35 ui-monospace,Consolas,"Courier New",monospace;color:#000;background:#fff}' +
    '.tk-cab{text-align:center;margin-bottom:4px}.tk-neg{font-weight:700;font-size:' + (a.fuente + 2) + 'px}' +
    '.tk-chico{font-size:' + (a.fuente - 1) + 'px}' +
    '.tk-ped{text-align:center;font-weight:700;font-size:' + (a.fuente + 6) + 'px;letter-spacing:1px;margin:2px 0}' +
    '.tk-modo{text-align:center;font-weight:700;border:1px solid #000;padding:2px 0;margin:2px 0 4px}' +
    '.tk-sep{border-top:1px dashed #000;margin:4px 0}' +
    '.tk-it{margin:2px 0}.tk-l1,.tk-l2,.tk-row,.tk-dat{display:flex;justify-content:space-between;gap:6px}' +
    '.tk-dat span:last-child{text-align:right;word-break:break-word}' +
    '.tk-nom{flex:1;word-break:break-word}.tk-cant{white-space:nowrap}' +
    '.tk-l2{opacity:.85}' +
    '.tk-tot{display:flex;justify-content:space-between;font-weight:700;font-size:' + (a.fuente + 3) + 'px;margin-top:3px}' +
    '.tk-nota{white-space:pre-wrap;word-break:break-word}' +
    '.tk-pie{text-align:center;margin-top:6px;white-space:pre-wrap}' +
    '</style></head><body>' +
    '<div class="tk-cab"><div class="tk-neg">' + _tpEsc(nombreNeg) + '</div>' +
      (neg.direccionCompleta ? '<div class="tk-chico">' + _tpEsc(neg.direccionCompleta) + '</div>' : '') +
      (neg.telefonoDisplay ? '<div class="tk-chico">Tel. ' + _tpEsc(neg.telefonoDisplay) + '</div>' : '') +
      '<div class="tk-chico">' + _tpEsc(fecha(x.ahora || new Date())) + '</div></div>' +
    '<div class="tk-sep"></div>' +
    '<div class="tk-ped">PEDIDO ' + _tpEsc(_tpNro(p)) + '</div>' +
    '<div class="tk-modo">' + (conEnvio ? 'ENVÍO A DOMICILIO' : 'RETIRO EN EL LOCAL') + '</div>' +
    datos.join('') +
    '<div class="tk-sep"></div>' +
    items.map(_tpRenglon).join('') +
    '<div class="tk-sep"></div>' +
    plata +
    '<div class="tk-tot"><span>TOTAL</span><span>' + _tpPlata(total) + '</span></div>' +
    pago +
    (p.notas ? '<div class="tk-sep"></div><div class="tk-nota">Notas: ' + _tpEsc(p.notas) + '</div>' : '') +
    (c.pie ? '<div class="tk-sep"></div><div class="tk-pie">' + _tpEsc(c.pie) + '</div>' : '') +
    '</body></html>';
}

/* La venta del pedido: la de la lista de Ventas si ya está cargada, y si no se lee
   (una lectura). Si no se puede, el ticket sale con lo del pedido. */
async function _tpVentaDe(ventaId) {
  if (!ventaId) return null;
  const enLista = (typeof ventasData !== 'undefined' && Array.isArray(ventasData)) ? ventasData.find(v => v.docId === ventaId) : null;
  if (enLista) return enLista;
  try {
    const snap = await db.collection('ventas').doc(ventaId).get();
    return snap.exists ? Object.assign({ docId: snap.id }, snap.data()) : null;
  } catch (e) {
    console.warn('ticket del pedido / venta:', e);
    return null;
  }
}

/* Como imprimirTicket (admin-ticket.js): una ventana aparte, el papel adentro y print(). */
function _tpImprimir(html) {
  const win = window.open('', '_blank', 'width=420,height=640');
  if (!win) {
    if (typeof showAdminToast === 'function') showAdminToast('El navegador bloqueó la ventana de impresión', 'error');
    return false;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(function () { win.print(); }, 350);
  return true;
}

/* El botón del pedido. Imprime lo GUARDADO: con cambios sin guardar pide guardar antes,
   igual que "Convertir a venta". */
async function imprimirTicketPedido(docId) {
  const toast = (m, t) => { if (typeof showAdminToast === 'function') showAdminToast(m, t); };
  const id = docId || (typeof editingPedidoId !== 'undefined' ? editingPedidoId : null);
  if (!id) { toast('Guardá el pedido antes de imprimir su ticket', 'info'); return false; }
  if (!docId && typeof pedidoDirty !== 'undefined' && pedidoDirty) {
    toast('El pedido tiene cambios sin guardar: guardalo y después imprimí el ticket', 'error');
    return false;
  }
  const p = (typeof pedidosData !== 'undefined' && Array.isArray(pedidosData)) ? pedidosData.find(x => x.docId === id) : null;
  if (!p) { toast('No se encontró ese pedido', 'error'); return false; }
  if (typeof loadTicketCfg === 'function') await loadTicketCfg();
  if (typeof ticketConfigurado === 'function' && !ticketConfigurado()) {
    const ir = typeof pedirConfirmacion === 'function' && await pedirConfirmacion(
      'Todavía no configuraste la impresora de tickets.\nSe configura una sola vez: el ancho del papel y qué dice el pie.',
      { titulo: 'Ticket del pedido', aceptar: 'Configurar', cancelar: 'Ahora no', icono: 'bi-printer' });
    if (ir) {
      /* La ventana del pedido tapaba Configuración: se cierra antes (ya se vio que no tiene
         cambios sin guardar). */
      if (typeof closePedidoModal === 'function') closePedidoModal();
      if (typeof irAConfigImpresion === 'function') irAConfigImpresion();
    }
    return false;
  }
  const venta = await _tpVentaDe(p.ventaId);
  const cfg = typeof ticketCfgActual === 'function' ? ticketCfgActual() : {};
  const hecho = _tpImprimir(ticketPedidoDocumento(p, cfg, { venta: venta, ahora: new Date() }));
  if (hecho && typeof logAction === 'function') {
    const base = venta || p;
    logAction('imprimir', 'Ticket del pedido ' + _tpNro(p),
      _tpPlata(base.total) + ' · ' + ((base.items || []).length) + ' items' + (venta ? ' · ya cobrado' : ''));
  }
  return hecho;
}

if (typeof window !== 'undefined') {
  window.imprimirTicketPedido = imprimirTicketPedido;
  window.ticketPedidoDocumento = ticketPedidoDocumento;
  window.ticketPedidoLineas = ticketPedidoLineas;
}
