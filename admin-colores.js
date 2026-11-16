/* =============================================================================
   COLORES DEL PANEL (CONTRASTE)  —  Brotes Dietética
   =============================================================================
   Pedido de la clienta (16/11/2026): "opciones de contraste de colores, porque la
   escala de grises confunde". El panel es oscuro y casi todo son grises muy
   parecidos (el fondo, las tarjetas y los casilleros van de #0f1117 a #252836; el
   texto secundario es gris medio sobre gris oscuro): cuesta ver qué es un
   casillero, qué se puede tocar y qué está elegido.

   En Configuración, "Colores del sistema":
   - dos opciones rápidas: Normal (como siempre) y Alto contraste;
   - "Personalizar" (Thiago: "algo un poco más personalizado"), cada cosa por
     separado: el fondo, los bordes, la letra gris, el color de lo elegido y el
     renglón bajo el mouse. Cada cambio se ve en el momento, con una muestra al
     lado, y "Volver a como estaba" deja todo como estaba al abrir el panel.

   Cada ajuste que no está "como siempre" pone un atributo en <html>
   (data-col-fondo="negro", data-col-acento="azul"...) y admin.html cambia los
   colores de base (las variables --bg, --border, --text-dim, --accent...), de los
   que sale casi todo el panel. Con todo "como siempre" no hay ningún atributo: el
   panel queda exactamente como antes.

   Como la letra (admin-letra.js), SE GUARDA EN ESTA COMPUTADORA (localStorage), no
   en la base, y se aplica en el <head>, antes de dibujar. A diferencia de la letra,
   cambiar los colores no recarga ni pregunta: se ve en el momento y se vuelve con
   un clic.
   ============================================================================= */

const COLORES_CLAVE = 'brotesColores';

/* Cada ajuste con sus opciones; la primera es "como siempre". */
const COLORES_AJUSTES = [
  { k: 'fondo', titulo: 'Fondo', ops: [['normal', 'Como siempre'], ['oscuro', 'Más oscuro'], ['negro', 'Negro']] },
  { k: 'bordes', titulo: 'Bordes de recuadros y casilleros', ops: [['finos', 'Finos (como siempre)'], ['marcados', 'Marcados'], ['muy', 'Muy marcados']] },
  { k: 'texto', titulo: 'Letra gris (las aclaraciones)', ops: [['normal', 'Como siempre'], ['clara', 'Más clara'], ['blanca', 'Blanca']] },
  { k: 'acento', titulo: 'Color de lo elegido', nota: 'El menú, el casillero donde escribís y la opción marcada.',
    ops: [['verde', 'Verde (como siempre)'], ['verde-fuerte', 'Verde fuerte'], ['azul', 'Azul'], ['amarillo', 'Amarillo'], ['naranja', 'Naranja']] },
  { k: 'fila', titulo: 'Renglón bajo el mouse', ops: [['suave', 'Suave (como siempre)'], ['marcada', 'Bien marcado']] }
];
/* El punto de color de cada opción de "Color de lo elegido". */
const _COLORES_PUNTO = { verde: '#5FA87A', 'verde-fuerte': '#2e8b57', azul: '#2563eb', amarillo: '#ffd54a', naranja: '#ff8c3c' };

function _coloresNormales() {
  const o = {};
  COLORES_AJUSTES.forEach(a => { o[a.k] = a.ops[0][0]; });
  return o;
}
/* Las dos opciones rápidas. */
const COLORES_RAPIDOS = {
  normal: _coloresNormales(),
  alto: { fondo: 'negro', bordes: 'marcados', texto: 'blanca', acento: 'verde-fuerte', fila: 'marcada' }
};

/* Un ajuste completo y válido: lo que no se reconoce queda como siempre. */
function _coloresValidos(o) {
  const r = _coloresNormales();
  if (!o || typeof o !== 'object') return r;
  COLORES_AJUSTES.forEach(a => {
    if (a.ops.some(op => op[0] === o[a.k])) r[a.k] = o[a.k];
  });
  return r;
}
function _coloresIguales(a, b) {
  return COLORES_AJUSTES.every(x => a[x.k] === b[x.k]);
}

/* Lo guardado en esta computadora, o todo como siempre. Si el navegador no deja leer
   o hay algo raro guardado, queda como siempre: nunca rompe el panel. */
