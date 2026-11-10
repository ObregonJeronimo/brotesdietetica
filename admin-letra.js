/* =============================================================================
   TAMAÑO DE LA LETRA DEL PANEL  —  Brotes Dietética
   =============================================================================
   Pedido de la clienta (10/11/2026): la letra del panel, más grande. En
   Configuración, "Cambiar tamaño de fuente del sistema": 100% (como siempre),
   125%, 150% o 200%. El 250% se sacó (Thiago: "es demasiado").

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

   AL ELEGIR OTRO TAMAÑO (pedidos de Thiago):
   1. Se confirma. El 200% avisa antes que es muy grande y que algo se puede ver
      cortado, con "Entiendo y continuar" / "Cancelar".
   2. Se vuelve a cargar el panel entero ("por las dudas").
   3. Cuando el panel aparece de nuevo, pregunta si se queda así, con 15 segundos
      para apretar Aceptar. Si no se acepta (o se toca "Volver al anterior", Escape
      o afuera del aviso), vuelve solo al tamaño de antes y recarga, como el cartel
      de Windows al cambiar la pantalla: si el tamaño nuevo deja el panel difícil
      de usar, no hace falta encontrar el botón para volver. Mientras no se acepta,
      el tamaño de antes queda guardado aparte: si se cierra el navegador sin
      contestar, la próxima vez vuelve a preguntar.

   Con la letra agrandada, <html> lleva data-letra y admin.html acomoda lo que no
   crece solo porque está medido en px: el ancho del menú, el lugar del menú debajo
   de la barra de arriba, las ventanas y los casilleros de números que se cortaban.
   Con 100% no hay data-letra: el panel queda exactamente como siempre.
   ============================================================================= */

const LETRA_CLAVE = 'brotesTamanioLetra';
/* El tamaño de antes, mientras no se acepta el nuevo. */
const LETRA_CLAVE_PRUEBA = 'brotesTamanioLetraPrueba';
/* Para avisar, después de recargar, que volvió al tamaño de antes. */
const LETRA_CLAVE_VOLVIO = 'brotesTamanioLetraVolvio';
const LETRA_OPCIONES = [100, 125, 150, 200];
/* El que avisa antes de cambiar que es muy grande. */
const LETRA_MUY_GRANDE = 200;
/* Para aceptar el tamaño nuevo antes de que vuelva solo al de antes. */
const LETRA_SEGUNDOS = 15;

function _letraLeer(k) {
  try { return localStorage.getItem(k); } catch (e) { return null; }
}
function _letraBorrar(k) {
  try { localStorage.removeItem(k); } catch (e) { /* nada que hacer */ }
}
/* Un número de la lista, o 100. */
function _letraValida(t) {
  const v = parseInt(t, 10);
  return LETRA_OPCIONES.indexOf(v) >= 0 ? v : 100;
}

/* Lo guardado en esta computadora, o 100. Si el navegador no deja leer (datos del
   sitio bloqueados) o hay algo raro guardado, queda en 100: nunca rompe el panel. */
function letraGuardada() {
  return _letraValida(_letraLeer(LETRA_CLAVE));
}

/* El tamaño de antes de un cambio que todavía no se aceptó, o null si no hay. */
function letraEnPrueba() {
  const t = _letraLeer(LETRA_CLAVE_PRUEBA);
  return t === null ? null : _letraValida(t);
}

