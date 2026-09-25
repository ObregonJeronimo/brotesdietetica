/**
 * ESCALAS DE GRANEL EN LA TIENDA (variantes, etapa 2).
 *
 * Mismo pedido que t-escalas.js, del lado del cliente: la yerba de 1, 3 y 5 kg es UN
 * producto. Una tarjeta con el precio de la bolsa chica y las otras escalas abajo, un
 * Agregar que pregunta los gramos (y avisa si llevando más paga menos), una línea en el
 * carrito que cambia de escala sola, y un pedido partido por bolsa -todo al precio de la
 * escala que se cobra- para que el servidor descuente de cada una. El cliente ve una
 * línea; el panel ve de qué bolsas sale.
 *
 * Además: los + y - de la tarjeta y de la ficha, en los productos por peso, iban de a UN
 * gramo y mostraban el número pelado. Ahora van de a 100 g y dicen los gramos.
 *
 * Corre las funciones de verdad de app.js con un catálogo y un carrito de mentira.
 */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + extra + ']' : '')); }
};
function cuerpo(n) {
  const i = app.indexOf('function ' + n + '(');
  if (i < 0) throw new Error('no se encontro ' + n);
  let p = 0, k;
  for (k = app.indexOf('{', i); k < app.length; k++) {
    if (app[k] === '{') p++;
    else if (app[k] === '}') { p--; if (!p) break; }
  }
  /* cuerpo() arranca en "function": el async se agrega a mano. */
  return (app.indexOf('async function ' + n + '(') >= 0 ? 'async ' : '') + app.slice(i, k + 1);
}

const FUNCIONES = ['esPesoProd', 'fmtGramos', 'formatPrice', 'sinPrecio', 'precioFinal', 'subtotalCarrito', 'pasoCantidad',
  '_gramosDeTam', '_principalTienda', '_escalasDelGrupoTienda', '_escalasTienda', '_escalaParaTienda', '_nombreGrupoTienda',
  '_stockEscalas', '_cobroEscalaTienda', '_escalasTxt', '_llevandoMasTienda', '_lineaGranel', '_fijarLineaGranel',
  'addGranelToCart', 'cambiarGranelCarrito', '_normalizarGranelCarrito', '_gruposGranelCarrito', '_repartirTienda',
  '_itemsDelPedido', '_itemsParaMostrar', '_estadoCompra', '_qtyCompraHtml', '_btnGranel', 'addToCart',
  'updateCartItemQuantity', 'removeFromCart', 'renderCartItems', 'clearCart'];

const P = (id, extra) => Object.assign({ id, nombre: id, precio: 1000, descuento: 0, stock: 0, tipoVenta: 'peso' }, extra || {});
function catalogo() {
  return [
    P('y1', { nombre: 'Yerba Mate x 1 kg', gramaje: '1 kg', precio: 8000, stock: 200 }),
    P('y3', { nombre: 'Yerba Mate x 3 kg', gramaje: '3 kg', precio: 7200, stock: 2300, gramajePadreId: 'y1' }),
    P('y5', { nombre: 'Yerba Mate x 5 kg', gramaje: '5 kg', precio: 6000, stock: 10000, gramajePadreId: 'y1' }),
    P('y500', { nombre: 'Yerba Mate x 500 g', gramaje: '500 g', tipoVenta: 'unidad', precio: 4160, stock: 10, gramajePadreId: 'y1' }),
    P('nuez', { nombre: 'Nueces', precio: 18000, stock: 3000 }),
    P('chia', { nombre: 'Chía', tipoVenta: 'unidad', precio: 2300, stock: 7 }),
    P('p250', { nombre: 'Café x 250 g', gramaje: '250 g', tipoVenta: 'unidad', precio: 5000, stock: 5 }),
    P('pgr', { nombre: 'Café a granel', gramaje: '1 kg', precio: 16000, stock: 4000, gramajePadreId: 'p250' }),
    P('pgr3', { nombre: 'Café a granel x 3 kg', gramaje: '3 kg', precio: 15000, stock: 0, gramajePadreId: 'p250' }),
  ];
}

