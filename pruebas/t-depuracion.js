/**
 * DEPURACIÓN DE PRODUCTOS.
 *
 * LO QUE ESTA PRUEBA CUIDA, EN ORDEN DE GRAVEDAD
 *
 * 1. Que el depurado SIGA en allProducts para lo que busca datos: Importar
 *    Nuevos, el lector, Ganancia y el borrado de imágenes. Si faltara, se crean
 *    duplicados, se repiten códigos y se borran fotos, y nada de eso da error.
 * 2. Que una lectura de ventas fallida no se convierta en "nadie compró nada":
 *    el catálogo entero saldría para depurar.
 * 3. Que no se ofrezca depurar algo nuevo, con un pedido abierto o sacado a mano, ni
 *    algo que se vendió en el período: sin ventas es obligatorio.
 * 4. Que "Sin reposición" no invente: sin registro que cubra el período, no cuenta.
 * 5. Que desaparezca de las pantallas donde se elige un producto, y de la tienda.
 */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const src = leer('admin-depuracion.js');
const html = leer('admin.html');
const app = leer('app.js');

/* Se corta antes de la parte de pantalla: esa necesita DOM y Firestore. */
const soloLogica = src.slice(0, src.indexOf('/* ======================== LA CARGA'));
const M = new Function(soloLogica + `;return {
  evaluar: depEvaluar, ultimas: depUltimasVentas, abiertos: depPedidosAbiertos,
  motivo: depMotivo, fecha: depFecha };`)();

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

const AHORA = new Date('2026-09-14T12:00:00');
const hace = d => new Date(AHORA.getTime() - d * 86400000);
const prod = (id, extra) => Object.assign({ id: id, nombre: 'P ' + id, stock: 0 }, extra || {});
const evaluar = (productos, datos, dias) => M.evaluar(productos,
  Object.assign({ ultimasVentas: new Map(), pedidosAbiertos: new Set() }, datos || {}),
  { dias: dias || 90, ahora: AHORA });
const ids = filas => filas.map(f => (f.producto || f).id).sort().join(',');

/* ================================================================ CRITERIOS */
console.log('\n-- los criterios --');
{
  const r = evaluar([prod('a'), prod('b', { stock: 5 })]);
  t('sin ventas y sin stock: es candidato', ids(r.candidatos) === 'a');
  t('sin ventas pero con stock, y sin registro de reposición: no llega a 2', r.candidatos.length === 1);
  t('sin registro, "Sin reposición" dice sin datos', r.candidatos[0].criterios.sinReposicion === 'sinDatos');
  t('  y la pantalla se entera', r.reposicionConDatos === false);
}
{
  const ventas = M.ultimas([{ fecha: hace(10), items: [{ id: 'a' }] }, { fecha: hace(50), items: [{ id: 'b' }] }]);
  const r30 = evaluar([prod('a'), prod('b')], { ultimasVentas: ventas }, 30);
  const r90 = evaluar([prod('a'), prod('b')], { ultimasVentas: ventas }, 90);
  t('vendido hace 50 días: mirando 30 es candidato', ids(r30.candidatos) === 'b');
  t('vendido hace 50 días: mirando 90 no', ids(r90.candidatos) === '');
  t('muestra la última venta de verdad', r30.candidatos[0].ultimaVenta.getTime() === hace(50).getTime());
}
{
  const v = M.ultimas([{ fecha: hace(80), items: [{ id: 'a' }] }, { fecha: hace(5), items: [{ id: 'a' }] }]);
  t('de varias ventas se queda con la más nueva', v.get('a').getTime() === hace(5).getTime());
}
t('el stock negativo cuenta como sin stock', evaluar([prod('a', { stock: -3 })]).candidatos.length === 1);
{
  /* Se vendió ayer y se quedó sin stock: sin stock y sin reposición suman 2, pero se está vendiendo. */
  const r = evaluar([prod('a', { stock: 0 })],
    { ultimasVentas: M.ultimas([{ fecha: hace(1), items: [{ id: 'a' }] }]), registroStockDesde: hace(120) }, 90);
  t('sin stock y sin reposición pero vendido ayer: no es candidato, sin ventas es obligatorio',
    r.candidatos.length === 0 && r.nuevos.length === 0 && r.familiaActiva.length === 0);
}

