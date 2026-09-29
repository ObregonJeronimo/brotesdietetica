/**
 * LA FICHA DEL PROVEEDOR: LOS TAMAÑOS DE UN MISMO PRODUCTO VAN JUNTOS.
 *
 * Pedido del dueño (29/09/2026): en Proveedores, la ficha de ANDNUTS mostraba "Mani
 * Recubierto de Chocolate" (la bolsa de 1 kg, con el nombre de la tienda) y "Mani RC x 3 kg"
 * por separado, como si fueran dos productos. Ahora, como en Productos, Stock y Compras, los
 * tamaños de un producto van en un recuadro con el nombre del producto y cada uno con su
 * tamaño: en lo que no se vendió, en lo vendido (el producto entero es un puesto, con el
 * total y lo de cada tamaño) y en la exportación.
 *
 * Corre de verdad admin-variantes.js y admin-proveedores.js, con un document de mentira.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const VAR = leer('admin-variantes.js');
const PROV = leer('admin-proveedores.js');

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + extra + ']' : '')); }
};

const P = (id, extra) => Object.assign({ id, nombre: id, lista: 'L1', stock: 5, tipoVenta: 'unidad', categoria: 'Frutos secos' }, extra || {});
function catalogo() {
  return [
    P('mrc1', { nombre: 'Mani RC', nombreMostrado: 'Mani Recubierto de Chocolate', gramaje: '1 kg', tipoVenta: 'peso', stock: 2100 }),
    P('mrc3', { nombre: 'Mani RC x 3 kg', gramaje: '3 kg', tipoVenta: 'peso', stock: 6100, gramajePadreId: 'mrc1' }),
    P('alf1', { nombre: 'Alfajor', gramaje: 'x1', stock: 30, categoria: 'Golosinas' }),
    P('alf6', { nombre: 'Alfajor x6', gramaje: 'x6', stock: 0, categoria: 'Golosinas', gramajePadreId: 'alf1' }),
    P('alm', { nombre: 'Almendra', tipoVenta: 'peso', stock: 2953 }),
    P('gal', { nombre: 'Galletas', stock: 0, categoria: 'Golosinas' }),
    P('nue', { nombre: 'Nuez', stock: 13 }),
    P('vie', { nombre: 'Mani Viejo', tipoVenta: 'peso', depurado: true }),
    P('yer', { nombre: 'Yerba', lista: 'L9' }),
  ];
}
/* Lo vendido de L1 en el período, como lo arma _provAgrupar. */
const V = (id, nombre, gramos, unidades, monto) => ({ id, nombre, gramos, unidades, monto, veces: 1 });
const VENDIDO = {
  mrc1: V('mrc1', 'Mani Recubierto de Chocolate', 2000, 0, 8000),
  mrc3: V('mrc3', 'Mani RC x 3 kg', 6000, 0, 12000),
  alm: V('alm', 'Almendra', 500, 0, 7000),
  gal: V('gal', 'Galletas', 0, 2, 30900),
  alf1: V('alf1', 'Alfajor', 0, 3, 1500),
  alf6: V('alf6', 'Alfajor x6', 0, 2, 5000),
  BORRADO: V('BORRADO', 'Uno que ya no existe', 0, 1, 900),
};

/* La ficha de L1 abierta, con lo que se vendió (ids de VENDIDO). sinVariantes: como si
   admin-variantes.js no hubiera cargado. */