function tienda(opts) {
  const o = opts || {};
  const toasts = [], tarjetas = [], guardados = [], pedidos = [];
  const productos = o.productos || catalogo();
  const carrito = o.carrito || [];
  const env = {
    productos, carrito,
    clienteAuth: o.sinLogin ? null : { uid: 'u1' },
    PEDIDOS: { descontarStock: o.descontarStock !== false },
    showToast: (m, tp) => toasts.push((tp || 'info') + ': ' + m),
    saveCart: () => guardados.push(carrito.length),
    updateCartUI: () => {},
    updateProductCard: id => tarjetas.push(id),
    _acusarCarrito: () => {},
    requireLoginToBuy: () => toasts.push('login'),
    esc: s => String(s),
    pedirGramosTienda: async (p, op) => { pedidos.push({ p, op }); return o.gramos === undefined ? null : o.gramos; },
    document: o.document || { getElementById: () => null, createElement: () => ({}) },
    confirm: () => true,
    optImg: s => s,
  };
  const nombres = Object.keys(env);
  const f = new Function(...nombres, FUNCIONES.map(cuerpo).join('\n') +
    '\nreturn {' + FUNCIONES.map(n => n + ':' + n).join(',') + '};');
  const api = f(...nombres.map(n => env[n]));
  return { api, env, toasts, tarjetas, guardados, pedidos, carrito, productos };
}
const b = (w, id) => w.productos.find(p => p.id === id);

