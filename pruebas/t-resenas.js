/**
 * LAS RESEÑAS SON SOLO DEL E-COMMERCE, Y SU TOKEN NO SE PUEDE ENUMERAR.
 *
 * Dos cosas distintas que quedaron atadas:
 *
 * 1. QUIEN GENERA EL TOKEN. Antes lo generaba toda venta guardada en el panel,
 *    mostrador incluido: cada venta del local dejaba un documento en /resenas
 *    -coleccion publica- con el nombre del cliente y el numero de venta, que en
 *    la mayoria de los casos no iba a usar nadie. Ahora solo las que vienen de
 *    un pedido web, que es lo que ya distingue el campo `origen` de la venta.
 *
 *    Consecuencia directa: sin token no puede haber QR de resena en el ticket.
 *    La rama vieja caia en '/resena.html' a secas, y esa pagina sin ?id= muestra
 *    "link invalido": el ticket habria salido con un QR muerto.
 *
 * 2. EL TOKEN ES LA CREDENCIAL. El id del documento es lo que va en el QR: vale
 *    como prueba de "yo compre esto". Con `allow read: if true` se bajaba la
 *    lista entera de tokens pendientes, y como la regla de update deja completar
 *    un token a cualquiera con sesion iniciada, se podian dejar resenas falsas a
 *    nombre de clientes reales sin haber comprado nada.
 *
 *    En Firestore las reglas de `list` NO filtran: exigen que la consulta
 *    garantice la condicion. Por eso la regla y el where de la tienda son una
 *    sola cosa, y si se separan la tienda se queda sin resenas.
 */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(RAIZ, 'admin.html'), 'utf8');
const tienda = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
const reglas = fs.readFileSync(path.join(RAIZ, 'firestore.rules'), 'utf8');
const indices = JSON.parse(fs.readFileSync(path.join(RAIZ, 'firestore.indexes.json'), 'utf8'));
const resena = fs.readFileSync(path.join(RAIZ, 'resena.html'), 'utf8');

let ok = 0, fail = 0;
const t = (d, c) => { if (c) { ok++; console.log('  OK   ' + d); } else { fail++; console.log('  FALLA ' + d); } };

/* ------------------------------------------------- 1) solo ventas de la web */
const i = admin.indexOf('let resenaId=null;');
t('se encontro el bloque que crea el token', i > 0);
const bloque = admin.slice(i - 400, i + 500);

t('la creacion esta condicionada a que la venta venga de la web',
  /if\(_esVentaWeb\)\{/.test(bloque));
t('la condicion sale de _pedidoOrigenVentaId, igual que el campo origen',
  /_esVentaWeb\s*=\s*!!window\._pedidoOrigenVentaId/.test(bloque));
/* El mismo dato que decide el token decide el `origen` que se guarda: si un dia
   se separan, una venta podria quedar como 'web' y sin token, o al reves. */
t('el campo origen usa exactamente la misma senal',
  admin.indexOf("origen:window._pedidoOrigenVentaId?'web':'mostrador'") > 0);

/* ------------------------------------------------------- 2) el QR del ticket */
t('el QR de resena pide que haya token',
  admin.indexOf("usarQrResena=tipoFactura==='nuevo'&&!!v.resenaId") > 0);
t('ya no queda la rama que apuntaba a /resena.html sin id',
  admin.indexOf("_sitioUrl+'/resena.html'") < 0);
t('resena.html sin id muestra el cartel de invalido',
  /if\(!tokenId\)\{showView\('invalidArea'\)/.test(resena));

/* --------------------------------------------------------- 3) las reglas */
const bloqueReglas = (reglas.match(/match \/resenas\/\{doc\} \{[\s\S]*?\n {4}\}/) || [''])[0];
t('resenas ya no tiene "allow read: if true"', !/allow read: *if true/.test(bloqueReglas));
t('se puede leer una resena sabiendo su id (lo necesita el QR)',
  /allow get: *if true/.test(bloqueReglas));
t('solo se listan las ya publicadas, o siendo admin',
  /allow list: *if isAdmin\(\) \|\| resource\.data\.usado == true/.test(bloqueReglas));
t('crear sigue siendo solo del panel', /allow create: *if isAdmin\(\)/.test(bloqueReglas));

/* ------------------------------------- 4) la consulta y el indice, en pareja
   Estos tres van juntos o no va ninguno. La regla exige el where; el where
   exige el indice compuesto. Si falta cualquiera, la tienda se queda sin
   resenas y no avisa: el catch pinta la grilla vacia. */
t('la tienda filtra por usado en el servidor',
  tienda.indexOf("collection('resenas').where('usado','==',true)") > 0);
t('y sigue ordenando por fecha', /where\('usado','==',true\)\s*\.orderBy\('fecha','desc'\)/.test(tienda));
t('el filtro por visible sigue del lado del cliente',
  /r\.visible===true&&r\.usado===true/.test(tienda));

const ix = (indices.indexes || []).filter(x => x.collectionGroup === 'resenas');
const compuesto = ix.find(x => x.fields.map(f => f.fieldPath).join(',') === 'usado,fecha');
t('existe el indice compuesto (usado, fecha)', !!compuesto);
t('con fecha descendente, como pide la consulta',
  !!compuesto && compuesto.fields[1].order === 'DESCENDING');

/* -------------------------------------------------- 5) el link manual sigue
   Es la otra forma de pedir una resena, y no depende de ninguna venta. */
t('el boton de generar link a mano sigue existiendo',
  admin.indexOf('async function generarLinkResena(') > 0);
t('y sigue guardando ventaNum:null, que la regla de update necesita',
  /origen:'manual'/.test(admin) && /ventaNum:null/.test(admin));

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
