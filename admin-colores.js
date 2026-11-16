/* =============================================================================
   COLORES DEL PANEL (CONTRASTE)  —  Brotes Dietética
   =============================================================================
   Pedido de la clienta (16/11/2026): "opciones de contraste de colores, porque la
   escala de grises confunde". El panel es oscuro y casi todo son grises muy
   parecidos (el fondo, las tarjetas y los casilleros van de #0f1117 a #252836; el
   texto secundario es gris medio sobre gris oscuro): cuesta ver qué es un
   casillero, qué se puede tocar y qué está elegido.

   En Configuración, "Colores del sistema": Normal (como siempre) o Alto contraste.
   Con Alto contraste <html> lleva data-colores="alto" y admin.html cambia los
   colores de base (las variables --bg, --bg-card, --border, --text-dim...): fondo
   más negro, tarjetas y casilleros separados con un borde claro, letra blanca, el
   texto secundario bastante más claro, y lo elegido y lo que está bajo el mouse
   bien marcados. Con Normal no hay data-colores: el panel queda exactamente como
   siempre.

   Como la letra (admin-letra.js), SE GUARDA EN ESTA COMPUTADORA (localStorage), no
   en la base, y se aplica en el <head>, antes de dibujar. A diferencia de la letra,
   cambiar los colores no recarga ni pregunta: se ve en el momento y se vuelve con
   un clic.
   ============================================================================= */

const COLORES_CLAVE = 'brotesColores';
const COLORES_OPCIONES = ['normal', 'alto'];

function _coloresValido(t) {
  return COLORES_OPCIONES.indexOf(t) >= 0 ? t : 'normal';
}

/* Lo guardado en esta computadora, o 'normal'. Si el navegador no deja leer o hay algo
   raro guardado, queda en 'normal': nunca rompe el panel. */
function coloresGuardados() {
  let t = null;
  try { t = localStorage.getItem(COLORES_CLAVE); } catch (e) { /* queda normal */ }
  return _coloresValido(t);
}

function aplicarColores(v) {
  const raiz = document.documentElement;
  if (v === 'alto') raiz.setAttribute('data-colores', 'alto');
  else raiz.removeAttribute('data-colores');
}

let _coloresActual = coloresGuardados();
aplicarColores(_coloresActual);

/* Las opciones de Configuración. Cada una con una muestra de cómo se ve (con sus
   colores fijos, para verla antes de elegir). */
const _COLORES_MUESTRA = {
  normal: { titulo: 'Normal', nota: 'Como siempre', fondo: '#0f1117', tarjeta: '#1a1d27', borde: '#2e3140', casillero: '#252836', texto: '#e4e4e7', suave: '#8b8d97' },
  alto: { titulo: 'Alto contraste', nota: 'Más fácil de distinguir', fondo: '#000000', tarjeta: '#171a23', borde: '#8a90a8', casillero: '#07080b', texto: '#ffffff', suave: '#d0d3dc' }
};

function pintarOpcionesColores() {
  const cont = document.getElementById('coloresOpciones');
  if (!cont) return;
  cont.innerHTML = COLORES_OPCIONES.map(v => {
    const m = _COLORES_MUESTRA[v];
    const activa = v === _coloresActual;
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
  }).join('');
}

function _coloresAvisar(msg, tipo) {
  if (typeof showAdminToast === 'function') showAdminToast(msg, tipo);
}

function elegirColores(v) {
  if (COLORES_OPCIONES.indexOf(v) < 0 || v === _coloresActual) return;
  try {
    if (v === 'normal') localStorage.removeItem(COLORES_CLAVE);
    else localStorage.setItem(COLORES_CLAVE, v);
  } catch (e) { /* abajo se ve que no quedó */ }
  if (coloresGuardados() !== v) {
    _coloresAvisar('No se pudo guardar en esta computadora: el navegador no lo permite.', 'error');
    return;
  }
  _coloresActual = v;
  aplicarColores(v);
  pintarOpcionesColores();
  _coloresAvisar(v === 'alto' ? 'Listo: colores de alto contraste.' : 'Listo: colores normales, como siempre.', 'success');
}

/* Si se cambia en otra pestaña del panel, esta se pone igual. */
window.addEventListener('storage', function (e) {
  if (e.key !== COLORES_CLAVE && e.key !== null) return;
  const v = coloresGuardados();
  if (v === _coloresActual) return;
  _coloresActual = v;
  aplicarColores(v);
  pintarOpcionesColores();
});

document.addEventListener('DOMContentLoaded', pintarOpcionesColores);