function coloresGuardados() {
  let t = null;
  try { t = localStorage.getItem(COLORES_CLAVE); } catch (e) { /* como siempre */ }
  if (t === 'alto') return Object.assign({}, COLORES_RAPIDOS.alto);
  try { return _coloresValidos(JSON.parse(t)); } catch (e) { return _coloresNormales(); }
}

function aplicarColores(o) {
  const raiz = document.documentElement;
  const v = _coloresValidos(o);
  COLORES_AJUSTES.forEach(a => {
    if (v[a.k] === a.ops[0][0]) raiz.removeAttribute('data-col-' + a.k);
    else raiz.setAttribute('data-col-' + a.k, v[a.k]);
  });
}

let _coloresActual = coloresGuardados();
/* Cómo estaba al abrir el panel, para "Volver a como estaba". */
const _coloresAlAbrir = Object.assign({}, _coloresActual);
aplicarColores(_coloresActual);

/* Guarda (todo como siempre es no tener nada) y dice si quedó. */
function _coloresGuardar(o) {
  try {
    if (_coloresIguales(o, COLORES_RAPIDOS.normal)) localStorage.removeItem(COLORES_CLAVE);
    else localStorage.setItem(COLORES_CLAVE, JSON.stringify(o));
  } catch (e) { /* abajo se ve que no quedó */ }
  return _coloresIguales(coloresGuardados(), o);
}

function _coloresAvisar(msg, tipo) {
  if (typeof showAdminToast === 'function') showAdminToast(msg, tipo);
}

/* Pone estos colores, los guarda y redibuja las opciones. */
function _coloresPoner(o, aviso) {
  const v = _coloresValidos(o);
  if (_coloresIguales(v, _coloresActual)) return false;
  if (!_coloresGuardar(v)) {
    _coloresGuardar(_coloresActual);
    _coloresAvisar('No se pudo guardar en esta computadora: el navegador no lo permite.', 'error');
    return false;
  }
  _coloresActual = v;
  aplicarColores(v);
  pintarOpcionesColores();
  if (aviso) _coloresAvisar(aviso, 'success');
  return true;
}

/* Las opciones rápidas: 'normal' o 'alto'. */
function elegirColores(nombre) {
  if (!COLORES_RAPIDOS[nombre]) return;
  _coloresPoner(COLORES_RAPIDOS[nombre],
    nombre === 'alto' ? 'Listo: colores de alto contraste.' : 'Listo: colores normales, como siempre.');
}

/* Un ajuste de "Personalizar". Sin aviso: el cambio se ve en el momento. */
function cambiarColor(k, valor) {
  const a = COLORES_AJUSTES.filter(x => x.k === k)[0];
  if (!a || !a.ops.some(op => op[0] === valor)) return;
  const o = Object.assign({}, _coloresActual);
  o[k] = valor;
  _coloresPoner(o);
}

function volverColores() {
  _coloresPoner(_coloresAlAbrir, 'Listo: los colores volvieron a como estaban.');
}

function _coloresRapidoActual() {
  return Object.keys(COLORES_RAPIDOS).filter(n => _coloresIguales(COLORES_RAPIDOS[n], _coloresActual))[0] || null;
}

/* Las opciones rápidas, con una muestra de cómo se ven (con sus colores fijos, para
   verlas antes de elegir). */
const _COLORES_MUESTRA = {
  normal: { titulo: 'Normal', nota: 'Como siempre', fondo: '#0f1117', tarjeta: '#1a1d27', borde: '#2e3140', casillero: '#252836', texto: '#e4e4e7', suave: '#8b8d97' },
  alto: { titulo: 'Alto contraste', nota: 'Más fácil de distinguir', fondo: '#000000', tarjeta: '#171a23', borde: '#8a90a8', casillero: '#07080b', texto: '#ffffff', suave: '#d0d3dc' }
};