/* Guarda el tamaño (el 100 no se guarda: es no tener nada) y dice si quedó. */
function _letraGuardarTamanio(v) {
  try {
    if (v === 100) localStorage.removeItem(LETRA_CLAVE);
    else localStorage.setItem(LETRA_CLAVE, String(v));
  } catch (e) { /* abajo se ve que no quedó */ }
  return letraGuardada() === v;
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

/* "al 150%" o "a su tamaño normal (100%)". */
function _letraTexto(v) {
  return v === 100 ? 'en su tamaño normal (100%)' : 'al ' + v + '%';
}

/* La barra de arriba crece con la letra (69 px al 100%, 132 al 200%), y el menú
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
    const nota = activa ? 'En uso' : v === 100 ? 'Normal' : v === LETRA_MUY_GRANDE ? 'Muy grande' : '&nbsp;';
    return '<button type="button" class="letra-op' + (activa ? ' activa' : '') + '"' +
      ' onclick="elegirLetra(' + v + ')" aria-pressed="' + activa + '">' +
      '<span class="letra-op-aa" style="font-size:' + tam + 'rem">Aa</span>' +
      '<span class="letra-op-pct">' + (activa ? '<i class="bi bi-check-circle-fill"></i> ' : '') + v + '%</span>' +
      '<span class="letra-op-nota">' + nota + '</span>' +
      '</button>';
  }).join('');
}

/* Los avisos del panel (admin-dialogo.js); si no estuvieran, el del navegador. */
function _letraPreguntar(msg, opts) {
  return typeof pedirConfirmacion === 'function'
    ? pedirConfirmacion(msg, opts)
    : Promise.resolve(window.confirm(msg));
}

function _letraAvisar(msg, tipo) {
  if (typeof showAdminToast === 'function') showAdminToast(msg, tipo);
}

let _letraEligiendo = false;

async function elegirLetra(v) {
  if (LETRA_OPCIONES.indexOf(v) < 0 || v === _letraActual || _letraEligiendo) return;
  _letraEligiendo = true;
  try {
    const si = v === LETRA_MUY_GRANDE
      ? await _letraPreguntar(
          'Con la letra al 200%, en una pantalla común (por ejemplo, la de una notebook) algunas partes ' +
          'del panel pueden no entrar y verse cortadas.' +
          '\nSe recomienda usarlo solo con un monitor grande, de alta resolución.' +
          '\nSi seguís, el panel se vuelve a cargar.',
          { titulo: 'El 200% es un tamaño muy grande', aceptar: 'Entiendo y continuar', cancelar: 'Cancelar',
            icono: 'bi-exclamation-triangle', cuidado: true, focoEnNo: true })
      : await _letraPreguntar(
          'La letra de todo el panel va a quedar ' + _letraTexto(v) + '.' +
          '\nPara cambiarla, el panel se vuelve a cargar, como cuando se aprieta F5.',
          { titulo: 'Cambiar el tamaño de la letra', aceptar: 'Cambiar', icono: 'bi-fonts' });
    if (!si) return;
    /* Primero el de antes (para volver si no se acepta) y después el nuevo. Si alguno
       no queda, se deja todo como estaba: sin el de antes no se podría volver solo. */
    try { localStorage.setItem(LETRA_CLAVE_PRUEBA, String(_letraActual)); } catch (e) { /* se ve abajo */ }
    if (letraEnPrueba() !== _letraActual || !_letraGuardarTamanio(v)) {
      _letraBorrar(LETRA_CLAVE_PRUEBA);
      _letraGuardarTamanio(_letraActual);
      _letraAvisar('No se pudo guardar el tamaño en esta computadora: el navegador no lo permite.', 'error');
      return;
    }
    window.location.reload();
  } finally {
    _letraEligiendo = false;
  }
}

/* El aviso de "¿Mantener?" va recién cuando se ve el panel: antes de iniciar sesión
   la pantalla de ingreso lo taparía y la cuenta correría sin que nadie la vea. */
function _letraPanelListo() {
  const panel = document.getElementById('dashboard');
  const ingreso = document.getElementById('loginScreen');
  return !!panel && panel.style.display === 'block' && (!ingreso || ingreso.style.display === 'none');
}

function _letraMensajeQueda(antes, seg) {
  return 'Se cambió el tamaño de la letra ' + (_letraActual === 100 ? 'al tamaño normal (100%)' : 'al ' + _letraActual + '%') + '.' +
    '\nApretá ACEPTAR para mantenerlo. Si no, en ' + seg + (seg === 1 ? ' segundo' : ' segundos') +
    ' vuelve solo al tamaño anterior (' + antes + '%).';
}

let _letraPreguntado = false;

async function _letraPreguntarSiQueda() {
  if (_letraPreguntado) return;
  const antes = letraEnPrueba();
  if (antes === null) return;
  if (antes === _letraActual) { _letraBorrar(LETRA_CLAVE_PRUEBA); return; }
  _letraPreguntado = true;
  const titulo = '¿Mantener el nuevo tamaño de letra?';
  let queda;
  if (typeof pedirConfirmacion === 'function') {
    const respuesta = pedirConfirmacion(_letraMensajeQueda(antes, LETRA_SEGUNDOS),
      { titulo: titulo, aceptar: 'Aceptar', cancelar: 'Volver al anterior', icono: 'bi-fonts' });
    /* pedirConfirmacion arma el aviso en el momento: se le va bajando la cuenta y, en
       cero, se toca "Volver al anterior". Por las dudas, la cuenta también contesta
       sola aunque no encuentre el aviso. */
    const ov = [].slice.call(document.querySelectorAll('.dlg-overlay')).filter(o => {
      const h = o.querySelector('h3');
      return h && h.textContent === titulo;
    }).pop();
    const fin = Date.now() + LETRA_SEGUNDOS * 1000;
    let mostrado = LETRA_SEGUNDOS, reloj = null;
    const agotado = new Promise(res => {
      reloj = setInterval(() => {
        const seg = Math.max(0, Math.ceil((fin - Date.now()) / 1000));
        if (seg !== mostrado && ov) {
          mostrado = seg;
          const m = ov.querySelector('.dlg-msg');
          if (m && typeof _dlgTexto === 'function') m.innerHTML = _dlgTexto(_letraMensajeQueda(antes, seg));
        }
        if (seg <= 0) {
          clearInterval(reloj);
          const no = ov && ov.querySelector('.dlg-no');
          if (no) no.click();
          res(false);
        }
      }, 250);
    });
    queda = await Promise.race([respuesta, agotado]);
    clearInterval(reloj);
  } else {
    queda = window.confirm(_letraMensajeQueda(antes, LETRA_SEGUNDOS));
  }
  /* Si mientras tanto se contestó en otra pestaña del panel, ya no hay nada que hacer. */
  if (letraEnPrueba() === null) return;
  _letraBorrar(LETRA_CLAVE_PRUEBA);
  if (queda) {
    _letraAvisar('Listo: la letra queda ' + _letraTexto(_letraActual) + '.', 'success');
    return;
  }
  _letraGuardarTamanio(antes);
  try { localStorage.setItem(LETRA_CLAVE_VOLVIO, String(antes)); } catch (e) { /* sin el aviso */ }
  window.location.reload();
}

/* Después de volver solo al tamaño de antes, lo dice una vez. */
function _letraAvisarSiVolvio() {
  const t = _letraLeer(LETRA_CLAVE_VOLVIO);
  if (t === null) return;
  _letraBorrar(LETRA_CLAVE_VOLVIO);
  if (_letraValida(t) === _letraActual) _letraAvisar('La letra volvió al tamaño anterior (' + _letraActual + '%).', 'info');
}

function _letraAlMostrarPanel() {
  if (_letraActual !== 100) _letraMedirBarra();
  if (!_letraPanelListo()) return;
  _letraAvisarSiVolvio();
  _letraPreguntarSiQueda();
}

document.addEventListener('DOMContentLoaded', function () {
  pintarOpcionesLetra();
  const pendiente = letraEnPrueba() !== null || _letraLeer(LETRA_CLAVE_VOLVIO) !== null;
  if (_letraActual === 100 && !pendiente) return;
  _letraAlMostrarPanel();
  /* El ResizeObserver avisa recién cuando el navegador dibuja; el MutationObserver,
     apenas el panel se muestra, aunque la pestaña esté atrás. */
  const panel = document.getElementById('dashboard');
  if (panel && typeof MutationObserver === 'function') {
    new MutationObserver(_letraAlMostrarPanel).observe(panel, { attributes: true, attributeFilter: ['style'] });
  }
  if (_letraActual === 100) return;
  const barra = document.querySelector('.topbar');
  if (barra && typeof ResizeObserver === 'function') new ResizeObserver(_letraMedirBarra).observe(barra);
  window.addEventListener('resize', _letraMedirBarra);
});

window.elegirLetra = elegirLetra;
