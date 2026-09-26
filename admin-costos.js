/* =============================================================================
   COSTOS DESACTUALIZADOS  —  Brotes Dietética
   =============================================================================
   Pedido del comercio (24/09/2026): si el costo de un producto no se tocó hace un
   mes o más, al registrar una venta aparece un aviso con esos productos y la fecha
   de su último cambio, con dos salidas: "Modificar costos" o "Ignorar advertencia y
   vender de todas formas".

   DE DÓNDE SALE LA FECHA: costoActualizadoEn, en cada producto.
   - La escribe la Cloud Function registrarCambioDeCosto cada vez que CAMBIA el campo
     costo, venga de donde venga: el formulario, Importar Costos, Importar Nuevos, una
     compra, el PDF semanal. Escuchar la base y no las pantallas es lo que hace que
     ningún camino se olvide de anotarla.
   - La escribe este módulo cuando alguien CONFIRMA que un costo sigue vigente sin
     cambiarlo. Sin eso, el producto cuyo proveedor no aumentó quedaría avisando para
     siempre, porque la función solo se entera de los cambios.

   UN PRODUCTO SIN FECHA NO AVISA. No hay forma de saber si su costo es viejo, y un
   aviso que se equivoca enseña a apretar "Ignorar" sin leer.

   SOLO AL CREAR UNA VENTA. Editar una venta vieja no es vender.

   EL PRECIO SE RECALCULA IGUAL QUE EN EL FORMULARIO: precio = costo × (1 + %), y el
   mayorista con su % y redondeado a $50. Si esto y el formulario calcularan distinto,
   el mismo costo daría dos precios según por dónde se cargó.
   ============================================================================= */

const COSTO_VIEJO_DIAS = 30;
const _COSTO_DIA_MS = 86400000;

