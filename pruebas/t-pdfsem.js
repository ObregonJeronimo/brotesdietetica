/* El PDF Semanal trabaja sobre UNA lista, la que el admin eligio como
   predeterminada en el modal del propio PDF.

   Antes el campo ausente contaba como true. El efecto medido en produccion era el
   contrario del buscado: de las 27 listas solo 3 traian el campo, asi que el boton
   se veia en las 27 y el modal dejaba elegir "Todas las listas" -que comparaba el
   PDF de un proveedor contra el catalogo entero y mandaba a ocultar todo lo de los
   otros 26-. */
const fs=require('fs');
const src=fs.readFileSync('admin.html','utf8');

function cuerpo(nombre){
    const i=src.indexOf('function '+nombre+'(');
    if(i<0)throw new Error('no se encontro '+nombre);
    let b=src.indexOf('{',i),prof=0,k;
    for(k=b;k<src.length;k++){ if(src[k]==='{')prof++; else if(src[k]==='}'){prof--;if(!prof)break;} }
    return src.slice(i,k+1);
}
eval(cuerpo('listaUsaPdfSemanal')+'\nglobal.F=listaUsaPdfSemanal;');
eval(cuerpo('listaPdfSemanal')+'\nglobal.P=listaPdfSemanal;');

let ok=0,fail=0;
const t=(d,c)=>{ if(c){ok++;console.log('  OK   '+d);} else {fail++;console.log('  FALLA '+d);} };

console.log('\nQue lista muestra el boton');
t('la elegida (pdfSemanal:true) -> se muestra', F({nombre:'FRUTICOR',pdfSemanal:true})===true);
t('cualquier otra (false) -> NO se muestra', F({nombre:'X',pdfSemanal:false})===false);
t('sin lista seleccionada -> no se muestra', F(null)===false);

console.log('\nEl campo AUSENTE ya no cuenta como que si (era el bug de las 27 listas)');
t('sin el campo -> NO se muestra', F({nombre:'FRUTICOR'})===false);
t('undefined explicito -> NO se muestra', F({nombre:'X',pdfSemanal:undefined})===false);
t('null -> NO se muestra', F({nombre:'X',pdfSemanal:null})===false);

console.log('\nNo depende del nombre (YERCO lo tiene clavado a "FRUTICOR"; aca no)');
t('una lista llamada FRUTICOR sin la bandera no se muestra', F({nombre:'FRUTICOR'})===false);
t('una lista con otro nombre y la bandera SI se muestra', F({nombre:'LA HUERTA',pdfSemanal:true})===true);
t('renombrarla no le saca el boton', F({nombre:'PROVEEDOR NUEVO',pdfSemanal:true})===true);

console.log('\nValores raros no prenden el boton');
[0,1,'','true','si',[],{}].forEach(v=>
    t('pdfSemanal='+JSON.stringify(v)+' -> no se muestra', F({nombre:'X',pdfSemanal:v})===false));

console.log('\nlistaPdfSemanal(): cual es la predeterminada');
global.listasData=[{id:'a',nombre:'UNO',pdfSemanal:false},{id:'b',nombre:'DOS',pdfSemanal:true},{id:'c',nombre:'TRES'}];
t('devuelve la unica prendida', P() && P().id==='b');
global.listasData=[{id:'a',nombre:'UNO'},{id:'c',nombre:'TRES',pdfSemanal:false}];
t('ninguna prendida -> null', P()===null);
global.listasData=[];
t('sin listas -> null', P()===null);
global.listasData=undefined;
t('listasData sin cargar todavia -> null, no explota', P()===null);

console.log('\nCoherencia entre las dos');
global.listasData=[{id:'a',nombre:'UNO',pdfSemanal:false},{id:'b',nombre:'DOS',pdfSemanal:true}];
t('la que devuelve listaPdfSemanal es la que muestra el boton', F(P())===true);
t('la otra no lo muestra', F(listasData[0])===false);

