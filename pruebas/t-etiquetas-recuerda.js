/**
 * ETIQUETAS: SE RECUERDA LO ÚLTIMO QUE SE USÓ.
 *
 * Revisión del 28/09/2026 (etiquetas en papel térmico adhesivo): el formato y "Rollo
 * continuo" volvían a "Hoja A4" y tildado cada vez que se abría el panel. Con un rollo de
 * etiquetas ya cortadas, olvidarse de destildarlo imprime una tira corrida y se pierde
 * esa tanda. Ahora se guarda al imprimir y se pone la primera vez que se abre la ventana.
 *
 * Corre admin-etiquetas.js de verdad, con un document y un localStorage de mentira que
 * sobrevive entre "cargas de la página".
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(RAIZ, 'admin-etiquetas.js'), 'utf8');
const html = fs.readFileSync(path.join(RAIZ, 'admin.html'), 'utf8');

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + extra + ']' : '')); }
};

/* El localStorage del navegador: lo que se guarda queda para la próxima carga. */
function almacen(opts) {
  const o = opts || {};
  const datos = {};
  return {
    datos,
    getItem: k => { if (o.rompe) throw new Error('bloqueado'); return Object.prototype.hasOwnProperty.call(datos, k) ? datos[k] : null; },
    setItem: (k, v) => { if (o.rompe) throw new Error('bloqueado'); datos[k] = String(v); },
  };
}

/* Una carga del panel: los campos de la ventana de etiquetas con los valores con que
   vienen en admin.html, y el módulo corriendo. */
function cargar(ls) {
  const el = extra => Object.assign({ value: '', checked: false, style: {}, innerHTML: '',
    classList: { add() {}, remove() {}, contains() { return false; } } }, extra || {});
  const campos = {
    etqBuscar: el(), etqLista: el(), etqSoloPeso: el(), etqLista_: el(), etqResumen: el(), etiquetasModal: el(),
    etqCustom: el(), etqRollo: el({ style: { display: 'none' } }),
    etqContinuo: el({ checked: true }), etqSeparacion: el({ value: '2' }), etqCustomTermica: el(),
    etqCustomAncho: el({ value: '70' }), etqCustomAlto: el({ value: '37' }), etqCustomCols: el({ value: '3' }),
    etqCustomFilas: el({ value: '8' }), etqCustomMargenH: el({ value: '0' }), etqCustomMargenV: el({ value: '5' }),
    etqConPrecio: el({ checked: true }), etqConCodigo: el(),
  };
  /* El select de formato: al escribirle las opciones queda elegida la "selected". */
  let hFormato = '';
  campos.etqFormato = {
    style: {}, value: '',
    get innerHTML() { return hFormato; },
    set innerHTML(h) { hFormato = h; const m = h.match(/value="([^"]+)" selected/); this.value = m ? m[1] : ''; },
  };
  const ventanas = [];
  const ctx = {
    console, Math, Number, String, Object, Array, JSON, Set, Map, isFinite, parseInt,
    setTimeout: () => 0,
    localStorage: ls,
    document: { getElementById: id => campos[id] || null, querySelector: () => null, querySelectorAll: () => [] },
    allProducts: [{ id: 'm1', nombre: 'Mani', codigo: '000101', precio: 2860, tipoVenta: 'peso' }],
    listasData: [],
    esc: s => String(s == null ? '' : s),
    showAdminToast: () => {}, logAction: () => {},
  };
  ctx.window = ctx;
  ctx.open = () => { const w = { document: { write() {}, close() {} }, focus() {}, print() {} }; ventanas.push(w); return w; };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { ctx, campos, ventanas };
}
const guardado = ls => { try { return JSON.parse(ls.datos.brotesEtqUltimo || 'null'); } catch (e) { return 'roto'; } };

