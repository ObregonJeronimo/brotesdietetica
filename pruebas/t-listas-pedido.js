/**
 * LISTAS DE PEDIDOS A PROVEEDORES (pedido de Thiago, 08/10/2026).
 *
 * En la ficha de un proveedor, "Lista de pedidos": listas con nombre, de los productos de ESE
 * proveedor y cuánto pedir de cada uno (bolsas, kilos o unidades, según el producto; la
 * cantidad puede quedar vacía, con aviso), guardadas en `listasPedido`, con "Copiar mensaje"
 * y "Mandar mensaje" (por WhatsApp Web o la app, a la persona guardada).
 *
 * Corre de verdad admin-variantes.js, admin-compras.js y admin-listas-pedido.js con un
 * catálogo y un document de mentira, y revisa cómo quedó enganchado.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const VAR = leer('admin-variantes.js');
const COMP = leer('admin-compras.js');
const LP = leer('admin-listas-pedido.js');
const html = leer('admin.html');

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + JSON.stringify(extra).slice(0, 400) + ']' : '')); }
};

const P = (id, extra) => Object.assign({ id, nombre: id, lista: 'L1', stock: 0, tipoVenta: 'unidad', costo: 100 }, extra || {});
function catalogo() {
  return [
    P('gal', { nombre: 'Galletas De Arroz', stock: 12, codigo: 'GAL' }),
    P('alf1', { nombre: 'Alfajor', gramaje: 'x1' }),
    P('alf6', { nombre: 'Alfajor x6', gramaje: 'x6', gramajePadreId: 'alf1' }),
    P('mrc1', { nombre: 'Mani RC', nombreMostrado: 'Mani Recubierto de Chocolate', gramaje: '1 kg', tipoVenta: 'peso', stock: 1500 }),
    P('mrc3', { nombre: 'Mani RC x 3 kg', gramaje: '3 kg', tipoVenta: 'peso', gramajePadreId: 'mrc1' }),
    P('len', { nombre: 'Lenteja x 5 kg', tipoVenta: 'peso', stock: 800, lista: 'L9' }),
    P('alm', { nombre: 'Almendra', tipoVenta: 'peso', bolsaGramos: 5000 }),
    P('chi', { nombre: 'Chia', tipoVenta: 'peso' }),
    P('vie', { nombre: 'Chia Vieja', tipoVenta: 'peso', depurado: true }),
  ];
}

/* Un elemento de mentira, lo justo para la pantalla. */
function elemento(id) {
  const clases = new Set();
  return {
    id, value: '', innerHTML: '', textContent: '', disabled: false, hidden: false, style: {},
    classList: { add: c => clases.add(c), remove: c => clases.delete(c), contains: c => clases.has(c),
      toggle: (c, v) => { if (v === undefined ? !clases.has(c) : v) clases.add(c); else clases.delete(c); } },
    focus() { this.enfocado = (this.enfocado || 0) + 1; }, select() {}, setAttribute() {}, remove() {}, addEventListener() {},
  };
}

