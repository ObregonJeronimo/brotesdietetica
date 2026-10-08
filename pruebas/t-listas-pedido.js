/**
 * LISTAS DE PEDIDOS A PROVEEDORES (pedido de Thiago, 08/10/2026).
 *
 * En Proveedores, "Lista de pedidos": listas con nombre, de productos y cuánto pedir de cada
 * uno (bolsas, kilos o unidades, según el producto), guardadas en `listasPedido`, con
 * "Copiar mensaje" y "Mandar mensaje" (por WhatsApp Web o la app, a la persona guardada).
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
  const reg = { agregados: [], actualizados: [], borrados: [], avisos: [], historial: [], preguntas: [], abiertos: [], copiado: null };
  const base = (o.listas || []).map(x => Object.assign({}, x));
  const ctx = {
    console, Math, Number, String, Object, Array, Set, Map, Promise, JSON, Date, encodeURIComponent, parseInt, isFinite,
    setTimeout: fn => { fn(); return 0; },
    allProducts: o.productos || catalogo(),
    listasData: [{ id: 'L1', nombre: 'FRUTICOR' }, { id: 'L9', nombre: 'LEGUMBRES SA' }],
    esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    _attrHtml: s => String(s).replace(/"/g, '&quot;'),
    esPorPeso: p => !!(p && p.tipoVenta === 'peso'),
    document: {
      getElementById: id => (els[id] !== undefined ? els[id] : (o.sinElementos ? null : el(id))),
      createElement: () => elemento(''),
      body: { appendChild: e => { if (e.id) els[e.id] = e; } },
      querySelector: () => null, querySelectorAll: () => [],
      execCommand: () => false,
    },
    navigator: { clipboard: { writeText: async s => { reg.copiado = s; } } },
    window: null,
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'AHORA' } } },
    db: { collection: col => ({
      get: async () => ({ docs: base.map(x => ({ id: x.id, data: () => { const d = Object.assign({}, x); delete d.id; return d; } })) }),
      add: async d => { reg.agregados.push({ col, d }); const id = 'nueva' + reg.agregados.length; base.push(Object.assign({ id }, d)); return { id }; },
      doc: id => ({
        update: async d => { reg.actualizados.push({ col, id, d }); const x = base.find(y => y.id === id); if (x) Object.assign(x, d); },
        delete: async () => { reg.borrados.push({ col, id }); const i = base.findIndex(y => y.id === id); if (i >= 0) base.splice(i, 1); },
      }),
    }) },
    showAdminToast: (m, tp) => reg.avisos.push((tp || '') + ':' + m),
    logAction: (a, b) => reg.historial.push(a + ':' + b),
    pedirConfirmacion: async (m, op) => { reg.preguntas.push({ m, op }); return o.responde !== false; },
  };
  ctx.window = { location: { href: '' }, open: (u, w) => reg.abiertos.push(u + '|' + w) };
  vm.createContext(ctx);
  vm.runInContext(VAR, ctx);
  if (o.sinCompras !== true) vm.runInContext(COMP, ctx);
  vm.runInContext(LP, ctx);
  return { ctx, els, el, reg, base };
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
    { id: 'alf6', tipo: 'unidad', cantidad: 0 },
    { id: 'borrado', nombre: 'Producto Viejo', tipo: 'unidad', cantidad: 1 },
  ] };
  const m = ctx.lpMensaje(lista);
  const n1 = ctx.lpNombreItem({ id: 'mrc1' });
  t('saludo con el nombre, un renglón por producto y "Gracias!"', m === 'Hola Juan! Te paso el pedido:\n\n- ' + n1 + ': 3 bolsas\n- Almendra: 2 bolsas de 5 kg\n' +
    '- Chia: 2,5 kg\n- Galletas De Arroz: 4 unidades\n- Producto Viejo: 1 unidad\n\nGracias!', m);
  t('  los que no tienen cantidad no van', m.indexOf('Alfajor') < 0);
  t('sin nadie guardado: "Hola!"', ctx.lpMensaje(Object.assign({}, lista, { contacto: null })).indexOf('Hola! Te paso el pedido:') === 0);
}

console.log('\n-- lo que se escribe --');
{
  const { ctx } = armar();
  const c = ctx.lpLeerCantidad;
  t('kilos con coma o punto: 2,5 y 2.5', c('2,5', 'kilo') === 2.5 && c('2.5', 'kilo') === 2.5 && c(' 3 ', 'kilo') === 3);
  t('  bolsas y unidades, enteras: "3" sí, "2,5" no', c('3', 'bolsa') === 3 && c('2,5', 'bolsa') === 0 && c('2', 'unidad') === 2 && c('1.5', 'unidad') === 0);
  t('  vacío o letras: 0', c('', 'kilo') === 0 && c('abc', 'unidad') === 0 && c('-2', 'unidad') === 0);
  const w = ctx.lpNormalizarWhatsapp;
  t('WhatsApp: "351 555 1234" -> 5493515551234', w('351 555 1234') === '5493515551234', w('351 555 1234'));
  t('  sin el 0 ni el 15: "0351 15 555-1234", "11 15 2345-6789", "2944 15 123456"',
    w('0351 15 555-1234') === '5493515551234' && w('11 15 2345-6789') === '5491123456789' && w('2944 15 123456') === '5492944123456',
    [w('0351 15 555-1234'), w('11 15 2345-6789'), w('2944 15 123456')]);
  t('  con el código del país: "+54 9 351 555 1234", "+54 11 2345 6789", "5491123456789"',
    w('+54 9 351 555 1234') === '5493515551234' && w('+54 11 2345 6789') === '5491123456789' && w('5491123456789') === '5491123456789',
    [w('+54 9 351 555 1234'), w('+54 11 2345 6789')]);
  t('  de otro país, con +: queda como está', w('+34 600 123 456') === '34600123456', w('+34 600 123 456'));
  t('  uno que no es un celular: null', w('123') === null && w('') === null && w('hola') === null && w('351 555') === null);
  const web = ctx.lpLinkWhatsapp('5493515551234', 'Hola Juan!\n- Maní: 2 kg', 'web');
  const app = ctx.lpLinkWhatsapp('5493515551234', 'Hola Juan!\n- Maní: 2 kg', 'app');
  t('el enlace de WhatsApp Web y el de la app, con el mensaje entero',
    web === 'https://web.whatsapp.com/send?phone=5493515551234&text=Hola%20Juan!%0A-%20Man%C3%AD%3A%202%20kg' &&
    app === 'whatsapp://send?phone=5493515551234&text=Hola%20Juan!%0A-%20Man%C3%AD%3A%202%20kg', [web, app]);
}

console.log('\n-- guardar --');
{
  const { ctx } = armar();
  t('sin nombre, sin productos o sin cantidad: no se guarda, y dice qué falta',
    ctx.lpValidar({ nombre: ' ', items: [] }) === 'Ponele un nombre a la lista.' &&
    ctx.lpValidar({ nombre: 'X', items: [] }) === 'Agregá al menos un producto.' &&
    ctx.lpValidar({ nombre: 'X', items: [{ id: 'gal', tipo: 'unidad', cantidad: 0 }, { id: 'chi', tipo: 'kilo', cantidad: 0 }] }) ===
      'Falta la cantidad de Galletas De Arroz y de 1 más.' &&
    ctx.lpValidar({ nombre: 'X', items: [{ id: 'gal', tipo: 'unidad', cantidad: 2 }] }) === '');
  const d = ctx.lpDatosParaGuardar({ nombre: '  Fruticor  ', items: [
    { id: 'mrc1', tipo: 'bolsa', gramos: 1000, cantidad: 3 }, { id: 'chi', tipo: 'kilo', gramos: 999, cantidad: 2.5 }] });
  t('lo que se guarda: el nombre sin espacios, cada producto con su nombre, en qué se pide y cuánto',
    d.nombre === 'Fruticor' && d.items.length === 2 && d.items[0].nombre === ctx.lpNombreItem({ id: 'mrc1' }) && d.items[0].gramos === 1000 &&
    d.items[1].gramos === null && d.items[1].cantidad === 2.5 && d.actualizadaEn === 'AHORA' && d.contacto === undefined, d);
}

console.log('\n-- la pantalla: armar una lista --');
{
  const w = armar();
  await w.ctx.abrirListasPedido();
  t('sin listas: "Todavía no hay listas" y "Nueva lista"', w.els.lpCuerpo.innerHTML.indexOf('Todavía no hay listas') > 0 &&
    w.els.lpCuerpo.innerHTML.indexOf('onclick="lpNuevaLista()"') > 0 && w.els.listasPedidoModal.classList.contains('show'));
  w.ctx.lpNuevaLista();
  t('"Nueva lista": el nombre, el buscador y "Guardar lista"', w.els.lpCuerpo.innerHTML.indexOf('id="lpNombre"') > 0 &&
    w.els.lpCuerpo.innerHTML.indexOf('id="lpBuscar"') > 0 && w.els.lpCuerpo.innerHTML.indexOf('Guardar lista') > 0);
  w.ctx.lpBuscar('mani');
  const r = w.els.lpResultados.innerHTML;
  t('buscando "mani": las dos bolsas juntas, con el proveedor, el stock y cómo se piden',
    r.indexOf('<div class="cp-grupo">') >= 0 && r.indexOf("lpAgregar('mrc1')") > 0 && r.indexOf("lpAgregar('mrc3')") > 0 &&
    r.indexOf('FRUTICOR · Stock: 1,5 kg · se pide por bolsa') > 0, r);
  w.ctx.lpBuscar('chia');
  t('  los depurados no salen', w.els.lpResultados.innerHTML.indexOf("lpAgregar('chi')") > 0 && w.els.lpResultados.innerHTML.indexOf("'vie'") < 0);
  w.ctx.lpBuscar('lenteja');
  t('  cada uno con su proveedor: "LEGUMBRES SA · Stock: 800 g · se pide por bolsa"', w.els.lpResultados.innerHTML.indexOf('LEGUMBRES SA · Stock: 800 g · se pide por bolsa') > 0,
    w.els.lpResultados.innerHTML);
  w.ctx.lpBuscar('almendra');
  t('  la bolsa anotada aparte dice de cuánto: "se pide por bolsa de 5 kg"', w.els.lpResultados.innerHTML.indexOf('se pide por bolsa de 5 kg') > 0);
  w.ctx.lpAgregar('mrc1'); w.ctx.lpAgregar('alm'); w.ctx.lpAgregar('chi'); w.ctx.lpAgregar('gal'); w.ctx.lpAgregar('gal');
  const it = vm.runInContext('_lpEdit', w.ctx).items;
  t('agregar: cada uno con cómo se pide y en 1 (no se repite)', it.map(i => i.id + ':' + i.tipo + ':' + i.cantidad).join() ===
    'mrc1:bolsa:1,alm:bolsa:1,chi:kilo:1,gal:unidad:1' && it[1].gramos === 5000, it);
  t('  en la lista, cada uno con su unidad: bolsas, "bolsas de 5 kg", kg, unidades', w.els.lpItems.innerHTML.indexOf('>bolsas</span>') > 0 &&
    w.els.lpItems.innerHTML.indexOf('>bolsas de 5 kg</span>') > 0 && w.els.lpItems.innerHTML.indexOf('>kg</span>') > 0 && w.els.lpItems.innerHTML.indexOf('>unidades</span>') > 0);
  w.ctx.lpBuscar('almendra');
  t('  y el que ya está no sale más en el buscador', w.els.lpResultados.innerHTML.indexOf("lpAgregar('alm')") < 0);
  w.ctx.lpCantidad(0, '3'); w.ctx.lpCantidad(1, '2'); w.ctx.lpCantidad(2, '2,5'); w.ctx.lpCantidad(3, 'x');
  t('las cantidades se leen al escribir (y una mal queda marcada)', it[0].cantidad === 3 && it[2].cantidad === 2.5 && it[3].cantidad === 0 &&
    w.els.lpCant3.classList.contains('lp-mal'));
  await w.ctx.lpGuardarLista();
  t('  sin nombre no se guarda', w.reg.agregados.length === 0 && w.reg.avisos.join().indexOf('Ponele un nombre a la lista.') > 0);
  w.ctx.lpNombreCambio('Fruticor lunes');
  await w.ctx.lpGuardarLista();
  t('  con una cantidad mal tampoco, y dice cuál', w.reg.agregados.length === 0 && w.reg.avisos.join().indexOf('Falta la cantidad de Galletas De Arroz') > 0);
  w.ctx.lpQuitar(3);
  await w.ctx.lpGuardarLista();
  const g = w.reg.agregados[0];
  t('guardar: una lista nueva en listasPedido, con su fecha y sin contacto todavía',
    g && g.col === 'listasPedido' && g.d.nombre === 'Fruticor lunes' && g.d.items.length === 3 && g.d.contacto === null &&
    g.d.creadaEn === 'AHORA' && g.d.actualizadaEn === 'AHORA', g);
  t('  queda en el historial y vuelve a las listas', w.reg.historial.join().indexOf('crear:Lista de pedidos creada: Fruticor lunes') === 0 &&
    w.els.lpCuerpo.innerHTML.indexOf('Fruticor lunes') > 0 && vm.runInContext('_lpEdit', w.ctx) === null);
}

console.log('\n-- la pantalla: copiar y mandar --');
{
  const lista = { id: 'L-1', nombre: 'Fruticor', contacto: null, actualizadaEn: '2026-10-08T10:00:00',
    items: [{ id: 'mrc1', tipo: 'bolsa', gramos: 1000, cantidad: 3 }, { id: 'chi', tipo: 'kilo', cantidad: 2.5 }] };
  const w = armar({ listas: [lista] });
  await w.ctx.abrirListasPedido();
  const tj = w.els.lpCuerpo.innerHTML;
  t('cada lista: lo que tiene, "Copiar mensaje" y "Mandar mensaje"', tj.indexOf('Fruticor') > 0 && tj.indexOf('2 productos · actualizada el 08/10') > 0 &&
    tj.indexOf("lpCopiarMensaje('L-1')") > 0 && tj.indexOf("lpMandarMensaje('L-1')") > 0 && tj.indexOf('El mensaje se enviará a') < 0, tj);
  await w.ctx.lpCopiarMensaje('L-1');
  t('"Copiar mensaje" copia el mensaje entero', w.reg.copiado === w.ctx.lpMensaje(vm.runInContext('_lpListas', w.ctx)[0]) && w.reg.avisos.join().indexOf('Mensaje copiado') > 0);
  w.ctx.lpMandarMensaje('L-1');
  t('"Mandar mensaje" sin nadie guardado: "Primero tenés que guardar el número de WhatsApp de la persona y el nombre"',
    w.els.lpContactoModal.classList.contains('show') &&
    w.els.lpContactoModal.innerHTML.indexOf('Primero tenés que guardar el número de WhatsApp de la persona y el nombre.') > 0);
  w.el('lpContNombre').value = 'Juan'; w.el('lpContNum').value = '351 55';
  await w.ctx.lpGuardarContacto('L-1');
  t('  un número que no sirve no se guarda', w.reg.actualizados.length === 0 && w.reg.avisos.join().indexOf('Revisá el número') > 0);
  w.el('lpContNum').value = '0351 15 555-1234';
  await w.ctx.lpGuardarContacto('L-1');
  const a = w.reg.actualizados[0];
  t('  bien: se guarda en la lista, con el número para WhatsApp y como se escribió',
    a && a.id === 'L-1' && a.d.contacto.nombre === 'Juan' && a.d.contacto.whatsapp === '5493515551234' && a.d.contacto.escrito === '0351 15 555-1234', a);
  t('  y al lado de "Mandar mensaje": "El mensaje se enviará a: Juan (0351 15 555-1234)"',
    w.els.lpCuerpo.innerHTML.indexOf('El mensaje se enviará a: <b>Juan</b> (0351 15 555-1234)') > 0 && !w.els.lpContactoModal.classList.contains('show'));
  w.ctx.lpMandarMensaje('L-1');
  t('"Mandar mensaje" con la persona guardada: WhatsApp Web o la app de escritorio', w.els.lpMandarModal.classList.contains('show') &&
    w.els.lpMandarModal.innerHTML.indexOf("lpAbrirWhatsapp('L-1','web')") > 0 && w.els.lpMandarModal.innerHTML.indexOf("lpAbrirWhatsapp('L-1','app')") > 0);
  w.ctx.lpAbrirWhatsapp('L-1', 'web');
  const msg = w.ctx.lpMensaje(vm.runInContext('_lpListas', w.ctx)[0]);
  t('  WhatsApp Web: en otra pestaña, con el mensaje para Juan', w.reg.abiertos[0] === w.ctx.lpLinkWhatsapp('5493515551234', msg, 'web') + '|_blank' &&
    msg.indexOf('Hola Juan!') === 0, w.reg.abiertos);
  w.ctx.lpAbrirWhatsapp('L-1', 'app');
  t('  la app: con su enlace whatsapp://', w.ctx.window.location.href === w.ctx.lpLinkWhatsapp('5493515551234', msg, 'app'));
  w.ctx.lpEditarLista('L-1');
  w.ctx.lpCantidad(0, '5');
  await w.ctx.lpGuardarLista();
  const e = w.reg.actualizados[w.reg.actualizados.length - 1];
  t('editarla guarda los productos y no toca a quién se le manda', e.id === 'L-1' && e.d.items[0].cantidad === 5 && e.d.contacto === undefined &&
    w.base[0].contacto.nombre === 'Juan', e);
  await w.ctx.lpEliminarLista('L-1');
  t('eliminarla pregunta antes (en rojo) y la borra', w.reg.preguntas.some(p => p.op.peligro === true && p.m.indexOf('"Fruticor"') > 0) &&
    w.reg.borrados[0].id === 'L-1' && w.els.lpCuerpo.innerHTML.indexOf('Todavía no hay listas') > 0);
}

console.log('\n-- enganchado en el panel --');
{
  const prov = leer('admin-proveedores.js');
  t('en Proveedores, el botón "Lista de pedidos"', prov.indexOf("onclick=\"if(typeof abrirListasPedido===\\'function\\')abrirListasPedido()\"><i class=\"bi bi-clipboard-check\"></i> Lista de pedidos</button>") > 0);
  t('admin.html carga el módulo y tiene sus tres ventanas, al final', html.indexOf('<script src="admin-listas-pedido.js"></script>') > 0 &&
    html.indexOf('<div class="modal-overlay" id="listasPedidoModal"></div>') > html.indexOf('id="compraModal"') &&
    html.indexOf('id="lpContactoModal"') > html.indexOf('id="listasPedidoModal"') && html.indexOf('id="lpMandarModal"') > html.indexOf('id="listasPedidoModal"'));
  t('la base: listasPedido, solo para admins', /match \/listasPedido\/\{doc\} \{\s*allow read, write: if isAdmin\(\);\s*\}/.test(leer('firestore.rules')));
  t('check-admin revisa sus clases', leer('check-admin.js').indexOf("'admin-listas-pedido.js'") > 0);
}

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
