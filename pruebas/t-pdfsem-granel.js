/* EL PDF DEL PROVEEDOR COTIZA EL BULTO; BROTES GUARDA EL COSTO POR KILO.

   La planilla semanal vino de YERCO, donde no existe `tipoVenta` y todo se vende
   como viene, asi que tomaba el numero del PDF y lo escribia derecho en `costo`.
   Con los 873 de FRUTICOR-TODOS eso rompia: medido con un PDF que NO cambiaba ni un
   precio, marcaba 290 productos como "cambio de precio" -los 290 a granel, ninguno
   de los que van por unidad- y aplicarlo multiplicaba el precio de venta hasta x30
   (AVENA INSTANTANEA x 30 Kg: $2.003/kg -> $60.098/kg). 281 quedaban a mas del
   doble. Sin un solo error de consola: es la familia del x1000 de §5. */
const fs=require('fs');
const src=fs.readFileSync('admin.html','utf8');

function cuerpo(nombre){
    const i=src.indexOf('function '+nombre+'(');
    if(i<0)throw new Error('no se encontro '+nombre);
    let b=src.indexOf('{',i),prof=0,k;
    for(k=b;k<src.length;k++){ if(src[k]==='{')prof++; else if(src[k]==='}'){prof--;if(!prof)break;} }
    return src.slice(i,k+1);
}
const F=new Function(cuerpo('esPorPeso')+'\n'+cuerpo('bultoEnKilos')+'\n'+cuerpo('tipoVentaSegunNombre')+
    '\n'+cuerpo('costoDesdePdf')+'\n'+cuerpo('stockTexto')+
    '\nreturn {bultoEnKilos,tipoVentaSegunNombre,costoDesdePdf,stockTexto,esPorPeso};')();

let ok=0,fail=0;
const t=(d,c)=>{ if(c){ok++;console.log('  OK   '+d);} else {fail++;console.log('  FALLA '+d);} };
const peso=n=>({nombre:n,tipoVenta:'peso'});
const uni =n=>({nombre:n,tipoVenta:'unidad'});

console.log('\nCuanto pesa el bulto, leido del nombre');
t('x 5 Kg -> 5', F.bultoEnKilos('PERA WILLIAM\'S MEDIANAS x 5 Kg')===5);
t('x 1 kg -> 1', F.bultoEnKilos('NUEZ MARIPOSA -Blanca- x 1 kg')===1);
t('x 25 kg -> 25', F.bultoEnKilos('SALVADO DE AVENA x 25 kg')===25);
t('x 2,5 Kg -> 2.5 (coma decimal)', F.bultoEnKilos('MIJO PELADO x 2,5 Kg')===2.5);
t('x 3.5 Kg -> 3.5 (punto decimal)', F.bultoEnKilos('3 ARROYOS COPO NATURAL x 3.5 Kg')===3.5);
t('x 500 gr -> 0.5', F.bultoEnKilos('CANELA EN RAMA x 500 gr')===0.5);
t('x 250 gr -> 0.25', F.bultoEnKilos('ALMENDRA NON PAREILL x 250 gr')===0.25);
t('1 Kg sin la "x" tambien', F.bultoEnKilos('HARINA DE TRIGO SARRACENO s/ tacc 1 Kg')===1);
t('22.680 kg es 22,68 y no 22 toneladas', F.bultoEnKilos('X x 22.680 kg')===22.68);
t('toma el ULTIMO, que es el envase', F.bultoEnKilos('MIX 3 kg surtido x 5 Kg')===5);
console.log('  sin peso en el nombre -> null');
t('sin envase', F.bultoEnKilos('POLEN a granel')===null);
t('en cc no es peso', F.bultoEnKilos('ACEITE DE COCO x 200cc')===null);
t('en unidades tampoco', F.bultoEnKilos('ALFAJOR x 12u')===null);
t('nombre vacio', F.bultoEnKilos('')===null);
t('nombre ausente', F.bultoEnKilos(undefined)===null);

console.log('\nEL ARREGLO: el costo del PDF pasa a la unidad del producto');
t('granel x 5 Kg: el PDF dice $69.800 -> $13.960 el kilo',
    F.costoDesdePdf(peso('PERA WILLIAM\'S MEDIANAS x 5 Kg'),69800)===13960);
t('granel x 25 kg: $53.500 -> $2.140 el kilo',
    F.costoDesdePdf(peso('SALVADO DE AVENA x 25 kg'),53500)===2140);
