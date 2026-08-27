/* Prueba la seleccion y la carga en tanda con las funciones REALES de admin.html */
const fs = require('fs');
const src = fs.readFileSync('admin.html', 'utf8');
function extraer(n) {
  const i = src.indexOf('function ' + n + '(');
  if (i < 0) throw new Error('falta ' + n);
  let b = src.indexOf('{', i), prof = 0, k;
  for (k = b; k < src.length; k++) { if (src[k] === '{') prof++; else if (src[k] === '}') { prof--; if (!prof) break; } }
  let ini = i;
  if (src.slice(i - 6, i) === 'async ') ini = i - 6;
  return src.slice(ini, k + 1);
}

let allProducts = [];
let avisos = [], confirmado = true, acciones = [];
let LOTES = [], COMMITS = 0;
const els = {};
function el(id) { return els[id] || (els[id] = { checked: false, indeterminate: false, disabled: false, hidden: false, value: '', textContent: '', innerHTML: '' }); }
global.document = {
  getElementById: (id) => el(id),
  querySelectorAll: () => ({ forEach: () => {} })
};
global.showAdminToast = (m) => { avisos.push(m); };
global.confirm = () => confirmado;
/* El panel ya no usa el confirm del navegador: tiene su propio dialogo
   (admin-dialogo.js, pedirConfirmacion). Devuelve una promesa. */
global.pedirConfirmacion = async () => confirmado;
global.logAction = (a, b, c) => acciones.push(b);
global._reRenderProductos = () => {};
global.firebase = { firestore: { FieldValue: { increment: (n) => ({ __inc: n }) } } };
global.db = {
  collection: () => ({ doc: (id) => ({ __id: id }) }),
  batch: () => { const ops = []; return { update: (ref, d) => ops.push({ id: ref.__id, d }), commit: async () => { LOTES.push(ops); COMMITS++; } }; }
};

let _stockSel = new Set(), _stockVisibles = [];
eval(extraer('pintarSeleccionStock') + ';' + extraer('stockAlternar') + ';' +
     extraer('stockSeleccionarTodos') + ';' + extraer('stockLimpiarSeleccion') + ';' +
     extraer('agregarStockMasivo') + ';' +
     'global.P=pintarSeleccionStock;global.A=stockAlternar;global.T=stockSeleccionarTodos;' +
     'global.L=stockLimpiarSeleccion;global.G=agregarStockMasivo;');

let ok = 0, fail = 0;
const t = (d, c) => { if (c) { ok++; console.log('  OK   ' + d); } else { fail++; console.log('  FALLA ' + d); } };
const grupo = (n) => console.log('\n' + n);

(async () => {
  grupo('Seleccionar');
  _stockVisibles = ['a', 'b', 'c'];
  A('a', true);
  t('marca uno', _stockSel.has('a') && _stockSel.size === 1);
  t('el contador lo dice', el('stockSelCuenta').textContent === '1 seleccionado');
  t('el boton se habilita', el('stockMasivoBtn').disabled === false);
  t('y dice cuantos', /de 1$/.test(el('stockMasivoBtn').innerHTML));
  t('la casilla de arriba queda indeterminada', el('stockSelTodos').indeterminate === true);
  A('a', false);
  t('desmarca', _stockSel.size === 0);
  t('el boton se deshabilita', el('stockMasivoBtn').disabled === true);
  t('el contador se vacia', el('stockSelCuenta').textContent === '');

  grupo('Seleccionar todos');
  T(true);
  t('marca los 3 visibles', _stockSel.size === 3);
  t('la casilla queda marcada, no indeterminada', el('stockSelTodos').checked === true && el('stockSelTodos').indeterminate === false);
  t('plural en el contador', el('stockSelCuenta').textContent === '3 seleccionados');

  grupo('Con un filtro puesto, "todos" son solo los visibles');
  L();
  _stockVisibles = ['a', 'b'];          /* c quedo fuera del filtro */
  T(true);
  t('no alcanza al que no se ve', _stockSel.size === 2 && !_stockSel.has('c'));
  t('el texto dice cuantos son', /los 2 visibles/.test(el('stockSelTodosTxt').textContent));

  grupo('Agregar stock');
  allProducts = [{ id: 'a', nombre: 'Yerba', stock: 10 }, { id: 'b', nombre: 'Miel', stock: 4 }];
  _stockSel = new Set(['a', 'b']); _stockVisibles = ['a', 'b'];
  el('stockMasivoCant').value = '12';
  LOTES = []; COMMITS = 0; avisos = []; acciones = [];
  await G();
  t('un solo lote', COMMITS === 1);
  t('con las dos operaciones', LOTES[0].length === 2);
  t('usa increment y no un valor fijo', LOTES[0][0].d.stock.__inc === 12);
  t('memoria: 10 + 12 = 22', allProducts[0].stock === 22);
  t('memoria: 4 + 12 = 16', allProducts[1].stock === 16);
  t('avisa bien', /\+12 de stock en 2 productos/.test(avisos[0]));
  t('queda en el historial', /\+12 a 2 productos/.test(acciones[0]));
  t('limpia la seleccion', _stockSel.size === 0);
  t('y el campo', el('stockMasivoCant').value === '');

  grupo('Descontar (numero negativo)');
  allProducts = [{ id: 'a', nombre: 'Yerba', stock: 10 }];
  _stockSel = new Set(['a']); _stockVisibles = ['a'];
  el('stockMasivoCant').value = '-3';
  LOTES = []; avisos = [];
  await G();
  t('resta', allProducts[0].stock === 7);
  t('increment negativo', LOTES[0][0].d.stock.__inc === -3);

  grupo('Lo que no debe pasar');
  _stockSel = new Set(); avisos = [];
  await G();
  t('sin seleccion avisa y no escribe', avisos.length === 1 && /al menos un producto/.test(avisos[0]));
  _stockSel = new Set(['a']); el('stockMasivoCant').value = ''; avisos = []; LOTES = [];
  await G();
  t('sin cantidad no escribe nada', LOTES.length === 0 && /cu.nto stock/.test(avisos[0]));
  el('stockMasivoCant').value = '0'; avisos = []; LOTES = [];
  await G();
  t('cero tampoco', LOTES.length === 0);
  el('stockMasivoCant').value = 'abc'; avisos = []; LOTES = [];
  await G();
  t('texto tampoco', LOTES.length === 0);

  grupo('Si se cancela la confirmacion');
  allProducts = [{ id: 'a', nombre: 'Yerba', stock: 10 }];
  _stockSel = new Set(['a']); el('stockMasivoCant').value = '5';
  confirmado = false; LOTES = [];
  await G();
  t('no escribe nada', LOTES.length === 0);
  t('y no toca la memoria', allProducts[0].stock === 10);
  confirmado = true;

  grupo('Muchos productos');
  allProducts = Array.from({ length: 1000 }, (_, i) => ({ id: 'p' + i, nombre: 'P' + i, stock: 0 }));
  _stockSel = new Set(allProducts.map(p => p.id));
  el('stockMasivoCant').value = '1';
  LOTES = []; COMMITS = 0;
  await G();
  t('1.000 productos en 3 lotes de 450', COMMITS === 3);
  t('todas las operaciones', LOTES.reduce((s, l) => s + l.length, 0) === 1000);
  t('ninguno supera el limite de 500', LOTES.every(l => l.length <= 500));

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('EXPLOTO:', e); process.exit(1); });
