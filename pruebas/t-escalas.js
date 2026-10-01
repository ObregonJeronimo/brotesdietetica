/**
 * ESCALAS DE GRANEL (variantes, etapa 2): EL PRECIO SEGÚN LA CANTIDAD.
 *
 * Pedido del comercio (24/09/2026). La yerba se compra en bolsas de 1 kg, 3 kg y 5 kg,
 * cada una con su costo, su precio por kilo y su stock. Al vender se ponen los gramos:
 *  - se cobra la escala más grande que no supera lo que se lleva (700 g y 2,9 kg pagan
 *    la de 1 kg; 3,1 kg la de 3 kg);
 *  - si llevando más paga menos, se avisa (el que atiende decide);
 *  - el stock sale de la bolsa de la escala que se cobra, y si no alcanza, de la del
 *    peso siguiente y después de la anterior, avisando cuánto sale de cada una y
 *    cuánto se gana de más o de menos;
 *  - en la venta se ve UNA línea; por dentro, un renglón por bolsa, todos al mismo
 *    precio, cada uno con su costo: así el stock y la ganancia se cuentan como siempre.
 * En el formulario se puede cargar lo que costó la bolsa y el costo por kilo sale solo.
 *
 * Corre admin-variantes.js y admin-escalas.js de verdad, con un panel de mentira, y
 * subtotalItem de admin.html.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const VAR = leer('admin-variantes.js');
const ESC = leer('admin-escalas.js');
const html = leer('admin.html');
const dialogo = leer('admin-dialogo.js');

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

/* ------------------------------------------------------------ la yerba de mentira */
const P = (id, extra) => Object.assign({ id, nombre: id, precio: 1000, precioMayorista: 900, costo: 500, stock: 0, tipoVenta: 'peso' }, extra || {});
function catalogo() {
  return [
    P('y1', { nombre: 'Yerba Mate x 1 kg', gramaje: '1 kg', precio: 8000, precioMayorista: 6500, costo: 5000, stock: 200 }),
    P('y3', { nombre: 'Yerba Mate x 3 kg', gramaje: '3 kg', precio: 7200, precioMayorista: 5850, costo: 4500, stock: 2300, gramajePadreId: 'y1' }),
    P('y5', { nombre: 'Yerba Mate x 5 kg', gramaje: '5 kg', precio: 6000, precioMayorista: 4900, costo: 3750, stock: 10000, gramajePadreId: 'y1' }),
    P('y500', { nombre: 'Yerba Mate x 500 g', gramaje: '500 g', tipoVenta: 'unidad', precio: 4160, stock: 10, gramajePadreId: 'y1' }),
    P('ysuelta', { nombre: 'Yerba suelta', stock: 900, gramajePadreId: 'y1' }),
    P('y10', { nombre: 'Yerba Mate x 10 kg', gramaje: '10 kg', precio: 5000, stock: 50000, oculto: true, gramajePadreId: 'y1' }),
    P('nuez', { nombre: 'Nueces', precio: 18000, stock: 3000 }),
    P('c1', { nombre: 'Chía x 1 kg', gramaje: '1 kg', precio: 9000, stock: 500 }),
    P('c3', { nombre: 'Chía x 3 kg', gramaje: '3 kg', precio: 8000, stock: 0, oculto: true, gramajePadreId: 'c1' }),
  ];
}

/* ------------------------------------------------ un panel de mentira, por prueba */
function armar(opts) {
  const o = opts || {};
  const porId = {};
  const el = id => (porId[id] = porId[id] || {
    id, value: '', innerHTML: '', textContent: '', hidden: false, style: {}, handlers: {},
    addEventListener(tp, fn) { this.handlers[tp] = fn; }, focus() {},
    querySelector(sel) { return (this.hijos || {})[sel] || null; },
    closest() { return this.fila || null; },
  });
  ['pCosto', 'pGramaje', 'pCostoBolsa', 'ventaTotal', 'ventaMayTotal'].forEach(el);
  const pintados = [], preguntas = [], confirmaciones = [], gramosPedidos = [], originales = [], avisos = [];
  const document = {
    activeElement: null,
    getElementById: id => porId[id] || null,
    querySelector: sel => (sel === '#pCostoBolsa .cb-nota' ? (porId.pCostoBolsa.hijos || {})['.cb-nota'] || null : null),
  };
  const ctx = {
    console, Math, Number, String, Object, Array, Set, Map, Promise, Infinity, parseInt, isFinite,
    setTimeout: () => 0,
    document,
    allProducts: o.productos || catalogo(),
    ventaItems: o.ventaItems || [],
    ventaMayItems: o.ventaMayItems || [],
    editingVentaId: o.editingVentaId || null,
    editingVentaOriginal: o.editingVentaOriginal || null,
    editingVentaMayId: o.editingVentaMayId || null,
    ventasMayData: o.ventasMayData || [],
    _tipoVentaProd: o.tipo || 'peso',
    _dlgAbiertos: 0,
    esc: s => String(s),
    _attrHtml: s => String(s),
    fmtPeso: g => (Math.abs(g) < 1000 ? g.toLocaleString('es-AR') + ' g' : (g / 1000).toLocaleString('es-AR', { maximumFractionDigits: 3 }) + ' kg'),
    montoAR: v => { const l = String(v == null ? '' : v).replace(/[^0-9]/g, ''); return l ? parseInt(l, 10) : 0; },
    limpiarMonto: i => { i.value = String(i.value).replace(/[^0-9]/g, ''); },
    calcPrecioModal: () => pintados.push('calc'),
    renderVentaItems: () => pintados.push('min'),
    renderVentaMayItems: () => pintados.push('may'),
    calcularTotalesVenta: () => ({ total: ctx.ventaItems.reduce((s, i) => s + ctx.subtotalItem(i), 0) }),
    calcVentaMayTotales: () => ({ total: ctx.ventaMayItems.reduce((s, i) => s + ctx.subtotalItem(i), 0) }),
    pedirCantidadPeso: async (p, op) => { gramosPedidos.push({ p, op }); return o.gramos === undefined ? null : o.gramos; },
    pedirOpcion: async (msg, op) => { preguntas.push({ msg, op }); return o.opcion === undefined ? null : o.opcion; },
    pedirConfirmacion: async (msg, op) => { confirmaciones.push({ msg, op }); return o.confirma !== false; },
    avisar: async (msg, op) => { avisos.push({ msg, op }); return true; },
    /* Los manejadores de la lista de la venta, como en admin.html: los envuelve admin-escalas.js. */
    updateVentaQty: (id, v) => originales.push('qty:' + id + '=' + v),
    updateVentaMayQty: (id, v) => originales.push('mayqty:' + id + '=' + v),
    removeVentaItem: id => originales.push('quitar:' + id),
    removeVentaMayItem: id => originales.push('mayquitar:' + id),
    setVentaItemDsc: (id, v) => originales.push('dsc:' + id + '=' + v),
    setVentaMayItemDsc: (id, v) => originales.push('maydsc:' + id + '=' + v),
    /* Los pedidos del panel (admin.html), para los envoltorios de admin-escalas.js. */
    pedItems: o.pedItems || [],
    pedidosData: o.pedidosData || [],
    editingPedidoId: o.editingPedidoId || null,
    addPedItem: id => {
      const ya = ctx.pedItems.find(i => i.id === id);
      if (ya) { ya.cantidad++; return; }
      const p = ctx.allProducts.find(x => x.id === id);
      ctx.pedItems.push({ id: p.id, nombre: p.nombre, precio: p.precio, costo: p.costo || 0, cantidad: 1, descuento: 0, tipoVenta: p.tipoVenta || 'unidad' });
    },
    updatePedQty: (id, v) => { const it = ctx.pedItems.find(i => i.id === id); if (it) it.cantidad = Math.max(1, parseInt(v, 10) || 1); },
    removePedItem: id => { ctx.pedItems = ctx.pedItems.filter(i => i.id !== id); },
    renderPedItems: () => pintados.push('ped'),
  };
  Object.assign(ctx, o.extra || {});
  ctx.window = ctx;
  vm.createContext(ctx);
  /* La cuenta de verdad de admin.html. */
  vm.runInContext(['esPorPeso', 'precioConDsc', 'subtotalItem'].map(n => cuerpo(html, n)).join('\n'), ctx);
  vm.runInContext(VAR, ctx);
  /* Estas pruebas son del FRENO (26/09): corren con el interruptor prendido. Las de vender
     sin stock avisando (29/09, lo que anda hoy) piden { frena: false }. */
  if (o.frena !== false) vm.runInContext('FRENAR_VENTA_SIN_STOCK = true;', ctx);
  vm.runInContext(ESC, ctx);
  return { ctx, porId, pintados, preguntas, confirmaciones, gramosPedidos, originales, avisos };
}
const b = (ctx, id) => ctx.allProducts.find(p => p.id === id);
const renglones = lista => lista.map(i => i.id + ':' + i.cantidad + '@' + i.precio + '/c' + i.costo).join(' ');

