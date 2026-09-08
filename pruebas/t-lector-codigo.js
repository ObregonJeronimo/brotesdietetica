/* ESCANEAR TIENE QUE AGREGAR x1, SIN PASAR POR LA BARRA DE BUSQUEDA.

   El lector ya ruteaba al modal de venta, pero solo reconocia `codigoBarras`, y de
   los 1484 productos de produccion hay UNO con codigo de barras cargado. Los 1484 SI
   tienen `codigo`, que es el que sale en las etiquetas que imprime el comercio. Por
   eso en la practica la pistola no encontraba nada y habia que escanear DENTRO de la
   barra de busqueda del modal, que si mira el `codigo`.

   Las dos comparaciones son EXACTAS. El buscador de la venta usa includes()
   -'000320'.includes('320')-, que esta bien para elegir a mano; para agregar solo no
   sirve, porque '320' entraria en media docena de productos. */
const fs=require('fs');
const src=fs.readFileSync('admin-lector.js','utf8');
const admin=fs.readFileSync('admin.html','utf8');

function cuerpoDe(txt,nombre){
    const i=txt.indexOf('function '+nombre+'(');
    if(i<0)throw new Error('no se encontro '+nombre);
    let b=txt.indexOf('{',i),prof=0,k;
    for(k=b;k<txt.length;k++){ if(txt[k]==='{')prof++; else if(txt[k]==='}'){prof--;if(!prof)break;} }
    return txt.slice(i,k+1);
}
const F=new Function('allProducts',
    cuerpoDe(src,'_normCod')+'\n'+cuerpoDe(src,'coincidenciasCodigo')+'\n'+
    cuerpoDe(src,'buscarPorCodigo')+'\n'+cuerpoDe(src,'productoConCodigoBarras')+'\n'+
    'return {coincidenciasCodigo,buscarPorCodigo,productoConCodigoBarras};');

let ok=0,fail=0;
const t=(d,c)=>{ if(c){ok++;console.log('  OK   '+d);} else {fail++;console.log('  FALLA '+d);} };

const CAT=[
 {id:'A',nombre:'GALLETA DE ARROZ',   codigo:'000685', codigoBarras:'7790001234567'},
 {id:'B',nombre:'YERBA KALENA',       codigo:'000686', codigoBarras:null},
 {id:'C',nombre:'MANI CON CASCARA',   codigo:'000320', codigoBarras:''},
 {id:'D',nombre:'ALMENDRA',           codigo:'001320', codigoBarras:undefined},
 {id:'E',nombre:'NUEZ',               codigo:'p-0001', codigoBarras:'7790009999999'}
];
const L=F(CAT);

console.log('\nPor codigo de BARRAS (el de fabrica)');
t('lo encuentra exacto', L.buscarPorCodigo('7790001234567').id==='A');
t('y al otro tambien', L.buscarPorCodigo('7790009999999').id==='E');
t('uno que no existe no devuelve nada', L.buscarPorCodigo('7790000000000')===null);

console.log('\nPor codigo INTERNO (el de las etiquetas del comercio) — lo que faltaba');
t('encuentra 000685', L.buscarPorCodigo('000685').id==='A');
t('encuentra 000686, que NO tiene codigo de barras', L.buscarPorCodigo('000686').id==='B');
t('encuentra 000320', L.buscarPorCodigo('000320').id==='C');
t('no le molestan los espacios', L.buscarPorCodigo('  000685  ').id==='A');
t('no distingue mayusculas', L.buscarPorCodigo('P-0001').id==='E');

console.log('\nEXACTO: nada de coincidencias parciales');
t('"320" NO agarra "000320"', L.buscarPorCodigo('320')===null);
t('"685" NO agarra "000685"', L.buscarPorCodigo('685')===null);
t('"1320" NO agarra "001320"', L.buscarPorCodigo('1320')===null);
t('"00068" NO agarra "000685"', L.buscarPorCodigo('00068')===null);
t('"779000123456" NO agarra el codigo de barras entero', L.buscarPorCodigo('779000123456')===null);
t('vacio no devuelve nada', L.buscarPorCodigo('')===null);
t('espacios solos tampoco', L.buscarPorCodigo('   ')===null);

