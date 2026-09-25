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
    P('mani160', { nombre: 'Maní x 160 g', gramaje: '160 g', precio: 2300, precioMayorista: 2000, stock: 0, gramajePadreId: 'mani80' }),
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
  const campo = id => (porId[id] = porId[id] || { id, value: '', innerHTML: '', textContent: '', style: {}, focus() { this.enfocado = true; } });
  ['pVariantes', 'pNombre', 'pDescripcion', 'pPorcentaje', 'pPorcentajeMay', 'pCategoria', 'pSubcategoria', 'pLista', 'pGramaje', 'modalTitle'].forEach(campo);
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
  };
  const avisos = [], agregados = [], elegidos = [], preguntas = [], updates = [], llamadas = [];
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
    firebase: { firestore: { FieldValue: { delete: () => '__BORRAR__' } } },
    db: {
      collection: () => ({ doc: id => ({ id }) }),
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
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { ctx, porId, cuerpoPag, escuchas, avisos, agregados, elegidos, preguntas, updates, llamadas };
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
    t('  con dos botones: la otra, o la pedida igual',
      q.op.opciones.map(x => x.valor).join() === 'otra,igual' && q.op.opciones[0].principal === true &&
      q.op.opciones[1].texto === 'Agregar la de 160 g igual');
  }
  {
    const w = armar({ respuesta: 'igual' });
    const r = await w.ctx.sugerirPresentacion(buscar(w.ctx.allProducts, 'mani160'), [], 'min');
    t('"igual": se agrega la pedida, como siempre', r === 'seguir' && w.agregados.length === 0);
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
  console.log('\n-- el formulario --');
  {
    const w = armar();
    w.ctx.window._varianteDeNueva = 'viejo';
    w.ctx.openModal('mani160');
    t('abrir el formulario olvida la variante que se estaba por crear', w.ctx.window._varianteDeNueva === null);
    t('  y abre el de verdad', w.llamadas.indexOf('openModal:mani160') >= 0);
    const h = w.porId.pVariantes.innerHTML;
    t('en una variante: de quién es, con el botón al principal', h.indexOf('Es una variante de <b>Maní</b>') > 0 && h.indexOf("openModal('mani80')") > 0);
    t('  la lista con la oculta marcada y sin la depurada', h.indexOf('Maní x 500 g · oculto') > 0 && h.indexOf('mani1k') < 0);
    t('  y cuál es la que está abierta', /var-fila actual[\s\S]{0,80}160 g/.test(h) && h.indexOf('>este<') > 0);
    t('  se pueden sumar más desde cualquiera', h.indexOf("nuevaVariante('mani80')") > 0);
    w.ctx.openModal();
    t('un producto nuevo explica cómo sumarle variantes', w.porId.pVariantes.innerHTML.indexOf('Guardalo, y después') > 0);
    w.ctx.openModal('chia');
    t('uno sin variantes lo dice, con el botón', w.porId.pVariantes.innerHTML.indexOf('Todavía no tiene variantes') > 0 &&
      w.porId.pVariantes.innerHTML.indexOf("nuevaVariante('chia')") > 0);
    const sinEtq = [P('sx', { nombre: 'Maní tostado' }), P('sy', { nombre: 'Maní tostado grande', gramaje: '500 g', gramajePadreId: 'sx' })];
    const w2 = armar({ productos: sinEtq });
    w2.ctx.openModal('sx');
    t('si al principal no se le puede leer la presentación, lo avisa', w2.porId.pVariantes.innerHTML.indexOf('var-falta') > 0);
    w.ctx.openModal('mani80');
    t('  y si se le puede leer del nombre, no', w.porId.pVariantes.innerHTML.indexOf('var-falta') < 0);
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
  t('la sección va debajo de "Gramaje / Presentación"', /id="pGramaje"[^>]*><\/div><div id="pVariantes" class="variantes-form"><\/div>/.test(html));
  const guardar = cuerpo(html, 'saveProduct');
  t('guardar pide la presentación antes de validar nada más, y solo al crear',
    /if\(!editingId&&typeof faltaPresentacionDeVariante==='function'&&faltaPresentacionDeVariante\(\)\)return;/.test(guardar) &&
    guardar.indexOf('faltaPresentacionDeVariante()') < guardar.indexOf('validarCodigoProducto('));
  t('  y engancha la variante antes de crearla',
    /if\(!editingId&&typeof datosDeVarianteNueva==='function'\)datosDeVarianteNueva\(data\);/.test(guardar) &&
    guardar.indexOf('datosDeVarianteNueva(data)') < guardar.indexOf(".add(data)"));
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

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + (e && e.stack || e)); process.exit(1); });