t('granel x 30 Kg: el peor caso medido, $44.517 -> $1.484',
    F.costoDesdePdf(peso('AVENA INSTANTANEA tres arroyos x 30 Kg'),44517)===1484);
t('granel x 1 kg: no cambia, ya es el kilo',
    F.costoDesdePdf(peso('ARVEJA ENTERA x 1 Kg'),1400)===1400);
t('granel x 500 gr: $37.500 el paquete -> $75.000 el kilo (SUBE, y esta bien)',
    F.costoDesdePdf(peso('CANELA EN RAMA x 500 gr'),37500)===75000);
t('por unidad: no se toca',
    F.costoDesdePdf(uni('GALLETA ARROZ BAÑADA CHOCOLATE x 88 gr'),2700)===2700);
t('por unidad aunque diga kg en el nombre',
    F.costoDesdePdf(uni('ALFAJOR x 1 Kg caja'),5000)===5000);

console.log('\nSin el arreglo, esto era lo que rompia (regresion)');
t('el costo del bulto NO se escribe como si fuera el del kilo',
    F.costoDesdePdf(peso('AVENA INSTANTANEA tres arroyos x 30 Kg'),44517)!==44517);
t('un granel de 25 kg no queda 25 veces mas caro',
    F.costoDesdePdf(peso('FLOR DE HIBISCUS x 25 kg'),306813)===12273);

console.log('\nSi NO se puede convertir, no se toca nada (devuelve null)');
t('granel sin peso en el nombre -> null', F.costoDesdePdf(peso('POLEN a granel'),61500)===null);
t('granel medido en cc -> null', F.costoDesdePdf(peso('ACEITE x 200cc'),10200)===null);
t('null es distinto de 0: 0 seria un costo, null es "no se pudo"',
    F.costoDesdePdf(peso('POLEN a granel'),61500)!==0);

console.log('\nbultoKg guardado en el producto le gana al nombre');
t('usa bultoKg si esta',
    F.costoDesdePdf({nombre:'MIX FRUT. SECOS CLASICO x 2,5',tipoVenta:'peso',bultoKg:2.5},39300)===15720);
t('un bultoKg invalido no rompe: cae al nombre',
    F.costoDesdePdf({nombre:'GARBANZO x 5 Kg',tipoVenta:'peso',bultoKg:0},8500)===1700);

console.log('\ntipoVenta de un producto NUEVO que trae el PDF');
t('en kilos -> peso', F.tipoVentaSegunNombre('GARBANZO x 5 Kg')==='peso');
t('en gramos -> unidad', F.tipoVentaSegunNombre('CANELA EN RAMA x 500 gr')==='unidad');
t('en cc -> unidad', F.tipoVentaSegunNombre('ACEITE DE COCO x 200cc')==='unidad');
t('en unidades -> unidad', F.tipoVentaSegunNombre('ALFAJOR x 12u')==='unidad');
t('sin envase -> unidad (lo conservador)', F.tipoVentaSegunNombre('POLEN')==='unidad');

console.log('\nComo se ESCRIBE un stock (era lo que hacia dudar del 40000)');
t('40000 g de un bulto de 4 kg -> "40 kg"', F.stockTexto({tipoVenta:'peso',stock:40000})==='40 kg');
t('11000 -> "11 kg"', F.stockTexto({tipoVenta:'peso',stock:11000})==='11 kg');
t('37500 -> "37,5 kg"', F.stockTexto({tipoVenta:'peso',stock:37500})==='37,5 kg');
t('800 g se dice en gramos', F.stockTexto({tipoVenta:'peso',stock:800})==='800 g');
t('1000 justo -> "1 kg"', F.stockTexto({tipoVenta:'peso',stock:1000})==='1 kg');
t('0 a granel -> "0 g"', F.stockTexto({tipoVenta:'peso',stock:0})==='0 g');
t('por unidad -> "10 u"', F.stockTexto({tipoVenta:'unidad',stock:10})==='10 u');
t('sin tipoVenta se trata como unidad', F.stockTexto({stock:7})==='7 u');
t('nunca devuelve el numero pelado', !/^\d+$/.test(F.stockTexto({tipoVenta:'peso',stock:40000})));

console.log('\nContrato con el resto del panel');
t('la comparacion de costos usa costoDesdePdf',
    /const newCost=costoDesdePdf\(bdd,pp\.precio\)/.test(src));
