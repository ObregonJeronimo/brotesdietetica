/* De las categorias de YERCO a las de Brotes.

   Las 30 categorias de Brotes son las del NEGOCIO, las que ya usaba antes de que
   entrara este sistema. Las 17 de YERCO son de otro comercio. La tienda es la de
   Brotes, asi que el filtro que ve el cliente tiene que quedar con las 30 suyas: si
   se copian las de YERCO tal cual, el cliente ve 47 categorias con conceptos pisados
   ("FRUTAS SECAS" al lado de "Frutas secas y desecadas").

   El mapeo va a nivel (categoria, SUBCATEGORIA), no de categoria sola, y eso no es
   un capricho: medido contra los 47 productos que el dueño ya categorizo a mano, el
   mapeo por categoria sola acierta 68%, porque el parte CEREALES entre "Cereales y
   copos" y "Golosinas", y REPOSTERIA en cuatro. Las subcategorias de YERCO son
   justamente lo que desambigua: BARRITAS es Golosinas, INFLADOS y AVENAS son
   Cereales y copos, y REGIONALES Y OTROS -que parecia un cajon de sastre- adentro
   trae ENDULZANTES, MERMELADAS, LECHES VEGETALES, MIEL y PASTA DE MANI, que tienen
   cada una su categoria propia en Brotes. */

const MAPA = {
  'ACEITES|': 'Aceites',
  'ARROZ|': 'Legumbres y cereales',

  'CEREALES|AVENAS': 'Cereales y copos',
  'CEREALES|BARRITAS': 'Golosinas',
  'CEREALES|CEREALES LINEA 3 ARROYOS': 'Cereales y copos',
  'CEREALES|CEREALES LINEA LASFOR': 'Cereales y copos',
  'CEREALES|CEREALES LINEA NUTRIFOOD': 'Cereales y copos',
  'CEREALES|GRANOLAS': 'Cereales y copos',
  'CEREALES|INFLADOS': 'Cereales y copos',
  'CEREALES|': 'Cereales y copos',

  'CONDIMENTOS|': 'Especias y condimentos',
  'FIDEOS Y PREMEZCLAS|': 'Pastas y fideos',

  'FRUTAS DESECADAS|': 'Frutas secas y desecadas',
  'FRUTAS TROPICALES|': 'Frutas secas y desecadas',

  /* "Frutas secas" en la jerga del rubro son los frutos secos -almendra, nuez,
     mani-, y Brotes los tiene separados de las desecadas. Las subcategorias de
     YERCO lo confirman: ALMENDRAS, MANIES, NUECES. */
  'FRUTAS SECAS|': 'Frutos secos',
  'FRUTAS SECAS|ALMENDRAS': 'Frutos secos',
  'FRUTAS SECAS|MANÍES': 'Frutos secos',
  'FRUTAS SECAS|NUECES': 'Frutos secos',
  'MIX DE FRUTOS SECOS|': 'Frutos secos',

  'HARINAS, FECULAS Y TEXTU.|': 'Harinas y feculas',
  'HARINAS, FECULAS Y TEXTU.|HARINAS DE TRIGO': 'Harinas y feculas',
  'LEGUMBRES|': 'Legumbres y cereales',

  'REGIONALES Y OTROS|BEBIDAS PROBIOTICAS': 'Bebidas',
  'REGIONALES Y OTROS|ENDULZANTES': 'Endulzantes',
  'REGIONALES Y OTROS|MIEL': 'Endulzantes',
  'REGIONALES Y OTROS|GALLETAS- TOSTADAS- ALFAJORES': 'Galletas y snacks',
  'REGIONALES Y OTROS|LECHES VEGETALES COCOON': 'Lacteos y bebidas vegetales',
  'REGIONALES Y OTROS|MERMELADAS LA TRANQUILINA': 'Conservas y dulces',
  'REGIONALES Y OTROS|MERM. Y D. DE LECHE KONY': 'Conservas y dulces',
  'REGIONALES Y OTROS|PASTA DE MANI': 'Untables',
  'REGIONALES Y OTROS|PRODUCTOS CACHAFAZ': 'Golosinas',
  /* Lo que queda sin subcategoria es de verdad un cajon de sastre: gaseosas,
     alfajores sueltos, polen. Va a General, que es la categoria que Brotes ya tiene
     para eso. */
  'REGIONALES Y OTROS|': 'General',

  'REPOSTERIA|': 'Reposteria',
  'REPOSTERIA|CHOCOLART': 'Reposteria',
  'REPOSTERIA|LEVEX LEVADURAS': 'Reposteria',
  'REPOSTERIA|COLONIAL': 'Golosinas',

  'SEMILLAS|': 'Semillas',
  'SNACKS|': 'Galletas y snacks',
  'SNACKS|MIX SALADO': 'Galletas y snacks',

  'SUPLEMENTOS NATURALES|': 'Suplementos',
  'SUPLEMENTOS NATURALES|IO NATURALE': 'Suplementos',
  'SUPLEMENTOS NATURALES|ORIGEN PERU': 'Suplementos',
  'SUPLEMENTOS NATURALES|SALUTARIS / INCAICO': 'Suplementos',

  'YERBA, TÉ, INFUS. Y CAFE|': 'Infusiones y hierbas',
  'YERBA, TÉ, INFUS. Y CAFE|CAFE TOSTADO MULA': 'Infusiones y hierbas',
  'YERBA, TÉ, INFUS. Y CAFE|YERBA AJEDREZ': 'Infusiones y hierbas',
  'YERBA, TÉ, INFUS. Y CAFE|YERBA KALENA': 'Infusiones y hierbas',
  'YERBA, TÉ, INFUS. Y CAFE|YERBA TUCANGUA': 'Infusiones y hierbas'
};

