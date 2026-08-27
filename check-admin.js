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
/* Cosas que conviene mirar pero que no justifican cortar el build. */
let avisos = [];

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


/* ------------------------------------- 6) CSS fantasma: usado y nunca definido

   Una clase que no existe no rompe nada visible: el navegador la ignora y el
   elemento se dibuja sin estilo. Por eso se acumulan sin que nadie se entere. En
   este panel aparecieron seis antes de escribir esto: .card (13 usos, toda la
   seccion Caja sin fondo), .modal-footer y .modal-body (los botones de los nueve
   modales apilados uno arriba del otro), .spin, --text-main y --accent-dark.

   Las VARIABLES son peores que las clases. `background: var(--no-existe)` no cae
   a un valor por defecto: invalida la declaracion entera, y la propiedad toma su
   valor inicial. Un fondo se vuelve transparente. Eso fue exactamente
   --accent-dark: el boton SELECCIONADO de los toggles quedaba sin relleno, y como
   el no seleccionado usa un gris casi igual al del panel, el control entero
   parecia no existir.

   Se comparan las clases y variables que se USAN contra las que se DEFINEN. */

/* Clases que se aplican solo desde el JS para marcar estado y que se estilan
   SIEMPRE en compuesto (.modal-overlay.show, .vprod-chip.ok). El extractor ya las
   entiende; esta lista es para las que ademas ningun selector nombra, porque el
   estilo lo pone el JS inline. */
const CLASES_SIN_ESTILO_PROPIO = new Set([
  'dragover', 'drag-over', 'dragging', 'editor-highlight',
  'tk-page', 'tk-header', 'tk-items', 'tk-footer',   /* ticket: el CSS se arma en un string al imprimir */
  'fa4-page', 'fa4-header', 'fa4-items', 'fa4-footer',
  'wp-sel-rem', 'wp-new-chk', 'wp-sel-reapp', 'rl-check', 'dsc-chk',  /* solo se leen con querySelectorAll */
  'pgt-si', 'pgt-no', 'pgt-total', 'pgt-aviso', 'pgt-input',          /* tienda: estilos inline */
  'dlg-si', 'dlg-no', 'pz-rap', 'pz-input', 'alertas-refresh',       /* solo se buscan con querySelector */
  'stock-chk', 'vprod-row', 'menu-acciones'
]);

/* Librerias externas: no se definen en este repo y no tiene sentido reportarlas.
   index.html carga Bootstrap 5 y Bootstrap Icons desde un CDN, asi que toda su
   grilla y sus utilidades caen aca. */
const CLASES_AJENAS = new RegExp('^(' + [
  'bi', 'fa', 'swiper', 'leaflet',
  /* grilla y utilidades de Bootstrap */
  'container', 'container-fluid', 'row', 'col', 'g', 'gx', 'gy',
  'd', 'm', 'mt', 'mb', 'ms', 'me', 'mx', 'my', 'p', 'pt', 'pb', 'ps', 'pe', 'px', 'py',
  'text', 'bg', 'border', 'rounded', 'w', 'h', 'position', 'top', 'bottom', 'start', 'end',
  'fixed', 'sticky', 'navbar', 'nav', 'collapse', 'dropdown', 'modal', 'offcanvas',
  'btn', 'form', 'input', 'spinner', 'badge', 'alert', 'card', 'justify', 'align', 'flex',
  'fs', 'fw', 'lh', 'order', 'gap', 'shadow', 'overflow', 'visually'
].join('|') + ')($|-)');

function cssDe(texto, hojasExtra) {
  let css = '';
  let mm;
  const reStyle = /<style[^>]*>([\s\S]*?)<\/style>/g;
  while ((mm = reStyle.exec(texto))) css += mm[1] + '\n';
  (hojasExtra || []).forEach((h) => {
    const ruta = path.join(__dirname, h);
    if (fs.existsSync(ruta)) css += fs.readFileSync(ruta, 'utf8') + '\n';
  });
  return css;
}

