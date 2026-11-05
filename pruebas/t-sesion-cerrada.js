/**
 * LA SESION CERRADA CON EL PANEL ABIERTO (05/11/2026).
 *
 * A la clienta se le cerro la sesion a las 12:03 con una venta abierta (con "Salir", en otra
 * pestaña de la tienda, que comparte la sesion, o porque el navegador la borro). El panel volvia
 * a la pantalla de ingreso, pero la ventana de la venta esta fuera del panel y quedaba encima:
 * siguio intentando guardar hasta las 12:21 y la base rechazaba todo con "Missing or insufficient
 * permissions", en ingles y sin decir que hacer. Ninguna venta se guardo a medias.
 *
 * Lo que se sostiene aca:
 *   - la pantalla de ingreso tapa todo (ventanas y avisos); lo abierto sigue ahi al volver;
 *   - si se cierra la sesion estando adentro, dice que paso (no si fue con "Salir" a proposito);
 *   - si entra OTRA cuenta que no es admin con el panel abierto, el panel se tapa; con la MISMA
 *     cuenta y un corte al comprobarla, no;
 *   - el error de permisos se dice en castellano, distinto con sesion y sin sesion.
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + JSON.stringify(extra).slice(0, 300) + ']' : '')); }
};
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

/* ================= la pantalla de ingreso tapa todo ================= */
console.log('\n-- la pantalla de ingreso, arriba de todo --');
{
  const reglas = [...src.matchAll(/\.login-screen\{([^}]*)\}/g)].map(m => m[1]).join(';');
  const zLogin = Number((reglas.match(/z-index:(\d+)/) || [])[1] || 0);
  const zModal = Number(((src.match(/\.modal-overlay\{[^}]*z-index:(\d+)/) || [])[1]) || 0);
  const dlg = fs.readFileSync(path.join(__dirname, '..', 'admin-dialogo.js'), 'utf8');
  const zDlg = Number(((dlg.match(/zIndex = String\((\d+) \+ _dlgAbiertos\)/) || [])[1]) || 0);
  t('queda fija y ocupa toda la pantalla', /position:fixed/.test(reglas) && /inset:0/.test(reglas), reglas);
  t('arriba de las ventanas (' + zModal + ') y de los avisos de confirmacion (' + zDlg + ' en adelante)', zModal > 0 && zDlg > 0 && zLogin > zModal && zLogin >= zDlg + 100, { zLogin, zModal, zDlg });
  t('y si es mas alta que la pantalla, se puede bajar', /overflow-y:auto/.test(reglas));
}

/* ================= el error de permisos, en castellano ================= */
console.log('\n-- el error de permisos, en castellano --');
function toast(msg, type, conAuth) {
  const area = { hijos: [], appendChild(x) { this.hijos.push(x); } };
  const doc = { getElementById: id => (id === 'toastArea' ? area : null), createElement: () => ({ style: {}, remove() {} }) };
  const args = ['document', 'setTimeout'].concat(conAuth === undefined ? [] : ['auth']);
  const vals = [doc, () => {}].concat(conAuth === undefined ? [] : [conAuth]);
  const fn = new Function(...args, cuerpo('showAdminToast') + '\nreturn showAdminToast;')(...vals);
  fn(msg, type);
  return area.hijos[0].innerHTML.replace(/<[^>]+>/g, '');
}
{
  const sinSesion = toast('Error: Missing or insufficient permissions.', 'error', { currentUser: null });
  t('sin sesion: "se cerró tu sesión" y que hay que volver a entrar', /se cerró tu sesión/.test(sinSesion) && /Volvé a entrar con tu cuenta de Google/.test(sinSesion) &&
    !/Missing/.test(sinSesion), sinSesion);
  const conSesion = toast('Error: Missing or insufficient permissions.', 'error', { currentUser: { email: 'a@b.com' } });
  t('con sesion: que la base no lo permitió, y F5 y volver a entrar', /la base no lo permitió/.test(conSesion) && /F5/.test(conSesion) && !/Missing/.test(conSesion), conSesion);
  const emulador = toast("Error: PERMISSION_DENIED: \nfalse for 'create' @ L101", 'error', { currentUser: null });
  t('el mismo error como lo da el emulador del sandbox, tambien', /se cerró tu sesión/.test(emulador) && !/PERMISSION_DENIED/.test(emulador), emulador);
  const sinAuth = toast('Error: Missing or insufficient permissions.', 'error');
  t('si todavia no esta Firebase (sin auth), lo toma como sin sesion y no se rompe', /se cerró tu sesión/.test(sinAuth), sinAuth);
  t('los demas errores quedan como estaban', toast('Error: Failed to get document', 'error', { currentUser: null }) === 'Error: Failed to get document');
  t('y los avisos comunes tambien', toast('Venta #797 registrada', 'success', { currentUser: null }) === 'Venta #797 registrada');
}