(async () => {
  console.log('\n-- las escalas en la tienda --');
  {
    const w = tienda();
    const esc = w.api._escalasDelGrupoTienda(b(w, 'y1'));
    t('las bolsas por peso con tamaño, de menor a mayor', esc.map(e => e.id + '>' + e.desde).join() === 'y1>1000,y3>3000,y5>5000');
    t('  el paquete de 500 g no es escala', !esc.some(e => e.id === 'y500'));
    t('una escala pertenece a su grupo, un paquete no', w.api._escalasTienda(b(w, 'y5')).length === 3 && w.api._escalasTienda(b(w, 'y500')).length === 0);
    t('con el principal paquete, las escalas son sus hijas', w.api._escalasDelGrupoTienda(b(w, 'p250')).map(e => e.id).join() === 'pgr,pgr3');
    t('el nombre del producto sin el tamaño', w.api._nombreGrupoTienda(b(w, 'y1')) === 'Yerba Mate');
    const para = g => w.api._escalaParaTienda(esc, g).id;
    t('700 g y 2,9 kg pagan la de 1 kg; 3 kg y 3,1 kg la de 3 kg; 6 kg la de 5 kg',
      para(700) === 'y1' && para(2900) === 'y1' && para(3000) === 'y3' && para(3100) === 'y3' && para(6000) === 'y5');
    t('la línea de las otras escalas', w.api._escalasTxt(esc) === '3 kg o más: $7.200 · 5 kg o más: $6.000 el kilo');
    const m = w.api._llevandoMasTienda(esc, 2900);
    t('2,9 kg ($23.200) contra 3 kg ($21.600): conviene llevar 3 kg', !!m && m.gramos === 3000 && m.total === 21600 && m.actual === 23200);
    t('2 kg no', w.api._llevandoMasTienda(esc, 2000) === null);
  }

  console.log('\n-- agregar al carrito --');
  {
    const w = tienda({ gramos: 700 });
    await w.api.addGranelToCart('y1');
    const op = w.pedidos[0].op;
    t('pregunta los gramos con los precios de cada escala y el stock de todas',
      op.nombre === 'Yerba Mate' && op.detalle === '$8.000 el kilo · 3 kg o más: $7.200 · 5 kg o más: $6.000 el kilo' && op.stock === 12500);
    const q = op.cotizar(2900);
    t('  el total en vivo, la escala y el aviso de llevar más', q.total === 23200 && q.nota === 'Precio de menos de 3 kg: $8.000 el kilo.' &&
      !!q.mas && q.mas.gramos === 3000 && q.mas.total === 21600 && q.mas.etiqueta === '3 kg');
    t('  pasando de 3 kg, la nota cambia', op.cotizar(3100).nota === 'Precio de 3 kg o más: $7.200 el kilo.');
    t('una sola línea, marcada con el grupo, a la escala que toca', w.carrito.length === 1 && w.carrito[0].grupo === 'y1' &&
      w.carrito[0].id === 'y1' && w.carrito[0].precio === 8000 && w.carrito[0].cantidad === 700 && w.carrito[0].nombre === 'Yerba Mate');
    t('  y repinta la tarjeta del grupo', w.tarjetas.indexOf('y1') >= 0);
  }
  {
    const w = tienda({ gramos: 2500, carrito: [{ id: 'y1', grupo: 'y1', nombre: 'Yerba Mate', tipoVenta: 'peso', precio: 8000, cantidad: 700 }] });
    await w.api.addGranelToCart('y1');
    t('sumar gramos: 700 g + 2,5 kg = 3,2 kg, pasa sola a la escala de 3 kg', w.carrito.length === 1 && w.carrito[0].cantidad === 3200 &&
      w.carrito[0].id === 'y3' && w.carrito[0].precio === 7200 && w.carrito[0].escala === '3 kg');
    const op = w.pedidos[0].op;
    t('  el diálogo dice lo que ya había y el stock que queda', op.detalle.indexOf('ya tenés 700 g en el carrito') > 0 && op.stock === 11800);
    t('  y si cambia la escala, que lo del carrito también cambia de precio', op.cotizar(2500).nota.indexOf('Lo que ya tenías en el carrito pasa a este precio.') > 0 &&
      op.cotizar(100).nota.indexOf('Lo que ya tenías') < 0);
  }
  {
    const w = tienda({ gramos: 500 });
    await w.api.addToCart('y3');
    t('tocar una escala suelta (un botón viejo) compra por el grupo', w.pedidos.length === 1 && w.carrito[0].grupo === 'y1');
    const w2 = tienda({ gramos: 250 });
    await w2.api.addToCart('nuez');
    t('un producto por peso sin escalas sigue como siempre', w2.carrito.length === 1 && w2.carrito[0].id === 'nuez' && !w2.carrito[0].grupo);
  }
  {
    const sinPrecio = catalogo().map(p => (p.id === 'y5' ? Object.assign(p, { precio: 0 }) : p));
    const w = tienda({ productos: sinPrecio, gramos: 700 });
    await w.api.addGranelToCart('y1');
    t('si una escala no tiene precio, no se vende: se consulta', w.carrito.length === 0 && /todavia no tiene precio/.test(w.toasts.join()));
    const sinStock = catalogo().map(p => (['y1', 'y3', 'y5'].indexOf(p.id) >= 0 ? Object.assign(p, { stock: 0 }) : p));
    const w2 = tienda({ productos: sinStock, gramos: 700 });
    await w2.api.addGranelToCart('y1');
    t('sin stock en ninguna bolsa, lo dice y no pregunta', w2.pedidos.length === 0 && /No queda stock de Yerba Mate/.test(w2.toasts.join()));
    const w3 = tienda({ gramos: null });
    await w3.api.addGranelToCart('y1');
    t('cancelar los gramos no agrega nada', w3.carrito.length === 0);
    const w4 = tienda({ sinLogin: true, gramos: 700 });
    await w4.api.addGranelToCart('y1');
    t('sin sesión pide entrar', w4.toasts.join() === 'login' && w4.carrito.length === 0);
  }

  console.log('\n-- el carrito --');
  {
    const w = tienda({ carrito: [{ id: 'y3', grupo: 'y1', nombre: 'Yerba Mate', tipoVenta: 'peso', precio: 7200, cantidad: 3000 }] });
    w.api.cambiarGranelCarrito('y1', -100);
    t('- de a 100 g: 2,9 kg vuelve a la escala de 1 kg', w.carrito[0].cantidad === 2900 && w.carrito[0].id === 'y1' && w.carrito[0].precio === 8000);
    w.api.updateCartItemQuantity('y1', 100);
    t('los + y - del carrito también van por el grupo', w.carrito[0].cantidad === 3000 && w.carrito[0].id === 'y3');
    w.api.cambiarGranelCarrito('y1', 20000);
    t('no pasa del stock de todas las bolsas', w.carrito[0].cantidad === 3000 && /Stock máximo: 12,5 kg/.test(w.toasts.join()));
    w.api.cambiarGranelCarrito('y1', -3000);
    t('llegando a 0 sale del carrito', w.carrito.length === 0);
  }
  {
    const w = tienda({ carrito: [{ id: 'y3', grupo: 'y1', nombre: 'Yerba Mate', tipoVenta: 'peso', precio: 7200, cantidad: 3000 }] });
    w.api.removeFromCart('y3');
    t('sacarlo repinta la tarjeta del grupo (la línea tiene el id de la bolsa)', w.carrito.length === 0 && w.tarjetas.indexOf('y1') >= 0);
  }
  {
    /* Un pedido repetido trae una línea por bolsa, y con el precio viejo. */
    const w = tienda({ carrito: [
      { id: 'chia', nombre: 'Chía', precio: 2300, cantidad: 2, tipoVenta: 'unidad' },
      { id: 'y3', nombre: 'Yerba Mate x 3 kg', tipoVenta: 'peso', precio: 7000, cantidad: 2300 },
      { id: 'y5', nombre: 'Yerba Mate x 5 kg', tipoVenta: 'peso', precio: 7000, cantidad: 700 },
    ] });
    const cambio = w.api._normalizarGranelCarrito();
    t('las líneas de un granel se juntan en una, a la escala que toca', cambio && w.carrito.length === 2 &&
      w.carrito[1].cantidad === 3000 && w.carrito[1].id === 'y3' && w.carrito[1].precio === 7200 && w.carrito[1].grupo === 'y1' && w.carrito[1].nombre === 'Yerba Mate');
    t('  lo demás no se toca', w.carrito[0].id === 'chia' && w.carrito[0].cantidad === 2);
    t('  y si ya estaba bien, no cambia nada', w.api._normalizarGranelCarrito() === false);
  }

  console.log('\n-- el pedido --');
  {
    const w = tienda({ carrito: [
      { id: 'y3', grupo: 'y1', nombre: 'Yerba Mate', tipoVenta: 'peso', precio: 7200, precioOriginal: 7200, descuento: 0, cantidad: 3000, escala: '3 kg' },
      { id: 'chia', nombre: 'Chía', precio: 2300, cantidad: 2, tipoVenta: 'unidad' },
    ] });
    const items = w.api._itemsDelPedido({ y1: 200, y3: 2300, y5: 10000 });
    t('el granel se parte por bolsa: 2,3 kg de la de 3 kg y 700 g de la de 5 kg',
      items.filter(i => i.nombre === 'Yerba Mate').map(i => i.id + ':' + i.cantidad).join() === 'y3:2300,y5:700');
    t('  todo al precio de la escala que se cobra, marcado con ella', items.filter(i => i.nombre === 'Yerba Mate').every(i => i.precio === 7200 && i.escala === '3 kg' && i.escalaId === 'y3'));
    t('  cada renglón con su subtotal, y suman lo del carrito', items[0].subtotal + items[1].subtotal === 21600);
    t('lo que no es granel va como siempre', items[2].id === 'chia' && items[2].subtotal === 4600 && items[2].tipoVenta === 'unidad' && items[2].escalaId === undefined);
    const conStockViejo = w.api._itemsDelPedido(null);
    t('sin la lectura fresca, con el stock que se cargó', conStockViejo.filter(i => i.nombre === 'Yerba Mate').map(i => i.id + ':' + i.cantidad).join() === 'y3:2300,y5:700');
    const sinDescontar = tienda({ descontarStock: false, carrito: w.carrito.slice() }).api._itemsDelPedido(null);
    t('si el comercio no descuenta stock, no se parte', sinDescontar.filter(i => i.nombre === 'Yerba Mate').map(i => i.id + ':' + i.cantidad).join() === 'y3:3000');
    const vacio = w.api._itemsDelPedido({ y1: 0, y3: 0, y5: 1000 });
    t('lo que no alcanza queda en la bolsa que se cobra (el servidor avisa el faltante)',
      vacio.filter(i => i.nombre === 'Yerba Mate').map(i => i.id + ':' + i.cantidad).join() === 'y3:2000,y5:1000');
    const junto = w.api._itemsParaMostrar(items);
    t('al cliente se le muestra junto: Yerba Mate 3 kg', junto.length === 2 && junto[0].cantidad === 3000 && junto[1].id === 'chia');
  }

  console.log('\n-- los botones --');
  {
    const w = tienda({ carrito: [{ id: 'y3', grupo: 'y1', nombre: 'Yerba Mate', tipoVenta: 'peso', precio: 7200, cantidad: 3000 },
      { id: 'nuez', nombre: 'Nueces', tipoVenta: 'peso', precio: 18000, cantidad: 250 }, { id: 'chia', nombre: 'Chía', tipoVenta: 'unidad', precio: 2300, cantidad: 7 }] });
    const e = w.api._estadoCompra(b(w, 'y1'));
    t('la tarjeta del granel: la línea del grupo y el stock de todas las bolsas', e.granel && e.qty === 3000 && e.stock === 12500 && !e.noStock && !e.maxOut);
    const h = w.api._qtyCompraHtml(b(w, 'y1'), 3000, false, true, 'atc', '');
    t('  sus + y - van por el grupo, de a 100 g, y dicen los gramos', h.indexOf("cambiarGranelCarrito('y1',-100)") > 0 && h.indexOf("cambiarGranelCarrito('y1',100)") > 0 && h.indexOf('>3 kg<') > 0);
    const hn = w.api._qtyCompraHtml(b(w, 'nuez'), 250, false, false, 'atc', '');
    t('en un producto por peso: de a 100 g y "250 g" (antes de a 1 gramo y "250")', hn.indexOf("updateCartItemQuantity('nuez',-100)") > 0 && hn.indexOf('>250 g<') > 0);
    const en = w.api._estadoCompra(b(w, 'nuez'));
    t('  el tope cuenta los 100 g del próximo toque', en.maxOut === false && w.api._estadoCompra(Object.assign(b(w, 'nuez'), { stock: 300 })).maxOut === true);
    const hu = w.api._qtyCompraHtml(b(w, 'chia'), 7, true, false, 'atc', '');
    t('en uno por unidad, como siempre: de a 1', hu.indexOf("updateProductQuantity('chia',-1)") > 0 && hu.indexOf('>7<') > 0 && hu.indexOf(' disabled') > 0);
    const hf = w.api._qtyCompraHtml(b(w, 'nuez'), 250, false, false, 'pdm', "refreshProductDetailModal('nuez')");
    t('en la ficha, después de cambiar repinta el botón', hf.indexOf("updateCartItemQuantity('nuez',-100);refreshProductDetailModal('nuez')") > 0);
    t('un paquete con granel en el grupo ofrece "A granel", desde el precio más bajo', w.api._btnGranel(b(w, 'p250'), w.api._escalasDelGrupoTienda(b(w, 'p250')), false)
      .indexOf("addGranelToCart('p250')") > 0);
  }

  console.log('\n-- los ganchos de la tienda --');
  const rp = cuerpo('renderProducts'), upc = cuerpo('updateProductCard'), ficha = cuerpo('openProductDetailModal'), rf = cuerpo('refreshProductDetailModal');
  [['la tarjeta', rp], ['repintar la tarjeta', upc], ['la ficha', ficha], ['repintar la ficha', rf]].forEach(([n, c]) => {
    t(n + ': usa _estadoCompra y los + y - nuevos', c.indexOf('_estadoCompra(p)') > 0 && c.indexOf('_qtyCompraHtml(') > 0 && c.indexOf('updateProductQuantity(') < 0);
    t('  y el granel se agrega por el grupo', c.indexOf("(granel?'addGranelToCart':'addToCart')") > 0);
  });
  t('la tarjeta muestra el precio de la bolsa chica y las otras escalas', rp.indexOf('const pv=granel?escT[0].producto:p;') > 0 && rp.indexOf('_escalasTxt(escT)') > 0);
  t('  y las escalas no aparecen como botones', rp.indexOf('_variantesTienda(p).filter(v=>!escT.some(e=>e.id===v.id))') > 0);
  t('la ficha agrega y DESPUÉS repinta (antes repintaba antes de elegir los gramos)', /\.then\(function\(\)\{refreshProductDetailModal\(/.test(ficha) && /\.then\(function\(\)\{refreshProductDetailModal\(/.test(rf));
  const ck = cuerpo('confirmCheckout');
  t('el checkout lee también las otras bolsas del granel', ck.indexOf('_gruposGranelCarrito()') > 0 && ck.indexOf('ids.concat(_idsGr)') > 0);
  t('  y mide el granel por todas sus bolsas, no por la que se cobra', ck.indexOf("!_gruposGr.some(g=>g.linea.id===ids[k])&&disp<porProd[ids[k]]") > 0);
  t('  los renglones salen de _itemsDelPedido, con el stock recién leído', ck.indexOf('const _itemsPed=_itemsDelPedido(_stockFresco);') > 0 &&
    ck.indexOf('items:_itemsPed,') > 0);
  t('  y con más de 100 renglones (el granel partido) se frena antes de sacar el número',
    ck.indexOf('if(_itemsPed.length>100)') > 0 && ck.indexOf('if(_itemsPed.length>100)') < ck.indexOf('pedidoNum=await db.runTransaction'));
  t('  el aviso de "nos quedamos sin stock" dice gramos en los de peso', ck.indexOf("_faltante.tipoVenta==='peso'?fmtGramos(_faltante.disponible)") > 0);
  t('al cargar el catálogo se acomoda el granel del carrito', cuerpo('loadProductsFromFirebase').indexOf('_normalizarGranelCarrito()') > 0);
  t('repetir un pedido junta el granel', cuerpo('repetirPedido').indexOf('_normalizarGranelCarrito()') > 0);
  t('"Mis pedidos" muestra el granel junto', cuerpo('_renderPedidosCliente').indexOf('_itemsParaMostrar(p.items)') > 0);
  const pg = cuerpo('pedirGramosTienda');
  t('el diálogo de gramos acepta nombre, detalle, stock y cotizar', pg.indexOf('o.detalle?esc(o.detalle)') > 0 && pg.indexOf('o.stock!=null') > 0 && pg.indexOf("typeof o.cotizar==='function'") > 0);
  t('  y le ofrece al cliente llevar más si paga menos', pg.indexOf('pgt-llevar') > 0);
  t('la tienda usa el app.min.js recompilado', fs.readFileSync(path.join(RAIZ, 'app.min.js'), 'utf8').indexOf('addGranelToCart') >= 0);
  t('  y el styles.min.css con las escalas', fs.readFileSync(path.join(RAIZ, 'styles.min.css'), 'utf8').indexOf('.precio-escalas') >= 0);

  /* ======================================== LA REVISIÓN DE CÓDIGO DEL 25/09 */
  console.log('\n-- revisión del 25/09: el carrito --');
  {
    const insertados = [];
    const body = { querySelectorAll: () => [], insertBefore: el => insertados.push(el) };
    const doc = { getElementById: id => (id === 'cartBody' ? body : null), createElement: () => ({}) };
    const w = tienda({ document: doc, carrito: [{ id: 'y3', grupo: 'y1', nombre: 'Yerba Mate', tipoVenta: 'peso', precio: 7200, cantidad: 2300, escala: '3 kg' }] });
    w.api.renderCartItems();
    const h = insertados.length ? insertados[0].innerHTML : '';
    t('con toda la bolsa de 3 kg en el carrito el + sigue andando: queda en las otras bolsas', h.indexOf('bi-plus') > 0 && h.indexOf('disabled') < 0);
    insertados.length = 0;
    tienda({ document: doc, carrito: [{ id: 'nuez', nombre: 'Nueces', tipoVenta: 'peso', precio: 18000, cantidad: 3000 }] }).api.renderCartItems();
    t('  un granel sin escalas con todo su stock en el carrito, sí se apaga', insertados.length === 1 && insertados[0].innerHTML.indexOf('disabled') > 0);
  }
  {
    const w = tienda({ carrito: [{ id: 'y3', grupo: 'y1', nombre: 'Yerba Mate', tipoVenta: 'peso', precio: 7200, cantidad: 3000 },
      { id: 'nuez', nombre: 'Nueces', tipoVenta: 'peso', precio: 18000, cantidad: 500 }] });
    w.api.clearCart();
    t('vaciar el carrito repinta la tarjeta del granel (la del grupo, que es la que se ve) y las demás',
      w.tarjetas.indexOf('y1') >= 0 && w.tarjetas.indexOf('nuez') >= 0);
    t('  y al confirmar el pedido, también', cuerpo('confirmCheckout').indexOf('if(i.grupo&&i.grupo!==i.id)idsAResetear.push(i.grupo);') > 0);
  }

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + (e && e.stack || e)); process.exit(1); });
