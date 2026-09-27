/**
 * INICIO DEL DÍA (pedido del comercio, 26/09/2026, experimental).
 *
 * La sección que se ve primero al entrar al panel: cómo fue ayer, lo que se vende y
 * está sin stock, los costos viejos de lo que se vende y lo que se está por terminar.
 *
 * Corre admin-inicio.js de verdad, con las cuentas reales de admin.html (hoyAR,
 * netoVenta, _precioCobradoItem...), admin-costos.js (qué es un costo viejo),
 * admin-variantes.js y admin-escalas.js (las bolsas de un granel), sobre un catálogo y
 * ventas de mentira.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const html = leer('admin.html');

function cuerpo(src, n) {
  const i = src.indexOf('function ' + n + '(');
  if (i < 0) throw new Error('falta ' + n);
  let b = src.indexOf('{', i), prof = 0, k;
  for (k = b; k < src.length; k++) { if (src[k] === '{') prof++; else if (src[k] === '}') { prof--; if (!prof) break; } }
  return src.slice(i, k + 1);
}

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + JSON.stringify(extra) + ']' : '')); }
};

/* Todo relativo a hoy al mediodía: la sección usa la fecha de verdad. */
const DIA = 86400000;
const AHORA = new Date(); AHORA.setHours(12, 0, 0, 0);
const hace = (dias, h) => { const d = new Date(AHORA.getTime() - dias * DIA); if (h != null) d.setHours(h, 0, 0, 0); return d; };
const diaDe = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function catalogo() {
  return [
    { id: 'alf', nombre: 'Alfajor', tipoVenta: 'unidad', stock: 0, costo: 500, precio: 1000, costoActualizadoEn: hace(40) },
    { id: 'har', nombre: 'Harina Integral', tipoVenta: 'unidad', stock: -2, costo: 800, precio: 1500, costoActualizadoEn: hace(0) },
    { id: 'tri', nombre: 'Trigo', tipoVenta: 'unidad', stock: 0, costo: 700, precio: 1400, costoActualizadoEn: hace(50) },
    { id: 'ocu', nombre: 'Oculto', tipoVenta: 'unidad', stock: 0, oculto: true, costo: 100, precio: 200, costoActualizadoEn: hace(90) },
    { id: 'dep', nombre: 'Depurado', tipoVenta: 'unidad', stock: -5, depurado: true, costo: 100, precio: 200, costoActualizadoEn: hace(90) },
    /* Un granel con dos bolsas: la de 2 kg vacía, pero la de 1 kg tiene. */
    { id: 'm1', nombre: 'Maní', tipoVenta: 'peso', gramaje: '1 kg', stock: 3000, costo: 1000, precio: 2000, costoActualizadoEn: hace(10) },
    { id: 'm2', nombre: 'Maní x 2 kg', tipoVenta: 'peso', gramaje: '2 kg', gramajePadreId: 'm1', stock: 0, costo: 800, precio: 1600, costoActualizadoEn: hace(10) },
    /* Otro granel con las DOS bolsas vacías: ese no se puede vender. */
    { id: 'y1', nombre: 'Yerba', tipoVenta: 'peso', gramaje: '1 kg', stock: 0, costo: 3000, precio: 5000, costoActualizadoEn: hace(10) },
    { id: 'y3', nombre: 'Yerba x 3 kg', tipoVenta: 'peso', gramaje: '3 kg', gramajePadreId: 'y1', stock: -100, costo: 2500, precio: 4500, costoActualizadoEn: hace(10) },
    { id: 'gal', nombre: 'Galletas', tipoVenta: 'unidad', stock: 3, costo: 400, precio: 900, costoActualizadoEn: hace(31) },
    { id: 'alm', nombre: 'Almendra', tipoVenta: 'peso', stock: 5000, costo: 9000, precio: 15000, costoActualizadoEn: hace(60) },
    { id: 'sin', nombre: 'Sin Fecha', tipoVenta: 'unidad', stock: 10, costo: 300, precio: 600 },
    { id: 'nc', nombre: 'Sin Costo', tipoVenta: 'unidad', stock: 10, costo: 0, precio: 700 },
  ];
}

