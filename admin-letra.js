/* =============================================================================
   TAMAÑO DE LA LETRA DEL PANEL  —  Brotes Dietética
   =============================================================================
   Pedido de la clienta (10/11/2026): la letra del panel, más grande. En
   Configuración, "Cambiar tamaño de fuente del sistema": 100% (como siempre),
   125%, 150%, 200% o 250%.

   CÓMO AGRANDA: cambia el tamaño de letra de la página (el font-size de <html>).
   Casi todo el panel mide la letra y los márgenes en rem, que es justamente ese
   tamaño, así que crece el texto de todas las pantallas sin tocar cada una.
   NO se usa zoom (que agranda todo, como el Ctrl + del navegador), aunque parezca
   lo mismo: con zoom también se multiplica lo que está medido contra el alto de la
   pantalla (vh), y la ventana de la venta quedaba más alta que la pantalla, cortada
   arriba, ya al 125% (medido en el sandbox, en 1366 x 768).

   SE GUARDA EN ESTA COMPUTADORA (localStorage), no en la base: depende de la
   pantalla de cada una, no lee ni escribe Firestore, y se aplica antes de dibujar,
   sin que la pantalla salga chica y después salte. Por eso este archivo se carga
   en el <head>, antes que todo lo demás: lo de arriba de todo corre en ese momento
   y solo toca <html>, que ya existe.

   Al elegir otro tamaño se confirma y se vuelve a cargar el panel entero (pedido
   de Thiago: "se reinicia la página por completo por las dudas").

   Con la letra agrandada, <html> lleva data-letra y admin.html acomoda lo que no
   crece solo porque está medido en px: el ancho del menú, el lugar del menú debajo
   de la barra de arriba y los casilleros de números que se cortaban. Con 100% no
   hay data-letra: el panel queda exactamente como siempre.
   ============================================================================= */

const LETRA_CLAVE = 'brotesTamanioLetra';
const LETRA_OPCIONES = [100, 125, 150, 200, 250];

/* Lo guardado en esta computadora, o 100. Si el navegador no deja leer (datos del
   sitio bloqueados) o hay algo raro guardado, queda en 100: nunca rompe el panel. */
function letraGuardada() {
  let v = null;
  try { v = parseInt(localStorage.getItem(LETRA_CLAVE), 10); } catch (e) { v = null; }
  return LETRA_OPCIONES.indexOf(v) >= 0 ? v : 100;
}

function aplicarLetra(v) {
  const raiz = document.documentElement;
  if (v === 100 || LETRA_OPCIONES.indexOf(v) < 0) {
    raiz.style.fontSize = '';
    raiz.removeAttribute('data-letra');
    raiz.style.removeProperty('--letra-barra');
    return;
  }
  raiz.style.fontSize = v + '%';
  raiz.setAttribute('data-letra', String(v));
}

/* El tamaño con que se abrió esta página. Elegir otro recarga, así que no cambia. */
const _letraActual = letraGuardada();
aplicarLetra(_letraActual);

/* La barra de arriba crece con la letra (69 px al 100%, 155 al 250%), y el menú
   estaba pegado debajo de una barra de 57: al bajar la página, la barra le tapaba
   las primeras opciones. Con la letra agrandada el menú se pega donde termina la
   barra de verdad. Se mide cuando aparece el panel (al iniciar sesión, #dashboard
   pasa a display:block), si la barra cambia de tamaño y si cambia la ventana. */
function _letraMedirBarra() {
  const barra = document.querySelector('.topbar');
  if (!barra || !barra.offsetHeight) return;
  document.documentElement.style.setProperty('--letra-barra', barra.offsetHeight + 'px');
}

/* Las opciones de Configuración. El "Aa" de cada una sale del tamaño real que va a
   tener, aunque la página ya esté agrandada: así se ve antes de elegir. */
function pintarOpcionesLetra() {
  const cont = document.getElementById('letraOpciones');
  if (!cont) return;
  cont.innerHTML = LETRA_OPCIONES.map(v => {
    const activa = v === _letraActual;
    const tam = Math.round(v / _letraActual * 1000) / 1000;
    return '<button type="button" class="letra-op' + (activa ? ' activa' : '') + '"' +
      ' onclick="elegirLetra(' + v + ')" aria-pressed="' + activa + '">' +
      '<span class="letra-op-aa" style="font-size:' + tam + 'rem">Aa</span>' +
      '<span class="letra-op-pct">' + (activa ? '<i class="bi bi-check-circle-fill"></i> ' : '') + v + '%</span>' +
      '<span class="letra-op-nota">' + (activa ? 'En uso' : (v === 100 ? 'Normal' : '&nbsp;')) + '</span>' +
      '</button>';
  }).join('');
}

let _letraEligiendo = false;

async function elegirLetra(v) {
  if (LETRA_OPCIONES.indexOf(v) < 0 || v === _letraActual || _letraEligiendo) return;
  _letraEligiendo = true;
  try {
    const msg = 'La letra de todo el panel va a quedar ' +
      (v === 100 ? 'en su tamaño normal (100%).' : 'al ' + v + '%.') +
      '\nPara cambiarla, el panel se vuelve a cargar, como cuando se aprieta F5.';
    const si = typeof pedirConfirmacion === 'function'
      ? await pedirConfirmacion(msg, { titulo: 'Cambiar el tamaño de la letra', aceptar: 'Cambiar', icono: 'bi-fonts' })
      : window.confirm(msg);
    if (!si) return;
    try {
      if (v === 100) localStorage.removeItem(LETRA_CLAVE);
      else localStorage.setItem(LETRA_CLAVE, String(v));
    } catch (e) { /* abajo se ve que no quedó */ }
    if (letraGuardada() !== v) {
      if (typeof showAdminToast === 'function') {
        showAdminToast('No se pudo guardar el tamaño en esta computadora: el navegador no lo permite.', 'error');
      }
      return;
    }
    window.location.reload();
  } finally {
    _letraEligiendo = false;
  }
}

document.addEventListener('DOMContentLoaded', function () {
  pintarOpcionesLetra();
  if (_letraActual === 100) return;
  _letraMedirBarra();
  /* El ResizeObserver avisa recién cuando el navegador dibuja; el MutationObserver,
     apenas el panel se muestra, aunque la pestaña esté atrás. */
  const panel = document.getElementById('dashboard');
  if (panel && typeof MutationObserver === 'function') {
    new MutationObserver(_letraMedirBarra).observe(panel, { attributes: true, attributeFilter: ['style'] });
  }
  const barra = document.querySelector('.topbar');
  if (barra && typeof ResizeObserver === 'function') new ResizeObserver(_letraMedirBarra).observe(barra);
  window.addEventListener('resize', _letraMedirBarra);
});

window.elegirLetra = elegirLetra;
