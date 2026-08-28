/**
 * Corre todas las suites y devuelve 1 si alguna falla.
 *
 *   npm test
 *
 * Cada suite saca las funciones del FUENTE REAL (admin.html, app.js,
 * functions/index.js) y las ejecuta contra objetos falsos. No hacen falta ni
 * navegador ni credenciales.
 *
 * OJO con lo que estas pruebas NO pueden ver: extraen la funcion del archivo y
 * la corren aisladas, asi que no se enteran si en el navegador OTRO modulo la
 * reemplaza. Paso de verdad: admin-pagination.js no envuelve a renderStockList,
 * la reimplementa entera, y por eso la seleccion multiple de Stock no andaba
 * aunque las 33 pruebas pasaban. Lo visual y lo que depende del orden de carga
 * hay que verificarlo abriendo la pagina.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const RAIZ = path.resolve(DIR, '..');

const suites = fs.readdirSync(DIR)
  .filter(f => /^(t|test)-.*\.js$/.test(f))
  .sort();

let totalOk = 0, totalMal = 0, suitesMal = [];

for (const s of suites) {
  let salida = '';
  let fallo = false;
  try {
    /* desde la raiz: las suites leen admin.html y app.js con rutas relativas */
    salida = execFileSync(process.execPath, [path.join(DIR, s)], { cwd: RAIZ, encoding: 'utf8' });
  } catch (e) {
    salida = (e.stdout || '') + (e.stderr || '');
    fallo = true;
  }
  const m = salida.match(/(\d+) pasaron, (\d+) fallaron/);
  if (m && !fallo) {
    totalOk += Number(m[1]);
    totalMal += Number(m[2]);
    if (Number(m[2]) > 0) suitesMal.push(s);
    console.log('  %s %s  %s', Number(m[2]) ? 'MAL ' : 'ok  ', s.padEnd(26), m[0]);
  } else if (m) {
    /* Imprimio su resumen y DESPUES se cayo, o salio con codigo != 0. El resumen
       de una suite es lo que ella misma dice de si misma; el codigo de salida es
       lo que de verdad paso. Antes ganaba el resumen: `fallo` se calculaba y no
       se usaba, asi que una suite que reventaba despues de imprimir "0 fallaron"
       salia en verde. */
    totalOk += Number(m[1]);
    totalMal += Number(m[2]);
    suitesMal.push(s);
    console.log('  MAL   %s  %s, pero termino con error', s.padEnd(26), m[0]);
    console.log(salida.split('\n').slice(-6).map(l => '        ' + l).join('\n'));
  } else {
    suitesMal.push(s);
    fallo = true;
    console.log('  MAL   %s  no llego a terminar', s.padEnd(26));
    console.log(salida.split('\n').slice(-6).map(l => '        ' + l).join('\n'));
  }
}

console.log('\n  %d pruebas, %d fallaron, %d suites', totalOk + totalMal, totalMal, suites.length);
if (suitesMal.length) {
  console.log('  suites con problemas: ' + suitesMal.join(', '));
  process.exit(1);
}
