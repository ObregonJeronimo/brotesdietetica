/**
 * EL LOGIN SE MANEJA COMO EN YERCO: UNA SOLA FUENTE DE VERDAD.
 *
 * En YERCO el login funciona y en Brotes el popup se quedaba colgado. Comparando los
 * dos repos, la infraestructura resulto ser IDENTICA -mismo vercel.json con los dos
 * rewrites de /__/auth y /__/firebase, mismos headers (COOP, CSP, X-Frame-Options),
 * mismo SDK 10.12.0, el dominio autorizado en Firebase, App Check sin exigir en los
 * dos, y hasta el mismo cuerpo byte a byte en /__/auth/handler-. Lo unico distinto
 * era el codigo de la aplicacion:
 *
 *   - `_onUserLogin` lo llamaban CUATRO lugares en Brotes (DOMContentLoaded, el .then
 *     de getRedirectResult, el .then de signInWithPopup, y onAuthStateChanged) contra
 *     UNO en YERCO. Firebase avisa la misma sesion por varios de esos caminos a la vez.
 *   - En movil, Brotes arrancaba con `signInWithRedirect` en vez del popup. El redirect
 *     depende de cookies de terceros, que Safari/Firefox/Chrome bloquean: es MENOS
 *     confiable, no mas.
 *   - No habia guarda de reentrada ni de "mismo uid ya procesado", ni try/catch: si
 *     `_onUserLogin` tiraba, no habia nada que soltara el candado.
 *
 * Esta suite ejecuta el codigo REAL de app.js: el bloque de onAuthStateChanged -que no
 * es una funcion con nombre, se saca por posicion como el envoltorio de openModal- y
 * `authLogin`.
 */
const fs = require('fs');
const src = fs.readFileSync('app.js', 'utf8');

function cuerpo(nombre) {
  let i = src.indexOf('function ' + nombre + '(');
  if (i < 0) throw new Error('no encontre ' + nombre);
  if (src.slice(Math.max(0, i - 6), i) === 'async ') i -= 6;
  let prof = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (!prof) break; }
  }
  return src.slice(i, k + 1);
}

/* El listener de onAuthStateChanged es una arrow anonima: se saca por posicion. */
function bloqueAuthState() {
  const i = src.indexOf('authClient.onAuthStateChanged(async user => {');
  if (i < 0) throw new Error('no encontre el onAuthStateChanged de clientes');
  let prof = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (!prof) break; }
  }
  return src.slice(i, k + 1) + ');';
}

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + extra + ']' : '')); }
};

