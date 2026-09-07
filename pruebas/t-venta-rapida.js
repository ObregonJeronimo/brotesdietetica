/* VENTA RAPIDA: tocar V, escanear, y cerrar con DOBLE ENTER.

   El que atiende no tiene que soltar la pistola ni tocar el mouse: V abre la venta,
   se escanea todo, y dos Enter seguidos la registran. Un Enter solo no hace nada, a
   proposito.

   POR QUE DOS Y NO UNO. La pistola termina CADA lectura con un Enter. Cuando la
   rafaga se detecta ese Enter se traga y no llega al atajo; pero si un lector
   escribe mas lento que LECTOR_GAP_MAX, su Enter pasa por humano. Con un solo
   Enter, ese caso registraria la venta a mitad de carga —con la mitad de los
   productos y el stock descontado de menos—. Con dos seguidos no puede: entre
   lectura y lectura hay digitos, y cualquier tecla que no sea Enter corta la
   seguidilla. */
const fs=require('fs');
const lector=fs.readFileSync('admin-lector.js','utf8');
const atajos=fs.readFileSync('admin-atajos.js','utf8');

function cuerpo(txt,nombre){
    const i=txt.indexOf('function '+nombre+'(');
    if(i<0)throw new Error('no se encontro '+nombre);
    let b=txt.indexOf('{',i),prof=0,k;
    for(k=b;k<txt.length;k++){ if(txt[k]==='{')prof++; else if(txt[k]==='}'){prof--;if(!prof)break;} }
    return txt.slice(i,k+1);
}

let ok=0,fail=0;
const t=(d,c)=>{ if(c){ok++;console.log('  OK   '+d);} else {fail++;console.log('  FALLA '+d);} };

/* Un panel de mentira: modales que se abren y cierran, y las dos funciones de
   guardado espiadas. Se ejecuta el codigo REAL de admin-lector.js. */
function panel(opts){
    opts=opts||{};
    const abiertos=new Set(opts.modales||['ventaModal']);
    const estado={guardo:0, guardoMay:0, avisos:[]};
    const doc={
        querySelectorAll:sel=>{
            if(sel!=='.modal-overlay.show')return [];
            return [...abiertos].map(id=>({id}));
        },
        getElementById:id=>{
            if(id==='saveVentaBtn')return {disabled:!!opts.guardando};
            if(id==='saveVentaMayBtn')return {disabled:!!opts.guardando};
            return null;
        }
    };
    const ctx={
        document:doc,
        showAdminToast:(m,k)=>estado.avisos.push(k+': '+m),
        ventaItems:opts.items===undefined?[{id:'A',nombre:'X'}]:opts.items,
        ventaMayItems:opts.itemsMay===undefined?[{id:'A',nombre:'X'}]:opts.itemsMay,
        saveVenta:()=>{estado.guardo++;},
        saveVentaMay:()=>{estado.guardoMay++;},
        Date:Date
    };
    const f=new Function('document','showAdminToast','ventaItems','ventaMayItems','window',
        'function _modalAbierto(id){return document.querySelectorAll(".modal-overlay.show").some(m=>m.id===id);}\n'+
        cuerpo(lector,'_ventaRapidaDestino')+'\n'+cuerpo(lector,'_escribiendo')+'\n'+
        cuerpo(lector,'_hayOtroModalEncima')+'\n'+cuerpo(lector,'cerrarVentaRapida')+'\n'+
        'const VENTA_DOBLE_ENTER_MS='+ (lector.match(/VENTA_DOBLE_ENTER_MS\s*=\s*(\d+)/)||[,1000])[1] +';\n'+
        'let _enterUno=0;\n'+cuerpo(lector,'_enterHumano')+'\n'+
        'return {enter:_enterHumano, destino:_ventaRapidaDestino, escribiendo:_escribiendo, otroModal:_hayOtroModalEncima};');
    const api=f(doc,ctx.showAdminToast,ctx.ventaItems,ctx.ventaMayItems,ctx);
    api.estado=estado; api.abiertos=abiertos;
    return api;
}
const ev=tag=>({target:tag?{tagName:tag}:{}, preventDefault(){}});

console.log('\nUn Enter no hace nada; dos seguidos cierran');
let p=panel();
p.enter(ev()); t('el primer Enter no guarda', p.estado.guardo===0);
p.enter(ev()); t('el segundo, si', p.estado.guardo===1);
t('y no avisa nada raro', p.estado.avisos.length===0);

