/* Simula el ciclo de vida del stock replicando la logica que quedo en admin.html.
   Lo que se busca cazar: descontar dos veces, devolver dos veces, e inflar stock
   al editar ventas anteriores a esta funcion. */

let DESCONTAR_STOCK = true;
const STOCK = {};           /* estado del "Firestore" */

function deltasDeItems(items, signo){
  const d = {};
  (items||[]).forEach(i=>{ if(!i||!i.id) return; d[i.id]=(d[i.id]||0)+signo*Number(i.cantidad||0); });
  return d;
}
function aplicarStockProductos(deltas){
  if(!DESCONTAR_STOCK) return;
  Object.keys(deltas||{}).forEach(id=>{
    if(Number(deltas[id])===0) return;
    STOCK[id]=Number(STOCK[id]||0)+Number(deltas[id]);   /* increment() */
  });
}

/* --- las tres operaciones, tal como quedaron en el panel --- */
function crearVenta(items, pedOrigen){
  /* yaDescontado: alguien ya saco las unidades (la Cloud Function del pedido web).
     poseeStock:   quien queda a cargo de devolverlas si se borra la venta. */
  const yaDescontado = !!(pedOrigen && pedOrigen.stockDescontado);
  const poseeStock = yaDescontado || !!DESCONTAR_STOCK;
  if(!yaDescontado) aplicarStockProductos(deltasDeItems(items,-1));
  if(pedOrigen) pedOrigen.stockDescontado = false;        /* traspaso de responsabilidad */
  return { items: JSON.parse(JSON.stringify(items)), stockDescontado: poseeStock };
}
function editarVenta(venta, itemsNuevos){
  const d = venta.stockDescontado ? deltasDeItems(venta.items,1) : {};
  const dn = deltasDeItems(itemsNuevos,-1);
  Object.keys(dn).forEach(k=>{ d[k]=(d[k]||0)+dn[k]; });
  aplicarStockProductos(d);
  venta.items = JSON.parse(JSON.stringify(itemsNuevos));
  venta.stockDescontado = !!DESCONTAR_STOCK;
}
function borrarVenta(venta){
  if(venta && venta.stockDescontado){ venta.stockDescontado=false; aplicarStockProductos(deltasDeItems(venta.items,1)); }
}
function borrarPedido(pedido){                            /* devolverStockPedido */
  if(!pedido || !pedido.stockDescontado) return;
  aplicarStockProductos(deltasDeItems(pedido.items,1));
  pedido.stockDescontado = false;
}

let fallos=0, pasados=0;
function chk(nombre, real, esperado){
  const ok = JSON.stringify(real)===JSON.stringify(esperado);
  if(ok){ pasados++; console.log('  OK   '+nombre); }
  else { fallos++; console.log('  FALLA '+nombre+'\n        esperado: '+JSON.stringify(esperado)+'\n        real:     '+JSON.stringify(real)); }
}
function reset(v){ Object.keys(STOCK).forEach(k=>delete STOCK[k]); STOCK.yerba=v; }

console.log('\nCaso 1 - venta de mostrador: descuenta una sola vez');
reset(100);
let v1 = crearVenta([{id:'yerba',cantidad:3}]);
chk('stock 100 -> 97', STOCK.yerba, 97);

console.log('\nCaso 2 - editar la venta a mas cantidad');
editarVenta(v1, [{id:'yerba',cantidad:5}]);
chk('devuelve 3 y descuenta 5 -> 95', STOCK.yerba, 95);

console.log('\nCaso 3 - editar a menos cantidad');
editarVenta(v1, [{id:'yerba',cantidad:1}]);
chk('devuelve 5 y descuenta 1 -> 99', STOCK.yerba, 99);

console.log('\nCaso 4 - borrar la venta vuelve al inicio');
borrarVenta(v1);
chk('stock vuelve a 100', STOCK.yerba, 100);
borrarVenta(v1);
chk('borrar dos veces NO devuelve de nuevo', STOCK.yerba, 100);

