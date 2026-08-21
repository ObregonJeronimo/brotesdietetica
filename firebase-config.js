/**
 * BROTES DIETÉTICA — CONFIGURACIÓN FIREBASE
 * =============================================================================
 * PEGAR ACÁ los datos del proyecto nuevo:
 *   Firebase Console → ⚙ Configuración del proyecto → Tus apps → App web → SDK
 * Ver SETUP.md paso 1.
 *
 * ¿Es seguro que estas claves estén en el repo y a la vista?  SÍ.
 * La `apiKey` de Firebase Web NO es un secreto: identifica al proyecto, no
 * autoriza nada. Google lo documenta así. Lo que realmente protege los datos es:
 *   1) firestore.rules       → quién puede leer/escribir cada colección
 *   2) App Check (reCAPTCHA) → que las peticiones vengan de esta web y no de un bot
 *   3) Dominios autorizados  → en qué dominios funciona el login de Google
 * Lo que NUNCA va en este archivo (ni en ningún archivo del repo):
 *   claves de cuenta de servicio, el token del bot de Telegram, la clave SECRETA
 *   de reCAPTCHA. Eso vive en Firestore (config/telegram) o en la consola.
 * =============================================================================
 */

/* -----------------------------------------------------------------------------
   DOMINIOS PROPIOS (login de Google en celulares)
   -----------------------------------------------------------------------------
   Firebase, por defecto, hace el login a través de <proyecto>.firebaseapp.com.
   En Android/iOS eso rompe: el navegador bloquea las cookies de terceros y el
   login queda colgado. La solución (igual que en YERCO) es hacer que el login
   pase por NUESTRO dominio, usando el reverse proxy `/__/auth/*` que está
   configurado en vercel.json.

   Por eso: si estamos en uno de nuestros dominios, authDomain = ese dominio.
   Si estamos en localhost o en un preview de Vercel (donde el proxy igual
   funciona pero el dominio no está autorizado en Firebase), usamos el de
   Firebase.

   AL AGREGAR UN DOMINIO ACÁ, agregalo también en:
     Firebase Console → Authentication → Settings → Dominios autorizados
     y en el CSP de vercel.json (frame-src).
----------------------------------------------------------------------------- */
const DOMINIOS_PROPIOS = [
    'brotesdietetica.vercel.app',
    // 'brotesdietetica.com.ar',
    // 'www.brotesdietetica.com.ar',
];

const FIREBASE_PROJECT_ID = 'brotesdietetica-2f78e';

const firebaseConfig = {
    apiKey: "AIzaSyDJR-UH10vR39Gmu6AJxhR6egeFwzGMPSI",
    authDomain: DOMINIOS_PROPIOS.includes(location.hostname)
        ? location.hostname
        : `${FIREBASE_PROJECT_ID}.firebaseapp.com`,
    projectId: FIREBASE_PROJECT_ID,
    storageBucket: `${FIREBASE_PROJECT_ID}.firebasestorage.app`,
    messagingSenderId: "365050888270",
    appId: "1:365050888270:web:d48b87afb039126889c31f"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

/* Cache en disco (IndexedDB).
   Sin esto, CADA visita a la tienda vuelve a bajar el catalogo completo desde
   Firestore: con 3.000 productos son 3.000 lecturas por persona que entra, y en
   Blaze eso se paga. Con el cache, la segunda vuelta sale de la maquina del
   visitante y no cuesta nada.

   Hay que llamarlo ANTES de cualquier otra operacion de Firestore, por eso esta
   aca y no en app.js.

   Se ignoran los dos errores esperables en vez de tirar la pagina:
     failed-precondition -> hay otra pestaña con la tienda abierta. IndexedDB no se
                            comparte entre pestañas, asi que gana la primera y las
                            demas siguen andando sin cache.
     unimplemented       -> el navegador no lo soporta (modo privado de algunos, o
                            Safari viejo). Tambien sigue andando sin cache. */
/* La consola avisa que enableMultiTabIndexedDbPersistence() va a quedar obsoleto y
   que en su lugar conviene FirestoreSettings.cache. Es un aviso a futuro, no un
   error: sigue funcionando y en la v10 va a seguir funcionando.
   No se puede cambiar sin migrar el proyecto entero: el reemplazo son
   persistentLocalCache() y persistentMultipleTabManager(), que son de la API
   MODULAR, y el SDK compat 10.12 no las expone (verificado en el navegador:
   firebase.firestore.persistentLocalCache es undefined). Cambiarlo implica pasar
   todo el proyecto de compat a modular, o sea reescribir cada db.collection(...)
   de app.js, admin.html y los seis modulos.
   Se deja el aviso a la vista a proposito: taparlo seria esconderle a quien siga
   el proyecto que esta migracion existe y en algun momento hay que hacerla. */
if (db.enablePersistence) {
    db.enablePersistence({ synchronizeTabs: true }).catch(function (e) {
        if (e && e.code !== 'failed-precondition' && e.code !== 'unimplemented') {
            console.warn('Cache local no disponible:', e);
        }
    });
}

/* App Check — protección contra abuso (bots llenando pedidos basura).
   Es la CLAVE DE SITIO de reCAPTCHA v3, es pública. La clave secreta se pega
   en la consola de Firebase, nunca acá. Ver SETUP.md paso 5. */
const RECAPTCHA_SITE_KEY = 'REEMPLAZAR-recaptcha-v3-site-key';

if (typeof firebase.appCheck === 'function' && !RECAPTCHA_SITE_KEY.startsWith('REEMPLAZAR')) {
    const appCheck = firebase.appCheck();
    appCheck.activate(RECAPTCHA_SITE_KEY, true);
}