console.log('\nTres Enter no cierran dos veces');
p=panel();
p.enter(ev()); p.enter(ev()); p.enter(ev());
t('el tercero arranca una cuenta nueva, no guarda de nuevo', p.estado.guardo===1);
p.enter(ev());
t('el cuarto si cierra otra vez (son dos nuevos)', p.estado.guardo===2);

console.log('\nEl mismo atajo en la venta mayorista');
p=panel({modales:['ventaMayModal']});
p.enter(ev()); p.enter(ev());
t('cierra la mayorista', p.estado.guardoMay===1);
t('y no toca la venta comun', p.estado.guardo===0);

console.log('\nEscribiendo en un campo, Enter es del campo');
['INPUT','TEXTAREA','SELECT'].forEach(tag=>{
    const q=panel();
    q.enter(ev(tag)); q.enter(ev(tag));
    t('en un <'+tag.toLowerCase()+'> no cierra', q.estado.guardo===0);
});
t('_escribiendo reconoce contentEditable', panel().escribiendo({isContentEditable:true})===true);
t('y no se confunde con el body', panel().escribiendo({tagName:'BODY'})===false);
t('ni con un target sin tagName', panel().escribiendo({})===false);

console.log('\nCon otra ventana encima, el Enter es de esa');
p=panel({modales:['ventaModal','asignarCodigoModal']});
p.enter(ev()); p.enter(ev());
t('no cierra la venta que quedo atras', p.estado.guardo===0);
t('_hayOtroModalEncima lo detecta', p.otroModal('ventaModal')===true);
p=panel({modales:['ventaModal']});
t('y con una sola ventana dice que no', p.otroModal('ventaModal')===false);

console.log('\nSin ningun modal de venta abierto no hace nada');
p=panel({modales:['catManagerModal']});
p.enter(ev()); p.enter(ev());
t('no guarda', p.estado.guardo===0 && p.estado.guardoMay===0);
t('destino devuelve null', p.destino()===null);
p=panel({modales:[]});
p.enter(ev()); p.enter(ev());
t('sin ningun modal tampoco', p.estado.guardo===0);

console.log('\nSi falta algo, avisa QUE falta');
p=panel({items:[]});
p.enter(ev()); p.enter(ev());
t('venta sin productos: no guarda', p.estado.guardo===0);
t('y lo dice', /No hay productos en la venta/.test(p.estado.avisos.join(' ')));
p=panel({modales:['ventaMayModal'],itemsMay:[]});
p.enter(ev()); p.enter(ev());
t('la mayorista nombra su caso', /No hay productos en la venta mayorista/.test(p.estado.avisos.join(' ')));

console.log('\nMientras ya se esta guardando, no se guarda dos veces');
p=panel({guardando:true});
p.enter(ev()); p.enter(ev());
t('el boton deshabilitado corta el atajo', p.estado.guardo===0);
t('y no molesta con un aviso', p.estado.avisos.length===0);

console.log('\nEl Enter de la PISTOLA nunca cierra la venta');
t('al detectar la rafaga se resetea la cuenta', /_enterUno = 0;\s*\/\* el Enter de la pistola/.test(lector));
t('y solo el Enter humano llega al atajo', /\} else \{\s*\/\* Enter de una persona[\s\S]{0,120}_enterHumano\(e\);/.test(lector));
t('cualquier otra tecla corta la seguidilla', /_enterUno = 0;\s*\/\* cualquier otra tecla/.test(lector));

console.log('\nLa ventana de tiempo');
const ms=Number((lector.match(/VENTA_DOBLE_ENTER_MS\s*=\s*(\d+)/)||[])[1]);
t('esta definida', !!ms);
t('es corta, para que sean dos golpes seguidos (<= 1,5 s)', ms<=1500);
t('pero no imposible de acertar (>= 500 ms)', ms>=500);
t('el codigo compara contra esa ventana',
    /\(ahora - _enterUno\) > VENTA_DOBLE_ENTER_MS/.test(cuerpo(lector,'_enterHumano')));

console.log('\nEl atajo V sigue abriendo la venta');
t('V es el atajo por defecto', /nuevaVenta:\s*\{\s*def:'v'/.test(atajos));
t('y llama a openVentaModal', /case 'nuevaVenta':[\s\S]{0,120}openVentaModal\(\)/.test(atajos));
t('los atajos no se disparan con un modal abierto', /if \(_hayModal\(\)\) return;/.test(atajos));

console.log('\n'+ok+' pasaron, '+fail+' fallaron');
process.exit(fail?1:0);
