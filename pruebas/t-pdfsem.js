/* El PDF Semanal trabaja sobre UNA lista, la que el admin eligio como
   predeterminada en el modal del propio PDF.

   Antes el campo ausente contaba como true. Medido en produccion el 05/09: las 27
   listas TIENEN el campo escrito (3 en true, 24 en false, 0 ausentes), asi que el
   boton se veia en 3 y ese default no cambiaba nada ahi. Donde si cambiaba era en
   una instalacion nueva: setup-inicial.html creaba la primera lista sin el campo y
   el boton aparecia sin que nadie lo pidiera. Ahora que hay un lugar explicito para
   elegir la lista, ausente es que NO, y ningun camino crea listas sin la bandera.

   Lo que si estaba roto para todos era el modal: dejaba elegir "Todas las listas",
   y con esa opcion processWeeklyPdf comparaba el PDF de UN proveedor contra el
   catalogo entero y mandaba a ocultar todo lo de los otros 26. */
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

console.log('\nEl campo AUSENTE ya no cuenta como que si');
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

console.log('\nNingun camino crea listas sin la bandera');
const setup=fs.readFileSync('setup-inicial.html','utf8');
t('setup-inicial siembra la primera lista con pdfSemanal:false',
    /nombre:'PROVEEDOR PRINCIPAL', ?pdfSemanal:false/.test(setup));

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

console.log('\nEl boton se ve siempre; apagado si el filtro muestra otra lista (19/09)');
/* Esconderlo dejaba a la gente buscandolo, sobre todo desde que no se elige ninguna
   lista sola. Pero usarlo desde otra lista sigue prohibido: comparar el PDF de un
   proveedor contra el catalogo de otro manda a ocultar todo lo del otro. */
const motivo=new Function(cuerpo('listaUsaPdfSemanal')+cuerpo('motivoPdfSemanalApagado')+';return motivoPdfSemanalApagado;')();
const FRU={id:'l1',nombre:'FRUTICOR',pdfSemanal:true},OTRA={id:'l2',nombre:'REAL ESSENZE',pdfSemanal:false};
t('sin filtro se puede usar: trabaja sobre la marcada', motivo(null,FRU)==='');
t('con la marcada elegida en el filtro, tambien', motivo(FRU,FRU)==='');
t('con otra lista elegida queda apagado', motivo(OTRA,FRU)!=='');
t('  y el motivo nombra las dos listas', motivo(OTRA,FRU).indexOf('FRUTICOR')>0 && motivo(OTRA,FRU).indexOf('REAL ESSENZE')>0);
t('si todavia no hay ninguna marcada se puede entrar igual: la lista se elige adentro',
    motivo(OTRA,null)==='');
t('el boton ya no se esconde', /wrapSemanal\.style\.display=''/.test(src));
t('el motivo va tambien en el contenedor, que es quien muestra el globo con el boton apagado',
    /wrapSemanal\.title=globoSem/.test(src) && /#tbSemanalWrap button:disabled\{pointer-events:none\}/.test(src));

console.log('\nEl modal arranca en la lista que se esta viendo, y el desplegable manda');
const pintar=cuerpo('wpPintarLista');
t('el destino sale del filtro de Productos si hay uno', /getElementById\('filterLista'\)/.test(pintar));
t('  y si no, de la marcada', /\|\|listaPdfSemanal\(\)/.test(pintar));
t('el selector se abre con el destino actual', /const actual=\(document\.getElementById\('wpListaFiltro'\)\|\|\{\}\)\.value\|\|''/.test(cuerpo('wpMostrarSelector')));
t('elegir en el desplegable cambia el destino de esta pasada',
    /onchange="wpListaSeleccionCambio\(\)"/.test(src) && /hid\.value=l\?l\.id:''/.test(cuerpo('wpListaSeleccionCambio')));
t('  y la ayuda del modal lo dice', /Lo que elijas ac&aacute; vale para este PDF/.test(src));

console.log('\nAl entrar no queda ninguna lista elegida (pedido del comercio, 19/09)');
/* Antes loadListas dejaba activa la ultima usada y, si no habia, la PRIMERA por nombre.
   Productos abria mostrando un solo proveedor sin que nadie hubiera filtrado, y de yapa
   esa eleccion automatica decidia sobre que lista trabajaba el PDF Semanal: con el
   sandbox recien sembrado, el PDF se comparaba contra ANDNUTS mientras la pantalla
   mostraba FRUTICOR. */
const cargar=cuerpo('loadListas');
t('loadListas no toca el filtro de listas', cargar.indexOf('filterLista')<0);
t('  ni cae en la primera lista', cargar.indexOf('listasData[0]')<0);
t('el filtro tampoco se recuerda entre visitas', !src.includes('brotesListaActiva'));
t('pero filtrar a mano sigue andando', /function filtrarPorLista\(id\)\{[\s\S]{0,220}sel\.value=id/.test(src));
t('  y se puede volver a ver todo', /data-id=""[\s\S]{0,120}Quitar el filtro/.test(src));

console.log('\n'+ok+' pasaron, '+fail+' fallaron');
process.exit(fail?1:0);
