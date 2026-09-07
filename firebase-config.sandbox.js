/**
 * BROTES DIETÉTICA — CONFIGURACIÓN DEL SANDBOX
 * =============================================================================
 * Este archivo reemplaza a firebase-config.js SOLO en la ruta /sandbox, que la
 * sirve dev-server.js. El admin.html es el mismo archivo, sin una línea de
 * diferencia: lo único que cambia es a dónde se conecta.
 *
 * POR QUÉ NO SE PUEDE ESCRIBIR EN LA BASE DE LA CLIENTA DESDE ACÁ
 *
 * El proyecto se llama `demo-brotes`. Firebase trata cualquier nombre que
 * empiece con `demo-` como un proyecto que NO existe en la nube: los SDK solo
 * lo aceptan contra emuladores. No hay servidor de Google que responda a ese
 * nombre.
 *
 * O sea que la protección no es un `if` que revisa dónde estamos y que podría
 * fallar o quedar mal escrito. Es que la dirección de la clienta
 * -brotesdietetica-2f78e- NO ESTÁ EN ESTE ARCHIVO. Los datos no tienen a dónde
 * ir aunque se quisiera.
 *
 * Y este archivo tampoco llega a producción: se sirve desde dev-server.js, que
 * está en .vercelignore, y la ruta /sandbox no existe en Vercel.
 *
 * NO SE PRENDE EL CACHE EN DISCO
 *
 * firebase-config.js activa persistencia en IndexedDB para no pagar lecturas.
 * Acá no: el cache sobreviviría a un reinicio del emulador y estaríamos mirando
 * datos de una siembra anterior creyendo que son los nuevos.
 * =============================================================================
 */

const FIREBASE_PROJECT_ID = 'demo-brotes';

const firebaseConfig = {
    apiKey: 'demo-sandbox-no-es-una-clave',
    authDomain: location.hostname,
    projectId: FIREBASE_PROJECT_ID,
    storageBucket: FIREBASE_PROJECT_ID + '.appspot.com',
    messagingSenderId: '0',
    appId: 'demo-sandbox',
};

firebase.initializeApp(firebaseConfig);

const db = firebase.firestore();
db.useEmulator('127.0.0.1', 8080);
firebase.auth().useEmulator('http://127.0.0.1:9099', { disableWarnings: true });
if (typeof firebase.storage === 'function') {
    try { firebase.storage().useEmulator('127.0.0.1', 9199); } catch (e) { /* sin storage */ }
}

/* config-negocio.js lee config/siteContent por REST, sin el SDK. Sin esto esa
   petición se iría al proyecto de la clienta aunque el panel apunte al
   emulador: fue la única fuga que quedaba, y se encontró probando esto mismo. */
const FIRESTORE_REST_BASE = 'http://127.0.0.1:8080';

/* App Check apagado: no tiene sentido contra un emulador. Se declara igual
   porque el archivo real lo declara y algo podría leerlo. */
const RECAPTCHA_SITE_KEY = 'REEMPLAZAR-recaptcha-v3-site-key';
const DOMINIOS_PROPIOS = [];

/* ------------------------------------------------------------------ el cartel
   Tiene que ser imposible confundirse de dónde uno está parado. Va el título de
   la pestaña y una chapa fija que no tapa nada del panel. */
document.title = 'SANDBOX · ' + document.title;
(function cartel() {
    function poner() {
        if (document.getElementById('sandboxChapa')) return;
        const d = document.createElement('div');
        d.id = 'sandboxChapa';
        d.innerHTML = '<b>SANDBOX</b><span>base de prueba &middot; nada de esto es real</span>';
        d.style.cssText = [
            'position:fixed', 'left:12px', 'bottom:12px', 'z-index:2147483647',
            'background:#EDB833', 'color:#231a05', 'border-radius:9px',
            'padding:.45rem .8rem', 'font:600 12px/1.35 system-ui,sans-serif',
            'box-shadow:0 4px 18px rgba(0,0,0,.45)', 'pointer-events:none',
            'display:flex', 'flex-direction:column', 'letter-spacing:.3px',
        ].join(';');
        d.querySelector('span').style.cssText = 'font-weight:500;opacity:.8;font-size:10.5px';
        document.body.appendChild(d);
    }
    if (document.body) poner();
    else document.addEventListener('DOMContentLoaded', poner);
})();

/* --------------------------------------------------- el emulador no está
   Sin esto, el panel queda cargando para siempre y no se entiende por qué.
   Se avisa con todas las letras y se dice el comando que falta. */
(function chequear() {
    fetch('http://127.0.0.1:8080/', { mode: 'no-cors' }).catch(function () {
        const d = document.createElement('div');
        d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#12151b;' +
            'color:#e8edf4;display:flex;align-items:center;justify-content:center;' +
            'text-align:center;padding:2rem;font:15px/1.6 system-ui,sans-serif';
        d.innerHTML = '<div style="max-width:520px">' +
            '<div style="font-size:2.2rem;margin-bottom:.6rem">⚠️</div>' +
            '<h2 style="margin:0 0 .6rem">El emulador no está prendido</h2>' +
            '<p style="color:#8d9aad;margin:0 0 1rem">El sandbox necesita el emulador de ' +
            'Firebase corriendo. Sin eso no hay base a la que conectarse.</p>' +
            '<p style="color:#8d9aad;margin:0 0 .5rem">Corré esto en una terminal:</p>' +
            '<code style="display:block;background:#212832;border:1px solid #2c3543;' +
            'border-radius:8px;padding:.7rem;color:#7fd3a2;font-size:14px">npm run sandbox</code>' +
            '<p style="color:#8d9aad;font-size:13px;margin-top:1.2rem">Tranquilo: esta página ' +
            'no puede tocar la base real. Apunta a <b>demo-brotes</b>, que no existe en la nube.</p>' +
            '</div>';
        (document.body || document.documentElement).appendChild(d);
    });
})();
