/* =============================================================================
   TICKET TÉRMICO  —  Brotes Dietética
   =============================================================================
   El comprobante que se le da al cliente después de cobrar. Esta primera parte
   es SOLO el documento: cómo se arma el papel. El diálogo de "¿imprimir?", la
   configuración y el reimprimir vienen después, encima de esto.

   DOS DECISIONES QUE EXPLICAN EL ARCHIVO:

   1) El ticket se arma con lo que quedó GUARDADO en la venta, nunca con los
      precios de hoy. Reimprimir en noviembre una venta de marzo tiene que dar
      el mismo papel que salió en marzo: el cliente lo tiene en la mano y el
      arqueo de aquel día se cerró con esos números. Por eso cada renglón usa su
      `subtotal` guardado y el pie usa el `total` guardado, y solo se calcula
      cuando el dato no está (ventas viejas, anteriores al campo).

   2) A GRANEL LA CANTIDAD ESTÁ EN GRAMOS Y EL PRECIO ES POR KILO. En el papel
      hay que mostrar kg y "/kg", que es como lo lee el cliente. Es la trampa del
      x1000: multiplicar precio por cantidad sin dividir da mil veces el importe
      —$8.207.500 en vez de $8.208— y sale impreso, que es donde más caro sale
      el error. Todo pasa por _tkCant() y _tkSubtotal(), nunca por una cuenta
      suelta.
   ============================================================================= */

/* El ancho manda el cuerpo de la letra y los márgenes: 58 mm es angosto de
   verdad y con la tipografía de 80 se corta el importe. */
const TICKET_ANCHOS = { '58': { mm: 58, fuente: 11, pad: 2 }, '80': { mm: 80, fuente: 12, pad: 3 } };

const TICKET_CFG_DEFAULTS = {
  ancho: '80',
  rollo: 'continuo',      /* continuo | corte */
  pie: '¡Gracias por su compra!',
  despuesDeVender: 'preguntar'   /* preguntar | directo | no */
};

function _tkEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const _tkPesos = n => '$' + Math.round(Number(n || 0)).toLocaleString('es-AR');

/* Si el item no dice cómo se vende, es por unidad: las ventas viejas no
   guardaban tipoVenta y suponer "peso" les dividiría el importe por mil. */
function _tkEsPeso(i) {
  if (i && i.tipoVenta) return i.tipoVenta === 'peso';
  if (typeof tipoVentaDe === 'function') return tipoVentaDe(i) === 'peso';
  return false;
}

/* La cantidad como la lee el cliente: 250 (gramos) -> "0,250 kg". Tres decimales
   fijos porque es lo que se pesa en el mostrador; las unidades van enteras. */