/* Timestamp de Firestore, Date, o lo que venga: una fecha, o null. */
function fechaDeCosto(p) {
  const v = p && p.costoActualizadoEn;
  if (!v) return null;
  if (typeof v.toDate === 'function') { const d = v.toDate(); return isNaN(d) ? null : d; }
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

/* Los productos de la venta con el costo sin tocar hace COSTO_VIEJO_DIAS o más, uno
   por producto aunque esté dos veces en la venta. Los más viejos primero. */
function costosViejos(items, productos, ahora) {
  const hoy = ahora || new Date();
  const vistos = new Set();
  const out = [];
  (items || []).forEach(it => {
    if (!it || !it.id || vistos.has(it.id)) return;
    vistos.add(it.id);
    const p = (productos || []).find(x => x && x.id === it.id);
    const f = fechaDeCosto(p);
    if (!f) return;
    const dias = Math.floor((hoy.getTime() - f.getTime()) / _COSTO_DIA_MS);
    if (dias >= COSTO_VIEJO_DIAS) out.push({ producto: p, fecha: f, dias: dias });
  });
  return out.sort((a, b) => b.dias - a.dias);
}

/* El precio que resulta de un costo, con la misma cuenta que saveProduct. */
function preciosDesdeCosto(p, costo) {
  const pct = Number((p && p.porcentaje) || 0);
  const pctMay = Number((p && p.porcentajeMayorista) || 0);
  const redondear = (typeof _redondearMayorista === 'function')
    ? _redondearMayorista : (n => (n ? Math.ceil(n / 50) * 50 : 0));
  return {
    precio: Math.round(costo * (1 + pct / 100)),
    precioMayorista: redondear(Math.round(costo * (1 + pctMay / 100))),
  };
}

const _costoNombre = p => (p && (p.nombreMostrado || p.nombre)) || 'un producto';
const _costoPesos = n => '$' + Math.round(Number(n || 0)).toLocaleString('es-AR');
const _costoFechaTxt = f => (f ? f.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
const _costoHace = d => (d <= 0 ? 'hoy' : d === 1 ? 'hace 1 día' : 'hace ' + d + ' días');
const _costoUnidad = p => (p && p.tipoVenta === 'peso' ? ' el kilo' : '');
const _costoEsc = s => (typeof esc === 'function' ? esc(String(s == null ? '' : s)) : String(s == null ? '' : s));

/* La fecha debajo del costo, en el formulario del producto. */
function pintarFechaCosto(p) {
  const el = document.getElementById('pCostoFecha');
  if (!el) return;
  el.style.color = '';
  if (!p) { el.textContent = 'La fecha del costo se registra al guardar.'; return; }
  const f = fechaDeCosto(p);
  if (!f) { el.textContent = 'Todavía no hay fecha registrada del último cambio de costo.'; return; }
  const dias = Math.floor((Date.now() - f.getTime()) / _COSTO_DIA_MS);
  el.textContent = 'Último cambio de costo: ' + _costoFechaTxt(f) + ' (' + _costoHace(dias) + ')' +
    (dias >= COSTO_VIEJO_DIAS ? '. Desactualizado: al venderlo se va a avisar.' : '.');
  if (dias >= COSTO_VIEJO_DIAS) el.style.color = '#EDB833';
}

/* ------------------------------------------------------------ EL AVISO
   Devuelve true si la venta sigue. "Modificar costos" abre el editor y devuelve
   false: la venta queda abierta, con los precios al día, para registrarla de nuevo.
   Cerrar el aviso sin elegir (Escape, clic afuera) también vuelve a la venta. */
async function avisoCostosViejos(items, ctx) {
  const viejos = costosViejos(items, (typeof allProducts !== 'undefined' ? allProducts : []));
  /* Si el diálogo no cargó, la venta no se frena: un aviso nunca puede impedir cobrar. */
  if (!viejos.length || typeof pedirOpcion !== 'function') return true;
  const NL = String.fromCharCode(10);
  const lista = viejos.slice(0, 10).map(v =>
    '• ' + _costoNombre(v.producto) + ': ' + _costoPesos(v.producto.costo) + _costoUnidad(v.producto) +
    ', cambiado el ' + _costoFechaTxt(v.fecha) + ' (' + _costoHace(v.dias) + ')').join(NL);
  const msg = (viejos.length === 1
      ? 'El costo de este producto está desactualizado hace 1 mes o más:'
      : 'El costo de uno o más productos está desactualizado hace 1 mes o más:') +
    NL + NL + lista + (viejos.length > 10 ? NL + '• y ' + (viejos.length - 10) + ' más' : '');
  const r = await pedirOpcion(msg, {
    titulo: 'Costos desactualizados',
    icono: 'bi-clock-history',
    opciones: [
      { valor: 'modificar', texto: 'Modificar costos', principal: true },
      { valor: 'ignorar', texto: 'Ignorar advertencia y vender de todas formas' },
    ],
  });
  if (r === 'ignorar') return true;
  if (r === 'modificar') abrirEditorCostos(viejos, ctx);
  return false;
}

/* ------------------------------------------------------------ EL EDITOR */
let _costosEditor = null;   /* { filas: [{ producto, fecha, dias }], ctx: 'min' | 'may' | 'inicio' } */

/* ctx 'inicio': desde Inicio del día (admin-inicio.js), sin una venta abierta atrás. */
function abrirEditorCostos(viejos, ctx) {
  cerrarEditorCostos();
  const inicio = ctx === 'inicio';
  _costosEditor = { filas: viejos, ctx: ctx === 'may' ? 'may' : (inicio ? 'inicio' : 'min') };
  const ov = document.createElement('div');
  /* dlg-overlay: así el Escape de admin-atajos.js no cierra la venta de atrás. */
  ov.className = 'dlg-overlay';
  ov.id = 'costosEditor';
  ov.style.zIndex = String(400 + (typeof _dlgAbiertos === 'number' ? _dlgAbiertos : 0));
  ov.innerHTML =
    '<div class="dlg-box costos-box" role="dialog" aria-modal="true" aria-labelledby="costosTit">' +
      '<div class="dlg-cab"><span class="dlg-ico"><i class="bi bi-pencil-square"></i></span>' +
        '<h3 id="costosTit">' + (inicio ? 'Revisar costos' : 'Modificar costos') + '</h3></div>' +
      '<div class="dlg-msg">' +
        '<p class="dlg-linea">Poné el costo de hoy. Si alguno sigue igual, dejalo como está: al guardar queda ' +
          'confirmado con la fecha de hoy. El precio se recalcula con el mismo porcentaje de siempre.</p>' +
        viejos.map((v, i) =>
          '<div class="costos-fila">' +
            '<div class="costos-nom"><b>' + _costoEsc(_costoNombre(v.producto)) + '</b>' +
              '<div class="costos-sub">Costo actual ' + _costoPesos(v.producto.costo) + _costoUnidad(v.producto) +
                ' · cambiado el ' + _costoFechaTxt(v.fecha) + ' (' + _costoHace(v.dias) + ')</div></div>' +
            '<input type="text" inputmode="numeric" class="form-input costos-input" data-i="' + i + '" value="' +
              Math.round(Number(v.producto.costo || 0)) + '" aria-label="Nuevo costo de ' + _costoEsc(_costoNombre(v.producto)) + '">' +
          '</div>').join('') +
      '</div>' +
      '<div class="dlg-pie">' +
        '<button type="button" class="btn btn-secondary" id="costosVolver">' + (inicio ? 'Ahora no' : 'Volver a la venta') + '</button>' +
        '<button type="button" class="btn btn-primary" id="costosGuardar"><i class="bi bi-check-lg"></i> Guardar costos</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(ov);
  if (typeof _dlgAbiertos === 'number') _dlgAbiertos++;
  ov.querySelector('#costosVolver').addEventListener('click', cerrarEditorCostos);
  ov.querySelector('#costosGuardar').addEventListener('click', guardarEditorCostos);
  ov.addEventListener('mousedown', e => { if (e.target === ov) cerrarEditorCostos(); });
  ov.querySelectorAll('.costos-input').forEach(inp => {
    inp.addEventListener('input', () => { if (typeof limpiarMonto === 'function') limpiarMonto(inp); });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); guardarEditorCostos(); } });
  });
  document.addEventListener('keydown', _costosTecla, true);
  setTimeout(() => { const i = ov.querySelector('.costos-input'); if (i) { i.focus(); i.select(); } }, 30);
}

