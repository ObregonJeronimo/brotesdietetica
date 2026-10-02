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
const COSTOS = leer('admin-costos.js');
const ESC = leer('admin-escalas.js');

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
      preguntas.push({ titulo: op && op.titulo, m, aceptar: op && op.aceptar, cancelar: op && op.cancelar, foco: op && op.focoEnNo });
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
  /* Los precios por cantidad de un grupo (el aviso de la bolsa más cara por kilo). */
  if (o.sinVariantes !== true) vm.runInContext(ESC, ctx);
  /* La cuenta de los precios (preciosDesdeCosto) y lo de al lado del costo (_costoVistaHtml). */
  vm.runInContext(COSTOS, ctx);
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
    t('  y al lado, cómo queda: el kilo, el precio y el mayorista (01/10)',
      r[0].indexOf('<span class="cp-kilo cp-vista" id="cpKilo0"><span>Costo $3.333 el kilo</span><span>Precio <b>$') > 0 &&
      r[0].indexOf('<span class="cp-kilo cp-vista" id="cpKilo2"><span>Costo $4.000 el kilo</span><span>Precio <b>$') > 0, r[0]);
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
    t('  y lo de al lado se actualiza', w.el('cpKilo0').innerHTML.indexOf('<span>Costo $4.000 el kilo</span>') === 0, w.el('cpKilo0').innerHTML);
    w.ctx.compraCampo(0, 'cantidad', '6000');
    t('  dos bolsas (6.000 g) a $12.000 son $24.000', w.el('cpSub0').value === '24000', w.el('cpSub0').value);
    w.ctx.compraCampo(0, 'costoBolsa', '10000');
    w.ctx.compraCampo(0, 'cantidad', '3000');
    t('  el subtotal sale de la bolsa, no del kilo redondeado: 3 kg a $10.000 son $10.000 (no $9.999)',
      w.el('cpSub0').value === '10000' && w.items()[0].costoUnitario === 3333, w.el('cpSub0').value);
    w.ctx.compraCampo(1, 'cantidad', '500');
    t('la Almendra, sin decir de cuánto es la bolsa, todavía no cuenta: el total, vacío', w.el('cpSub1').value === '', w.el('cpSub1').value);
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
      v.items()[0].costoUnitario === 3001 && v.el('cpKilo0').innerHTML.indexOf('<span>Costo $3.001 el kilo</span>') === 0);
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
    t('  y su bolsa de 500 g queda anotada en el producto, aparte (bolsaGramos), para la próxima',
      w.escrituras.some(e => e.col === 'productos' && e.id === 'alm' && e.d.bolsaGramos === 500) &&
      w.ctx.allProducts.find(p => p.id === 'alm').bolsaGramos === 500);
    t('  a las que ya decían su tamaño no se les escribe nada', !w.escrituras.some(e => e.d.bolsaGramos !== undefined && e.id !== 'alm'));
    t('  y Gramaje / Presentación no se toca: es lo que ve el cliente (01/10)', !w.escrituras.some(e => e.d.gramaje !== undefined));
    const stock = w.escrituras.filter(e => e.d.stock).map(e => e.id + '+' + e.d.stock.__inc).join();
    t('el stock sube en gramos, como siempre', stock === 'mrc3+3000,alm+500,mrc1+2000', stock);
    const act = w.preguntas.find(p => p.titulo === '¿Actualizar el costo?');
    t('el aviso de costos dice, en dos renglones, lo que tenía cargado y lo que se pagó: la bolsa y el kilo (30/09)',
      act && act.m.indexOf('Mani RC x 3 kg\n- Tenía cargado: $9.999 la bolsa ($3.333 el kilo)\n- En esta compra: $12.000 la bolsa ($4.000 el kilo)') >= 0, act && act.m);
    t('  sin flechas, dice qué pasa al actualizar, y los botones se entienden',
      act && act.m.indexOf('→') < 0 && act.m.indexOf('En esta compra pagaste distinto de lo que tenía cargado el producto:') === 0 &&
      act.m.indexOf('Si tocás "Actualizar", el producto queda con el costo de esta compra, y el precio y el mayorista se recalculan con el mismo porcentaje de siempre.') > 0 &&
      act.aceptar === 'Actualizar' && act.cancelar === 'Dejar como estaba', act && act.m);
    t('  y no nombra a los que no cambiaron', act && act.m.indexOf('Almendra') < 0 && act.m.indexOf('x 1 kg') < 0);
    const costos = w.escrituras.filter(e => e.d.costo !== undefined).map(e => e.id + '=' + e.d.costo).join();
    t('  al aceptar, se guarda el kilo', costos === 'mrc3=4000', costos);
    t('  y queda en memoria', w.ctx.allProducts.find(p => p.id === 'mrc3').costo === 4000);
    const conFecha = w.escrituras.find(e => e.id === 'mrc3' && e.d.costo !== undefined);
    const enMemoria = w.ctx.allProducts.find(p => p.id === 'mrc3').costoActualizadoEn;
    t('  con la fecha del cambio en la misma escritura y en memoria: no queda "desactualizado" hasta F5 (revisión del 01/10)',
      !!conFecha && conFecha.d.costoActualizadoEn === 'ahora' && enMemoria instanceof Date && Date.now() - enMemoria.getTime() < 60000,
      JSON.stringify(conFecha && conFecha.d));
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
       bolsa, si dice de cuánto es: en el nombre, o anotado aparte (bolsaGramos). En producción,
       470 de 588 lo dicen en el nombre. Al que no lo dice, la compra le pregunta de cuánto es la
       bolsa, y al guardar queda anotado en el producto. Gramaje / Presentación no cuenta: es lo
       que ve el cliente (01/10). */
    const prods = catalogo().concat([
      P('len', { nombre: 'Lenteja Turca x 5 kg', tipoVenta: 'peso', costo: 2000, codigo: 'LEN' }),
      P('har', { nombre: 'Harina Integral', bolsaGramos: 25000, tipoVenta: 'peso', costo: 1800, codigo: 'HAR' }),
      P('lt1', { nombre: 'Lenteja x 1 kg', tipoVenta: 'peso', costo: 2500, codigo: 'LT1' }),
      P('pan', { nombre: 'Pan Rallado', gramaje: '500 g', tipoVenta: 'peso', costo: 1000, codigo: 'PAN' }),
    ]);
    const w = armar({ productos: prods });
    w.ctx.openCompraModal('L1');
    const h = w.el('compraLista').innerHTML;
    t('si dice de cuánto es la bolsa ("x 5 kg"), la lista muestra lo que cuesta la bolsa y el kilo',
      h.indexOf('LEN · costo $10.000 la bolsa ($2.000 el kilo)') > 0);
    t('  también si quedó anotada aparte (bolsaGramos), y como el nombre no lo dice, se dice: "la bolsa de 25 kg"',
      h.indexOf('HAR · costo $45.000 la bolsa de 25 kg ($1.800 el kilo)') > 0);
    t('  Gramaje / Presentación ("500 g") no es la bolsa: es lo que ve el cliente; ese va por kilo y la compra pregunta (01/10)',
      h.indexOf('PAN · costo $1.000 el kilo') > 0 && w.ctx._cpSinTam(w.ctx.allProducts.find(p => p.id === 'pan')) === true);
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
      filas.indexOf('<span class="cp-kilo cp-vista" id="cpKilo0"><span>Costo $2.000 el kilo</span>') > 0);
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
      w.items()[0].costoUnitario === 2500 && w.el('cpKilo0').innerHTML.indexOf('<span>Costo $2.500 el kilo</span>') === 0 && w.el('cpSub0').value === '25000',
      w.el('cpKilo0').innerHTML + ' / ' + w.el('cpSub0').value);
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
    t('  en gramos el punto es de miles: "1.500" g son 1.500 g, no 2 g (revisión del 01/10)', lee('1.500', 'g') === 1500 && lee('1.500', 'kg') === 1500);
    t('  "5," y ",5", a medio escribir, se entienden: 5 kg y medio kilo', lee('5,', 'kg') === 5000 && lee(',5', 'kg') === 500);
    w.ctx.compraCampo(1, 'bolsa', '5');
    const a1 = w.items()[1];
    t('escrito "5": bolsa de 5 kg, con el costo de la bolsa desde el kilo que tenía ($70.000)',
      a1.gramosBolsa === 5000 && a1.costoBolsa === 70000 && a1.costoUnitario === 14000 &&
      w.el('cpBolsaEtq1').textContent === 'Bolsa de 5 kg' && w.el('cpBolsa1').disabled === false && w.el('cpBolsa1').value === '70000' &&
      w.el('cpKilo1').innerHTML.indexOf('<span>Costo $14.000 el kilo</span>') === 0 && w.el('cpKilo1').className === 'cp-kilo cp-vista');
    w.ctx.compraCampo(1, 'costoBolsa', '75000');
    t('  $75.000 la bolsa de 5 kg son $15.000 el kilo', w.items()[1].costoUnitario === 15000 && w.el('cpKilo1').innerHTML.indexOf('<span>Costo $15.000 el kilo</span>') === 0);
    w.ctx.compraCampo(1, 'bolsa', '25');
    t('  si se corrige a 25 kg, el costo que se escribió se respeta: $75.000 la de 25 kg son $3.000 el kilo',
      w.items()[1].gramosBolsa === 25000 && w.items()[1].costoBolsa === 75000 && w.items()[1].costoUnitario === 3000 &&
      w.el('cpBolsaEtq1').textContent === 'Bolsa de 25 kg');
    w.ctx.compraCampo(1, 'bolsa', '');
    t('  si se borra, vuelve a faltar: el costo se apaga y el kilo vuelve al de siempre',
      w.items()[1].gramosBolsa === undefined && w.items()[1].costoUnitario === 14000 && w.el('cpBolsa1').disabled === true &&
      w.el('cpKilo1').innerHTML === 'falta la bolsa' && w.el('cpKilo1').className === 'cp-kilo falta');
    w.ctx.compraCampo(1, 'bolsa', '25');
    t('  y al volver a escribirlo, vuelve el costo que se había puesto', w.items()[1].costoBolsa === 75000 && w.el('cpBolsa1').value === '75000');
    w.ctx.renderCompraItems();
    const otra = w.el('compraItems').innerHTML;
    t('  si la lista se vuelve a dibujar, queda lo escrito',
      otra.indexOf('<span id="cpBolsaEtq1">Bolsa de 25 kg</span>') > 0 && otra.indexOf('placeholder="Ej: 5" id="cpTam1" value="25"') > 0 &&
      otra.indexOf('<option value="kg" selected>kg</option>') > 0 &&
      /id="cpBolsa1" value="75000" oninput/.test(otra) && otra.indexOf('<span class="cp-kilo cp-vista" id="cpKilo1"><span>Costo $3.000 el kilo</span>') > 0);
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
    t('  y su bolsa queda anotada en el producto, aparte (bolsaGramos 25000), y a la Lenteja, que ya lo decía, no se le escribe nada',
      w.escrituras.some(e => e.id === 'alm' && e.d.bolsaGramos === 25000) && !w.escrituras.some(e => e.id === 'len' && e.d.bolsaGramos !== undefined) &&
      w.ctx.allProducts.find(p => p.id === 'alm').bolsaGramos === 25000 && !w.escrituras.some(e => e.d.gramaje !== undefined));
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
      act.m.indexOf('Si tocás "Actualizar", quedan con el costo de esta compra, y el precio y el mayorista se recalculan con el mismo porcentaje de siempre.') > 0 &&
      /* Sin % de ganancia cargado (estos no lo tienen), el precio no se toca (revisión del 01/10). */
      act.m.split('- Precio: queda en $0 el kilo (no tiene % de ganancia cargado)').length === 3 &&
      (act.m.match(/- Mayorista nuevo: /g) || []).length === 2, act && act.m);
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

  console.log('\n-- actualizar el costo recalcula el precio (01/10) --');
  {
    /* Pedido del dueño (01/10): "Actualizar" en la compra cambiaba solo el costo y el precio quedaba
       atrasado sin aviso (en la prueba, el mayorista del Lino quedó igual al costo). Ahora el precio y
       el mayorista se recalculan con el mismo porcentaje, y se ven antes de confirmar. */
    const lin = () => [P('lin', { nombre: 'Semilla De Lino', tipoVenta: 'peso', costo: 4600, porcentaje: 90, precio: 8740,
      porcentajeMayorista: 30, precioMayorista: 6000, bolsaGramos: 5000, codigo: 'LIN' })];
    const w = armar({ productos: lin() });
    w.ctx.openCompraModal('L1');
    w.ctx.compraAgregar('lin');
    const antes = w.el('compraItems').innerHTML;
    t('al lado del costo de la bolsa: el kilo, el precio y el mayorista que tiene',
      antes.indexOf('<span class="cp-kilo cp-vista" id="cpKilo0"><span>Costo $4.600 el kilo</span><span>Precio <b>$8.740</b> el kilo</span>' +
        '<span class="vfe-may">Mayorista $6.000 el kilo</span></span>') > 0, antes);
    w.ctx.compraCampo(0, 'cantidad', '10000');
    w.ctx.compraCampo(0, 'costoBolsa', '30000');
    t('  con otro costo, los que va a tener: $30.000 la bolsa de 5 kg son $6.000 el kilo, precio $11.400 y mayorista $7.800',
      w.el('cpKilo0').innerHTML === '<span>Costo $6.000 el kilo</span><span>Precio <b>$11.400</b> el kilo</span><span class="vfe-may">Mayorista $7.800 el kilo</span>',
      w.el('cpKilo0').innerHTML);
    await w.ctx.guardarCompra();
    const act = w.preguntas.find(p => p.titulo === '¿Actualizar el costo?');
    t('el aviso dice el precio y el mayorista nuevos, con los de antes',
      !!act && act.m.indexOf('Semilla De Lino\n- Tenía cargado: $23.000 la bolsa de 5 kg ($4.600 el kilo)\n- En esta compra: $30.000 la bolsa de 5 kg ($6.000 el kilo)\n' +
        '- Precio nuevo: $11.400 el kilo (antes $8.740)\n- Mayorista nuevo: $7.800 el kilo (antes $6.000)') >= 0 &&
      act.m.indexOf('el precio y el mayorista se recalculan con el mismo porcentaje de siempre') > 0, act && act.m);
    const e = w.escrituras.find(x => x.id === 'lin' && x.d.costo !== undefined);
    t('  al actualizar se guardan el costo, el precio y el mayorista (antes, solo el costo)',
      !!e && e.d.costo === 6000 && e.d.precio === 11400 && e.d.precioMayorista === 7800 && e.d.costoActualizadoEn === 'ahora', JSON.stringify(e && e.d));
    const p = w.ctx.allProducts.find(x => x.id === 'lin');
    t('  y quedan en memoria', p.costo === 6000 && p.precio === 11400 && p.precioMayorista === 7800);
    t('  y el aviso de listo lo dice', w.avisos.some(a => a.indexOf('1 costo actualizado, con su precio nuevo') >= 0), w.avisos.join(' / '));
    const v = armar({ productos: lin(), respuestas: { '¿Actualizar el costo?': false } });
    v.ctx.openCompraModal('L1');
    v.ctx.compraAgregar('lin');
    v.ctx.compraCampo(0, 'cantidad', '10000');
    v.ctx.compraCampo(0, 'costoBolsa', '30000');
    await v.ctx.guardarCompra();
    const pv = v.ctx.allProducts.find(x => x.id === 'lin');
    t('"Dejar como estaba" no toca ni el costo ni el precio, y la compra se guarda igual',
      !v.escrituras.some(x => x.d.costo !== undefined || x.d.precio !== undefined) && pv.costo === 4600 && pv.precio === 8740 &&
      v.guardadas.length === 1);
  }
  {
    /* Pedido del dueño (01/10): si al actualizar una bolsa queda más cara por kilo que una más chica del
       mismo producto, se avisa y se pregunta. Y en un renglón por unidad, al lado del costo, el precio
       y el mayorista. */
    const prods = () => [
      P('g1', { nombre: 'Yerba', gramaje: '1 kg', tipoVenta: 'peso', costo: 4000, porcentaje: 50, precio: 6000, porcentajeMayorista: 20, precioMayorista: 4800, codigo: 'G1' }),
      P('g3', { nombre: 'Yerba x 3 kg', gramaje: '3 kg', tipoVenta: 'peso', gramajePadreId: 'g1', costo: 3500, porcentaje: 50, precio: 5250,
        porcentajeMayorista: 20, precioMayorista: 4200, codigo: 'G3' }),
      P('azu', { nombre: 'Azucar De Coco', costo: 13400, porcentaje: 90, precio: 25460, porcentajeMayorista: 30, precioMayorista: 17420, codigo: 'AZU' }),
    ];
    const cargar = w => {
      w.ctx.openCompraModal('L1');
      w.ctx.compraAgregar('g3');
      w.ctx.compraAgregar('azu');
      w.ctx.compraCampo(0, 'cantidad', '3000');
      w.ctx.compraCampo(0, 'costoBolsa', '13500');
      w.ctx.compraCampo(1, 'cantidad', '2');
    };
    const OJO = 'Ojo: la bolsa más grande quedaría más cara';
    const w = armar({ productos: prods(), respuestas: { [OJO]: false } });
    cargar(w);
    const fila = w.el('compraItems').innerHTML;
    t('en un renglón por unidad, al lado del costo c/u: el precio y el mayorista que tiene (01/10)',
      fila.indexOf('oninput="compraCampo(1,\'costoUnitario\',this.value)"></label><span class="cp-kilo cp-vista" id="cpKilo1">' +
        '<span>Precio <b>$25.460</b></span><span class="vfe-may">Mayorista $17.420</span></span>') > 0, fila);
    w.ctx.compraCampo(1, 'costoUnitario', '15000');
    t('  con otro costo, los que va a tener: $15.000 c/u, precio $28.500 y mayorista $19.500',
      w.el('cpKilo1').innerHTML === '<span>Precio <b>$28.500</b></span><span class="vfe-may">Mayorista $19.500</span>', w.el('cpKilo1').innerHTML);
    t('  y el subtotal de la fila, 2 × $15.000', w.el('cpSub1').value === '30000', w.el('cpSub1').value);
    t('  la bolsa sigue con lo suyo: $13.500 la de 3 kg son $4.500 el kilo, precio $6.750 y mayorista $5.400',
      w.el('cpKilo0').innerHTML === '<span>Costo $4.500 el kilo</span><span>Precio <b>$6.750</b> el kilo</span><span class="vfe-may">Mayorista $5.400 el kilo</span>',
      w.el('cpKilo0').innerHTML);
    await w.ctx.guardarCompra();
    const ojo = w.preguntas.find(p => p.titulo === OJO);
    t('si la bolsa de 3 kg queda más cara por kilo que la de 1 kg, avisa con los dos precios y pregunta (01/10)',
      !!ojo && ojo.m.indexOf('Yerba:\n- Bolsa de 1 kg: $6.000 el kilo\n- Bolsa de 3 kg: $6.750 el kilo, más cara') > 0 &&
      ojo.m.indexOf('Yerba (precio mayorista):\n- Bolsa de 1 kg: $4.800 el kilo\n- Bolsa de 3 kg: $5.400 el kilo, más cara') > 0 &&
      ojo.m.indexOf('Si tocás "No actualizar", esas bolsas quedan con el costo y el precio de antes y lo demás de la compra se actualiza igual. ' +
        'La compra ya quedó guardada. ¿Querés actualizar igual?') > 0 &&
      ojo.aceptar === 'Actualizar igual' && ojo.cancelar === 'No actualizar' && ojo.foco === true, ojo && ojo.m);
    t('  después del "¿Actualizar los costos?", que ya mostró los precios nuevos',
      w.preguntas.map(p => p.titulo).join(' > ') === 'Guardar compra > ¿Actualizar los costos? > ' + OJO, w.preguntas.map(p => p.titulo).join(' > '));
    const pw = id => w.ctx.allProducts.find(x => x.id === id);
    const eaw = w.escrituras.find(x => x.id === 'azu' && x.d.costo !== undefined);
    t('  "No actualizar" deja la bolsa como estaba y actualiza lo demás: el azúcar a $15.000 ($28.500 y $19.500) (revisión del 01/10)',
      !w.escrituras.some(x => x.id === 'g3' && (x.d.costo !== undefined || x.d.precio !== undefined)) && !!eaw && eaw.d.costo === 15000 &&
      eaw.d.precio === 28500 && eaw.d.precioMayorista === 19500 && pw('g3').costo === 3500 && pw('g3').precio === 5250 && pw('azu').precio === 28500 &&
      w.guardadas.length === 1 && w.guardadas[0].total === 43500, JSON.stringify(w.escrituras.map(x => [x.id, x.d.costo, x.d.precio])));
    const cw = w.escrituras.find(x => x.col === 'compras');
    t('  y la compra anota solo lo que se actualizó, con cómo estaba: el azúcar (02/10)', !!cw && JSON.stringify(cw.d.costosCambiados) === JSON.stringify([
      { id: 'azu', nombre: 'Azucar De Coco', antes: { costo: 13400, precio: 25460, precioMayorista: 17420, costoActualizadoEn: null },
        despues: { costo: 15000, precio: 28500, precioMayorista: 19500 } }]), JSON.stringify(cw && cw.d));
    const v = armar({ productos: prods() });
    cargar(v);
    v.ctx.compraCampo(1, 'costoUnitario', '15000');
    await v.ctx.guardarCompra();
    const e3 = v.escrituras.find(x => x.id === 'g3' && x.d.costo !== undefined);
    const ea = v.escrituras.find(x => x.id === 'azu' && x.d.costo !== undefined);
    t('  "Actualizar igual" guarda los dos: la bolsa a $4.500 el kilo ($6.750 y $5.400) y el azúcar a $15.000 ($28.500 y $19.500)',
      !!e3 && e3.d.costo === 4500 && e3.d.precio === 6750 && e3.d.precioMayorista === 5400 &&
      !!ea && ea.d.costo === 15000 && ea.d.precio === 28500 && ea.d.precioMayorista === 19500, JSON.stringify([e3 && e3.d, ea && ea.d]));
    const cv = v.escrituras.find(x => x.col === 'compras');
    t('  y la compra anota los dos, con cómo estaban: la bolsa a $3.500 el kilo y el azúcar a $13.400 (02/10)', !!cv &&
      cv.d.costosCambiados.map(x => x.id + ':' + x.antes.costo + '/' + x.antes.precio + '>' + x.despues.costo + '/' + x.despues.precio).join() ===
      'g3:3500/5250>4500/6750,azu:13400/25460>15000/28500', JSON.stringify(cv && cv.d));
    const z = armar({ productos: prods() });
    z.ctx.openCompraModal('L1');
    z.ctx.compraAgregar('g3');
    z.ctx.compraCampo(0, 'cantidad', '3000');
    z.ctx.compraCampo(0, 'costoBolsa', '11400');
    await z.ctx.guardarCompra();
    const e3z = z.escrituras.find(x => x.id === 'g3' && x.d.costo !== undefined);
    t('  si no queda más cara ($11.400 la bolsa = $3.800 el kilo, $5.700 y $4.600), no pregunta y actualiza',
      !z.preguntas.some(p => p.titulo === OJO) && !!e3z && e3z.d.costo === 3800 && e3z.d.precio === 5700 && e3z.d.precioMayorista === 4600,
      JSON.stringify(e3z && e3z.d));
  }
  {
    /* Pedido del dueño (01/10): con el % mayorista en 0, actualizar el costo deja el mayorista en 0
       (se cobra el de mostrador, con su aviso), no en el costo. */
    const gal = () => [P('gal', { nombre: 'Galletas De Arroz', costo: 1500, porcentaje: 65, precio: 2475, precioMayorista: 1500, codigo: 'GAL' })];
    const w = armar({ productos: gal() });
    w.ctx.openCompraModal('L1');
    w.ctx.compraAgregar('gal');
    const fila = w.el('compraItems').innerHTML;
    t('sin % mayorista, con el costo de siempre: el mayorista que tiene guardado (igual al costo)',
      fila.indexOf('<span class="cp-kilo cp-vista" id="cpKilo0"><span>Precio <b>$2.475</b></span><span class="vfe-may">Mayorista $1.500</span></span>') > 0, fila);
    w.ctx.compraCampo(0, 'cantidad', '10');
    w.ctx.compraCampo(0, 'costoUnitario', '1800');
    t('  con otro costo: "Sin mayorista: se cobra el de mostrador", no el costo (01/10)',
      w.el('cpKilo0').innerHTML === '<span>Precio <b>$2.970</b></span><span class="vfe-may">Sin mayorista: se cobra el de mostrador</span>', w.el('cpKilo0').innerHTML);
    await w.ctx.guardarCompra();
    const act = w.preguntas.find(p => p.titulo === '¿Actualizar el costo?');
    t('  el aviso lo dice: "Mayorista nuevo: ninguno, se cobra el de mostrador (antes $1.500)"',
      !!act && act.m.indexOf('- Precio nuevo: $2.970 (antes $2.475)\n- Mayorista nuevo: ninguno, se cobra el de mostrador (antes $1.500)') > 0, act && act.m);
    const e = w.escrituras.find(x => x.id === 'gal' && x.d.costo !== undefined);
    t('  y guarda el mayorista en 0: la venta mayorista cobra el de mostrador, con su aviso',
      !!e && e.d.costo === 1800 && e.d.precio === 2970 && e.d.precioMayorista === 0, JSON.stringify(e && e.d));
  }
  {
    /* Revisión del 01/10: el aviso de la bolsa más cara no salta con el mayorista viejo igual al costo,
       y si en la compra solo están las bolsas, "No actualizar" no actualiza nada. */
    const OJO = 'Ojo: la bolsa más grande quedaría más cara';
    const nuez = () => [
      P('n1', { nombre: 'Nuez', gramaje: '1 kg', tipoVenta: 'peso', costo: 10000, porcentaje: 60, precio: 16000, porcentajeMayorista: 0, precioMayorista: 10000, codigo: 'N1' }),
      P('n3', { nombre: 'Nuez x 3 kg', gramaje: '3 kg', tipoVenta: 'peso', gramajePadreId: 'n1', costo: 9000, porcentaje: 60, precio: 14400,
        porcentajeMayorista: 0, precioMayorista: 9000, codigo: 'N3' }),
    ];
    const w = armar({ productos: nuez() });
    w.ctx.openCompraModal('L1');
    w.ctx.compraAgregar('n3');
    w.ctx.compraCampo(0, 'cantidad', '3000');
    w.ctx.compraCampo(0, 'costoBolsa', '27900');
    await w.ctx.guardarCompra();
    const e3 = w.escrituras.find(x => x.id === 'n3' && x.d.costo !== undefined);
    t('bolsas con el % mayorista en 0 y el mayorista viejo igual al costo: actualizar la de 3 kg no avisa de más',
      !w.preguntas.some(p => p.titulo === OJO) && !!e3 && e3.d.costo === 9300 && e3.d.precio === 14880 && e3.d.precioMayorista === 0,
      w.preguntas.map(p => p.titulo).join(' > '));
    const yerba = () => [
      P('g1', { nombre: 'Yerba', gramaje: '1 kg', tipoVenta: 'peso', costo: 4000, porcentaje: 50, precio: 6000, porcentajeMayorista: 20, precioMayorista: 4800, codigo: 'G1' }),
      P('g3', { nombre: 'Yerba x 3 kg', gramaje: '3 kg', tipoVenta: 'peso', gramajePadreId: 'g1', costo: 3500, porcentaje: 50, precio: 5250,
        porcentajeMayorista: 20, precioMayorista: 4200, codigo: 'G3' }),
    ];
    const v = armar({ productos: yerba(), respuestas: { [OJO]: false } });
    v.ctx.openCompraModal('L1');
    v.ctx.compraAgregar('g3');
    v.ctx.compraCampo(0, 'cantidad', '3000');
    v.ctx.compraCampo(0, 'costoBolsa', '13500');
    await v.ctx.guardarCompra();
    const ov = v.preguntas.find(p => p.titulo === OJO);
    t('  con solo la bolsa en la compra, "No actualizar" no actualiza nada y no habla de "lo demás"',
      !!ov && ov.m.indexOf('Si tocás "No actualizar", esas bolsas quedan con el costo y el precio de antes. La compra ya quedó guardada.') > 0 &&
      !v.escrituras.some(x => x.d.costo !== undefined), ov && ov.m);
  }
  {
    /* Revisión del 01/10: sin % de ganancia el precio no se toca; si un precio baja, se marca; y con
       centavos, lo de al lado del costo da lo mismo que lo que se guarda. */
    const prods = () => [
      P('sp', { nombre: 'Chalitas Keto', costo: 0, porcentaje: 0, precio: 1800, precioMayorista: 0, codigo: 'SP' }),
      P('rd', { nombre: 'Te Verde', costo: 1000, porcentaje: 53, precio: 1600, precioMayorista: 0, codigo: 'RD' }),
      P('ct', { nombre: 'Barrita', costo: 1100, porcentaje: 50, precio: 1650, porcentajeMayorista: 30, precioMayorista: 1450, codigo: 'CT' }),
    ];
    const w = armar({ productos: prods() });
    w.ctx.openCompraModal('L1');
    ['sp', 'rd', 'ct'].forEach(id => w.ctx.compraAgregar(id));
    w.ctx.compraCampo(0, 'cantidad', '2'); w.ctx.compraCampo(0, 'costoUnitario', '1000');
    w.ctx.compraCampo(1, 'cantidad', '2'); w.ctx.compraCampo(1, 'costoUnitario', '1040');
    /* Un costo con centavos ya no se escribe (solo números, 02/10), pero puede venir del remito. */
    w.items()[2].costoUnitario = 1154.4; w.ctx.compraCampo(2, 'cantidad', '2');
    t('sin % de ganancia, al lado del costo: el precio que tiene, que no cambia', w.el('cpKilo0').innerHTML ===
      '<span>Precio <b>$1.800</b></span><span class="vfe-may">Sin mayorista: se cobra el de mostrador</span>', w.el('cpKilo0').innerHTML);
    t('con centavos en el costo, lo de al lado da lo mismo que lo que se guarda: $1.732 y $1.550', w.el('cpKilo2').innerHTML ===
      '<span>Precio <b>$1.732</b></span><span class="vfe-may">Mayorista $1.550</span>', w.el('cpKilo2').innerHTML);
    await w.ctx.guardarCompra();
    const act = w.preguntas.find(p => p.titulo === '¿Actualizar los costos?');
    t('  el aviso: sin %, "Precio: queda en $1.800 (no tiene % de ganancia cargado)"',
      !!act && act.m.indexOf('Chalitas Keto\n- Tenía cargado: $0\n- En esta compra: $1.000\n- Precio: queda en $1.800 (no tiene % de ganancia cargado)\n') >= 0, act && act.m);
    t('  un precio redondeado a mano que baja aunque el costo suba, lo marca',
      !!act && act.m.indexOf('- Precio nuevo: $1.591 (antes $1.600: ojo, baja aunque el costo subió)') > 0, act && act.m);
    t('  y con centavos dice lo mismo que se ve al lado', !!act && act.m.indexOf('- Precio nuevo: $1.732 (antes $1.650)\n- Mayorista nuevo: $1.550 (antes $1.450)') > 0, act && act.m);
    const es = w.escrituras.find(x => x.id === 'sp' && x.d.costo !== undefined);
    const ec = w.escrituras.find(x => x.id === 'ct' && x.d.costo !== undefined);
    t('  al actualizar: el de sin % guarda el costo y deja el precio; el de centavos, $1.732 y $1.550',
      !!es && es.d.costo === 1000 && es.d.precio === 1800 && es.d.precioMayorista === 0 && !!ec && ec.d.precio === 1732 && ec.d.precioMayorista === 1550,
      JSON.stringify([es && es.d, ec && ec.d]));
  }
  {
    /* 02/10, revisando después de subir: si "Actualizar" no se va a ofrecer (el costo da igual al
       que tiene, redondeado), al lado del costo van los precios que ya tiene. Mostraba los de la
       cuenta con centavos ($14.401 y $11.750 con $9.000,40), o "Sin mayorista" en uno sin % que sí
       tiene, y nada de eso se guardaba. */
    const prods = () => [
      P('nm', { nombre: 'Nuez Mariposa', costo: 9000, porcentaje: 60, precio: 14500, porcentajeMayorista: 30, precioMayorista: 11700, codigo: 'NM' }),
      P('tq', { nombre: 'Tortilla', costo: 22000, porcentaje: 0, precio: 22000, porcentajeMayorista: 0, precioMayorista: 22000, codigo: 'TQ' }),
      P('cc', { nombre: 'Barrita', costo: 1154.4, porcentaje: 50, precio: 1732, porcentajeMayorista: 30, precioMayorista: 1550, codigo: 'CC' }),
    ];
    const w = armar({ productos: prods() });
    w.ctx.openCompraModal('L1');
    ['nm', 'tq', 'cc'].forEach(id => w.ctx.compraAgregar(id));
    /* Un costo con centavos ya no se escribe (solo números, 02/10), pero puede venir del remito. */
    w.items()[0].costoUnitario = 9000.4; w.ctx.compraCampo(0, 'cantidad', '2');
    w.ctx.compraCampo(1, 'cantidad', '2'); w.ctx.compraCampo(1, 'costoUnitario', '22000');
    w.ctx.compraCampo(2, 'cantidad', '2'); w.ctx.compraCampo(2, 'costoUnitario', '1154');
    t('el costo da igual redondeado ($9.000,40 contra $9.000): al lado, los precios que tiene ($14.500 y $11.700)', w.el('cpKilo0').innerHTML ===
      '<span>Precio <b>$14.500</b></span><span class="vfe-may">Mayorista $11.700</span>', w.el('cpKilo0').innerHTML);
    t('  sin % de ganancia y con el mismo costo: el mayorista que tiene, no "Sin mayorista"', w.el('cpKilo1').innerHTML ===
      '<span>Precio <b>$22.000</b></span><span class="vfe-may">Mayorista $22.000</span>', w.el('cpKilo1').innerHTML);
    t('  con centavos en el que tiene ($1.154,40) y $1.154 en la compra: los que tiene', w.el('cpKilo2').innerHTML ===
      '<span>Precio <b>$1.732</b></span><span class="vfe-may">Mayorista $1.550</span>', w.el('cpKilo2').innerHTML);
    await w.ctx.guardarCompra();
    t('  y "Actualizar" no se ofrece: no cambia nada de los tres',
      !w.preguntas.some(p => /Actualizar/.test(p.titulo || '')) &&
      !w.escrituras.some(x => ['nm', 'tq', 'cc'].indexOf(x.id) >= 0 && x.d && x.d.costo !== undefined),
      w.preguntas.map(p => p.titulo).join(' > '));
  }

  {
    /* 02/10: con "Actualizar", la compra anota cómo estaba cada producto antes y cómo quedó, en el
       mismo lote que los costos, para volverlo atrás si se borra (borrarCompra). */
    const prods = () => [
      P('ct', { nombre: 'Barrita', costo: 1100, porcentaje: 50, precio: 1650, porcentajeMayorista: 30, precioMayorista: 1450, codigo: 'CT',
        costoActualizadoEn: 'fecha-vieja' }),
      P('sp', { nombre: 'Chalitas Keto', costo: 0, porcentaje: 0, precio: 1800, precioMayorista: 0, codigo: 'SP' }),
      P('qq', { nombre: 'Quinoa', costo: 2000, porcentaje: 50, precio: 3000, precioMayorista: 0, codigo: 'QQ' }),
    ];
    const cargar = w => {
      w.ctx.openCompraModal('L1');
      ['ct', 'sp', 'qq'].forEach(id => w.ctx.compraAgregar(id));
      /* Un costo con centavos ya no se escribe (solo números, 02/10), pero puede venir del remito. */
      w.items()[0].costoUnitario = 1154.4; w.ctx.compraCampo(0, 'cantidad', '2');
      w.ctx.compraCampo(1, 'cantidad', '2'); w.ctx.compraCampo(1, 'costoUnitario', '1000');
      w.ctx.compraCampo(2, 'cantidad', '1'); w.ctx.compraCampo(2, 'costoUnitario', '2000');
    };
    const w = armar({ productos: prods() });
    cargar(w);
    await w.ctx.guardarCompra();
    const ec = w.escrituras.find(e => e.col === 'compras' && e.id === 'nueva');
    t('la compra se guarda marcada: anota los costos que cambia (02/10)', w.guardadas.length === 1 && w.guardadas[0].anotaCostos === true);
    t('  con "Actualizar", en el mismo lote anota cómo estaba cada producto y cómo quedó (con la fecha del costo de antes)',
      !!ec && JSON.stringify(ec.d) === JSON.stringify({ costosCambiados: [
        { id: 'ct', nombre: 'Barrita', antes: { costo: 1100, precio: 1650, precioMayorista: 1450, costoActualizadoEn: 'fecha-vieja' },
          despues: { costo: 1154.4, precio: 1732, precioMayorista: 1550 } },
        { id: 'sp', nombre: 'Chalitas Keto', antes: { costo: 0, precio: 1800, precioMayorista: 0, costoActualizadoEn: null },
          despues: { costo: 1000, precio: 1800, precioMayorista: 0 } }] }), JSON.stringify(ec && ec.d));
    const v = armar({ productos: prods(), respuestas: { '¿Actualizar los costos?': false } });
    cargar(v);
    await v.ctx.guardarCompra();
    t('  con "Dejar como estaba" no se anota nada (al borrarla no hay costos que volver)',
      v.guardadas.length === 1 && v.guardadas[0].anotaCostos === true && !v.escrituras.some(e => e.col === 'compras'));
  }

  console.log('\n-- la bolsa que dice el nombre (revisión del 01/10) --');
  {
    const w = armar();
    const b = n => w.ctx._cpGramosBolsa({ id: 'x', nombre: n, tipoVenta: 'peso' });
    t('se leen bien "x 5 kg", "x 2,5 kg", "x 400grs", "38/42 x 25 kg" (un calibre) y "x 22.680 kg" (la caja de castañas)',
      b('Lenteja x 5 kg') === 5000 && b('Chia x 2,5 kg') === 2500 && b('Avena x 400grs') === 400 &&
      b('Mani Runer 38/42 x 25 kg') === 25000 && b('Castaña x 22.680 kg') === 22680);
    t('  "1/2 kg" o "1.500 g" no se toman: se leían como 2 kg y 2 g; la compra pregunta',
      b('Yerba 1/2 kg') === null && b('Cafe 1/4 Kg') === null && b('Coco Rallado x 1.000 grs') === null && b('Mani x 1.500 g') === null);
  }
  {
    const w = armar({ productos: [P('raro', { nombre: 'Yerba <sin palo>', tipoVenta: 'peso', costo: 1000 })] });
    w.ctx.openCompraModal('L1');
    w.ctx.compraAgregar('raro');
    w.ctx.compraCampo(0, 'cantidad', '5000');
    await w.ctx.guardarCompra();
    t('el aviso de la bolsa que falta dice el nombre escapado (el aviso es HTML)',
      w.avisos.some(a => a.indexOf('Falta de cuánto es la bolsa de: Yerba &lt;sin palo&gt;') >= 0), w.avisos.join(' / '));
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
  {
    /* Revisión del 01/10: un granel con su bolsa anotada rompía Cargar compra sin admin-variantes.js
       (las cuentas de la bolsa viven ahí). Como antes: por kilo. */
    const v = armar({ sinVariantes: true, productos: [P('chs', { nombre: 'Chia Suelta', tipoVenta: 'peso', costo: 9000, bolsaGramos: 5000 })] });
    let error = null;
    try { v.ctx.openCompraModal('L1'); v.ctx.compraAgregar('chs'); } catch (e) { error = e; }
    const it = v.items()[0];
    t('  un granel con su bolsa anotada (bolsaGramos) no rompe: va por kilo, como antes',
      !error && !!it && it.gramosBolsa === undefined && it.costoUnitario === 9000, error ? error.message : JSON.stringify(it));
  }

  console.log('\n-- el total del renglón: se escribe y el costo sale solo (pedido del dueño, 02/10) --');
  {
    const w = armar();
    w.ctx.openCompraModal('L1');
    w.ctx.compraAgregar('mrc3');   /* 0: bolsa de 3 kg, $9.999 la bolsa */
    w.ctx.compraAgregar('gal');    /* 1: por unidad, $1.500 */
    w.ctx.compraAgregar('alm');    /* 2: granel que no dice de cuánto es la bolsa */
    w.ctx.compraAgregar('alf1');   /* 3: por unidad, $500 */
    const h = w.el('compraItems').innerHTML;
    t('cada renglón tiene el total, que se puede escribir (vacío mientras no hay cantidad)',
      h.indexOf('<label class="cp-f cp-f-total"><span id="cpTotEtq1">Total</span><input type="text" inputmode="numeric" class="form-input" ' +
        'onblur="compraSalir(1)" id="cpSub1" value="" oninput="compraCampo(1,\'total\',this.value)"></label>') > 0 &&
      (h.match(/class="cp-f cp-f-total"/g) || []).length === 4 && h.indexOf('cp-sub') < 0, h);
    t('  y el costo c/u tiene su id, para ponerle lo que sale', h.indexOf('id="cpCosto1" value="1500"') > 0);
    w.ctx.compraCampo(0, 'cantidad', '12000');
    t('en una bolsa dice cuántas son: "Total (4 bolsas)"', w.el('cpTotEtq0').textContent === 'Total (4 bolsas)', w.el('cpTotEtq0').textContent);
    w.ctx.compraCampo(0, 'total', '40000');
    const b = w.items()[0];
    t('4 bolsas de 3 kg por $40.000 en total: la bolsa sale sola, $10.000, y el kilo $3.333',
      b.costoBolsa === 10000 && b.costoUnitario === 3333 && w.el('cpBolsa0').value === '10000' &&
      w.el('cpKilo0').innerHTML.indexOf('<span>Costo $3.333 el kilo</span>') === 0, JSON.stringify(b) + ' ' + w.el('cpKilo0').innerHTML);
    t('  y el total de la compra, $40.000', w.el('compraTotal').textContent === '$40.000', w.el('compraTotal').textContent);
    w.ctx.compraCampo(0, 'cantidad', '9000');
    t('con otra cantidad, el total escrito se queda y la bolsa se vuelve a sacar: 3 bolsas, $13.333 cada una (en pesos)',
      w.items()[0].costoBolsa === 13333 && w.el('cpBolsa0').value === '13333' && w.el('cpSub0').value === '40000' &&
      w.el('cpTotEtq0').textContent === 'Total (3 bolsas)', JSON.stringify(w.items()[0]));
    t('  y el total queda exacto: $40.000, no lo que daría la bolsa redondeada', w.ctx._cpSubtotal(w.items()[0]) === 40000 &&
      w.el('compraTotal').textContent === '$40.000');
    w.ctx.compraCampo(0, 'costoBolsa', '12000');
    t('si después se escribe el costo de la bolsa, manda el costo: el total sale de ahí ($36.000)',
      w.items()[0].totalEscrito === undefined && w.el('cpSub0').value === '36000', w.el('cpSub0').value);
    w.ctx.compraCampo(0, 'total', '50000');
    w.ctx.compraCampo(0, 'total', '');
    t('  borrar el total también vuelve a mandar el costo: el que quedó, $16.667 la bolsa, y el total sale de ahí ($50.001)',
      w.items()[0].totalEscrito === undefined && w.items()[0].costoBolsa === 16667 && w.el('cpSub0').value === '50001',
      JSON.stringify(w.items()[0]));
    w.ctx.compraCampo(1, 'cantidad', '300');
    w.ctx.compraCampo(1, 'total', '40000');
    t('por unidad: 300 por $40.000 en total son $133 c/u, y el total queda exacto ($40.000, no $39.900)',
      w.items()[1].costoUnitario === 133 && w.el('cpCosto1').value === '133' && w.ctx._cpSubtotal(w.items()[1]) === 40000,
      JSON.stringify(w.items()[1]));
    t('  y al lado, el precio con ese costo', w.el('cpKilo1').innerHTML === w.ctx._cpVistaHtml(w.items()[1]) && w.el('cpKilo1').innerHTML !== '');
    w.ctx.compraCampo(3, 'total', '6000');
    t('el total antes que la cantidad: la cantidad sale sola con el costo que tiene ($6.000 ÷ $500 = 12)',
      w.items()[3].cantidad === 12 && w.items()[3].costoUnitario === 500 && w.el('cpCant3').value === '12' &&
      w.ctx._cpSubtotal(w.items()[3]) === 6000, JSON.stringify(w.items()[3]));
    w.ctx.compraCampo(3, 'cantidad', '10');
    t('  y si después se escribe la cantidad, manda: 10 por $6.000 son $600 c/u', w.items()[3].costoUnitario === 600 &&
      w.el('cpCosto3').value === '600' && !w.items()[3].cantidadSale);
    w.ctx.document.activeElement = w.el('cpSub3');
    w.el('cpSub3').value = '07000';
    w.ctx.compraCampo(3, 'total', '07000');
    t('mientras se escribe el total no se lo pisa ("07000" queda así; vale $7.000)',
      w.el('cpSub3').value === '07000' && w.items()[3].totalEscrito === 7000 && w.items()[3].costoUnitario === 700);
    w.ctx.document.activeElement = null;
    w.ctx.compraSalir(3);
    t('  al salir del campo, muestra lo que vale: 7000', w.el('cpSub3').value === '7000', w.el('cpSub3').value);
    w.ctx.compraCampo(3, 'total', '6000');
    w.ctx.compraCampo(2, 'cantidad', '10000');
    w.ctx.compraCampo(2, 'total', '70000');
    t('un granel que no dice de cuánto es la bolsa: el total queda, y el costo espera la bolsa',
      w.items()[2].costoBolsa === undefined && w.items()[2].costoUnitario === 14000 && w.ctx._cpSubtotal(w.items()[2]) === 70000);
    w.ctx.compraCampo(2, 'bolsaUnidad', 'kg');
    w.ctx.compraCampo(2, 'bolsa', '5');
    t('  dicha la bolsa (5 kg): 2 bolsas por $70.000, $35.000 cada una y $7.000 el kilo',
      w.items()[2].costoBolsa === 35000 && w.items()[2].costoUnitario === 7000 && w.el('cpBolsa2').value === '35000' &&
      w.el('cpTotEtq2').textContent === 'Total (2 bolsas)', JSON.stringify(w.items()[2]));
    w.ctx.compraCampo(0, 'total', '40000');
    await w.ctx.guardarCompra();
    const conf = w.preguntas.find(p => p.titulo === 'Guardar compra');
    t('al guardar, lo que se confirma suma los totales escritos ($156.000) y dice el costo que salió',
      !!conf && conf.m.indexOf('por $156.000') > 0 && conf.m.indexOf('- Mani RC x 3 kg: 9 kg a $13.333 la bolsa') > 0 &&
      conf.m.indexOf('- Almendra: 10 kg a $35.000 la bolsa de 5 kg') > 0, conf && conf.m);
    const c = w.guardadas[0] || { items: [] };
    const fila = id => c.items.find(i => i.id === id) || {};
    t('  se guarda cada renglón con el total escrito y el costo que salió de ahí',
      c.total === 156000 &&
      fila('mrc3').subtotal === 40000 && fila('mrc3').costoBolsa === 13333 && fila('mrc3').costoUnitario === 4444 && fila('mrc3').cantidad === 9000 &&
      fila('gal').subtotal === 40000 && fila('gal').costoUnitario === 133 &&
      fila('alm').subtotal === 70000 && fila('alm').costoBolsa === 35000 && fila('alm').costoUnitario === 7000 && fila('alm').gramosBolsa === 5000 &&
      fila('alf1').subtotal === 6000 && fila('alf1').costoUnitario === 600, JSON.stringify(c.items));
    t('  sin guardar el total escrito ni de dónde salió: lo de siempre',
      c.items.every(i => !('totalEscrito' in i) && !('cantidadSale' in i) && !('noDaJusto' in i)));
    const costos = w.escrituras.filter(e => e.d.costo !== undefined).map(e => e.id + '=' + e.d.costo).sort().join();
    t('  y "Actualizar" pone esos costos: la bolsa por el kilo, los demás como salieron',
      costos === 'alf1=600,alm=7000,gal=133,mrc3=4444', costos);
  }
  {
    /* Un granel por kilo, sin bolsa (sin admin-variantes.js no hay bolsas): el costo por kilo. */
    const v = armar({ sinVariantes: true, productos: [P('chs', { nombre: 'Chia Suelta', tipoVenta: 'peso', costo: 9000 })] });
    v.ctx.openCompraModal('L1');
    v.ctx.compraAgregar('chs');
    v.ctx.compraCampo(0, 'cantidad', '3000');
    v.ctx.compraCampo(0, 'total', '21300');
    t('por kilo, suelto: 3 kg por $21.300 en total son $7.100 el kilo',
      v.items()[0].costoUnitario === 7100 && v.el('cpCosto0').value === '7100' && v.ctx._cpSubtotal(v.items()[0]) === 21300,
      JSON.stringify(v.items()[0]));
  }

  console.log('\n-- pedido del dueño sobre el total (02/10): solo números, la cantidad que sale del total --');
  {
    const w = armar();
    t('lo que va en un campo, en pesos y solo con números', w.ctx._cpImporteTxt(13333.33) === '13333' &&
      w.ctx._cpImporteTxt(12000) === '12000' && w.ctx._cpImporteTxt(0) === '');
    w.ctx.openCompraModal('L1');
    w.ctx.compraAgregar('mrc3');   /* 0: bolsa de 3 kg */
    w.ctx.compraAgregar('gal');    /* 1: por unidad, $1.500 */
    w.ctx.compraAgregar('alm');    /* 2: granel que no dice de cuánto es la bolsa */
    w.ctx.compraCampo(0, 'cantidad', '6000');
    w.ctx.compraCampo(0, 'costoBolsa', '12.000');
    t('en el costo de la bolsa el punto no entra: "12.000" queda 12000 ($12.000, no $12)', w.el('cpBolsa0').value === '12000' &&
      w.items()[0].costoBolsa === 12000 && w.items()[0].costoUnitario === 4000 && w.el('cpSub0').value === '24000', JSON.stringify(w.items()[0]));
    w.ctx.compraCampo(0, 'total', '30.000');
    t('  ni en el total: "30.000" queda 30000, 2 bolsas de $15.000', w.el('cpSub0').value === '30000' && w.items()[0].totalEscrito === 30000 &&
      w.items()[0].costoBolsa === 15000);
    w.ctx.compraCampo(1, 'cantidad', '3');
    w.ctx.compraCampo(1, 'costoUnitario', '1.500');
    t('  ni en el costo c/u: "1.500" queda 1500', w.el('cpCosto1').value === '1500' && w.items()[1].costoUnitario === 1500 && w.el('cpSub1').value === '4500');
    w.ctx.compraCampo(1, 'cantidad', '1.0');
    t('  ni en la cantidad: "1.0" queda 10', w.el('cpCant1').value === '10' && w.items()[1].cantidad === 10);
    w.ctx.compraCampo(1, 'cantidad', '3');
    w.ctx.document.activeElement = w.el('cpBolsa0');
    w.el('cpBolsa0').value = '015000';
    w.ctx.compraCampo(0, 'costoBolsa', '015000');
    t('  mientras se escribe, el campo no se toca ("015000" queda así)', w.el('cpBolsa0').value === '015000' && w.items()[0].costoBolsa === 15000);
    w.ctx.document.activeElement = null;
    w.ctx.compraSalir(0);
    t('  y al salir queda 15000', w.el('cpBolsa0').value === '15000', w.el('cpBolsa0').value);
    w.ctx.compraCampo(2, 'bolsa', '2kg');
    t('en "de cuánto es la bolsa" no entran letras: "2kg" queda "2", y la bolsa es de 2 kg',
      w.el('cpTam2').value === '2' && w.items()[2].gramosBolsa === 2000, w.el('cpTam2').value);
    w.ctx.compraCampo(1, 'total', '9a000');
    t('  ni en el total: "9a000" queda "9000", y anda', w.el('cpSub1').value === '9000' && w.items()[1].totalEscrito === 9000 &&
      w.items()[1].costoUnitario === 3000);
    w.ctx.compraCampo(1, 'costoUnitario', '3o00');
    t('  ni en el costo', w.el('cpCosto1').value === '300' && w.items()[1].costoUnitario === 300);
    w.ctx.compraCampo(2, 'bolsa', '2.5');
    t('en la bolsa en kg queda la coma, para 2,5 kg: el punto se vuelve coma', w.el('cpTam2').value === '2,5' && w.items()[2].gramosBolsa === 2500,
      w.el('cpTam2').value);
    w.ctx.compraCampo(2, 'bolsaUnidad', 'g');
    w.ctx.compraCampo(2, 'bolsa', '1.500');
    t('  y en g, solo números: "1.500" queda 1500 g', w.el('cpTam2').value === '1500' && w.items()[2].gramosBolsa === 1500, w.el('cpTam2').value);
  }
  {
    const w = armar();
    w.ctx.openCompraModal('L1');
    w.ctx.compraAgregar('gal');    /* 0: por unidad, $1.500 */
    w.ctx.compraAgregar('mrc3');   /* 1: bolsa de 3 kg */
    const h = w.el('compraItems').innerHTML;
    t('arriba de lo que entra dice "Unidades entrantes" o "Gramos entrantes"',
      h.indexOf('<label class="cp-f cp-f-cant"><span>Unidades entrantes</span>') > 0 && h.indexOf('<label class="cp-f cp-f-cant"><span>Gramos entrantes</span>') > 0, h);
    t('  y en los de peso, debajo, los kilos (vacío hasta que haya gramos); por unidad no',
      h.indexOf('<span class="cp-equiv" id="cpEquiv1"></span>') > 0 && h.indexOf('id="cpEquiv0"') < 0 && h.indexOf('cp-row cp-row-peso') > 0);
    w.ctx.compraCampo(1, 'cantidad', '5300');
    t('  5300 g: "Equivale a 5,3 kg"', w.el('cpEquiv1').textContent === 'Equivale a 5,3 kg', w.el('cpEquiv1').textContent);
    w.ctx.compraCampo(1, 'cantidad', '5000');
    t('  5000 g: "Equivale a 5 kg"', w.el('cpEquiv1').textContent === 'Equivale a 5 kg', w.el('cpEquiv1').textContent);
    w.ctx.compraCampo(1, 'cantidad', '');
    t('  sin gramos, nada', w.el('cpEquiv1').textContent === '');
    w.ctx.compraCampo(0, 'total', '9000');
    t('por unidad, sin la cantidad: escribir el total la saca sola ($9.000 ÷ $1.500 = 6 unidades)',
      w.items()[0].cantidad === 6 && w.el('cpCant0').value === '6' && w.items()[0].costoUnitario === 1500 &&
      w.el('cpNoDa0').style.display === 'none', JSON.stringify(w.items()[0]));
    w.ctx.compraCampo(0, 'total', '10000');
    t('  si no da justo ($10.000 ÷ $1.500 = 6,67), la cantidad queda vacía y el renglón explica por qué, en amarillo',
      w.items()[0].cantidad === 0 && w.el('cpCant0').value === '' && w.el('cpNoDa0').style.display === '' &&
      w.el('cpNoDa0').innerHTML === '<i class="bi bi-exclamation-triangle"></i> Las cuentas no dan: $10.000 ÷ $1.500 (lo que cuesta cada una) = ' +
        '6,67 unidades, y no se compran unidades partidas. Revisá el total o el costo, o escribí las unidades.', w.el('cpNoDa0').innerHTML);
    t('  el total igual queda ($10.000)', w.ctx._cpSubtotal(w.items()[0]) === 10000 && w.el('compraTotal').textContent === '$10.000');
    w.ctx.compraCampo(0, 'costoUnitario', '2000');
    t('  con otro costo ($2.000) sale otra vez: 5 unidades, y el aviso se va',
      w.items()[0].cantidad === 5 && w.items()[0].totalEscrito === 10000 && w.el('cpCant0').value === '5' && w.el('cpNoDa0').style.display === 'none');
    w.ctx.compraCampo(0, 'cantidad', '4');
    t('  escribir la cantidad manda: 4 por $10.000 son $2.500 c/u', w.items()[0].costoUnitario === 2500 && !w.items()[0].cantidadSale &&
      w.el('cpCosto0').value === '2500');
    w.ctx.compraCampo(1, 'costoBolsa', '12000');
    w.ctx.compraCampo(1, 'total', '48000');
    t('en una bolsa, sin los gramos: $48.000 ÷ $12.000 = 4 bolsas, 12.000 g',
      w.items()[1].cantidad === 12000 && w.el('cpCant1').value === '12000' && w.el('cpTotEtq1').textContent === 'Total (4 bolsas)' &&
      w.el('cpEquiv1').textContent === 'Equivale a 12 kg', JSON.stringify(w.items()[1]));
    w.ctx.compraCampo(1, 'total', '50000');
    t('  si no da justo ($50.000 ÷ $12.000 = 4,17 bolsas), lo explica',
      w.items()[1].cantidad === 0 && w.el('cpNoDa1').innerHTML.indexOf('Las cuentas no dan: $50.000 ÷ $12.000 (lo que cuesta la bolsa) = ' +
        '4,17 bolsas, y no se compran bolsas partidas. Revisá el total o el costo, o escribí los gramos.') > 0, w.el('cpNoDa1').innerHTML);
    const h2 = (w.ctx.renderCompraItems(), w.el('compraItems').innerHTML);
    t('  y al volver a armar la lista, el aviso sigue ahí', h2.indexOf('<div class="cp-nodajusto" id="cpNoDa1"><i class="bi bi-exclamation-triangle"></i> Las cuentas no dan:') > 0 &&
      h2.indexOf('<div class="cp-nodajusto" id="cpNoDa0" style="display:none"></div>') > 0);
    w.ctx.compraCampo(1, 'total', '48000');
    await w.ctx.guardarCompra();
    const c = w.guardadas[0] || { items: [] };
    const m3 = c.items.find(i => i.id === 'mrc3') || {};
    t('al guardar, la cantidad que salió del total es la que entra: 12.000 g por $48.000, y suma 12.000 g al stock',
      m3.cantidad === 12000 && m3.subtotal === 48000 && m3.costoBolsa === 12000 && c.total === 58000 &&
      w.escrituras.some(e => e.id === 'mrc3' && e.d.stock && e.d.stock.__inc === 12000), JSON.stringify(c.items));
  }
  {
    const g = armar();
    g.ctx.openCompraModal('L1');
    g.ctx.compraAgregar('alm');   /* granel que no dice de cuánto es la bolsa: $14.000 el kilo */
    g.ctx.compraCampo(0, 'total', '70000');
    t('un granel sin la bolsa, con el total y sin los gramos: espera la bolsa', g.items()[0].cantidad === 0 && g.items()[0].totalEscrito === 70000);
    g.ctx.compraCampo(0, 'bolsa', '5');
    t('  dicha la bolsa (5 kg, $70.000 con el kilo que tenía), sale la cantidad: 1 bolsa, 5.000 g',
      g.items()[0].cantidad === 5000 && g.el('cpCant0').value === '5000' && g.el('cpEquiv0').textContent === 'Equivale a 5 kg', JSON.stringify(g.items()[0]));
  }
  {
    const s = armar({ sinVariantes: true, productos: [P('chs', { nombre: 'Chia Suelta', tipoVenta: 'peso', costo: 9000 })] });
    s.ctx.openCompraModal('L1');
    s.ctx.compraAgregar('chs');
    s.ctx.compraCampo(0, 'total', '31500');
    t('por kilo suelto, sin los gramos: $31.500 ÷ $9.000 el kilo = 3.500 g ("Equivale a 3,5 kg")',
      s.items()[0].cantidad === 3500 && s.el('cpCant0').value === '3500' && s.el('cpEquiv0').textContent === 'Equivale a 3,5 kg',
      JSON.stringify(s.items()[0]));
  }

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERROR ' + (e && e.stack || e)); process.exit(1); });