function _coloresHtmlRapidos() {
  const enUso = _coloresRapidoActual();
  return '<div class="colores-opciones">' + Object.keys(COLORES_RAPIDOS).map(v => {
    const m = _COLORES_MUESTRA[v];
    const activa = v === enUso;
    return '<button type="button" class="colores-op' + (activa ? ' activa' : '') + '"' +
      ' onclick="elegirColores(\'' + v + '\')" aria-pressed="' + activa + '">' +
      '<span class="colores-muestra" style="background:' + m.fondo + '">' +
        '<span style="background:' + m.tarjeta + ';border:1px solid ' + m.borde + ';color:' + m.texto + '">' +
          '<b>Producto</b><small style="color:' + m.suave + '">Stock: 12</small>' +
          '<i style="background:' + m.casillero + ';border:1px solid ' + m.borde + '"></i>' +
        '</span>' +
      '</span>' +
      '<span class="colores-op-titulo">' + (activa ? '<i class="bi bi-check-circle-fill"></i> ' : '') + m.titulo + '</span>' +
      '<span class="colores-op-nota">' + (activa ? 'En uso' : m.nota) + '</span>' +
      '</button>';
  }).join('') + '</div>';
}

function _coloresHtmlPersonalizar() {
  const filas = COLORES_AJUSTES.map(a => {
    const chips = a.ops.map(op => {
      const activa = _coloresActual[a.k] === op[0];
      const punto = a.k === 'acento' ? '<i class="colores-punto" style="background:' + _COLORES_PUNTO[op[0]] + '"></i>' : '';
      return '<button type="button" class="colores-chip' + (activa ? ' activa' : '') + '"' +
        ' onclick="cambiarColor(\'' + a.k + '\',\'' + op[0] + '\')" aria-pressed="' + activa + '">' +
        punto + op[1] + '</button>';
    }).join('');
    return '<div class="colores-ajuste"><div class="colores-ajuste-titulo">' + a.titulo + '</div>' +
      (a.nota ? '<div class="colores-ajuste-nota">' + a.nota + '</div>' : '') +
      '<div class="colores-chips">' + chips + '</div></div>';
  }).join('');
  /* La muestra usa los colores del panel (las mismas variables), así que cambia junto
     con cada ajuste. */
  const muestra =
    '<div class="colores-vivo" aria-hidden="true">' +
      '<div class="colores-vivo-titulo">Así se ve</div>' +
      '<div class="colores-vivo-menu">Productos</div>' +
      '<div class="colores-vivo-menu activa">Ventas</div>' +
      '<div class="card colores-vivo-card">' +
        '<b>Harina de almendra</b>' +
        '<small>Stock: 12 unidades</small>' +
        '<span class="form-input colores-vivo-input">$ 23.040</span>' +
        '<span class="form-input colores-vivo-input colores-vivo-foco">Escribiendo...</span>' +
        '<span class="colores-vivo-fila">Renglón bajo el mouse</span>' +
        '<span class="colores-vivo-botones"><span class="btn btn-primary btn-sm">Guardar</span><span class="btn btn-secondary btn-sm">Cancelar</span></span>' +
      '</div>' +
    '</div>';
  const rapido = _coloresRapidoActual();
  const cambio = !_coloresIguales(_coloresActual, _coloresAlAbrir);
  return '<div class="colores-personalizar">' +
      '<div class="colores-personalizar-cab"><b>Personalizar</b>' +
        '<span class="colores-ajuste-nota">' + (rapido ? '' : 'Ahora: colores personalizados.') + '</span></div>' +
      '<div class="colores-personalizar-cuerpo"><div>' + filas + '</div>' + muestra + '</div>' +
      '<button type="button" class="btn btn-secondary btn-sm colores-volver" onclick="volverColores()"' + (cambio ? '' : ' disabled') + '>' +
        '<i class="bi bi-arrow-counterclockwise"></i> Volver a como estaba</button>' +
    '</div>';
}

function pintarOpcionesColores() {
  const cont = document.getElementById('coloresOpciones');
  if (!cont) return;
  cont.innerHTML = _coloresHtmlRapidos() + _coloresHtmlPersonalizar();
}

/* Si se cambia en otra pestaña del panel, esta se pone igual. */
window.addEventListener('storage', function (e) {
  if (e.key !== COLORES_CLAVE && e.key !== null) return;
  const v = coloresGuardados();
  if (_coloresIguales(v, _coloresActual)) return;
  _coloresActual = v;
  aplicarColores(v);
  pintarOpcionesColores();
});

document.addEventListener('DOMContentLoaded', pintarOpcionesColores);