function _costosTecla(e) {
  if (e.key === 'Escape' && document.getElementById('costosEditor')) {
    e.preventDefault(); e.stopPropagation(); cerrarEditorCostos();
  }
}

function cerrarEditorCostos() {
  const ov = document.getElementById('costosEditor');
  if (ov) {
    ov.remove();
    if (typeof _dlgAbiertos === 'number') _dlgAbiertos = Math.max(0, _dlgAbiertos - 1);
  }
  document.removeEventListener('keydown', _costosTecla, true);
  _costosEditor = null;
}

async function guardarEditorCostos() {
  const ed = _costosEditor;
  const ov = document.getElementById('costosEditor');
  if (!ed || !ov) return;
  const leer = v => (typeof montoAR === 'function' ? montoAR(v) : Number(String(v || '').replace(/[^0-9]/g, '')));
  const cambios = [];
  for (const inp of ov.querySelectorAll('.costos-input')) {
    const fila = ed.filas[Number(inp.getAttribute('data-i'))];
    if (!fila) continue;
    const nuevo = Math.round(Number(leer(inp.value)) || 0);
    if (!(nuevo > 0)) {
      showAdminToast('Poné un costo válido para "' + _costoNombre(fila.producto) + '"', 'error');
      inp.focus();
      return;
    }
    cambios.push({ p: fila.producto, nuevo: nuevo, cambio: nuevo !== Math.round(Number(fila.producto.costo || 0)) });
  }
  const btn = ov.querySelector('#costosGuardar');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Guardando...'; }

  /* costoActualizadoEn va en la MISMA escritura: registrarCambioDeCosto ve que ya
     viene y no la vuelve a escribir. Y en los que no cambiaron es lo único que se
     escribe: es la confirmación de que el costo sigue vigente. */
  const hora = firebase.firestore.FieldValue.serverTimestamp();
  const lote = db.batch();
  const locales = [];
  cambios.forEach(c => {
    const campos = { costoActualizadoEn: hora };
    if (c.cambio) Object.assign(campos, { costo: c.nuevo }, preciosDesdeCosto(c.p, c.nuevo));
    lote.update(db.collection('productos').doc(c.p.id), campos);
    locales.push({ p: c.p, campos: Object.assign({}, campos, { costoActualizadoEn: new Date() }) });
  });
  try {
    await lote.commit();
  } catch (e) {
    showAdminToast('No se pudieron guardar los costos: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg"></i> Guardar costos'; }
    return;
  }
  /* El MISMO objeto de allProducts: la venta y la tabla lo tienen en la mano. */
  locales.forEach(l => Object.assign(l.p, l.campos));
  const cambiados = cambios.filter(c => c.cambio).map(c => c.p);
  const inicio = ed.ctx === 'inicio';
  /* Desde Inicio del día no hay una venta abierta que actualizar. */
  if (!inicio) _refrescarItemsDeVenta(ed.ctx, cambiados);
  if (typeof logAction === 'function') {
    logAction('editar', (inicio ? 'Costos revisados desde Inicio del día: ' : 'Costos al vender: ') +
      cambiados.length + ' cambiado' + (cambiados.length === 1 ? '' : 's') +
      ', ' + (cambios.length - cambiados.length) + ' confirmado' + (cambios.length - cambiados.length === 1 ? '' : 's'),
      cambios.map(c => _costoNombre(c.p) + (c.cambio ? ' -> ' + _costoPesos(c.nuevo) : ' (sigue igual)')).join(' | ').slice(0, 900));
  }
  if (typeof filterTable === 'function') filterTable();
  cerrarEditorCostos();
  const confirmados = cambios.length - cambiados.length;
  showAdminToast(inicio
    ? 'Listo: ' + (cambiados.length
        ? cambiados.length + (cambiados.length === 1 ? ' costo cambiado, con su precio nuevo' : ' costos cambiados, con su precio nuevo') +
          (confirmados ? ', y ' + confirmados + (confirmados === 1 ? ' confirmado' : ' confirmados') + ' sin cambios' : '')
        : confirmados + (confirmados === 1 ? ' costo confirmado' : ' costos confirmados') + ' con la fecha de hoy') + '.'
    : (cambiados.length
      ? 'Costos guardados. Los precios de la venta se actualizaron: revisá el total y registrala.'
      : 'Costos confirmados. Ya podés registrar la venta.'), 'success');
  /* La campana y el Inicio del día: lo revisado deja de avisar. */
  if (typeof _refrescarAlertas === 'function') _refrescarAlertas(false);
}