t('y si da null, no toca el producto',
    /if\(newCost===null\)\{wpSinConvertir\.push/.test(src));
t('los que vuelven al PDF tambien convierten',
    /const _c=costoDesdePdf\(p,pp\.precio\)/.test(src));
t('ya no queda ningun Math.round\(pp.precio\) escribiendo costo directo',
    !/const newCost=Math\.round\(pp\.precio\)/.test(src));
t('los productos NUEVOS se crean con codigo', /prods\.push\(\{nombre:_nom,codigo:_cod/.test(src));
t('los productos NUEVOS se crean con tipoVenta', /codigo:_cod,tipoVenta:_tv/.test(src));
t('el costo de los nuevos a granel tambien se convierte',
    /const costo=_kg\?Math\.round\(wpNewProds\[i\]\.costo\/_kg\):wpNewProds\[i\]\.costo/.test(src));
t('el stock de los nuevos a granel pasa a gramos',
    /const _stock=_kg\?Math\.round\(stock\*_kg\*1000\):stock/.test(src));
t('los codigos de una misma tanda no se repiten',
    /const _cod=sugerirCodigoProducto\(_reservados\);_reservados\.add\(_cod\)/.test(src));
t('sugerirCodigoProducto acepta reservados', /function sugerirCodigoProducto\(reservados\)/.test(src));
t('hay aviso en pantalla para los que no se pudieron convertir',
    src.includes('id="wpAvisoConversion"')&&/function renderWpAvisoConversion\(\)/.test(src));
t('stockTexto se usa en la tabla de productos', /stock-badge '\+sc\+'" title=/.test(src));

console.log('\nCodigos: uno por producto en la misma tanda');
const gen=new Function('allProducts',cuerpo('normCodigo')+'\n'+cuerpo('sugerirCodigoProducto')+'\nreturn sugerirCodigoProducto;');
const sug=gen([{codigo:'P-0001'},{codigo:'P-0002'}]);
const res=new Set(); const dados=[];
for(let i=0;i<5;i++){ const c=sug(res); res.add(c); dados.push(c); }
t('cinco altas seguidas dan cinco codigos distintos', new Set(dados).size===5);
t('ninguno pisa los que ya existian', !dados.some(c=>c==='P-0001'||c==='P-0002'));
t('sin reservados sigue andando como antes', typeof sug()==='string');

console.log('\nEl PDF paso de A4 a A5: el corte de columna se calcula POR PAGINA');
/* En 07/2026 el proveedor paso el PDF de A4 (595pt de ancho) a A5 (420pt). Con el 280
   fijo, el nombre de la columna derecha (x=212 en A5) caia del lado izquierdo, se
   rompia el apareo nombre/precio y se leian 10 productos de 661. YERCO ya lo tenia
   arreglado; Brotes se habia quedado con la constante vieja. */
t('COL_SPLIT ya no es la constante 280', !/const COL_SPLIT=280/.test(src));
t('se calcula del ancho real de la pagina',
    /const COL_SPLIT=page\.getViewport\(\{scale:1\}\)\.width\*\(280\/595\)/.test(src));
t('y adentro del bucle de paginas, no una sola vez',
    src.indexOf('for(let p=1;p<=pdf.numPages;p++)') < src.indexOf('const COL_SPLIT=page.getViewport'));
(function(){
  const corte=w=>w*(280/595);
  t('en A4 (595pt) el corte sigue dando 280', Math.round(corte(595))===280);
  t('en A5 (420pt) da 198, no 280', Math.round(corte(420))===198);
  t('un nombre en x=212 cae en la columna DERECHA en A5', 212>=corte(420));
  t('con el valor viejo caia en la izquierda: ese era el bug', !(212>=280));
})();

console.log('\nNo puede quedar un callejon sin salida para elegir la lista');
/* La lista se elige adentro del modal, y al modal se entra por el boton. Si el boton
   solo saliera con una lista ya elegida, sin ninguna no habria forma de entrar. Paso:
   la migracion creo FRUTICOR-TODOS con pdfSemanal:false y el boton no aparecia. */
t('el boton tambien sale si todavia no hay ninguna lista elegida',
    /listaUsaPdfSemanal\(listaSel\)\|\|\(!!listaSel&&!listaPdfSemanal\(\)\)/.test(src));

console.log('\n"Volvieron al PDF" no puede tocar otras listas');
t('filtra por la lista del PDF, como las otras tres secciones',
    /wpReappeared=\[\];allProducts\.filter\(p=>!wpListaId\|\|p\.lista===wpListaId\)/.test(src));

console.log('\n'+ok+' pasaron, '+fail+' fallaron');
process.exit(fail?1:0);
