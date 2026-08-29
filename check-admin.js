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

  /* Cuando se escribio esto habia ~20 clases sin definir de arrastre y cortar el
     build por ellas lo habria hecho inusable, asi que iban como aviso. Ya estan
     todas resueltas, asi que ahora cortan igual que las variables: el punto es que
     no se cuele una nueva. Si aparece una que de verdad no necesita estilo —un
     marcador que solo lee el JS— va a CLASES_SIN_ESTILO_PROPIO con su motivo, no
     se baja la severidad. */
  [...uso.clases.entries()].sort((a, b) => b[1] - a[1]).forEach(([cl, n]) => {
    if (def.clases.has(cl) || CLASES_AJENAS.test(cl) || CLASES_SIN_ESTILO_PROPIO.has(cl) ||
        ganchos.has(cl)) return;
    fallas.push('CSS: .' + cl + ' se usa ' + n + ' vez/veces en ' + archivo + ' y no esta definida');
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
/* La lista estaba escrita a mano y se quedo en 8 cuando ya habia 10 modulos:
   los dos ultimos no los revisaba nadie. Se lee la carpeta. */
const MODULOS = fs.readdirSync(__dirname)
  .filter((f) => /^admin-.*\.js$/.test(f) && !/\.min\.js$/.test(f))
  .sort();

const JS_PANEL = MODULOS
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

/* app.js es el que define los ganchos de TODA la tienda, no solo de index.html:
   .wa-dev, por ejemplo, la marca politicas.html y la lee app.js. Se pasa como fuente
   de ganchos a todas las paginas del lado del cliente. */
const APP_JS = fs.existsSync(path.join(__dirname, 'app.js'))
  ? fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8') : '';

/* Las paginas sueltas, contra las mismas hojas de la tienda. Son las que ve el
   cliente: si una queda sin estilo, se nota afuera. */
['mayoristas.html', 'politicas.html', 'resena.html', 'setup-inicial.html'].forEach((f) => {
  const r = path.join(__dirname, f);
  if (!fs.existsSync(r)) return;
  const t = fs.readFileSync(r, 'utf8');
  problemas.push(...revisarCss(f, t, cssDe(t, ['styles.css', 'toolbar.css', 'footer-dev.css']), t + ' ' + APP_JS));
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

/* ---------------------------------------------- variables que se muerden la cola
   `--x: var(--x)` es CSS valido de escribir y no rompe nada visible: la variable
   simplemente no resuelve, y todo lo que la use se queda con el valor inicial de
   la propiedad. O sea que el color desaparece y la pagina sigue.

   Pasa solo, sin querer: un reemplazo masivo de un color por su variable tambien
   pisa la linea donde ESA variable se define. Me paso dos veces en el mismo
   cambio, con --color-danger y con --brand-verde en resena.html, y el chequeo de
   CSS fantasma no lo vio porque la variable existe: lo que no tiene es valor. */
['styles.css', 'index.html', 'politicas.html', 'mayoristas.html', 'resena.html',
 'toolbar.css', 'footer-dev.css', 'admin.html'].forEach((f) => {
  const r = path.join(__dirname, f);
  if (!fs.existsSync(r)) return;
  const t = fs.readFileSync(r, 'utf8');
  const re = /(--[\w-]+)\s*:\s*var\(\s*(--[\w-]+)\s*\)/g;
  let m;
  while ((m = re.exec(t))) {
    if (m[1] === m[2]) {
      problemas.push('CSS: ' + f + ' define ' + m[1] + ' como var(' + m[1] +
                     '), que se muerde la cola y deja la variable sin valor');
    }
  }
});

/* ------------------------------------------------ texto que no se puede leer
   Un color de texto escrito a mano y demasiado claro no da ningun error: se ve,
   pero no se lee. Aparecieron doce asi, todos en mensajes que ve el cliente:
   "Aun no hay opiniones", "No tenes direcciones guardadas", "Sin pedidos aun",
   la fecha de cada pedido y el mail en el menu de la cuenta. Estaban en #999 y
   #888, que sobre blanco dan 2.85 y 3.54 cuando el minimo para texto chico es
   4.5. La paleta ya tenia --color-text-light, que da 6.44 y si se lee.

   La tienda es de fondo claro: salvo el pie y el CTA, que llevan texto blanco o
   crudo, todo el texto cae sobre blanco o sobre un derivado del crudo. Asi que
   la regla es: un color de texto escrito a mano tiene que pasar AA sobre BLANCO,
   que es la superficie mas exigente. Los que van sobre fondo oscuro estan
   listados aparte.

   Solo mira colores literales. `color: var(--algo)` no se revisa a proposito:
   usar la paleta es justamente lo que se quiere, y esos ya estan medidos.

   El panel queda afuera: tiene tema oscuro propio y otras superficies. */
const SOBRE_FONDO_OSCURO = new Set([
  '#fff', '#ffffff', '#dfe0d2', '#a79066', '#f1f1eb', '#e4e4e7',
]);

function aRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16));
}
function canal(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function luz(h) {
  const [r, g, b] = aRgb(h);
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}
function contraste(a, b) {
  const la = luz(a), lb = luz(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

['styles.css', 'app.js', 'index.html', 'politicas.html', 'mayoristas.html',
 'resena.html', 'toolbar.css', 'footer-dev.css'].forEach((f) => {
  const r = path.join(__dirname, f);
  if (!fs.existsSync(r)) return;
  const t = fs.readFileSync(r, 'utf8');
  const re = /color\s*:\s*(#[0-9A-Fa-f]{3,6})\b/g;
  const vistos = new Map();
  let m;
  while ((m = re.exec(t))) {
    const c = m[1].toLowerCase();
    if (SOBRE_FONDO_OSCURO.has(c)) continue;
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(c)) continue;
    vistos.set(c, (vistos.get(c) || 0) + 1);
  }
  vistos.forEach((n, c) => {
    const v = contraste(c, '#ffffff');
    if (v < 4.5) {
      problemas.push('CONTRASTE: ' + f + ' usa ' + c + ' como color de texto (' + n +
                     ' vez/veces) y sobre blanco da ' + v.toFixed(2) + ', por debajo de 4.5');
    }
  });
});

/* ------------------------------------------------- los colores de la marca
   Los cuatro colores del brandbook estan definidos en MAS DE UN ARCHIVO, y no por
   descuido: politicas.html, mayoristas.html y resena.html no cargan styles.css,
   asi que cada una lleva su propia copia.

   Eso ya se separo una vez. Al cambiar la marca en 2026 esas tres paginas se
   quedaron con la paleta anterior entera —verde #1E3E2C, oro #EDB833— mientras el
   resto del sitio ya estaba con la nueva. No dio ningun error: simplemente eran
   otra marca, y son paginas que ve el cliente.

   Asi que se comparan contra un unico canon. Si alguien cambia un color, o lo
   cambia en todos lados o el build se corta.

   Ojo: esto NO es "no uses otros colores". Derivar tonos de estos cuatro esta
   perfecto y la hoja esta llena de derivados. Lo que se controla es que los
   CUATRO de origen digan lo mismo en todas partes, y que no reaparezca ninguno
   de los viejos. */
const MARCA = {
  '--brand-negro': '#161616',
  '--brand-verde': '#3d402f',
  '--brand-mostaza': '#a79066',
  '--brand-crudo': '#dfe0d2',
};
/* Los de la marca anterior. Si vuelve a aparecer alguno es que quedo algo sin
   migrar, o que se copio y pego una regla vieja. */
const MARCA_VIEJA = ['#1E3E2C', '#14251A', '#EDB833', '#F5EEDA', '#F4F8F2',
                     '#E3EDDF', '#CBDCC6', '#B9922E', '#26261F', '#8FCBA3', '#C89312'];

const ARCHIVOS_TIENDA = ['index.html', 'styles.css', 'app.js', 'toolbar.css', 'footer-dev.css',
                         'politicas.html', 'mayoristas.html', 'resena.html'];

ARCHIVOS_TIENDA.forEach((f) => {
  const r = path.join(__dirname, f);
  if (!fs.existsSync(r)) return;
  const t = fs.readFileSync(r, 'utf8');

  Object.keys(MARCA).forEach((v) => {
    const re = new RegExp(v + '\\s*:\\s*([^;}\\s]+)', 'g');
    let m;
    while ((m = re.exec(t))) {
      const val = m[1].trim().toLowerCase();
      if (val !== MARCA[v]) {
        problemas.push('MARCA: ' + f + ' define ' + v + ' como ' + val +
                       ' y el brandbook dice ' + MARCA[v]);
      }
    }
  });

  MARCA_VIEJA.forEach((c) => {
    const n = (t.match(new RegExp(c, 'gi')) || []).length;
    if (n) {
      problemas.push('MARCA: ' + f + ' todavia usa ' + c + ' (' + n +
                     ' vez/veces), que es de la paleta anterior');
    }
  });
});

/* ==========================================================================
   HANDLERS Y ELEMENTOS FANTASMA

   Un onclick="hacerAlgo()" que apunta a una funcion que no existe no se nota
   nunca: el boton se dibuja igual, con su icono y su texto, y recien cuando
   alguien lo aprieta salta un ReferenceError en la consola y no pasa nada. No
   hay pantalla rota que lo delate. Ya paso con toggleCategoryFilters(), que
   estaba escrito en el HTML y no existia en ningun lado.

   Lo mismo con getElementById('algo'): devuelve null, y la linea de al lado
   revienta o -peor- esta guardada tras un `if (!el) return;` y la funcion se
   va en silencio sin hacer lo que le pediste.

   Las dos cosas se pueden ver sin abrir el navegador, asi que se ven aca.
   ========================================================================== */
const FUENTES = [['admin.html', html]].concat(
  MODULOS.map((f) => [f, fs.readFileSync(path.join(__dirname, f), 'utf8')]));

/* Lo que existe. Se cuenta como definicion `function nombre(`, un const/let/var
   con una funcion del otro lado, y window.nombre =. Es a proposito generoso: si
   duda, calla. Lo que buscamos son los nombres que no aparecen en NINGUN lado. */
const DEFINIDAS = new Set();
[
  /function\s+([A-Za-z_$][\w$]*)/g,
  /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\(|[A-Za-z_$][\w$]*\s*=>)/g,
  /window\.([A-Za-z_$][\w$]*)\s*=/g,
].forEach((re) => {
  FUENTES.forEach(([, t]) => {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(t))) DEFINIDAS.add(m[1]);
  });
});

/* Palabras que en un handler parecen una llamada y no lo son. */
const NO_ES_FUNCION = new Set(['if', 'for', 'while', 'switch', 'catch', 'return',
  'typeof', 'new', 'function', 'else', 'do', 'delete', 'void', 'in', 'of', 'case',
  'await', 'alert', 'confirm', 'prompt', 'print', 'open', 'close', 'event', 'this',
  'window', 'document', 'console', 'Number', 'String', 'Boolean', 'JSON', 'Math',
  'Date', 'parseInt', 'parseFloat', 'isNaN', 'setTimeout', 'clearTimeout',
  'encodeURIComponent', 'decodeURIComponent', 'Object', 'Array', 'navigator',
  'location', 'history', 'require']);

const fantasmas = new Map();
const anotar = (mapa, clave, donde) => {
  if (!mapa.has(clave)) mapa.set(clave, []);
  if (mapa.get(clave).length < 3) mapa.get(clave).push(donde);
};

FUENTES.forEach(([archivo, texto]) => {
  /* Los handlers escritos en el HTML y los que se arman dentro de un string de
     JS para meterlos con innerHTML: los dos terminan igual en el navegador. */
  const reAttr = /\son[a-z]+\s*=\s*\\?["']([^"'\\]*)/g;
  let h;
  while ((h = reAttr.exec(texto))) {
    const linea = texto.slice(0, h.index).split('\n').length;
    const reCall = /(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*\(/g;
    let c;
    while ((c = reCall.exec(h[1]))) {
      if (!NO_ES_FUNCION.has(c[1]) && !DEFINIDAS.has(c[1])) {
        anotar(fantasmas, c[1], archivo + ':' + linea);
      }
    }
  }
});

[...fantasmas.keys()].sort().forEach((n) => {
  problemas.push('FANTASMA: se llama a ' + n + '() desde un handler y esa funcion ' +
                 'no existe (' + fantasmas.get(n).join(', ') + ')');
});

/* Los ids que existen, vengan del HTML o de un string de JS. */
const IDS = new Set();
FUENTES.forEach(([, t]) => {
  let m;
  const re = /\bid\s*=\s*\\?["']([A-Za-z_][\w-]*)\\?["']/g;
  while ((m = re.exec(t))) IDS.add(m[1]);
});

const idsRotos = new Map();
FUENTES.forEach(([archivo, texto]) => {
  let m;
  const re = /getElementById\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = re.exec(texto))) {
    if (!IDS.has(m[1])) {
      anotar(idsRotos, m[1], archivo + ':' + texto.slice(0, m.index).split('\n').length);
    }
  }
});

[...idsRotos.keys()].sort().forEach((n) => {
  problemas.push('FANTASMA: getElementById("' + n + '") y ese id no esta en ' +
                 'ningun lado (' + idsRotos.get(n).join(', ') + ')');
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
  if (problemas.some((p) => p.startsWith('CONTRASTE:'))) {
    console.error('\nUn texto sin contraste se VE pero no se LEE, asi que pasa');
    console.error('cualquier revision a ojo. Usa var(--color-text-light) para el');
    console.error('texto tenue: esta medido y da 6.44 sobre blanco.');
  }
  if (problemas.some((p) => p.startsWith('FANTASMA:'))) {
    console.error('\nUn boton que llama a una funcion que no existe se DIBUJA igual.');
    console.error('No se rompe nada a la vista: se aprieta y no pasa nada. Revisa si');
    console.error('el nombre esta mal escrito o si quedo el handler de algo que borraste.');
  }
  if (problemas.some((p) => p.startsWith('MARCA:'))) {
    console.error('\nUn color de marca que no coincide no rompe nada: la pagina se ve');
    console.error('igual de bien, pero con OTRA marca. Es de lo que menos se nota solo.');
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