console.log('\nCampos vacios no se emparejan entre si');
t('null no matchea con ""', L.coincidenciasCodigo('').length===0);
t('un producto sin codigoBarras no aparece por eso', !L.coincidenciasCodigo('000686').some(p=>p.id!=='B'));

console.log('\nAmbiguo: con dos o mas NO se elige, para no cobrar otra cosa');
const DOS=[{id:'X',nombre:'UNO',codigo:'111',codigoBarras:null},{id:'Y',nombre:'DOS',codigo:'111',codigoBarras:null}];
const L2=F(DOS);
t('dos productos con el mismo codigo -> no devuelve ninguno', L2.buscarPorCodigo('111')===null);
t('pero los reporta a los dos', L2.coincidenciasCodigo('111').length===2);
const CRUZ=[{id:'X',nombre:'UNO',codigo:'7790001234567',codigoBarras:null},
            {id:'Y',nombre:'DOS',codigo:'000001',codigoBarras:'7790001234567'}];
const L3=F(CRUZ);
t('el codigo interno de uno igual al de barras de otro tambien es ambiguo', L3.buscarPorCodigo('7790001234567')===null);
t('y se ven los dos', L3.coincidenciasCodigo('7790001234567').length===2);

console.log('\nSin catalogo cargado no explota');
t('allProducts undefined', F(undefined).buscarPorCodigo('000685')===null);
t('allProducts vacio', F([]).buscarPorCodigo('000685')===null);
t('allProducts que no es lista', F({}).coincidenciasCodigo('x').length===0);

console.log('\nUnicidad del codigo de BARRAS: solo mira ese campo');
t('encuentra al que ya lo tiene', L.productoConCodigoBarras('7790001234567',null).id==='A');
t('se excluye a si mismo al editar', L.productoConCodigoBarras('7790001234567','A')===null);
t('el codigo INTERNO no cuenta como codigo de barras repetido',
    L.productoConCodigoBarras('000685',null)===null);
t('vacio nunca es duplicado', L.productoConCodigoBarras('',null)===null);
t('null tampoco', L.productoConCodigoBarras(null,null)===null);

console.log('\nEl lector agrega x1 en el modal de venta, sin tocar la barra');
t('rutea al modal de venta', /_modalAbierto\('ventaModal'\)/.test(src));
t('y llama a addVentaItem', /_agregarYAvisar\(prod, addVentaItem/.test(src));
t('escucha en el documento, no en un campo', /document\.addEventListener\('keydown'/.test(src));
t('en fase de captura, para poder frenar el Enter', /\}, true\);/.test(src));
t('avisa cuando el codigo es ambiguo en vez de mandar a asignarlo',
    /varios\.length > 1/.test(src) && /Corrija el repetido/.test(src));

