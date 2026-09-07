/* El mapeo de categorias de YERCO a las de Brotes (migracion/categorias.js).

   Las 30 categorias de Brotes son las del NEGOCIO. Las 17 de YERCO son de otro
   comercio. Si se copian tal cual, el cliente termina viendo 47 categorias con
   conceptos pisados: "FRUTAS SECAS" al lado de "Frutas secas y desecadas".

   Medido contra los 47 productos que el dueño ya habia categorizado a mano:
   mapear por categoria sola acierta 68%, por (categoria, subcategoria) 74%, y
   sumando la capa de palabras 94%. */
const { categoriaBrotes, MAPA } = require('../migracion/categorias.js');

let ok = 0, fail = 0;
const t = (d, c) => { if (c) { ok++; console.log('  OK   ' + d); } else { fail++; console.log('  FALLA ' + d); } };
const C = (nombre, categoria, subcategoria) => categoriaBrotes({ nombre, categoria, subcategoria });

/* Las 30 del negocio, tal como estan en la base. Nada puede caer afuera. */
const CATS_BROTES = ['Aceites','Bazar y decoracion','Bebidas','Cereales y copos','Congelados',
 'Conservas y dulces','Cremas corporales','Endulzantes','Esencias y saborizantes','Especias y condimentos',
 'Frescos','Frutas secas y desecadas','Frutos secos','Galletas y snacks','General','Golosinas',
 'Harinas y feculas','Higiene personal','Infusiones y hierbas','Lacteos y bebidas vegetales',
 'Legumbres y cereales','Mascotas','Panificados','Panificados sin TACC','Pastas y fideos',
 'Reposteria','Semillas','Suplementos','Untables','Viandas y comidas listas'];

console.log('\nNunca inventa una categoria que Brotes no tenga');
Object.values(MAPA).forEach(v => { if (CATS_BROTES.indexOf(v) < 0) t('la tabla devuelve "' + v + '", que no existe', false); });
t('los ' + Object.keys(MAPA).length + ' destinos de la tabla existen en Brotes',
    Object.values(MAPA).every(v => CATS_BROTES.indexOf(v) >= 0));
t('una categoria desconocida cae en General', CATS_BROTES.indexOf(C('X', 'LO QUE SEA', '')) >= 0 && C('X', 'LO QUE SEA', '') === 'General');
t('una subcategoria nueva cae a la categoria sola', C('X', 'SEMILLAS', 'SUBCATEGORIA QUE NO EXISTE') === 'Semillas');
t('sin categoria -> General', C('X', '', '') === 'General');

console.log('\nLas que mapean derecho');
t('ACEITES -> Aceites', C('ACEITE DE GIRASOL x 1 Kg', 'ACEITES', '') === 'Aceites');
t('CONDIMENTOS -> Especias y condimentos', C('AJI MOLIDO x 1 Kg', 'CONDIMENTOS', '') === 'Especias y condimentos');
t('SEMILLAS -> Semillas', C('SEMILLA DE CHIA x 1 Kg', 'SEMILLAS', '') === 'Semillas');
t('LEGUMBRES -> Legumbres y cereales', C('GARBANZO x 5 Kg', 'LEGUMBRES', '') === 'Legumbres y cereales');
t('ARROZ -> Legumbres y cereales (como lo hizo el)', C('ARROZ YAMANI x 1 kg', 'ARROZ', '') === 'Legumbres y cereales');
t('FIDEOS Y PREMEZCLAS -> Pastas y fideos', C('FIDEOS DE ARROZ', 'FIDEOS Y PREMEZCLAS', '') === 'Pastas y fideos');

console.log('\n"Frutas secas" del rubro son los FRUTOS SECOS, y Brotes los separa');
t('FRUTAS SECAS -> Frutos secos', C('NUEZ MARIPOSA x 1 kg', 'FRUTAS SECAS', 'NUECES') === 'Frutos secos');
t('MIX DE FRUTOS SECOS -> Frutos secos', C('MIX CLASICO x 1 kg', 'MIX DE FRUTOS SECOS', '') === 'Frutos secos');
t('FRUTAS DESECADAS -> Frutas secas y desecadas', C('PERA WILLIAMS x 5 Kg', 'FRUTAS DESECADAS', '') === 'Frutas secas y desecadas');
t('FRUTAS TROPICALES -> Frutas secas y desecadas', C('MANGO DESHIDRATADO', 'FRUTAS TROPICALES', '') === 'Frutas secas y desecadas');

console.log('\nLa subcategoria desambigua lo que la categoria sola no (CEREALES se parte)');
t('CEREALES/INFLADOS -> Cereales y copos', C('ARROZ INFLADO x 1 Kg', 'CEREALES', 'INFLADOS') === 'Cereales y copos');
t('CEREALES/AVENAS -> Cereales y copos', C('AVENA INSTANTANEA x 5 Kg', 'CEREALES', 'AVENAS') === 'Cereales y copos');
t('CEREALES/BARRITAS -> Golosinas', C('BARRITA CEREAL', 'CEREALES', 'BARRITAS') === 'Golosinas');

