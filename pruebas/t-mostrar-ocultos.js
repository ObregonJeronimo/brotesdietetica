/**
 * CASILLA "MOSTRAR PRODUCTOS OCULTOS" EN PRODUCTOS.
 *
 * Pedido del comercio (14/09): una casilla en la barra de Productos, tildada de
 * entrada; destildada, los productos ocultos no salen en la lista.
 *
 * Ya habia un desplegable de visibilidad (Visibles y ocultos / Solo visibles / Solo
 * ocultos). La casilla va atada a el: destildarla es "Solo visibles", tildarla vuelve
 * a mostrar todo, y lo que se elige en el desplegable pone la casilla como
 * corresponde. Si pudieran decir cosas distintas, "Solo ocultos" con la casilla
 * destildada dejaria la lista vacia sin explicacion.
 *
 * Se corren filterTable y mostrarOcultosEnLista de verdad, con un document de mentira.
 */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(RAIZ, 'admin.html'), 'utf8');

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + extra + ']' : '')); }
};
function cuerpo(texto, n) {
  const i = texto.indexOf('function ' + n + '(');
  if (i < 0) return '';
  let p = 0, k;
  for (k = texto.indexOf('{', i); k < texto.length; k++) {
    if (texto[k] === '{') p++;
    else if (texto[k] === '}') { p--; if (!p) break; }
  }
  return texto.slice(i, k + 1);
}

console.log('\n-- la casilla --');
const casillas = html.match(/<input type="checkbox" id="mostrarOcultos"[^>]*>/g) || [];
t('esta una sola vez', casillas.length === 1, casillas.length);
t('tildada de entrada', / checked[ >]/.test(casillas[0] || ''));
t('con el texto pedido', html.indexOf('> Mostrar productos ocultos</label>') > 0);
t('en la barra de Productos, al lado del desplegable de visibilidad', /id="filterVisibilidad"[^<]*(<option[^<]*<\/option>)+<\/select><label class="tb-check"[^>]*><input type="checkbox" id="mostrarOcultos"/.test(html));
t('tocarla vuelve a la pagina 1: cambia el desplegable, que es parte de la firma de los filtros',
  /\['searchInput', 'filterCat', 'filterLista', 'filterVisibilidad'\]/.test(fs.readFileSync(path.join(RAIZ, 'admin-pagination.js'), 'utf8')));

console.log('\n-- la lista --');
const PRODS = [
  { id: 'a', nombre: 'Almendra', oculto: true },
  { id: 'b', nombre: 'Boldo' },
  { id: 'c', nombre: 'Chia', oculto: true },
  { id: 'd', nombre: 'Datiles', depurado: true },
  { id: 'e', nombre: 'Espirulina' },
];
const dom = {
  searchInput: { value: '' }, filterCat: { value: '' }, filterLista: { value: '' },
  filterVisibilidad: { value: '' }, mostrarOcultos: { checked: true },
  tbSemanalWrap: { style: {} }, tbSepSemanal: { style: {} },
};
let filas = '';
const api = new Function('allProducts', 'document', 'listasData', 'listaUsaPdfSemanal', 'listaPdfSemanal',
  'coincideProducto', 'renderTable', 'adminSortField', 'adminSortDir',
  cuerpo(html, 'filterTable') + '\n' + cuerpo(html, 'mostrarOcultosEnLista') +
  '\nreturn { filtrar: filterTable, casilla: mostrarOcultosEnLista };')(
  PRODS, { getElementById: id => dom[id] || null }, [], () => false, () => null,
  (p, q) => (p.nombre || '').toLowerCase().includes(q), prods => { filas = prods.map(p => p.id).join(','); }, null, 'asc');
/* Como el navegador: el clic cambia la casilla y despues corre el onchange. */
const tocar = ver => { dom.mostrarOcultos.checked = ver; api.casilla(ver); };
const elegir = v => { dom.filterVisibilidad.value = v; api.filtrar(); };

api.filtrar();
t('de entrada salen visibles y ocultos (los depurados nunca)', filas === 'a,b,c,e', filas);
t('  con la casilla tildada', dom.mostrarOcultos.checked === true);
tocar(false);
t('destildada, los ocultos no salen', filas === 'b,e', filas);
t('  y el desplegable dice "Solo visibles"', dom.filterVisibilidad.value === 'visibles', dom.filterVisibilidad.value);
tocar(true);
t('tildada otra vez, vuelven, y el desplegable a "Visibles y ocultos"', filas === 'a,b,c,e' && dom.filterVisibilidad.value === '', filas);
elegir('ocultos');
t('con "Solo ocultos" salen solo los ocultos y la casilla queda tildada', filas === 'a,c' && dom.mostrarOcultos.checked === true, filas);
tocar(false);
t('  destildarla ahi los esconde, en vez de dejar la lista vacia', filas === 'b,e' && dom.filterVisibilidad.value === 'visibles', filas);
elegir('ocultos'); tocar(true);
t('tildarla con "Solo ocultos" elegido no lo cambia', dom.filterVisibilidad.value === 'ocultos' && filas === 'a,c', filas);
elegir('visibles');
t('elegir "Solo visibles" en el desplegable destilda la casilla', dom.mostrarOcultos.checked === false && filas === 'b,e', filas);
elegir('');
t('y "Visibles y ocultos" la vuelve a tildar', dom.mostrarOcultos.checked === true && filas === 'a,b,c,e', filas);
dom.searchInput.value = 'a';
tocar(false);
t('se combina con la busqueda', filas === 'e', filas);
tocar(true);
t('  tildada, la busqueda trae tambien los ocultos', filas === 'a,c,e', filas);

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
