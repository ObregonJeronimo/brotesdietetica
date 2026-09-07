/* El informe de productos repetidos.

   Dos productos con el mismo nombre son dos fichas para el cliente: dos precios,
   dos stocks y dos lugares donde tocar cuando cambia el costo. Se separan en dos
   casos porque no son el mismo problema: en la MISMA lista casi siempre sobra uno,
   y entre LISTAS DISTINTAS puede ser legitimo (se le compra a dos proveedores).

   Lo que este informe NO tiene que hacer es marcar como repetidos dos envases del
   mismo producto: "CANELA x 500 gr" y "CANELA x 1 Kg" son fichas distintas a
   proposito, con precios distintos. */
const fs=require('fs');
const src=fs.readFileSync('admin.html','utf8');

function cuerpo(nombre){
    const i=src.indexOf('function '+nombre+'(');
    if(i<0)throw new Error('no se encontro '+nombre);
    let b=src.indexOf('{',i),prof=0,k;
    for(k=b;k<src.length;k++){ if(src[k]==='{')prof++; else if(src[k]==='}'){prof--;if(!prof)break;} }
    return src.slice(i,k+1);
}
/* claveProducto es la del importador: se trae la de verdad, no una copia. */
const gruposDuplicados=new Function('allProducts',
    cuerpo('claveProducto')+'\n'+cuerpo('gruposDuplicados')+'\nreturn gruposDuplicados;');

let ok=0,fail=0;
const t=(d,c)=>{ if(c){ok++;console.log('  OK   '+d);} else {fail++;console.log('  FALLA '+d);} };
const G=prods=>gruposDuplicados(prods)();

console.log('\nLo basico');
t('catalogo limpio -> ningun grupo', G([{nombre:'Mani',lista:'a'},{nombre:'Nuez',lista:'a'}]).length===0);
t('lista vacia no explota', G([]).length===0);
t('un solo producto no es repetido', G([{nombre:'Mani',lista:'a'}]).length===0);

console.log('\nMisma lista vs listas distintas');
let g=G([{nombre:'Mani',lista:'a'},{nombre:'Mani',lista:'a'}]);
t('dos veces en la misma lista -> 1 grupo', g.length===1);
t('lo marca como MISMA lista', g[0].mismaLista===true);
t('trae los dos productos', g[0].items.length===2);
g=G([{nombre:'Mani',lista:'a'},{nombre:'Mani',lista:'b'}]);
t('en dos listas -> 1 grupo', g.length===1);
t('lo marca como listas DISTINTAS', g[0].mismaLista===false);
g=G([{nombre:'Mani',lista:'a'},{nombre:'Mani',lista:'a'},{nombre:'Mani',lista:'b'}]);
t('tres, dos de ellos en la misma -> distintas', g[0].mismaLista===false&&g[0].items.length===3);

console.log('\nMismo producto escrito distinto (usa la clave del importador)');
t('mayusculas', G([{nombre:'MANI',lista:'a'},{nombre:'mani',lista:'a'}]).length===1);
t('tildes', G([{nombre:'Semillas Chía',lista:'a'},{nombre:'semillas chia',lista:'a'}]).length===1);
t('espacios de mas', G([{nombre:'Semillas  Chia',lista:'a'},{nombre:'Semillas Chia',lista:'a'}]).length===1);
t('espacios al borde', G([{nombre:'  Mani ',lista:'a'},{nombre:'Mani',lista:'a'}]).length===1);

console.log('\nLo que NO puede marcar (envases distintos del mismo producto)');
t('500 gr y 1 Kg no son repetidos',
    G([{nombre:'CANELA EN RAMA x 500 gr',lista:'a'},{nombre:'CANELA EN RAMA x 1 Kg',lista:'a'}]).length===0);
t('x 1 kg y x 5 kg tampoco',
    G([{nombre:'GARBANZO x 1 Kg',lista:'a'},{nombre:'GARBANZO x 5 Kg',lista:'a'}]).length===0);
t('nombres parecidos pero distintos',
    G([{nombre:'Almendras',lista:'a'},{nombre:'Almendra',lista:'a'}]).length===0);

console.log('\nBordes');
t('sin nombre no entra al informe', G([{nombre:'',lista:'a'},{nombre:'',lista:'a'}]).length===0);
t('nombre ausente tampoco', G([{lista:'a'},{lista:'a'}]).length===0);
t('sin lista se compara igual, y cuenta como misma',
    G([{nombre:'Mani'},{nombre:'Mani'}])[0].mismaLista===true);
t('uno con lista y otro sin -> distintas',
    G([{nombre:'Mani',lista:'a'},{nombre:'Mani'}])[0].mismaLista===false);

console.log('\nOrden: primero lo que casi seguro sobra');
g=G([{nombre:'Entre listas',lista:'a'},{nombre:'Entre listas',lista:'b'},
     {nombre:'Misma lista',lista:'c'},{nombre:'Misma lista',lista:'c'}]);
t('los de misma lista van arriba', g[0].mismaLista===true&&g[1].mismaLista===false);
g=G([{nombre:'Par',lista:'a'},{nombre:'Par',lista:'a'},
     {nombre:'Trio',lista:'b'},{nombre:'Trio',lista:'b'},{nombre:'Trio',lista:'b'}]);
t('a igual tipo, primero el grupo mas grande', g[0].items.length===3);

console.log('\nEscala: 1484 productos (611 de hoy + los 873 de FRUTICOR-TODOS)');
const muchos=[];
for(let i=0;i<1484;i++)muchos.push({nombre:'Producto '+i,lista:'L'+(i%27)});
for(let i=0;i<47;i++)muchos.push({nombre:'Producto '+i,lista:'OTRA'});
const t0=Date.now();
const gg=G(muchos);
const ms=Date.now()-t0;
t('encuentra los 47 repetidos', gg.length===47);
t('los 47 son entre listas distintas', gg.every(x=>x.mismaLista===false));
t('tarda menos de 300 ms (lo llama updateStats en cada carga)', ms<300);
console.log('     (tardo '+ms+' ms)');

console.log('\nContrato con el HTML');
[['dupModal','el modal'],['dupList','la lista'],['dupPager','el paginador'],
 ['dupResumen','el resumen'],['statDup','la tarjeta que avisa']].forEach(([id,q])=>
    t('existe #'+id+' ('+q+')', src.includes('id="'+id+'"')));
t('la tarjeta abre el modal', /onclick="openDupModal\(\)"/.test(src));
t('updateStats llena la tarjeta', /statDup'\);if\(_sd\)_sd\.textContent=gruposDuplicados\(\)\.length/.test(cuerpo('updateStats')));
t('reusa claveProducto y no define otra clave', /claveProducto\(p\.nombre\)/.test(cuerpo('gruposDuplicados')));

console.log('\n'+ok+' pasaron, '+fail+' fallaron');
process.exit(fail?1:0);
