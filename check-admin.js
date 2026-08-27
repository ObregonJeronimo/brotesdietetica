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
 * Y lo mismo pasa con el HTML, por otro camino. Un `</div>` de mas cierra la
 * seccion antes de tiempo, y todo lo que venia abajo queda FUERA de ella. Lo que
 * esta fuera de una seccion no lo tapa switchSection, asi que se ve encima de
 * todas las demas. Paso exactamente eso: la tabla de productos aparecia en
 * Estadisticas, en Caja, en todas. El navegador no se queja: descarta las
 * etiquetas que sobran en silencio y sigue.
 *
 * Que revisa
 * ----------
 *  1. Sintaxis del bloque (lo que ya hacia node --check).
 *  2. Palabras clave colgadas: `async`, `await`, `static`, `yield` sueltas como
 *     sentencia. Son el residuo tipico de sacar una funcion a mano.
 *  3. Identificadores sueltos como sentencia en el nivel de arriba. Misma
 *     familia de residuo, solo que con otro nombre.
 *  4. Balance del HTML: etiquetas que cierran algo que no esta abierto, y
 *     etiquetas que se abren y nunca cierran. Con el numero de linea.
 *  5. Que ninguna seccion del panel quede adentro de otra, que es la forma en
 *     que se manifiesta el desbalance y lo que rompe switchSection.
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

/* ------------------------------------------------- 4 y 5) balance del HTML */
/* Tokenizador que respeta las comillas: sin eso, un '>' dentro de un atributo
   —por ejemplo onclick="...innerHTML='<div>'..."— cortaria la etiqueta al medio
   y el conteo daria cualquier cosa. */
const RE_TAG = /<\s*(\/?)\s*([a-zA-Z][\w-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)\s*>/g;
const VACIOS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
                        'link', 'meta', 'param', 'source', 'track', 'wbr']);

const idDe = (attrs) => {
  const m = /id="([^"]+)"/.exec(attrs || '');
  return m ? '#' + m[1] : null;
};

function revisarHtml(archivo, texto) {
  const fallas = [];
  /* Fuera lo que no es marcado. Se reemplaza por espacios y no se borra, para que
     los numeros de linea sigan siendo los del archivo. */
  const blanquear = (t, re) => t.replace(re, (m) => m.replace(/[^\n]/g, ' '));
  let h = blanquear(texto, /<script[\s\S]*?<\/script>/gi);
  h = blanquear(h, /<style[\s\S]*?<\/style>/gi);
  h = blanquear(h, /<!--[\s\S]*?-->/g);

  const linea = (i) => h.slice(0, i).split('\n').length;
  const pila = [];
  let m;
  RE_TAG.lastIndex = 0;
  while ((m = RE_TAG.exec(h))) {
    const cierra = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (VACIOS.has(tag) || m[4] === '/') continue;
    if (!cierra) {
      const attrs = m[3] || '';
      const esSec = tag === 'div' && /class="[^"]*\bsection-content\b/.test(attrs);
      /* Una seccion adentro de otra es la forma en que se manifiesta un cierre de
         mas, y es lo que rompe switchSection: lo anidado no se puede tapar. Se
         mira con la MISMA pila que controla el balance, que es la unica que sabe
         de verdad quien es ancestro de quien. */
      if (esSec) {
        const padre = pila.find((x) => x.esSec);
        if (padre) {
          fallas.push('HTML: la seccion ' + (idDe(attrs) || '(sin id)') + ' quedo ADENTRO de ' +
                      padre.id + ' (' + archivo + ':' + linea(m.index) + '). ' +
                      'switchSection no va a poder taparla.');
        }
      }
      pila.push({ tag, ln: linea(m.index), attrs: attrs.trim().slice(0, 60),
                  esSec, id: esSec ? (idDe(attrs) || '(sin id)') : null });
      continue;
    }
    let k = pila.length - 1;
    while (k >= 0 && pila[k].tag !== tag) k--;
    if (k < 0) {
      const ctx = h.slice(Math.max(0, m.index - 70), m.index).replace(/\s+/g, ' ');
      fallas.push('HTML: </' + tag + '> DE MAS en ' + archivo + ':' + linea(m.index) +
                  '  ->  ...' + ctx.slice(-60));
    } else {
      /* lo que quedo abierto entre medio se reporta al final, en la pila */
      pila.splice(k, pila.length - k);
    }
  }
  pila.forEach((x) => {
    fallas.push('HTML: <' + x.tag + (x.attrs ? ' ' + x.attrs : '') + '> SIN CERRAR en ' +
                archivo + ':' + x.ln);
  });
  return fallas;
}

problemas.push(...revisarHtml('admin.html', html));

/* Las demas paginas tambien. Cuesta milisegundos y ahi tambien un cierre de mas
   descoloca todo: si se rompe index.html se cae la tienda entera, que es lo que
   ve el cliente. Estaban las cinco balanceadas al agregar esto. */
['index.html', 'mayoristas.html', 'politicas.html', 'resena.html', 'setup-inicial.html']
  .forEach((f) => {
    const p = path.join(__dirname, f);
    if (!fs.existsSync(p)) return;
    problemas.push(...revisarHtml(f, fs.readFileSync(p, 'utf8')));
  });

/* ------------------------------------------------------------------ informe */
const lineas = bloques.reduce((s, b) => s + b.codigo.split('\n').length, 0);
if (problemas.length) {
  const deHtml = problemas.filter((p) => p.startsWith('HTML:')).length;
  console.error('\ncheck-admin: ' + problemas.length + ' problema(s) en admin.html\n');
  problemas.forEach((p) => console.error('  ' + p));
  if (deHtml) {
    console.error('\nUn cierre de mas termina la seccion antes de tiempo y lo que viene');
    console.error('abajo queda fuera de ella: se ve en TODAS las pantallas a la vez.');
  }
  if (deHtml < problemas.length) {
    console.error('\nUn error de ejecucion en el bloque de JS aborta TODO lo que viene despues.');
  }
  console.error('Abri la pagina y mirala antes de dar esto por bueno.\n');
  process.exit(1);
}
console.log('check-admin: ' + bloques.length + ' bloque(s) de JS, ' + lineas +
            ' lineas, HTML balanceado, sin problemas');
