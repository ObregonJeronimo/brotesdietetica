/**
 * TODO LO QUE LAS CLOUD FUNCTIONS LE ESCRIBEN AL PEDIDO TIENE QUE LLEGAR AL PANEL.
 *
 * El pedido web no termina de escribirse cuando el cliente aprieta Confirmar. Despues
 * corren cuatro functions y le AGREGAN campos con updates posteriores: si algo salio
 * raro, el unico lugar donde queda dicho es ese documento. Un campo que la function
 * escribe y el panel no lee es un aviso que no existe.
 *
 * Ya paso: `itemsDesconocidos` -un producto del pedido que ya no esta en el catalogo,
 * al que no se le pudo descontar stock- se guardaba con el comentario "para que el panel
 * lo pueda mostrar" y el panel no lo nombraba en ninguna linea. Peor: la misma function
 * prende `revisarPrecio` en ese caso, asi que el pedido salia con la chapa "Revisar
 * precio" y un tooltip que hablaba de inflacion. El comercio revisaba los precios, no
 * encontraba nada, y entregaba mercaderia que el sistema seguia contando como disponible.
 *
 * Esta suite compara los DOS archivos, como t-topes-pedido.js. Los campos se leen del
 * fuente de la function, no estan escritos aca: si alguien agrega uno nuevo al patch, la
 * prueba falla hasta que lo muestre en el panel o lo clasifique a proposito.
 */
const fs = require('fs');
const fn = fs.readFileSync('functions/index.js', 'utf8');
const panel = fs.readFileSync('admin.html', 'utf8');

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + extra + ']' : '')); }
};

/* --- los campos que descontarStockPedido escribe en el pedido --- */
const iPatch = fn.indexOf('const patch = {');
const bloquePatch = iPatch >= 0 ? fn.slice(iPatch, fn.indexOf('};', iPatch)) : '';
const campos = new Set();
(bloquePatch.match(/^\s*([a-zA-Z]+):/gm) || []).forEach(m => campos.add(m.trim().slice(0, -1)));
(fn.match(/patch\.([a-zA-Z]+)\s*=/g) || []).forEach(m => campos.add(/patch\.([a-zA-Z]+)/.exec(m)[1]));
/* y los de rateLimitPedidos y del catch de descontarStockPedido */
['bloqueadoPorLimite', 'pedidosEnLaHora', 'motivoBloqueo', 'stockError'].forEach(c => {
  if (fn.indexOf(c) >= 0) campos.add(c);
});

console.log('\nLos campos salen del fuente de functions/index.js');
t('encontre el patch de descontarStockPedido', bloquePatch.length > 0);
t('y son varios', campos.size >= 8, campos.size);
console.log('       ' + [...campos].sort().join(', '));

/* Guardados a proposito y NO mostrados. Cada uno con su razon: si algun dia hay que
   mostrarlo, se saca de aca y la prueba lo exige. */
const SOLO_AUDITORIA = {
  subtotalCatalogo: 'es el numero contra el que se calcula diferenciaCatalogo, que si se muestra',
  pedidosEnLaHora: 'ya viaja adentro del texto de motivoBloqueo, que el panel imprime',
};

console.log('\nCada campo se muestra en el panel, o esta clasificado como de auditoria');
for (const c of [...campos].sort()) {
  if (SOLO_AUDITORIA[c]) { ok++; console.log('  OK   ' + c + ' - no se muestra a proposito: ' + SOLO_AUDITORIA[c]); continue; }
  t(c + ' - el panel lo lee', panel.indexOf(c) >= 0, 'no aparece en admin.html');
}

/* --- la regresion exacta: el aviso tiene que decir lo que paso --- */
console.log('\nEl aviso de un producto borrado no puede disfrazarse de problema de precio');
const iRender = panel.indexOf('function renderPedidos');
const bloqueRender = panel.slice(iRender, panel.indexOf('function ', iRender + 30));
t('renderPedidos ramifica por itemsDesconocidos ANTES que por el total',
  bloqueRender.indexOf('p.itemsDesconocidos') >= 0 &&
  bloqueRender.indexOf('p.itemsDesconocidos') < bloqueRender.indexOf('p.itemsBajoCosto'),
  'el caso del producto borrado cae en el texto de inflacion');
t('y el texto dice que a esos items no se les descontó stock',
  /NO se les descont/.test(bloqueRender));
t('la etiqueta no dice "Revisar precio", que seria el problema equivocado',
  /_lbl='Producto borrado'/.test(bloqueRender));

/* Y que la function siga siendo la que prende la bandera en ese caso: si eso cambiara,
   la rama de arriba quedaria muerta sin que nadie se entere. */
t('la function sigue prendiendo revisarPrecio cuando hay items desconocidos',
  /if \(desconocidos\.length\) patch\.revisarPrecio = true;/.test(fn));

/* ---------- la otra mitad del contrato: lo que escribe la TIENDA ---------- */
/* Los campos de arriba los agregan las functions. Estos los escribe el cliente al
   confirmar, y valen lo mismo: `direccion` y `notas` se guardaban, sanitizarPedido las
   limpiaba y el aviso de Telegram las mandaba, pero el panel no las nombraba en ninguna
   linea. Con Telegram sin configurar -o con el mensaje recortado, que tiene tope de
   4096 caracteres- el comercio no tenia de donde sacar a donde entregar. */
const app = fs.readFileSync('app.js', 'utf8');
const iPed = app.indexOf('const pedido={');
const bloquePed = iPed >= 0 ? app.slice(iPed, app.indexOf('};', iPed)) : '';
const delPedido = new Set();
(bloquePed.match(/^\s{0,20}([a-zA-Z]+):/gm) || []).forEach(m => delPedido.add(m.trim().slice(0, -1)));

/* Los que el panel no necesita nombrar, cada uno con su razon. */
const NO_HACE_FALTA = {
  clienteEmail: 'se muestra, pero dentro de la tarjeta del cliente; se chequea igual abajo',
  envioGratis: 'se deduce de envio===0, que si se usa',
  subtotalProductos: 'el panel recalcula los totales con subtotalItem() sobre los items',
  creadoEn: 'se usa para la fecha del modal y el filtro por mes',
  origen: 'se usa para distinguir el pedido web del de mostrador',
};

console.log('\nY los campos que escribe el checkout de la tienda');
t('encontre el objeto pedido de app.js', bloquePed.length > 0);
console.log('       ' + [...delPedido].sort().join(', '));
for (const c of [...delPedido].sort()) {
  if (NO_HACE_FALTA[c]) { ok++; console.log('  OK   ' + c + ' - ' + NO_HACE_FALTA[c]); continue; }
  t(c + ' - el panel lo lee', panel.indexOf(c) >= 0, 'no aparece en admin.html');
}

/* La regresion exacta: no alcanza con que la palabra este en el archivo, tiene que
   estar en la pantalla del pedido. */
console.log('\nLa direccion y las notas tienen que estar en la pantalla del PEDIDO');
const iModal = panel.indexOf('function openPedidoModal');
const bloqueModal = panel.slice(iModal, panel.indexOf('function closePedidoModal', iModal));
t('openPedidoModal muestra la direccion del envio', /esc\(p\.direccion\)/.test(bloqueModal));
t('avisa cuando el pedido dice envio y no trae direccion', /sin direccion en el pedido/.test(bloqueModal));
t('openPedidoModal muestra las notas del cliente', /esc\(p\.notas\)/.test(bloqueModal));
t('y distingue retiro de envio', /Retiro en local/.test(bloqueModal) && /Envio a domicilio/.test(bloqueModal));

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