console.log('\nCaso 5 - item repetido en la misma venta');
reset(100);
let v5 = crearVenta([{id:'yerba',cantidad:2},{id:'yerba',cantidad:3}]);
chk('agrupa 2+3 y descuenta 5', STOCK.yerba, 95);
borrarVenta(v5);
chk('devuelve los 5 juntos', STOCK.yerba, 100);

console.log('\nCaso 6 - pedido web convertido en venta (el bug de la doble resta)');
reset(100);
let ped = { items:[{id:'yerba',cantidad:4}], stockDescontado:false };
aplicarStockProductos(deltasDeItems(ped.items,-1)); ped.stockDescontado=true;   /* lo hace la tienda */
chk('la tienda descuenta 4 -> 96', STOCK.yerba, 96);
let v6 = crearVenta(ped.items, ped);
chk('convertir a venta NO descuenta de nuevo', STOCK.yerba, 96);
chk('la venta queda como responsable', v6.stockDescontado, true);
chk('el pedido deja de serlo', ped.stockDescontado, false);
borrarPedido(ped);
chk('borrar el pedido NO devuelve (ya no es el responsable)', STOCK.yerba, 96);
borrarVenta(v6);
chk('borrar la venta devuelve una sola vez -> 100', STOCK.yerba, 100);

console.log('\nCaso 7 - venta vieja, anterior a esta funcion');
reset(100);
let vieja = { items:[{id:'yerba',cantidad:10}] };   /* sin stockDescontado */
borrarVenta(vieja);
chk('borrarla NO infla el stock', STOCK.yerba, 100);
editarVenta(vieja, [{id:'yerba',cantidad:10}]);
chk('editarla descuenta pero no devuelve lo que nunca resto', STOCK.yerba, 90);

console.log('\nCaso 8 - descuento automatico apagado');
reset(100);
DESCONTAR_STOCK = false;
let v8 = crearVenta([{id:'yerba',cantidad:7}]);
chk('no toca el stock', STOCK.yerba, 100);
chk('queda marcada como no-responsable', v8.stockDescontado, false);
borrarVenta(v8);
chk('borrarla tampoco lo toca', STOCK.yerba, 100);
DESCONTAR_STOCK = true;

console.log('\nCaso 9 - sobreventa: el stock queda negativo a proposito');
reset(2);
let v9 = crearVenta([{id:'yerba',cantidad:5}]);
chk('2 - 5 = -3 (avisa que el conteo fisico esta mal)', STOCK.yerba, -3);
chk('cuenta como sin stock', (STOCK.yerba||0)<=0, true);
borrarVenta(v9);
chk('revertir la sobreventa vuelve a 2', STOCK.yerba, 2);

console.log('\nCaso 10 - venta con varios productos distintos');
reset(50); STOCK.miel=20; STOCK.avena=8;
let v10 = crearVenta([{id:'yerba',cantidad:1},{id:'miel',cantidad:2},{id:'avena',cantidad:8}]);
chk('yerba', STOCK.yerba, 49);
chk('miel', STOCK.miel, 18);
chk('avena llega a 0', STOCK.avena, 0);
editarVenta(v10, [{id:'yerba',cantidad:1},{id:'miel',cantidad:2}]);   /* se saca la avena */
chk('sacar la avena la devuelve', STOCK.avena, 8);
chk('los otros no se mueven', [STOCK.yerba,STOCK.miel], [49,18]);

console.log('\nCaso 11 - pedido web cuya Cloud Function NO llego a descontar');
reset(100);
let pedFallo = { items:[{id:'yerba',cantidad:6}], stockDescontado:false };
let v11 = crearVenta(pedFallo.items, pedFallo);
chk('al convertirlo, la venta descuenta ella misma', STOCK.yerba, 94);
chk('y queda a cargo de devolverlo', v11.stockDescontado, true);
borrarVenta(v11);
chk('borrarla devuelve exactamente una vez', STOCK.yerba, 100);

console.log('\nCaso 12 - una venta de mostrador comun sigue descontando');
reset(100);
let v12 = crearVenta([{id:'yerba',cantidad:2}]);
chk('descuenta las 2', STOCK.yerba, 98);
chk('y es la responsable', v12.stockDescontado, true);

console.log('\n'+pasados+' pasaron, '+fallos+' fallaron');
process.exit(fallos>0?1:0);