(async () => {
  /* =============================================================== LAS ESCALAS */
  console.log('\n-- las escalas --');
  {
    const { ctx } = armar();
    const esc = ctx.escalasDe(b(ctx, 'y3'));
    t('las variantes por peso con tamaño, de menor a mayor', esc.map(e => e.id + '>' + e.desde).join() === 'y1>1000,y3>3000,y5>5000');
    t('  el paquete de 500 g (por unidad) no es escala', !esc.some(e => e.id === 'y500'));
    t('  la suelta sin tamaño tampoco: se vende sola', !esc.some(e => e.id === 'ysuelta') && ctx.escalasDe(b(ctx, 'ysuelta')).length === 0);
    t('  ni la oculta', !esc.some(e => e.id === 'y10'));
    t('  la etiqueta sale del tamaño', esc.map(e => e.etiqueta).join() === '1 kg,3 kg,5 kg');
    t('desde cualquiera del grupo se llega a las mismas', ctx.escalasDe(b(ctx, 'y1')).length === 3 && ctx.escalasDe(b(ctx, 'y5')).length === 3);
    t('con una sola escala visible no hay escalas (la chía de 3 kg está oculta)', ctx.escalasDe(b(ctx, 'c1')).length === 0);
    t('un producto por peso sin variantes, tampoco', ctx.escalasDe(b(ctx, 'nuez')).length === 0);
    t('  ni uno por unidad', ctx.escalasDe(b(ctx, 'y500')).length === 0);

    const para = g => ctx.escalaPara(esc, g).id;
    t('700 g paga la de 1 kg (la más chica)', para(700) === 'y1');
    t('2,9 kg también la de 1 kg', para(2900) === 'y1');
    t('3 kg justos, la de 3 kg', para(3000) === 'y3');
    t('3,1 kg, la de 3 kg', para(3100) === 'y3');
    t('7 kg, la de 5 kg', para(7000) === 'y5');

    t('el precio del kilo: minorista y mayorista', ctx.precioKgEscala(esc[1], 'min') === 7200 && ctx.precioKgEscala(esc[1], 'may') === 5850);
    const sinMay = { producto: P('x', { precio: 3000, precioMayorista: 0 }) };
    t('  sin precio mayorista, el de mostrador (como addVentaMayItem)', ctx.precioKgEscala(sinMay, 'may') === 3000);
    const conDsc = { producto: P('x', { precio: 8000, descuento: 10 }) };
    t('  el descuento del producto va en la minorista y no en la mayorista', ctx.precioFinalKg(conDsc, 'min') === 7200 && ctx.precioFinalKg(conDsc, 'may') === 900);
    t('lo que se cobra es la misma cuenta que subtotalItem',
      ctx.cobroEscala(esc[0], 733, 'min') === ctx.subtotalItem({ precio: 8000, cantidad: 733, descuento: 0, tipoVenta: 'peso' }));
  }

  /* ================================================== LLEVANDO MÁS PAGA MENOS */
  console.log('\n-- llevando más paga menos --');
  {
    const { ctx } = armar();
    const esc = ctx.escalasDe(b(ctx, 'y1'));
    const lm = ctx.llevandoMas(esc, 2900, 'min');
    t('2,9 kg a $8.000 ($23.200) contra 3 kg a $7.200 ($21.600): avisa', !!lm && lm.total === 23200 && lm.mejor.escala.id === 'y3' && lm.mejor.total === 21600);
    t('2 kg no: 3 kg sale más ($16.000 contra $21.600)', ctx.llevandoMas(esc, 2000, 'min') === null);
    const lm2 = ctx.llevandoMas(esc, 4500, 'min');
    t('4,5 kg a $7.200 ($32.400) contra 5 kg a $6.000 ($30.000): avisa con la de 5 kg', !!lm2 && lm2.mejor.escala.id === 'y5' && lm2.mejor.total === 30000);
    t('en la escala más grande no hay más para ofrecer', ctx.llevandoMas(esc, 6000, 'min') === null);
    const lmMay = ctx.llevandoMas(esc, 2900, 'may');
    t('en la mayorista con los precios mayoristas (2,9 × 6.500 contra 3 × 5.850)', !!lmMay && lmMay.total === 18850 && lmMay.mejor.total === 17550);
    const msg = ctx.mensajeLlevandoMas(lm, 'min');
    t('el aviso dice las dos cuentas y la diferencia, sin hablar de "escalas" (26/09)',
      msg.indexOf('Estás vendiendo 2,9 kg de Yerba Mate a $8.000 el kilo, que es el precio de la bolsa de 1 kg: son $23.200.') === 0 &&
      msg.indexOf('[+] Si lleva 3 kg, paga menos: $7.200 el kilo, que es el precio de la bolsa de 3 kg. Son $21.600: se lleva más y paga $1.600 menos.') > 0 &&
      msg.indexOf('Podés ofrecérselo al cliente.') > 0 && msg.indexOf('scala') < 0, msg);
    t('  en la mayorista dice que es el precio mayorista',
      ctx.mensajeLlevandoMas(lmMay, 'may').indexOf('a $6.500 el kilo, que es el precio mayorista de la bolsa de 1 kg: son $18.850.') > 0);
  }

  /* ======================================================= DE QUÉ BOLSA SALE */
  console.log('\n-- de qué bolsa sale --');
  {
    const { ctx } = armar();
    const esc = ctx.escalasDe(b(ctx, 'y1'));
    const r = (cobra, g, disp) => ctx.repartirStock(esc, esc.find(e => e.id === cobra), g, disp);
    const txt = x => x.partes.map(p => p.escala.id + ':' + p.gramos).join(' ') + (x.falta ? ' falta ' + x.falta : '');
    t('si alcanza, todo de la escala que se cobra', txt(r('y1', 150)) === 'y1:150');
    t('700 g con 200 g en la de 1 kg: el resto de la de 3 kg (la siguiente)', txt(r('y1', 700)) === 'y1:200 y3:500');
    t('3 kg con 2,3 kg en la de 3 kg: completa con la de 5 kg', txt(r('y3', 3000)) === 'y3:2300 y5:700');
    const sinSig = ctx.repartirStock(esc, esc[2], 11000);
    t('en la más grande, sin siguiente: completa con las anteriores, de mayor a menor', txt(sinSig) === 'y5:10000 y3:1000');
    const todo = r('y1', 20000);
    t('si no alcanza ni sumando todas, lo que falta queda en la que se cobra (en negativo)',
      txt(todo) === 'y1:7700 y3:2300 y5:10000 falta 7500');
    b(ctx, 'y1').stock = -300;
    t('un stock negativo cuenta como vacío', txt(r('y1', 400)) === 'y3:400');
    b(ctx, 'y1').stock = 200;
    const conEdicion = r('y3', 3000, e => (e.id === 'y3' ? 2300 + 700 : Math.max(0, e.producto.stock)));
    t('lo que devuelve la venta que se edita se puede volver a usar', txt(conEdicion) === 'y3:3000');
  }

  console.log('\n-- la mezcla y la plata --');
  {
    const { ctx } = armar();
    const esc = ctx.escalasDe(b(ctx, 'y1'));
    const rep = ctx.repartirStock(esc, esc[0], 700);
    const mz = ctx.mezclaDe(rep, esc[0], 'min');
    t('700 g a precio de 1 kg con 500 g de la de 3 kg: a favor, 500 g × ($5.000 − $4.500) = $250', !!mz && mz.diferencia === 250);
    const rep2 = ctx.repartirStock(esc, esc[2], 11000);
    const mz2 = ctx.mezclaDe(rep2, esc[2], 'min');
    t('11 kg a precio de 5 kg con 1 kg de la de 3 kg: en contra, 1 kg × ($3.750 − $4.500) = −$750', !!mz2 && mz2.diferencia === -750);
    t('  y como la de 3 kg costó menos de lo que se cobra ($6.000), no hay pérdida', mz2.bajoCosto.length === 0);
    const caro = armar({ productos: catalogo().map(p => (p.id === 'y3' ? Object.assign(p, { costo: 6500 }) : p)) }).ctx;
    const escC = caro.escalasDe(caro.allProducts.find(p => p.id === 'y3'));
    const mzC = caro.mezclaDe(caro.repartirStock(escC, escC[2], 11000), escC[2], 'min');
    t('si la bolsa costó más de lo que se cobra, se dice cuánto se pierde: 1 kg × ($6.500 − $6.000) = $500',
      mzC.bajoCosto.length === 1 && mzC.bajoCosto[0].perdida === 500);
    t('sin mezcla no hay aviso', ctx.mezclaDe(ctx.repartirStock(esc, esc[0], 100), esc[0], 'min') === null);
    const sinCosto = armar({ productos: catalogo().map(p => (p.id === 'y3' ? Object.assign(p, { costo: 0 }) : p)) }).ctx;
    const escS = sinCosto.escalasDe(sinCosto.allProducts.find(p => p.id === 'y1'));
    const mzS = sinCosto.mezclaDe(sinCosto.repartirStock(escS, escS[0], 700), escS[0], 'min');
    t('sin el costo de una bolsa no inventa la diferencia', mzS.diferencia === null && mzS.sinCosto.map(e => e.id).join() === 'y3');

    /* El aviso con palabras simples (pedido del 26/09: "Mezcla de stock" con "En contra:
       ganás $300 menos que si todo saliera de la bolsa de 2 kg" no se entendía). */
    const msg = ctx.mensajeMezcla(rep, esc[0], mz, 700, 'min', null, 200);
    t('el aviso: qué se vende y a qué precio, de qué bolsa sale cada parte y lo que costó, sin "escala"',
      msg.indexOf('Estás vendiendo 700 g de Yerba Mate a $8.000 el kilo, que es el precio de la bolsa de 1 kg.') === 0 &&
      msg.indexOf('Pero en la bolsa de 1 kg quedan solo 200 g, así que se saca de las dos bolsas:') > 0 &&
      msg.indexOf('• 200 g de la bolsa de 1 kg, que te costó $5.000 el kilo') > 0 &&
      msg.indexOf('• 500 g de la bolsa de 3 kg, que te costó $4.500 el kilo') > 0 && msg.indexOf('scala') < 0, msg);
    t('  y la plata, resaltada: lo que se gana así contra si todo saliera de la bolsa que se cobra (5.600 − 3.250 y 5.600 − 3.500)',
      msg.indexOf('[+] La bolsa de 3 kg te salió más barata que la de 1 kg. Por eso ganás $250 más: $2.350 en vez de $2.100.') > 0 &&
      /¿Lo vendés así\?$/.test(msg), msg);
    const msg2 = ctx.mensajeMezcla(rep2, esc[2], mz2, 11000, 'min', null, 10000);
    t('  si se gana menos lo dice, y que igual se gana (66.000 − 42.000 y 66.000 − 41.250)',
      msg2.indexOf('[!] La bolsa de 3 kg te salió más cara que la de 5 kg. Por eso ganás $750 menos: $24.000 en vez de $24.750.') > 0 &&
      msg2.indexOf('Igual ganás plata, solo que menos.') > 0 && /¿Lo vendés igual\?$/.test(msg2), msg2);
    const repFalta = ctx.repartirStock(esc, esc[0], 20000);
    const msgFalta = ctx.mensajeMezcla(repFalta, esc[0], ctx.mezclaDe(repFalta, esc[0], 'min'), 20000, 'min', null, 200);
    t('  y si ni sumando alcanza, cuánto falta, y que así la venta no se puede registrar (26/09)',
      msgFalta.indexOf('[x] Y ni así alcanza: faltan 7,5 kg. Sin stock suficiente la venta NO se va a poder registrar: bajá la cantidad.') > 0, msgFalta);
    ctx.DESCONTAR_STOCK = false;
    const msgFaltaSin = ctx.mensajeMezcla(repFalta, esc[0], ctx.mezclaDe(repFalta, esc[0], 'min'), 20000, 'min', null, 200);
    ctx.DESCONTAR_STOCK = undefined;
    t('  (si el negocio no descuenta stock, como antes: queda en negativo)',
      msgFaltaSin.indexOf('[!] Y ni así alcanza: faltan 7,5 kg. Se descuentan de la bolsa de 1 kg, que queda con el stock en negativo.') > 0, msgFaltaSin);
    t('  sin sumarle el faltante a la bolsa que se cobra (tiene 200 g)', msgFalta.indexOf('• 200 g de la bolsa de 1 kg') > 0 && msgFalta.indexOf('• 7,7 kg') < 0);
    const repV = ctx.repartirStock(esc, esc[0], 700, e => (e.id === 'y1' ? 0 : 5000));
    const mzV = ctx.mezclaDe(repV, esc[0], 'min');
    const msgV = ctx.mensajeMezcla(repV, esc[0], mzV, 700, 'min', null, 0);
    t('  sin stock en la bolsa que se cobra, lo dice, y dice lo que costó (no está en la lista)',
      msgV.indexOf('Pero la bolsa de 1 kg no tiene stock, así que todo sale de la bolsa de 3 kg:') > 0 &&
      msgV.indexOf('[+] La bolsa de 3 kg te salió más barata que la de 1 kg, que te costó $5.000 el kilo. Por eso ganás $350 más: $2.450 en vez de $2.100.') > 0, msgV);

    /* El título dice qué pasa, y los botones qué hacen. */
    const av2 = ctx.avisoMezcla(rep2, esc[2], mz2, 11000, 'min', null, 10000);
    t('el título: "No alcanza la bolsa de 5 kg", con el ícono de atención si se gana menos; "Sí, vender" / "No, cancelar"',
      av2.opts.titulo === 'No alcanza la bolsa de 5 kg' && av2.opts.icono === 'bi-exclamation-triangle' &&
      av2.opts.aceptar === 'Sí, vender' && av2.opts.cancelar === 'No, cancelar' && av2.mensaje === msg2);
    const avV = ctx.avisoMezcla(repV, esc[0], mzV, 700, 'min', null, 0);
    t('  vacía: "La bolsa de 1 kg no tiene stock"; si se gana más, el ícono de información',
      avV.opts.titulo === 'La bolsa de 1 kg no tiene stock' && avV.opts.icono === 'bi-info-circle');

    /* Vender una parte por debajo de lo que costó, y perder en total. */
    const repC = caro.repartirStock(escC, escC[2], 11000);
    const msgC = caro.mensajeMezcla(repC, escC[2], mzC, 11000, 'min', null, 10000);
    t('una parte por debajo de lo que costó: en rojo, aunque en total se gane (y sin "igual ganás plata")',
      msgC.indexOf('[!] La bolsa de 3 kg te salió más cara que la de 5 kg. Por eso ganás $2.750 menos: $22.000 en vez de $24.750.') > 0 &&
      msgC.indexOf('[x] Ojo: la bolsa de 3 kg te costó $6.500 el kilo, más de lo que cobrás ($6.000 el kilo). Con 1 kg de esa bolsa perdés $500.') > 0 &&
      msgC.indexOf('Igual ganás plata') < 0, msgC);
    const ruina = armar({ productos: catalogo().map(p => (p.id === 'y3' ? Object.assign(p, { costo: 40000 }) : p)) }).ctx;
    const escR = ruina.escalasDe(ruina.allProducts.find(p => p.id === 'y3'));
    const repR = ruina.repartirStock(escR, escR[2], 11000);
    const msgR = ruina.mensajeMezcla(repR, escR[2], ruina.mezclaDe(repR, escR[2], 'min'), 11000, 'min', null, 10000);
    t('  y si en total se pierde, cuánto: lo que costó contra lo que se cobra (37.500 + 40.000 contra 66.000)',
      msgR.indexOf('[x] Ojo: así perdés $11.500. Lo que vendés te costó $77.500 y lo cobrás $66.000.') > 0 &&
      msgR.indexOf('te salió más cara') < 0 && /¿Lo vendés igual\?$/.test(msgR), msgR);
    const msgS = sinCosto.mensajeMezcla(sinCosto.repartirStock(escS, escS[0], 700), escS[0], mzS, 700, 'min', null, 200);
    t('sin el costo de una bolsa, qué falta cargar y dónde',
      msgS.indexOf('• 500 g de la bolsa de 3 kg, que no tiene cargado lo que costó') > 0 &&
      msgS.indexOf('[!] No se puede calcular cuánto ganás: falta cargar lo que costó la bolsa de 3 kg. Se carga en Productos.') > 0, msgS);
    const igual = armar({ productos: catalogo().map(p => (p.id === 'y3' ? Object.assign(p, { costo: 5000 }) : p)) }).ctx;
    const escI = igual.escalasDe(igual.allProducts.find(p => p.id === 'y1'));
    const repI = igual.repartirStock(escI, escI[0], 700);
    const avI = igual.avisoMezcla(repI, escI[0], igual.mezclaDe(repI, escI[0], 'min'), 700, 'min', null, 200);
    t('si las bolsas costaron lo mismo, lo dice, y se gana lo mismo', avI.mensaje.indexOf('[+] Las dos bolsas te costaron lo mismo el kilo, así que ganás lo mismo: $2.100.') > 0 &&
      avI.opts.icono === 'bi-info-circle', avI.mensaje);
    const msgMay = ctx.mensajeMezcla(ctx.repartirStock(esc, esc[2], 11000), esc[2], ctx.mezclaDe(ctx.repartirStock(esc, esc[2], 11000), esc[2], 'may'), 11000, 'may', null, 10000);
    t('en la mayorista: "el precio mayorista de la bolsa de 5 kg"', msgMay.indexOf('a $4.900 el kilo, que es el precio mayorista de la bolsa de 5 kg.') > 0, msgMay);

    /* El recuadro de color: [!], [x] y [+] en admin-dialogo.js. */
    const dlg = { createElement: () => { let s = ''; return { set textContent(v) { s = String(v); },
      get innerHTML() { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); } }; } };
    const dlgTexto = new Function('document', dialogo.slice(dialogo.indexOf('function _dlgEsc(')) + '\nreturn _dlgTexto;')(dlg);
    const hDlg = dlgTexto('Hola\n[!] Ganás <menos>\n[x] Perdés\n[+] Ganás más\n• un item\n[?] no es marca');
    t('el diálogo pone [!], [x] y [+] en un recuadro de color con su ícono, escapado',
      hDlg.indexOf('<p class="dlg-linea dlg-resalta atencion"><i class="bi bi-exclamation-triangle-fill"></i><span>Ganás &lt;menos&gt;</span></p>') > 0 &&
      hDlg.indexOf('<p class="dlg-linea dlg-resalta perdida"><i class="bi bi-x-octagon-fill"></i><span>Perdés</span></p>') > 0 &&
      hDlg.indexOf('<p class="dlg-linea dlg-resalta bien"><i class="bi bi-check-circle-fill"></i><span>Ganás más</span></p>') > 0, hDlg);
    t('  y el resto como siempre', hDlg.indexOf('<p class="dlg-linea">Hola</p>') === 0 && hDlg.indexOf('<p class="dlg-linea item">un item</p>') > 0 &&
      hDlg.indexOf('<p class="dlg-linea">[?] no es marca</p>') > 0);
    t('  con su CSS', /\.dlg-resalta\.atencion\{/.test(html) && /\.dlg-resalta\.perdida\{/.test(html) && /\.dlg-resalta\.bien\{/.test(html));
  }

  /* ================================================================ LA VENTA */
  console.log('\n-- agregar a la venta --');
  {
    const w = armar({ gramos: 700 });
    const r = await w.ctx.agregarGranelVenta(b(w.ctx, 'y3'), 'min');
    t('pide los gramos y agrega: 200 g de la bolsa de 1 kg y 500 g de la de 3 kg, los dos a $8.000',
      r === 'hecho' && renglones(w.ctx.ventaItems) === 'y1:200@8000/c5000 y3:500@8000/c4500');
    t('  con el nombre del producto, no el de la bolsa', w.ctx.ventaItems.every(i => i.nombre === 'Yerba Mate'));
    t('  marcados con la escala que se cobró', w.ctx.ventaItems.every(i => i.escala === '1 kg' && i.escalaId === 'y1'));
    t('  avisó antes: "No alcanza la bolsa de 1 kg"', w.confirmaciones.length === 1 && w.confirmaciones[0].op.titulo === 'No alcanza la bolsa de 1 kg' &&
      w.confirmaciones[0].op.aceptar === 'Sí, vender' && w.confirmaciones[0].msg.indexOf('Estás vendiendo 700 g de Yerba Mate') === 0);
    const op = w.gramosPedidos[0].op;
    t('el diálogo de gramos muestra hasta dónde vale cada precio y el stock de todas',
      op.nombre === 'Yerba Mate' && op.detalle === 'Menos de 3 kg: $8.000 el kilo · 3 kg o más: $7.200 el kilo · 5 kg o más: $6.000 el kilo' &&
      op.stock === 12500, op.detalle);
    const q = op.cotizar(3100);
    t('  y el total en vivo con el precio de la bolsa que va a tocar', q.total === 22320 && q.nota === 'Se cobra el precio de la bolsa de 3 kg: $7.200 el kilo.', q.nota);
  }
  {
    const w = armar({ gramos: 1000, ventaItems: [{ id: 'nuez', nombre: 'Nueces', precio: 18000, costo: 9000, cantidad: 250, tipoVenta: 'peso' },
      { id: 'y1', nombre: 'Yerba Mate', precio: 8000, costo: 5000, cantidad: 200, descuento: 0, tipoVenta: 'peso' },
      { id: 'y3', nombre: 'Yerba Mate', precio: 8000, costo: 4500, cantidad: 1800, descuento: 0, tipoVenta: 'peso' },
      { id: 'chia', nombre: 'Chia', precio: 100, costo: 50, cantidad: 2, tipoVenta: 'unidad' }] });
    await w.ctx.agregarGranelVenta(b(w.ctx, 'y1'), 'min');
    t('sumar 1 kg a los 2 kg que había: 3 kg, pasa a la escala de 3 kg y todo sale de esa bolsa',
      renglones(w.ctx.ventaItems.filter(i => i.nombre === 'Yerba Mate')) === 'y3:2300@7200/c4500 y5:700@7200/c3750');
    t('  en el mismo lugar de la lista', w.ctx.ventaItems.map(i => i.id).join() === 'nuez,y3,y5,chia');
    const d = w.gramosPedidos[0].op;
    t('  el diálogo dice lo que ya había', d.detalle.indexOf('ya hay 2 kg en la venta') > 0 && d.stock === 10500);
    t('  y avisa que lo de antes cambia de precio', d.cotizar(1000).nota.indexOf('Lo que ya estaba en la venta pasa a este precio') > 0);
  }
  {
    const w = armar({ gramos: null });
    const r = await w.ctx.agregarGranelVenta(b(w.ctx, 'y1'), 'min');
    t('cancelar los gramos no agrega nada', r === 'cancelar' && w.ctx.ventaItems.length === 0);
    t('un producto sin escalas no es asunto de este módulo', (await w.ctx.agregarGranelVenta(b(w.ctx, 'nuez'), 'min')) === 'no' && w.gramosPedidos.length === 1);
  }
  {
    const w = armar({ gramos: 700, confirma: false });
    await w.ctx.agregarGranelVenta(b(w.ctx, 'y1'), 'min');
    t('cancelar el aviso de mezcla no agrega nada', w.ctx.ventaItems.length === 0 && w.confirmaciones.length === 1);
  }
  {
    const w = armar({ gramos: 100 });
    await w.ctx.agregarGranelVenta(b(w.ctx, 'y1'), 'min');
    t('sin mezcla no pregunta nada', w.confirmaciones.length === 0 && w.preguntas.length === 0 && renglones(w.ctx.ventaItems) === 'y1:100@8000/c5000');
  }

  console.log('\n-- llevando más, en la venta --');
  {
    const w = armar({ gramos: 2900, opcion: 'igual' });
    await w.ctx.agregarGranelVenta(b(w.ctx, 'y1'), 'min');
    const pq = w.preguntas[0];
    t('2,9 kg pregunta, con las dos cuentas en los botones', !!pq && pq.op.opciones.map(x => x.texto).join(' / ') === 'Vender 2,9 kg ($23.200) / Vender 3 kg ($21.600)' &&
      pq.op.opciones[0].principal === true);
    t('  "Vender 2,9 kg": queda al precio de la regla', w.ctx.ventaItems.reduce((s, i) => s + i.cantidad, 0) === 2900 && w.ctx.ventaItems.every(i => i.precio === 8000));
  }
  {
    const w = armar({ gramos: 2900, opcion: 'mas' });
    await w.ctx.agregarGranelVenta(b(w.ctx, 'y1'), 'min');
    t('"Vender 3 kg": 3 kg a $7.200, de la bolsa de 3 kg y la de 5 kg', renglones(w.ctx.ventaItems) === 'y3:2300@7200/c4500 y5:700@7200/c3750');
  }
  {
    const w = armar({ gramos: 2900, opcion: null });
    await w.ctx.agregarGranelVenta(b(w.ctx, 'y1'), 'min');
    t('cerrarlo sin elegir no agrega nada', w.ctx.ventaItems.length === 0 && w.confirmaciones.length === 0);
  }
  {
    const w = armar({ gramos: 2900, opcion: 'igual' });
    await w.ctx.agregarGranelVenta(b(w.ctx, 'y1'), 'may');
    t('en la mayorista, a precio mayorista y sin descuento', w.ctx.ventaMayItems.length > 0 && w.ctx.ventaMayItems.every(i => i.precio === 6500 && i.descuento === 0) &&
      w.ctx.ventaItems.length === 0);
  }

  console.log('\n-- editar una venta --');
  {
    /* La venta guardada sacó 2,3 kg de la bolsa de 3 kg y 700 g de la de 5 kg; ahora la
       de 3 kg está en 0. Al editar, esos 2,3 kg vuelven: se pueden usar. */
    const items = [{ id: 'y3', cantidad: 2300 }, { id: 'y5', cantidad: 700 }];
    const prods = catalogo().map(p => (p.id === 'y3' ? Object.assign(p, { stock: 0 }) : p));
    const w = armar({ productos: prods, editingVentaId: 'v1', editingVentaOriginal: { stockDescontado: true, items } });
    const disp = w.ctx.disponibleParaVenta('min');
    const esc = w.ctx.escalasDe(b(w.ctx, 'y3'));
    t('lo que ya descontó la venta que se edita cuenta como disponible', disp(esc[1]) === 2300 && disp(esc[2]) === 10700);
    const w2 = armar({ productos: prods, editingVentaId: 'v1', editingVentaOriginal: { stockDescontado: false, items } });
    t('  salvo que esa venta no haya descontado stock', w2.ctx.disponibleParaVenta('min')(esc[1]) === 0);
    const w3 = armar({ productos: prods, editingVentaMayId: 'm1', ventasMayData: [{ id: 'm1', stockDescontado: true, items }] });
    t('  en la mayorista también', w3.ctx.disponibleParaVenta('may')(esc[1]) === 2300 && w3.ctx.disponibleParaVenta('min')(esc[1]) === 0);
  }

  /* ========================================================= LA LÍNEA DE LA VENTA */
  console.log('\n-- una línea por producto --');
  {
    const w = armar();
    const items = [
      { id: 'nuez', nombre: 'Nueces', precio: 18000, costo: 9000, cantidad: 250, descuento: 0, tipoVenta: 'peso' },
      { id: 'y1', nombre: 'Yerba Mate', precio: 8000, costo: 5000, cantidad: 200, descuento: 0, tipoVenta: 'peso', escala: '1 kg', escalaId: 'y1' },
      { id: 'y3', nombre: 'Yerba Mate', precio: 8000, costo: 4500, cantidad: 501, descuento: 0, tipoVenta: 'peso', escala: '1 kg', escalaId: 'y1' },
    ];
    const v = w.ctx.vistaItemsVenta(items);
    t('los renglones de la yerba se dibujan en una línea', v.length === 2 && v[0].id === 'nuez' && v[1].id === 'y1' && v[1].cantidad === 701);
    t('  con la suma de los subtotales de verdad (sin redondear dos veces)',
      v[1].__sub === w.ctx.subtotalItem(items[1]) + w.ctx.subtotalItem(items[2]));
    t('  y de qué bolsas sale', v[1].__detalle === 'Precio de la bolsa de 1 kg · sale 200 g de la bolsa de 1 kg y 501 g de la bolsa de 3 kg', v[1].__detalle);
    t('  los renglones de verdad no se tocan', items.length === 3 && items[2].cantidad === 501);
    const sinEscalas = [items[0]];
    t('una venta sin escalas se dibuja como siempre (la misma lista, sin copiarla)', w.ctx.vistaItemsVenta(sinEscalas) === sinEscalas);
    const cargada = [{ id: 'y3', nombre: 'Yerba Mate', precio: 7200, costo: 4500, cantidad: 2300, tipoVenta: 'peso' },
      { id: 'y5', nombre: 'Yerba Mate', precio: 7200, costo: 3750, cantidad: 700, tipoVenta: 'peso' }];
    const vc = w.ctx.vistaItemsVenta(cargada);
    t('una venta guardada (sin la marca de la escala) se junta igual y deduce la escala', vc.length === 1 && vc[0].id === 'y3' &&
      vc[0].__detalle === 'Precio de la bolsa de 3 kg · sale 2,3 kg de la bolsa de 3 kg y 700 g de la bolsa de 5 kg');
    const una = w.ctx.vistaItemsVenta([{ id: 'y1', nombre: 'Yerba Mate', precio: 8000, cantidad: 300, tipoVenta: 'peso', escalaId: 'y1' }]);
    t('con un solo renglón de su bolsa, solo de qué bolsa es el precio', una[0].__detalle === 'Precio de la bolsa de 1 kg');
  }

  console.log('\n-- cambiar, sacar y descontar la línea --');
  {
    const base = () => [
      { id: 'nuez', nombre: 'Nueces', precio: 18000, costo: 9000, cantidad: 250, descuento: 0, tipoVenta: 'peso' },
      { id: 'y1', nombre: 'Yerba Mate', precio: 8000, costo: 5000, cantidad: 200, descuento: 0, tipoVenta: 'peso', escalaId: 'y1' },
      { id: 'y3', nombre: 'Yerba Mate', precio: 8000, costo: 4500, cantidad: 500, descuento: 0, tipoVenta: 'peso', escalaId: 'y1' },
    ];
    const w = armar({ ventaItems: base() });
    await w.ctx.updateVentaQty('y1', '100');
    t('cambiar los gramos de la línea vuelve a calcular todo: 100 g, de la bolsa de 1 kg', renglones(w.ctx.ventaItems.filter(i => i.nombre === 'Yerba Mate')) === 'y1:100@8000/c5000');
    await w.ctx.updateVentaQty('nuez', '300');
    t('  con otro producto hace lo de siempre', w.originales.join() === 'qty:nuez=300');
    const w2 = armar({ ventaItems: base(), confirma: false });
    await w2.ctx.updateVentaQty('y1', '900');
    t('  si se cancela el aviso, queda como estaba (y se repinta el campo)', renglones(w2.ctx.ventaItems.filter(i => i.nombre === 'Yerba Mate')) === 'y1:200@8000/c5000 y3:500@8000/c4500' &&
      w2.pintados.indexOf('min') >= 0);
    const w3 = armar({ ventaItems: base() });
    w3.ctx.removeVentaItem('y1');
    t('sacar la línea saca todos sus renglones', w3.ctx.ventaItems.map(i => i.id).join() === 'nuez');
    w3.ctx.removeVentaItem('nuez');
    t('  con otro producto, lo de siempre', w3.originales.join() === 'quitar:nuez');
    const w4 = armar({ ventaItems: base() });
    w4.ctx.setVentaItemDsc('y1', '10');
    t('el descuento de la línea va a todos sus renglones', w4.ctx.ventaItems.filter(i => i.nombre === 'Yerba Mate').every(i => i.descuento === 10));
    t('  y actualiza el total sin repintar la lista (el foco sigue en el campo)', w4.porId.ventaTotal.textContent === '$' + (4500 + 1440 + 3600).toLocaleString('es-AR') &&
      w4.pintados.length === 0);
    const w5 = armar({ ventaMayItems: base() });
    w5.ctx.removeVentaMayItem('y3');
    t('en la mayorista igual', w5.ctx.ventaMayItems.map(i => i.id).join() === 'nuez');
  }

  /* ======================================================= EL COSTO DE LA BOLSA */
  console.log('\n-- el costo de la bolsa --');
  /* La calculadora de mentira: al "dibujarse" quedan los hijos. */
  const calculadora = w => {
    const cont = w.porId.pCostoBolsa;
    const nota = { textContent: '' }, tam = { textContent: '' };
    const inp = w.porId.pCostoBolsaInput = { id: 'pCostoBolsaInput', value: '', handlers: {},
      addEventListener(tp, fn) { this.handlers[tp] = fn; } };
    Object.defineProperty(cont, 'innerHTML', { set(v) { this._h = v; this.hijos = v ? { input: inp, '.cb-nota': nota, '.cb-tam': tam } : {}; }, get() { return this._h || ''; } });
    return { cont, nota, tam, inp };
  };
  {
    const w = armar();
    const { cont, nota, tam, inp } = calculadora(w);
    /* El tamaño de la bolsa del proveedor (01/10): un campo aparte, en kilos. */
    const kil = w.porId.pBolsaKilos = { value: '3' };
    w.porId.pCosto.value = '4500';
    w.ctx.pintarCostoBolsa();
    t('en un producto por peso con bolsa de 3 kg aparece', cont.hidden === false && tam.textContent === '3 kg');
    t('  dice qué es y qué hace (30/09)', cont.innerHTML.indexOf('¿La factura dice el precio de la bolsa de <span class="cb-tam"></span>? ' +
      'Escribilo acá y se calcula solo el costo por kilo.</label>') > 0);
    t('  y cuánto sale hoy la bolsa con el costo por kilo', nota.textContent === 'Hoy: $4.500 el kilo = $13.500 la bolsa de 3 kg.', nota.textContent);
    inp.value = '13.500';
    w.ctx.costoBolsaEscrito(inp);
    t('escribir lo que costó la bolsa carga el costo por kilo', w.porId.pCosto.value === '4500' && w.pintados.indexOf('calc') >= 0);
    t('  y lo dice', nota.textContent === '= $4.500 el kilo. Ya quedó puesto arriba, en Costo por kilo.', nota.textContent);
    inp.value = '2600';
    w.ctx.costoBolsaEscrito(inp);
    t('  redondeado al peso: $2.600 la bolsa de 3 kg son $867 el kilo', w.porId.pCosto.value === '867');
    w.ctx._tipoVentaProd = 'unidad';
    w.ctx.pintarCostoBolsa();
    t('en uno por unidad no aparece', cont.hidden === true);
    w.ctx._tipoVentaProd = 'peso';
    kil.value = '';
    w.ctx.pintarCostoBolsa();
    t('  ni en uno por peso sin tamaño', cont.hidden === true);
    w.porId.pGramaje.value = '3 kg';
    w.ctx.pintarCostoBolsa();
    t('  Gramaje / Presentación no es la bolsa de uno suelto: es lo que ve el cliente (01/10)', cont.hidden === true);
    w.porId.pNombre = { value: 'Lenteja x 5 kg' };
    w.ctx.pintarCostoBolsa();
    t('  si lo dice el nombre ("Lenteja x 5 kg"), esa es la bolsa', cont.hidden === false && tam.textContent === '5 kg', tam.textContent);
    w.porId.pNombre.value = '';
    w.ctx.window._varHijo = { id: 'y3' };
    w.ctx.pintarCostoBolsa();
    t('  en una bolsa de un grupo, la suya es su Gramaje / Presentación, como siempre', cont.hidden === false && tam.textContent === '3 kg', tam.textContent);
    w.ctx.window._varHijo = null;
    kil.value = '3';
    w.ctx.pintarCostoBolsa();
    const seVe = cont.hidden === false;
    w.ctx.window._varFilas = [{ id: null, tam: '5 kg' }];
    w.ctx.pintarCostoBolsa();
    t('  y se esconde con la tabla de bolsas a la vista: lo que costó la bolsa va en su primera fila', seVe && cont.hidden === true);
    w.ctx.window._varFilas = [];
  }
  {
    /* Pedido del dueño (01/10): el tamaño de la bolsa que se le compra al proveedor va aparte de
       Gramaje / Presentación (que es lo que ve el cliente): un campo en kilos abajo del costo, solo
       en un producto por peso sin otras bolsas. Abajo, "¿Querés disponer de más tamaños?" baja
       hasta "Agregar otra bolsa" y lo resalta, sin tocarlo (30/09). */
    const w = armar({ productos: catalogo().concat([P('man', { nombre: 'Mani', bolsaGramos: 500 }), P('ave', { nombre: 'Avena' })]) });
    calculadora(w);
    const kil = { value: '', handlers: {}, addEventListener(tp, fn) { this.handlers[tp] = fn; } };
    const mas = { style: {} };
    let creada = null, antesDe = null;
    w.porId.pCostoBolsa.parentNode = { insertBefore: (e, ref) => { antesDe = ref; w.porId[e.id] = e; } };
    w.ctx.document.createElement = () => (creada = { style: {}, querySelector: s => (s === 'input' ? kil : null),
      set innerHTML(v) { this._h = v; w.porId.pBolsaKilos = kil; w.porId.pTamMas = mas; }, get innerHTML() { return this._h; } });
    w.ctx.editingId = 'man';
    w.ctx._ponerBolsaDelProducto();
    t('por peso, abajo del costo va "Tamaño de la bolsa que le comprás al proveedor", en kilos, de 5 caracteres',
      !!creada && creada.id === 'pBolsaWrap' && antesDe === w.porId.pCostoBolsa && creada.style.display === '' &&
      creada.innerHTML.indexOf('Tamaño de la bolsa que le comprás al proveedor (opcional)') > 0 &&
      creada.innerHTML.indexOf('id="pBolsaKilos" maxlength="5" placeholder="Ej: 5"') > 0 &&
      creada.innerHTML.indexOf('<span class="vfe-unidad">kilos</span>') > 0 && creada.innerHTML.indexOf('No lo ve el cliente.') > 0);
    t('  con la del producto, en kilos: 500 g son 0,5', kil.value === '0,5', kil.value);
    t('  y Gramaje / Presentación queda como estaba, a la vista', w.porId.pGramaje.style.display === undefined && w.porId.pGramaje.value === '');
    kil.value = '2 5a';
    kil.handlers.input();
    t('  solo toma el número (sin espacios ni letras)', kil.value === '25', kil.value);
    const d1 = w.ctx.datosBolsaProveedor({ tipoVenta: 'peso', gramaje: null }, 'man');
    t('  al guardar va aparte, en gramos (bolsaGramos 25000), y el gramaje no se toca', d1.bolsaGramos === 25000 && d1.gramaje === null);
    kil.value = '0,5';
    t('  con coma para medio kilo: 500 g', w.ctx.datosBolsaProveedor({ tipoVenta: 'peso' }, 'man').bolsaGramos === 500);
    kil.value = '';
    t('  si se borra, se borra (en uno que la tenía)', w.ctx.datosBolsaProveedor({ tipoVenta: 'peso' }, 'man').bolsaGramos === null);
    t('  y uno que nunca la tuvo no gana el campo', !('bolsaGramos' in w.ctx.datosBolsaProveedor({ tipoVenta: 'peso' }, 'ave')));
    w.ctx.editingId = null;
    w.ctx._ponerBolsaDelProducto();
    t('  un producto nuevo arranca vacío', kil.value === '');
    t('  sin "Agregar otra bolsa" abajo, no ofrece más tamaños', mas.style.display === 'none');
    const q0 = w.ctx.document.querySelector;
    w.ctx.document.querySelector = sel => (sel === '#pVariantes .var-agregar' ? {} : q0(sel));
    w.ctx.pintarCostoBolsa();
    t('  con el botón abajo, "¿Querés disponer de más tamaños?" aparece', mas.style.display === '' &&
      creada.innerHTML.indexOf('onclick="irAMasTamanos()">¿Querés disponer de más tamaños?</button>') > 0);
    w.ctx._tipoVentaProd = 'unidad';
    w.ctx.pintarCostoBolsa();
    t('por unidad no va', creada.style.display === 'none' && mas.style.display === 'none' &&
      !('bolsaGramos' in w.ctx.datosBolsaProveedor({ tipoVenta: 'unidad' }, 'man')));
    w.ctx._tipoVentaProd = 'peso';
    w.ctx.window._varHijo = { id: 'y3' };
    w.ctx.pintarCostoBolsa();
    t('  ni en una bolsa de un grupo: su tamaño es su Gramaje / Presentación', creada.style.display === 'none' &&
      !('bolsaGramos' in w.ctx.datosBolsaProveedor({ tipoVenta: 'peso' }, 'man')));
    w.ctx.window._varHijo = null;
    t('el guardado de la ficha lo escribe, como la caja cerrada',
      html.indexOf("if(typeof datosCajaCerrada==='function')datosCajaCerrada(data,editingId);if(typeof datosBolsaProveedor==='function')datosBolsaProveedor(data,editingId);") > 0);
    const cl = () => ({ c: [], add(x) { this.c.push(x); }, remove(x) { this.c = this.c.filter(y => y !== x); } });
    const btn = { classList: cl(), clics: 0, click() { this.clics++; } };
    const sec = { classList: cl(), scrollIntoView(o) { this.bajo = o; }, querySelector: s => (s === '.var-agregar' ? btn : null) };
    w.porId.pVariantesSec = sec;
    const timers = [];
    w.ctx.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
    w.ctx.irAMasTamanos();
    t('"¿Querés disponer de más tamaños?" baja hasta la sección, sin tocar el botón',
      sec.bajo && sec.bajo.behavior === 'smooth' && btn.clics === 0 && !sec.classList.c.length && timers.length === 1 && timers[0].ms === 450);
    timers[0].fn();
    t('  al llegar, resalta la sección y el botón', sec.classList.c.join() === 'resaltar' && btn.classList.c.join() === 'resaltar' &&
      timers.length === 2 && timers[1].ms === 1000);
    timers[1].fn();
    t('  un segundo, y se apaga', !sec.classList.c.length && !btn.classList.c.length && btn.clics === 0);
  }

  /* ============================================== EL AVISO DE LOS PEDIDOS WEB */
  console.log('\n-- el aviso de los pedidos web --');
  {
    const w = armar();
    const web = [{ id: 'y3', nombre: 'Yerba Mate', cantidad: 2300, precio: 7200, escala: '3 kg', escalaId: 'y3' },
      { id: 'y5', nombre: 'Yerba Mate', cantidad: 700, precio: 7200, escala: '3 kg', escalaId: 'y3' }];
    t('un pedido web que sacó de otra bolsa: qué, de dónde y la plata (con el costo de cada bolsa)',
      w.ctx.mezclaDePedido(web) === 'Yerba Mate: se cobró el precio de la bolsa de 3 kg, pero 700 g salen de la bolsa de 5 kg. Esa bolsa te salió más barata: ganás $525 más.',
      w.ctx.mezclaDePedido(web));
    const contra = [{ id: 'y1', nombre: 'Yerba Mate', cantidad: 1000, precio: 6000, escala: '5 kg', escalaId: 'y5' }];
    t('  en contra también (1 kg de la bolsa de 1 kg cobrado a precio de 5 kg)', /Esa bolsa te salió más cara: ganás \$1\.250 menos\.$/.test(w.ctx.mezclaDePedido(contra) || ''));
    const dos = [{ id: 'y5', cantidad: 1000, escalaId: 'y5' }, { id: 'y1', cantidad: 500, escalaId: 'y5' }, { id: 'y3', cantidad: 500, escalaId: 'y5' }];
    t('  de dos bolsas: por lo que costó cada una (500 × −1.250 + 500 × −750)',
      w.ctx.mezclaDePedido(dos) === 'Yerba Mate: se cobró el precio de la bolsa de 5 kg, pero 500 g salen de la bolsa de 1 kg y 500 g salen de la bolsa de 3 kg. Por lo que costó cada bolsa, ganás $1.000 menos.',
      w.ctx.mezclaDePedido(dos));
    t('sin mezcla no avisa', w.ctx.mezclaDePedido([{ id: 'y3', cantidad: 3000, escalaId: 'y3' }]) === null);
    t('  ni en un pedido sin granel', w.ctx.mezclaDePedido([{ id: 'nuez', cantidad: 250 }]) === null && w.ctx.mezclaDePedido(undefined) === null);
    t('el tablero de pedidos lo muestra como "Otra bolsa"', /var _mzPed=\(typeof mezclaDePedido==='function'\)\?mezclaDePedido\(p\.items\):null;/.test(html) &&
      html.indexOf('<i class="bi bi-shuffle"></i> Otra bolsa</span>') > 0);
  }

  /* ========================================================= LOS GANCHOS */
  console.log('\n-- los ganchos --');
  const iEsc = html.indexOf('<script src="admin-escalas.js"></script>');
  t('el módulo se carga después de variantes y de los diálogos', iEsc > html.indexOf('<script src="admin-variantes.js"></script>') &&
    iEsc > html.indexOf('<script src="admin-dialogo.js"></script>'));
  const agregar = cuerpo(html, '_agregarItemVenta');
  t('al agregar, el granel con escalas va antes de pedir los gramos de siempre',
    agregar.indexOf('agregarGranelVenta(p,ctx)') > 0 && agregar.indexOf('agregarGranelVenta(p,ctx)') < agregar.indexOf('pedirCantidadPeso'));
  t('  y después de las preguntas de oculto y depurado', agregar.indexOf('agregarGranelVenta(p,ctx)') > agregar.indexOf("depuracionOfrecerRestaurar(p,'venderlo')"));
  t('  si se cancela no agrega nada', /granel=await agregarGranelVenta\(p,ctx\);\s*if\(granel==='cancelar'\)return;/.test(agregar));
  t('  y si se agregó no agrega de nuevo', /if\(otraPresentacion\|\|granel==='hecho'\)\{/.test(agregar));
  const rMin = cuerpo(html, 'renderVentaItems'), rMay = cuerpo(html, 'renderVentaMayItems');
  [['minorista', rMin, 'ventaItems'], ['mayorista', rMay, 'ventaMayItems']].forEach(([n, r, lista]) => {
    t('la lista ' + n + ' dibuja la vista (una línea por producto)', r.indexOf('vistaItemsVenta(' + lista + ')') > 0);
    t('  con el subtotal de la línea y el detalle de las bolsas', r.indexOf('(i.__sub!=null)?i.__sub:subtotalItem(i)') > 0 && r.indexOf('i.__detalle?') > 0);
    t('  y el total sigue saliendo de los renglones de verdad', /costoItem\(i\)/.test(r) && r.indexOf(lista + '.reduce') > 0);
  });
  t('el formulario tiene el lugar del costo de la bolsa, debajo del costo', /<small id="pCostoFecha" class="costo-fecha"><\/small><div id="pCostoBolsa" class="costo-bolsa" hidden><\/div>/.test(html));
  t('el diálogo de gramos acepta detalle, stock y el total en vivo', /opts\.detalle \? _dlgEsc\(opts\.detalle\)/.test(dialogo) &&
    /opts\.stock != null/.test(dialogo) && /typeof opts\.cotizar === 'function'/.test(dialogo));
  t('  y sin eso anda como antes', /Math\.round\(precioKg \* g \/ 1000\)/.test(dialogo));

  /* ====================================================== EL SELECTOR (etapa 1) */
  console.log('\n-- el selector de variantes --');
  {
    const w = armar();
    const cuerpoPag = [];
    const elegidos = [];
    w.ctx.document.createElement = () => {
      const e = { id: '', className: '', innerHTML: '', style: {}, handlers: {} };
      e.addEventListener = (tp, fn) => { e.handlers[tp] = fn; };
      e.remove = () => { const i = cuerpoPag.indexOf(e); if (i >= 0) cuerpoPag.splice(i, 1); };
      e.querySelectorAll = () => [];
      e.querySelector = () => ({ addEventListener() {} });
      return e;
    };
    w.ctx.document.body = { appendChild: e => cuerpoPag.push(e) };
    w.ctx.document.addEventListener = () => {};
    w.ctx.document.removeEventListener = () => {};
    w.ctx._agregarItemVenta = (id, c) => elegidos.push(id + '@' + c);
    w.ctx.abrirVariantesVenta('y1', 'min');
    const h = cuerpoPag[0] ? cuerpoPag[0].innerHTML : '';
    t('las escalas van en UNA opción, "A granel", con sus precios', (h.match(/class="var-op var-granel"/g) || []).length === 1 &&
      h.indexOf('$8.000 · desde 3 kg $7.200 · desde 5 kg $6.000 el kilo') > 0);
    t('  el paquete de 500 g y la suelta siguen siendo opciones', h.indexOf('data-id="y500"') > 0 && h.indexOf('data-id="ysuelta"') > 0);
    t('  y ninguna escala aparece suelta', h.indexOf('data-id="y3"') < 0 && h.indexOf('data-id="y5"') < 0);
    const soloEscalas = catalogo().filter(p => ['y1', 'y3', 'y5'].indexOf(p.id) >= 0);
    const w2 = armar({ productos: soloEscalas });
    const eleg2 = [];
    w2.ctx._agregarItemVenta = (id, c) => eleg2.push(id + '@' + c);
    w2.ctx.document.body = { appendChild: () => { throw new Error('no tenía que abrir el selector'); } };
    w2.ctx.document.addEventListener = () => {};
    w2.ctx.document.removeEventListener = () => {};
    w2.ctx.abrirVariantesVenta('y1', 'may');
    t('si solo tiene escalas, no hay nada que elegir: directo a los gramos', eleg2.join() === 'y1@may');
  }

  /* ======================= VENDER MÁS DE LO QUE HAY: NO SE PUEDE (25 y 26/09/2026) */
  console.log('\n-- vender más de lo que hay: no se puede --');
  {
    /* Pedido del comercio: con 1 en stock se vendieron 2 y no avisó nada (25/09). Se agregó un
       aviso con "Registrar igual", y al otro día: "que no me deje vender si no tengo stock
       suficiente" (26/09). */
    const linea = (id, cant, extra) => Object.assign({ id, nombre: id, precio: 1000, cantidad: cant, tipoVenta: 'unidad' }, extra || {});
    const w = armar({ ventaItems: [linea('y500', 12)] });
    const f = w.ctx.faltantesDeStock(w.ctx.ventaItems, 'min');
    t('12 paquetes de 500 g con 10 en stock: no alcanza', f.length === 1 && f[0].producto.id === 'y500' && f[0].hay === 10 && f[0].vende === 12);
    t('  la línea de la venta lo dice, con la unidad como el aviso', w.ctx.vistaItemsVenta(w.ctx.ventaItems)[0].__falta === 'Solo hay 10 unidades en stock: así no se puede vender');
    t('  y la línea sigue siendo la misma (sus manejadores no cambian)', w.ctx.vistaItemsVenta(w.ctx.ventaItems)[0].id === 'y500');
    const ok = await w.ctx.avisoStockInsuficiente(w.ctx.ventaItems, 'min');
    const a = w.avisos[0] || { msg: '', op: {} };
    t('al registrar NO se registra: un solo aviso, sin "Registrar igual"', ok === false && w.avisos.length === 1 && w.confirmaciones.length === 0 &&
      a.op.titulo === 'Stock insuficiente' && a.op.aceptar === 'Entendido' && a.op.alerta === true, JSON.stringify(a.op));
    t('  con el ícono en rojo (sin volver rojo el botón)', /\(opts\.alerta \? ' alerta' : ''\)/.test(dialogo) && /\.dlg-box\.alerta \.dlg-ico\{/.test(html));
    t('  en rojo, con lo que hay, lo que se vende y qué hacer',
      a.msg.indexOf('[x] STOCK INSUFICIENTE: la venta NO se puede realizar debido a que no tenés stock suficiente de este producto:') === 0 &&
      a.msg.indexOf('- Yerba Mate x 500 g: tenés 10 unidades y estás vendiendo 12 unidades.') > 0 &&
      a.msg.indexOf('Bajá la cantidad o sacalo de la venta. Si te llegó mercadería y todavía no la cargaste, sumala en Stock con "Agregar stock" y volvé a intentar.') > 0, a.msg);
    const w3 = armar({ ventaItems: [linea('y500', 10)] });
    t('si alcanza justo, se registra sin decir nada', (await w3.ctx.avisoStockInsuficiente(w3.ctx.ventaItems, 'min')) === true &&
      w3.avisos.length === 0 && w3.ctx.vistaItemsVenta(w3.ctx.ventaItems) === w3.ctx.ventaItems);
    const w4 = armar({ ventaItems: [linea('nuez', 3500, { tipoVenta: 'peso' })] });
    t('un granel sin escalas, en gramos: "tenés 3 kg y estás vendiendo 3,5 kg"', (await w4.ctx.avisoStockInsuficiente(w4.ctx.ventaItems, 'min')) === false &&
      w4.avisos[0].msg.indexOf('- Nueces: tenés 3 kg y estás vendiendo 3,5 kg.') > 0, (w4.avisos[0] || {}).msg);
    const prods = catalogo();
    prods.find(p => p.id === 'y500').stock = 0;
    const w5 = armar({ productos: prods, ventaItems: [linea('y500', 1)] });
    t('sin nada en stock: "no tenés stock"', (await w5.ctx.avisoStockInsuficiente(w5.ctx.ventaItems, 'min')) === false &&
      w5.avisos[0].msg.indexOf('- Yerba Mate x 500 g: no tenés stock y estás vendiendo 1 unidad.') > 0 &&
      w5.ctx.vistaItemsVenta(w5.ctx.ventaItems)[0].__falta === 'Sin stock: no se puede vender', (w5.avisos[0] || {}).msg);
    const w6 = armar({ ventaItems: [linea('y3', 3000, { tipoVenta: 'peso', escalaId: 'y3' })] });
    t('el granel con escalas también: cada renglón descuenta de su bolsa (3 kg de la de 3 kg, que tiene 2,3 kg)',
      (await w6.ctx.avisoStockInsuficiente(w6.ctx.ventaItems, 'min')) === false &&
      w6.avisos[0].msg.indexOf('- Yerba Mate x 3 kg: tenés 2,3 kg y estás vendiendo 3 kg.') > 0, (w6.avisos[0] || {}).msg);
    t('  y su línea lo dice (el total alcanza sumando bolsas: hay que repartirlo de nuevo)',
      w6.ctx.vistaItemsVenta(w6.ctx.ventaItems)[0].__falta === 'Cambió el stock de las bolsas: volvé a poner los gramos');
    const w6b = armar({ ventaItems: [linea('y3', 13000, { tipoVenta: 'peso', escalaId: 'y5' })] });
    t('  si ni sumando las bolsas alcanza, cuánto hay en total', w6b.ctx.vistaItemsVenta(w6b.ctx.ventaItems)[0].__falta === 'Solo hay 12,5 kg en stock: así no se puede vender');
    const w7 = armar({ ventaItems: [linea('y500', 12)], editingVentaId: 'v1', editingVentaOriginal: { stockDescontado: true, items: [{ id: 'y500', cantidad: 5 }] } });
    t('editando una venta, lo que ella ya descontó vuelve: 10 + 5 alcanzan para 12', (await w7.ctx.avisoStockInsuficiente(w7.ctx.ventaItems, 'min')) === true &&
      w7.avisos.length === 0);
    const w8 = armar({ ventaItems: [linea('y500', 12)] });
    w8.ctx._pedidoOrigenVentaId = 'ped1';
    w8.ctx.pedidosData = [{ docId: 'ped1', stockDescontado: true, items: [] }];
    t('un pedido web que ya descontó no se frena (esta venta no descuenta)', (await w8.ctx.avisoStockInsuficiente(w8.ctx.ventaItems, 'min')) === true &&
      w8.avisos.length === 0);
    const w9 = armar({ ventaItems: [linea('y500', 12)] });
    w9.ctx.DESCONTAR_STOCK = false;
    t('si el negocio no descuenta stock, tampoco', (await w9.ctx.avisoStockInsuficiente(w9.ctx.ventaItems, 'min')) === true &&
      w9.avisos.length === 0 && w9.ctx.vistaItemsVenta(w9.ctx.ventaItems) === w9.ctx.ventaItems);
    const w10 = armar({ ventaMayItems: [linea('y500', 11)] });
    t('en la mayorista también', (await w10.ctx.avisoStockInsuficiente(w10.ctx.ventaMayItems, 'may')) === false && w10.avisos.length === 1 &&
      w10.ctx.vistaItemsVenta(w10.ctx.ventaMayItems)[0].__falta === 'Solo hay 10 unidades en stock: así no se puede vender');
    const w12 = armar({ ventaItems: [linea('y500', 12), linea('nuez', 3500, { tipoVenta: 'peso' })] });
    await w12.ctx.avisoStockInsuficiente(w12.ctx.ventaItems, 'min');
    t('con varios que no alcanzan, un solo aviso con todos', w12.avisos.length === 1 &&
      w12.avisos[0].msg.indexOf('de estos productos:') > 0 && w12.avisos[0].msg.indexOf('- Nueces:') > 0 && w12.avisos[0].msg.indexOf('- Yerba Mate x 500 g:') > 0);
    const conNombre = catalogo();
    Object.assign(conNombre.find(p => p.id === 'y1'), { nombre: 'Yerba Mate', nombreMostrado: 'Yerba Mate Orgánica de la casa' });
    const w11 = armar({ productos: conNombre });
    t('con presentaciones dice cuál, con la forma de las otras: "Yerba Mate x 1 kg"', w11.ctx._nombreConPresentacion(b(w11.ctx, 'y1')) === 'Yerba Mate x 1 kg' &&
      w11.ctx._nombreConPresentacion(b(w11.ctx, 'y500')) === 'Yerba Mate x 500 g' && w11.ctx._nombreConPresentacion(b(w11.ctx, 'nuez')) === 'Nueces');
    t('la venta y la mayorista lo miran antes de registrar', html.indexOf("if(typeof avisoStockInsuficiente==='function'&&!(await avisoStockInsuficiente(ventaItems,'min')))return;") > 0 &&
      html.indexOf("if(typeof avisoStockInsuficiente==='function'&&!(await avisoStockInsuficiente(ventaMayItems,'may')))return;") > 0);
    t('  y las dos listas muestran la línea en amarillo', (html.match(/\(i\.__falta\?'<span class="vi-falta">/g) || []).length === 2);
  }

  console.log('\n-- sin stock no se agrega: lo que queda y el aviso --');
  {
    const w = armar({ ventaItems: [{ id: 'y500', cantidad: 4 }] });
    const sp = w.ctx.stockParaVenta(b(w.ctx, 'y500'), w.ctx.ventaItems, 'min');
    t('lo que queda para esta venta: hay 10, ya hay 4, quedan 6', sp.hay === 10 && sp.ya === 4 && sp.queda === 6);
    const w2 = armar({ editingVentaId: 'v1', editingVentaOriginal: { stockDescontado: true, items: [{ id: 'y500', cantidad: 5 }] } });
    t('  editando una venta cuenta lo que ella ya descontó (10 + 5)', w2.ctx.stockParaVenta(b(w2.ctx, 'y500'), [], 'min').hay === 15);
    w.ctx.DESCONTAR_STOCK = false;
    t('  si el negocio no descuenta stock, null: no se frena nada', w.ctx.stockParaVenta(b(w.ctx, 'y500'), [], 'min') === null);
    w.ctx.DESCONTAR_STOCK = undefined;

    const T1 = w.ctx.textoStockInsuficiente;
    const nuez = b(w.ctx, 'nuez'), y500 = b(w.ctx, 'y500');
    t('el texto que pidió el comercio: "STOCK INSUFICIENTE: actualmente tenés en total 2,3 kg de STOCK RESTANTE, la venta NO se puede realizar..."',
      T1(nuez, 2300, 0) === 'STOCK INSUFICIENTE: actualmente tenés en total 2,3 kg de STOCK RESTANTE, la venta NO se puede realizar debido a que no tenés stock suficiente.', T1(nuez, 2300, 0));
    t('  en unidades', T1(y500, 3, 0) === 'STOCK INSUFICIENTE: actualmente tenés en total 3 unidades de STOCK RESTANTE, la venta NO se puede realizar debido a que no tenés stock suficiente.' &&
      T1(y500, 1, 0).indexOf('en total 1 unidad de STOCK') > 0);
    t('  con algo ya en la venta, cuánto más se puede agregar',
      T1(nuez, 2300, 1000) === 'STOCK INSUFICIENTE: actualmente tenés en total 2,3 kg de STOCK RESTANTE y en esta venta ya hay 1 kg, así que podés agregar hasta 1,3 kg. Con más, la venta NO se puede realizar debido a que no tenés stock suficiente.', T1(nuez, 2300, 1000));
    t('  con todo ya en la venta', T1(y500, 3, 3) === 'STOCK INSUFICIENTE: actualmente tenés en total 3 unidades de STOCK RESTANTE y ya está todo en esta venta: la venta NO se puede realizar debido a que no tenés stock suficiente.');
    t('  sin nada de stock', T1(y500, 0, 0) === 'STOCK INSUFICIENTE: no te queda STOCK RESTANTE de este producto, la venta NO se puede realizar debido a que no tenés stock suficiente.' &&
      T1(y500, -4, 0) === T1(y500, 0, 0));
    const fr = w.ctx.frenoDeGramos(nuez, { hay: 3000, ya: 0, queda: 3000 });
    t('lo que recibe el diálogo de gramos para frenar', fr.stock === 3000 && fr.bloquear === true && fr.avisoSinStock === T1(nuez, 3000, 0) &&
      fr.ayudaSinStock.indexOf('"Agregar stock"') > 0 && JSON.stringify(w.ctx.frenoDeGramos(nuez, null)) === '{}');
  }
  {
    /* El granel con escalas: el diálogo de gramos frena, y fijar también (cambiar la línea). */
    const w = armar({ gramos: 700 });
    await w.ctx.agregarGranelVenta(b(w.ctx, 'y1'), 'min');
    const op = w.gramosPedidos[0].op;
    t('el diálogo de gramos del granel frena con todo lo que hay en sus bolsas (200 g + 2,3 kg + 10 kg)',
      op.bloquear === true && op.stock === 12500 && op.avisoSinStock.indexOf('actualmente tenés en total 12,5 kg de STOCK RESTANTE,') > 0);
    const wy = armar({ gramos: 1000, ventaItems: [{ id: 'y1', nombre: 'Yerba Mate', precio: 8000, costo: 5000, cantidad: 200, descuento: 0, tipoVenta: 'peso', escalaId: 'y1' }] });
    await wy.ctx.agregarGranelVenta(b(wy.ctx, 'y1'), 'min');
    const opy = wy.gramosPedidos[0].op;
    t('  con algo ya en la venta, lo que queda y cuánto más se puede', opy.stock === 12300 &&
      opy.avisoSinStock.indexOf('y en esta venta ya hay 200 g, así que podés agregar hasta 12,3 kg.') > 0, opy.avisoSinStock);
    const w2 = armar({ gramos: 20000 });
    const r2 = await w2.ctx.agregarGranelVenta(b(w2.ctx, 'y1'), 'min');
    t('más de lo que hay sumando todas las bolsas: no se agrega y se dice por qué', r2 === 'cancelar' && w2.ctx.ventaItems.length === 0 &&
      w2.avisos.length === 1 && w2.avisos[0].op.titulo === 'Stock insuficiente' &&
      w2.avisos[0].msg.indexOf('Yerba Mate') === 0 && w2.avisos[0].msg.indexOf('[x] STOCK INSUFICIENTE: actualmente tenés en total 12,5 kg de STOCK RESTANTE,') > 0 &&
      w2.confirmaciones.length === 0, (w2.avisos[0] || {}).msg);
    const base = () => [{ id: 'y1', nombre: 'Yerba Mate', precio: 8000, costo: 5000, cantidad: 200, descuento: 0, tipoVenta: 'peso', escalaId: 'y1' }];
    const w3 = armar({ ventaItems: base() });
    await w3.ctx.updateVentaQty('y1', '13000');
    t('  cambiar los gramos de la línea a más de lo que hay: queda como estaba, y se repinta el campo',
      renglones(w3.ctx.ventaItems) === 'y1:200@8000/c5000' && w3.avisos.length === 1 && w3.pintados.indexOf('min') >= 0);
    const w4 = armar({ ventaItems: base() });
    w4.ctx.DESCONTAR_STOCK = false;
    await w4.ctx.updateVentaQty('y1', '13000');
    t('  si el negocio no descuenta stock, se puede (como antes)', w4.avisos.length === 0 &&
      w4.ctx.ventaItems.reduce((s, i) => s + i.cantidad, 0) === 13000);
    const esc = w.ctx.escalasDe(b(w.ctx, 'y1'));
    t('"llevando más" no ofrece más de lo que hay: 2,9 kg con 2,95 kg en stock no ofrece los 3 kg',
      w.ctx.llevandoMas(esc, 2900, 'min', null, 2950) === null && !!w.ctx.llevandoMas(esc, 2900, 'min', null, 3000) && !!w.ctx.llevandoMas(esc, 2900, 'min'));
  }
  {
    /* Cambiar la cantidad en la línea de un producto sin escalas. */
    const w = armar({ ventaItems: [{ id: 'nuez', nombre: 'Nueces', precio: 18000, costo: 9000, cantidad: 250, descuento: 0, tipoVenta: 'peso' }] });
    await w.ctx.updateVentaQty('nuez', '3500');
    t('la cantidad de la línea tampoco pasa lo que hay: no cambia, se repinta y se dice por qué',
      w.originales.length === 0 && w.pintados.indexOf('min') >= 0 && w.avisos.length === 1 &&
      w.avisos[0].msg.indexOf('[x] STOCK INSUFICIENTE: actualmente tenés en total 3 kg de STOCK RESTANTE,') > 0, (w.avisos[0] || {}).msg);
    await w.ctx.updateVentaQty('nuez', '3000');
    t('  justo lo que hay, sí', w.originales.join() === 'qty:nuez=3000');
    const wm = armar({ ventaMayItems: [{ id: 'y500', nombre: 'Yerba', precio: 1000, cantidad: 2, tipoVenta: 'unidad' }] });
    await wm.ctx.updateVentaMayQty('y500', '11');
    t('  en la mayorista igual', wm.originales.length === 0 && wm.pintados.indexOf('may') >= 0 && wm.avisos.length === 1);
  }
  {
    /* Lo que queda en admin.html y admin-dialogo.js. */
    t('agregar un producto por unidad sin stock no se puede: se dice por qué (releyendo el stock antes; solo si frena)',
      html.indexOf("const sp=(p&&typeof stockFrena==='function'&&stockFrena(ctx))?await stockParaVentaFresco(p,lista,ctx,1):null;") > 0 &&
      html.indexOf("if(sp&&sp.queda<1){await avisarSinStock(p,sp.hay,sp.ya);return;}") > 0);
    t('  los gramos de un granel sin escalas frenan en el diálogo',
      html.indexOf("const gr = await pedirCantidadPeso(p,Object.assign({precioKg:precioKg},(sp&&typeof frenoDeGramos==='function')?frenoDeGramos(p,sp,async()=>{await _stockFresco([p.id]);return stockParaVenta(p,lista,ctx);}):{}));") > 0);
    t('el diálogo de gramos: sin stock suficiente el botón no anda, ni Enter, y el aviso sale en rojo',
      /btnOk\.disabled = !ok \|\| frena;/.test(dialogo) && (dialogo.match(/&& !sinStock\(g\)\) cerrar\(g\);/g) || []).length === 2 &&
      dialogo.indexOf("avi.className = 'pz-aviso pz-bloqueo';") > 0 && /\.pz-aviso\.pz-bloqueo\{/.test(html));
    t('  y el botón apagado se ve apagado (antes quedaba igual de verde)', /\.dlg-pie \.btn:disabled\{opacity:0\.4;cursor:not-allowed/.test(html));
    t('  sin nada de stock, el aviso sale de entrada', /\/\* Sin nada de stock el aviso sale de entrada, antes de escribir\. \*\/\s*pintar\(\);/.test(dialogo));
    t('  y sin bloquear (el negocio no descuenta), como antes', dialogo.indexOf("(!bloquear && ok && stock > 0 && g > stock)") > 0);
  }

  /* =================================== VENDER SIN STOCK: SE AVISA Y SE DEJA (29/09) */
  console.log('\n-- vender sin stock suficiente: se avisa y se deja (29/09, lo que anda hoy) --');
  {
    /* Pedido del dueño (29/09/2026): "que te deje vender igual, pero que te salte el aviso".
       Es FRENAR_VENTA_SIN_STOCK en false: estas pruebas piden { frena: false }. */
    const linea = (id, cant, extra) => Object.assign({ id, nombre: id, precio: 1000, cantidad: cant, tipoVenta: 'unidad' }, extra || {});
    const w = armar({ frena: false, ventaItems: [linea('y500', 12)] });
    t('el interruptor viene apagado: el stock se mira, pero no frena', /let FRENAR_VENTA_SIN_STOCK = false;/.test(VAR) &&
      w.ctx.stockFrena('min') === false && w.ctx.stockSeMira('min') === true);
    t('la línea dice que queda en negativo (no que no se puede)', w.ctx.vistaItemsVenta(w.ctx.ventaItems)[0].__falta === 'Solo hay 10 unidades en stock: va a quedar en negativo');
    const ok = await w.ctx.avisoStockInsuficiente(w.ctx.ventaItems, 'min');
    const c = w.confirmaciones[0] || { msg: '', op: {} };
    t('al registrar pregunta, con "Vender igual" y "Revisar la venta", y el ícono en amarillo',
      ok === true && w.avisos.length === 0 && w.confirmaciones.length === 1 && c.op.titulo === 'Stock insuficiente' &&
      c.op.aceptar === 'Vender igual' && c.op.cancelar === 'Revisar la venta' && c.op.cuidado === true && !c.op.alerta && !c.op.peligro, JSON.stringify(c.op));
    t('  el aviso dice qué pasa, en cuánto queda el stock y qué hacer después',
      c.msg.indexOf('[!] Estás por vender más de lo que tenés en stock.') === 0 &&
      c.msg.indexOf('- Yerba Mate x 500 g: tenés 10 unidades y estás vendiendo 12 unidades. Va a quedar en -2 unidades.') > 0 &&
      c.msg.indexOf('Podés vender igual: la venta se registra y el stock de este producto queda en negativo.') > 0 &&
      c.msg.indexOf('Cuando te llegue la mercadería, cargala en Stock con "Agregar stock" y el número vuelve a estar bien.') > 0, c.msg);
    t('  el ícono amarillo existe', /\(opts\.cuidado \? ' cuidado' : ''\)/.test(dialogo) && /\.dlg-box\.cuidado \.dlg-ico\{/.test(html));
    t('  y se repintan las líneas antes de preguntar (con el stock recién leído)', w.pintados.indexOf('min') >= 0);
    const wno = armar({ frena: false, confirma: false, ventaItems: [linea('y500', 12)] });
    t('"Revisar la venta" no registra: vuelve a la venta', (await wno.ctx.avisoStockInsuficiente(wno.ctx.ventaItems, 'min')) === false);
    const wv = armar({ frena: false, ventaItems: [linea('y500', 12), linea('nuez', 3500, { tipoVenta: 'peso' })] });
    await wv.ctx.avisoStockInsuficiente(wv.ctx.ventaItems, 'min');
    const cv = wv.confirmaciones[0] || { msg: '' };
    t('con varios, un solo aviso con todos, y el granel en gramos', wv.confirmaciones.length === 1 &&
      cv.msg.indexOf('[!] Estás por vender más de lo que tenés en stock de estos productos:') === 0 &&
      cv.msg.indexOf('- Nueces: tenés 3 kg y estás vendiendo 3,5 kg. Va a quedar en -500 g.') > 0 &&
      cv.msg.indexOf('el stock de estos productos queda en negativo') > 0, cv.msg);
    const prods = catalogo();
    prods.find(p => p.id === 'y500').stock = -2;
    const wn = armar({ frena: false, productos: prods, ventaItems: [linea('y500', 3)] });
    await wn.ctx.avisoStockInsuficiente(wn.ctx.ventaItems, 'min');
    t('ya en negativo: "no te queda stock", y queda en -5 (el negativo de antes también cuenta)',
      (wn.confirmaciones[0] || { msg: '' }).msg.indexOf('- Yerba Mate x 500 g: no te queda stock y estás vendiendo 3 unidades. Va a quedar en -5 unidades.') > 0 &&
      wn.ctx.vistaItemsVenta(wn.ctx.ventaItems)[0].__falta === 'Sin stock: va a quedar en negativo', (wn.confirmaciones[0] || {}).msg);
    const we = armar({ frena: false, ventaItems: [linea('y500', 17)], editingVentaId: 'v1', editingVentaOriginal: { stockDescontado: true, items: [{ id: 'y500', cantidad: 5 }] } });
    await we.ctx.avisoStockInsuficiente(we.ctx.ventaItems, 'min');
    t('editando una venta, lo que ya había descontado vuelve: 10 + 5, vende 17, queda en -2',
      (we.confirmaciones[0] || { msg: '' }).msg.indexOf('tenés 15 unidades y estás vendiendo 17 unidades. Va a quedar en -2 unidades.') > 0, (we.confirmaciones[0] || {}).msg);
    const w1 = armar({ frena: false, ventaItems: [linea('y500', 11)] });
    await w1.ctx.avisoStockInsuficiente(w1.ctx.ventaItems, 'min');
    t('  "-1 unidad", en singular', (w1.confirmaciones[0] || { msg: '' }).msg.indexOf('Va a quedar en -1 unidad.') > 0);
    const wok = armar({ frena: false, ventaItems: [linea('y500', 10)] });
    t('si alcanza, no pregunta nada', (await wok.ctx.avisoStockInsuficiente(wok.ctx.ventaItems, 'min')) === true && wok.confirmaciones.length === 0);
    const wm = armar({ frena: false, ventaMayItems: [linea('y500', 11)] });
    t('en la mayorista igual', (await wm.ctx.avisoStockInsuficiente(wm.ctx.ventaMayItems, 'may')) === true && wm.confirmaciones.length === 1 &&
      wm.ctx.vistaItemsVenta(wm.ctx.ventaMayItems)[0].__falta === 'Solo hay 10 unidades en stock: va a quedar en negativo');
    const wd = armar({ frena: false, ventaItems: [linea('y500', 12)] });
    wd.ctx.DESCONTAR_STOCK = false;
    t('si el negocio no descuenta stock, ni pregunta ni marca la línea', (await wd.ctx.avisoStockInsuficiente(wd.ctx.ventaItems, 'min')) === true &&
      wd.confirmaciones.length === 0 && wd.ctx.vistaItemsVenta(wd.ctx.ventaItems) === wd.ctx.ventaItems);
  }
  {
    /* Cambiar la cantidad en la línea: se cambia, como siempre. */
    const nueces = () => [{ id: 'nuez', nombre: 'Nueces', precio: 18000, costo: 9000, cantidad: 250, descuento: 0, tipoVenta: 'peso' }];
    const w = armar({ frena: false, ventaItems: nueces() });
    await w.ctx.updateVentaQty('nuez', '3500');
    t('subir la cantidad de la línea más de lo que hay se puede, sin cartel (lo dice la línea)', w.originales.join() === 'qty:nuez=3500' && w.avisos.length === 0);
    const wm = armar({ frena: false, ventaMayItems: [{ id: 'y500', nombre: 'Yerba', precio: 1000, cantidad: 2, tipoVenta: 'unidad' }] });
    await wm.ctx.updateVentaMayQty('y500', '11');
    t('  en la mayorista igual', wm.originales.join() === 'mayqty:y500=11' && wm.avisos.length === 0);
    let leidas = 0;
    const wl = armar({ frena: false, ventaItems: nueces() });
    wl.ctx.db = { collection: () => ({ doc: () => ({ get: async () => { leidas++; return { exists: false }; } }) }) };
    await wl.ctx.updateVentaQty('nuez', '9000');
    t('  y sin releer el stock: no hay nada que frenar', leidas === 0 && wl.originales.join() === 'qty:nuez=9000');
    /* La línea de un granel con bolsas (la envuelve admin-escalas.js): 13 kg con 12,5 kg. */
    const wg = armar({ frena: false, ventaItems: [{ id: 'y1', nombre: 'Yerba Mate', precio: 8000, costo: 5000, cantidad: 200, descuento: 0, tipoVenta: 'peso', escalaId: 'y1' }] });
    await wg.ctx.updateVentaQty('y1', '13000');
    const mz = wg.confirmaciones.find(x => x.msg.indexOf('Y ni así alcanza') > 0) || { msg: '' };
    t('  un granel con bolsas también: 13 kg con 12,5 kg se ponen, avisando que falta y queda en negativo',
      wg.avisos.length === 0 && wg.ctx.ventaItems.reduce((s, i) => s + i.cantidad, 0) === 13000 &&
      mz.msg.indexOf('[!] Y ni así alcanza: faltan 500 g.') > 0, renglones(wg.ctx.ventaItems) + ' | ' + mz.msg);
  }
  {
    /* El diálogo de gramos: deja, avisando. */
    const w = armar({ frena: false });
    const fr = w.ctx.frenoDeGramos(b(w.ctx, 'nuez'), { hay: 3000, ya: 0, queda: 3000 });
    t('el diálogo de gramos recibe que avise, no que bloquee', fr.stock === 3000 && fr.avisarNegativo === true && !fr.bloquear &&
      JSON.stringify(w.ctx.frenoDeGramos(b(w.ctx, 'nuez'), null)) === '{}');
    const wg = armar({ frena: false, gramos: 700 });
    await wg.ctx.agregarGranelVenta(b(wg.ctx, 'y1'), 'min');
    const op = wg.gramosPedidos[0].op;
    t('  el del granel con escalas también, con todo lo que hay en sus bolsas', op.avisarNegativo === true && !op.bloquear && op.stock === 12500);
    t('  y el diálogo dice "sin stock" arriba, y abajo que se puede y queda en negativo',
      dialogo.indexOf("((bloquear || opts.avisarNegativo) ? ' &middot; sin stock' : '')") > 0 &&
      dialogo.indexOf("'Ojo: no queda stock de este producto. '") > 0 && dialogo.indexOf("'Se puede vender igual, y el stock va a quedar en negativo.'") > 0);
  }
  {
    /* El granel con escalas: más de lo que hay en todas las bolsas se agrega, avisando. */
    const w = armar({ frena: false, gramos: 20000 });
    const r = await w.ctx.agregarGranelVenta(b(w.ctx, 'y1'), 'min');
    const cf = w.confirmaciones.find(x => x.msg.indexOf('Y ni así alcanza') > 0) || { msg: '', op: {} };
    t('20 kg con 12,5 kg en las bolsas: se agrega, avisando que la bolsa de 5 kg queda en negativo',
      r === 'hecho' && w.avisos.length === 0 && w.ctx.ventaItems.reduce((s, i) => s + i.cantidad, 0) === 20000 &&
      cf.msg.indexOf('[!] Y ni así alcanza: faltan 7,5 kg. Se descuentan de la bolsa de 5 kg, que queda con el stock en negativo.') > 0 &&
      cf.op.aceptar === 'Sí, vender', cf.msg);
    const w2 = armar({ frena: false, gramos: 20000, confirma: false });
    t('  y si dice que no, no se agrega nada', (await w2.ctx.agregarGranelVenta(b(w2.ctx, 'y1'), 'min')) === 'cancelar' && w2.ctx.ventaItems.length === 0);
    const pocas = catalogo();
    pocas.find(p => p.id === 'y5').stock = 0;
    const w3 = armar({ frena: false, gramos: 2900, productos: pocas, opcion: 'igual' });
    await w3.ctx.agregarGranelVenta(b(w3.ctx, 'y1'), 'min');
    t('"llevando más, paga menos" se ofrece aunque no haya para llevar más (2,9 kg con 2,5 kg en las bolsas)',
      w3.preguntas.some(q => q.op.titulo === 'Llevando más, paga menos'));
  }
  {
    /* La otra presentación: se puede agregar la pedida igual (ver t-variantes.js). Y agregar
       un producto por unidad sin stock: admin.html solo relee y frena si frena. */
    t('agregar un producto por unidad sin stock: solo se frena si frena (stockFrena)',
      html.indexOf("const sp=(p&&typeof stockFrena==='function'&&stockFrena(ctx))?await stockParaVentaFresco(p,lista,ctx,1):null;") > 0);
  }

  /* ======================================== LA REVISIÓN DE CÓDIGO DEL 26/09 */
  console.log('\n-- revisión del 26/09: editar una venta que dejó el stock en negativo --');
  {
    /* Ayer se vendieron 12 paquetes con 10 en stock (antes del freno): quedó en -2. Hoy se
       edita esa venta para arreglar el medio de pago, sin tocar las cantidades. */
    const prods = catalogo();
    prods.find(p => p.id === 'y500').stock = -2;
    const edit = { editingVentaId: 'v1', editingVentaOriginal: { stockDescontado: true, items: [{ id: 'y500', cantidad: 12 }] } };
    const w = armar(Object.assign({ productos: prods, ventaItems: [{ id: 'y500', nombre: 'y500', precio: 1000, cantidad: 12, tipoVenta: 'unidad' }] }, edit));
    t('editarla sin tocar las cantidades se puede (antes: "tenés 10 y estás vendiendo 12")',
      (await w.ctx.avisoStockInsuficiente(w.ctx.ventaItems, 'min')) === true && w.avisos.length === 0 &&
      w.ctx.vistaItemsVenta(w.ctx.ventaItems) === w.ctx.ventaItems);
    const sp = w.ctx.stockParaVenta(b(w.ctx, 'y500'), [], 'min');
    t('  bajar la cantidad también (lo que hay: los 12 que tomó, el negativo no resta)', sp.hay === 12 && sp.queda === 12);
    const w2 = armar(Object.assign({ productos: prods, ventaItems: [{ id: 'y500', nombre: 'y500', precio: 1000, cantidad: 13, tipoVenta: 'unidad' }] }, edit));
    t('  subirla, no: no hay de dónde', (await w2.ctx.avisoStockInsuficiente(w2.ctx.ventaItems, 'min')) === false &&
      w2.avisos[0].msg.indexOf('tenés 12 unidades y estás vendiendo 13 unidades') > 0, (w2.avisos[0] || {}).msg);
    const w3 = armar({ productos: prods });
    t('  y en una venta nueva, con -2 no hay nada', w3.ctx.stockParaVenta(b(w3.ctx, 'y500'), [], 'min').hay === 0);
    const bolsas = catalogo();
    bolsas.find(p => p.id === 'y3').stock = -500;
    const w4 = armar({ productos: bolsas, editingVentaId: 'v2', editingVentaOriginal: { stockDescontado: true, items: [{ id: 'y3', cantidad: 2800 }] } });
    const esc = w4.ctx.escalasDe(b(w4.ctx, 'y3'));
    t('  lo mismo con las bolsas del granel: la de 3 kg en -500 que tomó 2,8 kg tiene 2,8 kg para esa venta',
      w4.ctx.disponibleParaVenta('min')(esc[1]) === 2800);
    const w5 = armar({ productos: prods });
    t('  y la otra presentación no se ofrece si con lo tomado alcanza', w5.ctx.sugerenciaPresentacion(b(w5.ctx, 'y500'), { y500: 12 - 12 }, w5.ctx.allProducts) === null);
  }

  console.log('\n-- revisión del 26/09: registrar de a una --');
  {
    let llamadas = 0, soltar;
    const w = armar({ extra: {
      saveVenta: async () => { llamadas++; if (llamadas === 1) await new Promise(r => { soltar = r; }); },
      saveVentaMay: async () => { llamadas++; },
    } });
    const a = w.ctx.saveVenta();
    const b2 = w.ctx.saveVenta();
    t('un doble clic mientras relee el stock registra una sola vez', llamadas === 1);
    soltar();
    await a; await b2;
    await w.ctx.saveVenta();
    t('  terminada, se puede registrar otra', llamadas === 2);
    await w.ctx.saveVentaMay();
    t('  y la mayorista igual', llamadas === 3);
  }

  console.log('\n-- revisión del 26/09: antes de frenar, el stock de ahora --');
  {
    const dbCon = stocks => ({ collection: () => ({ doc: id => ({ get: async () => ({ exists: stocks[id] != null, data: () => ({ stock: stocks[id] }) }) }) }) });
    const prods = catalogo();
    prods.find(p => p.id === 'y500').stock = 0;
    const w = armar({ productos: prods });
    w.ctx.db = dbCon({ y500: 10 });
    const sp = await w.ctx.stockParaVentaFresco(b(w.ctx, 'y500'), [], 'min', 1);
    t('con 0 en la pantalla y 10 cargados desde otra compu, relee y no frena', sp.queda === 10 && b(w.ctx, 'y500').stock === 10);
    const w2 = armar({ productos: catalogo() });
    let leidas = 0;
    w2.ctx.db = { collection: () => ({ doc: () => ({ get: async () => { leidas++; return { exists: false }; } }) }) };
    await w2.ctx.stockParaVentaFresco(b(w2.ctx, 'y500'), [], 'min', 1);
    t('  si alcanza con el de la pantalla, no lee nada', leidas === 0);
    const p3 = catalogo();
    p3.find(p => p.id === 'nuez').stock = 100;
    const w3 = armar({ productos: p3, ventaItems: [{ id: 'nuez', nombre: 'Nueces', precio: 18000, costo: 9000, cantidad: 100, descuento: 0, tipoVenta: 'peso' }] });
    w3.ctx.db = dbCon({ nuez: 3000 });
    await w3.ctx.updateVentaQty('nuez', '2000');
    t('  cambiar la cantidad de la línea: relee antes de frenar', w3.originales.join() === 'qty:nuez=2000' && w3.avisos.length === 0);
    const p4 = catalogo();
    p4.find(p => p.id === 'y5').stock = 0;
    const w4 = armar({ productos: p4, gramos: 5000 });
    w4.ctx.db = dbCon({ y1: 200, y3: 2300, y5: 10000 });
    const r4 = await w4.ctx.agregarGranelVenta(b(w4.ctx, 'y1'), 'min');
    t('  el granel con escalas también (la bolsa de 5 kg se cargó en otra compu)', r4 === 'hecho' && w4.avisos.length === 0 &&
      w4.ctx.ventaItems.reduce((s, i) => s + i.cantidad, 0) === 5000, renglones(w4.ctx.ventaItems));
    const fr = w.ctx.frenoDeGramos(b(w.ctx, 'nuez'), { hay: 0, ya: 0, queda: 0 }, async () => ({ hay: 3000, ya: 0, queda: 3000 }));
    const n = await fr.refrescar();
    t('el diálogo de gramos recibe cómo releer: el stock nuevo y su aviso', n.stock === 3000 && n.avisoSinStock.indexOf('en total 3 kg de STOCK RESTANTE') > 0);
    t('  el diálogo relee una vez, la primera que frenaría, y mientras dice "Revisando el stock..."',
      dialogo.indexOf("refresco = Promise.resolve().then(() => opts.refrescar())") > 0 && dialogo.indexOf("avi.textContent = 'Revisando el stock...';") > 0 &&
      /let stock = Number\(opts\.stock/.test(dialogo));
  }

  console.log('\n-- revisión del 26/09: lo demás --');
  {
    const w = armar({ ventaItems: [{ id: 'y1', nombre: 'Yerba Mate', precio: 8000, costo: 5000, cantidad: 20000, descuento: 0, tipoVenta: 'peso', escala: '1 kg', escalaId: 'y1' }] });
    await w.ctx.repartirGranelDeVenta('min');
    const cf = w.confirmaciones[0] || { msg: '', op: {} };
    t('un pedido que ni sumando las bolsas alcanza: "Entendido", sin preguntar como si "Sí" se pudiera',
      cf.op.aceptar === 'Entendido' && cf.op.cancelar === null && cf.msg.indexOf('¿Sacás') < 0 &&
      cf.msg.indexOf('[x] Y ni así alcanza: faltan 7,5 kg. Sin stock suficiente la venta NO se va a poder registrar: bajá la cantidad.') > 0, cf.msg);
    const w2 = armar({ ventaItems: [{ id: 'y500', nombre: 'y500', precio: 1000, cantidad: 12, tipoVenta: 'unidad' }] });
    await w2.ctx.avisoStockInsuficiente(w2.ctx.ventaItems, 'min');
    t('al frenar al registrar se repintan las líneas (se ve cuál no alcanza)', w2.pintados.indexOf('min') >= 0);
    t('la calculadora de la bolsa usa enModoTamanos, no su copia', ESC.indexOf('const conTabla = typeof enModoTamanos === \'function\' && enModoTamanos();') > 0);
    t('"el stock se mira" en un solo lugar (stockSeMira), y "frena" en otro (stockFrena)', (ESC.match(/_stockNoAplica/g) || []).length === 0 &&
      (ESC.match(/_escFrena\(|_escMira\(/g) || []).length >= 4 && /const _escMira = ctx => typeof stockSeMira === 'function' && stockSeMira\(ctx\);/.test(ESC) &&
      /const _escFrena = ctx => typeof stockFrena === 'function' && stockFrena\(ctx\);/.test(ESC));
  }

  /* ======================================== LA REVISIÓN DE CÓDIGO DEL 25/09 */
  console.log('\n-- revisión del 25/09: el principal oculto --');
  {
    const prods = catalogo();
    prods.find(p => p.id === 'y1').oculto = true;
    const { ctx } = armar({ productos: prods });
    t('con el principal oculto sus bolsas no son escalas: se venden por separado, como en la tienda',
      ctx.escalasDe(b(ctx, 'y3')).length === 0 && ctx.escalasDe(b(ctx, 'y5')).length === 0);
  }

  console.log('\n-- revisión del 25/09: los renglones de un pedido web --');
  {
    const { ctx } = armar();
    const L = (id, escalaId, extra) => Object.assign({ id, escalaId, cantidad: 1000, precio: 7200 }, extra || {});
    t('escalaDeLinea: la escala del grupo a la que se cobró', (ctx.escalaDeLinea(L('y1', 'y3')) || {}).id === 'y3');
    t('  una de otro grupo, una por unidad, una oculta o cualquier cosa, no', ctx.escalaDeLinea(L('y1', 'nuez')) === null &&
      ctx.escalaDeLinea(L('y1', 'y500')) === null && ctx.escalaDeLinea(L('y1', 'y10')) === null &&
      ctx.escalaDeLinea(L('y1', 'x" onmouseover="alert(1)')) === null && ctx.escalaDeLinea({ id: 'y1' }) === null);
    const items = [L('y3', 'y3', { cantidad: 2300 }), L('y5', 'y3', { cantidad: 700 })];
    t('precio de catálogo de un renglón partido: el de la escala que toca por el total (3 kg, $7.200), no el de su bolsa',
      ctx.precioCatalogoDeLinea(items[0], items) === 7200 && ctx.precioCatalogoDeLinea(items[1], items) === 7200);
    const trampa = [L('y1', 'y5', { cantidad: 500, precio: 6000 })];
    t('  si el cliente dice otra escala (500 g a la de 5 kg), el de catálogo es el de 1 kg: se avisa',
      ctx.precioCatalogoDeLinea(trampa[0], trampa) === 8000);
    t('  sin escala, el de su producto', ctx.precioCatalogoDeLinea({ id: 'nuez', cantidad: 100 }) === 18000 &&
      ctx.precioCatalogoDeLinea({ id: 'y5', cantidad: 100 }) === 6000);
    const txt = ctx.mezclaDePedido([
      { id: 'y3', nombre: '<img src=x onerror=alert(1)>', escala: 'x" onmouseover="y', escalaId: 'y3', cantidad: 2300 },
      { id: 'y5', nombre: 'lo que sea', escalaId: 'y3', cantidad: 700 }]);
    t('el aviso de Mezcla del tablero usa los nombres del catálogo, no lo que manda el cliente', !!txt &&
      txt.indexOf('Yerba Mate: se cobró el precio de la bolsa de 3 kg, pero 700 g salen de la bolsa de 5 kg.') === 0 &&
      txt.indexOf('<img') < 0 && txt.indexOf('onmouseover') < 0, txt);
    t('  y un escalaId que no es del grupo no arma mezcla', ctx.mezclaDePedido([{ id: 'nuez', escalaId: 'y3', cantidad: 100 },
      { id: 'y5', escalaId: 'nuez', cantidad: 100 }]) === null);
    const fakeDoc = { createElement: () => { let s = ''; return { set textContent(v) { s = String(v); },
      get innerHTML() { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); } }; } };
    const escHtml = new Function('document', cuerpo(html, 'esc') + '\nreturn esc;')(fakeDoc);
    t('esc() de admin.html escapa también las comillas: el texto del cliente no cierra un title="..."',
      escHtml('x" onmouseover="alert(1)') === 'x&quot; onmouseover=&quot;alert(1)' && escHtml("it's") === 'it&#39;s' && escHtml('<b>') === '&lt;b&gt;');
    t('  y el cartel de Mezcla del tablero pasa por esc()', html.indexOf('title="\'+esc(_mzPed)+\'"') > 0);
    t('al convertir un pedido, el precio de catálogo sale de precioCatalogoDeLinea y el nombre va escapado',
      html.indexOf('precioCatalogoDeLinea(i,p.items)') > 0 && html.indexOf('map(function(i){return esc(i.nombre);})') > 0);
    t('las ventas guardan de qué escala se cobró cada renglón (al guardar, al editar, en la mayorista y en los pedidos del panel)',
      html.split('...(i.escalaId?{escala:i.escala||null,escalaId:i.escalaId}:{})').length - 1 === 7);
  }

  console.log('\n-- revisión del 25/09: el descuento de la escala no depende del orden --');
  {
    const prods = catalogo();
    prods.find(p => p.id === 'y3').descuento = 10;
    const linea = d => [{ id: 'y1', nombre: 'Yerba Mate', precio: 8000, costo: 5000, cantidad: 500, descuento: d, tipoVenta: 'peso', escala: '1 kg', escalaId: 'y1' }];
    const w = armar({ productos: prods, gramos: 2500, ventaItems: linea(0) });
    await w.ctx.agregarGranelVenta(b(w.ctx, 'y1'), 'min');
    t('500 g y después 2.500 g van a la escala de 3 kg con su oferta del 10%, como cargando 3 kg de una',
      w.ctx.ventaItems.length === 2 && w.ctx.ventaItems.every(i => i.descuento === 10 && i.escalaId === 'y3'), renglones(w.ctx.ventaItems));
    const w2 = armar({ productos: prods, gramos: 2500, ventaItems: linea(15) });
    await w2.ctx.agregarGranelVenta(b(w2.ctx, 'y1'), 'min');
    t('  un descuento puesto a mano en la línea, en cambio, sigue', w2.ctx.ventaItems.every(i => i.descuento === 15));
    const w3 = armar({ productos: prods, ventaItems: linea(0) });
    await w3.ctx.updateVentaQty('y1', 3000);
    t('  y cambiar los gramos en la línea hace lo mismo', w3.ctx.ventaItems.every(i => i.descuento === 10 && i.escalaId === 'y3'));
  }

  console.log('\n-- revisión del 25/09: lo que ya descontó un pedido web --');
  {
    const w = armar();
    w.ctx._pedidoOrigenVentaId = 'ped1';
    w.ctx.pedidosData = [{ docId: 'ped1', stockDescontado: true, items: [{ id: 'y3', cantidad: 1000 }] }];
    const y3 = w.ctx.escalasDe(b(w.ctx, 'y3'))[1];
    t('convirtiendo un pedido que ya descontó stock, lo suyo vuelve a estar disponible (2,3 kg + 1 kg)', w.ctx.disponibleParaVenta('min')(y3) === 3300);
    w.ctx.pedidosData[0].stockDescontado = false;
    t('  si el pedido no descontó, solo el stock', w.ctx.disponibleParaVenta('min')(y3) === 2300);
  }

  console.log('\n-- revisión del 25/09: los pedidos del panel --');
  {
    const w = armar();
    w.ctx.addPedItem('y1');
    w.ctx.updatePedQty('y1', 3500);
    let l = w.ctx.pedItems;
    t('el granel con escalas va en UNA línea, al precio de la escala por el total (3,5 kg: la de 3 kg)',
      l.length === 1 && l[0].id === 'y3' && l[0].precio === 7200 && l[0].cantidad === 3500 && l[0].escalaId === 'y3' && l[0].nombre === 'Yerba Mate');
    w.ctx.addPedItem('nuez');
    w.ctx.addPedItem('y5');
    l = w.ctx.pedItems;
    t('  sumar otra bolsa del mismo producto la junta en esa línea', l.length === 2 && l[0].id === 'y3' && l[0].cantidad === 3501 && l[1].id === 'nuez');
    w.ctx.updatePedQty('y3', 800);
    t('  y bajar los gramos la baja de escala', w.ctx.pedItems[0].id === 'y1' && w.ctx.pedItems[0].precio === 8000);
    w.ctx.removePedItem('y1');
    t('  sacarla la saca', w.ctx.pedItems.length === 1 && w.ctx.pedItems[0].id === 'nuez');
    t('  y la lista se repinta con los precios nuevos', w.pintados.indexOf('ped') >= 0);
  }
  {
    const w = armar({ editingPedidoId: 'p9', pedidosData: [{ docId: 'p9', stockDescontado: true }],
      pedItems: [{ id: 'y3', cantidad: 2300, precio: 7200, escalaId: 'y3' }, { id: 'y5', cantidad: 700, precio: 7200, escalaId: 'y3' }] });
    w.ctx.updatePedQty('y5', 800);
    t('  un pedido web que ya descontó stock no se junta: sus renglones dicen de qué bolsa salió cada gramo', w.ctx.pedItems.length === 2);
  }
  {
    const linea = () => [{ id: 'y3', nombre: 'Yerba Mate', precio: 7000, costo: 4500, cantidad: 3000, descuento: 0, tipoVenta: 'peso', escala: '3 kg', escalaId: 'y3' }];
    const w = armar({ ventaItems: linea() });
    await w.ctx.repartirGranelDeVenta('min');
    t('al pasar a venta un pedido que no descontó stock, el granel se reparte por bolsa al precio del pedido',
      renglones(w.ctx.ventaItems) === 'y3:2300@7000/c4500 y5:700@7000/c3750', renglones(w.ctx.ventaItems));
    const cf = w.confirmaciones[0];
    t('  con el aviso, como en el mostrador, con el precio del pedido ($7.000, no los $7.200 de la lista)',
      w.confirmaciones.length === 1 && cf.op.titulo === 'No alcanza la bolsa de 3 kg' &&
      cf.msg.indexOf('El pedido lleva 3 kg de Yerba Mate a $7.000 el kilo.') === 0 &&
      cf.msg.indexOf('Por eso ganás $525 más: $8.025 en vez de $7.500.') > 0, cf.msg);
    t('  y pregunta de dónde sacar lo que falta: "Sí, sacarlo de la bolsa de 5 kg" / "No, todo de la bolsa de 3 kg"',
      cf.msg.indexOf('¿Sacás lo que falta de la bolsa de 5 kg? Si no, la venta no se va a poder registrar: la bolsa de 3 kg no tiene stock suficiente.') > 0 &&
      cf.op.aceptar === 'Sí, sacarlo de la bolsa de 5 kg' && cf.op.cancelar === 'No, todo de la bolsa de 3 kg');
    {
      /* Lo que se pierde se mide contra el precio del pedido: la bolsa de 5 kg costó $3.750
         y el pedido cobra $3.500 (la lista, $7.200). */
      const wb = armar({ ventaItems: [{ id: 'y3', nombre: 'Yerba Mate', precio: 3500, costo: 4500, cantidad: 3000, descuento: 0, tipoVenta: 'peso', escala: '3 kg', escalaId: 'y3' }] });
      await wb.ctx.repartirGranelDeVenta('min');
      t('  lo que se pierde se mide contra el precio del pedido, no el de la lista (10.350 + 2.625 contra 10.500)',
        wb.confirmaciones[0].msg.indexOf('[x] Ojo: así perdés $2.475. Lo que vendés te costó $12.975 y lo cobrás $10.500.') > 0, wb.confirmaciones[0].msg);
      const escP = wb.ctx.escalasDe(b(wb.ctx, 'y1'));
      const repP = wb.ctx.repartirStock(escP, escP[1], 3000);
      const bajo = wb.ctx.mezclaDe(repP, escP[1], 'min', 0, 3500).bajoCosto;
      t('  y lo vendido por debajo del costo también (700 g × $250)', bajo.length === 1 && bajo[0].escala.id === 'y5' && bajo[0].perdida === 175 &&
        wb.ctx.mezclaDe(repP, escP[1], 'min', 0).bajoCosto.length === 0);
    }
    const w2 = armar({ confirma: false, ventaItems: linea() });
    await w2.ctx.repartirGranelDeVenta('min');
    t('  si no se acepta, queda como vino', renglones(w2.ctx.ventaItems) === 'y3:3000@7000/c4500');
    t('el panel lo llama al convertir un pedido que no descontó stock',
      html.indexOf("if(p.stockDescontado!==true&&typeof repartirGranelDeVenta==='function')await repartirGranelDeVenta('min');") > 0);
  }

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + (e && e.stack || e)); process.exit(1); });
