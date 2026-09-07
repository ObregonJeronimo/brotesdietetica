/* UN PRODUCTO SIN PRECIO NO ESTA A LA VENTA.

   addToCart solo miraba el stock. Un producto en $0 con stock se podia agregar al
   carrito, y como el minimo de pedido se controla sobre el TOTAL, alcanzaba con
   sumar $30.000 de productos de verdad para llevarse los de $0 gratis, con el stock
   descontandose igual.

   Medido en produccion el 09/09/2026: 197 productos visibles en $0, y 141 de ellos
   con stock cargado -entre otros 6,9 kg de bicarbonato y 4,2 kg de mani-. Ninguno
   viene de la migracion de FRUTICOR (esos 873 tienen todos precio): son del catalogo
   original, al que le falta cargar precios.

   La regla de /pedidos exige total > 0, asi que un carrito de puros $0 fallaba igual
   -pero recien al confirmar, sin explicar por que-. */
const fs=require('fs');
const src=fs.readFileSync('app.js','utf8');

function cuerpo(nombre){
    const i=src.indexOf('function '+nombre+'(');
    if(i<0)throw new Error('no se encontro '+nombre);
    let b=src.indexOf('{',i),prof=0,k;
    for(k=b;k<src.length;k++){ if(src[k]==='{')prof++; else if(src[k]==='}'){prof--;if(!prof)break;} }
    return src.slice(i,k+1);
}
const sinPrecio=new Function(cuerpo('sinPrecio')+'\nreturn sinPrecio;')();

let ok=0,fail=0;
const t=(d,c)=>{ if(c){ok++;console.log('  OK   '+d);} else {fail++;console.log('  FALLA '+d);} };

console.log('\nQue cuenta como "sin precio"');
t('precio 0', sinPrecio({precio:0})===true);
t('precio ausente', sinPrecio({})===true);
t('precio null', sinPrecio({precio:null})===true);
t('precio undefined', sinPrecio({precio:undefined})===true);
t('precio negativo', sinPrecio({precio:-100})===true);
t('texto vacio', sinPrecio({precio:''})===true);
t('texto que no es numero', sinPrecio({precio:'consultar'})===true);
t('NaN', sinPrecio({precio:NaN})===true);
t('el producto entero ausente', sinPrecio(undefined)===true);
t('null', sinPrecio(null)===true);

console.log('\nY que SI esta a la venta');
t('precio 1', sinPrecio({precio:1})===false);
t('precio 13960', sinPrecio({precio:13960})===false);
t('precio con decimales', sinPrecio({precio:9082.5})===false);
t('precio como texto numerico', sinPrecio({precio:'2500'})===false);

console.log('\nLa guarda dura: addToCart');
const atc=cuerpo('addToCart');
t('addToCart pregunta por el precio, no solo por el stock', /if\(sinPrecio\(p\)\)/.test(atc));
t('y corta antes de tocar el carrito',
    atc.indexOf('sinPrecio(p)') < atc.indexOf('const existing=carrito.find'));
t('avisa por que, en vez de no hacer nada', /showToast\(/.test(atc.slice(atc.indexOf('sinPrecio(p)'),atc.indexOf('sinPrecio(p)')+260)));
t('sigue cortando por falta de stock', /\(p\.stock\|\|0\)<=0\)return/.test(atc));

console.log('\nEn pantalla: los cuatro lugares que dibujan el boton');
t('los 4 renders calculan noPrecio', (src.match(/const noPrecio\s*=\s*sinPrecio\(p\)/g)||[]).length===4);
t('hay rama "Consultar" en el boton', (src.match(/bi-chat-dots"><\/i> Consultar/g)||[]).length>=2);
t('el boton queda deshabilitado', (src.match(/\(noStock\|\|noPrecio\?' disabled':''\)/g)||[]).length>=2);
t('no queda ningun disabled que mire solo el stock', !/\(noStock\?' disabled':''\)/.test(src));
t('la tarjeta no muestra "$0": dice Consultar precio', /product-price-consultar/.test(src));
t('y la clase tiene estilo definido',
    fs.readFileSync('styles.css','utf8').includes('.product-price-consultar'));

console.log('\nLo que NO tiene que cambiar');
t('un producto con precio sigue mostrando el precio', /const precioHtml=noPrecio/.test(src));
t('el sufijo "el kilo" del granel sigue estando', /precio-por-kilo/.test(src));
t('sin stock sigue diciendo Sin stock', (src.match(/Sin stock/g)||[]).length>=4);

console.log('\n'+ok+' pasaron, '+fail+' fallaron');
process.exit(fail?1:0);
