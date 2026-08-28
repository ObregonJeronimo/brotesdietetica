/**
 * Prueba refrescarProductoLocal / quitarProductoLocal / nroPed sacando el codigo
 * REAL de admin.html, no una copia. Si alguien edita esas funciones y las rompe,
 * esta prueba se cae.
 */
const fs=require('fs');
const path=require('path');
const P=path.join(__dirname,'..','admin.html');
const src=fs.readFileSync(P,'utf8');

function extraer(nombre){
    const i=src.indexOf('function '+nombre+'(');
    if(i<0)throw new Error('no encuentro '+nombre);
    let j=src.indexOf('{',i),prof=0,k=j;
    for(;k<src.length;k++){
        if(src[k]==='{')prof++;
        else if(src[k]==='}'){prof--;if(!prof)break;}
    }
    let ini=i;
    if(src.slice(Math.max(0,i-6),i)==='async ')ini=i-6;
    return src.slice(ini,k+1);
}

let ok=0,fail=0;
function t(n,cond){ if(cond){ok++;console.log('  OK   '+n);} else {fail++;console.log('  FALLA '+n);} }
function grupo(n){ console.log('\n'+n); }

/* ------------------------------------------------------------------ entorno */
let allProducts=[];
let renders=0, lecturas=0;
let servidor={};   /* lo que "tiene" Firestore */
const db={collection:()=>({doc:(id)=>({get:async()=>{lecturas++;const d=servidor[id];return{exists:!!d,id:id,data:()=>d};}})})};
const NEGOCIO={nroPedido:(n)=>'#'+String(Number(n)||0).padStart(5,'0'),
               nroVenta:(n)=>'#'+String(Number(n)||0).padStart(6,'0')};
function filterTable(){renders++;}
function updateStats(){}
function updateCategoryFilter(){}
function renderStockList(){}
function renderListaFilterSelect(){}
const console_warn=console.warn; console.warn=()=>{};

const cuerpos=['_reRenderProductos','refrescarProductoLocal','quitarProductoLocal','nroPed','nroVta'].map(extraer);
eval(cuerpos.join('\n'));
console.warn=console_warn;

/* ------------------------------------------------------- 1) editar existente */
grupo('Caso 1 - guardar un producto existente');
allProducts=[{id:'a',nombre:'Yerba',precio:1000,stock:5},{id:'b',nombre:'Miel',precio:2000,stock:9}];
servidor={a:{nombre:'Yerba',precio:1500,stock:3,costo:800}};
lecturas=0;renders=0;
(async()=>{
  let r=await refrescarProductoLocal('a');
  t('devuelve true',r===true);
  t('UNA sola lectura, no 3.000',lecturas===1);
  t('volvio a dibujar',renders===1);
  t('el precio nuevo quedo',allProducts[0].precio===1500);
  t('el stock es el del SERVIDOR (3), no el de memoria (5)',allProducts[0].stock===3);
  t('no toco al otro producto',allProducts[1].precio===2000);
  t('sigue habiendo 2',allProducts.length===2);
  t('completa porcentajeMayorista',allProducts[0].porcentajeMayorista===0);

  /* ------------------------------------------------ 2) el stock que no se toco */
  grupo('Caso 2 - editar la descripcion mientras entra un pedido web');
  allProducts=[{id:'a',nombre:'Yerba',precio:1000,stock:10}];
  servidor={a:{nombre:'Yerba',precio:1000,stock:6,descripcion:'nueva'}}; /* 4 se vendieron */
  await refrescarProductoLocal('a');
  t('la fila muestra 6, no 10',allProducts[0].stock===6);
  t('y la descripcion nueva',allProducts[0].descripcion==='nueva');

  /* --------------------------------------------------- 3) producto nuevo */
  grupo('Caso 3 - crear un producto');
  allProducts=[{id:'a',nombre:'Yerba'}];
  servidor={z:{nombre:'Nuez',precio:500}};
  await refrescarProductoLocal('z');
  t('se agrego',allProducts.length===2);
  t('con su id',allProducts[1].id==='z');

  /* ------------------------------------------- 4) el documento no esta */
  grupo('Caso 4 - el documento no aparece (que relea todo)');
  servidor={};
  t('devuelve false para que el llamador relea',(await refrescarProductoLocal('nada'))===false);
  t('sin id devuelve false',(await refrescarProductoLocal(''))===false);

  /* ------------------------------------------------ 5) borrar con hijos */
  grupo('Caso 5 - borrar un padre con envasados propios');
  allProducts=[
    {id:'p',nombre:'Bolsa 5kg'},
    {id:'h1',nombre:'Fraccion 500g',envasadoPropio:true,padreId:'p',padreNombre:'Bolsa 5kg'},
    {id:'h2',nombre:'Fraccion 1kg',envasadoPropio:true,padreId:'p',padreNombre:'Bolsa 5kg'},
    {id:'otro',nombre:'Miel',envasadoPropio:true,padreId:'x',padreNombre:'Otro'}
  ];
  lecturas=0;
  t('devuelve true',quitarProductoLocal('p',[{id:'h1'},{id:'h2'}])===true);
  t('CERO lecturas: el doc ya no esta',lecturas===0);
  t('el padre salio de la lista',!allProducts.find(x=>x.id==='p'));
  const h1=allProducts.find(x=>x.id==='h1');
  t('el hijo quedo como normal',h1.envasadoPropio===false);
  t('sin padreId huerfano',!('padreId' in h1));
  t('sin padreNombre huerfano',!('padreNombre' in h1));
  const otro=allProducts.find(x=>x.id==='otro');
  t('el hijo de OTRO padre no se toco',otro.padreId==='x'&&otro.envasadoPropio===true);

  /* ------------------------------------------------- 6) numero de pedido */
  grupo('Caso 6 - un solo formato de numero de pedido');
  t('7 -> 00007',nroPed(7)==='00007');
  t('sin el # (lo pone el llamador)',nroPed(7).indexOf('#')<0);
  t('12345 -> 12345',nroPed(12345)==='12345');
  t('0 -> 00000',nroPed(0)==='00000');
  t('null no rompe',nroPed(null)==='00000');
  t('texto no rompe',nroPed('abc')==='00000');
  t('coincide con NEGOCIO.nroPedido','#'+nroPed(42)===NEGOCIO.nroPedido(42));

  grupo('Caso 7 - pedido y venta son numeraciones distintas');
  t('venta 42 -> 000042 (seis)',nroVta(42)==='000042');
  t('pedido 42 -> 00042 (cinco)',nroPed(42)==='00042');
  t('y NO se leen igual',nroVta(42)!==nroPed(42));
  t('venta null no rompe',nroVta(null)==='000000');
  t('venta texto no rompe',nroVta('x')==='000000');
  t('coincide con NEGOCIO.nroVenta','#'+nroVta(7)===NEGOCIO.nroVenta(7));

  console.log('\n'+ok+' pasaron, '+fail+' fallaron');
  process.exit(fail?1:0);
})();
