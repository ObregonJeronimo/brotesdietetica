/**
 * BUSCAR UN PRODUCTO POR SU CODIGO, SIN ESCRIBIR LOS CEROS.
 *
 * Los codigos son texto de 6 digitos con ceros adelante -'000320'-, y nadie
 * los recuerda asi: uno se acuerda del 320. Escribir '320' tiene que traer el
 * 000320 sin tener que tipear los ceros.
 *
 * Es texto y no numero a proposito, y por eso importa: '000320' guardado como
 * numero seria 320 y perderia los ceros, que es como se identifica el producto
 * en la lista del proveedor.
 *
 * El buscador sigue siendo el mismo para nombre y codigo -un solo campo-, asi
 * que lo que hay que sostener es que agregar el codigo NO se lleve puesta la
 * busqueda por nombre, que es la que se usa todo el dia.
 */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(RAIZ, 'admin.html'), 'utf8');

let ok = 0, fail = 0;
const t = (d, c) => { if (c) { ok++; console.log('  OK   ' + d); } else { fail++; console.log('  FALLA ' + d); } };

/* El filtro sale del fuente real: se saca el bloque que arma `f` y se corre
   contra productos de mentira. */
const i = html.indexOf("if(q){f=f.filter(p=>(p.nombre||'').toLowerCase().includes(q)");
if (i < 0) throw new Error('no encontre el filtro por codigo en admin.html');
const bloque = html.slice(i, html.indexOf('if(cat)', i));

const filtrar = new Function('allProducts', 'q',
  'let f=allProducts;' + bloque + 'return f;');

const P = [
  { nombre: 'Aceite De Coco Neutro 200 Cc', codigo: '000320' },
  { nombre: 'Nueces Mariposa', codigo: '000032' },
  { nombre: 'Yerba Tucangua', codigo: '003203' },
  { nombre: 'Miel Del Monte', codigo: '000210' },
  { nombre: 'Sin codigo cargado' },
];
const nom = (r) => r.map(x => x.codigo || '-').join(',');

/* --------------------------------------------------------- lo que se pidio */
t('escribir 320 encuentra el 000320', filtrar(P, '320').some(x => x.codigo === '000320'));
t('el codigo entero tambien', nom(filtrar(P, '000320')) === '000320');
t('con algunos ceros adelante tambien', filtrar(P, '0320').some(x => x.codigo === '000320'));
/* Una sola regla: contiene lo que escribiste. Un codigo pegado con MAS ceros
   de los que tiene no entra, y esta bien que no entre: sostener ese caso hacia
   que escribir el codigo completo trajera productos de mas. */
t('con mas ceros de los que tiene, no lo encuentra -y es a proposito-',
  filtrar(P, '0000320').length === 0);

/* -------------------------------------------------------------- el nombre */
t('sigue buscando por nombre', nom(filtrar(P, 'nueces')) === '000032');
t('el nombre no distingue mayusculas', filtrar(P, 'ACEITE').length === 0 ||
  filtrar(P, 'aceite').length === 1);
t('un pedazo del nombre alcanza', filtrar(P, 'coco neutro').length === 1);
t('sin texto no filtra nada', filtrar(P, '').length === P.length);

/* ------------------------------------------------------------ los bordes */
t('un producto sin codigo no rompe la busqueda por codigo',
  filtrar(P, '999').length === 0);
t('el producto sin codigo aparece si se lo busca por nombre',
  filtrar(P, 'sin codigo').length === 1);
/* 320 esta adentro de 003203: tiene que aparecer, es una busqueda. */
t('trae todos los que contienen lo escrito',
  filtrar(P, '320').length === 2);
/* 32 esta en 000032 y en 003203, y ademas en 000320 */
t('un pedazo corto trae varios', filtrar(P, '32').length === 3);
t('algo que no esta no trae nada', filtrar(P, '77777').length === 0);

/* ---------------------------------------------------- la columna y el orden */
t('la tabla muestra la columna Codigo', /<th[^>]*>C&oacute;digo/.test(html));
t('la celda usa la fuente monoespaciada, para alinear los ceros',
  /font-family:var\(--mono\)[^"]*">'\+esc\(p\.codigo/.test(html));
t('el encabezado ordena por codigo', html.indexOf("sortTableBy('codigo')") > 0);
/* Un encabezado que se puede apretar y no hace nada es peor que uno fijo. */
t('y el orden por codigo esta implementado, no es un click muerto',
  html.indexOf("adminSortField==='codigo'") > 0);
t('el icono de orden del codigo se actualiza',
  /'Desc','Codigo'\]/.test(html) && /codigo:'Codigo'/.test(html));
t('el codigo se ordena como TEXTO, no restando',
  /codigo\|\|''\);return adminSortDir==='asc'\?va\.localeCompare/.test(html));
t('el placeholder avisa que tambien busca por codigo',
  /placeholder="Buscar por nombre o c&oacute;digo\.\.\." id="searchInput"/.test(html));

/* Las columnas de la tabla vacia tienen que coincidir con las de la cabecera,
   si no la fila de "sin productos" queda corrida. */
const thead = html.slice(html.lastIndexOf('<thead>', html.indexOf('productsTableBody')));
const cols = (thead.slice(0, thead.indexOf('</thead>')).match(/<th[\s>]/g) || []).length;
t('la cabecera tiene 10 columnas', cols === 10);
t('y los dos "no hay nada" usan colspan 10',
  html.indexOf('colspan="10"><div class="empty-state"><i class="bi bi-box-seam"></i><p>Cargando') > 0 &&
  html.indexOf('colspan="10"><div class="empty-state"><i class="bi bi-box-seam"></i><p>Sin productos') > 0);

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
