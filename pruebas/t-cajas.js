/**
 * CAJAS CERRADAS A PRECIO MAYORISTA (variantes, etapa 3).
 *
 * Pedido del comercio (24/09/2026): si se lleva la caja entera cerrada -el alfajor
 * x12- se cobra el precio mayorista, también en el mostrador y en la tienda. Si se
 * lleva sueltos, precio normal: 12 alfajores sueltos a $10 son $120.
 *
 * Una presentación se marca como caja cerrada (en la tabla de presentaciones o en su
 * propio formulario). Su precio de lista se sigue calculando como siempre; la regla se
 * aplica al vender, con el precio mayorista: en la venta de mostrador, en la tienda, en
 * el PDF del catálogo y en descontarStockPedido, que compara lo cobrado.
 *
 * Corre admin-variantes.js, admin-escalas.js, funciones de admin.html y de app.js de
 * verdad, con un panel y una tienda de mentira.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const VAR = leer('admin-variantes.js');
const ESC = leer('admin-escalas.js');
const html = leer('admin.html');
const app = leer('app.js');
const fun = leer('functions/index.js');

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

const P = (id, extra) => Object.assign({ id, nombre: id, precio: 1000, precioMayorista: 900, costo: 500, stock: 5, tipoVenta: 'unidad' }, extra || {});
function catalogo() {
  return [
    P('alf1', { nombre: 'Alfajor Triple x1', gramaje: 'x1', precio: 1000, precioMayorista: 800, costo: 600, stock: 30, porcentaje: 66.7, porcentajeMayorista: 33.3 }),
    P('alf12', { nombre: 'Alfajor Triple x12', gramaje: 'x12', precio: 11500, precioMayorista: 9600, costo: 7200, stock: 3, cajaCerrada: true, gramajePadreId: 'alf1',
      porcentaje: 60, porcentajeMayorista: 33 }),
    P('sinMay', { nombre: 'Caja sin mayorista', precio: 5000, precioMayorista: 0, cajaCerrada: true }),
    P('granelCaja', { nombre: 'Granel marcado', tipoVenta: 'peso', precio: 9000, precioMayorista: 7000, cajaCerrada: true }),
  ];
}

function armar(opts) {
  const o = opts || {};
  const porId = {};
  const el = id => (porId[id] = porId[id] || { id, value: '', innerHTML: '', textContent: '', className: '', hidden: false, checked: false,
    style: {}, focus() { this.enfocado = true; }, addEventListener() {}, dispatchEvent() {} });
  ['pVariantes', 'pGramaje', 'pNombre', 'pPorcentaje', 'pPorcentajeMay', 'pPrecioMay', 'pCajaWrap', 'pCajaCerrada', 'pCajaNota'].forEach(el);
  const avisos = [], escrituras = [];
  let n = 0;
  const ctx = {
    console, Math, Number, String, Object, Array, Set, Map, Promise, Infinity, parseInt,
    setTimeout: () => 0,
    document: { getElementById: id => porId[id] || null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} },
    allProducts: o.productos || catalogo(),
    ventaItems: o.ventaItems || [], ventaMayItems: o.ventaMayItems || [],
    _tipoVentaProd: o.tipo || 'unidad',
    editingId: o.editingId || null,
    esc: s => String(s), _attrHtml: s => String(s),
    showAdminToast: (m, tp) => avisos.push((tp || 'info') + ': ' + m),
    Event: function (tp) { this.type = tp; },
    db: { collection: () => ({
      doc: id => ({ id, update: async d => { escrituras.push(['update', id, d]); } }),
      add: async d => { escrituras.push(['add', d]); return { id: 'nuevo' + (++n) }; } }) },
    sugerirCodigoProducto: res => 'C' + (res || []).length, refrescarProductoLocal: async () => true, logAction: () => {},
    renderVentaItems: () => {}, renderVentaMayItems: () => {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(['esPorPeso', 'precioConDsc', 'subtotalItem'].map(nm => cuerpo(html, nm)).join('\n'), ctx);
  vm.runInContext(VAR, ctx);
  vm.runInContext(ESC, ctx);
  return { ctx, porId, avisos, escrituras };
}
const b = (ctx, id) => ctx.allProducts.find(p => p.id === id);

(async () => {
  console.log('\n-- la regla --');
  {
    const { ctx } = armar();
    t('una caja cerrada se cobra al precio mayorista', ctx.esCajaCerrada(b(ctx, 'alf12')) && ctx.precioMostradorDe(b(ctx, 'alf12')) === 9600);
    t('los sueltos, al precio de siempre (12 sueltos a $1.000 son $12.000)', ctx.precioMostradorDe(b(ctx, 'alf1')) === 1000 && !ctx.esCajaCerrada(b(ctx, 'alf1')));
    t('una caja sin precio mayorista no se regala: va al de lista', ctx.precioMostradorDe(b(ctx, 'sinMay')) === 5000);
    t('un producto por peso no es caja aunque lo diga', !ctx.esCajaCerrada(b(ctx, 'granelCaja')) && ctx.precioMostradorDe(b(ctx, 'granelCaja')) === 9000);
    t('el selector y la sugerencia de presentaciones usan la misma regla',
      ctx.precioDeVentaVariante(b(ctx, 'alf12'), 'min') === 9600 && ctx.precioDeVentaVariante(b(ctx, 'alf12'), 'may') === 9600 &&
      ctx.precioDeVentaVariante(b(ctx, 'alf1'), 'min') === 1000);
  }

  console.log('\n-- en la tabla de presentaciones --');
  {
    const w = armar({ editingId: 'alf1' });
    w.ctx.openModal = function () {};
    w.ctx.iniciarVariantesForm(b(w.ctx, 'alf1'));
    w.ctx.pintarVariantesForm();
    const f = w.ctx.window._varFilas;
    t('la caja que ya estaba marcada viene marcada', f.length === 1 && f[0].id === 'alf12' && f[0].caja === true);
    const h = w.porId.pVariantes.innerHTML;
    t('cada presentación tiene la casilla de caja cerrada', h.indexOf('class="vfe-caja"') > 0 && h.indexOf(' checked') > 0 &&
      h.indexOf("varFilaCambio(0,'caja',this.checked)") > 0);
    t('  y dice lo que se cobra: el mayorista', h.indexOf('Se cobra <b>$9.600</b> (caja cerrada, precio mayorista)') > 0);
    const r = w.ctx._calcFilaVar({ tam: 'x12', costoIn: '7200', pct: 60, pctMay: 33 }, false);
    t('  (la cuenta: costo 7.200 con 33% da 9.576, redondeado a 9.600)', r.may === 9600);
    const wp = armar({ tipo: 'peso' });
    wp.ctx.openModal = function () {};
    wp.ctx.window._varFilas = [{ id: null, tam: '3 kg', costoIn: '1', pct: 1, pctMay: 1, stock: 0, tocado: {} }];
    wp.ctx.pintarVariantesForm();
    t('en las bolsas de granel no aparece', wp.porId.pVariantes.innerHTML.indexOf('vfe-caja') < 0);
  }
  {
    const w = armar();
    w.ctx.window._varFilas = [{ id: null, tam: 'x12', costoIn: '7200', pct: 60, pctMay: 0, stock: 2, caja: true, tocado: { tam: true, caja: true } }];
    w.porId.pGramaje.value = 'x1';
    w.porId.pCosto = { id: 'pCosto', value: '600' };
    t('una caja nueva con 0% mayorista no se guarda: se vendería al costo',
      w.ctx.faltaPresentacionDeVariante() === true && /La caja cerrada de x12 se cobra al precio mayorista/.test(w.avisos.join()));
    w.ctx.window._varFilas[0].pctMay = 33;
    t('  con el % mayorista, sí', w.ctx.faltaPresentacionDeVariante() === false);
    await w.ctx.guardarVariantesForm('alf1', { nombre: 'Alfajor Triple x1', tipoVenta: 'unidad', codigo: 'A1' });
    const alta = w.escrituras.find(e => e[0] === 'add');
    t('al guardar, la nueva queda marcada', !!alta && alta[1].cajaCerrada === true && alta[1].precioMayorista === 9600);
  }
  {
    const w = armar({ editingId: 'alf1' });
    w.ctx.iniciarVariantesForm(b(w.ctx, 'alf1'));
    w.ctx.varFilaCambio(0, 'caja', false);
    await w.ctx.guardarVariantesForm('alf1', { nombre: 'Alfajor Triple x1', tipoVenta: 'unidad', codigo: 'A1' });
    const up = w.escrituras.find(e => e[0] === 'update');
    t('desmarcarla en la tabla la desmarca', !!up && up[1] === 'alf12' && up[2].cajaCerrada === false);
    const w2 = armar({ editingId: 'alf1' });
    w2.ctx.iniciarVariantesForm(b(w2.ctx, 'alf1'));
    w2.ctx.varFilaCambio(0, 'caja', true);
    await w2.ctx.guardarVariantesForm('alf1', { nombre: 'Alfajor Triple x1', tipoVenta: 'unidad', codigo: 'A1' });
    t('  tocarla sin cambiarla no escribe nada', w2.escrituras.length === 0);
  }

  console.log('\n-- en su propio formulario --');
  {
    const w = armar();
    w.porId.pCajaCerrada.checked = true;
    w.porId.pPorcentajeMay.value = '33'; w.porId.pPrecioMay.value = '9600';
    w.ctx.pintarCajaCerrada();
    t('marcada, dice lo que se va a cobrar', w.porId.pCajaWrap.hidden === false && w.porId.pCajaNota.textContent === 'En el mostrador y en la tienda se cobra $9.600, el precio mayorista.');
    w.porId.pPorcentajeMay.value = '0';
    w.ctx.pintarCajaCerrada();
    t('  con 0% mayorista avisa que se vendería al costo', /con 0 la caja se vendería al costo/.test(w.porId.pCajaNota.textContent) && w.porId.pCajaNota.className === 'caja-nota falta');
    t('  y no deja guardar', w.ctx.faltaPresentacionDeVariante() === true && /Una caja cerrada se cobra al precio mayorista: poné el % mayorista/.test(w.avisos.join()) &&
      w.porId.pPorcentajeMay.enfocado === true);
    const d = w.ctx.datosCajaCerrada({ tipoVenta: 'unidad' }, null);
    t('al guardar la marca', d.cajaCerrada === true);
    w.porId.pCajaCerrada.checked = false;
    t('  sacarla la borra en una que la tenía', w.ctx.datosCajaCerrada({ tipoVenta: 'unidad' }, 'alf12').cajaCerrada === false);
    t('  y una que nunca la tuvo no gana el campo', !('cajaCerrada' in w.ctx.datosCajaCerrada({ tipoVenta: 'unidad' }, 'alf1')));
    w.porId.pCajaCerrada.checked = true;
    t('un producto por peso no se guarda como caja', !('cajaCerrada' in w.ctx.datosCajaCerrada({ tipoVenta: 'peso' }, null)));
    const wp = armar({ tipo: 'peso' });
    wp.ctx.pintarCajaCerrada();
    t('  y en el formulario ni aparece', wp.porId.pCajaWrap.hidden === true);
  }

  console.log('\n-- al vender --');
  {
    const w = armar({ ventaItems: [{ id: 'alf12', nombre: 'Alfajor Triple x12', precio: 9600, cantidad: 1, tipoVenta: 'unidad' },
      { id: 'alf1', nombre: 'Alfajor Triple x1', precio: 1000, cantidad: 12, tipoVenta: 'unidad' }] });
    const v = w.ctx.vistaItemsVenta(w.ctx.ventaItems);
    t('en la lista de la venta, la caja lo aclara', v[0].__detalle === 'Caja cerrada: se cobra el precio mayorista' && v[0].precio === 9600);
    t('  los sueltos no', v[1].__detalle === undefined && v[1] === w.ctx.ventaItems[1]);
    const wm = armar({ ventaMayItems: [{ id: 'alf12', nombre: 'Alfajor Triple x12', precio: 9600, cantidad: 1, tipoVenta: 'unidad' }] });
    t('  en la mayorista no hace falta (todo va al mayorista)', wm.ctx.vistaItemsVenta(wm.ctx.ventaMayItems) === wm.ctx.ventaMayItems);
  }
  {
    /* addVentaItem de verdad: la que agrega el renglón en la venta de mostrador. */
    const { ctx } = armar();
    const agregar = new Function('allProducts', 'renderVentaItems', 'precioMostradorDe', 'let ventaItems=[];' + cuerpo(html, 'addVentaItem') +
      '\nreturn function(id){addVentaItem(id);return ventaItems;};')(ctx.allProducts, () => {}, ctx.precioMostradorDe);
    agregar('alf12');
    const items = agregar('alf1');
    t('la venta de mostrador agrega la caja a $9.600 y el suelto a $1.000', items[0].precio === 9600 && items[1].precio === 1000);
    const fila = new Function('esPorPeso', 'fmtPeso', 'esc', '_attrHtml', 'precioMostradorDe', cuerpo(html, '_filaProdVenta') + '\nreturn _filaProdVenta;')(
      x => !!(x && x.tipoVenta === 'peso'), g => g + ' g', s => String(s), s => String(s), ctx.precioMostradorDe);
    const h = fila(b(ctx, 'alf12'), 'min');
    t('el buscador muestra el precio de la caja y la marca', h.indexOf('$9.600') > 0 && h.indexOf('CAJA CERRADA') > 0);
    t('  en un suelto, ni la marca', fila(b(ctx, 'alf1'), 'min').indexOf('CAJA CERRADA') < 0);
  }

  {
    /* Chequeo del 25/09: la caja x12 sin stock ofrecía otra presentación sin decir cuánto
       salía la caja, y lo ofrecido (a precio normal) sale más caro. */
    const w = armar();
    let msg = null;
    w.ctx.pedirOpcion = async m => { msg = m; return 'igual'; };
    w.ctx._origAddVentaItem = () => {};
    const r = await w.ctx.sugerirPresentacion(Object.assign(b(w.ctx, 'alf12'), { stock: 0 }), [], 'min');
    t('una caja sin stock: la sugerencia dice cuánto salía la caja', r === 'seguir' && !!msg &&
      msg.indexOf('Es una caja cerrada: salía $9.600.') > 0 && msg.indexOf('12 de x1') > 0);
    t('el selector de la venta marca las cajas', VAR.indexOf("(esCajaCerrada(v) ? ' <small class=\"var-caja\">caja cerrada</small>' : '')") > 0);
  }

  console.log('\n-- los ganchos del panel --');
  t('la casilla va en el precio mayorista del formulario', /id="pCajaWrap" class="caja-wrap" hidden><label class="caja-lbl"><input type="checkbox" id="pCajaCerrada" onchange="pintarCajaCerrada\(\)">/.test(html) &&
    html.indexOf('id="pCajaWrap"') < html.indexOf('id="pVariantesSec"'));
  t('guardar escribe la marca', /if\(typeof datosCajaCerrada==='function'\)datosCajaCerrada\(data,editingId\);/.test(cuerpo(html, 'saveProduct')));
  t('el PDF del catálogo al público pone la caja a su precio', /const base=\(!mayorista&&typeof precioMostradorDe==='function'\)\?precioMostradorDe\(p\):Number\(p\.precio\|\|0\);/.test(cuerpo(html, 'exportCatalogoPDF')));

  console.log('\n-- en la tienda --');
  {
    const pb = new Function(cuerpo(app, '_precioBaseTienda') + '\nreturn _precioBaseTienda;')();
    t('la tienda lee la caja al precio mayorista', pb({ precio: 11500, precioMayorista: 9600, cajaCerrada: true }) === 9600);
    t('  y todo lo demás al de siempre', pb({ precio: 1000, precioMayorista: 800 }) === 1000 && pb({ precio: 5000, precioMayorista: 0, cajaCerrada: true }) === 5000 &&
      pb({ precio: 9000, precioMayorista: 7000, cajaCerrada: true, tipoVenta: 'peso' }) === 9000);
    t('se aplica al leer el catálogo, y queda la marca', app.indexOf("precio:_precioBaseTienda(r), cajaCerrada:r.cajaCerrada===true&&r.tipoVenta!=='peso'") > 0);
    t('el checkout compara con la misma regla (si no, diría que el precio cambió)',
      app.indexOf('const _pfFresco=precioFinal({precio:_precioBaseTienda(prod),') > 0 && app.indexOf('precioOriginal:_precioBaseTienda(prod)') > 0);
    t('el botón de la presentación lo dice', app.indexOf("(v.cajaCerrada?'<span class=\"gramaje-caja\">caja cerrada</span>':'')") > 0 &&
      leer('styles.min.css').indexOf('.gramaje-caja') >= 0 && leer('app.min.js').indexOf('_precioBaseTienda') >= 0);
  }

  console.log('\n-- revisión del 25/09: los pedidos --');
  {
    const w = armar();
    t('al convertir un pedido web, el precio de catálogo de una caja es el mayorista (no avisa "precio distinto")',
      w.ctx.precioCatalogoDeLinea({ id: 'alf12', cantidad: 1 }) === 9600);
    t('el pedido tomado en el panel cobra la caja cerrada al mayorista, como el mostrador',
      html.indexOf("pedItems.push({id:p.id,nombre:p.nombre,precio:(typeof precioMostradorDe==='function'?precioMostradorDe(p):p.precio),") > 0);
  }

  console.log('\n-- en el servidor --');
  /* Desde la revisión del 25/09 compara contra "ref": el producto, o la escala a la que
     se cobró un granel partido por bolsa. Una caja cerrada no es por peso: ref es ella. */
  t('descontarStockPedido compara la caja con el mayorista', /const base = \(ref\.cajaCerrada === true && ref\.tipoVenta !== 'peso' && Number\(ref\.precioMayorista \|\| 0\) > 0\)/.test(fun) &&
    /const ref = referenciaDe\(ids\[k\], itemPedido\) \|\| p;/.test(fun));

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + (e && e.stack || e)); process.exit(1); });
