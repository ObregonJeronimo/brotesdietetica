/**
 * VARIANTES (etapa 1): UN PRODUCTO, VARIAS PRESENTACIONES.
 *
 * Pedido del comercio (24/09/2026): un producto que viene en presentaciones -maní x 80 g
 * y x 160 g, alfajor x1 y x12- o en bultos de granel -yerba 1 kg y 3 kg- se ve como
 * UNO SOLO: una fila al vender, con un selector; una tarjeta en la tienda, con un botón
 * por variante y su precio. Si a una presentación le falta stock y otra la cubre, se
 * ofrece (160 g sin stock -> dos de 80 g).
 *
 * Cada variante sigue siendo un producto con su código, su stock y su costo, enganchado
 * al principal con gramajePadreId (el mismo enlace de los "gramajes" de antes).
 *
 * LO QUE ESTA PRUEBA CUIDA
 *  1. Que se lea bien cuánto trae cada una (80 g, 1,5 kg, 500 ml, x12) y el nombre base.
 *  2. Que la venta junte las variantes en una fila y el selector agregue la elegida.
 *  3. Que la sugerencia de otra presentación cuente lo que ya está en la venta, no mezcle
 *     gramos con unidades, y que el que cobra pueda decir que no.
 *  4. Que crear una variante la enganche al principal, y que borrar el principal no
 *     deje a las otras colgadas de la nada.
 *  5. Los ganchos de admin.html y la tienda (app.js): una tarjeta, botones con precio,
 *     apagados sin stock, y buscar una variante trae a su principal.
 *
 * Corre admin-variantes.js de verdad, con un document de mentira.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const SRC = leer('admin-variantes.js');
const html = leer('admin.html');
const app = leer('app.js');

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

/* ------------------------------------------------------------ productos de mentira */
const P = (id, extra) => Object.assign({ id, nombre: id, precio: 1000, precioMayorista: 900, stock: 5, tipoVenta: 'unidad' }, extra || {});
function catalogo() {
  return [
    P('mani80', { nombre: 'Maní x 80 g', gramaje: '80 g', precio: 1200, precioMayorista: 1000, stock: 10, descripcion: 'Maní tostado', porcentaje: 40, porcentajeMayorista: 20, categoria: 'Frutos secos', lista: 'L1' }),
    P('mani160', { nombre: 'Maní x 160 g', gramaje: '160 g', precio: 2300, precioMayorista: 2000, stock: 0, gramajePadreId: 'mani80', costo: 1500, porcentaje: 50, porcentajeMayorista: 30 }),
    P('mani320', { nombre: 'Maní x 320 g', gramaje: '320 g', precio: 4400, precioMayorista: 3800, stock: 1, gramajePadreId: 'mani80' }),
    P('mani500', { nombre: 'Maní x 500 g', gramaje: '500 g', stock: 9, oculto: true, gramajePadreId: 'mani80' }),
    P('mani1k', { nombre: 'Maní x 1 kg', gramaje: '1 kg', stock: 9, depurado: true, gramajePadreId: 'mani80' }),
    P('yerba1', { nombre: 'Yerba Mate 1 kg', gramaje: '1 kg', tipoVenta: 'peso', precio: 9000, precioMayorista: 8500, stock: 20000 }),
    P('yerba3', { nombre: 'Yerba Mate 3 kg', gramaje: '3 kg', tipoVenta: 'peso', precio: 8000, precioMayorista: 7600, stock: 9000, gramajePadreId: 'yerba1' }),
    P('alf1', { nombre: 'Alfajor x1', gramaje: 'x1', precio: 1000, stock: 30 }),
    P('alf12', { nombre: 'Alfajor x12', gramaje: 'x12', precio: 11000, stock: 0, gramajePadreId: 'alf1' }),
    P('ac500', { nombre: 'Aceite de coco 500 ml', gramaje: '500 ml', stock: 0 }),
    P('ac250', { nombre: 'Aceite de coco 250 ml', gramaje: '250 ml', stock: 4, gramajePadreId: 'ac500' }),
    P('chia', { nombre: 'Chía x 250 g', stock: 3 }),
  ];
}