function definidas(css) {
  const clases = new Set();
  const vars = new Set();
  /* Se corta en la llave para mirar SOLO los selectores, y se toma cada .nombre
     aunque venga pegado a otro: en `.modal-overlay.show` estan las dos. */
  css.replace(/\/\*[\s\S]*?\*\//g, ' ').split('}').forEach((trozo) => {
    const sel = trozo.split('{')[0];
    if (!sel) return;
    let c;
    const r = /\.(-?[_a-zA-Z][\w-]*)/g;
    while ((c = r.exec(sel))) clases.add(c[1]);
  });
  let v;
  const rv = /(--[\w-]+)\s*:/g;
  while ((v = rv.exec(css))) vars.add(v[1]);
  return { clases, vars };
}

/* Clases que el JS nombra en un selector: querySelector('.x'), closest('.x'),
   matches('.x'), y tambien adentro de un :not(.x). Son ganchos con proposito
   —marcadores para buscar o excluir elementos— y no tienen por que estar
   estiladas. .wa-dev es el ejemplo claro: existe solo para que
   `a[href*="wa.me"]:not(.wa-dev)` deje afuera el link del desarrollador cuando
   se reescriben los numeros de WhatsApp. */
function ganchosDeJs(texto) {
  const set = new Set();
  const re = /(?:querySelector|querySelectorAll|closest|matches|getElementsByClassName)\s*\(\s*(?:'([^']*)'|"([^"]*)")/g;
  let m;
  while ((m = re.exec(texto))) {
    const sel = m[1] || m[2] || '';
    let c;
    const r = /\.(-?[_a-zA-Z][\w-]*)/g;
    while ((c = r.exec(sel))) set.add(c[1]);
  }
  return set;
}