/* =============================================================== REPOSICION */
console.log('\n-- sin reposición: no inventa --');
{
  const r = evaluar([prod('a', { stock: 8 }), prod('b', { stock: 8, stockSubioEn: hace(20) }),
                     prod('c', { stock: 8, stockSubioEn: hace(100) })], { registroStockDesde: hace(120) }, 90);
  t('con registro de 120 días y sin subida en 90: cuenta', ids(r.candidatos) === 'a,c');
  t('si el stock subió hace 20 días, no es candidato', !r.candidatos.some(f => f.producto.id === 'b'));
  const corto = evaluar([prod('a', { stock: 8 })], { registroStockDesde: hace(30) }, 90);
  t('un registro de 30 días no alcanza para mirar 90', corto.candidatos.length === 0 && corto.reposicionConDatos === false);
  const subio = evaluar([prod('a', { stockSubioEn: hace(5) })], { registroStockDesde: hace(10) }, 90);
  t('que SÍ subió se sabe aunque el registro sea corto', subio.candidatos[0].criterios.sinReposicion === 'no');
}

/* ======================================================= LOS QUE NO SE OFRECEN */
console.log('\n-- los que no se ofrecen --');
{
  const r = evaluar([prod('nuevo', { creadoEn: hace(3) }), prod('ped'), prod('dep', { depurado: true }),
                     prod('ex', { excluidoDepuracion: true }), prod('viejo', { creadoEn: hace(400) })],
    { pedidosAbiertos: M.abiertos([{ estado: 'pendiente', items: [{ id: 'ped' }] }]) });
  t('uno dado de alta hace 3 días no se ofrece', r.nuevos.length === 1 && !r.candidatos.some(f => f.producto.id === 'nuevo'));
  t('uno con pedido abierto no se ofrece', r.conPedido.length === 1 && !r.candidatos.some(f => f.producto.id === 'ped'));
  t('un depurado va a su lista', ids(r.depurados) === 'dep');
  t('uno sacado a mano va a excluidos', ids(r.excluidos) === 'ex');
  t('uno viejo sí se ofrece', ids(r.candidatos) === 'viejo');
}
{
  const ab = M.abiertos([{ estado: 'entregado', items: [{ id: 'a' }] }, { estado: 'cancelado', items: [{ id: 'b' }] },
                         { estado: 'listo', items: [{ id: 'c' }] }, { estado: 'confirmado', items: [{ id: 'd' }] }]);
  t('entregado y cancelado no frenan', !ab.has('a') && !ab.has('b'));
  t('cualquier otro estado frena, aunque sea uno que no se conocía', ab.has('c') && ab.has('d'));
}
{
  /* Un granel no se vende directo: se vende en los envasados que salen de él. */
  const ventas = M.ultimas([{ fecha: hace(4), items: [{ id: 'envasado' }] }, { fecha: hace(6), items: [{ id: 'pres' }] }]);
  const r = evaluar([prod('granel'), prod('envasado', { stock: 3, padreId: 'granel' }),
                     prod('principal'), prod('pres', { stock: 2, gramajePadreId: 'principal' }), prod('solo')],
    { ultimasVentas: ventas });
  t('un granel cuyos envasados se venden no se ofrece', !r.candidatos.some(f => f.producto.id === 'granel'));
  t('  ni un principal cuyas presentaciones se venden', !r.candidatos.some(f => f.producto.id === 'principal'));
  t('  y quedan contados, para decir por qué no están', ids(r.familiaActiva) === 'granel,principal');
  t('uno sin familia sí se ofrece', ids(r.candidatos) === 'solo');
  const viejas = M.ultimas([{ fecha: hace(200), items: [{ id: 'envasado' }] }]);
  t('si los envasados tampoco se venden, el granel sí se ofrece',
    evaluar([prod('granel'), prod('envasado', { stock: 3, padreId: 'granel' })], { ultimasVentas: viejas })
      .candidatos.some(f => f.producto.id === 'granel'));
}