console.log('\nGuardar: no se puede repetir un codigo de barras');
t('existe validarCodigoBarras', /async function validarCodigoBarras\(/.test(admin));
const sp=cuerpoDe(admin,'saveProduct');
t('saveProduct la llama', /await validarCodigoBarras\(_codBarras, editingId\)/.test(sp));
t('y corta el guardado si da error', /if\(_errCB\)\{showAdminToast\(_errCB,'error'\)/.test(sp));
t('valida ANTES de escribir en la base',
    sp.indexOf('validarCodigoBarras') < sp.indexOf(".collection('productos')"));
const vcb=cuerpoDe(admin,'validarCodigoBarras');
t('mira en memoria y tambien contra la base',
    /allProducts \|\| \[\]/.test(vcb) && /where\('codigoBarras', '==', cod\)/.test(vcb));
t('se excluye a si mismo al editar', /p\.id !== idActual/.test(vcb));
t('vacio es valido: casi ningun producto tiene codigo de barras', /if \(!cod\) return '';/.test(vcb));

console.log('\nUN PRODUCTO QUE TODAVIA NO ESTA EN EL CATALOGO');
/* "Asignar" sirve cuando el producto YA existe y solo le falta el codigo. En el
   mostrador pasa seguido lo otro: llega mercaderia nueva y no esta cargada. Sin
   salida, el cajero quedaba trabado a mitad de una venta: la lista decia "Ningun
   producto con ese nombre" y el unico boton era Cancelar. */
t('el modal ofrece crear el producto', /onclick="crearProductoConCodigo\(\)"/.test(admin));
t('con un icono, no un emoji', /crearProductoConCodigo\(\)"><i class="bi bi-plus-lg"><\/i>/.test(admin));
const cpc=cuerpoDe(src,'crearProductoConCodigo');
t('cierra el de asignar antes de abrir la ficha', cpc.indexOf('closeAsignarCodigo()') < cpc.indexOf('openModal()'));
t('va a la seccion Productos, que es donde vive el formulario', /switchSection\('products'\)/.test(cpc));
t('deja el codigo de barras ya cargado', /campo\.value = cod/.test(cpc));
t('y sugiere un codigo interno libre', /sugerirCodigoProducto\(\)/.test(cpc));
t('pone el foco en el nombre, que es lo unico que falta escribir', /nom\.focus\(\)/.test(cpc));
t('y explica como sigue', /escanealo otra vez/.test(cpc));

console.log('\nCon "codigo desconocido" abierto no se sigue escaneando a ciegas');
/* El chequeo de ventaModal esta mas abajo y ese modal sigue abierto DETRAS: sin
   esta guarda la lectura siguiente entraba a la venta de atras mientras la pantalla
   mostraba el codigo viejo, y si despues elegia un producto le asignaba el ANTERIOR. */
t('la guarda existe', /_modalAbierto\('asignarCodigoModal'\)/.test(src));
/* Acotado a procesarCodigoLeido: _modalAbierto('ventaModal') tambien aparece en
   _ventaRapidaDestino, que esta antes en el archivo, y comparar posiciones sobre
   el archivo entero no probaria el orden que importa. */
const pcl=cuerpoDe(src,'procesarCodigoLeido');
t('la guarda esta dentro del ruteo', /_modalAbierto\('asignarCodigoModal'\)/.test(pcl));
t('y corta ANTES de rutear a la venta',
    pcl.indexOf("_modalAbierto('asignarCodigoModal')") < pcl.indexOf("_modalAbierto('ventaModal')"));
t('avisa por que no hizo nada', /Resolv/.test(src) && /qued/.test(src) && /pendiente/.test(src));

console.log('\nEl codigo que se sugiere tiene que poder imprimirse');
/* La etiqueta del local es un EAN-13 que lleva el codigo interno adentro: con
   letras no se puede codificar. Se sugeria 'P-####' y el catalogo real usa 6
   digitos en 1480 de 1484 productos; esos 4 con P- son justo los que NO pueden
   tener etiqueta. */
const sc=cuerpoDe(admin,'sugerirCodigoProducto');
t('ya no sugiere P-####', !/'P-' \+ String\(n\)/.test(sc));
t('sugiere solo digitos, con ceros adelante', /String\(n\)\.padStart\(6, '0'\)/.test(sc));
t('continua desde el mas alto que existe, no desde la cantidad de productos',
    /max = Math\.max\(max/.test(sc));
(function(){
  const g=new Function('allProducts',cuerpoDe(admin,'sugerirCodigoProducto')+'\nreturn sugerirCodigoProducto;');
  const s1=g([{codigo:'000684'},{codigo:'P-0002'}])();
  t('con 000684 cargado sugiere 000685', s1==='000685');
  t('y es codificable en un EAN-13', /^[0-9]{1,11}$/.test(s1));
  t('con el catalogo vacio arranca en 000001', g([])()==='000001');
  const g2=g([{codigo:'000010'}]);
  const res=new Set(); const dd=[];
  for(let i=0;i<3;i++){ const c=g2(res); res.add(c); dd.push(c); }
  t('tres seguidos no se repiten', new Set(dd).size===3);
  t('y siguen la serie', dd[0]==='000011'&&dd[1]==='000012'&&dd[2]==='000013');
})();

console.log('\n'+ok+' pasaron, '+fail+' fallaron');
process.exit(fail?1:0);
