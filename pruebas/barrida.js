/**
 * BARRIDA DE CLICS
 * =============================================================================
 * Recorre el panel apretando todo lo que se puede apretar, y anota los clics que
 * NO HACEN NADA.
 *
 * POR QUÉ EXISTE
 *
 * El detalle de items de una venta no se abría al hacer clic. Estuvo así mucho
 * tiempo. Ninguna prueba automática lo iba a encontrar -el código estaba bien
 * escrito, el handler existía, no había ningún error- y yo tampoco, porque uno
 * prueba lo que está construyendo y ese botón no era parte de nada nuevo. Lo
 * encontró una persona abriendo el panel sin plan y tocando lo primero que vio.
 *
 * Esto no reemplaza a esa persona. Cubre UNA sola clase de error, la más tonta y
 * la más difícil de ver leyendo: el clic que no hace nada.
 *
 * CÓMO DECIDE QUE "NO PASÓ NADA"
 *
 * Antes de cada clic saca una huella del documento -cuánto HTML hay, qué modales
 * están abiertos, cuántos elementos visibles-. Después del clic saca otra. Si son
 * idénticas, y tampoco apareció un aviso ni un error de consola ni cambió la
 * dirección, ese clic no hizo nada observable.
 *
 * Eso no siempre es un bug: hay botones que legítimamente no cambian nada visible
 * -un "copiar al portapapeles", por ejemplo-. Por eso la salida es una LISTA PARA
 * MIRAR, no un veredicto.
 *
 * LO QUE NO TOCA
 *
 * Nada que borre, guarde, imprima o cierre sesión. En el sandbox borrar no cuesta
 * nada, pero si la barrida borra los datos en el elemento 20, los otros 160 clics
 * se hacen contra un panel vacío y no prueban nada.
 *
 * NO SE CORRE SOLO CON npm test: necesita el sandbox levantado y un navegador.
 * Se usa desde la consola del panel, o desde una herramienta que maneje el
 * navegador. Ver pruebas/barrida.md.
 * =============================================================================
 */