console.log('\nContrato con el resto del panel (que el HTML siga teniendo lo que el JS toca)');
[['wpListaFiltro','input hidden que leen processWeeklyPdf y wpAddNewProds'],
 ['wpListaNombre','rotulo de la lista fija, como YERCO'],
 ['wpListaSelect','selector para elegir la predeterminada'],
 ['wpListaFija','bloque del rotulo'],
 ['wpListaElegir','bloque del selector'],
 ['wpCancelarBtn','cancelar, se esconde si no hay lista elegida'],
 ['wpGuardarListaBtn','boton de guardar']].forEach(([id,q])=>
    t('existe #'+id+' ('+q+')', src.includes('id="'+id+'"')));

t('wpListaFiltro es hidden, no un select', /<input type="hidden" id="wpListaFiltro">/.test(src));
/* Acotado al modal del PDF: "Todas las listas" sigue siendo legitimo en el filtro de
   Productos, en el de exportar y en el de reasignar lista. El que no puede volver es
   el de este modal, que era el que analizaba el PDF contra el catalogo entero. */
const modalWp=src.slice(src.indexOf('id="weeklyPdfModal"'),src.indexOf('id="crearListaModal"'));
t('el modal del PDF ya no ofrece "Todas las listas"', !modalWp.includes('Todas las listas'));
t('y no quedo ningun <select> con name wpListaFiltro', !/<select[^>]*id="wpListaFiltro"/.test(src));
t('el drop pide lista antes de procesar', /if\(!wpListaElegida\(\)\)return;/.test(src));
t('el click en la zona tambien la pide', /dz\.addEventListener\('click',\(\)=>\{if\(!wpListaElegida\(\)\)return;/.test(src));
t('el input de archivo tambien la pide', /fi\.addEventListener\('change',e=>\{if\(!wpListaElegida\(\)\)\{fi\.value='';return;\}/.test(src));

/* Se vio abriendo la pagina, no en las pruebas: el rotulo trae display:flex en su
   style inline, y volverlo visible con '' no lo devuelve a flex, lo BORRA. El div
   caia a block y perdia el gap y el centrado, sin error de consola. §5: "una clase o
   variable CSS que no existe no da ningun error" — esto es la misma familia. */
console.log('\nMostrar y ocultar no puede perder el display del inline style');
t('wpOcultarSelector devuelve el rotulo a flex, no a ""', /fija\.style\.display='flex'/.test(cuerpo('wpOcultarSelector')));
t('wpMostrarSelector pone el selector en block explicito', /elegir\.style\.display='block'/.test(cuerpo('wpMostrarSelector')));
t('el rotulo declara display:flex en el HTML', /id="wpListaFija" style="display:flex/.test(src));

console.log('\nLa casilla vieja del modal de listas ya no esta (un solo control)');
t('no queda el checkbox crearListaPdfSemanal', !src.includes('crearListaPdfSemanal'));
t('guardarLista NO escribe pdfSemanal al editar', /update\(\{nombre\}\)/.test(cuerpo('guardarLista')));
t('guardarLista deja las listas nuevas en false', /add\(\{nombre,pdfSemanal:false\}\)/.test(cuerpo('guardarLista')));

console.log('\nLa eleccion es EXCLUYENTE');
const g=cuerpo('wpGuardarListaPredeterminada');
t('prende la elegida', /batch\.update\(db\.collection\('listas'\)\.doc\(id\),\{pdfSemanal:true\}\)/.test(g));
t('apaga las otras que estuvieran prendidas', /apagar\.forEach\(l=>batch\.update\(.*\{pdfSemanal:false\}\)\)/.test(g));
t('solo toca las que cambian', /l\.id!==id&&l\.pdfSemanal===true/.test(g));
t('escribe en un solo batch', (g.match(/db\.batch\(\)/g)||[]).length===1);
t('redibuja la barra despues de guardar', /filterTable\(\);/.test(g));
t('deja rastro en el historial', /logAction\('editar','PDF Semanal: lista predeterminada/.test(g));

console.log('\n'+ok+' pasaron, '+fail+' fallaron');
process.exit(fail?1:0);
