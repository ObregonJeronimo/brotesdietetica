/**
 * DOS MODULOS NO PUEDEN DECLARAR EL MISMO NOMBRE.
 *
 * Los admin-*.js son scripts clasicos: comparten el scope global. Dos `const` con
 * el mismo nombre tiran "Identifier X has already been declared" y se cae el
 * archivo ENTERO, no solo esa linea, asi que la seccion queda muerta.
 *
 * `node --check` no lo ve: revisa un archivo aislado. Aparece recien al abrir la
 * pagina, y como una seccion que no anda no rompe a las otras, puede pasar
 * desapercibido hasta que alguien entra ahi.
 *
 * Paso de verdad al escribir admin-proveedores.js: definio `_pesos`, que ya
 * existia en admin-caja.js, y la seccion de Proveedores no cargaba.
 */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

/* Se lee la carpeta. Escrita a mano, la lista se atrasa sola: al checker le paso
   -se quedo en 8 cuando ya habia 10- y aca el modulo nuevo simplemente no se
   revisaba, sin que nada avisara. */
const MODULOS = fs.readdirSync(RAIZ)
  .filter(f => /^admin-.*\.js$/.test(f) && !/\.min\.js$/.test(f))
  .sort();

const donde = {};
MODULOS.forEach(f => {
  const t = fs.readFileSync(path.join(RAIZ, f), 'utf8');
  /* Solo las declaraciones de primer nivel: las de adentro de una funcion tienen
     su propio scope y pueden repetirse sin problema. */
  const re = /^(?:const|let|var|function|async function)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = re.exec(t))) (donde[m[1]] = donde[m[1]] || new Set()).add(f);
});

let ok = 0, fail = 0;
const t = (d, c) => { if (c) { ok++; console.log('  OK   ' + d); } else { fail++; console.log('  FALLA ' + d); } };

console.log('\n' + MODULOS.length + ' modulos, ' + Object.keys(donde).length + ' nombres de primer nivel');
const chocan = Object.entries(donde).filter(([, s]) => s.size > 1);
chocan.forEach(([n, s]) => console.log('  CHOCA  ' + n + '  en  ' + [...s].join(', ')));
t('ningun nombre declarado en dos modulos', chocan.length === 0);

/* Y que admin.html los cargue a todos: un modulo sin su <script> es codigo que
   no existe, y no da ningun error. */
const html = fs.readFileSync(path.join(RAIZ, 'admin.html'), 'utf8');
MODULOS.forEach(f => t(f + ' esta enganchado en admin.html', html.indexOf('src="' + f + '"') >= 0));

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
