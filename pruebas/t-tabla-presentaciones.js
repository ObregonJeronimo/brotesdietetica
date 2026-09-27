/**
 * LA TABLA DE PRODUCTOS: UN PRODUCTO CON PRESENTACIONES ES UNA FILA.
 *
 * Pedido del comercio (25/09/2026): buscando "Mani RC" salían dos filas, la de 80 g y la
 * de 160 g, como si fueran dos productos. Ahora es una fila, la del principal, con
 * "2 presentaciones" al lado del nombre; ese botón (o el de las capas) despliega cada
 * tamaño con su código, precio y stock, y "Editar presentaciones" abre el formulario en
 * la tabla de tamaños. Buscando "160" aparece el producto con esa presentación marcada.
 *
 * Corre admin-variantes.js de verdad, con una tabla y un document de mentira.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const SRC = leer('admin-variantes.js');
const html = leer('admin.html');

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + extra + ']' : '')); }
};

const P = (id, extra) => Object.assign({ id, nombre: id, codigo: id.toUpperCase(), precio: 1000, precioMayorista: 900, stock: 5, tipoVenta: 'unidad' }, extra || {});
function catalogo() {
  return [
    P('alf1', { nombre: 'Alfajor', gramaje: 'x1', precio: 960 }),
    P('alf12', { nombre: 'Alfajor x12', gramaje: 'x12', precio: 9600, precioMayorista: 7800, cajaCerrada: true, gramajePadreId: 'alf1' }),
    P('m80', { nombre: 'Mani RC', nombreMostrado: 'Mani recubierto de chocolate', gramaje: '80 g', codigo: '000122', precio: 1750, stock: 3 }),
    P('m160', { nombre: 'Mani RC x 160 g', gramaje: '160 g', codigo: '000123', precio: 1575, stock: 1, gramajePadreId: 'm80' }),
    P('m320', { nombre: 'Mani RC x 320 g', gramaje: '320 g', codigo: '000124', precio: 3000, stock: 0, oculto: true, gramajePadreId: 'm80' }),
    P('mdep', { nombre: 'Mani RC x 1 kg', gramaje: '1 kg', depurado: true, gramajePadreId: 'm80' }),
    P('y1', { nombre: 'Yerba x 1 kg', gramaje: '1 kg', tipoVenta: 'peso', precio: 9600, stock: 400 }),
    P('y3', { nombre: 'Yerba x 3 kg', gramaje: '3 kg', tipoVenta: 'peso', precio: 8800, stock: 0, gramajePadreId: 'y1' }),
    P('nuez', { nombre: 'Nuez', precio: 25330, stock: 13 }),
    P('chia', { nombre: 'Chía', gramaje: '500 g', depurado: true }),
    P('chia1', { nombre: 'Chía x 1 kg', gramaje: '1 kg', gramajePadreId: 'chia' }),
  ];
}

function armar(opts) {
  const o = opts || {};
  const campos = {};
  const campo = id => (campos[id] = campos[id] || { id, value: '', style: {}, classList: { cls: new Set(), add(c) { this.cls.add(c); }, remove(c) { this.cls.delete(c); }, contains(c) { return this.cls.has(c); } },
    scrollIntoView() { this.scrolleado = true; } });
  ['searchInput', 'filterCat', 'filterLista', 'filterVisibilidad', 'pVariantesSec'].forEach(campo);
  const dibujados = [], llamadas = [], timers = [];
  const ctx = {
    console, Math, Number, String, Object, Array, Set, Map, Promise, Infinity,
    setTimeout: (fn, ms) => { timers.push(fn); return timers.length; },
    window: {},
    document: { getElementById: id => campos[id] || null, querySelector: () => null, querySelectorAll: () => [] },
    allProducts: o.productos || catalogo(),
    esc: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    _attrHtml: s => String(s).replace(/"/g, '&quot;'),
    esStockBajo: p => Number(p.stock || 0) > 0 && Number(p.stock || 0) <= 2,
    stockTexto: p => (p.tipoVenta === 'peso' ? p.stock + ' g' : p.stock + ' u'),
    /* La tabla de verdad es de admin.html (con su paginado): acá se anota lo que le llega. */
    renderTable: lista => dibujados.push(lista),
    filterTable: () => llamadas.push('filterTable'),
    editProduct: id => llamadas.push('editProduct:' + id),
    openModal: id => llamadas.push('openModal:' + id),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  const correrTimers = () => { while (timers.length) timers.shift()(); };
  return { ctx, campos, dibujados, llamadas, correrTimers };
}
/* Lo que le pasa filterTable a la tabla: sin los depurados, en el orden que le toca. */
const filtrados = (w, ids) => ids.map(id => w.ctx.allProducts.find(p => p.id === id));
const ids = lista => lista.map(p => p.id + (p.__grupo ? '(' + p.__grupo.miembros.map(m => m.id).join('+') + ')' : '')).join(' ');