{
  /* Los dos campos y todos los niveles. */
  const ventasF = M.ultimas([{ fecha: hace(3), items: [{ id: 'hijo2' }] }, { fecha: hace(2), items: [{ id: 'nieto' }] },
                             { fecha: hace(1), items: [{ id: 'ciclo1' }] }]);
  const rf = evaluar([prod('principalA'), prod('graneloB'), prod('hijo2', { stock: 1, gramajePadreId: 'principalA', padreId: 'graneloB' }),
                      prod('abuelo'), prod('padre2', { gramajePadreId: 'abuelo' }), prod('nieto', { stock: 1, padreId: 'padre2' }),
                      prod('ciclo1', { padreId: 'ciclo2' }), prod('ciclo2', { padreId: 'ciclo1' })],
    { ultimasVentas: ventasF });
  const frenados = ids(rf.familiaActiva).split(',');
  t('un producto con los dos campos frena a sus dos padres', frenados.indexOf('principalA') >= 0 && frenados.indexOf('graneloB') >= 0);
  t('la venta de un nieto frena al padre y también al abuelo', frenados.indexOf('padre2') >= 0 && frenados.indexOf('abuelo') >= 0);
  t('un ciclo mal cargado (A padre de B y B de A) no cuelga la cuenta', frenados.indexOf('ciclo2') >= 0);
}

/* ================================================== PRESENTACIONES Y MOTIVO */
console.log('\n-- presentaciones y motivo --');
{
  const r = evaluar([prod('padre'), prod('hijo', { stock: 4, gramajePadreId: 'padre' }),
                     prod('hijoDep', { gramajePadreId: 'padre', depurado: true })],
    { ultimasVentas: M.ultimas([{ fecha: hace(200), items: [{ id: 'hijo' }] }]) });
  const f = r.candidatos.find(x => x.producto.id === 'padre');
  t('el principal sabe que tiene una presentación activa', !!f && f.hijos.length === 1);
  const m = M.motivo(f, 90);
  t('el motivo guarda los criterios cumplidos', m.criterios.join(',') === 'sinVentas,sinStock');
  t('  y con cuántos días se miró', m.dias === 90);
}
t('lee fechas de Firestore, Date y texto', !!M.fecha({ toDate: () => AHORA }) && !!M.fecha(AHORA) &&
  !!M.fecha('2026-01-01') && M.fecha('nada') === null);

