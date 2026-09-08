/* LA FICHA DEL PRODUCTO: agrupada, y con el codigo de barras a la vista.

   El formulario tenia veinte campos seguidos y solo la zona de precios estaba
   agrupada. La identificacion iba suelta, el STOCK estaba metido adentro de la
   seccion de precios -no es un precio-, y "Categoria" quedaba separada de "Lista
   (proveedor)" por dos textareas largos, cuando son la misma pregunta: donde va
   este producto.

   Ahora son seis grupos con titulo. Esta prueba cuida dos cosas distintas:
     1. que la reorganizacion no se haya comido ningun campo -es HTML movido de
        lugar, y perder un input se ve recien cuando alguien guarda y se entera de
        que el dato no estaba-;
     2. que el preview del codigo de barras use el MISMO generador que la
        impresion. Un simbolo mal codificado no se ve mal: sale un dibujo de
        barras perfectamente plausible que la pistola no engancha. */
const fs=require('fs');
const html=fs.readFileSync('admin.html','utf8');
const etq=fs.readFileSync('admin-etiquetas.js','utf8');

const i=html.indexOf('<form id="productForm"');
const form=html.slice(i, html.indexOf('</form>', i));

let ok=0,fail=0;
const t=(d,c)=>{ if(c){ok++;console.log('  OK   '+d);} else {fail++;console.log('  FALLA '+d);} };

console.log('\nNo se perdio ningun campo al reorganizar');
/* Los que el guardado lee. Si falta uno, saveProduct escribe undefined y el dato
   se pierde en silencio. */
['pCodigo','pNombre','pNombreMostrado','pGramaje','pCodigoBarras','pStock','pCosto',
 'pPorcentaje','pPrecio','pDescuento','pPrecioFinal','pPorcentajeMay','pPrecioMay',
 'pCategoria','pSubcategoria','pLista','pDescripcion','pValoresNutricionales',
 'pImagenesExtra','imgExtraFileInput','imgFileInput','prodImgCarousel','saveBtn']
  .forEach(id=>t('sigue estando #'+id, form.indexOf('id="'+id+'"')>0));

console.log('\nLos campos siguen siendo los mismos, no copias nuevas');
['pCodigo','pNombre','pStock','pCategoria','pLista','pCodigoBarras'].forEach(id=>{
  const n=(form.match(new RegExp('id="'+id+'"','g'))||[]).length;
  t('#'+id+' aparece una sola vez', n===1);
});
t('el formulario sigue guardando con saveProduct', /onsubmit="saveProduct\(event\)"/.test(form));
t('y el codigo sigue avisando si esta repetido', /oninput="_pintarEstadoCodigo\(\)/.test(form));

console.log('\nSeis grupos con titulo, en un orden que se sigue de arriba a abajo');
const titulos=(form.match(/class="precio-section-title"[^>]*>[\s\S]*?<\/div>/g)||[])
  .map(x=>x.replace(/<[^>]*>/g,'').replace(/&oacute;/g,'o').replace(/&aacute;/g,'a').replace(/&eacute;/g,'e').replace(/\s+/g,' ').trim());
t('hay 6 grupos (habia 3, y ninguno cubria la identificacion)', titulos.length===6);
[['Identificacion',0],['Como se vende y stock',1],['Costo y precio',2],
 ['Precio mayorista',3],['Donde va en el catalogo',4],['Lo que ve el cliente',5]]
 .forEach(([nom,pos])=>t(pos+1+'. '+nom, (titulos[pos]||'').indexOf(nom)>=0));
/* Un titulo por grupo: si un grupo quedara adentro de otro habria mas titulos
   que contenedores, y la pantalla mostraria dos encabezados pegados. Paso al
   reorganizar: "Precio minorista" quedo anidado dentro de "Costo y precio". */
t('hay un contenedor por titulo, ninguno anidado',
  (form.match(/class="precio-section"/g)||[]).length === titulos.length);

console.log('\nEl stock ya no vive adentro de los precios');
(function(){
  const iStock=form.indexOf('id="pStock"');
  const iVende=form.indexOf('Como se vende');
  const iCosto=form.indexOf('id="pCosto"');
  t('el stock esta antes que el costo', iStock>0 && iCosto>0 && iStock<iCosto);
})();

console.log('\nCategoria, subcategoria y lista quedaron juntas');
(function(){
  const a=form.indexOf('id="pCategoria"'), b=form.indexOf('id="pLista"'), d=form.indexOf('id="pDescripcion"');
  t('lista viene despues de categoria', a>0 && b>a);
  t('y las dos ANTES de la descripcion (antes estaban partidas por los textareas)', b<d);
})();

console.log('\nEl codigo de barras se ve antes de imprimir doscientos');
t('hay un lugar para el preview', form.indexOf('id="pBarrasWrap"')>0);
t('y para el dibujo', form.indexOf('id="pBarrasSvg"')>0);
t('con un aviso cuando el producto todavia no tiene codigo', form.indexOf('id="pBarrasVacio"')>0);
t('el boton de imprimir usa un icono, no un emoji', /<i class="bi bi-printer"><\/i>/.test(form));
t('y no hay ningun emoji en el bloque', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(
  form.slice(form.indexOf('id="pBarrasWrap"'), form.indexOf('id="pBarrasVacio"')+400)));
t('se redibuja al escribir el codigo', /refrescarBarrasProducto\(\)/.test(form));

console.log('\nEl preview usa el MISMO generador que la impresion');
t('refrescarBarrasProducto existe', /function refrescarBarrasProducto\(\)/.test(etq));
t('y dibuja con etiquetaBarrasSVG, no con un dibujo aparte', /etiquetaBarrasSVG\(ean, 12, 45\)/.test(etq));
t('el codigo sale de etiquetaCodigoDe, el mismo que lee la pistola', /const ean = etiquetaCodigoDe\(p\)/.test(etq));
t('no repite los digitos: el SVG ya los dibuja',
  !/etiquetaBarrasSVG\(ean[^;]*\+\s*'<div[^;]*ean/.test(etq));

console.log('\nImprimir una sola etiqueta');
const imp=etq.slice(etq.indexOf('function imprimirEtiquetaProducto'), etq.indexOf('function openEtiquetasModal'));
t('arma el documento con etiquetaDocumento, como la impresion en tanda', /etiquetaDocumento\(\[\{ producto: p, copias: 1 \}\]/.test(imp));
t('usa un formato termico', /etiquetaFormato\('ter-58x40'\)/.test(imp));
t('en modo continuo, para no hacer cortar la guillotina de mas', /continuo: true/.test(imp));
t('avisa si el producto no tiene codigo en vez de imprimir en blanco', /Ponele un codigo interno/.test(imp));
t('avisa si el navegador bloquea la ventana', /bloqueo la ventana de impresion/.test(imp));
t('y deja rastro en el historial', /logAction\('imprimir'/.test(imp));
t('las dos funciones quedan expuestas al panel',
  /window\.refrescarBarrasProducto = refrescarBarrasProducto/.test(etq) &&
  /window\.imprimirEtiquetaProducto = imprimirEtiquetaProducto/.test(etq));

console.log('\n'+ok+' pasaron, '+fail+' fallaron');
process.exit(fail?1:0);
