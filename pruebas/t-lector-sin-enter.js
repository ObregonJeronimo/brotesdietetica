/* LA PISTOLA QUE NO MANDA ENTER
   =============================================================================
   Medido el 21/09 con el lector de otra PC, con pruebas/lector-diagnostico.html:

     7 7 9 5 5 6 8 9 6 1 0 9 4     trece dígitos, 16 ms entre cada uno
     (y después nada)               NINGÚN Enter

   O sea: ráfaga de sobra —el umbral son 40 ms— pero sin sufijo configurado. Y
   como el código solo se procesaba dentro del `if (e.key === 'Enter')`, en esa
   PC no funcionaba absolutamente nada: ni vender, ni abrir la ficha, ni el
   cartel de código desconocido. En silencio, además.

   Acá se reproduce esa captura tecla por tecla contra el admin-lector.js REAL,
   y se comprueba que ahora el código llega igual. Y lo simétrico, que importa
   tanto como lo anterior: que la pistola que SÍ manda Enter siga funcionando
   exactamente como antes y no procese el código dos veces.

   Las tres trampas que vigila esta suite:
     - una tecla MANTENIDA apretada se repite cada ~30 ms, que es una ráfaga
       metronómica perfecta: dejar el 0 apretado no puede entrar como escaneo;
     - una persona tecleando rápido tampoco;
     - sin terminador se pide más (6 dígitos, solo dígitos), porque no hay Enter
       que confirme.
   ============================================================================= */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const LECTOR = fs.readFileSync(path.join(RAIZ, 'admin-lector.js'), 'utf8');

let ok = 0, mal = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d + (extra ? '   (' + extra + ')' : '')); }
  else { mal++; console.log('  FALLA ' + d + (extra ? '   (' + extra + ')' : '')); }
};
const grupo = n => console.log('\n' + n);
const esperar = ms => new Promise(r => setTimeout(r, ms));

const CODIGO = '7795568961094';   /* el de la captura, un EAN-13 argentino */

function panel() {
  const est = { leidos: [], avisos: [] };
  let teclado = null;
  const doc = {
    addEventListener(tipo, fn, cap) { if (tipo === 'keydown' && cap) teclado = fn; },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
  };
  const sb = {
    console, document: doc, setTimeout, clearTimeout, Date,
    allProducts: [],
    showAdminToast: (m) => est.avisos.push(m),
    /* Se espia el punto de entrada: lo que importa es SI el codigo llego, no que
       hace despues. */
    procesarCodigoLeido: (cod) => est.leidos.push(cod)
  };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(LECTOR, sb, { filename: 'admin-lector.js' });
  /* El archivo define su propia procesarCodigoLeido y tapa la del sandbox: se
     vuelve a poner el espia DESPUES de ejecutarlo. */
  vm.runInContext('procesarCodigoLeido = ' + String((cod) => _espia(cod)), sb);
  sb._espia = (cod) => est.leidos.push(cod);
  return { sb, est, teclado };
}

/* Una tecla como la manda el navegador. `code` es la tecla FISICA. */
function tecla(key, ts, extra) {
  const e = Object.assign({
    key, code: /^[0-9]$/.test(key) ? 'Digit' + key : key,
    timeStamp: ts, target: {}, repeat: false,
    ctrlKey: false, altKey: false, metaKey: false, shiftKey: false,
    preventDefault() { this._pd = true; }, stopPropagation() { this._sp = true; }
  }, extra || {});
  return e;
}

/* Teclea un codigo con el ritmo pedido. `fin` es el terminador, o null. */
function escanear(P, cod, gap, fin, extra) {
  let ts = 1000;
  for (const ch of cod) { P.teclado(tecla(ch, ts, extra)); ts += gap; }
  if (fin) P.teclado(tecla(fin, ts, extra));
  return ts;
}