/* ============================================ UNA LECTURA FALLIDA NO ES CERO */
console.log('\n-- una lectura fallida no es "nadie compró nada" --');
const cargar = cuerpo(src, '_depLeer');
t('la carga de ventas no tiene un catch que devuelva vacío', cargar.length > 0 && !/catch\s*[({]/.test(cargar));
t('lee ventas y ventas mayoristas', /ventasDe\('ventas'\)/.test(cargar) && /ventasDe\('ventasMayoristas'\)/.test(cargar));
t('sin tope de fecha arriba: una venta mayorista de hoy se guarda a las 12:00', cargar.indexOf("'<='") < 0);
t('Recalcular relee también los productos', cuerpo(src, 'loadDepuracion').indexOf('if (forzar ||') > 0);
t('si falla, la pantalla no muestra candidatos',
  /if \(_depError \|\| !_depDatos\) \{[\s\S]{0,600}return;/.test(cuerpo(src, 'depuracionRender')));
const depurar = cuerpo(src, 'depurarSeleccionados');
t('antes de depurar relee cada producto de la base', /db\.collection\('productos'\)\.doc\(f\.producto\.id\)\.get\(\)/.test(depurar));
t('  y relee las ventas: releer solo el stock dejaba pasar una venta hecha con la lista abierta', /await _depLeer\(true\)/.test(depurar));
t('  y evalúa con el catálogo entero, para no perder presentaciones ni envasados', /depEvaluar\(todos, _depDatos/.test(depurar));
t('escribe en tandas de 450', /i \+= 450/.test(depurar) && /i \+= 450/.test(cuerpo(src, 'depuracionRestaurar')));
t('avisa si alguno todavía tiene stock', /todavía tiene/.test(depurar));
t('queda en el historial', /logAction\(/.test(depurar) && /logAction\(/.test(cuerpo(src, 'depuracionRestaurar')));
t('al entrar, si las ventas en memoria tienen más de 10 minutos, se releen', /10 \* 60000/.test(cuerpo(src, 'loadDepuracion')));
t('la barrida de clics no aprieta depurar ni restaurar', /depurarSeleccionados\|depuracionRestaurar/.test(leer('pruebas/barrida.js')));

/* ================================== EL DEPURADO SIGUE PARA BUSCAR DATOS */
console.log('\n-- el depurado sigue existiendo para buscar datos --');
[['admin.html', 'armarProductosDesdeFilas', 'Importar Nuevos: duplicados y códigos libres'],
 ['admin.html', 'gananciaDe', 'Ganancia'],
 ['admin.html', 'validarCodigoProducto', 'el control de códigos repetidos'],
 ['admin-archivos.js', 'borrarImagenesQueSobran', 'el borrado de imágenes que sobran'],
 ['admin-lector.js', 'buscarPorCodigo', 'el lector del mostrador'],
].forEach(([f, n, que]) => {
  const c = cuerpo(f === 'admin.html' ? html : leer(f), n);
  t(que + ' NO saca los depurados (' + n + ')', c.length > 0 && c.indexOf('depurado') < 0);
});

/* ============================== DESAPARECE DE DONDE SE ELIGE UN PRODUCTO */
console.log('\n-- desaparece de donde se elige un producto --');
['updateStats', 'renderTooltipPage', 'filterTable', 'renderGramajeSugerencias', 'renderPadreSugerencias',
 'renderStockList', 'renderRoundSelList', 'renderRoundSingle', 'calcRoundPreview', 'showPorClasificar', 'showSinCosto',
 'exportSinCostoExcel', 'openDescuentoModal', 'renderDscSelList', 'updateDscTargetInfo', 'aplicarDescuentoMasivo',
 'renderSelectionList', 'calcPricePreview', '_buscarProdVenta', 'filterPedProducts', 'exportCostosWithFormat',
 'exportCatalogoPDF', 'openMayoristaPdfModal', 'exportMayoristaPDF', 'gruposDuplicados', 'cleanDuplicates',
 'renderNoCatList', 'renderListasPanel', 'renderRlList', 'openMayoristaPctModal', 'aplicarMayoristaPct', 'renderCatManager',
].forEach(n => t(n, /depurado(!==|===)true/.test(cuerpo(html, n))));
[['admin-alertas.js', 'calcularAlertas'], ['admin-compras.js', 'compraBuscarProd'], ['admin-etiquetas.js', '_etqCandidatos'],
 ['admin-lector.js', 'renderAsignarCodigoLista'], ['admin-proveedores.js', '_provNoVendidos'], ['admin-proveedores.js', '_provResumen'],
].forEach(([f, n]) => t(n, /depurado !== true/.test(cuerpo(leer(f), n))));
t('el PDF semanal no ofrece ocultar lo que ya está depurado',
  /pdfNames\.has\(p\.nombre\)&&p\.oculto!==true&&p\.depurado!==true/.test(cuerpo(html, 'processWeeklyPdf')));
t('  y marca los depurados en los cambios de precio', /depurado:bdd\.depurado===true/.test(html) && /r\.depurado\?/.test(html));
t('marca los depurados entre los ocultos que volvieron al PDF', html.indexOf('depurado:p.depurado===true,oldCost') > 0);
t('  y al mostrarlos los restaura, para que se vean de verdad', cuerpo(html, 'wpApplyReappeared').indexOf('if(r.depurado){upd.depurado=false;') > 0);
t('al confirmar un pedido, lo ocultado o depurado con la pestaña abierta sale del carrito',
  app.indexOf('if(prod.oculto===true||prod.depurado===true){_noDisp.push(') > 0 && app.indexOf('if(_noDisp.length){') > 0);
t('la tienda los saca del catálogo', /\.filter\(p => !p\.oculto && !p\.depurado\)/.test(app));
t('  y lee el campo', /depurado:r\.depurado===true/.test(app));

/* ===================================== EL QUE TIENE EL PRODUCTO EN LA MANO */
console.log('\n-- quien tiene el producto en la mano --');
const compras = leer('admin-compras.js');
/* Va en _agregarItemVenta: addVentaItem y addVentaMayItem se reemplazan por ella, así
   que es la que de verdad corre al vender. */
const agregar = cuerpo(html, '_agregarItemVenta');
t('vender un depurado ofrece restaurarlo, minorista y mayorista', /if\(p && p\.depurado===true\)\{[\s\S]{0,200}depuracionOfrecerRestaurar\(p,'venderlo'\)/.test(agregar));
t('  y lo pregunta ANTES de pedir los gramos', agregar.indexOf("depuracionOfrecerRestaurar(p,'venderlo')") < agregar.indexOf('pedirCantidadPeso'));
t('  las originales ya no preguntan: se preguntaba dos veces', cuerpo(html, 'addVentaItem').indexOf('depurado') < 0 && cuerpo(html, 'addVentaMayItem').indexOf('depurado') < 0);
t('  y si además está oculto, pregunta eso primero: si no, quedaba restaurado sin venderse',
  agregar.indexOf("titulo:'Producto oculto'") > 0 && agregar.indexOf("titulo:'Producto oculto'") < agregar.indexOf("depuracionOfrecerRestaurar(p,'venderlo')"));
t('convertir un pedido web en venta ofrece restaurar los depurados', /_depEnPedido/.test(cuerpo(html, 'convertirPedidoEnVentaDesdeModal')));
t('escanearlo en una compra ofrece restaurarlo', /prod\.depurado === true/.test(cuerpo(compras, 'compraEscanear')));
{
  const esc = cuerpo(compras, 'compraEscanear');
  t('  pero primero mira el proveedor: si no, quedaba restaurado sin comprarse',
    esc.indexOf('no es de este proveedor') > 0 && esc.indexOf('no es de este proveedor') < esc.indexOf('prod.depurado === true'));
  const lec = leer('admin-lector.js');
  const iAbre = lec.indexOf('openModal(prod.id);');
  const iAviso = lec.indexOf('prod.depurado === true', iAbre);
  t('escanearlo fuera de una venta abre la ficha y avisa que está depurado', iAbre > 0 && iAviso > iAbre && iAviso - iAbre < 400);
}
t('Importar Nuevos avisa cuando lo que "ya existe" está depurado',
  html.indexOf('function importadosDepurados(r)') > 0 && cuerpo(html, 'avisosDeImportacion').indexOf('importadosDepurados(r)') > 0);
t('guardar una compra con depurados ofrece restaurarlos', /depEnCompra/.test(cuerpo(compras, 'guardarCompra')));
t('el remito avisa que trae un depurado', /depEnRemito/.test(cuerpo(compras, '_cpLeerRemito')));

/* ==================================================== LO QUE DICE LA PANTALLA */
console.log('\n-- lo que dice la pantalla --');
t('sin última venta dice "sin ventas en 90 días", no "hace más de 90"',
  src.indexOf('hace m&aacute;s de 90') < 0 && src.indexOf('sin ventas en 90 d&iacute;as') > 0);
t('sin candidatos, dice desde cuándo puede haber', cuerpo(src, 'depuracionRender').indexOf('se puede sugerir desde el') > 0);
t('el botón Recalcular dice que relee los productos', html.indexOf('title="Vuelve a leer los productos, las ventas y los pedidos"') > 0);

/* =============================================================== FECHA DE ALTA */
console.log('\n-- fecha de alta --');
t('el alta a mano guarda creadoEn',
  /\}else\{data\.creadoEn=new Date\(\);const _ref=await db\.collection\('productos'\)\.add\(data\)/.test(html));
t('las dos altas en tanda también', (html.match(/Object\.assign\(\{creadoEn:new Date\(\)\},p\)/g) || []).length === 2);

/* ==================================================== LA SECCION ENCHUFADA */
console.log('\n-- la sección está enchufada --');
t('item en el sidebar', html.indexOf("switchSection('depuracion')") > 0);
t('la sección existe', html.indexOf('id="sec-depuracion"') > 0);
t('switchSection la carga', html.indexOf("if(sec==='depuracion'&&typeof loadDepuracion==='function')loadDepuracion();") > 0);
t('loadProducts la refresca', /depuracionRefrescar\(\)/.test(cuerpo(html, 'loadProducts')));
t('el script se carga', html.indexOf('<script src="admin-depuracion.js"></script>') > 0);
t('el modal de excluidos existe', html.indexOf('id="depExcluidosModal"') > 0);
t('la paginación conoce sus dos tablas', /type === 'depCand' \|\| type === 'depDep'/.test(leer('admin-pagination.js')));

/* ========================================================== LOS FILTROS (25/11) */
console.log('\n-- los filtros --');
{
  const F = new Function(soloLogica + ';return { filtrar: depFiltrar, activo: depFiltroActivo };')();
  const ps = [
    prod('a', { nombre: 'AVENA ARROLLADA x 1 Kg', codigo: '000101', categoria: 'Cereales', subcategoria: 'Avenas', lista: 'L1' }),
    prod('b', { nombre: 'Azúcar mascabo', nombreMostrado: 'Azúcar Mascabo Orgánica', codigo: '000202', categoria: 'Endulzantes', lista: 'L2' }),
    prod('c', { nombre: 'Avena instantánea', codigo: '000303', categoria: 'Cereales', subcategoria: 'Copos', lista: 'L2' }),
  ];
  const nom = f => F.filtrar(ps, f).map(p => p.id).join(',');
  t('sin filtros pasan todos', nom({}) === 'a,b,c' && !F.activo({}) && !F.activo({ q: '   ' }));
  t('nombre sin tildes ni mayúsculas', nom({ q: 'azucar' }) === 'b' && nom({ q: 'INSTANTANEA' }) === 'c');
  t('nombre palabra por palabra, en cualquier orden', nom({ q: 'kg avena' }) === 'a');
  t('busca también en el nombre mostrado', nom({ q: 'organica' }) === 'b');
  t('busca por código', nom({ q: '000303' }) === 'c');
  t('categoría', nom({ cat: 'Cereales' }) === 'a,c' && F.activo({ cat: 'Cereales' }));
  t('subcategoría con categoría', nom({ cat: 'Cereales', sub: 'Copos' }) === 'c');
  t('subcategoría sin categoría no cuenta', nom({ sub: 'Copos' }) === 'a,b,c');
  t('proveedor', nom({ lista: 'L2' }) === 'b,c' && F.activo({ lista: 'L2' }));
  t('todos juntos', nom({ q: 'avena', cat: 'Cereales', lista: 'L2' }) === 'c');
  t('sin coincidencias, vacío', nom({ q: 'zzz' }) === '');
}
{
  /* La pantalla de verdad, con un DOM mínimo: lo que se ve, "Elegir todos" y la selección. */
  const els = {};
  const el = id => (els[id] = els[id] || { id: id, innerHTML: '', value: '', disabled: false, textContent: '', classList: { contains: () => true } });
  ['depFiltros', 'depPeriodo', 'depContenido', 'depExcluidosN'].forEach(el);
  const doc = { getElementById: id => (id in els ? els[id] : null) };
  const S = new Function('document', 'localStorage', 'allProducts', 'listasData',
    src + `;_depDatos = { ultimasVentas: new Map(), pedidosAbiertos: new Set(), registroStockDesde: null, ventasLeidas: 5, leidoEn: new Date() };
    return { render: depuracionRender, filtrar: depuracionFiltrar, quitar: depuracionQuitarFiltros, todos: depuracionMarcarTodos,
      cambioCat: depuracionCambioCat, sel: _depSelCand, selDep: _depSelDep, vista: () => _depVista, f: _depF };`);
  const viejo = new Date('2026-01-01');
  const cat = [
    prod('a', { nombre: 'Avena gruesa', categoria: 'Cereales', lista: 'L1', creadoEn: viejo }),
    prod('b', { nombre: 'Avena fina', categoria: 'Cereales', lista: 'L2', creadoEn: viejo }),
    prod('c', { nombre: 'Miel', categoria: 'Endulzantes', lista: 'L2', creadoEn: viejo }),
    prod('d', { nombre: 'Avena depurada', categoria: 'Cereales', lista: 'L1', creadoEn: viejo, depurado: true }),
    prod('e', { nombre: 'Miel depurada', categoria: 'Endulzantes', lista: 'L2', creadoEn: viejo, depurado: true }),
  ];
  const P = S(doc, { getItem: () => null, setItem: () => {} }, cat, [{ id: 'L1', nombre: 'Prov Uno' }, { id: 'L2', nombre: 'Prov Dos' }]);
  P.render();
  t('la barra de filtros se dibuja en su lugar, fuera de depContenido',
    /id="depQ"/.test(els.depFiltros.innerHTML) && !/id="depQ"/.test(els.depContenido.innerHTML));
  t('  con las categorías y los proveedores', /Endulzantes/.test(els.depFiltros.innerHTML) && /Prov Dos/.test(els.depFiltros.innerHTML));
  t('sin filtros se ven los 3 candidatos y los 2 depurados', P.vista().cand.length === 3 && P.vista().dep.length === 2);
  P.todos('cand', true);
  t('Elegir todos sin filtros elige los 3', P.sel.size === 3);
  /* Con algo escrito: los elegidos que quedan escondidos se sueltan. */
  els.depQ = { value: 'avena' }; els.depCat = { value: '' }; els.depSub = { value: '' }; els.depLista = { value: '' };
  P.filtrar();
  t('con "avena" se ven 2 candidatos y 1 depurado', P.vista().cand.map(f => f.producto.id).sort().join(',') === 'a,b' &&
    P.vista().dep.map(p => p.id).join(',') === 'd');
  t('  y la selección se queda con lo que se ve (no se depura algo escondido)', [...P.sel].sort().join(',') === 'a,b');
  t('  dice cuántos se ven de cuántos', /se ven 2 de 3 candidatos y 1 de 2 depurados/.test(els.depContenido.innerHTML));
  t('  y ofrece quitar los filtros', /depuracionQuitarFiltros\(\)/.test(els.depContenido.innerHTML));
  t('  "Elegir todos" dice 2', /Elegir todos \(2\)/.test(els.depContenido.innerHTML));
  P.todos('cand', false); P.todos('cand', true);
  t('Elegir todos con filtro elige solo los que se ven', [...P.sel].sort().join(',') === 'a,b');
  els.depLista.value = 'L2';
  P.filtrar();
  t('con "avena" y Prov Dos, solo b', P.vista().cand.map(f => f.producto.id).join(',') === 'b' && P.vista().dep.length === 0);
  t('  sin depurados que coincidan lo dice', /Ning&uacute;n depurado coincide con los filtros/.test(els.depContenido.innerHTML));
  els.depQ.value = 'zzz';
  P.filtrar();
  t('sin candidatos que coincidan lo dice (no "No hay productos para depurar")',
    /Ning&uacute;n candidato coincide/.test(els.depContenido.innerHTML) && !/No hay productos para depurar/.test(els.depContenido.innerHTML));
  t('  y la selección queda vacía', P.sel.size === 0);
  P.todos('dep', true);
  t('  Elegir todos en depurados no elige nada escondido', P.selDep.size === 0);
  delete els.depQ; delete els.depCat; delete els.depSub; delete els.depLista;
  P.quitar();
  t('Quitar filtros vuelve a todo', P.vista().cand.length === 3 && P.vista().dep.length === 2 &&
    !P.f.q && !P.f.lista && !/se ven \d+ de/.test(els.depContenido.innerHTML));
  t('las cuentas de arriba no cambian con los filtros', /Candidatos<\/div><div class="stat-value">3/.test(els.depContenido.innerHTML));
}
t('la barra va entre la de arriba y el contenido', html.indexOf('<div id="depFiltros"></div><div id="depContenido"></div>') > 0);

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