(async () => {
  console.log('\n-- una fila por producto --');
  {
    const w = armar();
    const todos = w.ctx.allProducts.filter(p => p.depurado !== true);
    const g = w.ctx.agruparParaTabla(todos);
    t('cada grupo es UNA fila, la de su principal, con sus tamaños adentro', ids(g) === 'alf1(alf1+alf12) m80(m80+m160+m320) y1(y1+y3) nuez chia1', ids(g));
    t('  el oculto está en el grupo (marcado en el panel), el depurado no', g[1].__grupo.miembros.some(m => m.id === 'm320') && !g[1].__grupo.miembros.some(m => m.id === 'mdep'));
    t('  con el principal depurado, la variante va sola (como en la tienda)', g[4].id === 'chia1' && !g[4].__grupo);
    t('  la fila es una copia del principal: el catálogo no se toca', !w.ctx.allProducts.find(p => p.id === 'm80').__grupo);
  }
  {
    const w = armar();
    const g = w.ctx.agruparParaTabla(filtrados(w, ['m160']));
    t('buscando "160" aparece el producto, con esa presentación como la que coincide', ids(g) === 'm80(m80+m160+m320)' &&
      g[0].__grupo.coinciden.join() === 'm160' && g[0].__grupo.soloOtros === true);
    const g2 = w.ctx.agruparParaTabla(filtrados(w, ['m80', 'm160']));
    t('  buscando "mani rc" (coinciden todos, el principal también): no se abre solo', g2[0].__grupo.soloOtros === false && g2.length === 1);
  }
  {
    const w = armar();
    const g = w.ctx.agruparParaTabla(filtrados(w, ['m160', 'alf1', 'alf12', 'm80', 'nuez']));
    t('con otro orden (por precio), el grupo va donde va su principal', ids(g) === 'alf1(alf1+alf12) m80(m80+m160+m320) nuez', ids(g));
    const g2 = w.ctx.agruparParaTabla(filtrados(w, ['nuez', 'm160']));
    t('  si el principal no pasó los filtros, donde está el primero que pasó', ids(g2) === 'nuez m80(m80+m160+m320)' && g2[1].__grupo.soloOtros === true);
  }

  console.log('\n-- el botón y el panel --');
  {
    const w = armar();
    const [alf, mani, yerba] = w.ctx.agruparParaTabla(w.ctx.allProducts.filter(p => p.depurado !== true));
    const cm = w.ctx.chipPresentacionesHtml(mani);
    t('al lado del nombre: "3 presentaciones", cerrado', cm.indexOf('>3 presentaciones <i class="bi bi-chevron-down">') > 0 &&
      cm.indexOf("togglePresentacionesTabla('m80')") > 0 && cm.indexOf('abierto') < 0, cm);
    t('  un granel con bolsas dice "2 bolsas"', w.ctx.chipPresentacionesHtml(yerba).indexOf('>2 bolsas ') > 0);
    t('  un producto sin grupo, nada', w.ctx.chipPresentacionesHtml(w.ctx.allProducts.find(p => p.id === 'nuez')) === '');
    t('cerrado, el panel no se dibuja', w.ctx.panelPresentacionesHtml(mani) === '');
    w.ctx.togglePresentacionesTabla('m80');
    t('tocarlo lo abre y redibuja la tabla (la página no cambia)', w.ctx._gruposAbiertos.has('m80') && w.llamadas.join() === 'filterTable');
    const h = w.ctx.panelPresentacionesHtml(mani);
    t('  abierto: cada tamaño, con su código, su precio y su stock', h.indexOf('<b>80 g</b><span class="var-tabla-chip">principal</span>') > 0 &&
      h.indexOf('<b>160 g</b>') > 0 && h.indexOf('000123') > 0 && h.indexOf('<b>$1.575</b>') > 0 && h.indexOf('stock-badge stock-low">1 u') > 0, h);
    t('  el oculto se ve, marcado, y el sin stock en rojo', h.indexOf('<b>320 g</b><span class="var-tabla-chip oculto">oculto</span>') > 0 &&
      h.indexOf('stock-badge stock-out">0 u') > 0);
    t('  con el nombre de la tabla (el interno), no el público', h.indexOf('<b>3 presentaciones</b> de Mani RC</span>') > 0);
    t('  "Editar presentaciones", "Asociar uno existente" y la ficha de cada uno', h.indexOf("editarPresentaciones('m80')\"><i class=\"bi bi-pencil\"></i> Editar presentaciones") > 0 &&
      h.indexOf("openGramajeModal('m80')") > 0 && h.indexOf("editProduct('m160')") > 0 && h.indexOf('colspan="10"') > 0);
    w.ctx.togglePresentacionesTabla('m80');
    t('  tocarlo de nuevo lo cierra', !w.ctx._grupoAbierto(mani) && w.ctx.panelPresentacionesHtml(mani) === '');
    w.ctx._gruposAbiertos.add('alf1');
    const ha = w.ctx.panelPresentacionesHtml(alf);
    t('la caja cerrada dice lo que se cobra (el mayorista) y el precio de lista', ha.indexOf('<b>$7.800</b> <small>caja cerrada · lista $9.600</small>') > 0 &&
      ha.indexOf('var-tabla-chip caja') > 0);
    w.ctx._gruposAbiertos.add('y1');
    const hy = w.ctx.panelPresentacionesHtml(yerba);
    t('las bolsas de granel: el precio el kilo y "Editar bolsas"', hy.indexOf('<b>$8.800</b> <small>el kilo</small>') > 0 && hy.indexOf('> Editar bolsas</button>') > 0 &&
      hy.indexOf('<b>2 bolsas</b> de Yerba') > 0);
  }
  {
    /* La columna "Costo" (pedido del dueño, 27/09): en una bolsa, lo que costó la bolsa y
       abajo el kilo; tocarla abre la ventana de costos con todas las del producto. */
    const w = armar();
    const busca = id => w.ctx.allProducts.find(p => p.id === id);
    busca('y1').costo = 5000; busca('y3').costo = 4500; busca('m160').costo = 800;
    const [, mani, yerba] = w.ctx.agruparParaTabla(w.ctx.allProducts.filter(p => p.depurado !== true));
    w.ctx._gruposAbiertos.add('y1');
    w.ctx._gruposAbiertos.add('m80');
    const hy = w.ctx.panelPresentacionesHtml(yerba), hm = w.ctx.panelPresentacionesHtml(mani);
    t('la columna Costo, entre el código y el precio', hy.indexOf('<th>Código</th><th>Costo</th><th>Precio</th>') > 0 &&
      hm.indexOf('<th>Código</th><th>Costo</th><th>Precio</th>') > 0);
    t('  en las bolsas, al pie, el "?" del redondeo (se abre hacia arriba), que dice primero que NO se pierde dinero',
      hy.indexOf('</tbody></table><p class="ayuda-linea"><span class="ayuda-tip der ancho" tabindex="0"') > 0 &&
      hy.indexOf('data-tip="NO SE PIERDE DINERO. Es solo un redondeo') > 0 && hm.indexOf('NO SE PIERDE DINERO') < 0);
    t('  la bolsa de 3 kg: lo que costó la bolsa ($13.500) y abajo el kilo', hy.indexOf('<b>$13.500</b> <small>la bolsa</small>') > 0 &&
      hy.indexOf('<small>$4.500 el kilo</small>') > 0, hy);
    t('  la de 1 kg, sin repetir el kilo', hy.indexOf('<b>$5.000</b> <small>la bolsa</small>') > 0 && hy.indexOf('$5.000 el kilo') < 0);
    t('  una presentación por unidad, su costo; sin costo cargado, lo dice', hm.indexOf('<b>$800</b>') > 0 && hm.indexOf('Sin costo') > 0);
    t('  tocarla abre la ventana de costos de ese producto, en esa bolsa', hy.indexOf("cambiarCostosDeGrupo('y1', 'y3')") > 0);
    const abiertos = [];
    w.ctx.abrirEditorCostos = (filas, c, foco) => abiertos.push({ ids: filas.map(f => f.producto.id).join(), c, foco });
    w.ctx.cambiarCostosDeGrupo('y1', 'y3');
    t('  con todas las bolsas, desde Productos, y el foco en la que se tocó', abiertos.length === 1 && abiertos[0].ids === 'y1,y3' &&
      abiertos[0].c === 'prod' && abiertos[0].foco === 'y3', JSON.stringify(abiertos));
    t('  gramosDeBolsa: la de 3 kg sí; un granel suelto (sin otras bolsas) o una presentación por unidad, no', w.ctx.gramosDeBolsa(busca('y3')) === 3000 &&
      w.ctx.gramosDeBolsa({ id: 'suelto', tipoVenta: 'peso', gramaje: '1 kg' }) === null && w.ctx.gramosDeBolsa(busca('m160')) === null);
  }
  {
    /* Revisión del 27/09, #12: la columna y la ventana hacen la misma cuenta. */
    const w = armar();
    const busca = id => w.ctx.allProducts.find(p => p.id === id);
    busca('y1').costo = 5000; busca('y3').costo = 666.67;
    const [, , yerba] = w.ctx.agruparParaTabla(w.ctx.allProducts.filter(p => p.depurado !== true));
    w.ctx._gruposAbiertos.add('y1');
    const hy = w.ctx.panelPresentacionesHtml(yerba);
    t('con el kilo con centavos (de una compra, $666,67), la columna dice $2.000 la bolsa, como la ventana',
      hy.indexOf('<b>$2.000</b> <small>la bolsa</small>') > 0 && w.ctx.costoDeBolsa(666.67, 3000) === 2000 && w.ctx.kiloDeBolsa(2000, 3000) === 667, hy);
    t('  700 g a $1.285: $900 en los dos lados (antes, $900 en la tabla y $899 en la ventana)', w.ctx.costoDeBolsa(1285, 700) === 900);
  }
  {
    const w = armar();
    const [mani] = w.ctx.agruparParaTabla(filtrados(w, ['m160']));
    const h = w.ctx.panelPresentacionesHtml(mani);
    t('buscando "160" el panel se abre solo, con la de 160 g marcada', h.indexOf('<tr class="coincide"><td class="var-tabla-tam"><b>160 g</b>') > 0 &&
      (h.match(/class="coincide"/g) || []).length === 1);
    t('  y el botón lo muestra abierto', w.ctx.chipPresentacionesHtml(mani).indexOf('var-chip abierto') > 0);
    w.ctx.togglePresentacionesTabla('m80');
    t('  cerrarlo a mano lo cierra aunque la búsqueda lo abra sola', w.ctx.panelPresentacionesHtml(mani) === '');
  }

  console.log('\n-- con la tabla de admin.html --');
  {
    const w = armar();
    w.ctx.renderTable(w.ctx.allProducts.filter(p => p.depurado !== true));
    t('la tabla (y su paginado) recibe los grupos: una página son 20 productos, no 20 tamaños', ids(w.dibujados[0]) === 'alf1(alf1+alf12) m80(m80+m160+m320) y1(y1+y3) nuez chia1');
    w.ctx._gruposAbiertos.add('m80'); w.ctx._gruposCerrados.add('y1');
    w.ctx.renderTable([]);
    t('  cambiar de página o guardar (la misma búsqueda) no toca lo abierto', w.ctx._gruposAbiertos.has('m80') && w.ctx._gruposCerrados.has('y1'));
    w.campos.searchInput.value = 'almendra';
    w.ctx.renderTable([]);
    t('  otra búsqueda arranca limpia', w.ctx._gruposAbiertos.size === 0 && w.ctx._gruposCerrados.size === 0);
  }
  {
    const w = armar();
    w.ctx.editarPresentaciones('m80');
    t('"Editar presentaciones" abre la ficha del principal', w.llamadas.join() === 'editProduct:m80');
    w.correrTimers();
    t('  y va a la tabla de tamaños, resaltada un momento', w.campos.pVariantesSec.scrolleado === true && !w.campos.pVariantesSec.classList.contains('resaltar'));
  }
  t('la fila de admin.html: el botón al lado del nombre, las capas abren el panel, y el panel debajo',
    html.indexOf("+hiddenTag+(p.__grupo&&typeof chipPresentacionesHtml==='function'?chipPresentacionesHtml(p):'')+'</td>") > 0 &&
    html.indexOf("(p.__grupo?'<button class=\"btn-icon\" onclick=\"togglePresentacionesTabla(") > 0 &&
    html.indexOf("</div></td></tr>'+(p.__grupo&&typeof panelPresentacionesHtml==='function'?panelPresentacionesHtml(p):'');") > 0);
  t('  sin grupo, las capas siguen abriendo "Asociar gramajes"', html.indexOf("title=\"Asociar gramajes\"><i class=\"bi bi-stack\"></i></button>") > 0);

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + (e && e.stack || e)); process.exit(1); });