(function () {
  'use strict';

  /* Lo que NO se aprieta. Se compara contra el texto y contra el onclick. */
  const PROHIBIDO = [
    /borrar|eliminar|delete|quitar/i,
    /guardar|registrar venta|confirmar|aplicar|cargar compra/i,
    /imprimir|exportar|descargar|pdf|excel/i,
    /salir|cerrar sesi|logout|signout/i,
    /sembrar|reasignar|migrar|importar/i,
    /pagar|canjear|entregar/i,
  ];

  /* Un envoltorio cuyo unico onclick es frenar la propagacion NO es un boton:
     esta ahi justamente para no hacer nada. En las tarjetas de venta hay un
     <div onclick="event.stopPropagation()"> que envuelve a Editar y Factura,
     para que el clic en esos botones no abra tambien la tarjeta de atras.
     Apretarlo y anotar que "no hace nada" es describir su trabajo, no encontrar
     un error. */
  const soloFrenaElClic = (el) => {
    const oc = (el.getAttribute('onclick') || '').replace(/[\s;]/g, '');
    return oc === 'event.stopPropagation()' ||
           oc === 'event.stopPropagation()event.preventDefault()' ||
           oc === 'event.preventDefault()';
  };

  const esPeligroso = (el) => {
    const txt = (el.textContent || '') + ' ' + (el.getAttribute('onclick') || '') +
                ' ' + (el.getAttribute('title') || '') + ' ' + (el.className || '');
    return PROHIBIDO.some((r) => r.test(txt));
  };

  /* Huella de lo que SE VE en la pantalla.

     La primera version comparaba document.body.innerHTML. Estaba mal, y mal
     justo para el caso que importa: el bug de v-items agrega la clase "show" al
     div, o sea que el HTML CAMBIA aunque el bloque siga invisible. La barrida
     habria dado por bueno el unico clic que vino a buscar.

     innerText devuelve solo el texto RENDERIZADO -lo que esta oculto no
     aparece-, asi que si un bloque se abre, crece; y si el clic no muestra nada,
     queda igual. Es la senal correcta y ademas es barata (0.2ms contra 4.3ms de
     innerHTML). */
  function huella() {
    const texto = document.body.innerText || '';
    let h = 0;
    for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) | 0;
    const visibles = [...document.querySelectorAll('body *')]
      .filter((e) => e.offsetParent !== null).length;
    const abiertos = [...document.querySelectorAll('.modal-overlay.show')]
      .map((e) => e.id || e.className).sort().join('|');
    return [texto.length, h, visibles, abiertos, location.hash,
            (document.querySelector('.admin-toast') || {}).textContent || ''].join('#');
  }

  /* Esperar sin setTimeout.

     Chrome estrangula los timers de las pestanas que no se estan viendo: un
     setTimeout de 140ms tarda ~900ms, y despues de 5 minutos oculta pasa a UNO
     POR MINUTO. Con eso la barrida tarda horas y parece colgada.

     MessageChannel no es un timer, es una tarea comun, y no lo estrangulan. Se
     encadenan tareas hasta cumplir el tiempo: el navegador sigue teniendo sus
     turnos para pintar y para contestar lo de Firestore, que es lo que hace
     falta para que el clic alcance a tener efecto. */
  function dormir(ms) {
    if (typeof MessageChannel !== 'function') {
      return new Promise((r) => setTimeout(r, ms));
    }
    return new Promise((listo) => {
      const fin = performance.now() + ms;
      const ch = new MessageChannel();
      ch.port1.onmessage = () => {
        if (performance.now() >= fin) { ch.port1.close(); listo(); }
        else ch.port2.postMessage(0);
      };
      ch.port2.postMessage(0);
    });
  }

  /* Un nombre con el que una persona pueda encontrar el elemento después. */
  function describir(el) {
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    const on = (el.getAttribute('onclick') || '').replace(/\s+/g, ' ').slice(0, 60);
    const cls = (typeof el.className === 'string' ? el.className : '').split(/\s+/)[0] || '';
    return { texto: t, onclick: on, clase: cls, id: el.id || '' };
  }

  async function barrer(opciones) {
    const o = Object.assign({ espera: 180, limite: 120, seccion: '' }, opciones || {});
    const errores = [];

    /* confirm/alert/prompt NATIVOS bloquean el hilo entero: si un boton abre uno,
       la barrida queda colgada para siempre y no se entiende por que. Se los
       reemplaza mientras dura, contestando siempre que NO -para que ninguna
       accion peligrosa que se haya escapado del filtro llegue a ejecutarse-. */
    const nativos = { confirm: window.confirm, alert: window.alert, prompt: window.prompt };
    window.confirm = () => false;
    window.alert = () => {};
    window.prompt = () => null;
    /* Lo mismo con el dialogo propio del panel, que espera a que alguien
       responda: si nadie responde, la promesa nunca se resuelve. */
    const dialogoOriginal = window.pedirConfirmacion;
    window.pedirConfirmacion = async () => false;
    const restaurar = () => {
      window.confirm = nativos.confirm; window.alert = nativos.alert;
      window.prompt = nativos.prompt;
      if (dialogoOriginal) window.pedirConfirmacion = dialogoOriginal;
    };
    const origErr = window.onerror;
    window.onerror = function (m) { errores.push(String(m)); if (origErr) return origErr.apply(this, arguments); };

    /* Solo lo que se ve: un boton adentro de un modal cerrado no se puede
       apretar de verdad, y contarlo como "no hace nada" seria mentir. */
    const SELECTOR = 'button, [onclick], .venta-card, .prov-item, .deu-cab, [role="button"]';
    const mirarAhora = () => {
      const ambito = (o.raiz && document.querySelector(o.raiz)) || document;
      return [...ambito.querySelectorAll(SELECTOR)]
        .filter((el) => el.offsetParent !== null)
        .filter((el) => !el.disabled)
        .filter((el) => !soloFrenaElClic(el));
    };

    /* La lista se vuelve a pedir en CADA vuelta, no una sola vez al principio.

       Varias secciones se dibujan de nuevo enteras cuando se vuelve a entrar
       -loadVentas(), loadCupones()-, asi que los elementos guardados al empezar
       quedan huerfanos: el recorrido los encontraba fuera del documento y los
       daba por "desaparecidos". Una seccion con treinta botones quedaba revisada
       con tres clics.

       Pidiendolos de nuevo cada vez, tambien entran los que aparecen despues: si
       un clic abre un panel con mas botones adentro, esos tambien se prueban. */
    const firma = (el) => [el.id, el.tagName, el.getAttribute('onclick') || '',
      (el.textContent || '').trim().slice(0, 40),
      typeof el.className === 'string' ? el.className : ''].join('|');

    const mudos = [];
    const rotos = [];
    const yaVistos = new Set();
    let apretados = 0, peligrosos = 0;

    while (yaVistos.size < o.limite) {
      const el = mirarAhora().find((c) => !yaVistos.has(firma(c)));
      if (!el) break;
      yaVistos.add(firma(el));
      if (esPeligroso(el)) { peligrosos++; continue; }

      const antes = huella();
      const erroresAntes = errores.length;
      try {
        el.click();
      } catch (e) {
        rotos.push(Object.assign(describir(el), { error: e.message }));
        continue;
      }
      apretados++;
      window.__barridaProgreso = o.seccion + ' ' + apretados + ' apretados';
      await dormir(o.espera);
      const despues = huella();

      if (errores.length > erroresAntes) {
        rotos.push(Object.assign(describir(el), { error: errores[errores.length - 1] }));
      } else if (antes === despues) {
        mudos.push(describir(el));
      }

      /* Si se abrió un modal, se cierra para que el siguiente clic no quede tapado. */
      const abierto = document.querySelector('.modal-overlay.show');
      if (abierto) {
        const x = abierto.querySelector('.modal-close');
        if (x) { x.click(); await dormir(o.espera); }
        else { abierto.classList.remove('show'); }
      }

      /* Hay botones que cambian de seccion -"Importar Costos" lleva a otra
         pantalla-. Cuando eso pasa, la seccion que se estaba barriendo se
         esconde y TODO lo que faltaba queda invisible: la barrida daba por
         revisada una seccion en la que habia apretado tres cosas. Se vuelve. */
      if (o.seccion && typeof switchSection === 'function') {
        const propia = document.getElementById('sec-' + o.seccion);
        if (propia && !propia.classList.contains('active')) {
          switchSection(o.seccion);
          await dormir(o.espera * 2);
        }
      }
    }

    window.onerror = origErr;
    restaurar();
    return {
      seccion: o.seccion,
      mirados: yaVistos.size,
      apretados: apretados,
      peligrosos: peligrosos,
      sinEfecto: mudos.length,
      conError: rotos.length,
      mudos: mudos,
      rotos: rotos,
    };
  }

  window.barrerPanel = barrer;
  window.barridaHuella = huella;
})();
