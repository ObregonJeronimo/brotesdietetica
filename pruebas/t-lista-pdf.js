/**
 * LA LISTA DE PRECIOS EN PDF (exportCatalogoPDF, admin.html).
 *
 * Es la que se les pasa a los clientes: la de mostrador con "Exportar PDF" y la mayorista con
 * "Exportar PDF M" (exportMayoristaPDF llama a la misma). Se corre la funcion de verdad con un
 * PDF de mentira que anota cada texto: que dice, donde, alineado como y con que letra.
 *
 * LO QUE HAY QUE SOSTENER:
 *
 *   1. Por peso, el precio es el del kilo, y se dice al lado: "$21.590 el kilo" (01/10/2026).
 *      Sin eso, "Semilla De Chia $21.590" se leia como el precio del paquete, y la tienda ya
 *      decia "el kilo".
 *   2. Gramaje / Presentacion va pegado al nombre ("Aceite De Almendras 250 cc"): es lo que
 *      distingue el mismo producto en 250 cc y en 500 cc.
 *   3. El nombre no se pisa con el precio: se corta antes, contando tambien "el kilo".
 *   4. Cada grupo de presentaciones o bolsas sale junto, en la categoria de su principal, donde
 *      iria el principal y de menor a mayor (01/10/2026). Por nombre, "Mani Salado" quedaba
 *      entre "Mani" y "Mani x 5 kg", y "x 10 kg" antes que "x 3 kg".
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(RAIZ, 'admin.html'), 'utf8');
const VAR = fs.readFileSync(path.join(RAIZ, 'admin-variantes.js'), 'utf8');

function cuerpo(src, n) {
  const i = src.indexOf('function ' + n + '(');
  if (i < 0) throw new Error('no encontre ' + n);
  let p = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') p++;
    else if (src[k] === '}') { p--; if (!p) break; }
  }
  return src.slice(i, k + 1) + '\n';
}
/* Una lista fija (const n=[...]) de admin.html. */
function constante(src, n) {
  const i = src.indexOf('const ' + n + '=[');
  if (i < 0) throw new Error('no encontre ' + n);
  let p = 0, k;
  for (k = src.indexOf('[', i); k < src.length; k++) {
    if (src[k] === '[') p++;
    else if (src[k] === ']') { p--; if (!p) break; }
  }
  return src.slice(i, k + 1) + ';\n';
}

let ok = 0, fail = 0;
const t = (d, c, det) => {
  if (c) { ok++; console.log('  OK   ' + d); } else { fail++; console.log('  FALLA ' + d + (det !== undefined ? '   [' + det + ']' : '')); }
};

/* El PDF de mentira. Un texto mide 1,8 mm por letra (2 en negrita): alcanza para ver que el
   nombre se corta antes del precio. */
function pdfDeMentira(anotados) {
  return function () {
    const d = {
      letra: 'normal', paginas: 1,
      internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 }, getNumberOfPages: () => d.paginas },
      setFillColor() {}, rect() {}, setTextColor() {}, setFontSize() {}, setPage() {},
      setFont(f, estilo) { d.letra = estilo || 'normal'; },
      getTextWidth(s) { return String(s).length * (d.letra === 'bold' ? 2 : 1.8); },
      text(s, x, y, o) { anotados.push({ s: String(s), x: x, y: y, align: o && o.align, letra: d.letra }); },
      addPage() { d.paginas++; },
      save(n) { anotados.guardado = n; },
    };
    return d;
  };
}

function correr(productos, mayorista, priceMap) {
  const anotados = [];
  const ctx = {
    console, Math, Number, String, Object, Array, Date, JSON,
    allProducts: productos,
    showAdminToast: () => {}, logAction: () => {},
    precioMostradorDe: p => Number(p.precio || 0),
  };
  ctx.window = ctx;
  ctx.jspdf = { jsPDF: pdfDeMentira(anotados) };
  vm.createContext(ctx);
  vm.runInContext(cuerpo(VAR, 'contenidoDeVariante') + constante(html, '_catalogoOrden') + cuerpo(html, '_catalogoMatchIdx') + cuerpo(html, 'esPorPeso') +
    cuerpo(html, 'exportCatalogoPDF'), ctx);
  ctx.exportCatalogoPDF(priceMap || null, !!mayorista);
  return anotados;
}