console.log('\n-- la primera vez, como siempre --');
const ls = almacen();
{
  const w = cargar(ls);
  w.ctx.openEtiquetasModal();
  t('sin nada guardado: Hoja A4 y "Rollo continuo" tildado', w.campos.etqFormato.value === 'a4-3x8' && w.campos.etqContinuo.checked === true);
  t('  y la opción del rollo escondida (en A4 no aplica)', w.campos.etqRollo.style.display === 'none');
  t('abrir y cerrar sin imprimir no guarda nada', guardado(ls) === null);

  /* Elige el rollo térmico de 50 x 25, lo destilda (etiquetas ya cortadas), 3 mm, e imprime. */
  w.campos.etqFormato.value = 'ter-50x25';
  w.ctx.etqFormatoCambio();
  t('elegido el rollo térmico, aparece la opción del rollo', w.campos.etqRollo.style.display === '');
  w.campos.etqContinuo.checked = false;
  w.campos.etqSeparacion.value = '3';
  w.ctx.etqToggle('m1');
  w.ctx.etiquetasImprimir();
  const g = guardado(ls);
  t('al imprimir se guarda el formato, el rollo y la separación',
    w.ventanas.length === 1 && g && g.formato === 'ter-50x25' && g.continuo === false && g.campos.etqSeparacion === '3', JSON.stringify(g));
}

console.log('\n-- al otro día (otra carga de la página) --');
{
  const w = cargar(ls);
  w.ctx.openEtiquetasModal();
  t('vuelve con el rollo de 50 x 25 elegido', w.campos.etqFormato.value === 'ter-50x25', w.campos.etqFormato.value);
  t('  con "Rollo continuo" destildado, como se dejó', w.campos.etqContinuo.checked === false);
  t('  con la separación de 3 mm', w.campos.etqSeparacion.value === '3');
  t('  y con la opción del rollo a la vista', w.campos.etqRollo.style.display === '');
  const f = w.ctx.etqFormatoActual();
  t('lo que se imprime es de 50 x 25, una etiqueta por página', f.id === 'ter-50x25' && f.hoja === 'termica' && f.continuo === false);

  /* Si en la misma carga se cambia sin imprimir, reabrir no lo pisa con lo guardado. */
  w.campos.etqFormato.value = 'a4-2x7';
  w.ctx.etqFormatoCambio();
  w.ctx.closeEtiquetasModal();
  w.ctx.openEtiquetasModal();
  t('reabrir en la misma carga no vuelve atrás lo que se cambió', w.campos.etqFormato.value === 'a4-2x7', w.campos.etqFormato.value);
}

console.log('\n-- lo guardado, si viene mal, no rompe nada --');
{
  const l2 = almacen();
  l2.datos.brotesEtqUltimo = '{esto no es json';
  const w = cargar(l2);
  w.ctx.openEtiquetasModal();
  t('guardado roto: arranca como siempre', w.campos.etqFormato.value === 'a4-3x8' && w.campos.etqContinuo.checked === true);
}
{
  const l3 = almacen();
  l3.datos.brotesEtqUltimo = JSON.stringify({ formato: 'ter-99x99', continuo: false, campos: { etqSeparacion: 'abc', etqCustomAncho: '' } });
  const w = cargar(l3);
  w.ctx.openEtiquetasModal();
  t('un formato que ya no existe: queda la Hoja A4', w.campos.etqFormato.value === 'a4-3x8');
  t('  y un número que no es número no se pone', w.campos.etqSeparacion.value === '2' && w.campos.etqCustomAncho.value === '70');
}
{
  const l4 = almacen({ rompe: true });
  const w = cargar(l4);
  let bien = true;
  try {
    w.ctx.openEtiquetasModal();
    w.ctx.etqToggle('m1');
    w.ctx.etiquetasImprimir();
  } catch (e) { bien = false; }
  t('sin localStorage (navegador que lo bloquea) abre e imprime igual', bien && w.ventanas.length === 1 && w.campos.etqFormato.value === 'a4-3x8');
}

console.log('\n-- la ayuda, en palabras simples --');
{
  const i = html.indexOf('id="etqRollo"');
  const trozo = html.slice(i, html.indexOf('id="etqSeparacion"', i));
  t('no dice "troquelado"', trozo.indexOf('troquelado') < 0);
  t('  dice "ya cortadas" y que se recuerda', trozo.indexOf('ya cortadas') > 0 && trozo.indexOf('Se recuerda para la pr&oacute;xima vez') > 0);
}

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