function usadas(texto) {
  const clases = new Map();
  const vars = new Map();
  const sumar = (m, k) => m.set(k, (m.get(k) || 0) + 1);

  let u;
  const reAttr = /class\s*=\s*(?:"([^"]*)"|'([^']*)'|\\"([^"\\]*)\\")/g;
  while ((u = reAttr.exec(texto))) {
    const valor = u[1] || u[2] || u[3] || '';
    /* Si el atributo se arma concatenando ('bi ' + icono + '"'), sus pedazos no son
       nombres de clase: `icono` es una variable, no una clase. Se descarta entero,
       porque quedarse con los trozos que "parecen" nombre inventa huerfanos. */
    if (/['"+`${}]/.test(valor)) continue;
    valor.split(/\s+/).forEach((cl) => {
      cl = cl.trim();
      /* pedazos que el JS arma concatenando: no son un nombre de clase */
      /* Un nombre de clase valido y nada mas. Lo que sale de concatenar en el JS
         ('alertas-item ' + a.nivel) deja restos como ".a.nivel" o ".?" que no son
         clases de nadie. */
      if (!/^-?[_a-zA-Z][\w-]*$/.test(cl)) return;
      sumar(clases, cl);
    });
  }
  const reCl = /classList\.(?:add|toggle|remove)\(\s*'([\w-]+)'/g;
  while ((u = reCl.exec(texto))) sumar(clases, u[1]);
  const reCn = /className\s*=\s*'([^']*)'/g;
  while ((u = reCn.exec(texto))) u[1].split(/\s+/).forEach((cl) => { if (/^-?[_a-zA-Z][\w-]*$/.test(cl)) sumar(clases, cl); });

  const rv = /var\(\s*(--[\w-]+)/g;
  while ((u = rv.exec(texto))) sumar(vars, u[1]);
  return { clases, vars };
}

function revisarCss(archivo, textoQueUsa, cssDisponible, textoConGanchos) {
  const fallas = [];
  const def = definidas(cssDisponible);
  const uso = usadas(textoQueUsa);
  /* Los ganchos se buscan en TODO el proyecto, no solo en el archivo que dibuja:
     admin-pagination.js crea .admin-pagination y admin-caja.js la busca. */
  const ganchos = ganchosDeJs(textoConGanchos || textoQueUsa);

  /* Una clase sin definir NO rompe: el elemento se dibuja sin estilo. Va como
     aviso para no cortar el build por algo cosmetico que ya venia de antes. */
  [...uso.clases.entries()].sort((a, b) => b[1] - a[1]).forEach(([cl, n]) => {
    if (def.clases.has(cl) || CLASES_AJENAS.test(cl) || CLASES_SIN_ESTILO_PROPIO.has(cl) ||
        ganchos.has(cl)) return;
    avisos.push('CSS: .' + cl + ' se usa ' + n + ' vez/veces en ' + archivo + ' y no esta definida');
  });
  [...uso.vars.entries()].sort((a, b) => b[1] - a[1]).forEach(([vr, n]) => {
    if (def.vars.has(vr)) return;
    fallas.push('CSS: la variable ' + vr + ' se usa ' + n + ' vez/veces en ' + archivo +
                ' y no esta definida (una variable inexistente invalida la declaracion ' +
                'entera: el fondo se vuelve transparente)');
  });
  return fallas;
}

/* El panel: su HTML y su JS embebido, contra su propio <style>. */
const CSS_ADMIN = cssDe(html, []);

/* Todo el JS del panel junto: los ganchos pueden estar en otro archivo. */
const JS_PANEL = ['admin-caja.js', 'admin-alertas.js', 'admin-dialogo.js', 'admin-stats.js',
                  'admin-lector.js', 'admin-admins.js', 'admin-pagination.js', 'admin-atajos.js']
  .map((f) => {
    const r = path.join(__dirname, f);
    return fs.existsSync(r) ? fs.readFileSync(r, 'utf8') : '';
  }).join('\n') + '\n' + html;

problemas.push(...revisarCss('admin.html', html, CSS_ADMIN, JS_PANEL));

/* Los modulos sueltos dibujan HTML con las clases del panel, asi que se comparan
   contra el CSS de admin.html. Se pasa SOLO el modulo como texto que usa, para no
   volver a reportar lo que ya se reporto arriba. */
['admin-caja.js', 'admin-alertas.js', 'admin-dialogo.js', 'admin-stats.js',
 'admin-lector.js', 'admin-admins.js', 'admin-pagination.js', 'admin-atajos.js']
  .forEach((f) => {
    const ruta = path.join(__dirname, f);
    if (!fs.existsSync(ruta)) return;
    problemas.push(...revisarCss(f, fs.readFileSync(ruta, 'utf8'), CSS_ADMIN, JS_PANEL));
  });

/* La tienda, contra sus hojas externas. */
const idx = path.join(__dirname, 'index.html');
if (fs.existsSync(idx)) {
  const htmlIdx = fs.readFileSync(idx, 'utf8');
  const cssTienda = cssDe(htmlIdx, ['styles.css', 'toolbar.css', 'footer-dev.css']);
  const jsTienda = htmlIdx + '\n' +
    (fs.existsSync(path.join(__dirname, 'app.js')) ? fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8') : '');
  problemas.push(...revisarCss('index.html', htmlIdx, cssTienda, jsTienda));
  const appjs = path.join(__dirname, 'app.js');
  if (fs.existsSync(appjs)) problemas.push(...revisarCss('app.js', fs.readFileSync(appjs, 'utf8'), cssTienda, jsTienda));
}

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
if (avisos.length) {
  console.log('\ncheck-admin: ' + avisos.length + ' aviso(s) de CSS sin definir');
  avisos.forEach((a) => console.log('  ' + a));
  console.log('  (no cortan el build: una clase sin definir no rompe, solo deja el elemento sin estilo)\n');
}
console.log('check-admin: ' + bloques.length + ' bloque(s) de JS, ' + lineas +
            ' lineas, HTML balanceado, CSS revisado, sin problemas');