const PRODS = [
  { id: 'ace', nombre: 'Aceite De Almendras', gramaje: '250 cc', tipoVenta: 'unidad', precio: 29600, precioMayorista: 24050, categoria: 'Aceites' },
  { id: 'chi', nombre: 'Semilla De Chia', tipoVenta: 'peso', precio: 21590, precioMayorista: 16550, categoria: 'Semillas' },
  { id: 'len', nombre: 'Lenteja Turca Seleccionada Extra Grande De Turquia x 5 kg', tipoVenta: 'peso', precio: 2000, categoria: 'Legumbres' },
  { id: 'ocu', nombre: 'Girasol Oculto', tipoVenta: 'peso', precio: 900, categoria: 'Semillas', oculto: true },
];
const COL_X = 12, COL_W = (210 - 12 * 2 - 6) / 2;
const renglon = (a, inicio) => {
  const i = a.findIndex(x => x.s.indexOf(inicio) === 0);
  return i < 0 ? null : { nombre: a[i], resto: a.slice(i + 1).filter(x => x.y === a[i].y) };
};

console.log('\n-- la lista de mostrador --');
{
  const a = correr(PRODS, false);
  t('se arma y se guarda con su nombre de siempre', /^BROTES_catalogo_\d{4}-\d{2}-\d{2}\.pdf$/.test(a.guardado || ''), a.guardado);
  const chi = renglon(a, 'Semilla De Chia');
  const kilo = chi && chi.resto.find(x => x.s === ' el kilo');
  const precio = chi && chi.resto.find(x => x.s === '$21.590');
  t('por peso, el precio dice "el kilo" al lado (01/10)', !!(kilo && precio), chi && chi.resto.map(x => x.s).join('|'));
  t('  "el kilo" va al final, en letra normal', !!kilo && kilo.align === 'right' && kilo.x === COL_X + COL_W && kilo.letra === 'normal');
  t('  y el precio en negrita, justo antes', !!precio && precio.align === 'right' && precio.letra === 'bold' &&
    Math.abs(precio.x - (COL_X + COL_W - ' el kilo'.length * 1.8)) < 1e-9, precio && precio.x);
  const ace = renglon(a, 'Aceite De Almendras');
  t('por unidad, el precio solo, sin "el kilo"', !!ace && ace.resto.length === 1 && ace.resto[0].s === '$29.600' &&
    ace.resto[0].x === COL_X + COL_W && ace.resto[0].letra === 'bold', ace && ace.resto.map(x => x.s).join('|'));
  t('Gramaje / Presentación va pegado al nombre: "Aceite De Almendras 250 cc"', !!ace && ace.nombre.s === 'Aceite De Almendras 250 cc', ace && ace.nombre.s);
  const len = renglon(a, 'Lenteja Turca');
  const maxNombre = COL_W - ('$2.000'.length * 1.8 + ' el kilo'.length * 1.8) - 4;
  t('un nombre largo se corta antes del precio y de "el kilo"', !!len && /…$/.test(len.nombre.s) &&
    len.nombre.s.length * 1.8 <= maxNombre && len.resto.some(x => x.s === ' el kilo'), len && len.nombre.s);
  t('los ocultos no van', !a.some(x => x.s.indexOf('Girasol Oculto') === 0));
}

console.log('\n-- la lista mayorista --');
{
  const a = correr(PRODS, true, { ace: 24050, chi: 16550 });
  t('se guarda como mayorista', /^BROTES_mayorista_/.test(a.guardado || ''), a.guardado);
  const chi = renglon(a, 'Semilla De Chia');
  t('por peso también dice "el kilo"', !!chi && chi.resto.some(x => x.s === '$16.550') && chi.resto.some(x => x.s === ' el kilo'),
    chi && chi.resto.map(x => x.s).join('|'));
  const ace = renglon(a, 'Aceite De Almendras');
  t('  y por unidad, el precio solo', !!ace && ace.resto.map(x => x.s).join('|') === '$24.050', ace && ace.resto.map(x => x.s).join('|'));
}

