/**
 * EL MINIMO DE COMPRA ES SOLO PARA EL ENVIO (16/11/2026).
 *
 * Pedido de la clienta: "envio con un limite a 30 mil, pero retiro sin minimo de compra".
 * Antes el minimo (config/pedidos.minimoPedido) valia para todo: el boton Confirmar del carrito
 * no dejaba seguir debajo de $30.000, tambien para retirar. Ahora:
 *   - el carrito deja confirmar con cualquier monto;
 *   - al confirmar el pedido, si no llega al minimo, "Envio a domicilio" queda apagado, se elige
 *     "Retiro en local" y se dice cuanto falta;
 *   - sin envios (haceEnvios:false, como hoy en produccion) no hay minimo;
 *   - se mide sobre el subtotal de los productos, antes del cupon (como lo media el carrito).
 *
 * Corre las funciones REALES de app.js con un DOM de mentira.
 */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + JSON.stringify(extra).slice(0, 300) + ']' : '')); }
};

function cuerpo(nombre) {
  let i = src.indexOf('function ' + nombre + '(');
  if (i < 0) throw new Error('no encontre ' + nombre);
  if (src.slice(Math.max(0, i - 6), i) === 'async ') i -= 6;
  let prof = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (!prof) break; }
  }
  return src.slice(i, k + 1);
}
function objeto(nombre) {
  const i = src.indexOf('const ' + nombre + ' = {');
  let prof = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (!prof) break; }
  }
  return src.slice(i, k + 1) + ';';
}
const FUNCIONES = ['_num', 'costoEnvio', 'faltaParaEnvio', 'setCheckoutEntrega', 'updateCheckoutResumen',
  'updateShippingBar', '_renderMarcadoresEnvio', 'esPesoProd', 'subtotalCarrito', 'esc', 'fmtGramos', 'formatPrice']
  .map(cuerpo).join('\n');

/* Nueces 300 g a $18.000 el kilo = $5.400; Chía x2 a $2.300 = $4.600. Total $10.000. */
const NUEZ = { id: 'nuez', nombre: 'Nueces mariposa', precio: 18000, cantidad: 300, tipoVenta: 'peso' };
const chia = n => ({ id: 'chia', nombre: 'Semillas Chía', precio: 2300, cantidad: n, tipoVenta: 'unidad' });

