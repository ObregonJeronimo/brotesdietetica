/**
 * LOS MODALES CON LA GRILLA DE VENTA TIENEN SUS DOS COLUMNAS.
 *
 * Reportado por el comercio (14/09) con una captura: "esta toda rota la interfaz" del
 * pedido. El modal de pedido usaba la grilla de dos columnas de la venta
 * (.venta-modal-body, desde df1bfb5) pero con sus siete bloques sueltos, y la grilla
 * los repartia en zigzag -cliente contra entrega, buscador contra su lista, items
 * contra insumos- dentro de una caja de 720px. Los rotulos se partian en cuatro
 * renglones y el medio de pago no se leia. Venta y mayorista si tenian sus columnas,
 * y por eso nadie lo vio.
 *
 * LO QUE ESTA PRUEBA CUIDA, en los tres modales que usan esa grilla:
 * 1. Que adentro de .venta-modal-body haya dos .venta-col y el .venta-pie, nada suelto.
 * 2. Que la caja sea la ancha (.venta-modal-box).
 * Y en el de pedido, que sigan todos los id que usa el codigo.
 */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + extra + ']' : '')); }
};

/* Los hijos directos de la etiqueta que empieza en `desde`, siguiendo la profundidad.
   Alcanza para estos modales: se sacan antes los comentarios, y adentro no hay scripts. */
const VACIAS = new Set(['input', 'br', 'img', 'hr', 'meta', 'link', 'source', 'wbr']);
function hijosDirectos(texto, desde) {
  const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g;
  re.lastIndex = desde;
  const hijos = [];
  let prof = 0, m;
  while ((m = re.exec(texto))) {
    const cierra = m[1] === '/', tag = m[2].toLowerCase(), clase = (m[3].match(/class="([^"]*)"/) || [])[1] || '';
    if (VACIAS.has(tag)) { if (prof === 1) hijos.push(tag + '.' + clase); continue; }
    if (cierra) { prof--; if (prof === 0) break; continue; }
    if (prof === 1) hijos.push(tag + '.' + clase);
    prof++;
  }
  return hijos;
}

const limpio = html.replace(/<!--[\s\S]*?-->/g, '');
console.log('\n-- los modales con la grilla de venta --');
['ventaModal', 'ventaMayModal', 'pedidoModal'].forEach(id => {
  const i = limpio.indexOf('id="' + id + '"');
  if (i < 0) { t(id + ' existe', false); return; }
  const cajaI = limpio.indexOf('<div class="modal-box', i);
  const caja = limpio.slice(cajaI, limpio.indexOf('>', cajaI) + 1);
  const cuerpoI = limpio.indexOf('<div class="venta-modal-body"', i);
  const hijos = hijosDirectos(limpio, cuerpoI).join(' | ');
  t(id + ': la caja es la ancha', /class="modal-box venta-modal-box"/.test(caja), caja);
  t(id + ': en la grilla, dos columnas y el pie', hijos === 'div.venta-col | div.venta-col | div.venta-pie', hijos);
});

console.log('\n-- el de pedido conserva lo que usa el codigo --');
['pedidoModalTitle', 'pedClienteAuthInfo', 'pedClienteWebWrap', 'pedClienteNombreWeb', 'pedCliente', 'pedClienteId',
 'pedClienteSelectList', 'pedMedio', 'pedFecha', 'pedProdSearch', 'pedProdList', 'pedItems', 'pedTotalBreakdown', 'pedTotal',
 'pedInsumoSelect', 'pedInsumosList', 'convertirVentaBtn', 'savePedidoBtn']
  .forEach(x => t('#' + x + ', una vez', (html.match(new RegExp('id="' + x + '"', 'g')) || []).length === 1));
t('el buscador de clientes sigue adentro de .cliente-select-wrap: lo buscan openPedidoModal y el clic afuera',
  /<div class="cliente-select-wrap">\s*<input type="text" class="form-input" id="pedCliente"/.test(html));
/* Se cuentan en el modal: el codigo tambien los nombra en selectores, y esos no son botones. */
const bloquePedido = html.slice(html.indexOf('id="pedidoModal"'), html.indexOf('<!-- MODAL CREAR/EDITAR LISTA -->'));
t('los dos botones de entrega, con data-ped-entrega',
  (bloquePedido.match(/<button[^>]*data-ped-entrega="(envio|retiro)"/g) || []).length === 2);
t('los botones del pie pueden bajar de renglon: el de pedido tiene tres y en celular ensanchaban la caja',
  /\.venta-pie \.form-actions\{flex-wrap:wrap\}/.test(html));

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