const it = (id, cantidad, precio, costo, tipoVenta) => {
  const peso = tipoVenta === 'peso';
  return { id, nombre: id, cantidad, precio, costo, descuento: 0, tipoVenta: tipoVenta || 'unidad',
    subtotal: peso ? Math.round(precio * cantidad / 1000) : precio * cantidad };
};
function ventas() {
  return [
    /* AYER: 2000 + 7000 + 1600 = 10.600 neto, en 3 ventas. */
    { docId: 'v1', fecha: hace(1, 10), items: [it('alf', 2, 1000, 500)], total: 2000, envio: 0 },
    { docId: 'v2', fecha: hace(1, 18), items: [it('alm', 500, 15000, 9000, 'peso')], total: 7000, envio: 0, descuentoMonto: 500 },
    { docId: 'v3', fecha: hace(1, 20), origen: 'web', pedidoId: 'p1', items: [it('nc', 1, 700, 0), it('gal', 1, 900, 400)], total: 1900, envio: 300 },
    /* El mismo día de la semana anterior: 8.000. */
    { docId: 'v4', fecha: hace(8, 12), items: [it('alf', 8, 1000, 500)], total: 8000, envio: 0 },
    /* El resto del mes. */
    { docId: 'v5', fecha: hace(3, 11), items: [it('alf', 1, 1000, 500), it('har', 1, 1500, 800)], total: 2500 },
    { docId: 'v6', fecha: hace(5, 11), items: [it('alf', 1, 1000, 500), it('har', 2, 1500, 800), it('gal', 14, 900, 400)], total: 16600 },
    { docId: 'v7', fecha: hace(12, 11), items: [it('alf', 1, 1000, 500), it('m2', 700, 1600, 800, 'peso'), it('m1', 300, 1600, 1000, 'peso'), it('gal', 15, 900, 400)], total: 16100 },
    { docId: 'v8', fecha: hace(20, 11), items: [it('y1', 500, 5000, 3000, 'peso'), it('y3', 500, 5000, 2500, 'peso'), it('sin', 1, 600, 300), it('alm', 500, 15000, 9000, 'peso')], total: 13600 },
  ];
}