function armar(config, carrito) {
  const DOM = {};
  const elem = id => (DOM[id] = DOM[id] || {
    _id: id, value: '', innerHTML: '', textContent: '', className: '', dataset: {},
    style: { display: '' },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    _attrs: {},
    getAttribute(a) { return this._attrs[a] === undefined ? null : this._attrs[a]; },
    setAttribute(a, v) { this._attrs[a] = String(v); },
    removeAttribute(a) { delete this._attrs[a]; },
  });
  /* Los dos botones de "¿Cómo querés recibir tu pedido?". */
  const boton = tipo => ({ disabled: false, activo: false, getAttribute: a => (a === 'data-tipo' ? tipo : null),
    classList: { toggle(c, v) { if (c === 'active') this._b.activo = !!v; } } });
  const bEnvio = boton('envio'), bRetiro = boton('retiro');
  bEnvio.classList._b = bEnvio; bRetiro.classList._b = bRetiro;
  const ventana = {};
  const ent = {
    window: ventana,
    document: {
      getElementById: elem,
      querySelector: () => null,
      querySelectorAll: sel => (sel === '.chk-entrega-btn' ? [bEnvio, bRetiro] : []),
      createElement: () => {
        const o = { _t: '' };
        Object.defineProperty(o, 'textContent', { get: () => o._t, set: v => { o._t = v; } });
        Object.defineProperty(o, 'innerHTML', { get: () => String(o._t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'), set: v => { o._t = v; } });
        return o;
      },
    },
  };
  const nombres = Object.keys(ent);
  const api = new Function(...nombres,
    'let carrito=' + JSON.stringify(carrito) + ',_cuponAplicado=null;\n' + objeto('PEDIDOS') + '\n' +
    'Object.assign(PEDIDOS,' + JSON.stringify(config) + ');\n' + FUNCIONES +
    '\nreturn {falta:faltaParaEnvio,setEntrega:setCheckoutEntrega,resumen:updateCheckoutResumen,barra:updateShippingBar,' +
    'subtotal:function(){return carrito.reduce((s,i)=>s+subtotalCarrito(i),0);}};'
  )(...nombres.map(n => ent[n]));
  return { api, DOM, ventana, bEnvio, bRetiro };
}

/* Produccion hoy, con los envios prendidos (lo que va a hacer la clienta). */
const CON_ENVIOS = { haceEnvios: true, minimoPedido: 30000, envioPrecio: 2000, envioGratisActivo: false, envioGratisDesde: 100000 };
const SIN_ENVIOS = Object.assign({}, CON_ENVIOS, { haceEnvios: false });

console.log('\n-- con envíos, $10.000 en el carrito (no llega a $30.000) --');
{
  const a = armar(CON_ENVIOS, [NUEZ, chia(2)]);
  t('el subtotal da $10.000 (300 g de nueces $5.400 + 2 chía $4.600)', a.api.subtotal() === 10000);
  t('faltan $20.000 para el envío', a.api.falta(a.api.subtotal()) === 20000);
  a.api.setEntrega('envio');
  t('elegir envío deja retiro', a.ventana._chkTipoEntrega === 'retiro' && a.bRetiro.activo && !a.bEnvio.activo);
  t('  el botón de envío queda apagado', a.bEnvio.disabled === true && a.bRetiro.disabled === false);
  t('  y dice cuánto falta', a.DOM.chkEnvioMinimo.style.display === '' &&
    a.DOM.chkEnvioMinimo.textContent === 'El envío a domicilio es para compras desde $30.000 (te faltan $20.000). Retirando en el local no hay mínimo.',
    a.DOM.chkEnvioMinimo.textContent);
  t('el resumen: retiro sin cargo y TOTAL $10.000', /Retiro en local/.test(a.DOM.chkResumen.innerHTML) &&
    /TOTAL<\/span><span>\$10\.000/.test(a.DOM.chkResumen.innerHTML));
  a.api.barra(10000);
  t('la barrita del carrito avisa del mínimo del envío, sin frenar', a.DOM.shippingMsg.textContent ===
    'Envío a domicilio desde $30.000: faltan $20.000. Retirando en el local no hay mínimo.' && /near-free/.test(a.DOM.shippingMsg.className),
    a.DOM.shippingMsg.textContent);
}

console.log('\n-- con envíos, $33.000 en el carrito --');
{
  const a = armar(CON_ENVIOS, [NUEZ, chia(12)]);
  t('el subtotal da $33.000 (nueces $5.400 + 12 chía $27.600)', a.api.subtotal() === 33000);
  a.api.setEntrega('envio');
  t('se puede elegir envío', a.ventana._chkTipoEntrega === 'envio' && a.bEnvio.activo && a.bEnvio.disabled === false);
  t('  sin el aviso', a.DOM.chkEnvioMinimo.style.display === 'none');
  t('  el resumen cobra el envío: $33.000 + $2.000 = TOTAL $35.000', /Envío<\/span><span>\$2\.000/.test(a.DOM.chkResumen.innerHTML) &&
    /TOTAL<\/span><span>\$35\.000/.test(a.DOM.chkResumen.innerHTML));
  a.api.setEntrega('retiro');
  t('  y retiro también: TOTAL $33.000', a.ventana._chkTipoEntrega === 'retiro' && /TOTAL<\/span><span>\$33\.000/.test(a.DOM.chkResumen.innerHTML));
  a.api.barra(33000);
  t('la barrita dice que ya puede pedir con envío', a.DOM.shippingMsg.textContent === 'Ya podés pedir con envío a domicilio');
}

console.log('\n-- justo en el mínimo, y con envío gratis --');
{
  const justo = armar(CON_ENVIOS, [chia(13), { id: 'x', nombre: 'X', precio: 100, cantidad: 1, tipoVenta: 'unidad' }]);
  t('con $30.000 justos se puede elegir envío', justo.api.subtotal() === 30000 && justo.api.falta(30000) === 0);
  justo.api.setEntrega('envio');
  t('  y se elige', justo.ventana._chkTipoEntrega === 'envio');
  const g = armar(Object.assign({}, CON_ENVIOS, { envioGratisActivo: true }), [NUEZ, chia(45)]);
  g.api.setEntrega('envio');
  t('con envío gratis desde $100.000 y $108.900: envío GRATIS, TOTAL $108.900', g.api.subtotal() === 108900 &&
    /GRATIS/.test(g.DOM.chkResumen.innerHTML) && /TOTAL<\/span><span>\$108\.900/.test(g.DOM.chkResumen.innerHTML));
}

console.log('\n-- sin envíos (como hoy en producción) --');
{
  const a = armar(SIN_ENVIOS, [NUEZ, chia(2)]);
  t('no hay mínimo', a.api.falta(10000) === 0 && a.api.falta(1) === 0);
  a.api.setEntrega('envio');
  t('solo retiro, sin el aviso del mínimo', a.ventana._chkTipoEntrega === 'retiro' && a.DOM.chkEnvioMinimo.style.display === 'none');
  a.api.barra(10000);
  t('la barrita no aparece (sin mínimo y sin envío gratis)', a.DOM.shippingProgress.style.display === 'none');
}
{
  const a = armar(Object.assign({}, CON_ENVIOS, { minimoPedido: 0 }), [NUEZ, chia(2)]);
  a.api.setEntrega('envio');
  t('con envíos y mínimo 0: envío con cualquier monto', a.ventana._chkTipoEntrega === 'envio' && a.bEnvio.disabled === false);
}

console.log('\n-- en el código --');
{
  const ui = cuerpo('updateCartUI');
  t('el botón Confirmar del carrito ya no frena por el mínimo', /ckBtn\.disabled=carrito\.length===0;/.test(ui) && !/minimoPedido/.test(ui));
  t('al abrir la confirmación arranca en envío solo si alcanza', /setCheckoutEntrega\(PEDIDOS\.haceEnvios&&!faltaParaEnvio\(/.test(cuerpo('openCheckoutModal')));
  t('al confirmar, un envío sin el mínimo no sale (por las dudas)', /if\(tipoEntrega==='envio'&&faltaParaEnvio\(/.test(cuerpo('confirmCheckout')));
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  t('index.html tiene el lugar del aviso', /<p class="chk-envio-minimo" id="chkEnvioMinimo" style="display:none"><\/p>/.test(html));
  const min = fs.readFileSync(path.join(RAIZ, 'app.min.js'), 'utf8');
  t('app.min.js está recompilado', /faltaParaEnvio|te faltan \$/.test(min) && !/Mínimo \$/.test(min));
  t('styles.min.css está recompilado', /chk-envio-minimo/.test(fs.readFileSync(path.join(RAIZ, 'styles.min.css'), 'utf8')));
  const panel = fs.readFileSync(path.join(RAIZ, 'admin.html'), 'utf8');
  t('en el panel, el mínimo dice que es para envío', /Monto m&iacute;nimo para env&iacute;o/.test(panel) && /Si el cliente retira en el local, no hay m&iacute;nimo/.test(panel));
}

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