console.log('\n-- los grupos, juntos --');
{
  const GRUPOS = [
    { id: 'man', nombre: 'Mani', gramaje: '1 kg', tipoVenta: 'peso', precio: 13490, precioMayorista: 9250, categoria: 'Frutos secos' },
    { id: 'man10', nombre: 'Mani x 10 kg', gramaje: '10 kg', tipoVenta: 'peso', precio: 11000, precioMayorista: 8000, categoria: 'Otra cosa', gramajePadreId: 'man' },
    { id: 'man5', nombre: 'Mani x 5 kg', gramaje: '5 kg', tipoVenta: 'peso', precio: 12350, precioMayorista: 8450, categoria: 'Frutos secos', gramajePadreId: 'man' },
    { id: 'sal', nombre: 'Mani Salado', tipoVenta: 'peso', precio: 9000, precioMayorista: 7000, categoria: 'Frutos secos' },
    { id: 'alm', nombre: 'Almendra', tipoVenta: 'peso', precio: 15000, precioMayorista: 12000, categoria: 'Frutos secos' },
    { id: 'alf12', nombre: 'Alfajor x12', gramaje: 'x12', tipoVenta: 'unidad', precio: 9000, precioMayorista: 8000, categoria: 'Golosinas', gramajePadreId: 'alf1' },
    { id: 'alf1', nombre: 'Alfajor', gramaje: 'x1', tipoVenta: 'unidad', precio: 900, precioMayorista: 800, categoria: 'Golosinas' },
    { id: 'alf6', nombre: 'Alfajor x6', gramaje: 'x6', tipoVenta: 'unidad', precio: 5000, precioMayorista: 4500, categoria: 'Golosinas', gramajePadreId: 'alf1' },
  ];
  const nombres = a => a.filter(x => /^(Mani|Almendra|Alfajor)/.test(x.s)).map(x => x.s).join(' | ');
  const ESPERADO = 'Almendra | Mani 1 kg | Mani x 5 kg | Mani x 10 kg | Mani Salado | Alfajor x1 | Alfajor x6 | Alfajor x12';
  const a = correr(GRUPOS, false);
  t('cada grupo sale junto, donde iría su principal y de menor a mayor (01/10)', nombres(a) === ESPERADO, nombres(a));
  t('  una bolsa con otra categoría va en la de su principal', !a.some(x => x.s === 'OTRA COSA'));
  const may = correr(GRUPOS, true, { man: 9250, man10: 8000, man5: 8450, sal: 7000, alm: 12000, alf12: 8000, alf1: 800, alf6: 4500 });
  t('  y en la mayorista, igual', nombres(may) === ESPERADO, nombres(may));
}
{
  /* Revisión del 01/10: si el principal no sale en la lista (oculto o sin precio), su bolsa va sola,
     en su categoría, como en la tienda. Antes iba a la categoría del principal. */
  const OCU = [
    { id: 'man', nombre: 'Mani', gramaje: '1 kg', tipoVenta: 'peso', precio: 13490, categoria: 'Frutos secos', oculto: true },
    { id: 'man5', nombre: 'Mani x 5 kg', gramaje: '5 kg', tipoVenta: 'peso', precio: 12350, categoria: 'Snacks', gramajePadreId: 'man' },
    { id: 'alm', nombre: 'Almendra', tipoVenta: 'peso', precio: 15000, categoria: 'Frutos secos' },
  ];
  const a = correr(OCU, false);
  const donde = s => a.findIndex(x => x.s === s);
  t('  si el principal no sale (oculto), su bolsa va sola, en su categoría, como en la tienda (revisión del 01/10)',
    donde('SNACKS') >= 0 && donde('SNACKS') < a.findIndex(x => x.s.indexOf('Mani x 5 kg') === 0) && !a.some(x => x.s.indexOf('Mani 1 kg') === 0),
    a.map(x => x.s).join(' | '));
}

