/**
 * STOCK BAJO: UN LIMITE PARA LOS ENVASADOS Y OTRO PARA LOS QUE VAN POR PESO.
 *
 * Habia un solo limite, en unidades. Con eso, todo lo que se vende suelto
 * quedaba mal contado: el stock de un granel esta en GRAMOS, asi que 450 g de
 * mani -medio kilo, poquisimo- nunca bajaba de 10 y no avisaba nunca, y al
 * reves, subir el limite a 500 para que avisara del granel ponia en rojo a
 * cualquier envasado con menos de 500 unidades, o sea a todos.
 *
 * Ahora son dos limites: unidades y gramos, con 500 g por defecto.
 *
 * LO QUE ESTA PRUEBA CUIDA
 *
 * El criterio lo miran TRES lugares: el numero de la tarjeta, el resaltado de
 * la fila en la tabla y la lista del tooltip. Escrito tres veces, alcanza con
 * tocar uno para que la tarjeta diga un numero y la tabla pinte otro, y eso no
 * se nota hasta que alguien los compara. Por eso hay una sola funcion y aca se
 * verifica que los tres la usen.
 */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(RAIZ, 'admin.html'), 'utf8');

function cuerpo(n) {
  const i = html.indexOf('function ' + n + '(');
  if (i < 0) throw new Error('no encontre ' + n);
  let p = 0, k;
  for (k = html.indexOf('{', i); k < html.length; k++) {
    if (html[k] === '{') p++;
    else if (html[k] === '}') { p--; if (!p) break; }
  }
  return html.slice(i, k + 1);
}

let ok = 0, fail = 0;
const t = (d, c) => { if (c) { ok++; console.log('  OK   ' + d); } else { fail++; console.log('  FALLA ' + d); } };

/* Se arma con un localStorage de mentira para poder mover los limites. */
function conLimites(unidades, gramos) {
  const guardado = {};
  if (unidades != null) guardado.brotesLowStockThr = String(unidades);
  if (gramos != null) guardado.brotesLowStockThrPeso = String(gramos);
  const fakes = { localStorage: { getItem: (k) => guardado[k] === undefined ? null : guardado[k] } };
  const nombres = Object.keys(fakes);
  return new Function(...nombres,
    cuerpo('esPorPeso') + cuerpo('getLowStockThreshold') +
    cuerpo('getLowStockThresholdPeso') + cuerpo('esStockBajo') +
    ';return { bajo: esStockBajo, uni: getLowStockThreshold, gr: getLowStockThresholdPeso };'
  )(...nombres.map(n => fakes[n]));
}

/* ------------------------------------------------------------ los defaults */
const d = conLimites(null, null);
t('sin nada guardado, las unidades arrancan en 10', d.uni() === 10);
t('y los gramos en 500, como se pidio', d.gr() === 500);

/* --------------------------------------------------- unidad contra gramos */
const a = conLimites(10, 500);
const uni = (s) => ({ nombre: 'Envasado', tipoVenta: 'unidad', stock: s });
const peso = (s) => ({ nombre: 'Suelto', tipoVenta: 'peso', stock: s });

t('un envasado con 3 unidades esta bajo', a.bajo(uni(3)));
t('uno con 10 justas NO esta bajo, el limite no cuenta', !a.bajo(uni(10)));
t('uno con 40 no esta bajo', !a.bajo(uni(40)));
/* El caso que no andaba: 450 g es medio kilo, y contra el limite de unidades
   -10- no bajaba nunca. */
t('450 g de un suelto SI esta bajo', a.bajo(peso(450)));
t('con el limite viejo de unidades no lo habria detectado', 450 > 10);
t('1500 g no esta bajo', !a.bajo(peso(1500)));
t('500 g justos NO esta bajo', !a.bajo(peso(500)));
/* Y al reves: el limite de gramos no puede ensuciar a los envasados. */
t('un envasado con 400 unidades no se cuenta como bajo por el limite de gramos',
  !a.bajo(uni(400)));

/* -------------------------------------------------- sin stock es otra cosa */
t('sin stock NO cuenta como stock bajo: tiene su propia tarjeta', !a.bajo(uni(0)));
t('lo mismo para un suelto en 0', !a.bajo(peso(0)));
t('un stock negativo tampoco', !a.bajo(uni(-1)));

/* --------------------------------------------------------------- bordes */
t('sin tipoVenta se trata como envasado', a.bajo({ stock: 3 }));
t('sin stock cargado no rompe', !a.bajo({ tipoVenta: 'peso' }));
t('null no rompe', !a.bajo(null));

/* -------------------------------------------- los limites se pueden cambiar */
const b = conLimites(50, 2000);
t('cambiar el limite de unidades cambia el resultado', b.bajo(uni(40)) && !a.bajo(uni(40)));
t('y el de gramos tambien', b.bajo(peso(1500)) && !a.bajo(peso(1500)));
/* Un limite invalido no puede dejar la pantalla sin criterio. */
t('un limite en cero cae al default', conLimites(0, 0).uni() === 10 && conLimites(0, 0).gr() === 500);
t('un limite con texto tambien', conLimites('abc', 'xyz').uni() === 10);

/* ------------------------------------ que los tres lugares usen lo mismo */
t('la tarjeta cuenta con el criterio',
  html.indexOf("statLowStock').textContent=allProducts.filter(esStockBajo).length") > 0);
t('la tabla pinta la fila con el criterio',
  html.indexOf("else if(esStockBajo(p))sc='stock-low'") > 0);
t('el tooltip lista con el criterio',
  html.indexOf('prods=allProducts.filter(esStockBajo);') > 0);
t('no quedo ninguna comparacion suelta contra el umbral',
  html.indexOf('(p.stock||0)<thr') < 0 && html.indexOf('sv<thr') < 0);

/* --------------------------------------------------------- la pantalla */
t('la tarjeta tiene los dos campos',
  html.indexOf('id="lowStockThreshold"') > 0 && html.indexOf('id="lowStockThresholdPeso"') > 0);
t('y dicen cual es cual', /<label>Unidades:<\/label>/.test(html) && /<label>Gramos:<\/label>/.test(html));
t('el de gramos arranca en 500', /id="lowStockThresholdPeso" value="500"/.test(html));
t('los dos guardan al cambiar',
  (html.match(/onchange="saveLowStockThreshold\(\)"/g) || []).length === 2);
t('se guardan los dos', html.indexOf("localStorage.setItem('brotesLowStockThrPeso',g)") > 0);
/* Sin esto, al recargar el campo muestra 500 aunque el guardado sea otro. */
t('al recargar, el campo de gramos se llena con lo guardado',
  html.indexOf("if(tg)tg.value=getLowStockThresholdPeso()") > 0);

/* La lista del tooltip ahora mezcla unidades y gramos: el numero solo no
   alcanza para saber si 450 es poco o mucho. */
t('el tooltip aclara la unidad de cada uno', /esPorPeso\(p\)\?' g':' u'/.test(html));

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
