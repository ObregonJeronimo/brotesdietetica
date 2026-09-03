/**
 * PROVEEDORES: LISTA A LA IZQUIERDA, DETALLE A LA DERECHA.
 *
 * Antes eran tarjetas en grilla. Con 27 proveedores quedaban apretadas, el
 * rotulo "Monto generado de este proveedor" repetido en cada una chocaba con
 * el nombre, y al elegir uno el detalle aparecia DEBAJO de todas: elegir y
 * leer eran dos scrolls largos.
 *
 * Ahora la lista va a la izquierda con su buscador, y el detalle a la derecha
 * arrancando a la misma altura.
 *
 * EL BUG QUE ESTA PRUEBA CUIDA
 *
 * La primera version de provBuscar reemplazaba el contenido de la lista por el
 * cartel de "ningun proveedor coincide". Eso BORRABA los botones, y al borrar
 * la busqueda no volvia ninguno: la lista quedaba vacia hasta recargar la
 * pagina. Filtrar tiene que esconder y mostrar, nunca destruir.
 */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(RAIZ, 'admin-proveedores.js'), 'utf8');
const html = fs.readFileSync(path.join(RAIZ, 'admin.html'), 'utf8');

function cuerpo(n) {
  const i = src.indexOf('function ' + n + '(');
  if (i < 0) throw new Error('no encontre ' + n);
  let p = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') p++;
    else if (src[k] === '}') { p--; if (!p) break; }
  }
  return src.slice(i, k + 1);
}

let ok = 0, fail = 0;
const t = (d, c) => { if (c) { ok++; console.log('  OK   ' + d); } else { fail++; console.log('  FALLA ' + d); } };

/* ------------------------------------------------------------ el buscador */
const norm = new Function(cuerpo('_provNormalizar') + ';return _provNormalizar;')();
t('pasa a minusculas', norm('LA HERBOLERIA') === 'la herboleria');
/* Nadie escribe los acentos para buscar. */
t('saca los acentos', norm('Café Molido') === 'cafe molido');
t('null y numeros no rompen', norm(null) === '' && norm(7) === '7');

const filtrar = new Function(
  'var _provFiltro;' + cuerpo('_provNormalizar') + cuerpo('_provFiltrados') +
  ';return function(rs, q){ _provFiltro = q; return _provFiltrados(rs); };')();

const R = [
  { lista: { id: 'a', nombre: 'LA HERBOLERIA' } },
  { lista: { id: 'b', nombre: 'FRUTICOR 1' } },
  { lista: { id: 'c', nombre: 'Café del Centro' } },
];
const nom = (x) => x.map(r => r.lista.nombre).join('|');

t('sin texto no filtra', filtrar(R, '').length === 3);
t('encuentra por un pedazo del nombre', nom(filtrar(R, 'herb')) === 'LA HERBOLERIA');
t('no distingue mayusculas', nom(filtrar(R, 'HERBOLERIA')) === 'LA HERBOLERIA');
t('encuentra sin escribir el acento', nom(filtrar(R, 'cafe')) === 'Café del Centro');
t('y tambien escribiendolo', nom(filtrar(R, 'café')) === 'Café del Centro');
t('el espacio de mas no molesta', nom(filtrar(R, '  fruticor ')) === 'FRUTICOR 1');
t('algo que no esta no trae nada', filtrar(R, 'zzz').length === 0);

/* -------------------------------------------- filtrar NO puede destruir
   Es el bug que hubo: con innerHTML el cartel se comia los botones y al
   borrar la busqueda la lista quedaba vacia para siempre. */
const fnBuscar = cuerpo('provBuscar');
t('provBuscar no reemplaza el contenido de la lista',
  fnBuscar.indexOf('caja.innerHTML') < 0);
t('esconde y muestra con display', /b\.style\.display = ver \? '' : 'none'/.test(fnBuscar));
t('el cartel se agrega al final, sin tocar lo que hay',
  fnBuscar.indexOf('insertAdjacentHTML') > 0);
t('y se saca cuando vuelve a haber resultados',
  /if \(algo\) \{ if \(aviso\) aviso\.remove\(\); \}/.test(fnBuscar));
t('con la lista vacia de entrada no agrega un segundo cartel',
  /if \(!items\.length\) return;/.test(fnBuscar));

/* --------------------------------------------------------- la estructura */
t('hay dos columnas: lista y detalle', /\.prov-split\{display:grid;grid-template-columns:340px 1fr/.test(html));
t('el buscador vive DENTRO de la columna de la lista, no arriba de las dos',
  src.indexOf('prov-lado') < src.indexOf('provBuscarInput') &&
  src.indexOf('provBuscarInput') < src.indexOf("class=\"prov-lista\""));
t('el detalle va en la segunda columna', src.indexOf('prov-lista') < src.indexOf('id="provDetalle"'));
t('la lista scrollea sola', /\.prov-lista\{overflow-y:auto/.test(html));
t('y queda pegada arriba mientras se lee el detalle', /\.prov-lado\{position:sticky/.test(html));

/* El rotulo del monto va UNA vez como encabezado, no repetido en cada fila:
   repetido era lo que chocaba con el nombre. */
t('el rotulo del monto va una sola vez, como encabezado',
  src.indexOf('Monto generado</span>') > 0 &&
  src.indexOf('Monto generado de este proveedor') < 0);

/* Las dos lineas de texto largo se recortan. Son <span>, y en un elemento
   inline el text-overflow no hace nada: el texto empujaba el ancho del boton. */
['prov-item-n', 'prov-item-d', 'prov-item-x'].forEach(c => {
  const i = html.indexOf('.' + c + '{');
  const regla = html.slice(i, html.indexOf('}', i));
  t(c + ' se recorta con puntos suspensivos', /text-overflow:ellipsis/.test(regla));
  if (c !== 'prov-item-n') {
    t(c + ' es de bloque, si no el recorte no aplica', /display:block/.test(regla));
  }
});

t('en pantalla angosta se apilan', /@media \(max-width: 900px\)[\s\S]{0,200}grid-template-columns:1fr/.test(html));
t('y ahi la lista deja de estar pegada', /@media \(max-width: 900px\)[\s\S]{0,260}position:static/.test(html));

/* Sin proveedor elegido tiene que decir que hacer, no quedar en blanco. */
t('sin seleccion, el panel derecho explica que hacer',
  src.indexOf('Elegí un proveedor de la lista') > 0 ||
  src.indexOf('Eleg\\u00ed un proveedor de la lista') > 0);

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