/* Un panel de mentira. */
function armar(opts) {
  const o = opts || {};
  const el = extra => Object.assign({ innerHTML: '', dataset: {}, escuchas: {}, addEventListener(tp, fn) { this.escuchas[tp] = fn; } }, extra || {});
  const cuerpoIni = el();
  const seccion = el({ activa: o.visible !== false, classList: { contains: c => c === 'active' && seccion.activa } });
  const lecturas = [];
  const ctx = {
    /* El aviso de 'no se pudieron leer las ventas' es esperado en una prueba: no ensucia la salida. */
    console: { log: console.log, error: console.error, warn: () => {} },
    Math, Number, String, Object, Array, Set, Map, Promise, Infinity, parseInt, isFinite, Date, JSON,
    setTimeout: () => 0,
    allProducts: o.productos || catalogo(),
    esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    fmtPeso: g => (Math.abs(g) < 1000 ? g.toLocaleString('es-AR') + ' g' : (g / 1000).toLocaleString('es-AR', { maximumFractionDigits: 3 }) + ' kg'),
    document: { getElementById: id => (id === 'inicioBody' ? cuerpoIni : id === 'sec-inicio' ? seccion : null) },
    db: { collection: col => ({ where: (campo, op, desde) => ({ get: async () => {
      lecturas.push({ col, campo, op, desde });
      if (o.fallaVentas) throw new Error('sin conexión');
      const docs = (col === 'ventas' ? (o.ventas || ventas()) : []).filter(v => v.fecha >= desde);
      return { docs: docs.map(v => ({ id: v.docId, data: () => v })) };
    } }) }) },
    getCajaAbierta: async () => { lecturas.push({ col: 'caja' }); return o.caja || null; },
    actualizarBadgeAlertas: async () => 'campana',
    /* La de admin.html: la envuelve admin-inicio.js para repintar después de vender. */
    aplicarStockProductos: async () => 'aplicado',
    DESCONTAR_STOCK: o.descontar !== false,
    abiertos: [],
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(['hoyAR', 'esPorPeso', 'precioConDsc', 'subtotalItem', 'netoVenta', '_precioCobradoItem'].map(n => cuerpo(html, n)).join('\n'), ctx);
  vm.runInContext(leer('admin-costos.js'), ctx);
  vm.runInContext(leer('admin-variantes.js'), ctx);
  vm.runInContext(leer('admin-escalas.js'), ctx);
  vm.runInContext(leer('admin-inicio.js'), ctx);
  /* El editor de costos es DOM (admin-costos.js tiene su prueba): aca se mira con que se abre. */
  ctx.abrirEditorCostos = (filas, c) => ctx.abiertos.push({ filas, c });
  return { ctx, cuerpoIni, seccion, lecturas, run: code => vm.runInContext(code, ctx) };
}

(async () => {
/* ================================================= QUÉ SE VENDE */
console.log('\n-- qué se vende --');
{
  const { ctx } = armar();
  const v = ctx.vendidoPorProducto(ventas());
  t('cuenta las VENTAS en que aparece cada producto: el alfajor en 5', v.alf.veces === 5, v.alf);
  t('  y cuánto se llevó: 2 + 8 + 1 + 1 + 1 = 13 alfajores', v.alf.cantidad === 13);
  t('  cada bolsa de un granel por su lado: 1 venta cada una', v.m1.veces === 1 && v.m2.veces === 1);
  t('  y lo que no se vendió no está', !v.tri && !v.ocu);
}

/* ================================================= SIN STOCK */
console.log('\n-- lo que se vende y está sin stock --');
{
  const { ctx } = armar();
  const s = ctx.sinStockQueSeVende(ctx.allProducts, ctx.vendidoPorProducto(ventas()));
  const ids = s.lista.map(f => f.p.id);
  t('primero lo que más se vende: el alfajor (5 ventas)', ids[0] === 'alf', ids);
  t('el stock NEGATIVO no aparece (pedido del dueño, 26/09): la harina en -2 y la bolsa de yerba en -100',
    ids.indexOf('har') < 0 && ids.indexOf('y3') < 0);
  t('  un granel con TODAS las bolsas vacías no se puede vender: la bolsa de yerba en 0 sí', ids.indexOf('y1') > 0 && ids.length === 2, ids);
  t('una bolsa vacía con otra bolsa que tiene va aparte: se sigue vendiendo', s.bolsas.length === 1 && s.bolsas[0].p.id === 'm2' &&
    s.bolsas[0].otras[0].id === 'm1', s.bolsas.map(f => f.p.id));
  t('lo publicado sin stock que no se vendió solo se cuenta: el trigo', s.quietos === 1);
  t('ni los ocultos ni los depurados', ids.indexOf('ocu') < 0 && ids.indexOf('dep') < 0);
  const sinVentas = ctx.sinStockQueSeVende(ctx.allProducts, null);
  t('si no se pudieron leer las ventas, van todos los que están en 0 (no se esconde nada)', sinVentas.lista.length === 3 && sinVentas.quietos === 0,
    sinVentas.lista.map(f => f.p.id));
}

/* ================================================= COSTOS */
console.log('\n-- costos viejos de lo que se vende --');
{
  const { ctx } = armar();
  const c = ctx.costosParaRevisar(ctx.allProducts, ctx.vendidoPorProducto(ventas()), AHORA);
  t('más de un mes sin revisar, de lo que se vende, primero lo que más se vende', c.viejos.map(x => x.producto.id).join() === 'alf,gal,alm',
    c.viejos.map(x => x.producto.id));
  t('  con los días que tiene cada uno', c.viejos[0].dias === 40 && c.viejos[2].dias === 60);
  t('  el que no se vendió solo se cuenta aparte: el trigo', c.quietos === 1);
  t('sin fecha no se sabe: no avisa, se cuenta aparte (2 que se venden)', c.sinFecha === 2);
  t('los revisados hoy se cuentan: la harina', c.revisadosHoy === 1);
  t('  y el oculto con el costo viejo no aparece', c.viejos.every(x => x.producto.id !== 'ocu'));
  /* De a 10: con 14 viejos que se venden, la tanda son los 10 que más se venden. */
  const muchos = [];
  const vendido = {};
  for (let i = 0; i < 14; i++) {
    muchos.push({ id: 'p' + i, nombre: 'P' + i, stock: 5, costo: 100, precio: 200, costoActualizadoEn: hace(45) });
    vendido['p' + i] = { veces: i + 1, cantidad: i + 1, monto: 0 };
  }
  const c2 = ctx.costosParaRevisar(muchos, vendido, AHORA);
  t('de a 10: los 10 que más se venden, y quedan 4', c2.tanda.length === 10 && c2.tanda[0].producto.id === 'p13' &&
    c2.viejos.length === 14, c2.tanda.map(x => x.producto.id));
}
{
  /* Las bolsas y presentaciones de un producto, juntas (pedido del dueño, 26/09). */
  const prods = [
    { id: 'n1', nombre: 'Nuez', tipoVenta: 'peso', gramaje: '1 kg', stock: 3000, costo: 1000, precio: 2000, costoActualizadoEn: hace(60) },
    { id: 'n2', nombre: 'Nuez x 2 kg', tipoVenta: 'peso', gramaje: '2 kg', gramajePadreId: 'n1', stock: 2000, costo: 800, precio: 1600, costoActualizadoEn: hace(60) },
    { id: 'n5', nombre: 'Nuez x 5 kg', tipoVenta: 'peso', gramaje: '5 kg', gramajePadreId: 'n1', stock: 5000, costo: 700, precio: 1400, costoActualizadoEn: hace(5) },
    { id: 'c1', nombre: 'Cookie', tipoVenta: 'unidad', gramaje: 'x1', stock: 10, costo: 500, precio: 1000, costoActualizadoEn: hace(40) },
    { id: 'c12', nombre: 'Cookie x12', tipoVenta: 'unidad', gramaje: 'x12', gramajePadreId: 'c1', stock: 3, costo: 5500, precio: 9000, costoActualizadoEn: hace(45) },
    { id: 'gal', nombre: 'Galletas', tipoVenta: 'unidad', stock: 3, costo: 400, precio: 900, costoActualizadoEn: hace(35) },
  ];
  const vendido = { n1: { veces: 9, cantidad: 9000, monto: 0 }, gal: { veces: 5, cantidad: 5, monto: 0 }, c12: { veces: 1, cantidad: 1, monto: 0 } };
  const m = armar({ productos: prods });
  const c = m.ctx.costosParaRevisar(prods, vendido, AHORA);
  const ids = c.viejos.map(x => x.producto.id).join();
  t('bolsas juntas: la de 2 kg no se vendió sola, pero la nuez sí, así que aparece', ids.indexOf('n2') >= 0, ids);
  t('  la de 5 kg, revisada hace 5 días, no', ids.indexOf('n5') < 0);
  t('  la cookie suelta no se vendió, pero la caja x12 sí: aparece, y ninguna queda como "no se vendió"', ids.indexOf('c1') >= 0 && c.quietos === 0);
  t('  una abajo de la otra, de la más chica a la más grande; primero el producto que más se vende', ids === 'n1,n2,gal,c1,c12', ids);
  t('el nombre dice cuál es, con la forma de las otras bolsas: "Nuez x 1 kg" como "Nuez x 2 kg"; sin bolsas no se agrega nada',
    m.run('_costoNombre(allProducts[0]) + "|" + _costoNombre(allProducts[1]) + "|" + _costoNombre(allProducts[5])') === 'Nuez x 1 kg|Nuez x 2 kg|Galletas');
  t('  la cookie suelta y la caja: "Cookie x1" y "Cookie x12" (no "x x12")',
    m.run('_iniNombre(allProducts[3]) + "|" + _iniNombre(allProducts[4])') === 'Cookie x1|Cookie x12');
  const r = armar({ productos: prods, ventas: [
    { docId: 'w1', fecha: hace(2, 11), items: [it('n1', 1000, 2000, 1000, 'peso'), it('gal', 1, 900, 400)], total: 2900 },
    { docId: 'w2', fecha: hace(3, 11), items: [it('c12', 1, 9000, 5500)], total: 9000 },
  ] });
  r.run('_iniListo = true;');
  await r.ctx.refrescarInicio(false);
  const h = r.cuerpoIni.innerHTML, a = h.indexOf('Nuez x 1 kg'), b = h.indexOf('Nuez x 2 kg');
  t('  y en el aviso, una abajo de la otra', a > 0 && b > a && h.indexOf('Nuez x 5 kg') < 0, [a, b]);
}
{
  /* La tanda no corta un producto por la mitad. */
  const { ctx } = armar();
  const prods = [], vendido = {};
  for (let i = 0; i < 9; i++) {
    prods.push({ id: 'p' + i, nombre: 'P' + i, stock: 5, costo: 100, precio: 200, costoActualizadoEn: hace(45) });
    vendido['p' + i] = { veces: 20 - i, cantidad: 1, monto: 0 };
  }
  prods.push({ id: 'y1', nombre: 'Yerba', tipoVenta: 'peso', gramaje: '1 kg', stock: 5000, costo: 100, precio: 200, costoActualizadoEn: hace(45) },
    { id: 'y3', nombre: 'Yerba x 3 kg', tipoVenta: 'peso', gramaje: '3 kg', gramajePadreId: 'y1', stock: 5000, costo: 100, precio: 200, costoActualizadoEn: hace(45) });
  vendido.y1 = { veces: 2, cantidad: 1000, monto: 0 };
  const c = ctx.costosParaRevisar(prods, vendido, AHORA);
  t('la tanda no corta un producto: van 9, y las dos bolsas de la yerba juntas en la próxima', c.tanda.length === 9 &&
    c.viejos.length === 11 && c.viejos[9].producto.id === 'y1' && c.viejos[10].producto.id === 'y3', c.tanda.map(x => x.producto.id));
}

{
  /* Los otros avisos también dicen el tamaño (pedido del dueño, 26/09). */
  const m = armar();
  m.run('_iniListo = true;');
  await m.ctx.refrescarInicio(false);
  const h = m.cuerpoIni.innerHTML;
  t('sin stock: "Yerba x 1 kg" (la bolsa principal), y la bolsa vacía "Maní x 2 kg"', h.indexOf('<b>Yerba x 1 kg</b>') > 0 &&
    h.indexOf('<b>Maní x 2 kg</b>') > 0);
  t('  sin bolsas, el nombre de siempre', h.indexOf('<b>Alfajor</b>') > 0);
}

/* ================================================= POR TERMINARSE */
console.log('\n-- lo que se está por terminar --');
{
  const { ctx } = armar();
  const l = ctx.porTerminarse(ctx.allProducts, ctx.vendidoPorProducto(ventas()));
  t('galletas: 30 vendidas en el mes (1 por día) y quedan 3: alcanza para 3 días', l.length === 1 && l[0].p.id === 'gal' &&
    Math.round(l[0].dias) === 3, l.map(x => x.p.id + ':' + x.dias));
  t('  la almendra no: 1 kg por mes y quedan 5 kg', l.every(x => x.p.id !== 'alm'));
  t('  con una sola venta el ritmo no dice nada', l.every(x => x.p.id !== 'sin' && x.p.id !== 'm1'));
  t('sin ventas leídas no se adivina', ctx.porTerminarse(ctx.allProducts, null).length === 0);
}

/* ================================================= AYER */
console.log('\n-- cómo fue ayer --');
{
  const { ctx } = armar();
  const r = ctx.resumenDeAyer(ventas(), AHORA, ctx.allProducts);
  t('ayer: 3 ventas, $10.600 NETO (el envío de la web no es mercadería)', r.ayer.count === 3 && r.ayer.total === 10600, r.ayer);
  t('  el día es ayer', r.ayer.dia === diaDe(hace(1)));
  t('  separado: mostrador $9.000 y tienda online $1.600', r.ayer.local === 9000 && r.ayer.online === 1600);
  t('  ganancia $4.000: 1.000 + (3.000 - 500 de descuento) + 500', r.ayer.ganancia === 4000, r.ayer.ganancia);
  t('  el renglón sin costo no se cuenta como ganancia: se avisa', r.ayer.sinCosto === 1);
  t('  lo más vendido, por plata: almendra, alfajor, galletas', r.ayer.top.map(x => x.nombre).join() === 'Almendra,Alfajor,Galletas',
    r.ayer.top.map(x => x.nombre));
  t('contra el mismo día de la semana anterior ($8.000): 33% más', r.antes.total === 8000 && r.variacion === 33, r.variacion);
  const sinAyer = ctx.resumenDeAyer(ventas().filter(v => ['v1', 'v2', 'v3'].indexOf(v.docId) < 0), AHORA, ctx.allProducts);
  t('si ayer no hubo ventas, se dice cuál fue el último día que hubo', sinAyer.ayer.count === 0 && sinAyer.ultimo &&
    sinAyer.ultimo.dia === diaDe(hace(3)) && sinAyer.variacion === null, sinAyer.ultimo);
  const sinAntes = ctx.resumenDeAyer(ventas().filter(v => v.docId !== 'v4'), AHORA, ctx.allProducts);
  t('  y sin ventas la semana anterior no se inventa un porcentaje', sinAntes.variacion === null);
  /* Un granel repartido en dos bolsas va junto en "lo más vendido". */
  const g = ctx.resumenDeAyer([{ fecha: hace(1, 10), total: 1800, items: [it('m1', 300, 2000, 1000, 'peso'), it('m2', 700, 1600, 800, 'peso')] }], AHORA, ctx.allProducts);
  t('un granel de dos bolsas va junto, con el nombre del producto: Maní, 1 kg', g.ayer.top.length === 1 && g.ayer.top[0].nombre === 'Maní' &&
    g.ayer.top[0].cantidad === 1000, g.ayer.top);
}

/* ================================================= LA LECTURA */
console.log('\n-- lo que se lee de la base --');
{
  const m = armar();
  await m.ctx.refrescarInicio(false);
  const ventasLeidas = m.lecturas.filter(l => l.col === 'ventas' || l.col === 'ventasMayoristas');
  t('las ventas del último mes, minoristas y mayoristas, por fecha', ventasLeidas.length === 2 &&
    ventasLeidas.every(l => l.campo === 'fecha' && l.op === '>=') &&
    Math.round((Date.now() - ventasLeidas[0].desde.getTime()) / DIA) === 30);
  t('  y la caja abierta', m.lecturas.some(l => l.col === 'caja'));
  const antes = m.lecturas.length;
  await m.ctx.refrescarInicio(false);
  await m.ctx.entrarAInicio();
  t('una vez por día: volver a entrar no lee de nuevo', m.lecturas.length === antes);
  await m.ctx.refrescarInicio(true);
  t('"Volver a revisar" sí relee', m.lecturas.length === antes + 3);
  const f = armar({ fallaVentas: true });
  f.run('_iniListo = true;');
  await f.ctx.refrescarInicio(false);
  t('si las ventas no se pueden leer, lo dice y muestra igual lo que está sin stock', f.cuerpoIni.innerHTML.indexOf('No se pudieron leer las ventas: sin conexión') > 0 &&
    f.cuerpoIni.innerHTML.indexOf('productos publicados están sin stock') > 0);
}

/* ================================================= LA PANTALLA */
console.log('\n-- lo que se ve --');
{
  const m = armar();
  m.ctx.renderInicio();
  t('antes de que carguen los productos no se afirma nada', m.cuerpoIni.innerHTML.indexOf('Cargando los productos') > 0 &&
    m.cuerpoIni.innerHTML.indexOf('ini-alerta') < 0);
  /* La campana termina de calcular: es la señal de que los productos ya están. */
  await m.ctx.actualizarBadgeAlertas();
  await m.ctx.refrescarInicio(false);
  const h = m.cuerpoIni.innerHTML;
  t('la campana sigue devolviendo lo suyo', (await m.ctx.actualizarBadgeAlertas()) === 'campana');
  t('lo urgente arriba: "Hoy hay 1 cosa importante para resolver y 2 más para revisar"',
    h.indexOf('Hoy hay 1 cosa importante para resolver y 2 más para revisar.') > 0);
  t('el resumen de ayer con el total y la comparación', h.indexOf('$10.600') > 0 && h.indexOf('33% más que el') > 0 &&
    h.indexOf('Tienda online $1.600') > 0 && h.indexOf('sin contar 1 producto que no tiene costo cargado') > 0);
  t('sin stock: el número grande y cada fila con Agregar stock y Corregir', h.indexOf('<span class="ini-num">2</span> productos que se venden están sin stock') > 0 &&
    h.indexOf('data-ini="agregar" data-id="alf"') > 0 && h.indexOf('data-ini="corregir" data-id="alf"') > 0);
  t('  el negativo no aparece', h.indexOf('data-id="har"') < 0 && h.indexOf('-2 unidades') < 0);
  t('  la bolsa vacía va aparte, diciendo de qué bolsa se sigue vendiendo', h.indexOf('Bolsas vacías que se siguen vendiendo con otra bolsa') > 0 &&
    h.indexOf('se vende de la bolsa de 1 kg (3 kg), con aviso de mezcla') > 0);
  t('  y lo que no se vende, en una línea con el camino a Stock', h.indexOf('Además hay 1 producto publicado sin stock que no se vendió en el último mes.') > 0 &&
    h.indexOf('data-ini="ir" data-sec="stock"') > 0);
  t('costos: cuántos, y el botón con la tanda', h.indexOf('<span class="ini-num">3</span> productos que se venden tienen el costo viejo') > 0 &&
    h.indexOf('Revisar estos 3 costos') > 0 && h.indexOf('Hoy ya se revisó 1 costo.') > 0 &&
    h.indexOf('esos salen de la lista. Los que no cambies siguen acá.') > 0 &&
    h.indexOf('Hay otro con el costo viejo que no se vendió en el último mes') > 0);
  t('por terminarse: cuánto queda y para cuántos días', h.indexOf('Quedan 3 unidades') > 0 && h.indexOf('alcanza para unos 3 días') > 0);
  t('sin caja vieja no hay cartel de caja', h.indexOf('La caja quedó abierta') < 0);

  /* Los botones: un solo escuchador en el cuerpo. */
  const click = (attrs) => m.cuerpoIni.escuchas.click({ target: { closest: () => ({ disabled: false, getAttribute: k => attrs[k] }) } });
  click({ 'data-ini': 'costos' });
  t('"Revisar estos costos" abre el editor de costos con la tanda, desde Inicio', m.ctx.abiertos.length === 1 &&
    m.ctx.abiertos[0].c === 'inicio' && m.ctx.abiertos[0].filas.map(x => x.producto.id).join() === 'alf,gal,alm');
  let agregado = null, corregido = null, fue = null;
  m.ctx.agregarStockProducto = id => { agregado = id; };
  m.ctx.corregirStockProducto = id => { corregido = id; };
  m.ctx.switchSection = s => { fue = s; };
  click({ 'data-ini': 'agregar', 'data-id': 'y1' });
  click({ 'data-ini': 'corregir', 'data-id': 'alf' });
  click({ 'data-ini': 'ir', 'data-sec': 'stock' });
  t('Agregar stock, Corregir e Ir a Stock usan lo de siempre', agregado === 'y1' && corregido === 'alf' && fue === 'stock');

  /* Resuelto afuera (otra pantalla, otro botón): al pasar por la campana se repinta. */
  m.ctx.allProducts.find(p => p.id === 'alf').stock = 12;
  await m.ctx.actualizarBadgeAlertas();
  await m.ctx.refrescarInicio(false);
  t('lo que se resuelve desaparece solo: el alfajor ya tiene stock', m.cuerpoIni.innerHTML.indexOf('<span class="ini-num">1</span> producto que se vende está sin stock') > 0 &&
    m.cuerpoIni.innerHTML.indexOf('data-ini="agregar" data-id="alf"') < 0);
}
{
  /* La caja quedó abierta de otro día. */
  const m = armar({ caja: { estado: 'abierta', fecha: diaDe(hace(2)) } });
  m.run('_iniListo = true;');
  await m.ctx.refrescarInicio(false);
  t('la caja abierta de otro día es un cartel rojo con el botón a Caja', m.cuerpoIni.innerHTML.indexOf('La caja quedó abierta del') > 0 &&
    m.cuerpoIni.innerHTML.indexOf('data-ini="ir" data-sec="caja"') > 0 &&
    m.cuerpoIni.innerHTML.indexOf('Hoy hay 2 cosas importantes para resolver') > 0);
  const hoy = armar({ caja: { estado: 'abierta', fecha: diaDe(new Date()) } });
  hoy.run('_iniListo = true;');
  await hoy.ctx.refrescarInicio(false);
  t('  la de hoy no', hoy.cuerpoIni.innerHTML.indexOf('La caja quedó abierta') < 0);
}
{
  /* Todo en orden. */
  const prods = [{ id: 'a', nombre: 'A', tipoVenta: 'unidad', stock: 50, costo: 10, precio: 20, costoActualizadoEn: hace(3) }];
  const m = armar({ productos: prods, ventas: [{ docId: 'x', fecha: hace(1, 10), items: [it('a', 1, 20, 10)], total: 20 }] });
  m.run('_iniListo = true;');
  await m.ctx.refrescarInicio(false);
  const h = m.cuerpoIni.innerHTML;
  t('sin nada para resolver lo dice: "Todo en orden"', h.indexOf('Todo en orden.') > 0 && h.indexOf('Todo lo que se vende tiene stock') > 0 &&
    h.indexOf('Los costos de lo que se vende están al día') > 0);
  const sinFechas = armar({ productos: [Object.assign({}, prods[0], { costoActualizadoEn: null })],
    ventas: [{ docId: 'x', fecha: hace(1, 10), items: [it('a', 1, 20, 10)], total: 20 }] });
  sinFechas.run('_iniListo = true;');
  await sinFechas.ctx.refrescarInicio(false);
  t('sin fechas de costo NO dice "al día": no se sabe', sinFechas.cuerpoIni.innerHTML.indexOf('al día') < 0 &&
    sinFechas.cuerpoIni.innerHTML.indexOf('producto que se vende no tiene fecha de costo') > 0);
}

/* ================================================= LO DE LA REVISIÓN (26/09) */
console.log('\n-- lo de la revisión --');
{
  /* Sin productos (la carga falló) no se afirma nada. */
  const m = armar({ productos: [] });
  m.run('_iniListo = true;');
  await m.ctx.refrescarInicio(false);
  t('sin productos cargados no dice "Todo en orden"', m.cuerpoIni.innerHTML.indexOf('Todo en orden') < 0 &&
    m.cuerpoIni.innerHTML.indexOf('Todavía no hay productos cargados') > 0);
}
{
  /* Una lectura fallida se reintenta sola al minuto. */
  const f = armar({ fallaVentas: true });
  f.run('_iniListo = true;');
  await f.ctx.refrescarInicio(false);
  const antes = f.lecturas.length;
  await f.ctx.refrescarInicio(false);
  t('con la lectura fallida no se reintenta enseguida', f.lecturas.length === antes);
  f.run('_iniDatos.en -= 61000;');
  await f.ctx.refrescarInicio(false);
  t('  pero al minuto sí, sola', f.lecturas.length > antes);
}
{
  /* Lo leído otro día no se usa (el panel quedó abierto de ayer). */
  const m = armar();
  m.run('_iniListo = true;');
  await m.ctx.refrescarInicio(false);
  const antes = m.lecturas.length;
  m.run("_iniDatos.dia = '2000-01-01';");
  m.ctx.renderInicio();
  t('lo de otro día no se muestra: "Revisando las ventas"', m.cuerpoIni.innerHTML.indexOf('Revisando las ventas') > 0 &&
    m.cuerpoIni.innerHTML.indexOf('$10.600') < 0);
  m.ctx.verTodoInicio('stock');
  await new Promise(r => setImmediate(r));
  await m.ctx.refrescarInicio(false);
  t('  y "Ver todos" lo relee', m.lecturas.length > antes);
}
{
  /* La caja: la más nueva entre la de Caja y la leída acá. */
  const m = armar({ caja: null });
  m.ctx.cajaActual = { estado: 'abierta', fecha: diaDe(hace(2)) };
  m.ctx._cajaCargadaEn = Date.now() - 100000;
  m.run('_iniListo = true;');
  await m.ctx.refrescarInicio(false);
  t('si la lectura de acá es más nueva que la de Caja, manda: la caja ya se cerró en otra compu',
    m.cuerpoIni.innerHTML.indexOf('La caja quedó abierta') < 0);
  m.ctx._cajaCargadaEn = Date.now() + 1000;
  m.ctx.renderInicio();
  t('  y si Caja se cargó después, manda Caja', m.cuerpoIni.innerHTML.indexOf('La caja quedó abierta') > 0);
}
{
  /* Con "Descontar stock" apagado no hay avisos de stock. */
  const m = armar({ descontar: false });
  m.run('_iniListo = true;');
  await m.ctx.refrescarInicio(false);
  t('con "Descontar stock" apagado no se avisa de stock (no sería cierto)', m.cuerpoIni.innerHTML.indexOf('sin stock') < 0 &&
    m.cuerpoIni.innerHTML.indexOf('por terminar') < 0 && m.cuerpoIni.innerHTML.indexOf('Los avisos de stock están apagados') > 0);
}
{
  /* Después de vender (aplicarStockProductos) se repinta. */
  const m = armar();
  m.run('_iniListo = true;');
  await m.ctx.refrescarInicio(false);
  t('antes de vender: el alfajor figura sin stock', m.cuerpoIni.innerHTML.indexOf('data-ini="agregar" data-id="alf"') > 0);
  m.ctx.allProducts.find(p => p.id === 'alf').stock = 7;
  t('aplicarStockProductos sigue devolviendo lo suyo', (await m.ctx.aplicarStockProductos({ alf: 7 })) === 'aplicado');
  await new Promise(r => setImmediate(r));
  t('  y al vender, Inicio se repinta solo', m.cuerpoIni.innerHTML.indexOf('data-ini="agregar" data-id="alf"') < 0);
}

/* ================================================= EL PANEL */
console.log('\n-- el panel --');
{
  t('Inicio del día es la sección que se ve al entrar', html.indexOf('<div class="section-content active" id="sec-inicio">') > 0 &&
    html.indexOf('<div class="section-content" id="sec-products">') > 0 && (html.match(/class="section-content active"/g) || []).length === 1);
  const iIni = html.indexOf("switchSection('inicio')"), iCaja = html.indexOf("switchSection('caja')");
  t('  primera en el menú, marcada, y Productos ya no', iIni > 0 && iIni < iCaja &&
    html.indexOf('<a class="sidebar-item active" onclick="switchSection(\'inicio\')">') > 0 &&
    html.indexOf('<a class="sidebar-item" onclick="switchSection(\'products\')">') > 0 &&
    (html.match(/class="sidebar-item active"/g) || []).length === 1);
  t('  switchSection la dibuja al entrar', html.indexOf("if(sec==='inicio'&&typeof entrarAInicio==='function')entrarAInicio();") > 0);
  t('  y al entrar a Productos se vuelve a medir el recuadro de proveedores (oculto mide cero y escondía "Ver todas")',
    html.indexOf("if(sec==='products'&&typeof renderListasPanel==='function')renderListasPanel();") > 0);
  const iAl = html.indexOf('<script src="admin-alertas.js">'), iCos = html.indexOf('<script src="admin-costos.js">'),
    iMod = html.indexOf('<script src="admin-inicio.js">');
  t('  el módulo carga después de la campana y de los costos (los usa)', iMod > iAl && iMod > iCos && iAl > 0 && iCos > 0);
  t('  y check-admin revisa sus clases', leer('check-admin.js').indexOf("'admin-inicio.js'") > 0);
}

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
