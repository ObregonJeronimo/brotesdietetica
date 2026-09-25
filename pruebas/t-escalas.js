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
  const pintados = [], preguntas = [], confirmaciones = [], gramosPedidos = [], originales = [];
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
    /* Los manejadores de la lista de la venta, como en admin.html: los envuelve admin-escalas.js. */
    updateVentaQty: (id, v) => originales.push('qty:' + id + '=' + v),
    updateVentaMayQty: (id, v) => originales.push('mayqty:' + id + '=' + v),
    removeVentaItem: id => originales.push('quitar:' + id),
    removeVentaMayItem: id => originales.push('mayquitar:' + id),
    setVentaItemDsc: (id, v) => originales.push('dsc:' + id + '=' + v),
    setVentaMayItemDsc: (id, v) => originales.push('maydsc:' + id + '=' + v),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  /* La cuenta de verdad de admin.html. */
  vm.runInContext(['esPorPeso', 'precioConDsc', 'subtotalItem'].map(n => cuerpo(html, n)).join('\n'), ctx);
  vm.runInContext(VAR, ctx);
  vm.runInContext(ESC, ctx);
  return { ctx, porId, pintados, preguntas, confirmaciones, gramosPedidos, originales };
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
    t('el aviso dice las dos cuentas y la diferencia',
      msg.indexOf('2,9 kg a precio de la escala de 1 kg ($8.000 el kilo) salen $23.200') >= 0 &&
      msg.indexOf('Llevando 3 kg') >= 0 && msg.indexOf('paga $21.600: $1.600 menos') >= 0);
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

    const msg = ctx.mensajeMezcla(rep, esc[0], mz, 700, 'min', null, 200);
    t('el aviso: cuánto, a qué precio, de qué bolsas y la diferencia',
      msg.indexOf('Yerba Mate: 700 g a precio de la escala de 1 kg ($8.000 el kilo).') === 0 &&
      msg.indexOf('De la bolsa de 1 kg quedan 200 g') > 0 &&
      msg.indexOf('• 200 g de la bolsa de 1 kg (costo $5.000 el kilo)') > 0 &&
      msg.indexOf('• 500 g de la bolsa de 3 kg (costo $4.500 el kilo)') > 0 &&
      msg.indexOf('A favor: ganás $250 más que si todo saliera de la bolsa de 1 kg.') > 0);
    t('  en contra lo dice así', ctx.mensajeMezcla(rep2, esc[2], mz2, 11000, 'min', null, 10000).indexOf('En contra: ganás $750 menos') > 0);
    const repFalta = ctx.repartirStock(esc, esc[0], 20000);
    const msgFalta = ctx.mensajeMezcla(repFalta, esc[0], ctx.mezclaDe(repFalta, esc[0], 'min'), 20000, 'min', null, 200);
    t('  y si ni sumando alcanza, cuánto falta', msgFalta.indexOf('faltan 7,5 kg, que quedan en negativo en la de 1 kg') > 0);
    t('  sin stock en la bolsa que se cobra, lo dice', ctx.mensajeMezcla(ctx.repartirStock(esc, esc[0], 700, e => (e.id === 'y1' ? 0 : 5000)), esc[0], mz, 700, 'min', null, 0)
      .indexOf('De la bolsa de 1 kg no queda stock') > 0);
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
    t('  avisó la mezcla antes', w.confirmaciones.length === 1 && w.confirmaciones[0].op.titulo === 'Mezcla de stock');
    const op = w.gramosPedidos[0].op;
    t('el diálogo de gramos muestra el precio de cada escala y el stock de todas',
      op.nombre === 'Yerba Mate' && op.detalle === '1 kg: $8.000 · desde 3 kg: $7.200 · desde 5 kg: $6.000 el kilo' && op.stock === 12500);
    const q = op.cotizar(3100);
    t('  y el total en vivo con la escala que va a tocar', q.total === 22320 && q.nota === 'Escala de 3 kg: $7.200 el kilo.');
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
    t('2,9 kg pregunta, con las dos cuentas en los botones', !!pq && pq.op.opciones.map(x => x.texto).join(' / ') === 'Cobrar 2,9 kg ($23.200) / Cambiar a 3 kg ($21.600)' &&
      pq.op.opciones[0].principal === true);
    t('  "Cobrar 2,9 kg": queda al precio de la regla', w.ctx.ventaItems.reduce((s, i) => s + i.cantidad, 0) === 2900 && w.ctx.ventaItems.every(i => i.precio === 8000));
  }
  {
    const w = armar({ gramos: 2900, opcion: 'mas' });
    await w.ctx.agregarGranelVenta(b(w.ctx, 'y1'), 'min');
    t('"Cambiar a 3 kg": 3 kg a $7.200, de la bolsa de 3 kg y la de 5 kg', renglones(w.ctx.ventaItems) === 'y3:2300@7200/c4500 y5:700@7200/c3750');
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
    t('  y de qué bolsas sale', v[1].__detalle === 'Escala de 1 kg · sale 200 g de la bolsa de 1 kg y 501 g de la bolsa de 3 kg');
    t('  los renglones de verdad no se tocan', items.length === 3 && items[2].cantidad === 501);
    const sinEscalas = [items[0]];
    t('una venta sin escalas se dibuja como siempre (la misma lista, sin copiarla)', w.ctx.vistaItemsVenta(sinEscalas) === sinEscalas);
    const cargada = [{ id: 'y3', nombre: 'Yerba Mate', precio: 7200, costo: 4500, cantidad: 2300, tipoVenta: 'peso' },
      { id: 'y5', nombre: 'Yerba Mate', precio: 7200, costo: 3750, cantidad: 700, tipoVenta: 'peso' }];
    const vc = w.ctx.vistaItemsVenta(cargada);
    t('una venta guardada (sin la marca de la escala) se junta igual y deduce la escala', vc.length === 1 && vc[0].id === 'y3' &&
      vc[0].__detalle === 'Escala de 3 kg · sale 2,3 kg de la bolsa de 3 kg y 700 g de la bolsa de 5 kg');
    const una = w.ctx.vistaItemsVenta([{ id: 'y1', nombre: 'Yerba Mate', precio: 8000, cantidad: 300, tipoVenta: 'peso', escalaId: 'y1' }]);
    t('con un solo renglón de su bolsa, solo la escala', una[0].__detalle === 'Escala de 1 kg');
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
  {
    const w = armar();
    const cont = w.porId.pCostoBolsa;
    const nota = { textContent: '' }, tam = { textContent: '' };
    const inp = w.porId.pCostoBolsaInput = { id: 'pCostoBolsaInput', value: '', handlers: {},
      addEventListener(tp, fn) { this.handlers[tp] = fn; } };
    /* innerHTML de mentira: al "dibujarse" quedan los hijos. */
    Object.defineProperty(cont, 'innerHTML', { set(v) { this._h = v; this.hijos = v ? { input: inp, '.cb-nota': nota, '.cb-tam': tam } : {}; }, get() { return this._h || ''; } });
    w.porId.pGramaje.value = '3 kg';
    w.porId.pCosto.value = '4500';
    w.ctx.pintarCostoBolsa();
    t('en un producto por peso de 3 kg aparece', cont.hidden === false && tam.textContent === '3 kg');
    t('  con lo que sale la bolsa según el costo por kilo', nota.textContent === 'Con $4.500 el kilo, la bolsa de 3 kg sale $13.500.');
    inp.value = '13.500';
    w.ctx.costoBolsaEscrito(inp);
    t('escribir lo que costó la bolsa carga el costo por kilo', w.porId.pCosto.value === '4500' && w.pintados.indexOf('calc') >= 0);
    t('  y lo dice', nota.textContent === '= $4.500 el kilo. Queda cargado arriba, en el costo.');
    inp.value = '2600';
    w.porId.pGramaje.value = '3 kg';
    w.ctx.costoBolsaEscrito(inp);
    t('  redondeado al peso: $2.600 la bolsa de 3 kg son $867 el kilo', w.porId.pCosto.value === '867');
    w.ctx._tipoVentaProd = 'unidad';
    w.ctx.pintarCostoBolsa();
    t('en uno por unidad no aparece', cont.hidden === true);
    w.ctx._tipoVentaProd = 'peso';
    w.porId.pGramaje.value = '';
    w.ctx.pintarCostoBolsa();
    t('  ni en uno por peso sin tamaño', cont.hidden === true);
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

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + (e && e.stack || e)); process.exit(1); });