/* ================= el ingreso y la salida ================= */
console.log('\n-- se cierra la sesion, entra otra cuenta --');
function panel(admins) {
  const els = {};
  const elem = id => (els[id] = els[id] || { _id: id, textContent: '', innerHTML: '', style: { display: '' } });
  let alCambiar = null;
  const estado = { ventanaAbierta: false, fallaLaBase: false, signOuts: 0 };
  const authFalso = { currentUser: null, onAuthStateChanged: cb => { alCambiar = cb; }, signOut: () => { estado.signOuts++; } };
  const ent = {
    MAIL_DUENIO: 'duenio@brotes.com',
    firebase: { auth: () => authFalso, storage: () => ({}) },
    document: { readyState: 'complete', getElementById: elem, querySelector: () => (estado.ventanaAbierta ? {} : null), addEventListener() {} },
    window: {},
    setTimeout: fn => fn(),
    db: { collection: () => ({ doc: id => ({ get: async () => { if (estado.fallaLaBase) throw new Error('sin conexion'); return { exists: admins.indexOf(id) >= 0 }; } }) }) },
    console: { warn() {} },
    loadProducts: () => Promise.resolve(), actualizarBadgeAlertas: () => {}, loadListas: () => {}, loadFacturaConfig: () => {},
    loadTelegramConfig: () => {}, loadResenasConfig: () => {}, loadPedidosCfgEditor: () => {}, loadAtajos: () => {}, escucharUso: () => {},
  };
  const nombres = Object.keys(ent);
  const api = new Function(...nombres,
    'let auth=null,storage=null;\n' + ['isAllowedEmail', '_cuandoCarguenLosModulos', '_initAuth', 'logout'].map(cuerpo).join('\n') +
    '\nreturn {init:_initAuth, logout:logout};')(...nombres.map(n => ent[n]));
  api.init();
  const cambiar = async u => { authFalso.currentUser = u; await alCambiar(u); await new Promise(r => setImmediate(r)); };
  return { els, elem, estado, cambiar, logout: api.logout, ventana: ent.window };
}
const vista = p => ({ ingreso: p.elem('loginScreen').style.display, panel: p.elem('dashboard').style.display,
  cartel: p.elem('loginError').style.display, texto: p.elem('loginError').textContent || p.elem('loginError').innerHTML.replace(/<[^>]+>/g, '') });
(async () => {
  {
    const p = panel(['nat@gmail.com']);
    await p.cambiar({ email: 'nat@gmail.com' });
    t('la clienta entra: se ve el panel', vista(p).panel === 'block' && vista(p).ingreso === 'none', vista(p));
    p.estado.ventanaAbierta = true;
    await p.cambiar(null);
    const v = vista(p);
    t('se le cierra la sesion con una venta abierta: vuelve la pantalla de ingreso y se esconde el panel', v.ingreso === 'flex' && v.panel === 'none', v);
    t('  y dice que se cerró la sesión y que lo que estaba cargando sigue abierto', v.cartel === 'block' && /Se cerró la sesión/.test(v.texto) &&
      /Volvé a entrar con tu cuenta de Google/.test(v.texto) && /sigue abierto/.test(v.texto), v);
    t('  sin cerrarle la sesion de nada mas', p.estado.signOuts === 0);
    await p.cambiar({ email: 'nat@gmail.com' });
    t('  vuelve a entrar: se ve el panel otra vez', vista(p).panel === 'block' && vista(p).ingreso === 'none', vista(p));
  }
  {
    const p = panel(['nat@gmail.com']);
    await p.cambiar({ email: 'nat@gmail.com' });
    await p.cambiar(null);
    t('sin ninguna ventana abierta, solo que se cerró la sesión', /Se cerró la sesión\. Volvé a entrar con tu cuenta de Google\.$/.test(vista(p).texto), vista(p));
  }
  {
    const p = panel(['nat@gmail.com']);
    await p.cambiar({ email: 'nat@gmail.com' });
    p.logout();
    await p.cambiar(null);
    t('con "Salir" a proposito: la pantalla de ingreso, sin el cartel', vista(p).ingreso === 'flex' && vista(p).panel === 'none' && vista(p).cartel === 'none' && p.estado.signOuts === 1, vista(p));
    await p.cambiar({ email: 'nat@gmail.com' });
    await p.cambiar(null);
    t('  y si despues se cierra sola, el cartel vuelve a aparecer', vista(p).cartel === 'block' && /Se cerró la sesión/.test(vista(p).texto), vista(p));
  }
  {
    const p = panel([]);
    await p.cambiar(null);
    t('al abrir el panel sin sesion: la pantalla de ingreso, sin cartel', vista(p).ingreso === 'flex' && vista(p).cartel !== 'block', vista(p));
  }
  {
    const p = panel(['nat@gmail.com']);
    await p.cambiar({ email: 'nat@gmail.com' });
    await p.cambiar({ email: 'otra.persona@gmail.com' });
    const v = vista(p);
    t('con el panel abierto entra OTRA cuenta que no es admin: se tapa el panel', v.ingreso === 'flex' && v.panel === 'none', v);
    t('  y dice que esa cuenta no tiene permisos, con la salida a mano', /no tiene permisos/.test(v.texto) && /logout\(\)/.test(p.elem('loginError').innerHTML), v);
    t('  sin cerrarle la sesion (es la de la tienda)', p.estado.signOuts === 0);
    p.logout();
    await p.cambiar(null);
    t('  con "Salir de esta cuenta": queda la pantalla de ingreso sin el cartel viejo', vista(p).ingreso === 'flex' && vista(p).cartel === 'none' && p.estado.signOuts === 1, vista(p));
  }
  {
    const p = panel(['nat@gmail.com']);
    await p.cambiar({ email: 'nat@gmail.com' });
    p.estado.fallaLaBase = true;
    await p.cambiar({ email: 'nat@gmail.com' });
    t('con la MISMA cuenta y un corte al comprobarla: el panel sigue abierto', vista(p).panel === 'block', vista(p));
  }
  {
    const p = panel([]);
    await p.cambiar({ email: 'ana.cliente@gmail.com' });
    t('un cliente que abre /admin: no ve el panel, como siempre', vista(p).panel !== 'block' && /no tiene permisos/.test(vista(p).texto), vista(p));
  }

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
