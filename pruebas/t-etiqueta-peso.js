/**
 * ETIQUETA PARA BOLSITA CON PESO (17/11/2026).
 *
 * Pedido del comercio: una bolsita armada en el local (100 g de nuez) con su etiqueta: el
 * producto, los gramos, el precio y la fecha. Al escanearla en la caja entra a la venta con esos
 * gramos, sin preguntar, y se cobra con la MISMA cuenta que si se hubieran tipeado (el precio del
 * kilo del día, las bolsas de granel, el descuento).
 *
 * El código: EAN-13 '29' + código interno (6 dígitos) + gramos (4) + verificador.
 *
 * Corre admin-etiquetas.js, admin-variantes.js, admin-escalas.js y admin-dialogo.js de verdad,
 * con la cuenta de subtotalItem de admin.html, y revisa cómo se engancha en el lector y la venta.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const ETQ = leer('admin-etiquetas.js');
const VAR = leer('admin-variantes.js');
const ESC = leer('admin-escalas.js');
const DLG = leer('admin-dialogo.js');
const LEC = leer('admin-lector.js');
const HTML = leer('admin.html');

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + JSON.stringify(extra).slice(0, 300) + ']' : '')); }
};
function cuerpo(texto, n) {
  let i = texto.indexOf('function ' + n + '(');
  if (i < 0) return '';
  if (texto.slice(Math.max(0, i - 6), i) === 'async ') i -= 6;
  let p = 0, k;
  for (k = texto.indexOf('{', i); k < texto.length; k++) {
    if (texto[k] === '{') p++;
    else if (texto[k] === '}') { p--; if (!p) break; }
  }
  return texto.slice(i, k + 1);
}

const P = (id, extra) => Object.assign({ id, nombre: id, precio: 1000, precioMayorista: 900, costo: 500, stock: 5000, tipoVenta: 'peso' }, extra || {});
function catalogo() {
  return [
    P('nuez', { nombre: 'Nueces Mariposa', codigo: '000650', precio: 18000, precioMayorista: 15000, stock: 3000 }),
    P('almd', { nombre: 'Almendras', codigo: '000651', precio: 20000, descuento: 10, stock: 3000 }),
    P('y1', { nombre: 'Yerba Mate x 1 kg', codigo: '000700', gramaje: '1 kg', precio: 8000, precioMayorista: 6500, stock: 2000 }),
    P('y3', { nombre: 'Yerba Mate x 3 kg', codigo: '000701', gramaje: '3 kg', precio: 7200, precioMayorista: 5850, stock: 9000, gramajePadreId: 'y1' }),
    P('y5', { nombre: 'Yerba Mate x 5 kg', codigo: '000702', gramaje: '5 kg', precio: 6000, precioMayorista: 4900, stock: 10000, gramajePadreId: 'y1' }),
    P('alf', { nombre: 'Alfajor', codigo: '000800', tipoVenta: 'unidad', precio: 1500, stock: 40 }),
    P('vieja', { nombre: 'Pasas viejas', codigo: '000900', depurado: true }),
    P('sincod', { nombre: 'Sin codigo', codigo: '' }),
    P('largo', { nombre: 'Codigo largo', codigo: '1234567' }),
    P('rep1', { nombre: 'Repetido A', codigo: '000950' }),
    P('rep2', { nombre: 'Repetido B', codigo: '950' }),
    P('gratis', { nombre: 'Sin precio', codigo: '000960', precio: 0 }),
  ];
}

function armar(opts) {
  const o = opts || {};
  const ctx = {
    console, Math, Number, String, Object, Array, Set, Map, Promise, Infinity, parseInt, isFinite, JSON, Date,
    setTimeout: (fn) => { fn(); return 0; },
    document: o.document || { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    allProducts: o.productos || catalogo(),
    ventaItems: [], ventaMayItems: [],
    editingVentaId: null, editingVentaOriginal: null, editingVentaMayId: null, ventasMayData: [],
    esc: s => String(s == null ? '' : s),
    _attrHtml: s => String(s),
    fmtPeso: g => (Math.abs(g) < 1000 ? g.toLocaleString('es-AR') + ' g' : (g / 1000).toLocaleString('es-AR', { maximumFractionDigits: 3 }) + ' kg'),
    renderVentaItems() {}, renderVentaMayItems() {},
    pedirOpcion: async () => 'igual',
    pedirConfirmacion: async () => true,
    avisar: async () => true,
    showAdminToast() {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(['esPorPeso', 'precioConDsc', 'subtotalItem'].map(n => cuerpo(HTML, n)).join('\n'), ctx);
  vm.runInContext(DLG, ctx);
  vm.runInContext(VAR, ctx);
  vm.runInContext('FRENAR_VENTA_SIN_STOCK = false;', ctx);
  vm.runInContext(ESC, ctx);
  vm.runInContext(ETQ, ctx);
  return ctx;
}
const b = (ctx, id) => ctx.allProducts.find(p => p.id === id);

(async () => {
  console.log('\n-- el código --');
  {
    const c = armar();
    t('Nueces (código 650) con 100 g: 2900065001005', c.etiquetaPesoCodigoDe(b(c, 'nuez'), 100) === '2900065001005', c.etiquetaPesoCodigoDe(b(c, 'nuez'), 100));
    t('  con 155 g: 2900065001555', c.etiquetaPesoCodigoDe(b(c, 'nuez'), 155) === '2900065001555');
    t('  con 9.999 g sí, con 0 o 10.000 no, ni con gramos con coma', c.etiquetaPesoCodigoDe(b(c, 'nuez'), 9999) && !c.etiquetaPesoCodigoDe(b(c, 'nuez'), 0) &&
      !c.etiquetaPesoCodigoDe(b(c, 'nuez'), 10000) && !c.etiquetaPesoCodigoDe(b(c, 'nuez'), 100.5));
    t('sin código interno, o de más de 6 dígitos, no hay etiqueta', !c.etiquetaPesoCodigoDe(b(c, 'sincod'), 100) && !c.etiquetaPesoCodigoDe(b(c, 'largo'), 100));
    t('el verificador cierra', c.codigoBarrasCierra(c.etiquetaPesoCodigoDe(b(c, 'nuez'), 437)));
    const r = c.etiquetaPesoDe('2900065001555', c.allProducts);
    t('de vuelta: el producto y los gramos', r && r.producto && r.producto.id === 'nuez' && r.gramos === 155);
    const todos = [];
    for (const g of [1, 7, 99, 100, 250, 999, 1000, 4321, 9999]) {
      const cod = c.etiquetaPesoCodigoDe(b(c, 'nuez'), g);
      const v = c.etiquetaPesoDe(cod, c.allProducts);
      todos.push(v && v.producto.id === 'nuez' && v.gramos === g);
    }
    t('  ida y vuelta con 1, 7, 99, 100, 250, 999, 1000, 4321 y 9999 g', todos.every(Boolean), todos);
    t('un dígito cambiado no se lee (el verificador no cierra)', c.etiquetaPesoDe('2900065001006', c.allProducts) === null);
    t('la etiqueta de siempre (2000000006505) no es de estas', c.etiquetaPesoDe('2000000006505', c.allProducts) === null);
    t('  y la de siempre sigue leyéndose como antes', c.etiquetaProductoDe('2000000006505', c.allProducts).id === 'nuez');
    t('  y esta no se confunde con la de siempre', c.etiquetaProductoDe('2900065001005', c.allProducts) === null);
    t('un código de fábrica (779...) no es de estas', c.etiquetaPesoDe('7790001000010', c.allProducts) === null);
    const cero = '290006500000';
    t('con 0 g no se lee', c.etiquetaPesoDe(cero + c.etiquetaDigitoVerificador(cero), c.allProducts) === null);
    const nadie = '290012340100';
    const rn = c.etiquetaPesoDe(nadie + c.etiquetaDigitoVerificador(nadie), c.allProducts);
    t('de un producto que no existe: sin producto, sin adivinar', rn && rn.producto === null && rn.varios.length === 0);
    const rep = c.etiquetaPesoCodigoDe(b(c, 'rep1'), 100);
    const rr = c.etiquetaPesoDe(rep, c.allProducts);
    t('si dos productos tienen el mismo código (000950 y 950): no se adivina', rr && rr.producto === null && rr.varios.length === 2);
  }

  console.log('\n-- el precio de la etiqueta = lo que cobra la venta --');
  {
    const c = armar();
    const pn = c.etiquetaPesoPrecio(b(c, 'nuez'), 100, c.allProducts);
    t('Nueces a $18.000 el kilo, 100 g: $1.800', pn.total === 1800 && pn.kilo === 18000, pn);
    const pa = c.etiquetaPesoPrecio(b(c, 'almd'), 155, c.allProducts);
    t('Almendras a $20.000 con 10% de oferta, 155 g: $18.000 el kilo y $2.790', pa.kilo === 18000 && pa.total === 2790, pa);
    const py = c.etiquetaPesoPrecio(b(c, 'y1'), 500, c.allProducts);
    t('Yerba con bolsas (1, 3 y 5 kg), 500 g: la bolsa de 1 kg, $8.000 el kilo, $4.000', py.total === 4000 && py.kilo === 8000 && py.bolsa === '1 kg', py);
    const py3 = c.etiquetaPesoPrecio(b(c, 'y1'), 3100, c.allProducts);
    t('  3.100 g: la bolsa de 3 kg, $7.200 el kilo, $22.320', py3.total === 22320 && py3.kilo === 7200 && py3.bolsa === '3 kg', py3);
    t('el nombre del grupo, sin el tamaño de la bolsa', c.etiquetaPesoNombre(b(c, 'y1'), c.allProducts) === 'Yerba Mate', c.etiquetaPesoNombre(b(c, 'y1'), c.allProducts));

    /* Contra la venta de verdad: los gramos de la etiqueta entran sin preguntar y el subtotal
       de los renglones es el precio impreso. */
    const casos = [['nuez', 100], ['nuez', 437], ['almd', 155], ['almd', 999], ['y1', 500], ['y1', 3100], ['y1', 5000]];
    for (const [id, g] of casos) {
      const v = armar();
      const p = b(v, id);
      const esperado = v.etiquetaPesoPrecio(p, g, v.allProducts).total;
      let cobrado;
      const esc = v.escalasDe(p);
      if (esc.length) {
        const r = await v.agregarGranelVenta(p, 'min', g);
        cobrado = r === 'hecho' ? v.ventaItems.reduce((s, i) => s + v.subtotalItem(i), 0) : null;
      } else {
        /* El camino de admin.html para un granel suelto: pedirCantidadPeso con los gramos dados. */
        const gr = await v.pedirCantidadPeso(p, { precioKg: p.precio, gramos: g });
        cobrado = v.subtotalItem({ precio: p.precio, descuento: p.descuento || 0, cantidad: gr, tipoVenta: 'peso' });
      }
      t('  ' + p.nombre + ' ' + g + ' g: la etiqueta dice $' + esperado + ' y la venta cobra $' + cobrado, cobrado === esperado);
    }
  }

  console.log('\n-- la ventana de los gramos (admin-dialogo.js) --');
  {
    const c = armar();
    const r = await c.pedirCantidadPeso(b(c, 'nuez'), { gramos: 250 });
    t('con gramos dados, devuelve esos gramos sin abrir nada', r === 250 && vm.runInContext('_dlgAbiertos', c) === 0);
    /* Con el freno prendido y sin stock suficiente se abre el diálogo de siempre con los gramos puestos. */
    const puestos = [];
    const stub = () => ({ value: '', disabled: false, className: '', innerHTML: '', textContent: '', style: {},
      addEventListener() {}, focus() {}, querySelector: () => null, getAttribute: () => null });
    const inp = stub();
    const doc = {
      body: { appendChild: el => puestos.push(el) },
      createElement: () => Object.assign(stub(), {
        remove() {}, querySelectorAll: () => [],
        querySelector: sel => (sel === '.pz-input' ? inp : stub()),
      }),
      addEventListener() {}, removeEventListener() {},
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    };
    const c2 = armar({ document: doc });
    let listo = false;
    c2.pedirCantidadPeso(b(c2, 'nuez'), { gramos: 500, stock: 300, bloquear: true }).then(() => { listo = true; });
    await new Promise(res => setImmediate(res));
    t('con el freno y sin stock suficiente: abre el diálogo de siempre, con los gramos puestos', !listo && puestos.length === 1 && inp.value === '500');
  }

  console.log('\n-- la etiqueta impresa --');
  {
    const c = armar();
    const f = c.etiquetaFormato('a4-3x8');
    const h = c.etiquetaPesoHTML(b(c, 'nuez'), 100, f, { precio: c.etiquetaPesoPrecio(b(c, 'nuez'), 100), nombre: 'Nueces Mariposa', fecha: '17/11/2026' });
    t('el nombre', /<div class="etq-nom">Nueces Mariposa<\/div>/.test(h));
    t('el peso y el precio', h.includes('<div class="etqp-linea">100 g &middot; $1.800</div>'), h.slice(0, 300));
    t('el precio del kilo y la fecha', h.includes('$18.000 el kilo &middot; precio del 17/11/2026'));
    t('el código de barras', /<svg class="etq-bc"/.test(h));
    const chica = c.etiquetaPesoHTML(b(c, 'nuez'), 1500, c.etiquetaFormato('ter-50x25'), { precio: c.etiquetaPesoPrecio(b(c, 'nuez'), 1500), fecha: '17/11/2026' });
    t('en una chica (50 x 25), "/kg" y 1,5 kg', chica.includes('1,5 kg &middot; $27.000') && chica.includes('$18.000/kg &middot; precio del 17/11/2026'));
    t('  en las chicas el nombre va en un renglón (las barras no se achican)', chica.includes('class="etq-nom etqp-nom1"') && !h.includes('etqp-nom1'));
    t('la fecha de hoy, dd/mm/aaaa', c.etiquetaPesoFecha(new Date(2026, 10, 7)) === '07/11/2026');
    const doc = c.etiquetaPesoDocumento(b(c, 'nuez'), 100, 30, f, { precio: { total: 1800, kilo: 18000 } });
    t('30 copias en A4 de 24: 2 hojas, 30 etiquetas', (doc.match(/class="etq-pag"/g) || []).length === 2 && (doc.match(/class="etq etqp"/g) || []).length === 30);
    const ter = c.etiquetaPesoDocumento(b(c, 'nuez'), 100, 3, c.etiquetaFormato('ter-50x25'), { precio: { total: 1800, kilo: 18000 } });
    t('en térmica, una tras otra', (ter.match(/class="etq etqp"/g) || []).length === 3 && !/etq-pag/.test(ter));
    t('sin código válido no sale nada', c.etiquetaPesoDocumento(b(c, 'sincod'), 100, 3, f, {}) === '');
    const est = c.etiquetaEstilos(f);
    t('los estilos de la etiqueta con peso', /\.etqp-linea\{/.test(est) && /\.etqp-det\{/.test(est));
  }

  console.log('\n-- qué productos se pueden elegir --');
  {
    const c = armar();
    const ids = c.etiquetaPesoCandidatos(c.allProducts).map(p => p.id).sort().join(',');
    t('los de peso con código; la yerba una sola vez (su bolsa más chica); sin depurados, sin unidad, sin código largo o vacío',
      ids === 'almd,gratis,nuez,rep1,rep2,y1', ids);
  }

  console.log('\n-- el lector (admin-lector.js) --');
  {
    const proc = cuerpo(LEC, 'procesarCodigoLeido');
    const iPeso = proc.indexOf('etiquetaPesoDe(cod, allProducts)');
    t('reconoce la etiqueta con peso antes de buscar el producto', iPeso > 0 && iPeso < proc.indexOf('const prod = buscarPorCodigo(cod);'));
    t('  solo si el código no es, tal cual, el de algún producto', /if \(!coincidenciasCodigo\(cod\)\.length && typeof etiquetaPesoDe === 'function'/.test(proc));
    t('  después de los diálogos abiertos y de "código pendiente"', proc.indexOf("_modalAbierto('asignarCodigoModal')") < iPeso && proc.indexOf(".dlg-overlay") < iPeso);
    t('editando un producto, no se guarda como código de fábrica', /etiquetaPesoDe\(cod, allProducts \|\| \[\]\)\)\) \{\s*showAdminToast\('Ese es un código impreso por el local/.test(proc));
    const ecp = cuerpo(LEC, '_etiquetaConPeso');
    t('en la venta, con los gramos', /_modalAbierto\('ventaModal'\)\) \{ _agregarYAvisar\(prod, id => addVentaItem\(id, g\)/.test(ecp));
    t('en la mayorista, con los gramos', /_modalAbierto\('ventaMayModal'\)\) \{ _agregarYAvisar\(prod, id => addVentaMayItem\(id, g\)/.test(ecp));
    t('en una compra, el producto (como la de siempre)', /_modalAbierto\('compraModal'\)\) \{ if \(typeof compraEscanear === 'function'\) compraEscanear\(prod\)/.test(ecp));
    t('un producto que ahora es por unidad: avisa y no agrega', /prod\.tipoVenta !== 'peso'\) \{\s*showAdminToast\([^;]*se vende por unidad/.test(ecp));
    t('parado en Ventas abre la venta con los gramos', /_venderEscaneado\(prod, g\)/.test(ecp) && /if \(gramos > 0\) \{ _agregarYAvisar\(prod, id => addVentaItem\(id, gramos\)/.test(cuerpo(LEC, '_venderEscaneado')));
    t('el aviso dice los gramos, con el nombre del grupo', /'Agregado: ' \+ _lecNombre\(p, gramos\) \+ \(gramos > 0/.test(cuerpo(LEC, '_avisarAgregado')) &&
      /etiquetaPesoNombre\(p\)/.test(cuerpo(LEC, '_lecNombre')));
  }

  console.log('\n-- la venta (admin.html) --');
  {
    const ag = cuerpo(HTML, '_agregarItemVenta');
    t('_agregarItemVenta recibe los gramos', /async function _agregarItemVenta\(id, ctx, ocultoVisto, gramos\)/.test(ag));
    t('  con gramos y un producto por unidad, no agrega', /if\(gramos!=null && !\(p && esPorPeso\(p\)\)\)\{showAdminToast\([^;]*\);return;\}/.test(ag));
    t('  se los pasa al granel con bolsas y al suelto', /agregarGranelVenta\(p,ctx,gramos\)/.test(ag) && /gramos>0\?\{gramos:gramos\}:\{\}\)\);/.test(ag));
    t('  después de las preguntas de oculto y depurado (las de siempre)', ag.indexOf("depuracionOfrecerRestaurar(p,'venderlo')") < ag.indexOf('agregarGranelVenta(p,ctx,gramos)'));
    t('addVentaItem y addVentaMayItem pasan los gramos', /addVentaItem=function\(id,gramos\)\{ return _agregarItemVenta\(id,'min',false,gramos\); \};/.test(HTML) &&
      /addVentaMayItem=function\(id,gramos\)\{ return _agregarItemVenta\(id,'may',false,gramos\); \};/.test(HTML));
    t('el botón "Etiqueta con peso", al lado de "Etiquetas"', /> Etiquetas<\/button><button class="btn btn-secondary" onclick="openEtiquetaPesoModal\(\)"[^>]*><i class="bi bi-bag-check"><\/i> Etiqueta con peso<\/button>/.test(HTML));
    t('la ventana "Etiqueta para bolsita con peso"', /id="etiquetaPesoModal"/.test(HTML) && /Etiqueta para bolsita con peso<\/h3>/.test(HTML) &&
      ['etqpBuscar', 'etqpLista', 'etqpGramos', 'etqpCopias', 'etqpFormato', 'etqpContinuo', 'etqpResumen', 'etqpPreview', 'etqpImprimir'].every(id => HTML.includes('id="' + id + '"')));
  }

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