(async () => {
  grupo('La captura del 21/09: 13 dígitos a 16 ms y NINGÚN Enter');
  let P = panel();
  escanear(P, CODIGO, 16, null);
  t('en el momento todavía no llegó (se espera el silencio)', P.est.leidos.length === 0);
  await esperar(140);
  t('después del silencio, el código llega igual', P.est.leidos.length === 1, P.est.leidos.join(','));
  t('y llega entero y correcto', P.est.leidos[0] === CODIGO);

  grupo('La pistola que SÍ manda Enter no cambia en nada');
  P = panel();
  escanear(P, CODIGO, 16, 'Enter');
  t('entra en el acto, sin esperar nada', P.est.leidos.length === 1 && P.est.leidos[0] === CODIGO);
  await esperar(140);
  t('y el silencio NO lo vuelve a procesar', P.est.leidos.length === 1, P.est.leidos.join(','));

  grupo('Pistola con Tab de sufijo');
  P = panel();
  escanear(P, CODIGO, 16, 'Tab');
  t('el Tab también cierra la lectura', P.est.leidos.length === 1 && P.est.leidos[0] === CODIGO);
  await esperar(140);
  t('y tampoco se duplica', P.est.leidos.length === 1);

  grupo('Un Tab suelto sigue siendo el Tab de navegar');
  P = panel();
  P.teclado(tecla('Tab', 1000));
  await esperar(80);
  t('no procesa nada', P.est.leidos.length === 0);
  t('y no le roba la tecla al formulario', !P.sb.document._pd);

  grupo('Tecla MANTENIDA apretada: no es un escaneo');
  P = panel();
  /* Windows repite a ~30 ms: metronomico y rapido, igual que una pistola. */
  let ts = 1000;
  for (let i = 0; i < 12; i++) { P.teclado(tecla('0', ts, { repeat: i > 0 })); ts += 30; }
  await esperar(140);
  t('doce ceros seguidos no entran como código', P.est.leidos.length === 0, P.est.leidos.join(','));

  grupo('Una persona tecleando no dispara nada');
  P = panel();
  escanear(P, '123456789', 120, null);
  await esperar(140);
  t('a 120 ms por tecla no hay ráfaga', P.est.leidos.length === 0);
  P = panel();
  escanear(P, '123456789', 120, 'Enter');
  await esperar(140);
  t('ni aunque termine en Enter', P.est.leidos.length === 0);

  grupo('Sin terminador se exige más, porque no hay Enter que confirme');
  P = panel();
  escanear(P, '12345', 16, null);
  await esperar(140);
  t('cinco dígitos no alcanzan', P.est.leidos.length === 0);
  P = panel();
  escanear(P, '123456', 16, null);
  await esperar(140);
  t('seis sí', P.est.leidos.length === 1);
  P = panel();
  escanear(P, 'ABC123XY', 16, null);
  await esperar(140);
  t('con letras no: ésos que configuren el sufijo', P.est.leidos.length === 0);
  P = panel();
  escanear(P, 'ABC123XY', 16, 'Enter');
  await esperar(140);
  t('pero CON Enter las letras siguen valiendo, como siempre', P.est.leidos.length === 1);

  grupo('Una pausa en el medio corta la lectura, como antes');
  P = panel();
  let ts2 = 1000;
  for (const ch of '77955') { P.teclado(tecla(ch, ts2)); ts2 += 16; }
  ts2 += 300;                                   /* alguien se detiene */
  for (const ch of '68961094') { P.teclado(tecla(ch, ts2)); ts2 += 16; }
  await esperar(140);
  t('no se arma un código con los dos pedazos',
    !P.est.leidos.includes(CODIGO), P.est.leidos.join(','));

  grupo('La tecla FÍSICA manda: una distribución rara no rompe el código');
  P = panel();
  /* La pistola aprieta Digit7 pero la distribucion de Windows lo traduce a "/".
     e.code sigue diciendo la verdad. */
  ts = 1000;
  for (const ch of CODIGO) {
    P.teclado({ key: '/', code: 'Digit' + ch, timeStamp: ts, target: {}, repeat: false,
                ctrlKey: false, altKey: false, metaKey: false, shiftKey: false,
                preventDefault() {}, stopPropagation() {} });
    ts += 16;
  }
  await esperar(140);
  t('el código sale bien igual', P.est.leidos[0] === CODIGO, P.est.leidos.join(','));

  P = panel();
  ts = 1000;
  for (const ch of '1234567') {
    P.teclado(tecla(ch, ts, { shiftKey: true, key: '/' }));
    ts += 16;
  }
  await esperar(140);
  t('con Shift apretado NO se usa la tecla física: ahí el símbolo es a propósito',
    !P.est.leidos.some(c => /^\d+$/.test(c)), P.est.leidos.join(','));

  grupo('Los números de la regla');
  const n = (re) => Number((LECTOR.match(re) || [])[1]);
  t('el silencio es corto: no se nota al vender (<= 120 ms)', n(/LECTOR_SILENCIO_MS = (\d+)/) <= 120);
  t('pero más largo que la pausa entre teclas de una pistola',
    n(/LECTOR_SILENCIO_MS = (\d+)/) > n(/LECTOR_GAP_MAX = (\d+)/));
  t('sin terminador se piden más dígitos que con Enter',
    n(/LECTOR_LARGO_SIN_FIN = (\d+)/) > n(/LECTOR_LARGO_MIN = (\d+)/));

  console.log('\n' + ok + ' pasaron, ' + mal + ' fallaron');
  process.exit(mal ? 1 : 0);
})().catch(e => {
  console.error('  EXPLOTO: ' + e.stack);
  console.log('\n' + ok + ' pasaron, ' + (mal + 1) + ' fallaron');
  process.exit(1);
});