/* ------------------------------------------------ un panel de mentira, por prueba */
function armar(opts) {
  const o = opts || {};
  const porId = {};
  const campo = id => (porId[id] = porId[id] || { id, value: '', innerHTML: '', textContent: '', style: {}, focus() { this.enfocado = true; },
    /* Los eventos andan: la primera fila de la tabla y los campos de arriba se escuchan. */
    escuchas: {}, addEventListener(tp, fn) { (this.escuchas[tp] = this.escuchas[tp] || []).push(fn); },
    dispatchEvent(e) { (this.escuchas[e && e.type] || []).forEach(fn => fn(e)); } });
  ['pVariantes', 'pNombre', 'pDescripcion', 'pPorcentaje', 'pPorcentajeMay', 'pCategoria', 'pSubcategoria', 'pLista', 'pGramaje', 'modalTitle',
    'pCosto', 'pStock', 'pCajaCerrada', 'pDescuento', 'pVariantesTitulo', 'pGramajeWrap', 'pStockWrap', 'pCostoSec', 'pMayoristaSec'].forEach(campo);
  const cuerpoPag = [];
  const escuchas = [];
  const document = {
    getElementById: id => porId[id] || cuerpoPag.find(e => e.id === id) || null,
    createElement: () => {
      const el = { id: '', className: '', innerHTML: '', style: {}, handlers: {} };
      el.addEventListener = (tipo, fn) => { el.handlers[tipo] = fn; };
      el.remove = () => { const i = cuerpoPag.indexOf(el); if (i >= 0) cuerpoPag.splice(i, 1); };
      el.querySelectorAll = sel => {
        if (sel !== '.var-op') return [];
        el._ops = el._ops || [...el.innerHTML.matchAll(/class="var-op([^"]*)" data-id="([^"]+)"/g)].map(m => ({
          clase: m[1], id: m[2], handlers: {},
          addEventListener(tipo, fn) { this.handlers[tipo] = fn; }, getAttribute() { return this.id; }, focus() {} }));
        return el._ops;
      };
      el.querySelector = sel => {
        if (sel === '#varVolver') return (el._volver = el._volver || { handlers: {}, addEventListener(tp, f) { this.handlers[tp] = f; } });
        if (sel.indexOf('.var-op') === 0) return el.querySelectorAll('.var-op')[0] || null;
        return null;
      };
      return el;
    },
    body: { appendChild: el => cuerpoPag.push(el) },
    addEventListener: (tipo, fn) => escuchas.push(fn),
    removeEventListener: (tipo, fn) => { const i = escuchas.indexOf(fn); if (i >= 0) escuchas.splice(i, 1); },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const avisos = [], agregados = [], elegidos = [], preguntas = [], updates = [], llamadas = [], escrituras = [], historial = [];
  let nuevos = 0;
  const ctx = {
    console, Math, Number, String, Object, Array, Set, Map, Promise, Infinity,
    setTimeout: () => 0,
    window: {},
    document,
    allProducts: o.productos || catalogo(),
    _dlgAbiertos: 0,
    esc: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    _attrHtml: s => String(s).replace(/"/g, '&quot;'),
    fmtPeso: gr => (gr / 1000) + ' kg',
    showAdminToast: (m, tipo) => avisos.push((tipo || 'info') + ': ' + m),
    pedirOpcion: async (msg, op) => { preguntas.push({ msg, op }); return o.respuesta === undefined ? null : o.respuesta; },
    _origAddVentaItem: id => agregados.push('min:' + id),
    _origAddVentaMayItem: id => agregados.push('may:' + id),
    _agregarItemVenta: (id, c) => elegidos.push(id + '@' + c),
    firebase: { firestore: { FieldValue: { delete: () => '__BORRAR__', serverTimestamp: () => '__AHORA__' } } },
    db: {
      collection: () => ({
        doc: id => ({ id, update: async d => { if (o.fallaEscribir) throw new Error('sin red'); escrituras.push(['update', id, d]); } }),
        add: async d => { if (o.fallaEscribir) throw new Error('sin red'); escrituras.push(['add', d]); return { id: 'nuevo' + (++nuevos) }; },
      }),
      batch: () => ({
        update: (ref, data) => updates.push([ref.id, data]),
        commit: async () => { if (o.falla) throw new Error('sin red'); },
      }),
    },
    closeModal: () => llamadas.push('closeModal'),
    openModal: function (id) { llamadas.push('openModal:' + (id || '')); },
    updateCatSelects: () => {}, updateSubcatSelect: () => {}, calcPrecioModal: () => {},
    updateListaSelect: v => { porId.pLista.value = v; },
    setTipoVenta: tv => llamadas.push('tipo:' + tv),
    _tipoVentaProd: o.tipo || 'unidad',
    editingId: o.editingId || null,
    Event: function (tipo) { this.type = tipo; },
    sugerirCodigoProducto: res => '0009' + String((res || []).length).padStart(2, '0'),
    refrescarProductoLocal: async () => true,
    logAction: (a, b, c) => historial.push(a + ' | ' + b + ' | ' + c),
    toggleOculto: async id => { const p = ctx.allProducts.find(x => x.id === id); p.oculto = !(p.oculto === true); llamadas.push('ocultar:' + id); },
    avisar: async (m, op) => { avisos.push('aviso: ' + m + ' [' + (op && op.titulo) + ']'); return true; },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { ctx, porId, cuerpoPag, escuchas, avisos, agregados, elegidos, preguntas, updates, llamadas, escrituras, historial };
}
const buscar = (lista, id) => lista.find(p => p.id === id);

(async () => {
  /* ======================================================= CUÁNTO TRAE CADA UNA */
  console.log('\n-- cuánto trae cada una --');
  {
    const { ctx } = armar();
    const c = (gramaje, nombre) => JSON.stringify(ctx.contenidoDeVariante({ gramaje, nombre }));
    t('80 g', c('80 g') === '{"valor":80,"unidad":"g"}');
    t('"80gr" pegado', c('80gr') === '{"valor":80,"unidad":"g"}');
    t('1 kg son 1000 g', c('1 kg') === '{"valor":1000,"unidad":"g"}');
    t('1,5 kg con coma son 1500 g', c('1,5 kg') === '{"valor":1500,"unidad":"g"}');
    t('500 ml', c('500 ml') === '{"valor":500,"unidad":"ml"}');
    t('1 l son 1000 ml', c('1 l') === '{"valor":1000,"unidad":"ml"}');
    t('500 cc son ml', c('500 cc') === '{"valor":500,"unidad":"ml"}');
    t('x12 es un pack de 12', c('x12') === '{"valor":12,"unidad":"u"}');
    t('6 unidades', c('6 unidades') === '{"valor":6,"unidad":"u"}');
    t('sin gramaje, lo lee del nombre', c('', 'Maní x 160 g') === '{"valor":160,"unidad":"g"}');
    t('"x 80 g" es gramos, no un pack de 80', c('', 'Maní x 80 g') === '{"valor":80,"unidad":"g"}');
    t('sin nada que leer, no inventa', ctx.contenidoDeVariante({ nombre: 'Maní tostado' }) === null);
    t('nombre base de "Maní x 80 g"', ctx.baseDeNombre('Maní x 80 g') === 'Maní');
    t('nombre base de "Yerba Mate 1 kg"', ctx.baseDeNombre('Yerba Mate 1 kg') === 'Yerba Mate');
    t('nombre base de "Alfajor x12"', ctx.baseDeNombre('Alfajor x12') === 'Alfajor');
    t('nombre base de "Aceite de coco 500 ml"', ctx.baseDeNombre('Aceite de coco 500 ml') === 'Aceite de coco');
    t('un nombre sin tamaño queda igual', ctx.baseDeNombre('Maní tostado') === 'Maní tostado');
    t('etiqueta: la presentación cargada', ctx.etiquetaVariante({ gramaje: '160 g' }) === '160 g');
    t('etiqueta: sin presentación, el tamaño del nombre', ctx.etiquetaVariante({ nombre: 'Yerba 1,5 kg' }) === '1,5 kg');
  }

  /* ================================================================ EL GRUPO */
  console.log('\n-- el grupo --');
  {
    const { ctx } = armar();
    const prods = ctx.allProducts;
    const ids = l => l.map(p => p.id).join(',');
    t('principal y variantes, de menor a mayor, sin ocultos ni depurados',
      ids(ctx.variantesDeGrupo(buscar(prods, 'mani80'), prods)) === 'mani80,mani160,mani320');
    t('  con ocultos si se piden (el formulario los muestra)',
      ids(ctx.variantesDeGrupo(buscar(prods, 'mani80'), prods, { conOcultos: true })) === 'mani80,mani160,mani320,mani500');
    t('el principal de una variante', ctx.principalDeVariante(buscar(prods, 'mani160'), prods).id === 'mani80');
    t('  y el de un principal es él mismo', ctx.principalDeVariante(buscar(prods, 'mani80'), prods).id === 'mani80');
    t('tiene variantes: el principal y la variante', ctx.tieneVariantes(buscar(prods, 'mani80'), prods) && ctx.tieneVariantes(buscar(prods, 'mani160'), prods));
    t('  un producto suelto no', !ctx.tieneVariantes(buscar(prods, 'chia'), prods));
    const mezcla = [P('c1k', { nombre: 'Café 1 kg', tipoVenta: 'peso' }), P('c250', { nombre: 'Café 250 g', gramajePadreId: 'c1k' }),
      P('c500', { nombre: 'Café 500 g', gramajePadreId: 'c1k' })];
    t('las que se venden por unidad van antes que las de granel',
      ids(ctx.variantesDeGrupo(mezcla[0], mezcla)) === 'c250,c500,c1k');
  }

  /* ================================================================ AL VENDER */
  console.log('\n-- al vender: una fila por producto --');
  {
    const { ctx } = armar();
    const prods = ctx.allProducts;
    const b = id => buscar(prods, id);
    const r1 = ctx.agruparVariantesVenta([b('mani80'), b('mani160'), b('chia')], prods);
    t('dos variantes del mismo producto van en una fila', r1.length === 2 && !!r1[0].__grupo && r1[0].__grupo.id === 'mani80' && r1[1].id === 'chia');
    t('  la fila trae todas las que se venden, no solo las que coincidieron',
      r1[0].variantes.map(v => v.id).join(',') === 'mani80,mani160,mani320');
    const r2 = ctx.agruparVariantesVenta([b('chia'), b('mani160'), b('yerba1'), b('mani80')], prods);
    t('  en el lugar de la primera que coincidió', r2.length === 3 && r2[0].id === 'chia' && r2[1].__grupo && r2[2].id === 'yerba1');
    t('una sola que coincide -buscando "160"- se muestra como siempre', ctx.agruparVariantesVenta([b('mani160'), b('chia')], prods)[0].id === 'mani160');
    const fila = ctx._filaGrupoVenta(r1[0], 'min');
    t('la fila abre el selector del principal', fila.indexOf("abrirVariantesVenta('mani80','min')") > 0);
    t('  con el nombre base y "desde" el más barato', fila.indexOf('>Maní<') > 0 && fila.indexOf('desde') > 0 && fila.indexOf('$1.200') > 0);
    t('  y cuántas variantes hay', fila.indexOf('3 variantes') > 0);
    const filaMay = ctx._filaGrupoVenta(r1[0], 'may');
    t('en la mayorista, "desde" con el precio mayorista', filaMay.indexOf("'may'") > 0 && filaMay.indexOf('$1.000') > 0);
    const yerba = ctx.agruparVariantesVenta([b('yerba1'), b('yerba3')], prods)[0];
    t('las de granel dicen el precio por kilo', ctx._filaGrupoVenta(yerba, 'min').indexOf('$8.000<span') > 0 && ctx._filaGrupoVenta(yerba, 'min').indexOf('/kg') > 0);
    const mezcla = [P('c1k', { nombre: 'Café 1 kg', tipoVenta: 'peso', precio: 20000 }), P('c250', { nombre: 'Café 250 g', precio: 6000, gramajePadreId: 'c1k' })];
    const gm = ctx.agruparVariantesVenta(mezcla, mezcla)[0];
    t('con unas por kilo y otras por unidad no inventa un "desde"', ctx._filaGrupoVenta(gm, 'min').indexOf('desde') < 0);
  }

  console.log('\n-- el selector --');
  {
    const w = armar();
    w.ctx.abrirVariantesVenta('mani80', 'min');
    const ov = w.cuerpoPag[0];
    t('se abre encima de la venta, como los otros diálogos', !!ov && ov.className === 'dlg-overlay' && ov.id === 'variantesVenta');
    t('  cuenta como diálogo abierto', w.ctx._dlgAbiertos === 1);
    t('  una opción por variante que se vende', (ov.innerHTML.match(/class="var-op/g) || []).length === 3);
    t('  con su precio y su stock', ov.innerHTML.indexOf('$2.300') > 0 && ov.innerHTML.indexOf('Stock 10') > 0);
    t('  la que no tiene stock se ve apagada, pero se puede elegir',
      /class="var-op sin-stock" data-id="mani160"/.test(ov.innerHTML) && ov.innerHTML.indexOf('SIN STOCK') > 0);
    t('  escucha Escape', w.escuchas.length === 1);
    ov.querySelectorAll('.var-op').find(b => b.id === 'mani320').handlers.click();
    t('elegir una la agrega a la venta, con el precio de esa venta', w.elegidos.join() === 'mani320@min');
    t('  y cierra el selector', w.cuerpoPag.length === 0 && w.ctx._dlgAbiertos === 0 && w.escuchas.length === 0);

    w.ctx.abrirVariantesVenta('yerba1', 'may');
    const ov2 = w.cuerpoPag[0];
    t('las de granel dicen "el kilo" y el stock en kilos', ov2.innerHTML.indexOf('el kilo') > 0 && ov2.innerHTML.indexOf('9 kg') > 0);
    let parado = false;
    w.escuchas[0]({ key: 'Escape', preventDefault() {}, stopPropagation() { parado = true; } });
    t('Escape lo cierra sin llegar a la venta', w.cuerpoPag.length === 0 && parado && w.elegidos.length === 1);
    w.ctx.abrirVariantesVenta('mani80', 'min');
    w.cuerpoPag[0].querySelector('#varVolver').handlers.click();
    t('"Volver" lo cierra sin agregar nada', w.cuerpoPag.length === 0 && w.elegidos.length === 1);
  }

  /* ============================================== OTRA PRESENTACIÓN SIN STOCK */
  console.log('\n-- otra presentación si no hay stock --');
  {
    const { ctx } = armar();
    const prods = ctx.allProducts;
    const b = id => buscar(prods, id);
    const s = (id, enVenta) => ctx.sugerenciaPresentacion(b(id), enVenta || {}, prods);
    const s1 = s('mani160');
    t('160 g sin stock y 80 g con 10: dos de 80 g', !!s1 && s1.variante.id === 'mani80' && s1.cantidad === 2);
    t('  contando lo que ya está en la venta: con 9 de 80 g ya no alcanza', s('mani160', { mani80: 9 }) === null);
    const s2 = s('mani320', { mani320: 1 });
    t('320 g agotado en la venta: cuatro de 80 g (la de 160 g tampoco tiene)', !!s2 && s2.variante.id === 'mani80' && s2.cantidad === 4);
    b('mani160').stock = 2;
    const s3 = s('mani320', { mani320: 1 });
    t('  si la de 160 g tiene, la prefiere: menos paquetes', !!s3 && s3.variante.id === 'mani160' && s3.cantidad === 2);
    b('mani160').stock = 0;
    t('con stock no sugiere nada', s('mani80') === null);
    t('los de granel no: se venden por peso', s('yerba3') === null);
    t('un producto sin variantes, tampoco', s('chia') === null);
    t('en ml también: 500 ml con dos de 250 ml', (s('ac500') || {}).cantidad === 2);
    t('pack de 12 sin stock: doce sueltos (a su precio de siempre)', (s('alf12') || {}).cantidad === 12);
    const raros = [P('m1000', { nombre: 'Maní x 1000 g', stock: 0 }), P('m300', { nombre: 'Maní x 300 g', stock: 10, gramajePadreId: 'm1000' }),
      P('m500', { nombre: 'Maní x 500 g', stock: 10, oculto: true, gramajePadreId: 'm1000' })];
    t('si no entra justa (1000 g con de 300 g), no la sugiere', ctx.sugerenciaPresentacion(raros[0], {}, raros.slice(0, 2)) === null);
    t('  y una oculta (la de 500 g) no se ofrece', ctx.sugerenciaPresentacion(raros[0], {}, raros) === null);
    const mezcla = [P('x1', { nombre: 'Leche 1 l', stock: 0 }), P('x2', { nombre: 'Leche 500 g', stock: 10, gramajePadreId: 'x1' })];
    t('no mezcla litros con gramos', ctx.sugerenciaPresentacion(mezcla[0], {}, mezcla) === null);
  }

  console.log('\n-- lo que ve el que cobra --');
  {
    const w = armar({ respuesta: 'otra' });
    const r = await w.ctx.sugerirPresentacion(buscar(w.ctx.allProducts, 'mani160'), [], 'min');
    t('si acepta, se agregan las de la otra presentación', r === 'hecho' && w.agregados.join() === 'min:mani80,min:mani80');
    const q = w.preguntas[0];
    t('  la pregunta dice cuántas, de cuál y cuánto sale', !!q && q.msg.indexOf('¿Agregar 2 de 80 g') >= 0 && q.msg.indexOf('$2.400') > 0);
    t('  sin stock se puede vender avisando (29/09): la otra, o la pedida igual, diciendo que queda en negativo',
      q.op.opciones.map(x => x.valor).join() === 'otra,igual' && q.op.opciones[0].principal === true &&
      q.op.opciones[1].texto === 'Agregar la de 160 g igual' &&
      q.msg.indexOf('No hay stock de Maní x 160 g. Si agregás la de 160 g igual, su stock va a quedar en negativo.') === 0, q.msg);
  }
  {
    const w = armar({ respuesta: 'igual' });
    const r = await w.ctx.sugerirPresentacion(buscar(w.ctx.allProducts, 'mani160'), [], 'min');
    t('"Agregar la de 160 g igual" sigue con la pedida (la agrega quien llama)', r === 'seguir' && w.agregados.length === 0);
  }
  {
    /* Con el freno prendido (26/09, FRENAR_VENTA_SIN_STOCK): no se ofrece la pedida igual. */
    const w = armar({ respuesta: 'otra' });
    vm.runInContext('FRENAR_VENTA_SIN_STOCK = true;', w.ctx);
    await w.ctx.sugerirPresentacion(buscar(w.ctx.allProducts, 'mani160'), [], 'min');
    const q = w.preguntas[0];
    t('con el freno: la otra, o cancelar; no "agregar la pedida igual"',
      q.op.opciones.map(x => x.valor).join() === 'otra,no' && q.op.opciones[0].principal === true &&
      q.op.opciones[1].texto === 'Cancelar' && q.msg.indexOf('No hay stock de Maní x 160 g. Sin stock no se puede vender.') === 0, q.msg);
    const w2 = armar({ respuesta: 'no' });
    vm.runInContext('FRENAR_VENTA_SIN_STOCK = true;', w2.ctx);
    const r = await w2.ctx.sugerirPresentacion(buscar(w2.ctx.allProducts, 'mani160'), [], 'min');
    t('  y "Cancelar" no agrega nada', r === 'cancelar' && w2.agregados.length === 0);
  }
  {
    const w = armar({ respuesta: 'igual' });
    w.ctx.DESCONTAR_STOCK = false;
    const r = await w.ctx.sugerirPresentacion(buscar(w.ctx.allProducts, 'mani160'), [], 'min');
    const q = w.preguntas[0];
    t('si el negocio no descuenta stock, como antes: "Agregar la de 160 g igual" agrega la pedida',
      r === 'seguir' && w.agregados.length === 0 && q.op.opciones.map(x => x.valor).join() === 'otra,igual' && q.msg.indexOf('Sin stock no se puede vender') < 0);
  }
  {
    const w = armar({ respuesta: null });
    const r = await w.ctx.sugerirPresentacion(buscar(w.ctx.allProducts, 'mani160'), [], 'min');
    t('cerrarlo con Escape no agrega nada', r === 'cancelar' && w.agregados.length === 0);
  }
  {
    const w = armar({ respuesta: 'otra' });
    const r = await w.ctx.sugerirPresentacion(buscar(w.ctx.allProducts, 'mani80'), [], 'min');
    t('sin nada que sugerir no pregunta', r === 'seguir' && w.preguntas.length === 0);
    const lista = [{ id: 'mani80', cantidad: 9 }];
    const r2 = await w.ctx.sugerirPresentacion(buscar(w.ctx.allProducts, 'mani160'), lista, 'min');
    t('  ni si lo que queda ya está en la venta', r2 === 'seguir' && w.preguntas.length === 0);
  }
  {
    const w = armar({ respuesta: 'otra' });
    await w.ctx.sugerirPresentacion(buscar(w.ctx.allProducts, 'mani160'), [], 'may');
    t('en la mayorista agrega con la mayorista, y dice su precio',
      w.agregados.join() === 'may:mani80,may:mani80' && w.preguntas[0].msg.indexOf('$2.000') > 0);
  }

  /* ============================================================ EL FORMULARIO */
  console.log('\n-- el formulario: la tabla de tamaños --');
  {
    const w = armar();
    w.ctx.window._varianteDeNueva = 'viejo';
    w.ctx.openModal('mani160');
    t('abrir el formulario olvida la variante que se estaba por crear', w.ctx.window._varianteDeNueva === null);
    t('  y abre el de verdad', w.llamadas.indexOf('openModal:mani160') >= 0);
    const h = w.porId.pVariantes.innerHTML;
    t('en una variante: cuál es y de quién, con el botón al principal',
      h.indexOf('Es la presentación de <b>160 g</b> de <b>Maní</b>') > 0 && h.indexOf("openModal('mani80')") > 0);
    t('  sin la tabla: las otras se cargan desde el principal', h.indexOf('class="vfe"') < 0 && (w.ctx.window._varFilas || []).length === 0);
  }
  {
    const w = armar({ editingId: 'mani80' });
    w.ctx.openModal('mani80');
    const f = w.ctx.window._varFilas;
    t('en el principal: una fila por tamaño que ya tiene, de menor a mayor', f.map(x => x.id).join() === 'mani160,mani320,mani500');
    t('  con lo que tiene cargado (costo, ganancia, mayorista, stock)', f[0].tam === '160 g' && f[0].costoIn === '1500' && f[0].pct === 50 &&
      f[0].pctMay === 30 && f[0].stock === 0 && Object.keys(f[0].tocado).length === 0);
    t('  la oculta va marcada; la depurada no está', f[2].oculto === true && !f.some(x => x.id === 'mani1k'));
    const h = w.porId.pVariantes.innerHTML;
    t('  se dibujan como filas editables, con el botón para agregar', (h.match(/class="vfe"/g) || []).length === 3 && h.indexOf('varFilaAgregar()') > 0 &&
      h.indexOf('Agregar presentación') > 0 && h.indexOf('Oculta: no aparece') > 0);
    t('  el tamaño de este producto es el mismo campo que Gramaje', h.indexOf('id="pVarTam"') > 0 && h.indexOf('varTamPrincipal(this)') > 0);
    t('  el tamaño se escribe con número y la unidad al lado (una presentación elige g, kg, ml, l o unidades)',
      h.indexOf('limpiarNumeroTam(this);varFilaTam(0,this)') > 0 && (h.match(/class="vfe-unisel"/g) || []).length === 4 && h.indexOf('>un.</option>') > 0 && h.indexOf('>unid.</option>') < 0);
    t('  la primera fila es este producto, antes que las otras', h.indexOf('class="vfe vfe-ppal"') > 0 &&
      h.indexOf('class="vfe vfe-ppal"') < h.indexOf('class="vfe" data-i="0"'));
    t('  el stock dice (unitario), en la de este producto y en las otras tres', (h.match(/Stock \(unitario\)/g) || []).length === 4);
    t('  y los % no pasan de 999 (limpiarPorcentaje)', (h.match(/limpiarPorcentaje\(this\)/g) || []).length === 8);
    t('  una que ya existe se abre, no se quita desde acá', h.indexOf("openModal('mani160')") > 0 && h.indexOf('varFilaQuitar(0)') < 0);
    t('  y se puede cargar una con su propio formulario', h.indexOf("nuevaVariante('mani80')") > 0);
  }
  {
    const w = armar();
    w.ctx.openModal();
    t('un producto nuevo también tiene la tabla (antes había que guardarlo primero)',
      w.porId.pVariantes.innerHTML.indexOf('varFilaAgregar()') > 0 && w.ctx.window._varFilas.length === 0);
    w.porId.pPorcentaje.value = '60'; w.porId.pPorcentajeMay.value = '25';
    w.ctx.varFilaAgregar();
    const f = w.ctx.window._varFilas[0];
    t('agregar una fila trae la ganancia y el mayorista de arriba', !!f && f.id === null && f.pct === 60 && f.pctMay === 25 && f.stock === 0);
    w.ctx.varFilaCambio(0, 'tam', '160 g');
    w.ctx.varFilaCambio(0, 'costoIn', '1300');
    t('escribir en la fila la guarda y la marca como tocada', f.tam === '160 g' && f.costoIn === '1300' && f.tocado.tam && f.tocado.costoIn);
    const r = w.ctx._calcFilaVar(f, false);
    t('  por unidad: costo 1.300 con 60% es $2.080; mayorista con 25%, $1.650', r.costo === 1300 && r.precio === 2080 && r.may === 1650);
    w.ctx.varFilaQuitar(0);
    t('una fila nueva se puede quitar', w.ctx.window._varFilas.length === 0);
  }
  {
    const w = armar({ tipo: 'peso' });
    w.ctx.openModal();
    t('por peso, la sección habla de bolsas; sin otras, es la explicación y el botón (sin tabla)',
      w.porId.pVariantes.innerHTML.indexOf('Agregar otra bolsa') > 0 && w.porId.pVariantes.innerHTML.indexOf('vfe-ppal') < 0 &&
      w.porId.pVariantes.innerHTML.indexOf('Este producto es la bolsa de') < 0);
    const r = w.ctx._calcFilaVar({ tam: '3 kg', costoIn: '13500', pct: 60, pctMay: 30 }, true);
    t('  se carga lo que costó la bolsa y el kilo sale solo: $13.500 la de 3 kg son $4.500 el kilo', r.costo === 4500 && r.precio === 7200 && r.may === 5850);
    t('  sin tamaño en kg o g no calcula, y lo dice', w.ctx._calcFilaVar({ tam: 'x12', costoIn: '13500' }, true).costo === null &&
      w.ctx._resFilaVar(w.ctx._calcFilaVar({ tam: '', costoIn: '1' }, true), true).indexOf('Poné de cuánto es la bolsa.') > 0);
    w.ctx.varFilaAgregar();
    const hp = w.porId.pVariantes.innerHTML;
    t('  la bolsa va siempre en kg: el número, y "kg" fijo al lado', hp.indexOf('<span class="vfe-unidad">kg</span>') > 0 && hp.indexOf('vfe-unisel') < 0);
    const prods = catalogo().concat([P('g1', { nombre: 'Yerba 1 kg', gramaje: '1 kg', tipoVenta: 'peso', costo: 5000, porcentaje: 60 }),
      P('g3', { nombre: 'Yerba 3 kg', gramaje: '3 kg', tipoVenta: 'peso', costo: 4500, porcentaje: 60, gramajePadreId: 'g1' }),
      P('g500', { nombre: 'Yerba x 500 g', gramaje: '500 g', precio: 4160, gramajePadreId: 'g1' })]);
    const w2 = armar({ tipo: 'peso', productos: prods, editingId: 'g1' });
    w2.ctx.openModal('g1');
    t('  una bolsa que ya existe muestra lo que sale la bolsa ($4.500 el kilo × 3 kg)', w2.ctx.window._varFilas.length === 1 && w2.ctx.window._varFilas[0].costoIn === '13500');
    t('  y la de otra forma de venta (el paquete de 500 g) se nombra aparte, con su ficha', w2.porId.pVariantes.innerHTML.indexOf('Por unidad:') > 0 &&
      w2.porId.pVariantes.innerHTML.indexOf("openModal('g500')") > 0);
  }

  console.log('\n-- el formulario: el campo de tamaño --');
  {
    const w = armar();
    const P2 = (s, peso) => JSON.stringify(w.ctx._tamPartes(s, peso));
    t('lee la etiqueta guardada en número y unidad', P2('160 g', false) === '{"num":"160","uni":"g"}' && P2('500 ml', false) === '{"num":"500","uni":"ml"}' &&
      P2('x12', false) === '{"num":"12","uni":"u"}' && P2('1,5 kg', false) === '{"num":"1,5","uni":"kg"}');
    t('  en una bolsa, siempre en kilos: 500 g es 0,5', P2('500 g', true) === '{"num":"0,5","uni":"kg"}' && P2('3 kg', true) === '{"num":"3","uni":"kg"}');
    t('  un número solo toma la unidad de la tabla', P2('2', true) === '{"num":"2","uni":"kg"}' && P2('80', false) === '{"num":"80","uni":"g"}');
    t('  lo que no se entiende queda vacío', P2('1 wd', true) === '{"num":"","uni":"kg"}' && P2('', false) === '{"num":"","uni":"g"}');
    t('y la arma de vuelta: "2 kg", "160 g", "x12"; sin número, nada',
      w.ctx._tamTexto('2', 'kg') === '2 kg' && w.ctx._tamTexto('160', 'g') === '160 g' && w.ctx._tamTexto('12', 'u') === 'x12' &&
      w.ctx._tamTexto('', 'kg') === '' && w.ctx._tamTexto('0', 'kg') === '');
    const inp = v => { const o = { value: v }; w.ctx.limpiarNumeroTam(o); return o.value; };
    t('en el campo solo entran números: "1 wd" queda "1"', inp('1 wd') === '1' && inp('2wd') === '2' && inp('abc') === '');
    t('  con una coma para medio kilo, y el punto se vuelve coma', inp('0,5') === '0,5' && inp('0.5') === '0,5' && inp('1,2,3') === '1,23');
    t('  hasta 4 cifras y 3 decimales', inp('123456') === '1234' && inp('0,2555') === '0,255');
  }

  {
    const w = armar();
    t('el nombre de una variante: "Maní x 160 g" y "Alfajor x12" (no "Alfajor x x12")',
      w.ctx._nombreConTam('Maní', '160 g') === 'Maní x 160 g' && w.ctx._nombreConTam('Alfajor', 'x12') === 'Alfajor x12' &&
      w.ctx._nombreConTam('Yerba', '0,5 kg') === 'Yerba x 0,5 kg');
  }

  console.log('\n-- la primera fila de la tabla es este producto --');
  {
    /* Pedido del comercio (25/09): "Este producto es la bolsa de ___ kg" no se entendía, y
       la bolsa de 1 kg se cargaba como una fila más. */
    const w = armar({ tipo: 'peso' });
    w.ctx.openModal();
    w.porId.pCosto.value = '6000'; w.porId.pStock.value = '800';
    w.porId.pPorcentaje.value = '75'; w.porId.pPorcentajeMay.value = '65';
    w.ctx.varFilaAgregar();
    const h = w.porId.pVariantes.innerHTML;
    const iPpal = h.indexOf('class="vfe vfe-ppal"'), iOtra = h.indexOf('class="vfe" data-i="0"');
    t('al agregar una bolsa, la tabla muestra las dos: primero este producto, después la nueva', iPpal > 0 && iOtra > iPpal);
    t('  y pasa a ser el ÚNICO lugar: lo de arriba que es de un tamaño se esconde (gramaje, stock, costo y precio, mayorista)',
      ['pGramajeWrap', 'pStockWrap', 'pCostoSec', 'pMayoristaSec'].every(id => w.porId[id].style.display === 'none'));
    t('  el costo de arriba deja de ser obligatorio (escondido, el navegador no dejaría guardar): lo revisa la tabla',
      w.porId.pCosto.required === false);
    t('  el título y la ayuda lo dicen', w.porId.pVariantesTitulo.textContent === 'Costo y precio de cada bolsa' &&
      h.indexOf('Cada bolsa con lo que te costó, su ganancia y su stock.') > 0 && h.indexOf('lo mismo que cargaste arriba') < 0);
    t('  ya no está "Este producto es la bolsa de"', h.indexOf('Este producto es la bolsa de') < 0);
    t('  su tamaño es Gramaje (pVarTam), y los ejemplos dicen "ej." para que no parezcan cargados',
      h.indexOf('id="pVarTam"') > 0 && h.indexOf('varTamPrincipal(this)') > 0 && h.indexOf('placeholder="ej. 1"') > 0 && h.indexOf('placeholder="ej. 3"') > 0);
    t('  la de este producto no se quita: la × es solo de la nueva', (h.match(/varFilaQuitar\(/g) || []).length === 1);
    let v = w.ctx._valoresPpal(true);
    t('sin el tamaño de la bolsa, la fila lo pide y dice el costo por kilo que ya había', v.costoIn === '' &&
      w.ctx._resPpal(v, true).indexOf('Tenés $6.000 el kilo: poné de cuánto es esta bolsa.') > 0);
    w.ctx.varTamPrincipal('1 kg');
    v = w.ctx._valoresPpal(true);
    t('con el tamaño, la fila muestra lo de arriba: la bolsa de 1 kg a $6.000, 800 g, 75% y 65%', w.porId.pGramaje.value === '1 kg' &&
      v.costoIn === '6000' && v.stock === '800' && v.pct === '75' && v.pctMay === '65' && v.r.precio === 10500 && v.r.may === 9900);
    w.ctx.varTamPrincipal('3 kg');
    t('  de 3 kg con $6.000 el kilo, la bolsa sale $18.000', w.ctx._valoresPpal(true).costoIn === '18000');
    w.ctx.varPpalCambio('costoIn', { value: '16500' });
    t('escribir en la fila lo que costó la bolsa pone el costo por kilo arriba: $16.500 / 3 kg = $5.500', w.porId.pCosto.value === '5500');
    w.ctx.varPpalCambio('costoIn', { value: '1000' });
    t('  y se sigue viendo lo escrito aunque el kilo redondee ($1.000 / 3 = $333, volvería $999)',
      w.porId.pCosto.value === '333' && w.ctx._valoresPpal(true).costoIn === '1000');
    w.ctx.varTamPrincipal('5 kg');
    t('  cambiar el tamaño mantiene lo que costó la bolsa: $1.000 la de 5 kg son $200 el kilo', w.porId.pCosto.value === '200' &&
      w.ctx._valoresPpal(true).costoIn === '1000');
    w.porId.pCosto.value = '4000';
    w.porId.pCosto.dispatchEvent({ type: 'input' });
    t('escribir el costo por kilo arriba manda: la fila muestra $20.000 la bolsa de 5 kg', w.ctx._valoresPpal(true).costoIn === '20000' &&
      w.ctx.window._varPpalBolsa === null);
    w.ctx.varPpalCambio('stock', { value: '2500' });
    w.ctx.varPpalCambio('pct', { value: '60' });
    w.ctx.varPpalCambio('pctMay', { value: '30' });
    t('el stock y las ganancias de la fila van a los de arriba', w.porId.pStock.value === '2500' && w.porId.pPorcentaje.value === '60' &&
      w.porId.pPorcentajeMay.value === '30');
    w.ctx.varPpalCambio('dsc', { value: '10' });
    v = w.ctx._valoresPpal(true);
    t('el descuento de la fila es el de arriba, y la fila dice lo que paga el cliente', w.porId.pDescuento.value === '10' &&
      w.ctx._resPpal(v, true).indexOf('Con el 10% de descuento: $5.760 el kilo') > 0);
    w.ctx.varPpalCambio('costoIn', { value: '' });
    t('  y borrar el costo de la fila lo borra arriba', w.porId.pCosto.value === '' && w.ctx.window._varPpalBolsa === null);
    w.ctx.varFilaQuitar(0);
    t('quitando la otra bolsa vuelve el formulario de siempre, con el costo obligatorio',
      ['pGramajeWrap', 'pStockWrap', 'pCostoSec', 'pMayoristaSec'].every(id => w.porId[id].style.display === '') &&
      w.porId.pCosto.required === true && w.porId.pVariantesTitulo.textContent === 'Bolsas y precios por cantidad');
    const d = x => { const o = { value: x }; w.ctx._varLimpiarDsc(o); return o.value; };
    t('en la fila el descuento dice "% oferta" (entra en un renglón)', w.ctx._pctsFilaHtml({ pct: 1, pctMay: 1, dsc: 0 }, () => '').indexOf('<span>% oferta</span>') > 0);
    t('el descuento de una fila: solo números, hasta 100', d('150') === '100' && d('a5') === '5' && d('10%') === '10' && w.ctx._varDsc('250') === 100);
  }
  {
    const w = armar({ tipo: 'peso' });
    w.ctx.openModal();
    w.ctx.varFilaAgregar();
    w.ctx.varPpalCambio('costoIn', { value: '9000' });
    t('lo que costó la bolsa escrito antes del tamaño queda esperando', w.porId.pCosto.value === '' && w.ctx._valoresPpal(true).costoIn === '9000');
    w.ctx.varTamPrincipal('3 kg');
    t('  y al poner el tamaño pasa a costo por kilo: $9.000 / 3 kg = $3.000', w.porId.pCosto.value === '3000');
    w.ctx.openModal();
    t('abrir otro producto se olvida de esa bolsa', w.ctx.window._varPpalBolsa === null);
  }
  {
    const w = armar({ editingId: 'mani80' });
    w.ctx.openModal('mani80');
    w.porId.pCosto.value = '900';
    t('por unidad, el costo de la fila es el de arriba, por unidad', w.ctx._valoresPpal(false).costoIn === '900');
    w.ctx.varPpalCambio('costoIn', { value: '950' });
    t('  y escribirlo en la fila lo escribe arriba', w.porId.pCosto.value === '950');
    w.ctx.varPpalCambio('caja', { checked: true });
    t('  la caja cerrada de la fila es la de arriba', w.porId.pCajaCerrada.checked === true && w.ctx._valoresPpal(false).caja === true);
    const h = w.porId.pVariantes.innerHTML;
    t('  y tiene su casilla, como las otras presentaciones', (h.match(/Caja cerrada: en el mostrador y en la tienda/g) || []).length === 4);
    t('cada casilla de caja cerrada tiene su "?", afuera del label (tocarlo no la marca)', (h.match(/<\/label><span class="ayuda-tip" tabindex="0"/g) || []).length === 4);
    const ayudaCaja = vm.runInContext('_AYUDA_CAJA', w.ctx);
    t('  el cartelito dice cuándo marcarla, con el ejemplo de los alfajores', ayudaCaja.indexOf('Marcalo SOLO si vendés el producto en una caja cerrada') === 0 &&
      ayudaCaja.indexOf('caja cerrada de alfajores de una docena') > 0 && h.indexOf('data-tip="Marcalo SOLO si vendés') > 0);
    t('  y la casilla del formulario de un solo tamaño también, con el mismo texto', html.indexOf('</label><span class="ayuda-tip" id="pCajaAyuda" tabindex="0" role="img">') > 0 &&
      SRC.indexOf("a.setAttribute('data-tip', _AYUDA_CAJA)") > 0);
    t('el campo del tamaño entra entero: la columna más ancha, el selector angosto y el ejemplo con la letra normal',
      html.indexOf('.vfe-fila{display:grid;grid-template-columns:1.2fr 1.25fr 1fr auto;') > 0 &&
      html.indexOf('.vfe-unisel{cursor:pointer;color:var(--text);padding:0 0.1rem 0 0.3rem;flex:0 0 auto}') > 0 &&
      html.indexOf('.vfe-tamw .form-input::placeholder{font-style:italic;opacity:0.55;font-family:var(--font)}') > 0);
  }
  t('arriba, lo que se escribe llega a la primera fila (costo, stock, ganancias, caja y tamaño)',
    /\['pStock', 'pPorcentaje', 'pPorcentajeMay', 'pDescuento'\]\.forEach/.test(SRC) && SRC.indexOf("cb.addEventListener('change', pintarFilaPpal)") > 0 &&
    SRC.indexOf("pc.addEventListener('input', () => { if (!window._varPpalEscribiendo) window._varPpalBolsa = null; pintarFilaPpal(); });") > 0);

  console.log('\n-- el formulario: qué no se puede guardar --');
  {
    const w = armar({ tipo: 'peso' });
    w.ctx.openModal();
    t('sin filas nuevas ni tocadas se guarda como siempre', w.ctx.faltaPresentacionDeVariante() === false);
    w.ctx.varFilaAgregar();
    w.ctx.varFilaCambio(0, 'tam', '3 kg');
    w.ctx.varFilaCambio(0, 'costoIn', '13500');
    t('con filas, la primera bolsa (este producto) tiene que decir de cuánto es', w.ctx.faltaPresentacionDeVariante() === true &&
      /Poné de cuánto es la primera bolsa/.test(w.avisos.join()));
    w.porId.pGramaje.value = '1 kg';
    t('  y tener su costo: con la tabla, el de arriba está escondido', w.ctx.faltaPresentacionDeVariante() === true &&
      /Poné lo que costó la primera bolsa/.test(w.avisos.join()));
    w.porId.pCosto.value = '5000';
    t('  con eso, se puede', w.ctx.faltaPresentacionDeVariante() === false);
    w.ctx.varFilaCambio(0, 'tam', 'x12');
    t('una bolsa va en kg o g', w.ctx.faltaPresentacionDeVariante() === true && /El tamaño de una bolsa va en kg o g/.test(w.avisos.join()));
    w.ctx.varFilaCambio(0, 'tam', '1000 g');
    t('dos del mismo tamaño no (1000 g es 1 kg)', w.ctx.faltaPresentacionDeVariante() === true && /Hay dos del mismo tamaño/.test(w.avisos.join()));
    w.ctx.varFilaCambio(0, 'tam', '');
    t('sin tamaño no', w.ctx.faltaPresentacionDeVariante() === true && /Falta el tamaño/.test(w.avisos.join()));
    w.ctx.varFilaCambio(0, 'tam', '3 kg');
    w.ctx.varFilaCambio(0, 'costoIn', '');
    t('una nueva sin costo no', w.ctx.faltaPresentacionDeVariante() === true && /Poné el costo de la bolsa de 3 kg/.test(w.avisos.join()));
  }

  {
    /* La regla de Jero (21/09): el nombre interno no se repite en la misma lista. Las filas
       nuevas se crean directo, sin validarNombreProducto: lo revisa faltaPresentacionDeVariante. */
    const w = armar();
    vm.runInContext(cuerpo(html, 'claveProducto'), w.ctx);
    w.ctx.openModal();
    w.ctx.allProducts.find(p => p.id === 'chia').lista = 'L1';
    w.porId.pNombre.value = 'Chía';
    w.porId.pLista.value = 'L1';
    w.porId.pGramaje.value = '500 g';
    w.porId.pCosto.value = '3000';
    w.ctx.varFilaAgregar();
    w.ctx.varFilaCambio(0, 'tam', '250 g');
    w.ctx.varFilaCambio(0, 'costoIn', '1500');
    t('una fila nueva cuyo nombre ya está en la lista no se crea ("Chía x 250 g" ya existe en esa lista)', w.ctx.faltaPresentacionDeVariante() === true &&
      /En esta lista ya hay un producto llamado "Chía x 250 g"/.test(w.avisos.join()), w.avisos.join(' | '));
    w.porId.pLista.value = 'L2';
    t('  en otra lista, sí (puede ser de otro proveedor)', w.ctx.faltaPresentacionDeVariante() === false);
  }

  console.log('\n-- el formulario: al guardar --');
  {
    const w = armar({ tipo: 'peso' });
    w.ctx.openModal();
    w.ctx.varFilaAgregar();
    Object.assign(w.ctx.window._varFilas[0], { tam: '3 kg', costoIn: '13500', pct: 60, pctMay: 30, stock: '2300', tocado: { tam: true } });
    w.ctx.varFilaAgregar();
    Object.assign(w.ctx.window._varFilas[1], { tam: '5 kg', costoIn: '18750', pct: 55, pctMay: 30, stock: '0', dsc: '15', tocado: { tam: true } });
    const data = { nombre: 'Yerba Mate', tipoVenta: 'peso', codigo: '000900', categoria: 'Infusiones', subcategoria: null, descripcion: 'La de siempre',
      valoresNutricionales: '', imagen: 'https://x/y.jpg', lista: 'L1' };
    await w.ctx.guardarVariantesForm('ppal', data);
    const altas = w.escrituras.filter(e => e[0] === 'add').map(e => e[1]);
    t('crea una por fila, enganchada al producto', altas.length === 2 && altas.every(a => a.gramajePadreId === 'ppal'));
    t('  con nombre, tamaño, forma de venta, lista, categoría y foto del producto',
      altas[0].nombre === 'Yerba Mate x 3 kg' && altas[0].gramaje === '3 kg' && altas[0].tipoVenta === 'peso' && altas[0].lista === 'L1' &&
      altas[0].categoria === 'Infusiones' && altas[0].imagen === 'https://x/y.jpg' && altas[0].descripcion === 'La de siempre');
    t('  el costo por kilo y los precios de la fila', altas[0].costo === 4500 && altas[0].precio === 7200 && altas[0].precioMayorista === 5850 &&
      altas[0].porcentaje === 60 && altas[1].costo === 3750 && altas[1].precio === 5813);
    t('  el stock que se cargó', altas[0].stock === 2300 && altas[1].stock === 0);
    t('  y su descuento (0 si no se puso)', altas[0].descuento === 0 && altas[1].descuento === 15);
    t('  y cada una con su código, sin repetir el del producto', altas[0].codigo === '000901' && altas[1].codigo === '000902');
    t('  queda en el historial', w.historial.filter(x => /^crear \| Creado: Yerba Mate x/.test(x)).length === 2);
    t('  y la tabla queda vacía', w.ctx.window._varFilas.length === 0 && /2 bolsas guardadas/.test(w.avisos.join()));
  }
  {
    const w = armar({ editingId: 'mani80' });
    w.ctx.openModal('mani80');
    w.ctx.varFilaCambio(0, 'stock', '25');
    w.ctx.varFilaCambio(1, 'pct', '45');
    w.ctx.varFilaCambio(2, 'dsc', '20');
    await w.ctx.guardarVariantesForm('mani80', { nombre: 'Maní x 80 g', tipoVenta: 'unidad', codigo: 'M80' });
    const ups = Object.fromEntries(w.escrituras.filter(e => e[0] === 'update').map(e => [e[1], e[2]]));
    t('en una que ya existe solo se escribe lo que se tocó: el stock', JSON.stringify(ups.mani160) === '{"stock":25}');
    t('  o la ganancia, y con ella los precios (sobre su costo guardado, sin tocar el costo)', !!ups.mani320 && ups.mani320.porcentaje === 45 &&
      ups.mani320.precio === 0 && ups.mani320.costo === undefined);
    t('  o el descuento', JSON.stringify(ups.mani500) === '{"descuento":20}');
    t('  la que no se tocó no se escribe, ni se crea ninguna', Object.keys(ups).length === 3 && w.escrituras.filter(e => e[0] === 'add').length === 0);
    t('  sin cambiar el costo, su fecha no se toca (revisión del 01/10)', Object.values(ups).every(u => u.costoActualizadoEn === undefined));
  }
  {
    /* Para el aviso "Se vende sin ganancia" de la ficha (02/10): las filas que se van a guardar con
       precio, con el costo y el precio que les quedan (la misma cuenta que guardarVariantesForm). */
    const w = armar({ tipo: 'peso' });
    w.ctx.openModal();
    w.ctx.varFilaAgregar();
    Object.assign(w.ctx.window._varFilas[0], { tam: '3 kg', costoIn: '13500', pct: 0, pctMay: 0, stock: '0', tocado: { tam: true } });
    w.ctx.varFilaAgregar();
    Object.assign(w.ctx.window._varFilas[1], { tam: '5 kg', costoIn: '18750', pct: 55, pctMay: 30, stock: '0', tocado: { tam: true } });
    const f = w.ctx.filasVarConPrecio('Yerba Mate');
    t('la ficha sabe con qué precio quedan las bolsas nuevas de la tabla (aviso de sin ganancia, 02/10)', JSON.stringify(f) === JSON.stringify([
      { nombre: 'Yerba Mate x 3 kg', costo: 4500, precio: 4500, porcentaje: 0, peso: true },
      { nombre: 'Yerba Mate x 5 kg', costo: 3750, precio: 5813, porcentaje: 55, peso: true }]), JSON.stringify(f));
  }
  {
    const w = armar({ editingId: 'mani80' });
    w.ctx.openModal('mani80');
    w.ctx.varFilaCambio(0, 'stock', '25');
    w.ctx.varFilaCambio(1, 'pct', '45');
    const f = w.ctx.filasVarConPrecio('Maní x 80 g');
    t('  y de las que ya existen, solo las que cambian de precio (no el stock), con el de antes: sin costo queda en $0',
      JSON.stringify(f) === JSON.stringify([{ nombre: 'Maní x 320 g', costo: 0, precio: 0, porcentaje: 45, peso: false, antes: 4400 }]), JSON.stringify(f));
  }
  {
    const w = armar({ editingId: 'mani80' });
    w.ctx.openModal('mani80');
    w.ctx.varFilaCambio(0, 'tam', '170 g');
    await w.ctx.guardarVariantesForm('mani80', { nombre: 'Maní x 80 g', tipoVenta: 'unidad', codigo: 'M80' });
    const up = w.escrituras.find(e => e[0] === 'update');
    t('cambiarle el tamaño cambia la etiqueta, y el nombre si era el automático', !!up && up[2].gramaje === '170 g' && up[2].nombre === 'Maní x 170 g');
  }
  {
    const w = armar({ tipo: 'peso', fallaEscribir: true });
    w.ctx.openModal();
    w.ctx.varFilaAgregar();
    Object.assign(w.ctx.window._varFilas[0], { tam: '3 kg', costoIn: '13500', tocado: { tam: true } });
    let error = null;
    try { await w.ctx.guardarVariantesForm('ppal', { nombre: 'Yerba', tipoVenta: 'peso', codigo: 'Y1' }); } catch (e) { error = e; }
    t('si falla, avisa y NO corta: el producto ya se guardó y volver a guardar lo crearía otra vez',
      error === null && /No se pudieron guardar todas las bolsas: 3 kg: sin red/.test(w.avisos.join()));
  }

  /* ======================================== LA REVISIÓN DE CÓDIGO DEL 25/09 */
  console.log('\n-- revisión del 25/09: cambiar la forma de venta en el formulario --');
  const conBolsas = () => catalogo().concat([P('g1', { nombre: 'Yerba 1 kg', gramaje: '1 kg', tipoVenta: 'peso', costo: 5000, porcentaje: 60 }),
    P('g3', { nombre: 'Yerba 3 kg', gramaje: '3 kg', tipoVenta: 'peso', costo: 4500, porcentaje: 60, porcentajeMayorista: 30, gramajePadreId: 'g1' }),
    P('g500', { nombre: 'Yerba x 500 g', gramaje: '500 g', precio: 4160, costo: 2600, porcentaje: 60, gramajePadreId: 'g1' })]);
  {
    const w = armar({ tipo: 'peso', productos: conBolsas(), editingId: 'g1' });
    w.ctx.openModal('g1');
    t('las filas de un producto por peso son sus bolsas', w.ctx.window._varFilas.map(f => f.id).join() === 'g3' && w.ctx.window._varFilasPeso === true);
    w.ctx.varFilaCambio(0, 'costoIn', '9000');
    w.ctx._tipoVentaProd = 'unidad';
    w.ctx.setTipoVenta('unidad');
    t('al pasarlo a por unidad, las filas pasan a ser sus presentaciones por unidad (el paquete de 500 g)',
      w.ctx.window._varFilas.map(f => f.id).join() === 'g500' && w.ctx.window._varFilasPeso === false && w.ctx.window._varFilas[0].costoIn === '2600');
    t('  y avisa que lo que se tocó en las bolsas no se guarda', /Cambió la forma de venta: lo que habías cargado en las bolsas no se guarda/.test(w.avisos.join()));
    w.ctx.varFilaCambio(0, 'costoIn', '3000');
    await w.ctx.guardarVariantesForm('g1', { nombre: 'Yerba 1 kg', tipoVenta: 'unidad', codigo: 'G1' });
    const up = w.escrituras.find(e => e[0] === 'update');
    t('  al guardar, el costo por unidad va al paquete y la bolsa no se toca', !!up && up[1] === 'g500' && up[2].costo === 3000 &&
      !w.escrituras.some(e => e[1] === 'g3'));
    w.ctx._tipoVentaProd = 'peso';
    w.ctx.setTipoVenta('peso');
    t('volviendo a por peso, vuelven las bolsas como están guardadas', w.ctx.window._varFilas.map(f => f.id).join() === 'g3' &&
      w.ctx.window._varFilas[0].costoIn === '13500');
  }
  {
    const w = armar({ tipo: 'peso', productos: conBolsas(), editingId: 'g1' });
    w.ctx.openModal('g1');
    w.ctx.varFilaCambio(0, 'costoIn', '9000');
    await w.ctx.guardarVariantesForm('g1', { nombre: 'Yerba 1 kg', tipoVenta: 'unidad', codigo: 'G1' });
    t('y si igual llegara a guardarse una fila de la otra forma de venta, no se escribe', !w.escrituras.some(e => e[0] === 'update') &&
      /3 kg: es de la otra forma de venta/.test(w.avisos.join()));
  }

  console.log('\n-- revisión del 25/09: cambiar el tamaño de una bolsa --');
  {
    const w = armar({ tipo: 'peso', productos: conBolsas(), editingId: 'g1' });
    w.ctx.openModal('g1');
    w.ctx.varFilaCambio(0, 'tam', '5 kg');
    await w.ctx.guardarVariantesForm('g1', { nombre: 'Yerba 1 kg', tipoVenta: 'peso', codigo: 'G1' });
    const up = w.escrituras.find(e => e[0] === 'update');
    t('la bolsa de $13.500 pasa de 3 kg a 5 kg: se guarda lo que mostraba la fila, $2.700 el kilo, con sus precios',
      !!up && up[2].gramaje === '5 kg' && up[2].costo === 2700 && up[2].precio === 4320 && up[2].precioMayorista > 0, JSON.stringify(up && up[2]));
    t('  y como cambió el costo, su fecha va en la misma escritura: la relectura ya la trae (revisión del 01/10)',
      !!up && up[2].costoActualizadoEn === '__AHORA__' && !w.historial.some(x => /costoActualizadoEn/.test(x)), JSON.stringify(up && up[2]));
    const w2 = armar({ tipo: 'peso', productos: conBolsas(), editingId: 'g1' });
    w2.ctx.openModal('g1');
    w2.ctx.varFilaCambio(0, 'tam', '3 kg');
    await w2.ctx.guardarVariantesForm('g1', { nombre: 'Yerba 1 kg', tipoVenta: 'peso', codigo: 'G1' });
    t('  volver a escribir el mismo tamaño no toca nada', !w2.escrituras.some(e => e[0] === 'update'));
  }

  console.log('\n-- revisión del 25/09: editar una venta no cuenta su stock dos veces --');
  {
    const w = armar({ respuesta: 'otra' });
    w.ctx.editingVentaId = 'v1';
    w.ctx.editingVentaOriginal = { stockDescontado: true, items: [{ id: 'mani320', cantidad: 1 }] };
    const r = await w.ctx.sugerirPresentacion(buscar(w.ctx.allProducts, 'mani320'), [{ id: 'mani320', cantidad: 1 }], 'min');
    t('editando una venta, lo que ella ya había descontado vuelve: hay otro de 320 g y no ofrece otra presentación',
      r === 'seguir' && w.preguntas.length === 0);
    const w2 = armar({ respuesta: 'otra' });
    await w2.ctx.sugerirPresentacion(buscar(w2.ctx.allProducts, 'mani320'), [{ id: 'mani320', cantidad: 1 }], 'min');
    t('  en una venta nueva, con el único que quedaba ya en la venta, sí la ofrece', w2.preguntas.length === 1);
    const w3 = armar({ respuesta: 'otra' });
    w3.ctx.window._pedidoOrigenVentaId = 'ped1';
    w3.ctx.pedidosData = [{ docId: 'ped1', stockDescontado: true, items: [{ id: 'mani320', cantidad: 1 }] }];
    const r3 = await w3.ctx.sugerirPresentacion(buscar(w3.ctx.allProducts, 'mani320'), [{ id: 'mani320', cantidad: 1 }], 'min');
    t('  y convirtiendo un pedido web que ya lo descontó, tampoco', r3 === 'seguir' && w3.preguntas.length === 0);
  }

  console.log('\n-- revisión del 25/09: ocultar el producto principal --');
  {
    const w = armar();
    await w.ctx.toggleOculto('yerba1');
    const av = w.avisos.join(' | ');
    t('ocultar el principal de unas bolsas avisa que se venden cada una por separado, sin precio por cantidad',
      /aviso: Yerba Mate tiene otra presentación \(3 kg\)\. Mientras esté oculto, se venden cada una por separado, a su precio: sin precio por cantidad\./.test(av) &&
      /mejor borralo: la siguiente pasa a ser la principal/.test(av), av);
    const n = w.avisos.length;
    await w.ctx.toggleOculto('yerba1');
    await w.ctx.toggleOculto('mani160');
    t('  mostrarlo de nuevo, u ocultar una variante, no avisa nada', w.avisos.length === n && w.llamadas.filter(x => /^ocultar:/.test(x)).length === 3);
  }

  console.log('\n-- crear una variante --');
  {
    const w = armar();
    w.ctx.nuevaVariante('mani80');
    t('cierra y abre el formulario vacío', w.llamadas.join().indexOf('closeModal,openModal:') === 0);
    t('  y DESPUÉS marca de quién es: abrirlo la borra', w.ctx.window._varianteDeNueva === 'mani80' && w.ctx.window._varianteNombreBase === 'Maní');
    t('  con lo que comparten precargado', w.porId.pNombre.value === 'Maní' && w.porId.pDescripcion.value === 'Maní tostado' &&
      w.porId.pPorcentaje.value === 40 && w.porId.pPorcentajeMay.value === 20 && w.porId.pCategoria.value === 'Frutos secos' && w.porId.pLista.value === 'L1');
    t('  y la forma de venta del principal', w.llamadas.indexOf('tipo:unidad') > 0);
    t('  el título lo dice', w.porId.modalTitle.textContent === 'Nueva variante');
    t('  y la sección explica qué poner', w.porId.pVariantes.innerHTML.indexOf('Nueva variante de <b>Maní</b>') > 0);

    t('guardar sin su presentación no deja', w.ctx.faltaPresentacionDeVariante() === true && /error: Poné la presentación/.test(w.avisos.join()));
    w.porId.pGramaje.value = '160 g';
    t('  con la presentación, sí', w.ctx.faltaPresentacionDeVariante() === false);
    t('el nombre que se revisa por repetido es el que se guarda ("Maní x 160 g"), no el del campo, que es el del principal',
      w.ctx.nombreQueSeGuarda('Maní') === 'Maní x 160 g' && w.ctx.nombreQueSeGuarda(' Maní salado ') === 'Maní salado');
    t('  y admin.html lo usa al guardar y en el aviso en vivo', html.indexOf("validarNombreProducto((typeof nombreQueSeGuarda==='function'?nombreQueSeGuarda(_nomCampo?.value):_nomCampo?.value)") > 0 &&
      html.indexOf("const n=claveProducto(typeof nombreQueSeGuarda==='function'?nombreQueSeGuarda(el.value):el.value);") > 0);
    const d = w.ctx.datosDeVarianteNueva({ nombre: 'Maní', gramaje: '160 g' });
    t('queda enganchada al principal', d.gramajePadreId === 'mani80');
    t('  y con el nombre precargado se le suma la presentación', d.nombre === 'Maní x 160 g');
    const d2 = w.ctx.datosDeVarianteNueva({ nombre: 'Maní salado', gramaje: '160 g' });
    t('  un nombre que se escribió a mano queda como está', d2.nombre === 'Maní salado');
    w.ctx.openModal();
    t('un producto nuevo común no queda enganchado a nada',
      w.ctx.faltaPresentacionDeVariante() === false && w.ctx.datosDeVarianteNueva({ nombre: 'X' }).gramajePadreId === undefined);
  }

  console.log('\n-- borrar un principal --');
  {
    const w = armar();
    t('un producto sin variantes no agrega nada al aviso', w.ctx.avisoVariantesAlBorrar('chia') === '');
    t('uno con variantes lo avisa', /Tiene 4 variantes: siguen juntas/.test(w.ctx.avisoVariantesAlBorrar('mani80')));
    const r = await w.ctx.reengancharVariantesAlBorrar('mani80');
    const u = Object.fromEntries(w.updates.map(([id, data]) => [id, data.gramajePadreId]));
    t('la más chica que se vende pasa a ser la principal (aunque no tenga stock)', r.principal.id === 'mani160' && u.mani160 === '__BORRAR__');
    t('  y las otras se enganchan a ella, ocultas y depuradas incluidas',
      u.mani320 === 'mani160' && u.mani500 === 'mani160' && u.mani1k === 'mani160');
    const prods = w.ctx.allProducts;
    t('  también en lo que tiene cargado el panel',
      buscar(prods, 'mani160').gramajePadreId === undefined && buscar(prods, 'mani320').gramajePadreId === 'mani160');
    t('  y lo avisa', /siguen juntas: ahora la principal es "Maní x 160 g"/.test(w.avisos.join()));
    const r2 = await w.ctx.reengancharVariantesAlBorrar('alf1');
    t('con una sola, queda como producto suelto', r2.principal.id === 'alf12' && buscar(prods, 'alf12').gramajePadreId === undefined &&
      /"Alfajor x12" quedó como producto suelto/.test(w.avisos.join()));
    t('sin variantes no escribe nada', (await w.ctx.reengancharVariantesAlBorrar('chia')) === null);
  }
  {
    const w = armar({ falla: true });
    let error = null;
    try { await w.ctx.reengancharVariantesAlBorrar('mani80'); } catch (e) { error = e; }
    t('si no se pudo escribir, falla: deleteProduct no borra y quedan como estaban',
      !!error && buscar(w.ctx.allProducts, 'mani320').gramajePadreId === 'mani80');
  }

  /* ========================================================== EN admin.html */
  console.log('\n-- los ganchos de admin.html --');
  const iScript = html.indexOf('<script src="admin-variantes.js"></script>');
  t('el módulo se carga después del panel y de los diálogos',
    iScript > html.indexOf('<script src="admin-dialogo.js"></script>') && iScript > html.indexOf('const _origOpenModal = openModal;'));
  {
    const iSec = html.indexOf('id="pVariantesSec"');
    t('la sección va después del precio mayorista y antes de dónde va en el catálogo',
      iSec > html.indexOf('Precio mayorista</div>') && iSec < html.indexOf('D&oacute;nde va en el cat&aacute;logo</div>') && html.indexOf('<div id="pVariantes"></div>') > iSec);
  }
  const guardar = cuerpo(html, 'saveProduct');
  t('guardar revisa la presentación y la tabla antes de validar nada más, al crear Y al editar',
    /if\(typeof faltaPresentacionDeVariante==='function'&&faltaPresentacionDeVariante\(\)\)return;/.test(guardar) &&
    guardar.indexOf('faltaPresentacionDeVariante()') < guardar.indexOf('validarCodigoProducto('));
  t('  y engancha la variante antes de crearla',
    /if\(!editingId&&typeof datosDeVarianteNueva==='function'\)datosDeVarianteNueva\(data\);/.test(guardar) &&
    guardar.indexOf('datosDeVarianteNueva(data)') < guardar.indexOf(".add(data)"));
  t('  y guarda la tabla después del producto, con su id, antes de cerrar',
    /if\(typeof guardarVariantesForm==='function'\)await guardarVariantesForm\(_refId,data\);closeModal\(\);/.test(guardar));
  const borrar = cuerpo(html, 'deleteProduct');
  t('borrar avisa de las variantes en la confirmación', /pedirConfirmacion\([^;]*avisoVariantesAlBorrar\(id\)/.test(borrar));
  t('  y las reengancha ANTES de borrar el documento',
    borrar.indexOf('reengancharVariantesAlBorrar(id)') > 0 && borrar.indexOf('reengancharVariantesAlBorrar(id)') < borrar.indexOf(".doc(id).delete()"));
  const pintar = cuerpo(html, '_pintarBusqueda');
  t('el buscador de la venta junta las variantes', /typeof agruparVariantesVenta==='function'\)\?agruparVariantesVenta\(res,allProducts\):res/.test(pintar) &&
    /\(p&&p\.__grupo\)\?_filaGrupoVenta\(p,ctx\):_filaProdVenta\(p,ctx\)/.test(pintar));
  const agregar = cuerpo(html, '_agregarItemVenta');
  t('al agregar, ofrece otra presentación después de las preguntas de oculto y depurado',
    agregar.indexOf('sugerirPresentacion(p,lista,ctx)') > agregar.indexOf("depuracionOfrecerRestaurar(p,'venderlo')"));
  t('  y no en los de peso', /if\(p && !esPorPeso\(p\) && typeof sugerirPresentacion==='function'\)/.test(agregar));
  t('asociar gramajes no ofrece a uno que ya tiene variantes', /if\(_conVariantes\.has\(p\.id\)\)return false;/.test(cuerpo(html, 'renderGramajeSugerencias')));
  t('  y desde una variante abre las del principal', /if\(prod\.gramajePadreId\)\{[^}]*return openGramajeModal\(_pr\.id\)/.test(cuerpo(html, 'openGramajeModal')));

  /* _agregarItemVenta de verdad, con lo de alrededor de mentira. */
  /* limpiarPorcentaje de verdad: los % hasta 999, en la tabla y en el formulario. */
  console.log('\n-- los porcentajes, hasta 999 --');
  {
    const lp = new Function(cuerpo(html, 'limpiarPorcentaje') + '\nreturn limpiarPorcentaje;')();
    const pc = v => { const o = { value: v, selectionStart: String(v).length, setSelectionRange() {} }; lp(o); return o.value; };
    t('un número gigante no entra: 1111111 queda 111', pc('1111111') === '111');
    t('  ni la notación científica ni el signo', pc('99999e5') === '999' && pc('-35') === '35');
    t('  con un decimal, con coma o con punto (queda con punto: lo lee parseFloat)', pc('45,55') === '45.5' && pc('45.5') === '45.5' && pc('7,') === '7.');
    t('  lo que ya está bien no se toca', pc('999') === '999' && pc('0') === '0' && pc('') === '');
    t('el formulario de arriba también los usa', /id="pPorcentaje" value="0" oninput="limpiarPorcentaje\(this\);calcPrecioModal\(\)"/.test(html) &&
      /id="pPorcentajeMay" value="0" oninput="limpiarPorcentaje\(this\);calcPrecioModal\(\)"/.test(html));
  }

  console.log('\n-- _agregarItemVenta con la sugerencia --');
  async function agregarCon(respuesta, prod) {
    const agregados = [], busc = { value: 'mani' }, pedidos = [];
    const f = new Function('allProducts', 'ventaItems', 'ventaMayItems', '_origAddVentaItem', '_origAddVentaMayItem',
      'renderVentaItems', 'renderVentaMayItems', 'pedirConfirmacion', 'depuracionOfrecerRestaurar', 'esPorPeso', 'pedirCantidadPeso',
      'document', 'filterVentaProducts', 'filterVentaMayProducts', 'sugerirPresentacion',
      /* cuerpo() arranca en "function": el async se le agrega a mano. */
      'async ' + agregar + '\nreturn _agregarItemVenta;')(
      catalogo(), [], [], id => agregados.push(id), id => agregados.push('may:' + id), () => {}, () => {}, async () => true, async () => true,
      x => !!(x && x.tipoVenta === 'peso'), async () => { pedidos.push('gramos'); return 500; },
      { getElementById: () => busc }, () => {}, () => {}, async () => { pedidos.push('sugerencia'); return respuesta; });
    await f(prod || 'mani160', 'min');
    return { agregados, busc, pedidos };
  }
  let r = await agregarCon('cancelar');
  t('cancelar la sugerencia no agrega nada ni borra lo buscado', r.agregados.length === 0 && r.busc.value === 'mani');
  r = await agregarCon('hecho');
  t('"hecho": no se agrega la pedida (ya se agregaron las otras) y se limpia el buscador', r.agregados.length === 0 && r.busc.value === '');
  r = await agregarCon('seguir');
  t('"seguir": se agrega la pedida, como siempre', r.agregados.join() === 'mani160' && r.busc.value === '');
  r = await agregarCon('cancelar', 'yerba3');
  t('un producto por peso ni pregunta: pide los gramos', r.pedidos.join() === 'gramos' && r.agregados.join() === 'yerba3');

  /* ================================================================ LA TIENDA */
  console.log('\n-- la tienda --');
  const cuerpoApp = n => {
    const c = cuerpo(app, n);
    if (!c) throw new Error('no se encontro ' + n + ' en app.js');
    /* cuerpo() arranca en "function": el async se le agrega a mano. */
    return (app.indexOf('async function ' + n + '(') >= 0 ? 'async ' : '') + c;
  };
  function tienda(productos, carrito) {
    const toasts = [], render = [];
    const api = new Function('productos', 'carrito', 'showToast', 'renderProductsPaginated', 'addToCart',
      ['_tamVariante', '_etqVariante', '_variantesTienda', '_btnVariante', 'addVarianteToCart', 'aplicarFiltros',
       'sinPrecio', 'formatPrice', 'precioFinal', 'esPesoProd'].map(cuerpoApp).join('\n') +
      '\nfunction esc(s){return String(s);}' +
      '\nlet categoriaActual="Todos",subcategoriaActual=null,busquedaTexto="",ordenAlfa=null,ordenPrecio=null;' +
      '\nfunction _searchScore(q,p){return ((p.nombreMostrado||p.nombre)||"").toLowerCase().indexOf(q.toLowerCase())>=0?1:0;}' +
      '\nfunction updateSortButtonUI(){} function revelar(){} const document={};' +
      '\nreturn { variantes:_variantesTienda, boton:_btnVariante, sumar:addVarianteToCart,' +
      '  filtrar:function(q){busquedaTexto=q||"";aplicarFiltros();} };')(
      productos, carrito, (m, tp) => toasts.push(m), l => render.push(l.map(p => p.id).join(',')),
      async id => { const it = carrito.find(i => i.id === id); if (it) it.cantidad++; else carrito.push({ id, cantidad: 1 }); });
    return { api, toasts, render };
  }
  {
    const prods = catalogo().filter(p => !p.oculto && !p.depurado);
    const { api, render, toasts } = tienda(prods, []);
    const b = id => buscar(prods, id);
    t('el principal y sus variantes, de menor a mayor', api.variantes(b('mani80')).map(v => v.id).join() === 'mani80,mani160,mani320');
    t('  un producto sin variantes no tiene botones', api.variantes(b('chia')).length === 0);
    const b160 = api.boton(b('mani160'), b('mani80'), false);
    t('el botón sin stock queda apagado y lo dice (en el celular no hay globo)', / disabled title="Sin stock"/.test(b160) && b160.indexOf('sin stock') > 0);
    const b80 = api.boton(b('mani80'), b('mani80'), false);
    t('el botón con stock trae su precio', b80.indexOf('$1.200') > 0 && b80.indexOf('disabled') < 0);
    t('  el del principal va marcado', b80.indexOf('gramaje-btn active') > 0);
    t('  en la tarjeta no abre el detalle al tocarlo', b80.indexOf("event.stopPropagation();addVarianteToCart('mani80')") > 0);
    t('  en el detalle no hace falta', api.boton(b('mani80'), b('mani80'), true).indexOf('stopPropagation') < 0);
    t('los de granel dicen el precio por kilo', api.boton(b('yerba3'), b('yerba1'), false).indexOf('$8.000/kg') > 0);
    const sinP = P('sp', { nombre: 'Maní x 40 g', precio: 0, gramajePadreId: 'mani80' });
    t('sin precio no muestra "$0"', api.boton(sinP, b('mani80'), false).indexOf('$') < 0);
    const sinEtq = P('se', { nombre: 'Maní tostado' });
    t('un principal sin presentación ni tamaño en el nombre sigue diciendo "Base"', api.boton(sinEtq, sinEtq, false).indexOf('>Base<') > 0);

    api.filtrar('');
    t('las variantes no tienen tarjeta propia', render[0].split(',').indexOf('mani160') < 0 && render[0].split(',').indexOf('mani80') >= 0);
    api.filtrar('160');
    t('buscar una variante trae la tarjeta de su principal', render[1] === 'mani80');
    api.filtrar('yerba mate 3');
    t('  también en las de granel', render[2] === 'yerba1');

    const huerfana = catalogo().filter(p => p.id !== 'ac500');
    const w2 = tienda(huerfana, []);
    w2.api.filtrar('');
    t('una variante cuyo principal no está en la tienda sale sola: antes no se veía', w2.render[0].split(',').indexOf('ac250') >= 0);

    const carrito = [{ id: 'mani160', cantidad: 1 }];
    const w3 = tienda(prods, carrito);
    await w3.api.sumar('mani160');
    t('sumar otra de la misma variante lo avisa: la tarjeta muestra la del principal', /Maní x 160 g: 2 en el carrito/.test(w3.toasts.join()));
    await w3.api.sumar('mani320');
    t('  la primera vez avisa addToCart, no se repite', w3.toasts.length === 1);
    t('la etiqueta "Sin stock" de la tarjeta solo si no queda de ninguna',
      /noStock&&!variantes\.some\(v=>\(v\.stock\|\|0\)>0\)\?'<span class="product-stock out">Sin stock<\/span>'/.test(app));
    t('el detalle usa los mismos botones', /pdmVariantes\.map\(v=>_btnVariante\(v,p,true\)\)/.test(app));
    t('la tienda usa el app.min.js recompilado', leer('app.min.js').indexOf('addVarianteToCart') >= 0);
    t('  y el styles.min.css con el botón apagado', leer('styles.min.css').indexOf('.gramaje-precio') >= 0);
  }

  console.log('\n-- sin % mayorista, sin precio mayorista (01/10) --');
  {
    const w = armar({ tipo: 'peso' });
    const r = w.ctx._calcFilaVar({ tam: '3 kg', costoIn: '13500', pct: 60, pctMay: 0 }, true);
    t('una bolsa con el % mayorista en 0 no tiene precio mayorista (antes, el costo: $4.500)', r.costo === 4500 && r.precio === 7200 && r.may === 0, JSON.stringify(r));
    t('  y lo dice: "Sin mayorista: se cobra el de mostrador", no "Mayorista $0"',
      w.ctx._resFilaVar(r, true) === '<span>Costo $4.500 el kilo</span><span>Precio <b>$7.200</b> el kilo</span><span class="vfe-may">Sin mayorista: se cobra el de mostrador</span>',
      w.ctx._resFilaVar(r, true));
    w.ctx.openModal();
    w.ctx.varFilaAgregar();
    Object.assign(w.ctx.window._varFilas[0], { tam: '3 kg', costoIn: '13500', pct: 60, pctMay: 0, stock: '0', tocado: { tam: true } });
    await w.ctx.guardarVariantesForm('ppal', { nombre: 'Yerba Mate', tipoVenta: 'peso', codigo: '000900' });
    const alta = w.escrituras.find(e => e[0] === 'add');
    t('  al guardarla, el mayorista va en 0', !!alta && alta[1].precioMayorista === 0 && alta[1].porcentajeMayorista === 0 && alta[1].precio === 7200,
      JSON.stringify(alta && alta[1]));
  }
  {
    const w = armar({ editingId: 'mani80' });
    w.ctx.openModal('mani80');
    w.ctx.varFilaCambio(0, 'pctMay', '0');
    await w.ctx.guardarVariantesForm('mani80', { nombre: 'Maní x 80 g', tipoVenta: 'unidad', codigo: 'M80' });
    const up = w.escrituras.find(e => e[0] === 'update' && e[1] === 'mani160');
    t('  en una que ya existe, poner el % mayorista en 0 lo deja en 0 (antes, el costo: $1.500)',
      !!up && up[2].porcentajeMayorista === 0 && up[2].precioMayorista === 0 && up[2].precio === 2250, JSON.stringify(up && up[2]));
  }

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + (e && e.stack || e)); process.exit(1); });
