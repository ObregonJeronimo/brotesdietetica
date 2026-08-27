/* Prueba gananciaDe y _precioCobradoItem sacadas del fuente REAL de admin.html */
const fs=require('fs');
const src=fs.readFileSync('admin.html','utf8');
function extraer(n){
  const i=src.indexOf('function '+n+'(');
  if(i<0) throw new Error('falta '+n);
  let b=src.indexOf('{',i),prof=0,k;
  for(k=b;k<src.length;k++){ if(src[k]==='{')prof++; else if(src[k]==='}'){prof--;if(!prof)break;} }
  return src.slice(i,k+1);
}
let allProducts=[];
eval(extraer('_precioCobradoItem')+'\n'+extraer('gananciaDe')+'\nglobal.G=gananciaDe;global.P=_precioCobradoItem;');
let ok=0,fail=0;
const t=(d,c)=>{ if(c){ok++;console.log('  OK   '+d);} else {fail++;console.log('  FALLA '+d);} };
const g=(doc,buscar)=>{ return G(doc,buscar); };

console.log('\nUna VENTA (precio de lista + descuento aparte, con costo)');
let r=g({items:[{id:'a',precio:1000,costo:600,descuento:0,cantidad:1}]});
t('sin descuento: 1000-600 = 400', r.ganancia===400 && r.completa);
r=g({items:[{id:'a',precio:1000,costo:600,descuento:20,cantidad:1}]});
t('20% off: se cobro 800, gana 200', r.ganancia===200);
t('  (antes daba 400, el margen del precio lleno)', r.ganancia!==400);
r=g({items:[{id:'a',precio:1000,costo:600,descuento:20,cantidad:3}]});
t('por 3 unidades: 600', r.ganancia===600);
r=g({items:[{id:'a',precio:1000,costo:600,descuento:0,cantidad:1}],descuentoMonto:150});
t('descuento general sale del margen: 400-150 = 250', r.ganancia===250);

console.log('\nUn PEDIDO WEB (precio YA neteado + precioOriginal + sin costo)');
allProducts=[{id:'a',costo:600},{id:'b',costo:300}];
r=g({items:[{id:'a',precio:800,precioOriginal:1000,descuento:20,cantidad:1}]},true);
t('no aplica el descuento dos veces: cobrado 800', P({precio:800,precioOriginal:1000,descuento:20})===800);
t('gana 200, no 40', r.ganancia===200);
t('  (antes: 640-0 = 640, pura facturacion)', r.ganancia!==640);
t('completa, porque el costo esta en el catalogo', r.completa===true);

console.log('\nCuando NO se puede saber el costo');
allProducts=[];
r=g({items:[{id:'z',precio:800,precioOriginal:1000,descuento:20,cantidad:1}]},true);
t('avisa que no esta completa', r.completa===false);
allProducts=[{id:'a',costo:0}];
r=g({items:[{id:'a',precio:800,precioOriginal:1000,descuento:20,cantidad:1}]},true);
t('costo 0 en el catalogo = dato sin cargar, no regalo', r.completa===false);
r=g({items:[{id:'a',precio:800,precioOriginal:1000,descuento:20,cantidad:1}]},false);
t('sin buscar en catalogo tampoco inventa', r.completa===false);

console.log('\nMezclas y bordes');
allProducts=[{id:'a',costo:600},{id:'b',costo:300}];
r=g({items:[{id:'a',precio:800,precioOriginal:1000,descuento:20,cantidad:1},{id:'b',precio:500,precioOriginal:500,descuento:0,cantidad:2}]},true);
t('dos items: 200 + 400 = 600', r.ganancia===600);
r=g({items:[{id:'a',precio:1000,costo:600,descuento:20,cantidad:1},{id:'z',precio:500,descuento:0,cantidad:1}]},true);
t('uno con costo y otro sin: marca incompleta', r.completa===false);
t('sin items no rompe', g({items:[]}).ganancia===0);
t('doc vacio no rompe', g({}).ganancia===0);
t('doc null no rompe', g(null).ganancia===0);
r=g({items:[{id:'a',precio:1000,costo:1500,descuento:0,cantidad:1}]});
t('vender bajo costo da negativo, no cero', r.ganancia===-500);
t('descuento 150% se acota a 100', P({precio:1000,descuento:150})===0);
t('descuento negativo se acota a 0', P({precio:1000,descuento:-50})===1000);

console.log('\n'+ok+' pasaron, '+fail+' fallaron');
process.exit(fail?1:0);