function _tkCant(i) {
  const c = Number((i && i.cantidad) || 0);
  if (!_tkEsPeso(i)) return c.toLocaleString('es-AR') + ' u';
  return (c / 1000).toLocaleString('es-AR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' kg';
}

/* El precio unitario lleva "/kg" a granel: sin eso el cliente lee $32.830 al
   lado de 0,250 kg y entiende que le cobraron de más. */
function _tkPrecioUnit(i) {
  const p = Number((i && i.precio) || 0);
  return _tkPesos(p) + (_tkEsPeso(i) ? '/kg' : '');
}

/* El subtotal GUARDADO manda. Solo se calcula si no está, y ahí sí con la
   división por mil de los de peso. */
function _tkSubtotal(i) {
  if (i && i.subtotal != null) return Number(i.subtotal);
  const p = Number((i && i.precio) || 0);
  const c = Number((i && i.cantidad) || 0);
  const d = Number((i && i.descuento) || 0);
  const unit = Math.round(p * (1 - d / 100));
  return _tkEsPeso(i) ? Math.round(unit * c / 1000) : unit * c;
}

/* El total guardado manda, por el mismo motivo que el subtotal. */
function _tkTotal(v) {
  if (v && v.total != null) return Number(v.total);
  return (v && Array.isArray(v.items) ? v.items : []).reduce((s, i) => s + _tkSubtotal(i), 0);
}

function _tkFechaHora(f) {
  const d = (f && f.seconds) ? new Date(f.seconds * 1000)
          : (f instanceof Date ? f : (f ? new Date(f) : new Date()));
  if (isNaN(d)) return '';
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function _tkNroVenta(v) {
  if (typeof NEGOCIO !== 'undefined' && NEGOCIO.nroVenta && (v.numero || v.nro)) return NEGOCIO.nroVenta(v.numero || v.nro);
  return '#' + String((v && (v.numero || v.nro)) || 0).padStart(4, '0');
}

function _tkNombreNegocio() {
  return (typeof NEGOCIO !== 'undefined' && NEGOCIO.nombre) ? NEGOCIO.nombre : 'Comprobante';
}

/* El vuelto solo tiene sentido en efectivo: en tarjeta o transferencia no hay
   plata sobre el mostrador, y un "Vuelto: $0" impreso confunde al cliente. */
function _tkEsEfectivo(v) {
  const k = (v && v.medioPagoKey) || '';
  if (k) return k === 'efectivo';
  return /^efec/i.test(String((v && v.medioPago) || ''));
}

/* Un renglón: el nombre arriba con la cantidad a la derecha, y debajo el precio
   unitario y el importe. Es lo que entra en 58 mm sin cortarse. */
function ticketRenglon(i) {
  return '<div class="tk-it">' +
    '<div class="tk-l1"><span class="tk-nom">' + _tkEsc((i && (i.nombre || i.nombreMostrado)) || '-') + '</span>' +
    '<span class="tk-cant">' + _tkEsc(_tkCant(i)) + '</span></div>' +
    '<div class="tk-l2"><span>' + _tkEsc(_tkPrecioUnit(i)) +
    ((Number((i && i.descuento) || 0) > 0) ? ' <b>-' + Number(i.descuento) + '%</b>' : '') +
    '</span><span>' + _tkPesos(_tkSubtotal(i)) + '</span></div>' +
    '</div>';
}

/* El documento entero, listo para abrir en una ventana e imprimir.
   `cfg` es lo de Configuración -> Impresión; sin nada usa los defaults. */
function ticketDocumento(venta, cfg) {
  const c = Object.assign({}, TICKET_CFG_DEFAULTS, cfg || {});
  const a = TICKET_ANCHOS[String(c.ancho)] || TICKET_ANCHOS['80'];
  const v = venta || {};
  const items = Array.isArray(v.items) ? v.items : [];
  const total = _tkTotal(v);

  /* Rollo continuo: una sola tira del alto que haga falta y un corte al final.
     Troquelado: una pagina por ticket. Mismo criterio que admin-etiquetas.js;
     mezclarlos hace que la guillotina corte en el medio del papel. */
  const page = (c.rollo === 'corte')
    ? '@page{size:' + a.mm + 'mm auto;margin:0}'
    : '@page{size:' + a.mm + 'mm auto;margin:0}';

  const sub = Number(v.subtotalProductos != null ? v.subtotalProductos : items.reduce((s, i) => s + _tkSubtotal(i), 0));
  const desc = Number(v.descuentoMonto || 0);
  const envio = Number(v.envio || 0);
  const pagoCon = Number(v.pagoCon || 0);

  let extra = '';
  if (desc > 0) extra += '<div class="tk-row"><span>Descuento' + (v.descuentoPct ? ' (' + v.descuentoPct + '%)' : '') + '</span><span>-' + _tkPesos(desc) + '</span></div>';
  if (envio > 0) extra += '<div class="tk-row"><span>Envío</span><span>' + _tkPesos(envio) + '</span></div>';

  let vuelto = '';
  if (_tkEsEfectivo(v) && pagoCon > total) {
    vuelto = '<div class="tk-row"><span>Paga con</span><span>' + _tkPesos(pagoCon) + '</span></div>' +
             '<div class="tk-row"><span>Vuelto</span><span>' + _tkPesos(pagoCon - total) + '</span></div>';
  }

  return '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">' +
    '<title>Ticket ' + _tkEsc(_tkNroVenta(v)) + '</title><style>' +
    page +
    'body{width:' + a.mm + 'mm;margin:0;padding:' + a.pad + 'mm;' +
    'font:' + a.fuente + 'px/1.35 ui-monospace,Consolas,"Courier New",monospace;color:#000;background:#fff}' +
    '.tk-cab{text-align:center;margin-bottom:4px}.tk-neg{font-weight:700;font-size:' + (a.fuente + 2) + 'px}' +
    '.tk-sep{border-top:1px dashed #000;margin:4px 0}' +
    '.tk-it{margin:2px 0}.tk-l1,.tk-l2,.tk-row{display:flex;justify-content:space-between;gap:4px}' +
    '.tk-nom{flex:1;word-break:break-word}.tk-cant{white-space:nowrap}' +
    '.tk-l2{color:#000;opacity:.85}' +
    '.tk-tot{display:flex;justify-content:space-between;font-weight:700;font-size:' + (a.fuente + 3) + 'px;margin-top:3px}' +
    '.tk-pie{text-align:center;margin-top:6px;white-space:pre-wrap}' +
    '</style></head><body>' +
    '<div class="tk-cab"><div class="tk-neg">' + _tkEsc(_tkNombreNegocio()) + '</div>' +
    '<div>' + _tkEsc(_tkNroVenta(v)) + ' · ' + _tkEsc(_tkFechaHora(v.fecha)) + '</div></div>' +
    '<div class="tk-sep"></div>' +
    items.map(ticketRenglon).join('') +
    '<div class="tk-sep"></div>' +
    ((desc > 0 || envio > 0) ? '<div class="tk-row"><span>Subtotal</span><span>' + _tkPesos(sub) + '</span></div>' + extra : '') +
    '<div class="tk-tot"><span>TOTAL</span><span>' + _tkPesos(total) + '</span></div>' +
    '<div class="tk-row"><span>' + _tkEsc(v.medioPago || 'Efectivo') + '</span><span></span></div>' +
    vuelto +
    (c.pie ? '<div class="tk-sep"></div><div class="tk-pie">' + _tkEsc(c.pie) + '</div>' : '') +
    '</body></html>';
}

window.ticketDocumento = ticketDocumento;
window.TICKET_CFG_DEFAULTS = TICKET_CFG_DEFAULTS;