function armar(opts) {
  const o = opts || {};
  const els = {};
  const el = id => els[id] || (els[id] = elemento(id));
  const reg = { agregados: [], actualizados: [], borrados: [], avisos: [], historial: [], preguntas: [], abiertos: [], copiado: null, consultas: [] };
  const base = (o.listas || []).map(x => Object.assign({}, x));
  const leerBase = filtro => ({ docs: base.filter(filtro || (() => true)).map(x => ({ id: x.id, data: () => { const d = Object.assign({}, x); delete d.id; return d; } })) });
  let respuestas = o.respuestas || [];
  const ctx = {
    console, Math, Number, String, Object, Array, Set, Map, Promise, JSON, Date, encodeURIComponent, parseInt, isFinite,
    setTimeout: fn => { fn(); return 0; },
    allProducts: o.productos || catalogo(),
    listasData: [{ id: 'L1', nombre: 'FRUTICOR' }, { id: 'L9', nombre: 'LEGUMBRES SA' }],
    esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    _attrHtml: s => String(s).replace(/"/g, '&quot;'),
    esPorPeso: p => !!(p && p.tipoVenta === 'peso'),
    document: {
      getElementById: id => (els[id] !== undefined ? els[id] : el(id)),
      createElement: () => elemento(''),
      body: { appendChild: e => { if (e.id) els[e.id] = e; } },
      querySelector: () => null, querySelectorAll: () => [],
      execCommand: () => false,
    },
    navigator: { clipboard: { writeText: async s => { reg.copiado = s; } } },
    window: null,
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'AHORA' } } },
    db: { collection: col => ({
      get: async () => leerBase(),
      where: (campo, op, valor) => { reg.consultas.push(campo + op + valor); return { get: async () => leerBase(x => x[campo] === valor) }; },
      add: async d => { reg.agregados.push({ col, d }); const id = 'nueva' + reg.agregados.length; base.push(Object.assign({ id }, d)); return { id }; },
      doc: id => ({
        update: async d => { reg.actualizados.push({ col, id, d }); const x = base.find(y => y.id === id); if (x) Object.assign(x, d); },
        delete: async () => { reg.borrados.push({ col, id }); const i = base.findIndex(y => y.id === id); if (i >= 0) base.splice(i, 1); },
      }),
    }) },
    showAdminToast: (m, tp) => reg.avisos.push((tp || '') + ':' + m),
    logAction: (a, b, c) => reg.historial.push(a + ':' + b + ':' + c),
    pedirConfirmacion: async (m, op) => { reg.preguntas.push({ m, op }); return respuestas.length ? respuestas.shift() : true; },
  };
  ctx.window = { location: { href: '' }, open: (u, w) => reg.abiertos.push(u + '|' + w) };
  vm.createContext(ctx);
  vm.runInContext(VAR, ctx);
  if (o.sinCompras !== true) vm.runInContext(COMP, ctx);
  vm.runInContext(LP, ctx);
  return { ctx, els, el, reg, base, responder: r => { respuestas = r; }, ver: expr => vm.runInContext(expr, ctx) };
}