/* Los renglones de la venta abierta toman el costo nuevo, y el precio nuevo salvo en
   una venta que viene de un pedido web: ese precio ya lo aceptó el cliente. */
function _refrescarItemsDeVenta(ctx, productos) {
  if (!productos || !productos.length) return;
  const may = ctx === 'may';
  const lista = may ? (typeof ventaMayItems !== 'undefined' ? ventaMayItems : [])
                    : (typeof ventaItems !== 'undefined' ? ventaItems : []);
  const desdePedido = !may && typeof window !== 'undefined' && !!window._pedidoOrigenVentaId;
  /* Un granel con escalas se cobra al precio de la escala (escalaId), que puede ser otra
     bolsa que la del renglón; una caja cerrada, al mayorista. Antes todo pasaba al precio
     de lista de su propio producto y se cobraba mal (chequeo del 25/09). */
  const escala = it => (typeof escalaDeLinea === 'function' ? escalaDeLinea(it) : null);
  const cambiados = new Set(productos.map(p => p.id));
  productos.forEach(p => {
    lista.filter(it => it && it.id === p.id).forEach(it => {
      it.costo = Number(p.costo || 0);
      if (!desdePedido && !escala(it)) {
        it.precio = may ? (p.precioMayorista || p.precio || 0)
          : (typeof precioMostradorDe === 'function' ? precioMostradorDe(p) : p.precio);
      }
    });
  });
  if (!desdePedido) {
    lista.forEach(it => {
      const e = it && escala(it);
      if (e && cambiados.has(e.id)) it.precio = Number(may ? (e.producto.precioMayorista || e.producto.precio || 0) : (e.producto.precio || 0));
    });
  }
  if (may) { if (typeof renderVentaMayItems === 'function') renderVentaMayItems(); }
  else if (typeof renderVentaItems === 'function') renderVentaItems();
}
