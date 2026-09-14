/**
 * DESPLEGABLES CON BUSCADOR Y CATEGORÍA OPCIONAL.
 *
 * LO QUE ESTA PRUEBA CUIDA
 *
 * 1. Que el <select> siga existiendo, una sola vez y con su id. saveProduct lee su
 *    .value: si el buscador lo reemplazara, el producto se guardaría sin lista y
 *    sin categoría, y no daría ningún error.
 * 2. Que buscar ignore mayúsculas y tildes.
 * 3. Que se pueda guardar sin categoría, y que mientras esté vacía se avise.
 */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const src = leer('admin-selector.js');
const html = leer('admin.html');

/* Se corta antes de la parte de pantalla: esa necesita DOM. */
const logica = src.slice(0, src.indexOf('/* ======================== LA PANTALLA'));
const M = new Function(logica + ';return { filtrar: selbFiltrar };')();

let ok = 0, fail = 0;
const t = (d, c) => { if (c) { ok++; console.log('  OK   ' + d); } else { fail++; console.log('  FALLA ' + d); } };
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
const valores = arr => arr.map(o => o.value).join(',');

/* ==================================================================== BUSCAR */
console.log('\n-- buscar --');
const OPS = [{ value: '', texto: 'Sin lista' }, { value: 'L1', texto: 'FRUTICOR' },
             { value: 'L2', texto: 'Orgánicos Del Sur' }, { value: 'L3', texto: 'LA HERBOLERIA' }];
t('sin escribir nada ofrece todas, incluida la vacía', M.filtrar(OPS, '').length === 4);
t('ignora mayúsculas', valores(M.filtrar(OPS, 'fruti')) === 'L1');
t('ignora tildes: "organicos" encuentra "Orgánicos"', valores(M.filtrar(OPS, 'organicos')) === 'L2');
t('  y al revés: "orgánicos" también', valores(M.filtrar(OPS, 'orgánicos')) === 'L2');
t('encuentra en el medio del nombre', valores(M.filtrar(OPS, 'herbo')) === 'L3');
t('buscando, la opción vacía no estorba', !M.filtrar(OPS, 'sin').some(o => o.value === ''));
t('si nada coincide, no ofrece nada', M.filtrar(OPS, 'zzz').length === 0);

/* ==================================================== EL SELECT SIGUE MANDANDO */
console.log('\n-- el select sigue mandando --');
const mejorar = cuerpo(src, 'selbMejorar');
['pCategoria', 'pSubcategoria', 'pLista'].forEach(id =>
  t('#' + id + ' sigue en el formulario, una sola vez', (html.match(new RegExp('id="' + id + '"', 'g')) || []).length === 1));
t('los tres se mejoran al cargar', /\['pCategoria', 'pSubcategoria', 'pLista'\]\.forEach/.test(src));
t('elegir escribe el value del select y dispara change', /sel\.value = v\.value;[\s\S]{0,80}sel\.dispatchEvent\(new Event\('change'/.test(mejorar));
t('un value puesto desde el código actualiza el botón', /Object\.defineProperty\(sel, nombre/.test(mejorar) && /propiedad\('value'\)/.test(mejorar));
t('  y si se reescriben las opciones, también', /new MutationObserver\(pintar\)/.test(mejorar));
t('  y después de form.reset(), que además cierra el panel',
  /addEventListener\('reset', \(\) => \{ cerrar\(false\); setTimeout\(pintar, 0\); \}\)/.test(mejorar));
t('el foco que pide saveProduct va al botón', /sel\.focus = \(\) =>/.test(mejorar));
t('los nombres se escriben con textContent', /b\.textContent = visibles\[i\]\.texto/.test(mejorar));
t('Escape cierra el buscador', /'Escape'\)[\s\S]{0,60}cerrar\(true\)/.test(mejorar));
t('  también con el foco afuera del buscador',
  /document\.addEventListener\('keydown', e => \{ if \(e\.key === 'Escape' && !panel\.hidden\) cerrar\(true\); \}\)/.test(mejorar));
t('  sin cerrar el formulario de atrás: atajos se fija si hay un panel abierto (t-escape.js)',
  leer('admin-atajos.js').indexOf('.selb-panel:not([hidden])') > 0);
t('el script se carga', html.indexOf('<script src="admin-selector.js"></script>') > 0);
t('la lista no tiene required: el aviso del navegador apuntaría a un select invisible', html.indexOf('id="pLista" required') < 0);
t('  y la sigue controlando saveProduct', /if\(!_listaVal\)\{showAdminToast\('Seleccioná una lista de proveedor'/.test(html));

/* ===================================================== GUARDAR SIN CATEGORIA */
console.log('\n-- guardar sin categoría --');
t('la categoría ya no es obligatoria', html.indexOf('id="pCategoria" required') < 0);
t('  ni tiene asterisco', html.indexOf('<label>Categoria *</label>') < 0);
t('hay un aviso', html.indexOf('id="pCatAviso"') > 0 && html.indexOf('Este producto se guardará sin categoría') > 0);
t('se ve solo con la categoría vacía',
  /a\.style\.display=\(document\.getElementById\('pCategoria'\)\|\|\{\}\)\.value\?'none':'flex'/.test(html));
t('se repinta al cambiar la categoría', /function updateSubcatSelect\(\)\{_pintarAvisoCategoria\(\);/.test(html));
t('  y cuando el código pone el valor, al editar', /alPintar: \(\) => \{ if \(typeof _pintarAvisoCategoria === 'function'\) _pintarAvisoCategoria\(\); \}/.test(src));
t('saveProduct guarda la categoría vacía tal cual', /categoria:document\.getElementById\('pCategoria'\)\.value\.trim\(\)/.test(html));

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
