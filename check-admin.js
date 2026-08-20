/**
 * BROTES — control del JavaScript embebido en admin.html
 * =============================================================================
 * Por que existe este archivo
 * ---------------------------
 * admin.html tiene su JavaScript adentro, en un bloque de ~3.900 lineas. Eso
 * tiene una consecuencia que no es obvia: si una sola linea de ese bloque tira
 * un error al cargar, el navegador ABANDONA el bloque entero ahi mismo. Las
 * funciones siguen existiendo (las declaraciones `function` se hoistean), asi
 * que la pagina parece sana, pero todas las declaraciones `let` y `const` que
 * venian despues nunca se inicializan y quedan en zona muerta temporal. A
 * partir de ese momento cualquier cosa que las toque tira "Cannot access X
 * before initialization". Un error en la linea 1750 rompe el panel completo.
 *
 * Y lo peor: `node --check admin.html` no lo ve. Paso exactamente eso al sacar
 * una funcion `async function foo(){}` buscando desde `function`: quedo un
 * `async` solo en su linea. `async` es un identificador valido, asi que la
 * sintaxis esta perfecta y explota recien al ejecutar. El panel quedo roto en
 * produccion y el chequeo de sintaxis dijo que todo estaba bien.
 *
 * Que revisa
 * ----------
 *  1. Sintaxis del bloque (lo que ya hacia node --check).
 *  2. Palabras clave colgadas: `async`, `await`, `static`, `yield` sueltas como
 *     sentencia. Son el residuo tipico de sacar una funcion a mano.
 *  3. Identificadores sueltos como sentencia en el nivel de arriba. Misma
 *     familia de residuo, solo que con otro nombre.
 *
 * Uso:  node check-admin.js        (corre solo con `npm run build`)
 * Devuelve 1 si encuentra algo, para que el build se corte.
 */

const fs = require('fs');
const path = require('path');

const ARCHIVO = path.join(__dirname, 'admin.html');
const CLAVES_COLGADAS = ['async', 'await', 'static', 'yield', 'new', 'typeof', 'void', 'delete'];

let problemas = [];

/* ------------------------------------------------------------------ extraer */
const html = fs.readFileSync(ARCHIVO, 'utf8');
const bloques = [];
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(html))) {
  bloques.push({
    codigo: m[1],
    /* la linea del archivo donde arranca el bloque, para poder senalar bien */
    lineaBase: html.slice(0, m.index).split('\n').length
  });
}
if (!bloques.length) {
  console.error('check-admin: no encontre ningun <script> embebido en admin.html');
  process.exit(1);
}

/* ------------------------------------------------------- 1) sintaxis */
const vm = require('vm');
bloques.forEach((b, i) => {
  try {
    new vm.Script(b.codigo, { filename: 'admin.html:bloque' + (i + 1) });
  } catch (e) {
    problemas.push('SINTAXIS en el bloque ' + (i + 1) + ': ' + e.message);
  }
});

/* --------------------------------------- 2) palabras clave colgadas */
/* Una palabra clave que arranca una sentencia y no tiene nada valido detras.
   `async` seguido de un salto de linea es el caso exacto que rompio el panel:
   JavaScript exige que `function` venga en la MISMA linea, asi que con el salto
   de por medio el `async` pasa a ser un identificador suelto. */
bloques.forEach((b, i) => {
  CLAVES_COLGADAS.forEach((k) => {
    const rk = new RegExp('(^|[;{}\\n])\\s*' + k + '\\s*(\\n|;)', 'g');
    let mm;
    while ((mm = rk.exec(b.codigo))) {
      /* `await\n algo` es legal dentro de una funcion async, y `new\nClase()`
         tambien: solo molesta cuando lo que sigue no continua la expresion. */
      const despues = b.codigo.slice(mm.index + mm[0].length, mm.index + mm[0].length + 60).trim();
      if (despues && /^[A-Za-z_$(['"]/.test(despues) && mm[0].indexOf(';') < 0 && k !== 'async') continue;
      const linea = b.lineaBase + b.codigo.slice(0, mm.index).split('\n').length - 1;
      problemas.push('PALABRA CLAVE COLGADA "' + k + '" en admin.html:' + linea +
                     '  ->  ' + JSON.stringify(b.codigo.slice(mm.index, mm.index + 70)));
    }
  });
});

/* ------------------------------ 3) identificadores sueltos arriba */
/* Una linea que es solo un nombre, con o sin punto y coma. No hace nada y casi
   siempre es lo que quedo de borrar algo a medias. */
bloques.forEach((b, i) => {
  b.codigo.split('\n').forEach((linea, k) => {
    const t = linea.trim();
    if (!t || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
    if (/^[A-Za-z_$][\w$]*;?$/.test(t) && !/^(break|continue|debugger|return)/.test(t)) {
      problemas.push('IDENTIFICADOR SUELTO en admin.html:' + (b.lineaBase + k) + '  ->  ' + JSON.stringify(t));
    }
  });
});

/* ------------------------------------------------------------------ informe */
const lineas = bloques.reduce((s, b) => s + b.codigo.split('\n').length, 0);
if (problemas.length) {
  console.error('\ncheck-admin: ' + problemas.length + ' problema(s) en el JS de admin.html\n');
  problemas.forEach((p) => console.error('  ' + p));
  console.error('\nUn error de ejecucion en este bloque aborta TODO lo que viene despues.');
  console.error('Abri la pagina y mira la consola antes de dar esto por bueno.\n');
  process.exit(1);
}
console.log('check-admin: ' + bloques.length + ' bloque(s), ' + lineas + ' lineas, sin problemas');