/* ============ 1) contrato: un solo llamador ============ */
console.log('\nUNA SOLA FUENTE DE VERDAD');
const llamadas = (src.match(/_onUserLogin\s*\(/g) || []).length;
const declaracion = (src.match(/function\s+_onUserLogin\s*\(/g) || []).length;
const llamadores = llamadas - declaracion;
t('_onUserLogin se llama desde UN solo lugar (en YERCO tambien)', llamadores === 1,
  llamadores + ' llamadores');
t('   y ese lugar es onAuthStateChanged',
  /onAuthStateChanged[\s\S]{0,900}?await _onUserLogin\(user, wasActive\)/.test(src));
t('el .then del popup NO inicia sesion por su cuenta',
  !/signInWithPopup[\s\S]{0,400}?_onUserLogin\(/.test(src));
t('getRedirectResult tampoco',
  !/getRedirectResult[\s\S]{0,600}?_onUserLogin\(/.test(src));
t('setPersistence va ANTES de onAuthStateChanged',
  src.indexOf('setPersistence') < src.indexOf('authClient.onAuthStateChanged'));

/* ============ 2) los guardas de onAuthStateChanged ============ */
function armarAuthState() {
  const reg = { logins: [], logouts: 0, navs: [], errores: [] };
  let alCambiar = null;
  const ent = {
    authClient: { onAuthStateChanged: cb => { alCambiar = cb; } },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    console: { error: (...a) => reg.errores.push(a.map(String).join(' ')), warn() {}, log() {} },
    _updateNavAuth: u => reg.navs.push(u.uid),
    _onUserLogout: () => { reg.logouts++; },
    /* Se controla desde afuera cuanto tarda y si explota. */
    _control: { demora: 0, explota: false },
    _reg: reg,
  };
  const nombres = Object.keys(ent);
  /* El listener se captura con un setter local (`_cb`) porque el bloque real hace
     `authClient.onAuthStateChanged(...)`: se le cambia el receptor por uno de mentira
     para poder dispararlo a mano y medir los guardas. */
  const fn = new Function(...nombres,
    'let clienteAuth=null,_loginActivo=false,_authProcesando=false,_ultimoUidProcesado=null;\n' +
    'let _cb=null;const authClientLocal={onAuthStateChanged:c=>{_cb=c;}};\n' +
    'async function _onUserLogin(user,wasActive){' +
    '  _reg.logins.push(user.uid+(wasActive?" (activo)":""));' +
    '  if(_control.demora)await new Promise(r=>setTimeout(r,_control.demora));' +
    '  if(_control.explota)throw new Error("firestore caido");' +
    '  clienteAuth={uid:user.uid};' +
    '}\n' +
    bloqueAuthState().replace('authClient.onAuthStateChanged', 'authClientLocal.onAuthStateChanged') +
    '\nreturn {disparar:u=>_cb(u),control:_control,' +
    'estado:()=>({procesando:_authProcesando,ultimoUid:_ultimoUidProcesado,tieneCliente:!!clienteAuth})};'
  )(...nombres.map(n => ent[n]));
  return { api: fn, reg };
}

(async () => {
  console.log('\nEL GUARDA DE REENTRADA');
  let a = armarAuthState();
  a.api.control.demora = 40;
  const p1 = a.api.disparar({ uid: 'u1' });
  const p2 = a.api.disparar({ uid: 'u1' });   /* Firebase avisa dos veces la misma sesion */
  await Promise.all([p1, p2]);
  t('dos avisos seguidos de la MISMA sesion procesan una sola vez',
    a.reg.logins.length === 1, JSON.stringify(a.reg.logins));

  console.log('\nEL GUARDA DE "MISMO UID YA PROCESADO"');
  a = armarAuthState();
  await a.api.disparar({ uid: 'u1' });
  await a.api.disparar({ uid: 'u1' });
  t('el segundo aviso solo redibuja el nav', a.reg.logins.length === 1, JSON.stringify(a.reg.logins));
  t('   y redibuja de verdad', a.reg.navs.length >= 1, JSON.stringify(a.reg.navs));

  console.log('\nOTRA CUENTA SI SE PROCESA');
  a = armarAuthState();
  await a.api.disparar({ uid: 'u1' });
  await a.api.disparar({ uid: 'u2' });
  t('cambiar de cuenta procesa la nueva', a.reg.logins.length === 2, JSON.stringify(a.reg.logins));

  console.log('\nSI _onUserLogin EXPLOTA, EL CANDADO SE SUELTA');
  a = armarAuthState();
  a.api.control.explota = true;
  await a.api.disparar({ uid: 'u1' });
  t('no queda procesando para siempre', a.api.estado().procesando === false,
    JSON.stringify(a.api.estado()));
  t('el error queda en consola', a.reg.errores.some(e => /_onUserLogin error/.test(e)),
    JSON.stringify(a.reg.errores));
  a.api.control.explota = false;
  await a.api.disparar({ uid: 'u1' });
  t('y el login siguiente SI se procesa (antes quedaba trabado)',
    a.reg.logins.length === 2, JSON.stringify(a.reg.logins));

  console.log('\nCERRAR SESION');
  a = armarAuthState();
  await a.api.disparar({ uid: 'u1' });
  await a.api.disparar(null);
  t('llama a _onUserLogout', a.reg.logouts === 1);
  t('y olvida el uid, asi el proximo login se procesa',
    a.api.estado().ultimoUid === null, a.api.estado().ultimoUid);

  /* ============ 3) authLogin: popup-first ============ */
  console.log('\nauthLogin: POPUP EN TODOS LOS DISPOSITIVOS');

  function armarLogin(esMovil, codigoDeError) {
    const reg = { popups: 0, redirects: 0, toasts: [], logins: 0 };
    const auth = {
      signInWithPopup: () => { reg.popups++;
        return codigoDeError ? Promise.reject({ code: codigoDeError, message: 'x' })
                             : Promise.resolve({ user: { uid: 'u1' } }); },
      signInWithRedirect: () => { reg.redirects++; return Promise.resolve(); },
    };
    const ent = {
      firebase: { auth: () => auth, auth_: null },
      _isMobileAuth: esMovil,
      sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      showToast: m => reg.toasts.push(m),
      console: { error() {}, warn() {}, log() {} },
      _reg: reg,
    };
    ent.firebase.auth.GoogleAuthProvider = function () {
      this.addScope = () => {}; this.setCustomParameters = () => {};
    };
    const nombres = Object.keys(ent);
    const fn = new Function(...nombres,
      'let _loginActivo=false;\n' +
      'function _onUserLogin(){_reg.logins++;}\n' +
      cuerpo('authLogin') + '\nreturn authLogin;')(...nombres.map(n => ent[n]));
    return { fn, reg };
  }

  let l = armarLogin(false);
  l.fn(); await new Promise(r => setTimeout(r, 20));
  t('en desktop usa popup', l.reg.popups === 1 && l.reg.redirects === 0,
    'popups=' + l.reg.popups + ' redirects=' + l.reg.redirects);
  t('   y NO llama a _onUserLogin (lo hace onAuthStateChanged)', l.reg.logins === 0, l.reg.logins);

  l = armarLogin(true);
  l.fn(); await new Promise(r => setTimeout(r, 20));
  t('en MOVIL tambien usa popup (antes arrancaba con redirect)',
    l.reg.popups === 1 && l.reg.redirects === 0,
    'popups=' + l.reg.popups + ' redirects=' + l.reg.redirects);

  console.log('\nY el redirect queda como fallback cuando el popup no es viable');
  for (const cod of ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment',
                     'auth/web-storage-unsupported', 'auth/network-request-failed']) {
    l = armarLogin(false, cod);
    l.fn(); await new Promise(r => setTimeout(r, 20));
    t('  ' + cod + ' -> redirect', l.reg.redirects === 1, 'redirects=' + l.reg.redirects);
  }

  l = armarLogin(true, 'auth/popup-closed-by-user');
  l.fn(); await new Promise(r => setTimeout(r, 20));
  t('en movil, popup-closed-by-user es el navegador bloqueando: cae a redirect',
    l.reg.redirects === 1, 'redirects=' + l.reg.redirects);

  l = armarLogin(false, 'auth/popup-closed-by-user');
  l.fn(); await new Promise(r => setTimeout(r, 20));
  t('en desktop, cerrar el popup a proposito NO muestra error',
    l.reg.toasts.length === 0, JSON.stringify(l.reg.toasts));

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})();
