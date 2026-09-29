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

/* ------------------------- elegir uno con algo escrito, y despues borrar
   Pedido del duenio (29/09/2026): buscando "andnuts" y tocando ANDNUTS, la
   lista se volvia a dibujar solo con los que coincidian; al borrar la busqueda
   provBuscar solo podia mostrar lo que habia quedado, y la lista se quedaba
   con ANDNUTS. Ahora se dibujan todos y se esconden los que no coinciden. */
function dibujar(filtro, abierto) {
  const cont = { innerHTML: '' };
  const LISTAS = [{ id: 'l1', nombre: 'VERDEDIET' }, { id: 'l2', nombre: 'ANDNUTS' }, { id: 'l3', nombre: 'FRUTICOR' }];
  const fakes = {
    document: { getElementById: id => (id === 'provBody' ? cont : null) },
    listasData: LISTAS,
    PROV_PERIODOS: [{ dias: 90, etq: 'Últimos 90 días' }],
    _provDias: 90, _provDatos: null, _provAbierto: abierto || null, _provFiltro: filtro,
    _provResumen: l => ({ lista: l, facturado: 100, productos: 1, ventas: 1, sinVender: 0, gastado: 0, debe: 0, top: [] }),
    _provCard: () => '', _provRenderDetalle: () => {}, _provPesos: n => '$' + n,
    esc: s => String(s),
  };
  const nombres = Object.keys(fakes);
  new Function(...nombres, cuerpo('_provNormalizar') + cuerpo('_provFiltrados') + cuerpo('renderProveedores') +
    ';renderProveedores();')(...nombres.map(n => fakes[n]));
  return cont.innerHTML;
}
/* Los botones dibujados, como los veria provBuscar: con su nombre y si estan escondidos. */
function botonesDe(h) {
  return [...h.matchAll(/<button type="button" class="prov-item[^"]*" (style="display:none" )?onclick="provAbrir\('[^']+'\)">[\s\S]*?<span class="prov-item-n">([^<]*)<\/span>/g)]
    .map(m => ({ nombre: m[2], style: { display: m[1] ? 'none' : '' } }));
}
/* Borrar la busqueda, con provBuscar de verdad sobre esos botones. */
function borrar(h, desde) {
  const bs = botonesDe(h);
  let aviso = h.indexOf('prov-vacio') > 0 ? { remove() { aviso = null; } } : null;
  const caja = {
    querySelectorAll: () => bs.map(b => Object.assign(b, { querySelector: () => ({ textContent: b.nombre }) })),
    querySelector: () => aviso,
    insertAdjacentHTML: () => { aviso = { remove() { aviso = null; } }; },
  };
  const doc = { getElementById: () => ({ querySelector: () => caja }) };
  const buscar = new Function('document', '_provFiltro', 'renderProveedores',
    cuerpo('_provNormalizar') + cuerpo('provBuscar') + ';return provBuscar;')(doc, desde, () => {});
  buscar('');
  return { visibles: bs.filter(b => b.style.display !== 'none').map(b => b.nombre).join(), aviso: !!aviso };
}
{
  const h = dibujar('andnuts', 'l2');
  const bs = botonesDe(h);
  t('con "andnuts" escrito y ANDNUTS elegido, se dibujan los tres', bs.length === 3);
  t('  y a la vista queda solo ANDNUTS', bs.filter(b => b.style.display !== 'none').map(b => b.nombre).join() === 'ANDNUTS');
  const r = borrar(h, 'andnuts');
  t('al borrar la busqueda vuelven todos', r.visibles === 'VERDEDIET,ANDNUTS,FRUTICOR', r.visibles);
}
{
  const h = dibujar('zzz');
  t('si no coincide ninguno: todos escondidos y el cartel despues',
    botonesDe(h).every(b => b.style.display === 'none') && /<\/button><p class="prov-vacio">Ning/.test(h));
  const r = borrar(h, 'zzz');
  t('  y al borrar vuelven todos y se va el cartel', r.visibles === 'VERDEDIET,ANDNUTS,FRUTICOR' && !r.aviso);
}
{
  const h = dibujar('');
  t('sin nada escrito, ninguno escondido y sin cartel',
    botonesDe(h).length === 3 && h.indexOf('display:none') < 0 && h.indexOf('prov-vacio') < 0);
}

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
