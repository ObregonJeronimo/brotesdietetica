/**
 * CARGAR COMPRA: LAS BOLSAS DE UN MISMO PRODUCTO VAN JUNTAS, Y SE CARGAN POR BOLSA.
 *
 * Pedido del dueño (29/09/2026): en Proveedores > Cargar compra, "Mani RC" de 1 kg y de
 * 3 kg salían separados, como dos productos distintos, y el costo se pedía por kilo. Ahora,
 * como en Productos, Stock y la venta:
 *   - en la lista para agregar y en "Lo que entró", las bolsas de un producto van en un
 *     recuadro con el nombre del producto, y cada una con su tamaño ("Mani RC x 1 kg");
 *   - una bolsa se carga por lo que costó la bolsa, con el kilo al lado, como en el
 *     formulario del producto. El costo se sigue guardando por kilo.
 *
 * Corre de verdad admin-variantes.js y admin-compras.js, con un document de mentira.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const VAR = leer('admin-variantes.js');
const COMP = leer('admin-compras.js');

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + extra + ']' : '')); }
};

const P = (id, extra) => Object.assign({ id, nombre: id, lista: 'L1', stock: 0, tipoVenta: 'unidad', costo: 100 }, extra || {});
function catalogo() {
  return [
    P('alm', { nombre: 'Almendra', tipoVenta: 'peso', costo: 14000, codigo: 'ALM' }),
    P('mrc1', { nombre: 'Mani RC', nombreMostrado: 'Mani Recubierto de Chocolate', gramaje: '1 kg', tipoVenta: 'peso', costo: 4000, codigo: 'MRC1', stock: 1000 }),
    P('gal', { nombre: 'Galletas De Arroz', costo: 1500 }),
    P('mrc3', { nombre: 'Mani RC x 3 kg', gramaje: '3 kg', tipoVenta: 'peso', costo: 3333, codigo: 'MRC3', gramajePadreId: 'mrc1' }),
    P('alf1', { nombre: 'Alfajor', gramaje: 'x1', costo: 500 }),
    P('alf6', { nombre: 'Alfajor x6', gramaje: 'x6', costo: 2800, gramajePadreId: 'alf1' }),
    P('ch5', { nombre: 'Chia', gramaje: '500 g', tipoVenta: 'peso', costo: 3001 }),
    P('ch1', { nombre: 'Chia x 1 kg', gramaje: '1 kg', tipoVenta: 'peso', costo: 3001, gramajePadreId: 'ch5' }),
    P('yer', { nombre: 'Yerba De Otro Proveedor', lista: 'L9', costo: 900 }),
    P('vie', { nombre: 'Mani Viejo', tipoVenta: 'peso', costo: 2000, depurado: true }),
  ];
}

/* Un panel de mentira. sinVariantes: como si admin-variantes.js no hubiera cargado. */
function armar(opts) {
  const o = opts || {};
  const campos = {};
  const el = id => campos[id] || (campos[id] = {
    id, value: '', innerHTML: '', textContent: '', checked: false, disabled: false, style: {},
    classList: { add() {}, remove() {} }, setAttribute() {}, focus() {}, select() {}, addEventListener() {},
  });
  el('compraProveedor').value = 'L1';
  const guardadas = [], escrituras = [], preguntas = [], avisos = [];
  const respuestas = o.respuestas || {};
  const ctx = {
    console, Math, Number, String, Object, Array, Set, Map, Promise, Infinity, parseInt, isFinite, Date,
    setTimeout: () => 0,
    document: {
      getElementById: el,
      querySelector: s => (s.indexOf(':checked') >= 0 ? { value: 'pagada' } : { checked: true }),
      querySelectorAll: () => [],
    },
    allProducts: o.productos || catalogo(),
    listasData: [{ id: 'L1', nombre: 'FRUTICOR' }, { id: 'L9', nombre: 'OTRO' }],
    esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    _attrHtml: s => String(s).replace(/"/g, '&quot;'),
    esPorPeso: p => !!(p && p.tipoVenta === 'peso'),
    fmtPeso: g => (Math.abs(g) < 1000 ? g + ' g' : (g / 1000).toLocaleString('es-AR', { maximumFractionDigits: 3 }) + ' kg'),
    showAdminToast: (m, tipo) => avisos.push((tipo || '') + ': ' + m),
    pedirConfirmacion: async (m, op) => {
      preguntas.push({ titulo: op && op.titulo, m, aceptar: op && op.aceptar, cancelar: op && op.cancelar });
      const r = respuestas[op && op.titulo];
      return r === undefined ? true : r;
    },
    firebase: { firestore: { FieldValue: { increment: n => ({ __inc: n }), serverTimestamp: () => 'ahora' } } },
    auth: { currentUser: { email: 'prueba@brotes' } },
    storage: {},
    db: {
      collection: col => ({
        doc: id => ({ col, id }),
        add: async d => { guardadas.push(d); return { id: 'nueva' }; },
      }),
      runTransaction: async fn => fn({ get: async () => ({ exists: true, data: () => ({ count: 41 }) }), set: () => {} }),
      batch: () => ({ update: (ref, d) => escrituras.push({ col: ref.col, id: ref.id, d }), commit: async () => {} }),
    },
    logAction: () => {}, _refrescarAlertas: () => {}, loadProveedores: () => {}, _reRenderProductos: () => {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  if (o.sinVariantes !== true) vm.runInContext(VAR, ctx);
  vm.runInContext(COMP, ctx);
  const items = () => vm.runInContext('_compraItems', ctx);
  return { ctx, campos, el, items, guardadas, escrituras, preguntas, avisos };
}

/* Dónde empieza y termina cada recuadro de un html, contando los div que abren y cierran. */
const tramos = h => {
  const out = [];
  let i = 0;
  while ((i = h.indexOf('<div class="cp-grupo">', i)) >= 0) {
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
/* Los recuadros de un html, cada uno con lo que tiene adentro. */
const recuadros = h => tramos(h).map(([a, b]) => h.slice(a, b));
/* Los botones de la lista para agregar, en orden: "id" si va suelto y "id(grupo)" si va
   dentro de un recuadro. */
const botones = h => {
  const tr = tramos(h);
  return [...h.matchAll(/compraAgregar\('([^']+)'\)/g)]
    .map(m => m[1] + (tr.some(([a, b]) => m.index > a && m.index < b) ? '(grupo)' : ''));
};
const textoDe = h => h.replace(/<[^>]+>/g, ' ').replace(/&middot;/g, '·').replace(/\s+/g, ' ').trim();

(async () => {
  console.log('\n-- la lista para agregar --');
  {
    const w = armar();
    w.ctx.openCompraModal('L1');
    const h = w.el('compraLista').innerHTML;
    const r = recuadros(h);
    t('las dos bolsas del Mani RC van en UN recuadro', r.filter(x => x.indexOf('Mani RC') >= 0).length === 1);
    const mani = r.find(x => x.indexOf('Mani RC') >= 0) || '';
    t('  el recuadro dice de qué producto son, y nada más: "Mani RC" (sin "2 bolsas", 29/09)',
      textoDe(mani).indexOf('Mani RC Mani RC x 1 kg') === 0, textoDe(mani).slice(0, 40));
    t('  adentro, las dos, de menor a mayor', /compraAgregar\('mrc1'\)[\s\S]*compraAgregar\('mrc3'\)/.test(mani));
    t('  cada una con su tamaño, también la principal: "Mani RC x 1 kg" y "Mani RC x 3 kg"',
      mani.indexOf('>Mani RC x 1 kg<') > 0 && mani.indexOf('>Mani RC x 3 kg<') > 0);
    t('  la bolsa de 3 kg dice lo que cuesta la bolsa, y el kilo entre paréntesis',
      mani.indexOf('costo $9.999 la bolsa ($3.333 el kilo)') > 0);
    t('  la de 1 kg, la bolsa sola (el kilo es lo mismo)',
      mani.indexOf('costo $4.000 la bolsa<') > 0 && mani.indexOf('$4.000 la bolsa (') < 0);
    const alf = r.find(x => x.indexOf('Alfajor') >= 0) || '';
    t('las presentaciones (Alfajor x1 y x6) también van juntas', textoDe(alf).indexOf('Alfajor Alfajor x1') === 0, textoDe(alf).slice(0, 40));
    t('ninguna cabecera dice cuántas bolsas o presentaciones tiene el producto',
      !/\d+ (bolsas|presentaciones)/.test(r.map(x => textoDe(x.slice(0, x.indexOf('<button')))).join(' ')));
    t('  y su costo sigue siendo por unidad, no por bolsa', alf.indexOf('costo $500<') > 0 && alf.indexOf('la bolsa') < 0);
    const b = botones(h);
    t('los sueltos van sueltos, como siempre', b.indexOf('alm') >= 0 && b.indexOf('gal') >= 0, b.join());
    t('  la Almendra (granel sin bolsas) sigue por kilo', h.indexOf('ALM · costo $14.000 el kilo') > 0);
    t('ni los de otro proveedor ni los depurados', b.indexOf('yer') < 0 && b.indexOf('vie') < 0 && b.indexOf('yer(grupo)') < 0);
    t('están todos los del proveedor, una sola vez', b.length === 8 && new Set(b).size === 8, b.join());
  }
  {
    const w = armar();
    w.ctx.openCompraModal('L1');
    w.ctx.compraBuscarProd('3 kg');
    const h = w.el('compraLista').innerHTML;
    t('buscando "3 kg" sale la bolsa de 3 kg, dentro del recuadro de su producto',
      botones(h).join() === 'mrc3(grupo)' && textoDe(h).indexOf('Mani RC Mani RC x 3 kg') === 0, botones(h).join());
    /* La de 1 kg tiene otro nombre en la tienda: se ve y se busca como "Mani RC x 1 kg". */
    const busco = q => { w.ctx.compraBuscarProd(q); return botones(w.el('compraLista').innerHTML).join(); };
    t('buscando "mani rc" salen las dos, aunque la de 1 kg en la tienda se llame de otra forma', busco('mani rc') === 'mrc1(grupo),mrc3(grupo)', busco('mani rc'));
    t('  y buscando por ese otro nombre ("recubierto"), también', busco('recubierto') === 'mrc1(grupo)', busco('recubierto'));
    t('  y por el tamaño que se ve ("1 kg")', busco('1 kg').split(',').indexOf('mrc1(grupo)') >= 0, busco('1 kg'));
    t('  y por el código, como siempre', busco('mrc3') === 'mrc3(grupo)', busco('mrc3'));
  }
  {
    const w = armar();
    w.ctx.openCompraModal('L1');
    w.ctx.compraAgregar('mrc1');
    const h = w.el('compraLista').innerHTML;
    t('agregada la de 1 kg, en la lista queda la otra, en su recuadro',
      botones(h).filter(x => x.indexOf('mrc') === 0).join() === 'mrc3(grupo)' &&
      textoDe(recuadros(h).find(x => x.indexOf('mrc3') >= 0) || '').indexOf('Mani RC Mani RC x 3 kg') === 0);
  }

  console.log('\n-- lo que entró --');
  const w = armar();
  w.ctx.openCompraModal('L1');
  w.ctx.compraAgregar('mrc3');
  w.ctx.compraAgregar('alm');
  w.ctx.compraAgregar('mrc1');
  {
    const it = w.items();
    t('la bolsa entra con su tamaño en el nombre', it[0].nombre === 'Mani RC x 3 kg' && it[2].nombre === 'Mani RC x 1 kg', it.map(i => i.nombre).join());
    t('  con sus gramos y lo que cuesta la bolsa, desde el kilo que tiene',
      it[0].gramosBolsa === 3000 && it[0].costoBolsa === 9999 && it[0].costoUnitario === 3333);
    t('  la de 1 kg también es una bolsa', it[2].gramosBolsa === 1000 && it[2].costoBolsa === 4000);
    t('la Almendra entra como siempre, por kilo', it[1].gramosBolsa === undefined && it[1].costoBolsa === undefined && it[1].costoUnitario === 14000);
    const h = w.el('compraItems').innerHTML;
    const r = recuadros(h);
    t('las dos bolsas, en un recuadro que dice "Mani RC", sin cuántas bolsas tiene',
      r.length === 1 && textoDe(r[0]).indexOf('Mani RC Mani RC x 1 kg') === 0, r[0] && textoDe(r[0]).slice(0, 40));
    t('  de menor a mayor, aunque la de 3 kg se agregó primero',
      /id="cpCant2"[\s\S]*id="cpCant0"/.test(r[0]) && r[0].indexOf('cpCant1') < 0);
    t('  el recuadro va donde entró la primera, y la Almendra después, suelta',
      h.indexOf('<div class="cp-grupo">') < h.indexOf('id="cpCant1"') && h.split('<div class="cp-grupo">')[0] === '');
    t('  cada bolsa pide "Costo de la bolsa", con lo que costó',
      (r[0].match(/<span>Costo de la bolsa<\/span>/g) || []).length === 2 &&
      /value="9999" oninput="compraCampo\(0,'costoBolsa',this.value\)"/.test(r[0]) &&
      /value="4000" oninput="compraCampo\(2,'costoBolsa',this.value\)"/.test(r[0]));
    t('  y al lado, cómo queda el kilo',
      r[0].indexOf('<span class="cp-kilo" id="cpKilo0">$3.333 el kilo</span>') > 0 &&
      r[0].indexOf('<span class="cp-kilo" id="cpKilo2">$4.000 el kilo</span>') > 0);
    t('  con el "?" del redondeo, una vez', (r[0].match(/muestra unos pesos de más o de menos/g) || []).length === 1);
    t('la Almendra, que no dice de cuánto es la bolsa, la pregunta en la fila (30/09): el número y al lado kg o g, de entrada kg',
      /<span id="cpBolsaEtq1">¿De cuánto es la bolsa\?<\/span><span class="cp-bolsa-tam"><input type="text"[^>]*placeholder="Ej: 5"[^>]*oninput="compraCampo\(1,'bolsa',this.value\)"><select[^>]*onchange="compraCampo\(1,'bolsaUnidad',this.value\)"><option value="kg" selected>kg<\/option><option value="g">g<\/option><\/select><\/span>/.test(h) &&
      h.indexOf('<span class="cp-bolsa-tam"><input type="text" inputmode="decimal" maxlength="5" class="form-input" placeholder="Ej: 5"') > 0 &&
      /id="cpBolsa1" value="" disabled oninput="compraCampo\(1,'costoBolsa',this.value\)"/.test(h) &&
      h.indexOf('<span class="cp-kilo falta" id="cpKilo1">falta la bolsa</span>') > 0);
  }
  {
    w.ctx.compraCampo(0, 'costoBolsa', '12000');
    const it = w.items()[0];
    t('escribir lo que costó la bolsa pasa el kilo solo: $12.000 la de 3 kg son $4.000 el kilo',
      it.costoBolsa === 12000 && it.costoUnitario === 4000);
    t('  y el kilo de al lado se actualiza', w.el('cpKilo0').textContent === '$4.000 el kilo', w.el('cpKilo0').textContent);
    w.ctx.compraCampo(0, 'cantidad', '6000');
    t('  dos bolsas (6.000 g) a $12.000 son $24.000', w.el('cpSub0').textContent === '$24.000', w.el('cpSub0').textContent);
    w.ctx.compraCampo(0, 'costoBolsa', '10000');
    w.ctx.compraCampo(0, 'cantidad', '3000');
    t('  el subtotal sale de la bolsa, no del kilo redondeado: 3 kg a $10.000 son $10.000 (no $9.999)',
      w.el('cpSub0').textContent === '$10.000' && w.items()[0].costoUnitario === 3333, w.el('cpSub0').textContent);
    w.ctx.compraCampo(1, 'cantidad', '500');
    t('la Almendra, sin decir de cuánto es la bolsa, todavía no cuenta: $0', w.el('cpSub1').textContent === '$0', w.el('cpSub1').textContent);
    w.ctx.compraCampo(1, 'bolsaUnidad', 'g');
    w.ctx.compraCampo(1, 'bolsa', '500');
    w.ctx.compraCampo(2, 'cantidad', '2000');
    t('el total suma todo: $10.000 + 500 g de Almendra ($7.000) + 2 bolsas de 1 kg ($8.000)',
      w.el('compraTotal').textContent === '$25.000', w.el('compraTotal').textContent);
  }
  {
    const v = armar();
    v.ctx.openCompraModal('L1');
    v.ctx.compraAgregar('ch5');
    const it = v.items()[0];
    t('una bolsa de 500 g a $3.001 el kilo se muestra a $1.501', it.costoBolsa === 1501 && it.costoUnitario === 3001);
    v.ctx.compraCampo(0, 'costoBolsa', '1501');
    t('  volver a escribir $1.501 deja el kilo en $3.001 (la cuenta daría $3.002 y parecería un cambio)',
      v.items()[0].costoUnitario === 3001 && v.el('cpKilo0').textContent === '$3.001 el kilo');
    v.ctx.compraCampo(0, 'costoBolsa', '1600');
    t('  y $1.600 sí lo cambia: $3.200 el kilo', v.items()[0].costoUnitario === 3200);
    v.ctx.compraCampo(0, 'costoBolsa', '');
    t('  vacío es sin costo', v.items()[0].costoBolsa === 0 && v.items()[0].costoUnitario === 0);
  }

  console.log('\n-- guardar --');
  {
    w.ctx.compraCampo(0, 'costoBolsa', '12000');
    /* La Almendra no dice de cuánto es la bolsa: se escribe en la compra (30/09). */
    w.ctx.compraCampo(1, 'bolsaUnidad', 'g');
    w.ctx.compraCampo(1, 'bolsa', '500');
    await w.ctx.guardarCompra();
    const conf = w.preguntas.find(p => p.titulo === 'Guardar compra');
    t('lo que se confirma dice la bolsa como se cargó',
      conf && conf.m.indexOf('- Mani RC x 3 kg: 3 kg a $12.000 la bolsa') >= 0 &&
      conf.m.indexOf('- Mani RC x 1 kg: 2 kg a $4.000 la bolsa') >= 0 &&
      conf.m.indexOf('- Almendra: 500 g a $7.000 la bolsa de 500 g (el tamaño queda anotado en el producto)') >= 0, conf && conf.m);
    t('  y el total: $12.000 + $7.000 + $8.000', conf && conf.m.indexOf('por $27.000') > 0);
    const c = w.guardadas[0] || { items: [] };
    const m3 = c.items.find(i => i.id === 'mrc3') || {}, al = c.items.find(i => i.id === 'alm') || {};
    t('se guarda la compra, con su total', w.guardadas.length === 1 && c.total === 27000, c.total);
    t('  la bolsa guarda lo que costó la bolsa y de cuánto era, y el kilo',
      m3.costoBolsa === 12000 && m3.gramosBolsa === 3000 && m3.costoUnitario === 4000 && m3.subtotal === 12000 && m3.cantidad === 3000);
    t('  la Almendra, como bolsa de 500 g, con el kilo de siempre',
      al.costoBolsa === 7000 && al.gramosBolsa === 500 && al.costoUnitario === 14000 && al.subtotal === 7000);
    t('  y su bolsa de 500 g queda anotada en el producto, para la próxima',
      w.escrituras.some(e => e.col === 'productos' && e.id === 'alm' && e.d.gramaje === '500 g') &&
      w.ctx.allProducts.find(p => p.id === 'alm').gramaje === '500 g');
    t('  a las que ya decían su tamaño no se les escribe nada', !w.escrituras.some(e => e.d.gramaje !== undefined && e.id !== 'alm'));
    const stock = w.escrituras.filter(e => e.d.stock).map(e => e.id + '+' + e.d.stock.__inc).join();
    t('el stock sube en gramos, como siempre', stock === 'mrc3+3000,alm+500,mrc1+2000', stock);
    const act = w.preguntas.find(p => p.titulo === '¿Actualizar el costo?');
    t('el aviso de costos dice, en dos renglones, lo que tenía cargado y lo que se pagó: la bolsa y el kilo (30/09)',
      act && act.m.indexOf('Mani RC x 3 kg\n- Tenía cargado: $9.999 la bolsa ($3.333 el kilo)\n- En esta compra: $12.000 la bolsa ($4.000 el kilo)') >= 0, act && act.m);
    t('  sin flechas, dice qué pasa al actualizar, y los botones se entienden',
      act && act.m.indexOf('→') < 0 && act.m.indexOf('En esta compra pagaste distinto de lo que tenía cargado el producto:') === 0 &&
      act.m.indexOf('Si tocás "Actualizar", el producto queda con el costo de esta compra. El precio de venta no cambia: lo que cambia es cuánto ganás en cada venta.') > 0 &&
      act.aceptar === 'Actualizar' && act.cancelar === 'Dejar como estaba', act && act.m);
    t('  y no nombra a los que no cambiaron', act && act.m.indexOf('Almendra') < 0 && act.m.indexOf('x 1 kg') < 0);
    const costos = w.escrituras.filter(e => e.d.costo !== undefined).map(e => e.id + '=' + e.d.costo).join();
    t('  al aceptar, se guarda el kilo', costos === 'mrc3=4000', costos);
    t('  y queda en memoria', w.ctx.allProducts.find(p => p.id === 'mrc3').costo === 4000);
  }
  {
    const v = armar();
    v.ctx.openCompraModal('L1');
    v.ctx.compraAgregar('mrc1');
    v.ctx.compraCampo(0, 'cantidad', '1000');
    v.ctx.compraCampo(0, 'costoBolsa', '4500');
    await v.ctx.guardarCompra();
    const act = v.preguntas.find(p => p.titulo === '¿Actualizar el costo?');
    t('en la bolsa de 1 kg el aviso no repite el kilo',
      act && act.m.indexOf('Mani RC x 1 kg\n- Tenía cargado: $4.000 la bolsa\n- En esta compra: $4.500 la bolsa\n') >= 0 && act.m.indexOf('el kilo)') < 0, act && act.m);
  }
  t('con una bolsa entera o más, no se pregunta por la cantidad', !w.preguntas.some(p => p.titulo === 'Revisá la cantidad'));
  {
    /* Revisión del 29/09: escribir 2 pensando en 2 bolsas carga 2 g, y la cuenta da $8. */
    const armarDos = respuestas => {
      const v = armar({ respuestas });
      v.ctx.openCompraModal('L1');
      v.ctx.compraAgregar('mrc3');
      v.ctx.compraAgregar('gal');
      v.ctx.compraCampo(0, 'cantidad', '2');
      v.ctx.compraCampo(0, 'costoBolsa', '12000');
      v.ctx.compraCampo(1, 'cantidad', '3');
      return v;
    };
    const v = armarDos({ 'Revisá la cantidad': false });
    await v.ctx.guardarCompra();
    const p = v.preguntas.find(x => x.titulo === 'Revisá la cantidad');
    t('una bolsa con menos de una bolsa (2 g de la de 3 kg) pregunta antes de guardar',
      p && p.m.indexOf('La cantidad va en gramos') === 0 && p.m.indexOf('• Mani RC x 3 kg: 2 g (una bolsa son 3 kg)') > 0 &&
      p.m.indexOf('2 bolsas de 3 kg son 6000 gramos') > 0, p && p.m);
    t('  y no nombra lo que no es bolsa (3 Galletas)', p && p.m.indexOf('Galletas') < 0);
    t('  "Volver y corregir" no guarda nada', v.guardadas.length === 0 && !v.preguntas.some(x => x.titulo === 'Guardar compra'));
    const v2 = armarDos({ 'Revisá la cantidad': true });
    await v2.ctx.guardarCompra();
    t('  "Guardar igual" sigue como siempre', v2.guardadas.length === 1 && v2.guardadas[0].items.find(i => i.id === 'mrc3').subtotal === 8);
  }
  {
    /* Sacar una fila de adentro de un recuadro: el otro tamaño queda en su recuadro, con los
       números de fila nuevos. */
    const v = armar();
    v.ctx.openCompraModal('L1');
    v.ctx.compraAgregar('mrc3');
    v.ctx.compraAgregar('alm');
    v.ctx.compraAgregar('mrc1');
    v.ctx.compraQuitar(0);
    const h = v.el('compraItems').innerHTML;
    const r = recuadros(h);
    t('sacar la de 3 kg deja la de 1 kg en su recuadro, con su fila nueva (1)',
      v.items().map(i => i.id).join() === 'alm,mrc1' && r.length === 1 && /id="cpCant1"/.test(r[0]) &&
      r[0].indexOf('cpCant0') < 0 && textoDe(r[0]).indexOf('Mani RC Mani RC x 1 kg') === 0);
    t('  y la de 3 kg vuelve a la lista para agregar', botones(v.el('compraLista').innerHTML).indexOf('mrc3(grupo)') >= 0);
  }

  console.log('\n-- ver la compra --');
  {
    const v = armar();
    vm.runInContext('_comprasCache = { lista: [{ docId: "c1", numero: 7, proveedorNombre: "FRUTICOR", total: 19000, items: [' +
      '{ id: "mrc3", nombre: "Mani RC x 3 kg", tipoVenta: "peso", cantidad: 3000, costoUnitario: 4000, costoBolsa: 12000, gramosBolsa: 3000, subtotal: 12000 },' +
      '{ id: "alm", nombre: "Almendra", tipoVenta: "peso", cantidad: 500, costoUnitario: 14000, subtotal: 7000 }] }] }', v.ctx);
    v.ctx.verCompra('c1');
    const h = v.el('compraVerBody').innerHTML;
    t('al ver una compra, la bolsa dice lo que costó la bolsa', h.indexOf('$12.000/bolsa') > 0);
    t('  y la Almendra, el kilo', h.indexOf('$14.000/kg') > 0);
  }
  {
    /* Pedido del dueño (29/09): al abrir una compra guardada, las bolsas de un producto van
       juntas, como al cargarla, y se entiende cuántas entraron. */
    const ITEMS = '[' +
      '{ id: "mrc3", nombre: "Mani RC x 3 kg", tipoVenta: "peso", cantidad: 6000, costoUnitario: 4000, costoBolsa: 12000, gramosBolsa: 3000, subtotal: 24000 },' +
      '{ id: "alm", nombre: "Almendra", tipoVenta: "peso", cantidad: 500, costoUnitario: 14000, subtotal: 7000 },' +
      '{ id: "mrc1", nombre: "Mani RC x 1 kg", tipoVenta: "peso", cantidad: 2000, costoUnitario: 4000, costoBolsa: 4000, gramosBolsa: 1000, subtotal: 8000 }]';
    const v = armar();
    vm.runInContext('_comprasCache = { lista: [{ docId: "c2", numero: 8, proveedorNombre: "FRUTICOR", total: 39000, items: ' + ITEMS + ' }] }', v.ctx);
    v.ctx.verCompra('c2');
    const h = v.el('compraVerBody').innerHTML;
    const r = recuadros(h);
    t('al ver la compra, las dos bolsas del Mani RC van en UN recuadro', r.length === 1);
    t('  arriba el producto y lo que se pagó por las dos: "Mani RC $32.000"',
      r[0] && /^Mani RC \$32\.000 /.test(textoDe(r[0])), r[0] && textoDe(r[0]));
    t('  sin "2 bolsas" en la cabecera, que se leería como las bolsas que entraron',
      r[0] && r[0].indexOf('cp-grupo-que') < 0);
    t('  abajo cada bolsa, de menor a mayor, con cuántas bolsas entraron',
      r[0] && textoDe(r[0]).indexOf('Mani RC x 1 kg 2 kg (2 bolsas) $4.000/bolsa $8.000 Mani RC x 3 kg 6 kg (2 bolsas) $12.000/bolsa $24.000') > 0,
      r[0] && textoDe(r[0]));
    t('  y la Almendra, suelta como siempre, después del recuadro',
      textoDe(h.slice(h.indexOf(r[0]) + r[0].length)).indexOf('Almendra 500 g $14.000/kg $7.000') === 0, textoDe(h));
    const x = v.ctx._cpDocExportar(v.ctx._cpVerActual || vm.runInContext('_cpVerActual', v.ctx));
    const f = x.bloques[1].filas.map(fila => fila.join(' ; '));
    t('la exportación, igual: el producto sin monto (no se suma dos veces) y abajo cada bolsa',
      f.join(' / ') === 'Mani RC ;  ;  ;  / · Mani RC x 1 kg (2 bolsas) ; 2 kg ; $4.000/bolsa ; $8.000 / ' +
        '· Mani RC x 3 kg (2 bolsas) ; 6 kg ; $12.000/bolsa ; $24.000 / Almendra ; 500 g ; $14.000/kg ; $7.000 / TOTAL ;  ;  ; $39.000',
      f.join(' / '));
    vm.runInContext(leer('admin-deudas.js'), v.ctx);
    const d = v.ctx._deuRenglones(vm.runInContext(ITEMS, v.ctx));
    t('en Deudas, la compra desplegada también: una fila con el producto y el total, y abajo cada bolsa',
      d.indexOf('<tr class="deu-grupo"><td colspan="2"><i class="bi bi-stack"></i> Mani RC</td><td class="num">$32.000</td></tr>' +
        '<tr class="deu-tam"><td>Mani RC x 1 kg</td><td class="num">2 kg (2 bolsas)</td><td class="num">$8.000</td></tr>' +
        '<tr class="deu-tam"><td>Mani RC x 3 kg</td><td class="num">6 kg (2 bolsas)</td><td class="num">$24.000</td></tr>') === 0 &&
      d.indexOf('<tr><td>Almendra</td><td class="num">500 g</td><td class="num">$7.000</td></tr>') > 0, d);
    t('  una bolsa que no es entera dice cuántas son', v.ctx._cpBolsasTxt({ tipoVenta: 'peso', cantidad: 9999, gramosBolsa: 3000 }) === '3,33 bolsas' &&
      v.ctx._cpBolsasTxt({ tipoVenta: 'peso', cantidad: 1000, gramosBolsa: 1000 }) === '1 bolsa');
  }
  {
    const v = armar({ sinVariantes: true });
    vm.runInContext('_comprasCache = { lista: [{ docId: "c3", numero: 9, total: 15000, items: [' +
      '{ id: "mrc3", nombre: "Mani RC x 3 kg", tipoVenta: "peso", cantidad: 3000, costoUnitario: 4000, subtotal: 12000 },' +
      '{ id: "mrc1", nombre: "Mani Recubierto de Chocolate", tipoVenta: "peso", cantidad: 1000, costoUnitario: 3000, subtotal: 3000 }] }] }', v.ctx);
    v.ctx.verCompra('c3');
    const h = v.el('compraVerBody').innerHTML;
    t('sin admin-variantes.js la compra guardada se ve como antes, un renglón por producto',
      h.indexOf('cp-grupo') < 0 && textoDe(h).indexOf('Mani RC x 3 kg 3 kg $4.000/kg $12.000 Mani Recubierto de Chocolate 1 kg $3.000/kg $3.000') >= 0,
      textoDe(h));
  }

  console.log('\n-- escanear --');
  {
    const v = armar();
    v.ctx.openCompraModal('L1');
    v.ctx.compraEscanear(v.ctx.allProducts.find(p => p.id === 'mrc3'));
    const it = v.items()[0] || {};
    t('escanear una bolsa la agrega igual que tocarla en la lista', it.gramosBolsa === 3000 && it.costoBolsa === 9999 && it.nombre === 'Mani RC x 3 kg');
  }

  console.log('\n-- un producto por peso sin otras bolsas --');
  {
    /* Pedido del dueño (30/09): un producto por peso sin otras bolsas también se carga por
       bolsa, si dice de cuánto es (en el nombre o en el campo de tamaño). En producción, 470
       de 588 lo dicen. Al que no lo dice, la compra le pregunta de cuánto es la bolsa, y al
       guardar queda anotado en el producto. */
    const prods = catalogo().concat([
      P('len', { nombre: 'Lenteja Turca x 5 kg', tipoVenta: 'peso', costo: 2000, codigo: 'LEN' }),
      P('har', { nombre: 'Harina Integral', gramaje: '25 kg', tipoVenta: 'peso', costo: 1800, codigo: 'HAR' }),
      P('lt1', { nombre: 'Lenteja x 1 kg', tipoVenta: 'peso', costo: 2500, codigo: 'LT1' }),
    ]);
    const w = armar({ productos: prods });
    w.ctx.openCompraModal('L1');
    const h = w.el('compraLista').innerHTML;
    t('si dice de cuánto es la bolsa ("x 5 kg"), la lista muestra lo que cuesta la bolsa y el kilo',
      h.indexOf('LEN · costo $10.000 la bolsa ($2.000 el kilo)') > 0);
    t('  también si el tamaño está en el campo de tamaño, y como el nombre no lo dice, se dice: "la bolsa de 25 kg"',
      h.indexOf('HAR · costo $45.000 la bolsa de 25 kg ($1.800 el kilo)') > 0);
    t('  si el nombre ya lo dice ("x 5 kg"), no se repite', h.indexOf('LEN · costo $10.000 la bolsa ($2.000 el kilo)') > 0);
    const de = (n, g) => w.ctx._cpDeBolsa(n, g);
    t('  " de 2 kg" solo si el nombre no dice ese tamaño',
      de('Mani RC', 2000) === ' de 2 kg' && de('Lenteja x 5 kg', 5000) === '' && de('Mani RC x 3 kg', 3000) === '' &&
      de('Lenteja x 5 kg', 1000) === ' de 1 kg' && de('Mani RC', 500) === ' de 500 g' && de('Mani RC', 0) === '');
    t('  la de 1 kg, solo la bolsa (el kilo es lo mismo)', h.indexOf('LT1 · costo $2.500 la bolsa<') > 0);
    t('  el que no dice de cuánto es la bolsa, en la lista, por kilo', h.indexOf('ALM · costo $14.000 el kilo') > 0);
    t('  y ninguno va en un recuadro: no tienen otras bolsas',
      botones(h).filter(x => /^(len|har|lt1)/.test(x)).join() === 'len,har,lt1', botones(h).join());
    w.ctx.compraAgregar('len');
    w.ctx.compraAgregar('alm');
    const it = w.items();
    t('al agregarlo entra como bolsa de 5 kg, con lo que cuesta la bolsa',
      it[0].gramosBolsa === 5000 && it[0].costoBolsa === 10000 && it[0].costoUnitario === 2000);
    const filas = w.el('compraItems').innerHTML;
    t('  la fila pide "Costo de la bolsa" y al lado dice el kilo',
      /<span>Costo de la bolsa<\/span><input [^>]*value="10000" oninput="compraCampo\(0,'costoBolsa',this.value\)"/.test(filas) &&
      filas.indexOf('<span class="cp-kilo" id="cpKilo0">$2.000 el kilo</span>') > 0);
    t('  suelta, sin recuadro', recuadros(filas).length === 0);
    t('la Almendra, que no dice de cuánto es la bolsa, la pregunta: "¿De cuánto es la bolsa?"',
      w.items()[1].sinTam === true && w.items()[1].gramosBolsa === undefined &&
      filas.indexOf('<span id="cpBolsaEtq1">¿De cuánto es la bolsa?</span>') > 0);
    t('  y el costo de la bolsa espera apagado, con "falta la bolsa" al lado',
      /id="cpBolsa1" value="" disabled/.test(filas) && filas.indexOf('<span class="cp-kilo falta" id="cpKilo1">falta la bolsa</span>') > 0);
    t('  la pregunta va solo en esa fila', (filas.match(/¿De cuánto es la bolsa\?/g) || []).length === 1);
    w.ctx.compraCampo(0, 'costoBolsa', '12500');
    w.ctx.compraCampo(0, 'cantidad', '10000');
    t('$12.500 la bolsa de 5 kg son $2.500 el kilo, y dos bolsas (10.000 g) $25.000',
      w.items()[0].costoUnitario === 2500 && w.el('cpKilo0').textContent === '$2.500 el kilo' && w.el('cpSub0').textContent === '$25.000',
      w.el('cpKilo0').textContent + ' / ' + w.el('cpSub0').textContent);
    w.ctx.compraCampo(1, 'cantidad', '25000');
    await w.ctx.guardarCompra();
    t('sin decir de cuánto es la bolsa, no se guarda: lo pide',
      w.guardadas.length === 0 && w.avisos.some(a => a.indexOf('Falta de cuánto es la bolsa de: Almendra') >= 0), w.avisos.join(' / '));
    const lee = (s, u) => w.ctx._cpGramosEscritos(s, u);
    t('el número con la unidad del selector (pedido del dueño, 30/09): 5 kg, 2,5 kg, 0,5 kg, 500 g',
      lee('5', 'kg') === 5000 && lee('2,5', 'kg') === 2500 && lee('2.5', 'kg') === 2500 && lee('0,5', 'kg') === 500 && lee('500', 'g') === 500);
    t('  sin adivinar: "500" con kg son 500 kg, y "5" con g son 5 g', lee('500', 'kg') === 500000 && lee('5', 'g') === 5);
    t('  lo que no es un número, nada (la unidad va en el selector)',
      lee('', 'kg') === null && lee('abc', 'kg') === null && lee('0', 'kg') === null && lee('-3', 'kg') === null && lee('5 kg', 'kg') === null);
    w.ctx.compraCampo(1, 'bolsa', '5');
    const a1 = w.items()[1];
    t('escrito "5": bolsa de 5 kg, con el costo de la bolsa desde el kilo que tenía ($70.000)',
      a1.gramosBolsa === 5000 && a1.costoBolsa === 70000 && a1.costoUnitario === 14000 &&
      w.el('cpBolsaEtq1').textContent === 'Bolsa de 5 kg' && w.el('cpBolsa1').disabled === false && w.el('cpBolsa1').value === 70000 &&
      w.el('cpKilo1').textContent === '$14.000 el kilo' && w.el('cpKilo1').className === 'cp-kilo');
    w.ctx.compraCampo(1, 'costoBolsa', '75000');
    t('  $75.000 la bolsa de 5 kg son $15.000 el kilo', w.items()[1].costoUnitario === 15000 && w.el('cpKilo1').textContent === '$15.000 el kilo');
    w.ctx.compraCampo(1, 'bolsa', '25');
    t('  si se corrige a 25 kg, el costo que se escribió se respeta: $75.000 la de 25 kg son $3.000 el kilo',
      w.items()[1].gramosBolsa === 25000 && w.items()[1].costoBolsa === 75000 && w.items()[1].costoUnitario === 3000 &&
      w.el('cpBolsaEtq1').textContent === 'Bolsa de 25 kg');
    w.ctx.compraCampo(1, 'bolsa', '');
    t('  si se borra, vuelve a faltar: el costo se apaga y el kilo vuelve al de siempre',
      w.items()[1].gramosBolsa === undefined && w.items()[1].costoUnitario === 14000 && w.el('cpBolsa1').disabled === true &&
      w.el('cpKilo1').textContent === 'falta la bolsa' && w.el('cpKilo1').className === 'cp-kilo falta');
    w.ctx.compraCampo(1, 'bolsa', '25');
    t('  y al volver a escribirlo, vuelve el costo que se había puesto', w.items()[1].costoBolsa === 75000 && w.el('cpBolsa1').value === 75000);
    w.ctx.renderCompraItems();
    const otra = w.el('compraItems').innerHTML;
    t('  si la lista se vuelve a dibujar, queda lo escrito',
      otra.indexOf('<span id="cpBolsaEtq1">Bolsa de 25 kg</span>') > 0 && otra.indexOf('placeholder="Ej: 5" value="25"') > 0 &&
      otra.indexOf('<option value="kg" selected>kg</option>') > 0 &&
      /id="cpBolsa1" value="75000" oninput/.test(otra) && otra.indexOf('<span class="cp-kilo" id="cpKilo1">$3.000 el kilo</span>') > 0);
    w.ctx.compraCampo(1, 'bolsaUnidad', 'g');
    t('  con "g" en el selector, el mismo 25 son 25 g: "Bolsa de 25 g", y el costo escrito se respeta',
      w.items()[1].gramosBolsa === 25 && w.items()[1].costoBolsa === 75000 && w.el('cpBolsaEtq1').textContent === 'Bolsa de 25 g');
    w.ctx.renderCompraItems();
    t('  y si la lista se vuelve a dibujar, el selector sigue en g',
      w.el('compraItems').innerHTML.indexOf('<option value="kg">kg</option><option value="g" selected>g</option>') > 0);
    w.ctx.compraCampo(1, 'bolsaUnidad', 'kg');
    t('  de vuelta en kg, 25 kg y $3.000 el kilo',
      w.items()[1].gramosBolsa === 25000 && w.items()[1].costoUnitario === 3000 && w.el('cpBolsaEtq1').textContent === 'Bolsa de 25 kg');
    await w.ctx.guardarCompra();
    const conf = w.preguntas.find(p => p.titulo === 'Guardar compra');
    t('al guardar, el resumen avisa que la bolsa queda anotada en el producto',
      conf && conf.m.indexOf('- Almendra: 25 kg a $75.000 la bolsa de 25 kg (el tamaño queda anotado en el producto)') >= 0, conf && conf.m);
    const c = w.guardadas[0] || { items: [] };
    const len = c.items.find(i => i.id === 'len') || {};
    const al = c.items.find(i => i.id === 'alm') || {};
    t('  la Almendra se guarda como bolsa de 25 kg', al.gramosBolsa === 25000 && al.costoBolsa === 75000 && al.costoUnitario === 3000 && al.subtotal === 75000);
    t('  y su bolsa queda anotada en el producto ("25 kg"), y a la Lenteja, que ya lo decía, no se le escribe nada',
      w.escrituras.some(e => e.id === 'alm' && e.d.gramaje === '25 kg') && !w.escrituras.some(e => e.id === 'len' && e.d.gramaje !== undefined) &&
      w.ctx.allProducts.find(p => p.id === 'alm').gramaje === '25 kg');
    w.ctx.openCompraModal('L1');
    w.ctx.compraAgregar('alm');
    t('  la próxima compra ya la pide por bolsa, sin preguntar',
      w.items()[0].gramosBolsa === 25000 && !w.items()[0].sinTam && w.el('compraItems').innerHTML.indexOf('¿De cuánto es la bolsa?') < 0);
    t('  y dice qué bolsa es: "Costo de la bolsa de 25 kg" (el nombre "Almendra" no lo dice)',
      textoDe(w.el('compraItems').innerHTML).indexOf('Costo de la bolsa de 25 kg') >= 0 &&
      w.el('compraItems').innerHTML.indexOf('<span style="white-space:nowrap">de 25 kg</span>') > 0);
    w.ctx.compraCampo(0, 'cantidad', '50000');
    t('  al guardarla, la cantidad dice cuántas bolsas y de cuánto', w.ctx._cpCantBolsas(w.items()[0]) === '50 kg (2 bolsas de 25 kg)');
    w.ctx.compraQuitar(0);
    t('  y la lista para agregar también: "la bolsa de 25 kg"', w.el('compraLista').innerHTML.indexOf('ALM · costo $75.000 la bolsa de 25 kg ($3.000 el kilo)') > 0);
    t('se guarda como bolsa: lo que costó la bolsa, de cuánto era y el kilo',
      len.costoBolsa === 12500 && len.gramosBolsa === 5000 && len.costoUnitario === 2500 && len.subtotal === 25000);
    const act = w.preguntas.find(p => p.titulo === '¿Actualizar los costos?');
    t('  y el aviso de costos lo dice por bolsa, y con dos productos, en plural',
      act && act.m.indexOf('Lenteja Turca x 5 kg\n- Tenía cargado: $10.000 la bolsa ($2.000 el kilo)\n- En esta compra: $12.500 la bolsa ($2.500 el kilo)') >= 0 &&
      act.m.indexOf('Almendra\n- Tenía cargado: $350.000 la bolsa de 25 kg ($14.000 el kilo)\n- En esta compra: $75.000 la bolsa de 25 kg ($3.000 el kilo)') >= 0 &&
      act.m.indexOf('En esta compra pagaste distinto de lo que tenían cargado estos productos:') === 0 &&
      act.m.indexOf('Si tocás "Actualizar", quedan con el costo de esta compra.') > 0, act && act.m);
  }
  {
    const v = armar({ productos: catalogo().concat([P('len', { nombre: 'Lenteja Turca x 5 kg', tipoVenta: 'peso', costo: 2000 })]),
      respuestas: { 'Revisá la cantidad': false } });
    v.ctx.openCompraModal('L1');
    v.ctx.compraAgregar('len');
    v.ctx.compraCampo(0, 'cantidad', '2');
    await v.ctx.guardarCompra();
    t('escribir 2 pensando en 2 bolsas también avisa que es menos de una bolsa',
      v.preguntas.some(p => p.titulo === 'Revisá la cantidad' && p.m.indexOf('Lenteja Turca x 5 kg: 2 g (una bolsa son 5 kg)') > 0) && v.guardadas.length === 0);
  }

  console.log('\n-- sin admin-variantes.js --');
  {
    const v = armar({ sinVariantes: true });
    v.ctx.openCompraModal('L1');
    const h = v.el('compraLista').innerHTML;
    t('la lista sale igual, sin recuadros', h.indexOf('cp-grupo') < 0 && botones(h).length === 8, botones(h).join());
    t('  y el costo por kilo', h.indexOf('MRC3 · costo $3.333 el kilo') > 0);
    v.ctx.compraAgregar('mrc3');
    const it = v.items()[0];
    t('  agregar anda, por kilo', it.nombre === 'Mani RC x 3 kg' && it.gramosBolsa === undefined && it.costoUnitario === 3333);
    t('  y la fila pide el costo por kilo', v.el('compraItems').innerHTML.indexOf('<span>Costo por kilo</span>') > 0);
  }

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERROR ' + (e && e.stack || e)); process.exit(1); });