function armar(vendidos, opts) {
  const o = opts || {};
  const campos = {};
  const el = id => campos[id] || (campos[id] = { id, innerHTML: '', value: '', style: {}, addEventListener() {} });
  const productos = {};
  let facturado = 0;
  (vendidos || []).forEach(id => { productos[id] = Object.assign({}, VENDIDO[id]); facturado += VENDIDO[id].monto; });
  const ctx = {
    console, Math, Number, String, Object, Array, Set, Map, Promise, Infinity, parseInt, isFinite, Date,
    setTimeout: () => 0,
    document: { getElementById: el, querySelector: () => null, querySelectorAll: () => [] },
    allProducts: o.productos || catalogo(),
    listasData: [{ id: 'L1', nombre: 'ANDNUTS' }, { id: 'L9', nombre: 'OTRO' }],
    esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    _attrHtml: s => String(s).replace(/"/g, '&quot;'),
    esPorPeso: p => !!(p && p.tipoVenta === 'peso'),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  if (o.sinVariantes !== true) vm.runInContext(VAR, ctx);
  vm.runInContext(PROV, ctx);
  vm.runInContext('_provAbierto = "L1"; _provDatos = ' + JSON.stringify({
    dias: 90, desde: '2026-07-01', hasta: '2026-09-29',
    porLista: { L1: { facturado: facturado, ventas: 4, productos: productos } },
  }) + ';', ctx);
  ctx._provRenderDetalle();
  return { ctx, html: el('provDetalle').innerHTML, doc: noVend => ctx._provDocExportar(ctx.listasData[0], noVend) };
}

/* Dónde empieza y termina cada recuadro, contando los div que abren y cierran. */
const tramos = h => {
  const out = [];
  let i = 0;
  while ((i = h.indexOf('<div class="prov-grupo">', i)) >= 0) {
    const re = /<div\b|<\/div>/g;
    re.lastIndex = i;
    let prof = 0, fin = h.length, m;
    while ((m = re.exec(h))) {
      prof += m[0] === '</div>' ? -1 : 1;
      if (!prof) { fin = m.index + 6; break; }
    }
    out.push([i, fin]);
    i = fin;
  }
  return out;
};
const textoDe = h => h.replace(/<[^>]+>/g, ' ').replace(/&middot;/g, '·').replace(/\s+/g, ' ').trim();
/* Una sección de la ficha (desde su título hasta el próximo), como lista de renglones; los de
   un recuadro, juntos: "[cabecera | tamaño | tamaño]". */
function seccion(h, titulo) {
  const i = h.indexOf(titulo);
  if (i < 0) return null;
  const j = h.indexOf('<h3', i + titulo.length);
  const s = h.slice(i, j < 0 ? h.length : j);
  const tr = tramos(s);
  const items = [...s.matchAll(/<div class="prov-grupo-cab">([\s\S]*?)<\/div>|<div style="display:flex;gap:0\.6rem;align-items:baseline;padding:0\.3(?:8)?rem 0;[^"]*">([\s\S]*?)<\/div>/g)]
    .map(m => ({ i: m.index, txt: textoDe(m[1] || m[2]), caja: tr.findIndex(([a, b]) => m.index > a && m.index < b) }));
  const out = [];
  items.forEach((it, k) => {
    if (it.caja < 0) { out.push(it.txt); return; }
    if (k > 0 && items[k - 1].caja === it.caja) out[out.length - 1] = out[out.length - 1].slice(0, -1) + ' | ' + it.txt + ']';
    else out.push('[' + it.txt + ']');
  });
  return out;
}
const TOP = 'Los 10 productos más vendidos de este proveedor';
const QUIETOS = 'No se vendieron en 90 días';

console.log('\n-- lo que no se vendió --');
{
  const w = armar(['alm', 'gal']);
  const q = seccion(w.html, QUIETOS);
  t('las dos bolsas del Mani RC van en UN recuadro, con el nombre del producto arriba',
    q && q.indexOf('[Mani RC | Mani RC x 1 kg 2,1 kg | Mani RC x 3 kg 6,1 kg]') >= 0, q && q.join(' / '));
  t('  la de 1 kg ya no sale con el nombre de la tienda', w.html.indexOf('Mani Recubierto de Chocolate') < 0);
  t('las presentaciones también, con "Alfajor" arriba',
    q && q.indexOf('[Alfajor | Alfajor x1 30 u | Alfajor x6 sin stock]') >= 0, q && q.join(' / '));
  t('ninguna cabecera dice cuántas bolsas o presentaciones tiene el producto (29/09)',
    !/\d+ (bolsas|presentaciones)/.test(textoDe(w.html)), textoDe(w.html));
  t('el suelto va suelto, como siempre', q && q.indexOf('Nuez 13 u') >= 0);
  t('el título sigue contando cada tamaño (5), como "No se vendió ninguno"',
    w.html.indexOf(QUIETOS + ' (5)') >= 0 && /No se vendió ninguno<\/span><span[^>]*>5</.test(w.html));
  t('ni depurados ni los de otro proveedor', w.html.indexOf('Mani Viejo') < 0 && w.html.indexOf('Yerba') < 0);
}
{
  const w = armar(['mrc1', 'alm', 'gal']);
  const q = seccion(w.html, QUIETOS);
  t('si una bolsa se vendió, en el recuadro queda la otra, con el nombre del producto arriba',
    q && q.indexOf('[Mani RC | Mani RC x 3 kg 6,1 kg]') >= 0, q && q.join(' / '));
}

console.log('\n-- lo vendido --');
{
  const w = armar(Object.keys(VENDIDO));
  const top = seccion(w.html, TOP);
  t('el producto entero es un puesto: los dos Mani RC suman $20.000 y quedan segundos, después de Galletas',
    top && top[0] === '1 Galletas 2 u $30.900' && /^\[2 Mani RC 8 kg /.test(top[1]), top && top.join(' / '));
  t('  con el total de las bolsas (8 kg) y abajo lo de cada una, con su tamaño',
    top && top[1] === '[2 Mani RC 8 kg $20.000 | Mani RC x 1 kg 2 kg $8.000 | Mani RC x 3 kg 6 kg $12.000]', top && top[1]);
  t('  y la cabecera no dice "2 bolsas", que se leería como las que se vendieron', !/\d+ (bolsas|presentaciones)/.test(textoDe(w.html)));
  t('las presentaciones van juntas, sin sumar unidades de tamaños distintos',
    top && top[3] === '[4 Alfajor $6.500 | Alfajor x1 3 u $1.500 | Alfajor x6 2 u $5.000]', top && top[3]);
  t('los sueltos, como siempre, con el nombre de la venta', top && top[2] === '3 Almendra 500 g $7.000');
  t('un producto que ya no está en el catálogo va suelto', top && top[4] === '5 Uno que ya no existe 1 u $900');
  t('y son 5 puestos', top && top.length === 5);
  t('los números de arriba siguen contando cada tamaño: se vendieron 7',
    /Se vendieron<\/span><span[^>]*>7</.test(w.html));
}
{
  /* 11 productos sueltos más el Mani RC: el producto cuenta como un puesto también en "el resto". */
  const prods = catalogo();
  const extra = [];
  for (let k = 1; k <= 11; k++) {
    prods.push(P('s' + k, { nombre: 'Suelto ' + k }));
    VENDIDO['s' + k] = V('s' + k, 'Suelto ' + k, 0, 1, 1000 - k);
    extra.push('s' + k);
  }
  const w = armar(['mrc1', 'mrc3'].concat(extra), { productos: prods });
  const top = seccion(w.html, TOP) || [];
  const resto = seccion(w.html, 'El resto de lo vendido') || [];
  t('con 12 puestos (el Mani RC y 11 sueltos), el top tiene 10 y el resto 2',
    top.length === 10 && w.html.indexOf('El resto de lo vendido (2)') >= 0 && resto.length === 2, top.length + ' / ' + resto.length);
  t('  el Mani RC va primero, en su recuadro', /^\[1 Mani RC /.test(top[0] || ''), top[0]);
  t('  y el resto sigue la numeración', resto[0] === '11 Suelto 10 1 u $990' && resto[1] === '12 Suelto 11 1 u $989', resto.join(' / '));
  extra.forEach(id => delete VENDIDO[id]);
}

{
  /* La lista de proveedores dice "Lo que más deja" con el mismo ranking de la ficha: la
     Almendra ($15.000) le gana a cada bolsa sola, pero no al Mani RC entero ($20.000). */
  const antes = VENDIDO.alm.monto;
  VENDIDO.alm.monto = 15000;
  const w = armar(['mrc1', 'mrc3', 'alm']);
  VENDIDO.alm.monto = antes;
  w.ctx.renderProveedores();
  const h = w.ctx.document.getElementById('provBody').innerHTML;
  const item = (h.match(/<button type="button" class="prov-item[\s\S]*?<\/button>/g) || []).find(b => b.indexOf('ANDNUTS') > 0) || '';
  t('en la lista de proveedores, "Lo que más deja" es el primero de la ficha: el Mani RC entero',
    textoDe(item).indexOf('Lo que más deja: Mani RC') >= 0, textoDe(item));
}

console.log('\n-- la exportación --');
{
  const w = armar(Object.keys(VENDIDO));
  const tb = w.doc(false).bloques.find(b => b.titulo === TOP);
  const f = tb.filas.map(r => r.join(' ; '));
  t('el top exporta el producto con su puesto y el total, y abajo cada tamaño',
    f[1] === '2 ; Mani RC ; Frutos secos ; 8 kg ; $20.000' &&
    f[2] === ' ; · Mani RC x 1 kg ;  ; 2 kg ; $8.000' && f[3] === ' ; · Mani RC x 3 kg ;  ; 6 kg ; $12.000', f.slice(0, 4).join(' / '));
  t('  las presentaciones, sin total de unidades',
    f.indexOf('4 ; Alfajor ; Golosinas ;  ; $6.500') >= 0, f.join(' / '));
  t('  y los sueltos como siempre', f[0] === '1 ; Galletas ; Golosinas ; 2 u ; $30.900' && f.indexOf('3 ; Almendra ; Frutos secos ; 500 g ; $7.000') >= 0);
}
{
  const w = armar(['alm', 'gal']);
  const d = w.doc(true);
  const fs2 = d.bloques.find(b => b.titulo === 'Frutos secos (3)');
  t('lo que no se vendió, por categoría: el producto y abajo cada bolsa',
    fs2 && fs2.filas.map(r => r.join(' ; ')).join(' / ') === 'Mani RC ;  / · Mani RC x 1 kg ; 2,1 kg / · Mani RC x 3 kg ; 6,1 kg / Nuez ; 13 u',
    fs2 && fs2.filas.map(r => r.join(' ; ')).join(' / '));
  const res = d.bloques.find(b => b.tipo === 'pares' && /^No se vendieron/.test(b.titulo));
  t('  el resumen por categoría sigue contando cada tamaño', res && res.filas.map(r => r.join('=')).join() === 'Frutos secos=3,Golosinas=2');
}
{
  /* Revisión del 29/09: cada tamaño guarda su categoría, y con "Asociar uno existente" pueden
     ser distintas. El producto va entero en la categoría de su principal, no partido en dos. */
  const prods = catalogo();
  prods.find(p => p.id === 'mrc3').categoria = 'Golosinas';
  const w = armar(['alm', 'gal'], { productos: prods });
  const d = w.doc(true);
  const fr = d.bloques.find(b => /^Frutos secos/.test(b.titulo));
  const go = d.bloques.find(b => /^Golosinas/.test(b.titulo));
  t('con la bolsa de 3 kg en otra categoría, el Mani RC va entero en la de su principal',
    fr && fr.titulo === 'Frutos secos (3)' && fr.filas.map(r => r[0]).join(' / ') === 'Mani RC / · Mani RC x 1 kg / · Mani RC x 3 kg / Nuez',
    fr && fr.titulo + ': ' + fr.filas.map(r => r[0]).join(' / '));
  t('  y no aparece también en la otra', go && go.titulo === 'Golosinas (2)' && !go.filas.some(r => /Mani/.test(r[0])),
    go && go.titulo + ': ' + go.filas.map(r => r[0]).join(' / '));
  const res = d.bloques.find(b => b.tipo === 'pares' && /^No se vendieron/.test(b.titulo));
  t('  el resumen por categoría lo cuenta donde está', res && res.filas.map(r => r.join('=')).join() === 'Frutos secos=3,Golosinas=2');
}

console.log('\n-- sin admin-variantes.js --');
{
  const w = armar(Object.keys(VENDIDO), { sinVariantes: true });
  const top = seccion(w.html, TOP) || [];
  t('lo vendido sale como antes: cada uno suelto', w.html.indexOf('prov-grupo') < 0 && top.length === 7, top.join(' / '));
  t('  con el nombre de la venta', top.indexOf('2 Mani RC x 3 kg 6 kg $12.000') >= 0 && top.indexOf('3 Mani Recubierto de Chocolate 2 kg $8.000') >= 0, top.join(' / '));
  const w2 = armar(['alm', 'gal'], { sinVariantes: true });
  const q = seccion(w2.html, QUIETOS) || [];
  t('lo que no se vendió, como antes', w2.html.indexOf('prov-grupo') < 0 && q.indexOf('Mani Recubierto de Chocolate 2,1 kg') >= 0, q.join(' / '));
  const tb = w.doc(false).bloques.find(b => b.titulo === TOP);
  t('y la exportación también', tb.filas.length === 7 && tb.filas.every(r => r[0] !== ''));
}

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