/* ---------------------------------------------------------------------------
   Capa de palabras, encima de la tabla.

   La tabla sola acierta 74% contra los 47 que el dueño ya categorizo. Lo que le
   falta son productos donde el NOMBRE dice la categoria mas claro que la
   subcategoria del proveedor: el azucar de coco esta en REPOSTERIA pero es un
   endulzante, la esencia de vainilla tambien esta en REPOSTERIA pero Brotes tiene
   "Esencias y saborizantes". Con esta capa: 94%.

   OJO CON EL AZUCAR, que ya costo un error. La primera version marcaba cualquier
   nombre que dijera "azucar" o "stevia", y se llevaba puestas 40 fichas: las
   MERMELADAS C/STEVIA iban a Endulzantes en vez de Conservas y dulces, las LECHES
   VEGETALES "sin azucar" tambien, y las TABLETAS S/AZUCAR igual. En esos nombres
   la palabra es un DESCRIPTOR -dice que NO lleva-, no el producto. Por eso ahora
   se exige que no venga precedida de sin / s/ / c/ / con / bajo, y por eso
   "stevia" y "miel" quedaron afuera de la regla: casi siempre son descriptores.
   Se ve solo mirando que mueve la regla en los 873, no en la muestra de 47. */

const NO_ES_EL_PRODUCTO = /(sin|s\/|c\/|con|bajo|reducido|libre)\s*$/;

function _esEndulzante(n) {
  const i = n.search(/\b(azucar|mascabo)\b/);
  return i >= 0 && !NO_ES_EL_PRODUCTO.test(n.slice(0, i));
}

const REGLAS = [
  [n => /\b(esencia|agua de azahar|saborizante|colorante)\b/.test(n), 'Esencias y saborizantes'],
  [_esEndulzante, 'Endulzantes'],
  /* Cereal de chicos azucarado, alfajor, bañado en chocolate: para el negocio son
     golosinas, no cereales ni reposteria. El dueño los clasifico asi. */
  [n => /\b(bombon|bombones|chocolatin|chocolatinas|alfajor|caramelo|gomitas|turron|banad[ao]|bolitas|anillo|ositos?)\b/.test(n), 'Golosinas'],
  [n => /\b(dulce de leche|mermelada|membrillo)\b/.test(n), 'Conservas y dulces']
];

function _sinTildes(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/* Primero el nombre, que es lo mas especifico; despues el par exacto
   (categoria, subcategoria); si esa subcategoria no esta en la tabla -porque el
   proveedor sumo una nueva-, cae a la categoria sola; y si tampoco, a General, que
   el panel lista aparte y se arregla desde ahi.
   Nunca devuelve una categoria que Brotes no tenga. */
function categoriaBrotes(p) {
  const n = _sinTildes(p.nombre);
  for (const [test, cat] of REGLAS) { if (test(n)) return cat; }
  const c = String(p.categoria || '').trim();
  const s = String(p.subcategoria || '').trim();
  return MAPA[c + '|' + s] || MAPA[c + '|'] || 'General';
}

module.exports = { MAPA, REGLAS, categoriaBrotes };
