/* =============================================================================
   ATAJOS DE TECLADO  —  Brotes Dietética
   =============================================================================
   Pensados para el mostrador: con gente esperando, soltar el mouse para abrir
   una venta cuesta más de lo que parece.

   El esquema es letras para acciones y números para moverse entre pantallas.
   Nada de Ctrl+algo: esas combinaciones ya son del navegador y pelearlas termina
   rompiendo algo (Ctrl+P imprimir, Ctrl+N ventana nueva, Ctrl+W cerrar).

   Tres reglas que evitan que un atajo se dispare cuando no debe:
     1) si el foco está en un campo, la tecla es texto y no atajo;
     2) si hay un modal abierto, no se dispara ninguno — si no, tipear "v" en una
        venta abriría otra venta encima;
     3) con Ctrl, Alt o Meta apretados no se hace nada: son del sistema.

   Las teclas se pueden cambiar desde Configuración y quedan guardadas en
   config/atajos, así valen para las dos cuentas del panel.
   ============================================================================= */

const ATAJOS_ACCIONES = {
  /* --- acciones --- */
  nuevaVenta:   { def:'v', grupo:'Acciones', etq:'Nueva venta',
                  desc:'Abre el formulario de venta del mostrador, sin importar en qué pantalla estés.' },
  nuevaVentaMay:{ def:'m', grupo:'Acciones', etq:'Nueva venta mayorista',
                  desc:'Abre el formulario de venta mayorista.' },
  nuevoProducto:{ def:'p', grupo:'Acciones', etq:'Nuevo producto',
                  desc:'Abre el formulario para cargar un producto al catálogo.' },
  buscar:       { def:'/', grupo:'Acciones', etq:'Buscar',
                  desc:'Pone el cursor en el buscador de la pantalla actual.' },
  /* --- caja --- */
  cajaIngreso:  { def:'i', grupo:'Caja', etq:'Registrar ingreso',
                  desc:'Plata que entra al cajón y no es una venta. Necesita la caja abierta.' },
  cajaEgreso:   { def:'e', grupo:'Caja', etq:'Registrar egreso',
                  desc:'Plata que sale del cajón: un pago, un gasto, un retiro. Necesita la caja abierta.' },
  cajaCerrar:   { def:'x', grupo:'Caja', etq:'Cerrar caja y arquear',
                  desc:'Abre el conteo de cierre del día.' },
  /* --- navegación --- */
  irCaja:       { def:'1', grupo:'Ir a', etq:'Caja',          desc:'', sec:'caja' },
  irVentas:     { def:'2', grupo:'Ir a', etq:'Ventas',        desc:'', sec:'ventas' },
  irPedidos:    { def:'3', grupo:'Ir a', etq:'Pedidos',       desc:'', sec:'pedidos' },
  irProductos:  { def:'4', grupo:'Ir a', etq:'Productos',     desc:'', sec:'products' },
  irStats:      { def:'5', grupo:'Ir a', etq:'Estadísticas',  desc:'', sec:'stats' },
  irConfig:     { def:'6', grupo:'Ir a', etq:'Configuración', desc:'', sec:'config' }
};

/* '?' y Escape no se pueden reasignar: son la salida de emergencia. Si alguien
   pisa el atajo de ayuda con otra cosa, deja de haber forma de descubrir el resto. */
const ATAJOS_RESERVADOS = { '?':'Ayuda de atajos', 'Escape':'Cerrar lo que esté abierto' };

let ATAJOS = {};              /* accion -> tecla */
let _atajosCapturando = null; /* accion cuya tecla se está por cambiar */

/* ============================ CARGA ============================ */

function atajosPorDefecto() {
  const o = {};
  Object.keys(ATAJOS_ACCIONES).forEach(k => { o[k] = ATAJOS_ACCIONES[k].def; });
  return o;
}