console.log('\nREGIONALES Y OTROS parecia un cajon y adentro tenia todo separado');
t('/ENDULZANTES -> Endulzantes', C('X', 'REGIONALES Y OTROS', 'ENDULZANTES') === 'Endulzantes');
t('/MIEL -> Endulzantes', C('MIEL PURA x 1 Kg', 'REGIONALES Y OTROS', 'MIEL') === 'Endulzantes');
t('/LECHES VEGETALES COCOON -> Lacteos y bebidas vegetales', C('X', 'REGIONALES Y OTROS', 'LECHES VEGETALES COCOON') === 'Lacteos y bebidas vegetales');
t('/BEBIDAS PROBIOTICAS -> Bebidas', C('X', 'REGIONALES Y OTROS', 'BEBIDAS PROBIOTICAS') === 'Bebidas');
t('/PASTA DE MANI -> Untables', C('X', 'REGIONALES Y OTROS', 'PASTA DE MANI') === 'Untables');
t('/GALLETAS-TOSTADAS-ALFAJORES -> Galletas y snacks o Golosinas',
    ['Galletas y snacks','Golosinas'].indexOf(C('TOSTADAS DE ARROZ', 'REGIONALES Y OTROS', 'GALLETAS- TOSTADAS- ALFAJORES')) >= 0);
t('sin subcategoria -> General', C('POLEN x 1Kg', 'REGIONALES Y OTROS', '') === 'General');

console.log('\nLa capa de palabras: el nombre manda sobre la subcategoria');
t('AZUCAR DE COCO (esta en REPOSTERIA) -> Endulzantes', C('AZUCAR DE COCO x 1 Kg', 'REPOSTERIA', '') === 'Endulzantes');
t('BALAJU AZUCAR ORGANICA MASCABO -> Endulzantes', C('BALAJU AZUCAR ORGANICA MASCABO x 5 kg', 'REPOSTERIA', '') === 'Endulzantes');
t('ESENCIA DE VAINILLA -> Esencias y saborizantes', C('ESENCIA DE VAINILLA sin tacc x 110cc', 'REPOSTERIA', '') === 'Esencias y saborizantes');
t('AGUA DE AZAHAR -> Esencias y saborizantes', C('AGUA DE AZAHAR sin tacc x 110 ml', 'REPOSTERIA', '') === 'Esencias y saborizantes');
t('ALMENDRA BAÑADA CON CHOCOLATE -> Golosinas', C('ALMENDRA BAÑADA CON CHOCOLATE x 500 gr', 'REPOSTERIA', 'CHOCOLART') === 'Golosinas');
t('ALFAJOR -> Golosinas', C('4:8 ALFAJOR NEGRO c/dul leche', 'REGIONALES Y OTROS', 'GALLETAS- TOSTADAS- ALFAJORES') === 'Golosinas');
t('DULCE DE LECHE -> Conservas y dulces', C('DULCE DE LECHE sin tacc x 450g', 'REGIONALES Y OTROS', 'PRODUCTOS CACHAFAZ') === 'Conservas y dulces');

console.log('\nLA TRAMPA DEL AZUCAR: "sin azucar" y "c/stevia" son DESCRIPTORES, no el producto');
console.log('  (la primera version movia 40 fichas de lugar por esto)');
t('MERMELADA C/STEVIA sigue en Conservas y dulces',
    C('MERMELADA DE ARANDANO C/STEVIA x 330 gr', 'REGIONALES Y OTROS', 'MERMELADAS LA TRANQUILINA') === 'Conservas y dulces');
t('LECHE DE ALMENDRA sin azucar sigue en Lacteos y bebidas vegetales',
    C('COCOON LECHE DE almendra sin azucar x 1L', 'REGIONALES Y OTROS', 'LECHES VEGETALES COCOON') === 'Lacteos y bebidas vegetales');
t('TUTUCAS CON AZUCAR sigue en Cereales y copos',
    C('TUTUCAS CON AZUCAR x 1 kg', 'CEREALES', 'INFLADOS') === 'Cereales y copos');
t('GRANOLA LIGHT (s/miel s/azucar) sigue en Cereales y copos',
    C('GRANOLA LIGHT (s/miel s/azucar) x 1 Kg', 'CEREALES', 'GRANOLAS') === 'Cereales y copos');
t('TABLETA S/AZUCAR 55% CACAO no es un endulzante',
    C('TABLETA S/AZUCAR 55% CACAO 10u x 100gr', 'REPOSTERIA', 'CHOCOLART') !== 'Endulzantes');
t('BARRITAS MUECAS sin azucar no es un endulzante',
    C('BARRITAS MUECAS sin azucar x 16u', 'CEREALES', 'BARRITAS') !== 'Endulzantes');
t('QUINOA POP -SIN AZUCAR- sigue en Cereales y copos',
    C('QUINOA POP yin yang -SIN AZUCAR- x 3 Kg', 'CEREALES', 'INFLADOS') === 'Cereales y copos');
t('SALUTARIS FREE s/azucar sigue en Suplementos',
    C('SALUTARIS FREE s/azucar x 30 sobres', 'SUPLEMENTOS NATURALES', 'SALUTARIS / INCAICO') === 'Suplementos');
t('stevia sola no manda a Endulzantes',
    C('#70% STEVIA - CHOCOLATE ALT. CACAO x 1K', 'REPOSTERIA', '') !== 'Endulzantes');

console.log('\nMayusculas y tildes no cambian el resultado');
t('minusculas', C('azucar de coco x 1 kg', 'REPOSTERIA', '') === 'Endulzantes');
t('con tilde', C('AZÚCAR DE COCO x 1 Kg', 'REPOSTERIA', '') === 'Endulzantes');
t('BAÑADA con tilde', C('NARANJA BAÑADA C/CHOCOLATE x 500gr', 'REPOSTERIA', '') === 'Golosinas');

console.log('\nBordes');
t('sin nombre no explota', typeof C(undefined, 'SEMILLAS', '') === 'string');
t('todo vacio -> General', C('', '', '') === 'General');
t('nulls -> General', categoriaBrotes({}) === 'General');

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
