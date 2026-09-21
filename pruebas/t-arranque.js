/**
 * AL ENTRAR AL PANEL, LO QUE VIENE DE LOS MODULOS ESPERA A QUE CARGUEN.
 *
 * Encontrado en el chequeo del 14/09. Los modulos admin-*.js se cargan al final de
 * admin.html, y el login puede resolverse antes de que terminen: mientras el navegador
 * los descarga sigue atendiendo otras tareas. El callback de login llamaba loadAtajos()
 * de una, y eso tiraba "loadAtajos is not defined" y cortaba lo que venia despues:
 *   - no andaba ningun atajo de teclado (ATAJOS quedaba vacio);
 *   - escucharUso no corria: la barra de uso quedaba en "Calculando..." y hayEspacio()
 *     dejaba subir sin mirar cuanto queda.
 * En el sandbox pasaba en cada recarga. El aviso de alertas tenia typeof, asi que no
 * rompia, pero si llegaba antes que su modulo se salteaba sin avisar.
 *
 * LO QUE ESTA PRUEBA CUIDA
 * 1. Entrando ANTES de que carguen los modulos: sin error, la barra de uso arranca, y
 *    los atajos y las alertas corren apenas terminan de cargar.
 * 2. Entrando DESPUES, lo de siempre: todo corre en el momento.
 * 3. Si un modulo no llega a cargar, no rompe nada.
 * 4. Que el callback de login no vuelva a llamar a una funcion de un modulo sin esperar.
 *
 * Se corren isAllowedEmail, _cuandoCarguenLosModulos y _initAuth de verdad.
 */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(RAIZ, 'admin.html'), 'utf8');

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + extra + ']' : '')); }
};
function cuerpo(nombre) {
  let i = src.indexOf('function ' + nombre + '(');
  if (i < 0) return '';
  if (src.slice(Math.max(0, i - 6), i) === 'async ') i -= 6;
  let p = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') p++;
    else if (src[k] === '}') { p--; if (!p) break; }
  }
  return src.slice(i, k + 1);
}
const vaciarMicrotareas = () => new Promise(r => setImmediate(r));

/* Entra al panel como el dueño. `modulosCargados` dice si los scripts del final ya
   corrieron. loadAtajos y actualizarBadgeAlertas NO se pasan como parametros: son de
   los modulos, y aparecen en globalThis recien cuando "cargan". */
async function entrar(modulosCargados) {
  const reg = { llamadas: [], alCargar: [], error: null };
  const anotar = n => () => { reg.llamadas.push(n); };
  reg.cargarModulos = () => {
    globalThis.loadAtajos = anotar('loadAtajos');
    globalThis.actualizarBadgeAlertas = anotar('actualizarBadgeAlertas');
  };
  const elementos = {};
  let alCambiar = null;
  const ent = {
    MAIL_DUENIO: 'duenio@brotes.com',
    firebase: { auth: () => ({ onAuthStateChanged: cb => { alCambiar = cb; }, signOut() {} }), storage: () => ({}) },
    document: {
      readyState: modulosCargados ? 'interactive' : 'loading',
      getElementById: id => (elementos[id] = elementos[id] || { textContent: '', innerHTML: '', style: { display: '' } }),
      addEventListener: (tipo, fn, op) => { if (tipo === 'DOMContentLoaded') reg.alCargar.push({ fn, unaVez: !!(op && op.once) }); },
    },
    setTimeout: fn => fn,
    db: { collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }) },
    console: { warn() {} },
    loadProducts: () => Promise.resolve(),
    loadListas: anotar('loadListas'), loadFacturaConfig: anotar('loadFacturaConfig'),
    loadTelegramConfig: anotar('loadTelegramConfig'), loadResenasConfig: anotar('loadResenasConfig'),
    loadPedidosCfgEditor: anotar('loadPedidosCfgEditor'), escucharUso: anotar('escucharUso'),
  };
  const nombres = Object.keys(ent);
  const api = new Function(...nombres,
    'let auth=null,storage=null;\n' +
    ['isAllowedEmail', '_cuandoCarguenLosModulos', '_initAuth'].map(cuerpo).join('\n') +
    '\nreturn {init:_initAuth};')(...nombres.map(n => ent[n]));
  if (modulosCargados) reg.cargarModulos();
  api.init();
  try { await alCambiar({ email: 'duenio@brotes.com' }); } catch (e) { reg.error = e; }
  await vaciarMicrotareas();
  return reg;
}
const sinModulos = () => { delete globalThis.loadAtajos; delete globalThis.actualizarBadgeAlertas; };
const veces = (reg, n) => reg.llamadas.filter(x => x === n).length;
const DEL_HTML = ['loadListas', 'loadFacturaConfig', 'loadTelegramConfig', 'loadResenasConfig', 'loadPedidosCfgEditor'];

(async () => {
  console.log('\nENTRANDO ANTES DE QUE CARGUEN LOS MODULOS (lo que pasaba en el sandbox)');
  sinModulos();
  let reg = await entrar(false);
  t('no tira error', reg.error === null, reg.error && reg.error.message);
  t('la barra de uso arranca igual', veces(reg, 'escucharUso') === 1);
  t('lo que es de admin.html corre en el momento', DEL_HTML.every(n => veces(reg, n) === 1));
  t('los atajos y las alertas esperan a que terminen de cargar',
    reg.alCargar.length === 2 && reg.alCargar.every(x => x.unaVez) && !veces(reg, 'loadAtajos'), reg.alCargar.length);
  reg.cargarModulos();
  reg.alCargar.forEach(x => x.fn());
  t('  y cuando cargan se cargan los atajos, una vez', veces(reg, 'loadAtajos') === 1);
  t('  y se pinta el aviso de alertas, una vez', veces(reg, 'actualizarBadgeAlertas') === 1);

  console.log('\nENTRANDO DESPUES (lo de siempre)');
  sinModulos();
  reg = await entrar(true);
  t('no tira error', reg.error === null, reg.error && reg.error.message);
  t('los atajos y la barra de uso corren en el momento', veces(reg, 'loadAtajos') === 1 && veces(reg, 'escucharUso') === 1);
  t('las alertas tambien', veces(reg, 'actualizarBadgeAlertas') === 1);
  t('sin dejar nada esperando', reg.alCargar.length === 0, reg.alCargar.length);

  console.log('\nSI UN MODULO NO LLEGA A CARGAR');
  sinModulos();
  reg = await entrar(false);
  let tiro = null;
  try { reg.alCargar.forEach(x => x.fn()); } catch (e) { tiro = e; }
  t('no rompe nada', reg.error === null && tiro === null, (reg.error || tiro || {}).message);

  console.log('\nQUE NO VUELVA A PASAR');
  const deModulo = {};
  fs.readdirSync(RAIZ).filter(f => /^admin-.*\.js$/.test(f)).forEach(f => {
    const s = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    for (const m of s.matchAll(/(?:^|[\s;}])(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) deModulo[m[1]] = f;
  });
  const enHtml = new Set([...src.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]));
  const init = cuerpo('_initAuth');
  const deModulos = [...new Set([...init.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]))]
    .filter(n => deModulo[n] && !enHtml.has(n));
  t('el login llama a funciones de modulos (si no, lo de abajo no mira nada)', deModulos.length >= 2, deModulos.join(', '));
  deModulos.forEach(n => t('  ' + n + ' (' + deModulo[n] + ') espera a que carguen',
    new RegExp('_cuandoCarguenLosModulos\\(\\(\\)=>\\{if\\(typeof ' + n + "==='function'\\)" + n + '\\(\\);\\}\\)').test(init)));

  sinModulos();
  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})();