(async () => {
  console.log('\n-- la lista mayorista deja afuera lo que está al costo (01/10) --');
  {
    /* Pedido del dueño (01/10): el 01/10, 222 de los 228 productos de la lista mayorista tenían el
       mayorista igual al costo (por el % mayorista en 0). El cliente los veía a precio de costo. */
    const COSTOS = fs.readFileSync(path.join(RAIZ, 'admin-costos.js'), 'utf8');
    const correrMay = async (productos, resp) => {
      const anotados = [], preguntas = [], avisos = [];
      const ctx = {
        console, Math, Number, String, Object, Array, Date, JSON,
        allProducts: productos,
        showAdminToast: (m, tp) => avisos.push((tp || '') + ': ' + m), logAction: () => {},
        precioMostradorDe: p => Number(p.precio || 0),
        pedirConfirmacion: async (m, op) => { preguntas.push({ m, op }); return resp; },
      };
      ctx.window = ctx;
      ctx.jspdf = { jsPDF: pdfDeMentira(anotados) };
      vm.createContext(ctx);
      vm.runInContext(cuerpo(VAR, 'contenidoDeVariante') + constante(html, '_catalogoOrden') + cuerpo(html, '_catalogoMatchIdx') + cuerpo(html, 'esPorPeso') +
        cuerpo(html, 'exportCatalogoPDF') + cuerpo(COSTOS, '_mayoristaSinGanancia') + 'async ' + cuerpo(html, 'exportMayoristaPDF'), ctx);
      await ctx.exportMayoristaPDF();
      return { anotados, preguntas, avisos };
    };
    const MAY = [
      { id: 'alm', nombre: 'Almendras', tipoVenta: 'peso', costo: 21500, precio: 35475, precioMayorista: 21500, categoria: 'Frutos secos' },
      { id: 'caf', nombre: 'Mula Cafe', tipoVenta: 'unidad', costo: 10110, precio: 16682, precioMayorista: 10150, categoria: 'Infusiones' },
      { id: 'chi', nombre: 'Semilla De Chia', tipoVenta: 'peso', costo: 12000, precio: 21590, precioMayorista: 16550, categoria: 'Semillas' },
      { id: 'sin', nombre: 'Sin Mayorista', tipoVenta: 'unidad', costo: 1000, precio: 1500, precioMayorista: 0, categoria: 'Semillas' },
    ];
    const a = await correrMay(MAY, true);
    const q = a.preguntas[0];
    t('si hay productos con el mayorista igual al costo (o casi), avisa cuáles y que quedan afuera',
      a.preguntas.length === 1 && q.op.titulo === 'Mayorista sin ganancia' && q.op.aceptar === 'Exportar sin esos' && q.op.cancelar === 'Cancelar' &&
      q.m.indexOf('2 productos tienen el precio mayorista igual al costo (o casi): en la lista, el cliente los vería a precio de costo.') === 0 &&
      q.m.indexOf('- Almendras: mayorista $21.500 el kilo, costó $21.500 el kilo\n- Mula Cafe: mayorista $10.150, costó $10.110') > 0 &&
      q.m.indexOf('¿Exportar la lista sin ellos (queda 1 producto)?') > 0, q && q.m);
    t('  "Exportar sin esos": la lista sale solo con los que dejan ganancia',
      /^BROTES_mayorista_/.test(a.anotados.guardado || '') && a.anotados.some(x => x.s.indexOf('Semilla De Chia') === 0) &&
      !a.anotados.some(x => x.s.indexOf('Almendras') === 0 || x.s.indexOf('Mula Cafe') === 0 || x.s.indexOf('Sin Mayorista') === 0),
      a.anotados.map(x => x.s).join(' | '));
    const b = await correrMay(MAY, false);
    t('  "Cancelar" no exporta nada', b.preguntas.length === 1 && !b.anotados.guardado);
    const c = await correrMay(MAY.filter(p => p.id === 'chi'), true);
    t('  si todos dejan ganancia, no pregunta y exporta', c.preguntas.length === 0 && /^BROTES_mayorista_/.test(c.anotados.guardado || ''));
    const d = await correrMay(MAY.filter(p => p.id !== 'chi'), true);
    t('  si ninguno deja ganancia, lo dice y no exporta',
      d.preguntas.length === 1 && d.preguntas[0].op.cancelar === null && d.preguntas[0].m.indexOf('No queda ninguno con ganancia para la lista.') > 0 &&
      !d.anotados.guardado, d.preguntas[0] && d.preguntas[0].m);
  }

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + (e && e.stack || e)); process.exit(1); });