async function loadAtajos() {
  ATAJOS = atajosPorDefecto();
  try {
    const s = await db.collection('config').doc('atajos').get();
    if (s.exists) {
      const d = s.data() || {};
      /* Se toman solo las acciones que existen hoy: un doc viejo con acciones que
         ya no están no debe meter teclas fantasma en la ayuda. */
      Object.keys(ATAJOS_ACCIONES).forEach(k => { if (typeof d[k] === 'string' && d[k]) ATAJOS[k] = d[k]; });
    }
  } catch (e) { console.warn('atajos:', e); }
  renderAtajosEditor();
}

/* ============================ ESCUCHA ============================ */

function _enCampo(t) {
  if (!t) return false;
  const tag = (t.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
}
function _hayModal() { return !!document.querySelector('.modal-overlay.show'); }

/* Las teclas se comparan en minúscula. Si no, alguien que asigna la tecla con
   Shift apretado se queda con un atajo que no responde nunca: guardaría 'Z' y al
   escribir 'z' no coincidiría con nada. */
function _normTecla(t) { return (typeof t === 'string' && t.length === 1) ? t.toLowerCase() : t; }

function _accionDeTecla(tecla) {
  const t = _normTecla(tecla);
  const k = Object.keys(ATAJOS).find(a => _normTecla(ATAJOS[a]) === t);
  return k || null;
}

/* Un lector de códigos de barras es un teclado que escribe "7790895000123" en
   milisegundos. Sin esto, escanear disparaba los atajos de navegación uno atrás
   del otro y el panel saltaba de pantalla en pantalla.

   Por eso el atajo no se ejecuta al instante: se espera un momento y, si en el
   medio llega otra tecla, no era un atajo sino el principio de un escaneo. La
   demora es imperceptible tecleando, y no hay forma humana de apretar dos
   atajos a propósito dentro de esa ventana. */
const ATAJO_DEMORA = 70;
let _atajoPendiente = null;

document.addEventListener('keydown', function (e) {
  if (_atajoPendiente) { clearTimeout(_atajoPendiente); _atajoPendiente = null; }
  if (_atajosCapturando) { capturarTecla(e); return; }
  if (e.ctrlKey || e.altKey || e.metaKey) return;

  if (e.key === 'Escape') {
    /* Cierra el modal de más arriba. Es lo único que funciona con un modal abierto. */
    const abiertos = document.querySelectorAll('.modal-overlay.show');
    if (abiertos.length) { abiertos[abiertos.length - 1].classList.remove('show'); e.preventDefault(); }
    return;
  }
  if (_enCampo(e.target)) return;
  if (_hayModal()) return;

  if (e.key === '?') { e.preventDefault(); openAtajosAyuda(); return; }

  const accion = _accionDeTecla(e.key);
  if (!accion) return;
  e.preventDefault();
  _atajoPendiente = setTimeout(function () { _atajoPendiente = null; ejecutarAtajo(accion); }, ATAJO_DEMORA);
}, true);
/* Va en fase de captura sobre `document`, igual que el lector de códigos. No es
   un detalle: el lector hace stopPropagation() al cerrar un escaneo, y desde la
   fase de burbujeo este handler no llegaba a ver ese Enter. Resultado: el atajo
   del último dígito del código quedaba agendado y se disparaba solo, así que
   escanear un producto terminaba cambiando de pantalla.
   Dos listeners sobre el MISMO nodo se ejecutan los dos igual —stopPropagation
   corta hacia otros nodos, no hacia los hermanos—, así que ahora no importa en
   qué orden se carguen los dos archivos. */

/* ============================ ACCIONES ============================ */

function _aviso(msg) { if (typeof showAdminToast === 'function') showAdminToast(msg, 'error'); }
function _existe(f) { return typeof window[f] === 'function'; }

function ejecutarAtajo(accion) {
  const a = ATAJOS_ACCIONES[accion];
  if (!a) return;

  if (a.sec) { if (_existe('switchSection')) switchSection(a.sec); return; }

  switch (accion) {
    case 'nuevaVenta':
      if (_existe('openVentaModal')) openVentaModal(); else _aviso('No se pudo abrir la venta');
      break;
    case 'nuevaVentaMay':
      if (_existe('openVentaMayModal')) openVentaMayModal(); else _aviso('No se pudo abrir la venta mayorista');
      break;
    case 'nuevoProducto':
      /* El formulario de producto vive en la sección Productos: si estás en otra,
         primero hay que ir, porque el modal usa los selects de esa pantalla. */
      if (_existe('switchSection')) switchSection('products');
      if (_existe('openModal')) openModal();
      break;
    case 'buscar': {
      const b = _buscadorActivo();
      if (b) { b.focus(); b.select && b.select(); }
      else _aviso('Esta pantalla no tiene buscador');
      break;
    }
    case 'cajaIngreso':
    case 'cajaEgreso':
      if (!_cajaAbiertaEnPantalla()) { _aviso('Primero abrí la caja'); if (_existe('switchSection')) switchSection('caja'); break; }
      if (_existe('openMovModal')) openMovModal(accion === 'cajaIngreso' ? 'ingreso' : 'egreso');
      break;
    case 'cajaCerrar':
      if (!_cajaAbiertaEnPantalla()) { _aviso('No hay caja abierta'); if (_existe('switchSection')) switchSection('caja'); break; }
      if (_existe('openCierreModal')) openCierreModal();
      break;
  }
}

/* Los modales de caja leen la caja que ya cargó la pantalla. Si nunca se entró a
   la sección, no hay nada cargado y abrirlos daría un formulario que no guarda. */
function _cajaAbiertaEnPantalla() {
  return _existe('getCajaAbiertaId') && !!getCajaAbiertaId();
}

function _buscadorActivo() {
  const sec = document.querySelector('.section-content.active');
  if (!sec) return null;
  const cands = sec.querySelectorAll('.search-box input, input[type="text"][id$="Search"], input[type="text"][id$="earch"]');
  for (let i = 0; i < cands.length; i++) if (cands[i].offsetParent !== null) return cands[i];
  return null;
}

/* ============================ AYUDA ============================ */

function openAtajosAyuda() {
  const cont = document.getElementById('atajosAyudaBody');
  if (!cont) return;
  cont.innerHTML = _tablaAtajos(false);
  document.getElementById('atajosAyudaModal').classList.add('show');
}
function closeAtajosAyuda() { document.getElementById('atajosAyudaModal').classList.remove('show'); }

function _tecla(t) {
  return '<kbd style="display:inline-block;min-width:1.6rem;text-align:center;background:#0d1117;border:1px solid var(--border);' +
    'border-bottom-width:2px;border-radius:5px;padding:2px 7px;font-family:ui-monospace,monospace;font-size:0.82rem;font-weight:700">' +
    esc(t) + '</kbd>';
}

function _tablaAtajos(editable) {
  const grupos = {};
  Object.keys(ATAJOS_ACCIONES).forEach(k => {
    const a = ATAJOS_ACCIONES[k];
    (grupos[a.grupo] = grupos[a.grupo] || []).push(k);
  });
  let html = '';
  Object.keys(grupos).forEach(g => {
    html += '<div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:1px;font-weight:800;color:var(--text-dim);' +
      'margin:1rem 0 0.5rem">' + g + '</div>';
    grupos[g].forEach(k => {
      const a = ATAJOS_ACCIONES[k];
      const cap = _atajosCapturando === k;
      html += '<div style="display:flex;align-items:flex-start;gap:0.8rem;padding:0.45rem 0;border-bottom:1px solid rgba(255,255,255,0.04)">' +
        '<div style="width:4.2rem;flex:0 0 auto;text-align:right">' +
          (cap ? '<span style="color:var(--accent-light);font-size:0.76rem;font-weight:700">Apretá&nbsp;una&nbsp;tecla</span>' : _tecla(ATAJOS[k] || a.def)) +
        '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:0.87rem;font-weight:600">' + esc(a.etq) + '</div>' +
          (a.desc ? '<div style="font-size:0.78rem;color:var(--text-dim);line-height:1.45">' + esc(a.desc) + '</div>' : '') +
        '</div>' +
        (editable ? '<button class="btn btn-secondary" style="width:auto;padding:3px 10px;font-size:0.75rem;flex:0 0 auto" ' +
          'onclick="empezarCapturaAtajo(\'' + k + '\')">' + (cap ? 'Cancelar' : 'Cambiar') + '</button>' : '') +
      '</div>';
    });
  });
  html += '<div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:1px;font-weight:800;color:var(--text-dim);margin:1rem 0 0.5rem">Siempre disponibles</div>';
  Object.keys(ATAJOS_RESERVADOS).forEach(t => {
    html += '<div style="display:flex;align-items:center;gap:0.8rem;padding:0.45rem 0;border-bottom:1px solid rgba(255,255,255,0.04)">' +
      '<div style="width:4.2rem;flex:0 0 auto;text-align:right">' + _tecla(t) + '</div>' +
      '<div style="font-size:0.87rem;font-weight:600;flex:1">' + esc(ATAJOS_RESERVADOS[t]) + '</div></div>';
  });
  html += '<p style="font-size:0.78rem;color:var(--text-dim);line-height:1.5;margin-top:1rem">' +
    'Los atajos no funcionan mientras escribís en un campo ni con una ventana abierta, ' +
    'para que nunca se disparen sin querer.</p>';
  return html;
}

/* ============================ EDITOR ============================ */

function renderAtajosEditor() {
  const cont = document.getElementById('atajosEditor');
  if (!cont) return;
  cont.innerHTML = _tablaAtajos(true);
}

function empezarCapturaAtajo(accion) {
  _atajosCapturando = (_atajosCapturando === accion) ? null : accion;
  renderAtajosEditor();
}

function capturarTecla(e) {
  e.preventDefault();
  const accion = _atajosCapturando;
  if (e.key === 'Escape') { _atajosCapturando = null; renderAtajosEditor(); return; }
  const t = _normTecla(e.key);
  /* Una tecla muerta o un modificador solo no sirven como atajo */
  if (typeof t !== 'string' || t.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) {
    if (typeof showAdminToast === 'function') showAdminToast('Elegí una tecla simple, sin Ctrl ni Alt', 'error');
    return;
  }
  if (ATAJOS_RESERVADOS[t]) {
    if (typeof showAdminToast === 'function') showAdminToast('"' + t + '" está reservada para ' + ATAJOS_RESERVADOS[t].toLowerCase(), 'error');
    return;
  }
  const ocupada = Object.keys(ATAJOS).find(k => k !== accion && _normTecla(ATAJOS[k]) === t);
  if (ocupada) {
    if (typeof showAdminToast === 'function') showAdminToast('"' + t + '" ya es ' + ATAJOS_ACCIONES[ocupada].etq, 'error');
    return;
  }
  ATAJOS[accion] = t;
  _atajosCapturando = null;
  renderAtajosEditor();
  guardarAtajos();
}

async function guardarAtajos() {
  try {
    await db.collection('config').doc('atajos').set(ATAJOS);
    if (typeof showAdminToast === 'function') showAdminToast('Atajo guardado', 'success');
  } catch (e) {
    if (typeof showAdminToast === 'function') showAdminToast('Error al guardar: ' + e.message, 'error');
  }
}

async function restaurarAtajos() {
  if (!confirm('¿Volver a los atajos originales?')) return;
  ATAJOS = atajosPorDefecto();
  _atajosCapturando = null;
  renderAtajosEditor();
  await guardarAtajos();
}