(async () => {
console.log('\n-- cómo se pide cada producto (las reglas de Cargar compra) --');
for (const sinCompras of [false, true]) {
  const { ctx } = armar({ sinCompras });
  const como = id => JSON.stringify(ctx.lpComoSePide(ctx.allProducts.find(p => p.id === id)));
  const suf = sinCompras ? ' (sin admin-compras.js, con su copia)' : '';
  t('uno por unidad: en unidades' + suf, como('gal') === '{"tipo":"unidad"}' && como('alf6') === '{"tipo":"unidad"}', como('alf6'));
  t('  la bolsa de un producto con varias bolsas: en bolsas, con sus gramos' + suf,
    como('mrc1') === '{"tipo":"bolsa","gramos":1000}' && como('mrc3') === '{"tipo":"bolsa","gramos":3000}', como('mrc1') + como('mrc3'));
  t('  uno por peso con la bolsa en el nombre o anotada aparte: en bolsas' + suf,
    como('len') === '{"tipo":"bolsa","gramos":5000}' && como('alm') === '{"tipo":"bolsa","gramos":5000}', como('len') + como('alm'));
  t('  uno por peso sin bolsa conocida: en kilos' + suf, como('chi') === '{"tipo":"kilo"}', como('chi'));
}

console.log('\n-- cuánto se pide, para leer --');
{
  const { ctx } = armar();
  const txt = (id, tipo, cantidad, gramos) => ctx.lpCantidadTxt({ id, tipo, cantidad, gramos });
  t('"3 bolsas" en una bolsa que dice su tamaño en el nombre ("Mani RC x 1 kg")', txt('mrc1', 'bolsa', 3, 1000) === '3 bolsas', txt('mrc1', 'bolsa', 3, 1000));
  t('  "2 bolsas" en "Lenteja x 5 kg" (no repite el tamaño)', txt('len', 'bolsa', 2, 5000) === '2 bolsas');
  t('  "2 bolsas de 5 kg" y "1 bolsa de 5 kg" en "Almendra" (la bolsa está anotada aparte)',
    txt('alm', 'bolsa', 2, 5000) === '2 bolsas de 5 kg' && txt('alm', 'bolsa', 1, 5000) === '1 bolsa de 5 kg', txt('alm', 'bolsa', 2, 5000));
  t('  "2,5 kg" por kilo, con coma', txt('chi', 'kilo', 2.5) === '2,5 kg', txt('chi', 'kilo', 2.5));
  t('  "1 unidad" y "4 unidades"', txt('gal', 'unidad', 1) === '1 unidad' && txt('gal', 'unidad', 4) === '4 unidades');
  t('  sin cantidad: nada', txt('gal', 'unidad', null) === '' && txt('chi', 'kilo', 0) === '');
  t('en qué se pide: "bolsas de 5 kg", "bolsas", "kilos", "unidades"', ctx.lpUnidadTxt({ id: 'alm', tipo: 'bolsa', gramos: 5000 }) === 'bolsas de 5 kg' &&
    ctx.lpUnidadTxt({ id: 'mrc1', tipo: 'bolsa', gramos: 1000 }) === 'bolsas' && ctx.lpUnidadTxt({ id: 'chi', tipo: 'kilo' }) === 'kilos' &&
    ctx.lpUnidadTxt({ id: 'gal', tipo: 'unidad' }) === 'unidades');
  t('el nombre: con su tamaño si tiene otros ("Mani RC x 1 kg"), como en Cargar compra',
    ctx.lpNombreItem({ id: 'mrc1' }) === ctx._cpNombre(ctx.allProducts.find(p => p.id === 'mrc1')) && /x 1 kg/i.test(ctx.lpNombreItem({ id: 'mrc1' })), ctx.lpNombreItem({ id: 'mrc1' }));
  t('  uno que ya no está en el catálogo: con el nombre guardado', ctx.lpNombreItem({ id: 'borrado', nombre: 'Producto Viejo' }) === 'Producto Viejo');
}

console.log('\n-- el mensaje --');
{
  const { ctx } = armar();
  const lista = { nombre: 'Fruticor', contacto: { nombre: 'Juan', whatsapp: '5493515551234', escrito: '351 555 1234' }, items: [
    { id: 'mrc1', tipo: 'bolsa', gramos: 1000, cantidad: 3 },
    { id: 'alm', tipo: 'bolsa', gramos: 5000, cantidad: 2 },
    { id: 'chi', tipo: 'kilo', cantidad: 2.5 },
    { id: 'gal', tipo: 'unidad', cantidad: 4 },
    { id: 'alf6', tipo: 'unidad', cantidad: null },
    { id: 'borrado', nombre: 'Producto Viejo', tipo: 'unidad', cantidad: 1 },
  ] };
  const m = ctx.lpMensaje(lista);
  const n1 = ctx.lpNombreItem({ id: 'mrc1' });
  t('saludo con el nombre, un renglón por producto y "Gracias!"; el que no tiene cantidad va solo con el nombre',
    m === 'Hola Juan! Te paso el pedido:\n\n- ' + n1 + ': 3 bolsas\n- Almendra: 2 bolsas de 5 kg\n- Chia: 2,5 kg\n- Galletas De Arroz: 4 unidades\n' +
      '- Alfajor x6\n- Producto Viejo: 1 unidad\n\nGracias!', m);
  t('sin nadie guardado: "Hola!"', ctx.lpMensaje(Object.assign({}, lista, { contacto: null })).indexOf('Hola! Te paso el pedido:') === 0);
}

console.log('\n-- lo que se escribe --');
{
  const { ctx } = armar();
  const c = ctx.lpLeerCantidad;
  t('kilos con coma o punto: 2,5 y 2.5', c('2,5', 'kilo') === 2.5 && c('2.5', 'kilo') === 2.5 && c(' 3 ', 'kilo') === 3);
  t('  bolsas y unidades, enteras: "3" sí, "2,5" no (0: no sirve)', c('3', 'bolsa') === 3 && c('2,5', 'bolsa') === 0 && c('2', 'unidad') === 2 && c('1.5', 'unidad') === 0);
  t('  vacío: null (sin cantidad); letras: 0 (no sirve)', c('', 'kilo') === null && c('  ', 'unidad') === null && c('abc', 'unidad') === 0 && c('-2', 'unidad') === 0);
  const f = ctx.lpFormatoWhatsapp;
  t('el WhatsApp se acomoda al escribir: "35144" -> "351 44", "3519999999" -> "351 999 9999"',
    f('3') === '3' && f('351') === '351' && f('3514') === '351 4' && f('35144') === '351 44' && f('351999') === '351 999' && f('3519999') === '351 999 9' &&
    f('3519999999') === '351 999 9999', [f('35144'), f('3519999999')]);
  t('  en Buenos Aires: "1123456789" -> "11 2345 6789"', f('1123456789') === '11 2345 6789', f('1123456789'));
  t('  solo números, y no más de 10: letras y espacios afuera', f('35a1 9b99') === '351 999' && f('35199999999999') === '351 999 9999', f('35a1 9b99'));
  t('  sin el 0 ni el 15: "0351...", "351 15 555 1234" (escrito o pegado), "+54 9 351 555 1234" pegado',
    f('03515551234') === '351 555 1234' && f('351155551234') === '351 555 1234' && f('+54 9 351 555 1234') === '351 555 1234' && f('0') === '',
    [f('03515551234'), f('351155551234'), f('+54 9 351 555 1234')]);
  let escrito = '';
  for (const ch of '351155551234') escrito = f(escrito + ch);
  t('  escribiendo de a un número "351 15 555 1234", queda "351 555 1234"', escrito === '351 555 1234', escrito);
  const tecla = (key, extra) => { let frenada = false; const r = ctx.lpTeclaNumero(Object.assign({ key, preventDefault: () => { frenada = true; } }, extra || {})); return r && !frenada; };
  t('  en el campo: números, borrar y moverse sí; letras, espacio y símbolos no', tecla('5') && tecla('Backspace') && tecla('ArrowLeft') && tecla('Tab') &&
    !tecla('a') && !tecla(' ') && !tecla('-') && !tecla('+'));
  t('  Ctrl+V (pegar) sí, y el teclado del celular ("Unidentified") también: lo limpia el formato', tecla('v', { ctrlKey: true }) && tecla('Unidentified') && tecla('x', { keyCode: 229 }));
  const w = ctx.lpNormalizarWhatsapp;
  t('para WhatsApp: "351 555 1234" -> 5493515551234; "11 2345 6789" -> 5491123456789', w('351 555 1234') === '5493515551234' && w('11 2345 6789') === '5491123456789');
  t('  uno que no es un celular: null', w('123') === null && w('') === null && w('351 555') === null);
  const web = ctx.lpLinkWhatsapp('5493515551234', 'Hola Juan!\n- Maní: 2 kg', 'web');
  const app = ctx.lpLinkWhatsapp('5493515551234', 'Hola Juan!\n- Maní: 2 kg', 'app');
  t('el enlace de WhatsApp Web y el de la app, con el mensaje entero',
    web === 'https://web.whatsapp.com/send?phone=5493515551234&text=Hola%20Juan!%0A-%20Man%C3%AD%3A%202%20kg' &&
    app === 'whatsapp://send?phone=5493515551234&text=Hola%20Juan!%0A-%20Man%C3%AD%3A%202%20kg', [web, app]);
}

console.log('\n-- guardar --');
{
  const { ctx } = armar();
  t('sin nombre o sin productos: no se guarda, y dice qué falta', ctx.lpValidar({ nombre: ' ', items: [] }) === 'Ponele un nombre a la lista.' &&
    ctx.lpValidar({ nombre: 'X', items: [] }) === 'Agregá al menos un producto.');
  t('  sin cantidad sí se puede (se avisa aparte)', ctx.lpValidar({ nombre: 'X', items: [{ id: 'gal', tipo: 'unidad', cantidad: null }] }) === '');
  t('  una cantidad escrita que no sirve, no: "Revisá la cantidad de…"',
    ctx.lpValidar({ nombre: 'X', items: [{ id: 'mrc1', tipo: 'bolsa', cantidad: 0, _txt: '2,5' }] }) === 'Revisá la cantidad de ' + ctx.lpNombreItem({ id: 'mrc1' }) + ': un número entero, por ejemplo 2.' &&
    ctx.lpValidar({ nombre: 'X', items: [{ id: 'chi', tipo: 'kilo', cantidad: 0, _txt: 'abc' }] }) === 'Revisá la cantidad de Chia: en kilos, por ejemplo 2,5.');
  const uno = ctx.lpAvisoSinCantidad([{ id: 'gal', tipo: 'unidad', cantidad: null }]);
  t('el aviso con uno: el producto, en qué se pide y qué pasa', uno === 'Galletas De Arroz no tiene cantidad (se pide en unidades).\n\n' +
    'Si guardás así, en el mensaje va a ir sin cantidad: el proveedor va a ver solo el nombre.\n\n¿Guardar igual?', uno);
  const dos = ctx.lpAvisoSinCantidad([{ id: 'gal', tipo: 'unidad' }, { id: 'alm', tipo: 'bolsa', gramos: 5000 }]);
  t('  con varios, la lista', dos.indexOf('Estos productos no tienen cantidad:\n- Galletas De Arroz (se pide en unidades)\n- Almendra (se pide en bolsas de 5 kg)') === 0 &&
    dos.indexOf('van a ir sin cantidad') > 0, dos);
  const d = ctx.lpDatosParaGuardar({ nombre: '  Pedido lunes  ', items: [
    { id: 'mrc1', tipo: 'bolsa', gramos: 1000, cantidad: 3, _txt: '3' }, { id: 'chi', tipo: 'kilo', gramos: 999, cantidad: null }] });
  t('lo que se guarda: el nombre sin espacios, cada producto con su nombre, en qué se pide y cuánto (vacío: null)',
    d.nombre === 'Pedido lunes' && d.items.length === 2 && d.items[0].nombre === ctx.lpNombreItem({ id: 'mrc1' }) && d.items[0].gramos === 1000 &&
    d.items[0].cantidad === 3 && d.items[0]._txt === undefined && d.items[1].gramos === null && d.items[1].cantidad === null && d.actualizadaEn === 'AHORA', d);
}

console.log('\n-- la pantalla: armar una lista para un proveedor --');
{
  const w = armar({ listas: [{ id: 'X9', proveedorId: 'L9', nombre: 'De otro proveedor', items: [] }] });
  await w.ctx.abrirListasPedido();
  t('sin proveedor no abre nada (el botón está en la ficha de cada uno)', !w.els.listasPedidoModal || !w.els.listasPedidoModal.classList.contains('show'));
  await w.ctx.abrirListasPedido('L1');
  t('con FRUTICOR: "Lista de pedidos para el proveedor FRUTICOR", y solo sus listas',
    w.els.lpTitulo.innerHTML.indexOf('Lista de pedidos para el proveedor FRUTICOR') > 0 && w.reg.consultas.join() === 'proveedorId==L1' &&
    w.els.lpCuerpo.innerHTML.indexOf('De otro proveedor') < 0 && w.els.lpCuerpo.innerHTML.indexOf('Todavía no hay listas para este proveedor') > 0, w.els.lpTitulo.innerHTML);
  w.ctx.lpNuevaLista();
  t('"Nueva lista para el proveedor FRUTICOR": el nombre, sus productos y "Guardar lista"', w.els.lpTitulo.innerHTML.indexOf('Nueva lista para el proveedor FRUTICOR') > 0 &&
    w.els.lpCuerpo.innerHTML.indexOf('Productos de FRUTICOR') > 0 && w.els.lpCuerpo.innerHTML.indexOf('Guardar lista') > 0);
  const r0 = w.els.lpResultados.innerHTML;
  t('sin buscar: todos los productos de FRUTICOR, y ninguno de otro proveedor (ni los depurados)',
    ['gal', 'alf1', 'alf6', 'mrc1', 'mrc3', 'alm', 'chi'].every(id => r0.indexOf("lpAgregar('" + id + "')") > 0) && r0.indexOf("'len'") < 0 && r0.indexOf("'vie'") < 0, r0);
  w.ctx.lpBuscar('mani');
  const r = w.els.lpResultados.innerHTML;
  t('buscando "mani": las dos bolsas juntas, con el stock y cómo se piden', r.indexOf('<div class="cp-grupo">') >= 0 &&
    r.indexOf("lpAgregar('mrc1')") > 0 && r.indexOf("lpAgregar('mrc3')") > 0 && r.indexOf('Stock: 1,5 kg · se pide por bolsa') > 0 && r.indexOf("'gal'") < 0, r);
  w.ctx.lpBuscar('lenteja');
  t('  uno de otro proveedor no sale aunque se lo busque', w.els.lpResultados.innerHTML.indexOf("'len'") < 0 &&
    w.els.lpResultados.innerHTML.indexOf('Ningún producto de este proveedor coincide') > 0);
  w.ctx.lpBuscar('almendra');
  t('  la bolsa anotada aparte dice de cuánto: "se pide por bolsa de 5 kg"', w.els.lpResultados.innerHTML.indexOf('se pide por bolsa de 5 kg') > 0);
  w.ctx.lpAgregar('mrc1'); w.ctx.lpAgregar('alm'); w.ctx.lpAgregar('chi'); w.ctx.lpAgregar('gal'); w.ctx.lpAgregar('gal');
  const it = w.ver('_lpEdit').items;
  t('agregar: cada uno con cómo se pide y SIN cantidad (vacío, no 0 ni 1), sin repetirse',
    it.map(i => i.id + ':' + i.tipo + ':' + i.cantidad).join() === 'mrc1:bolsa:null,alm:bolsa:null,chi:kilo:null,gal:unidad:null' && it[1].gramos === 5000, it);
  t('  en la lista, los campos vacíos (ni un guion de muestra) y cada uno con su unidad', (w.els.lpItems.innerHTML.match(/value=""/g) || []).length === 4 &&
    w.els.lpItems.innerHTML.indexOf('placeholder') < 0 &&
    w.els.lpItems.innerHTML.indexOf('>bolsas de 5 kg</span>') > 0 && w.els.lpItems.innerHTML.indexOf('>kilos</span>') > 0 && w.els.lpItems.innerHTML.indexOf('>unidades</span>') > 0);
  w.ctx.lpCantidad(0, '3'); w.ctx.lpCantidad(2, '2,5'); w.ctx.lpCantidad(3, 'x');
  t('las cantidades se leen al escribir, y una mal queda marcada', it[0].cantidad === 3 && it[2].cantidad === 2.5 && it[3].cantidad === 0 &&
    w.els.lpCant3.classList.contains('lp-mal') && it[1].cantidad === null);
  w.ctx.lpNombreCambio('Pedido lunes');
  await w.ctx.lpGuardarLista();
  t('  con una cantidad mal no se guarda, y dice cuál', w.reg.agregados.length === 0 && w.reg.avisos.join().indexOf('Revisá la cantidad de Galletas De Arroz') > 0);
  w.ctx.lpCantidad(3, '');
  w.responder([false]);
  await w.ctx.lpGuardarLista();
  const q = w.reg.preguntas[0] || { m: '', op: {} };
  t('con productos sin cantidad, pregunta antes de guardar', w.reg.agregados.length === 0 && q.op.titulo === 'Productos sin cantidad' &&
    q.op.aceptar === 'Guardar igual' && q.op.cancelar === 'Completar cantidades' && q.m.indexOf('- Almendra (se pide en bolsas de 5 kg)\n- Galletas De Arroz (se pide en unidades)') > 0, q);
  t('  "Completar cantidades": no se guarda y el foco va al primero vacío', w.reg.agregados.length === 0 && w.els.lpCant1.enfocado >= 1);
  w.responder([true]);
  await w.ctx.lpGuardarLista();
  const g = w.reg.agregados[0];
  t('"Guardar igual": se guarda con su proveedor, los vacíos sin cantidad, y sin contacto todavía',
    g && g.col === 'listasPedido' && g.d.proveedorId === 'L1' && g.d.nombre === 'Pedido lunes' && g.d.items.map(i => i.cantidad).join() === '3,,2.5,' &&
    g.d.contacto === null && g.d.creadaEn === 'AHORA', g);
  t('  queda en el historial (con el proveedor) y vuelve a las listas', w.reg.historial.join().indexOf('crear:Lista de pedidos creada: Pedido lunes:FRUTICOR · 4 productos') === 0 &&
    w.els.lpCuerpo.innerHTML.indexOf('Pedido lunes') > 0 && w.ver('_lpEdit') === null, w.reg.historial);
  t('  en la tarjeta, los que no tienen cantidad dicen "sin cantidad"', (w.els.lpCuerpo.innerHTML.match(/<em class="lp-sin">sin cantidad<\/em>/g) || []).length === 2);
}

console.log('\n-- la pantalla: copiar y mandar --');
{
  const lista = { id: 'L-1', proveedorId: 'L1', nombre: 'Pedido lunes', contacto: null, actualizadaEn: '2026-10-08T10:00:00',
    items: [{ id: 'mrc1', tipo: 'bolsa', gramos: 1000, cantidad: 3 }, { id: 'chi', tipo: 'kilo', cantidad: null }] };
  const w = armar({ listas: [lista] });
  await w.ctx.abrirListasPedido('L1');
  const tj = w.els.lpCuerpo.innerHTML;
  t('cada lista: lo que tiene, "Copiar mensaje" y "Mandar mensaje"', tj.indexOf('Pedido lunes') > 0 && tj.indexOf('2 productos · actualizada el 08/10') > 0 &&
    tj.indexOf("lpCopiarMensaje('L-1')") > 0 && tj.indexOf("lpMandarMensaje('L-1')") > 0 && tj.indexOf('El mensaje se enviará a') < 0, tj);
  await w.ctx.lpCopiarMensaje('L-1');
  t('"Copiar mensaje" copia el mensaje entero (el sin cantidad, solo con el nombre)', w.reg.copiado === w.ctx.lpMensaje(w.ver('_lpListas')[0]) &&
    w.reg.copiado.indexOf('\n- Chia\n') > 0 && w.reg.avisos.join().indexOf('Mensaje copiado') > 0, w.reg.copiado);
  w.ctx.lpMandarMensaje('L-1');
  const cm = w.els.lpContactoModal.innerHTML;
  t('"Mandar mensaje" sin nadie guardado: "Primero tenés que guardar el número de WhatsApp de la persona y el nombre"',
    w.els.lpContactoModal.classList.contains('show') && cm.indexOf('Primero tenés que guardar el número de WhatsApp de la persona y el nombre.') > 0);
  t('  el campo del número: solo números (frena letras y espacios) y se acomoda al escribir', cm.indexOf('onkeydown="return lpTeclaNumero(event)"') > 0 &&
    cm.indexOf('oninput="lpFormatearNumero(this)"') > 0 && cm.indexOf('inputmode="numeric"') > 0 && cm.indexOf('maxlength="12"') < 0);
  const num = w.el('lpContNum');
  num.value = '3515551'; w.ctx.lpFormatearNumero(num);
  t('  escribiendo "3515551" queda "351 555 1"', num.value === '351 555 1', num.value);
  const camp = { value: '3514', selectionStart: 4, setSelectionRange(a, b) { this.sel = [a, b]; } };
  w.ctx.lpFormatearNumero(camp);
  t('  escribiendo al final, el cursor sigue al final', camp.value === '351 4' && camp.sel.join() === '5,5', camp);
  Object.assign(camp, { value: '351 99 9999', selectionStart: 4, sel: null });
  w.ctx.lpFormatearNumero(camp);
  t('  borrando uno del medio, el cursor queda ahí (no salta al final)', camp.value === '351 999 999' && camp.sel.join() === '3,3', camp);
  Object.assign(camp, { value: '3515 999 999', selectionStart: 4, sel: null });
  w.ctx.lpFormatearNumero(camp);
  t('  y el que se escribe en su lugar queda en el medio', camp.value === '351 599 9999' && camp.sel.join() === '5,5', camp);
  w.el('lpContNombre').value = 'Juan';
  await w.ctx.lpGuardarContacto('L-1');
  t('  con menos de 10 números no se guarda', w.reg.actualizados.length === 0 && w.reg.avisos.join().indexOf('son 10 números con la característica') > 0);
  num.value = '0351 15 555-1234';
  await w.ctx.lpGuardarContacto('L-1');
  const a = w.reg.actualizados[0];
  t('  bien: se guarda en la lista, con el número para WhatsApp y acomodado', a && a.id === 'L-1' && a.d.contacto.nombre === 'Juan' &&
    a.d.contacto.whatsapp === '5493515551234' && a.d.contacto.escrito === '351 555 1234', a);
  t('  y al lado de "Mandar mensaje": "El mensaje se enviará a: Juan (351 555 1234)"',
    w.els.lpCuerpo.innerHTML.indexOf('El mensaje se enviará a: <b>Juan</b> (351 555 1234)') > 0 && !w.els.lpContactoModal.classList.contains('show'));
  w.ctx.lpCambiarContacto('L-1');
  t('"Cambiar" abre lo guardado, con el número acomodado', w.els.lpContactoModal.innerHTML.indexOf('value="351 555 1234"') > 0 &&
    w.els.lpContactoModal.innerHTML.indexOf('Primero tenés que guardar') < 0);
  w.ctx.lpCerrarContacto();
  w.ctx.lpMandarMensaje('L-1');
  t('"Mandar mensaje" con la persona guardada: WhatsApp Web o la app de escritorio', w.els.lpMandarModal.classList.contains('show') &&
    w.els.lpMandarModal.innerHTML.indexOf("lpAbrirWhatsapp('L-1','web')") > 0 && w.els.lpMandarModal.innerHTML.indexOf("lpAbrirWhatsapp('L-1','app')") > 0);
  w.ctx.lpAbrirWhatsapp('L-1', 'web');
  const msg = w.ctx.lpMensaje(w.ver('_lpListas')[0]);
  t('  WhatsApp Web: en otra pestaña, con el mensaje para Juan', w.reg.abiertos[0] === w.ctx.lpLinkWhatsapp('5493515551234', msg, 'web') + '|_blank' &&
    msg.indexOf('Hola Juan!') === 0, w.reg.abiertos);
  w.ctx.lpAbrirWhatsapp('L-1', 'app');
  t('  la app: con su enlace whatsapp://', w.ctx.window.location.href === w.ctx.lpLinkWhatsapp('5493515551234', msg, 'app'));
  w.ctx.lpEditarLista('L-1');
  w.ctx.lpCantidad(1, '2');
  await w.ctx.lpGuardarLista();
  const e = w.reg.actualizados[w.reg.actualizados.length - 1];
  t('editarla (completando la cantidad que faltaba) guarda sin preguntar y no toca a quién se le manda',
    e.id === 'L-1' && e.d.items[1].cantidad === 2 && e.d.contacto === undefined && e.d.proveedorId === undefined && w.base[0].contacto.nombre === 'Juan' &&
    w.reg.preguntas.length === 0, e);
  await w.ctx.lpEliminarLista('L-1');
  t('eliminarla pregunta antes (en rojo) y la borra', w.reg.preguntas.some(p => p.op.peligro === true && p.m.indexOf('"Pedido lunes"') > 0) &&
    w.reg.borrados[0].id === 'L-1' && w.els.lpCuerpo.innerHTML.indexOf('Todavía no hay listas para este proveedor') > 0);
}

console.log('\n-- enganchado en el panel --');
{
  const prov = leer('admin-proveedores.js');
  const cab = prov.slice(prov.indexOf('function renderProveedores('), prov.indexOf('function _provRenderDetalle('));
  const det = prov.slice(prov.indexOf('function _provRenderDetalle('));
  t('el botón "Lista de pedidos" está en la ficha del proveedor (con su id), no arriba de todo',
    det.indexOf("abrirListasPedido(\\'' + esc(lista.id) + '\\')\"><i class=\"bi bi-clipboard-check\"></i> Lista de pedidos</button>") > 0 &&
    cab.indexOf('abrirListasPedido') < 0);
  t('admin.html carga el módulo y tiene sus tres ventanas, al final', html.indexOf('<script src="admin-listas-pedido.js"></script>') > 0 &&
    html.indexOf('<div class="modal-overlay" id="listasPedidoModal"></div>') > html.indexOf('id="compraModal"') &&
    html.indexOf('id="lpContactoModal"') > html.indexOf('id="listasPedidoModal"') && html.indexOf('id="lpMandarModal"') > html.indexOf('id="listasPedidoModal"'));
  t('la base: listasPedido, solo para admins', /match \/listasPedido\/\{doc\} \{\s*allow read, write: if isAdmin\(\);\s*\}/.test(leer('firestore.rules')));
  t('check-admin revisa sus clases', leer('check-admin.js').indexOf("'admin-listas-pedido.js'") > 0);
}

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
