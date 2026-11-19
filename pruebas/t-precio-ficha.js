/**
 * EL PRECIO EN LA FICHA SE PUEDE ESCRIBIR (19/11/2026).
 *
 * Pedido de la clienta: la casilla "Precio" estaba bloqueada (salía del costo + %). Ahora se
 * escribe y el % se recalcula solo. Y dos cosas que pasaban al guardar la ficha (producción,
 * 19/11): 90 productos sin costo quedaban en $0, y 235 redondeados volvían a costo + %. Ahora
 * quedan como están, con un cartelito al guardar (pedido de Thiago).
 *
 * Corre de verdad admin-precio-ficha.js, y calcPrecioModal, montoAR, limpiarMonto y
 * _redondearMayorista de admin.html, con un DOM de mentira.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const HTML = leer('admin.html');
const PF = leer('admin-precio-ficha.js');
const COSTOS = leer('admin-costos.js');
const VAR = leer('admin-variantes.js');

let ok = 0, fail = 0;
const t = (d, c, det) => {
  if (c) { ok++; console.log('  OK   ' + d); } else { fail++; console.log('  FALLA ' + d + (det !== undefined ? '   [' + JSON.stringify(det).slice(0, 300) + ']' : '')); }
};
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
/* Una linea "const X = ..." entera (para las flechas de admin-costos.js). */
function constLinea(src, n) {
  const i = src.indexOf('const ' + n + ' =');
  if (i < 0) throw new Error('no encontre ' + n);
  return src.slice(i, src.indexOf('\n', i)) + '\n';
}

function armar(dialogos) {
  const els = {};
  const doc = { activeElement: null, getElementById: id => els[id] || null };
  const el = id => els[id] || (els[id] = { id, value: '', textContent: '', hidden: false, title: '', style: {}, focus() { doc.activeElement = this; } });
  ['pCosto', 'pPorcentaje', 'pPrecio', 'pPrecioNota', 'pDescuento', 'precioFinalWrap', 'pPrecioFinal', 'pPorcentajeMay', 'pPrecioMay', 'pPrecioMayNota', 'pNombre', 'pNombreMostrado'].forEach(el);
  const llamadas = [];
  /* La respuesta de cada cartelito: un valor para todos, o una lista, uno por cartelito. */
  const resp = (k, def) => {
    const x = dialogos && dialogos[k];
    if (Array.isArray(x)) return x.length ? x.shift() : def;
    return x !== undefined ? x : def;
  };
  const ctx = {
    document: doc, console, Math, Number, String, parseFloat, parseInt,
    _checkRecalcMayBtn() {},
    _tipoVentaProd: 'unidad',
    pedirOpcion: async (msg, o) => { llamadas.push({ tipo: 'opcion', msg, o }); return resp('opcion', 'dejar'); },
    pedirConfirmacion: async (msg, o) => { llamadas.push({ tipo: 'conf', msg, o }); return resp('conf', true); },
  };
  vm.createContext(ctx);
  vm.runInContext(cuerpo(HTML, 'montoAR') + cuerpo(HTML, 'limpiarMonto') + cuerpo(HTML, '_redondearMayorista') +
    cuerpo(HTML, 'calcPrecioModal') + cuerpo(COSTOS, '_mayoristaSinGanancia') + PF, ctx);
  /* Como openModal: costo, % y precios, precioFichaAlAbrir, y DESPUÉS el % mayorista. */
  const abrir = p => {
    el('pCosto').value = String(p.costo || 0);
    el('pPorcentaje').value = String(p.porcentaje || 0);
    el('pPrecio').value = String(p.precio || 0);
    el('pPorcentajeMay').value = '0';
    el('pDescuento').value = String(p.descuento || 0);
    el('pNombre').value = p.nombre || 'X';
    vm.runInContext('precioFichaAlAbrir(' + JSON.stringify(p) + ');', ctx);
    el('pPorcentajeMay').value = String(p.porcentajeMayorista || 0);
    vm.runInContext('calcPrecioModal();', ctx);
  };
  const escribir = (id, v) => { el(id).value = v; doc.activeElement = el(id); };
  return { ctx, el, doc, abrir, escribir, llamadas, run: s => vm.runInContext(s, ctx) };
}
const escribirPrecio = (m, v) => { m.escribir('pPrecio', v); m.run('precioEscritoFicha(document.getElementById("pPrecio"))'); };

console.log('\n=== el % que da justo el precio ===');
{
  const m = armar();
  const pp = (c, p) => m.run('pctParaPrecio(' + c + ',' + p + ')');
  t('costo $1.000, precio $1.650: 65%', pp(1000, 1650) === 65);
  const g = pp(14401, 25300);
  t('Granola Keto (costo $14.401, precio $25.300): un % con pocos decimales que da justo $25.300',
    Math.round(14401 * (1 + g / 100)) === 25300 && String(g).split('.')[1].length <= 2, g);
  t('por debajo del costo da negativo: $1.000 a $900 = -10%', pp(1000, 900) === -10);
  t('sin costo, 0', pp(0, 5000) === 0);
  let malos = 0, ej = null, s = 7;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  for (let i = 0; i < 5000; i++) {
    const c = 50 + Math.floor(rnd() * 900000), p = 1 + Math.floor(rnd() * c * 4);
    const x = pp(c, p);
    if (Math.round(c * (1 + x / 100)) !== p) { malos++; ej = ej || { c, p, x }; }
  }
  t('5.000 costos y precios al azar: siempre da justo el precio escrito', malos === 0, ej);
}

console.log('\n=== un producto con el precio redondeado (235 en producción) ===');
{
  const m = armar();
  m.abrir({ nombre: 'Granola - Keto', costo: 14401, porcentaje: 75, precio: 25300 });
  t('al abrir se ve su precio, $25.300 (antes la ficha mostraba $25.202)', m.el('pPrecio').value == 25300, m.el('pPrecio').value);
  t('y se guarda $25.300 si no se toca nada', m.run('precioFichaFinal()') === 25300);
  t('la nota dice que costo + % daría $25.202', /\$25\.202/.test(m.el('pPrecioNota').textContent) && !m.el('pPrecioNota').hidden, m.el('pPrecioNota').textContent);
  m.el('pDescuento').value = '10'; m.run('calcPrecioModal()');
  t('cambiar el descuento no lo toca: $25.300, y el precio final con 10% es $22.770',
    m.run('precioFichaFinal()') === 25300 && m.el('pPrecioFinal').textContent === '$' + (22770).toLocaleString('es-AR'), m.el('pPrecioFinal').textContent);
  m.el('pDescuento').value = '0';
  m.el('pCosto').value = '15000'; m.run('calcPrecioModal()');
  t('cambiar el costo a $15.000: vuelve a costo + 75% = $26.250', m.run('precioFichaFinal()') === 26250 && m.el('pPrecio').value == 26250);
  t('y la nota se va', m.el('pPrecioNota').hidden === true);
  m.el('pCosto').value = '14401'; m.run('calcPrecioModal()');
  t('volver a poner el costo de antes no trae el redondeo de vuelta: $25.202', m.run('precioFichaFinal()') === 25202);
}
{
  const m = armar();
  m.abrir({ nombre: 'Granola - Keto', costo: 14401, porcentaje: 75, precio: 25300 });
  m.el('pPorcentaje').value = '80'; m.run('calcPrecioModal()');
  t('cambiar el % a 80: costo + 80% = $25.922', m.run('precioFichaFinal()') === 25922);
}

console.log('\n=== un producto sin costo (90 en producción) ===');
{
  const m = armar();
  m.abrir({ nombre: 'LECHE DE COCO', costo: 0, porcentaje: 0, precio: 32000 });
  t('al abrir se ve $32.000 (antes $0)', m.el('pPrecio').value == 32000, m.el('pPrecio').value);
  t('y se guarda $32.000, no $0', m.run('precioFichaFinal()') === 32000);
  t('la nota dice que se guarda tal cual', /Sin costo/.test(m.el('pPrecioNota').textContent));
  m.el('pCosto').value = '20000'; m.el('pPorcentaje').value = '65'; m.run('calcPrecioModal()');
  t('al cargarle costo $20.000 y 65%: $33.000', m.run('precioFichaFinal()') === 33000);
}

console.log('\n=== un producto normal (precio = costo + %) ===');
{
  const m = armar();
  m.abrir({ nombre: 'Almendras', costo: 1000, porcentaje: 65, precio: 1650 });
  t('se ve $1.650 y no hay nota', m.el('pPrecio').value == 1650 && m.el('pPrecioNota').hidden === true);
  m.el('pPorcentaje').value = '70'; m.run('calcPrecioModal()');
  t('cambiar el % a 70 lo cambia, como siempre: $1.700', m.run('precioFichaFinal()') === 1700);
}

console.log('\n=== escribir el precio ===');
{
  const m = armar();
  m.abrir({ nombre: 'Granola', costo: 14401, porcentaje: 75, precio: 25202 });
  escribirPrecio(m, '25300');
  const pct = parseFloat(m.el('pPorcentaje').value);
  t('el % se ajusta solo (75 -> ' + pct + ') y da justo $25.300', pct !== 75 && Math.round(14401 * (1 + pct / 100)) === 25300, m.el('pPorcentaje').value);
  t('se guarda $25.300 y el % nuevo', m.run('precioFichaFinal()') === 25300);
  t('la nota dice que el % se ajustó', /se ajust/.test(m.el('pPrecioNota').textContent), m.el('pPrecioNota').textContent);
  t('lo escrito no se pisa mientras se escribe', m.el('pPrecio').value === '25300');
  m.doc.activeElement = null;
  m.el('pCosto').value = '16000'; m.run('calcPrecioModal()');
  const esp = Math.round(16000 * (1 + pct / 100));
  t('después sube el costo a $16.000: el precio sube con el mismo margen (' + pct + '%: $' + esp.toLocaleString('es-AR') + ')',
    m.run('precioFichaFinal()') === esp && esp === 28109, m.run('precioFichaFinal()'));
}
{
  const m = armar();
  m.abrir({ nombre: 'X', costo: 1000, porcentaje: 65, precio: 1650 });
  escribirPrecio(m, '1.8a00');
  t('solo números: "1.8a00" queda 1800 y el % 80', m.el('pPrecio').value === '1800' && m.el('pPorcentaje').value === '80', [m.el('pPrecio').value, m.el('pPorcentaje').value]);
  escribirPrecio(m, '900');
  t('por debajo del costo: $900 deja el % en -10', m.el('pPorcentaje').value === '-10' && m.run('precioFichaFinal()') === 900);
  escribirPrecio(m, '');
  t('borrar todo para escribir otro no toca el %', m.el('pPorcentaje').value === '-10');
}
{
  const m = armar();
  m.abrir({ nombre: 'Nuevo sin costo', costo: 0, porcentaje: 0, precio: 0 });
  escribirPrecio(m, '5000');
  t('sin costo: se guarda el precio escrito, $5.000, y el % no cambia', m.run('precioFichaFinal()') === 5000 && m.el('pPorcentaje').value === '0');
}
{
  const m = armar();
  m.run('precioFichaReset()');
  m.el('pCosto').value = '2000'; m.el('pPorcentaje').value = '50'; m.run('calcPrecioModal()');
  t('producto nuevo: costo + %, como siempre ($3.000)', m.run('precioFichaFinal()') === 3000);
}

(async () => {
  console.log('\n=== el cartelito al guardar ===');
  {
    const m = armar({ opcion: 'dejar' });
    m.abrir({ nombre: 'Granola - Keto', costo: 14401, porcentaje: 75, precio: 25300 });
    const r = await m.run('avisoPrecioFicha()');
    const d = m.llamadas[0] || {};
    t('redondeado: pregunta qué precio dejar, con $25.300 y $25.202', d.tipo === 'opcion' && /\$25\.300/.test(d.msg) && /\$25\.202/.test(d.msg), d.msg);
    t('  las opciones: "Dejar $25.300" (la principal) y "Usar $25.202 (costo + %)"',
      d.o && d.o.opciones[0].texto === 'Dejar $25.300' && d.o.opciones[0].principal && d.o.opciones[1].texto === 'Usar $25.202 (costo + %)', d.o && d.o.opciones);
    t('  "Dejar": guarda $25.300', r === true && m.run('precioFichaFinal()') === 25300);
  }
  {
    const m = armar({ opcion: 'calc' });
    m.abrir({ nombre: 'Granola - Keto', costo: 14401, porcentaje: 75, precio: 25300 });
    const r = await m.run('avisoPrecioFicha()');
    t('  "Usar $25.202": guarda $25.202 y la ficha lo muestra', r === true && m.run('precioFichaFinal()') === 25202 && m.el('pPrecio').value == 25202);
  }
  {
    const m = armar({ opcion: null });
    m.abrir({ nombre: 'Granola - Keto', costo: 14401, porcentaje: 75, precio: 25300 });
    t('  cerrarlo sin elegir no guarda', (await m.run('avisoPrecioFicha()')) === false);
  }
  {
    const m = armar({ opcion: 'dejar' });
    m.ctx._tipoVentaProd = 'peso';
    m.abrir({ nombre: 'Almendras', costo: 20000, porcentaje: 65, precio: 33100 });
    await m.run('avisoPrecioFicha()');
    t('  por peso dice "el kilo"', /\$33\.100 el kilo/.test(m.llamadas[0].msg), m.llamadas[0].msg);
  }
  {
    const m = armar({ conf: false });
    m.abrir({ nombre: 'LECHE DE COCO', costo: 0, porcentaje: 0, precio: 32000 });
    const r = await m.run('avisoPrecioFicha()');
    const d = m.llamadas[0] || {};
    t('sin costo: avisa que se guarda con $32.000', d.tipo === 'conf' && /no tiene costo/.test(d.msg) && /\$32\.000/.test(d.msg), d.msg);
    t('  "Volver" no guarda y deja el cursor en el costo', r === false && m.doc.activeElement === m.el('pCosto'));
  }
  {
    const m = armar({ conf: true });
    m.abrir({ nombre: 'LECHE DE COCO', costo: 0, porcentaje: 0, precio: 32000 });
    t('  "Guardar igual" guarda $32.000', (await m.run('avisoPrecioFicha()')) === true && m.run('precioFichaFinal()') === 32000);
  }
  {
    const m = armar();
    m.abrir({ nombre: 'Almendras', costo: 1000, porcentaje: 65, precio: 1650 });
    t('normal: no pregunta nada', (await m.run('avisoPrecioFicha()')) === true && m.llamadas.length === 0);
    escribirPrecio(m, '1800');
    t('precio escrito con costo: no pregunta (el % ya da ese precio)', (await m.run('avisoPrecioFicha()')) === true && m.llamadas.length === 0);
  }
  {
    const m = armar();
    m.abrir({ nombre: 'Sin nada', costo: 0, porcentaje: 0, precio: 0 });
    t('sin costo y en $0: este no pregunta (lo pregunta el aviso de "sin ganancia" de siempre)', (await m.run('avisoPrecioFicha()')) === true && m.llamadas.length === 0);
  }

  console.log('\n=== el mayorista (458 en producción no son la cuenta) ===');
  const fin = m => [m.run('precioFichaFinal()'), m.run('mayoristaFichaFinal()')];
  const escribirMay = (m, v) => { m.escribir('pPrecioMay', v); m.run('mayoristaEscritoFicha(document.getElementById("pPrecioMay"))'); };
  {
    /* Damasco x 2,5 Kg: de antes del redondeo a $50 (01/10). 9.774 x 1,2 = 11.728,8 -> 11.729; la cuenta de hoy, 11.750. */
    const m = armar({ opcion: 'dejar' });
    m.abrir({ nombre: 'DAMASCO NACIONAL x 2,5 Kg', costo: 9774, porcentaje: 65, precio: 16127, porcentajeMayorista: 20, precioMayorista: 11729 });
    t('Damasco: al abrir se ve su mayorista, $11.729 (antes la ficha mostraba $11.750)', m.el('pPrecioMay').value == 11729, m.el('pPrecioMay').value);
    t('  la nota dice que la cuenta daría $11.750', /\$11\.750/.test(m.el('pPrecioMayNota').textContent) && !m.el('pPrecioMayNota').hidden, m.el('pPrecioMayNota').textContent);
    t('  el de mostrador es la cuenta: sin nota', m.el('pPrecioNota').hidden === true);
    const r = await m.run('avisoPrecioFicha()');
    const d = m.llamadas[0] || {};
    t('  al guardar pregunta (un solo cartelito): $11.729 o $11.750', m.llamadas.length === 1 && d.tipo === 'opcion' && /\$11\.729/.test(d.msg) && /\$11\.750/.test(d.msg) && /redondea a \$50/.test(d.msg), d.msg);
    t('  botones "Dejar $11.729" (principal) y "Usar $11.750 (costo + %)"', d.o.opciones[0].texto === 'Dejar $11.729' && d.o.opciones[0].principal && d.o.opciones[1].texto === 'Usar $11.750 (costo + %)', d.o.opciones);
    t('  "Dejar": se guarda $11.729 de mayorista y $16.127 de mostrador', r === true && fin(m)[0] === 16127 && fin(m)[1] === 11729, fin(m));
  }
  {
    const m = armar({ opcion: 'calc' });
    m.abrir({ nombre: 'DAMASCO', costo: 9774, porcentaje: 65, precio: 16127, porcentajeMayorista: 20, precioMayorista: 11729 });
    t('  "Usar": se guarda $11.750 y la ficha lo muestra', (await m.run('avisoPrecioFicha()')) === true && fin(m)[1] === 11750 && m.el('pPrecioMay').value == 11750);
  }
  {
    const m = armar({ opcion: null });
    m.abrir({ nombre: 'DAMASCO', costo: 9774, porcentaje: 65, precio: 16127, porcentajeMayorista: 20, precioMayorista: 11729 });
    t('  cerrarlo sin elegir no guarda', (await m.run('avisoPrecioFicha()')) === false);
  }
  {
    const m = armar();
    m.abrir({ nombre: 'DAMASCO', costo: 9774, porcentaje: 65, precio: 16127, porcentajeMayorista: 20, precioMayorista: 11729 });
    m.el('pCosto').value = '10000'; m.run('calcPrecioModal()');
    t('  cambiar el costo a $10.000: el mayorista vuelve a la cuenta, $12.000; el de mostrador, $16.500', fin(m)[1] === 12000 && fin(m)[0] === 16500, fin(m));
    t('  y ya no pregunta', (await m.run('avisoPrecioFicha()')) === true && m.llamadas.length === 0);
  }
  {
    const m = armar();
    m.abrir({ nombre: 'DAMASCO', costo: 9774, porcentaje: 65, precio: 16127, porcentajeMayorista: 20, precioMayorista: 11729 });
    m.el('pPorcentajeMay').value = '25'; m.run('calcPrecioModal()');
    t('  cambiar el % mayorista a 25: la cuenta, 9.774 x 1,25 = 12.217,5 -> $12.250', fin(m)[1] === 12250, fin(m));
  }
  {
    /* Anís estrellado x 10 Kg: bajaba $5.716 al guardar la ficha. */
    const m = armar({ opcion: 'dejar' });
    m.abrir({ nombre: 'ANIS ESTRELLADO ENTERO x 10 Kg', costo: 24929, porcentaje: 65, precio: 41133, porcentajeMayorista: 20, precioMayorista: 35666 });
    const r = await m.run('avisoPrecioFicha()');
    t('Anís: pregunta $35.666 o $29.950, y "Dejar" deja $35.666 (antes bajaba solo a $29.950)',
      r === true && /\$35\.666/.test(m.llamadas[0].msg) && /\$29\.950/.test(m.llamadas[0].msg) && fin(m)[1] === 35666, [m.llamadas[0].msg, fin(m)]);
  }
  {
    /* Galleta vegana: % mayorista en 0 y un mayorista igual al costo (144 así). */
    const m = armar({ opcion: 'dejar' });
    m.abrir({ nombre: 'GALLETA VEGANA', costo: 10600, porcentaje: 60, precio: 16960, porcentajeMayorista: 0, precioMayorista: 10600 });
    t('Galleta (% mayorista 0, mayorista $10.600): se ve $10.600, no $0', m.el('pPrecioMay').value == 10600, m.el('pPrecioMay').value);
    t('  la nota dice que sin % no tendría mayorista y que casi no deja ganancia',
      /Sin % mayorista/.test(m.el('pPrecioMayNota').textContent) && /casi no deja ganancia/.test(m.el('pPrecioMayNota').textContent), m.el('pPrecioMayNota').textContent);
    const r = await m.run('avisoPrecioFicha()');
    const d = m.llamadas[0] || {};
    t('  pregunta: quedaría sin mayorista y se cobraría el de mostrador ($16.960), con el "Ojo" de la ganancia',
      d.tipo === 'opcion' && /sin precio mayorista/.test(d.msg) && /\$16\.960/.test(d.msg) && /no le ganás nada/.test(d.msg), d.msg);
    t('  botones "Dejar $10.600" y "Sacarle el mayorista (se cobra $16.960)"',
      d.o.opciones[0].texto === 'Dejar $10.600' && d.o.opciones[1].texto === 'Sacarle el mayorista (se cobra $16.960)', d.o.opciones);
    t('  "Dejar": $10.600, y no pregunta otra vez lo de la ganancia', r === true && fin(m)[1] === 10600 && m.llamadas.length === 1, m.llamadas.length);
  }
  {
    const m = armar({ opcion: 'calc' });
    m.abrir({ nombre: 'GALLETA VEGANA', costo: 10600, porcentaje: 60, precio: 16960, porcentajeMayorista: 0, precioMayorista: 10600 });
    t('  "Sacarle el mayorista": queda en 0 (se cobra el de mostrador)', (await m.run('avisoPrecioFicha()')) === true && fin(m)[1] === 0);
  }
  {
    const m = armar({ opcion: 'dejar' });
    m.abrir({ nombre: 'Sin mayorista', costo: 1000, porcentaje: 60, precio: 1600, porcentajeMayorista: 30, precioMayorista: 0 });
    const d = (await m.run('avisoPrecioFicha()'), m.llamadas[0] || {});
    t('sin mayorista con 30%: pregunta "Dejarlo sin mayorista" o "Usar $1.300"',
      /no tiene precio mayorista/.test(d.msg) && d.o.opciones[0].texto === 'Dejarlo sin mayorista' && d.o.opciones[1].texto === 'Usar $1.300 (costo + %)' && fin(m)[1] === 0, d.o && d.o.opciones);
  }
  {
    const m = armar();
    m.abrir({ nombre: 'Normal', costo: 1000, porcentaje: 60, precio: 1600, porcentajeMayorista: 30, precioMayorista: 1300 });
    t('normal ($1.300 = 1.000 + 30%): sin nota y no pregunta', m.el('pPrecioMayNota').hidden === true && (await m.run('avisoPrecioFicha()')) === true && m.llamadas.length === 0);
    m.el('pPorcentajeMay').value = '42'; m.run('calcPrecioModal()');
    t('  cambiar a 42%: $1.420 -> redondeado $1.450', fin(m)[1] === 1450);
  }
  {
    const m = armar();
    m.abrir({ nombre: 'Normal', costo: 1000, porcentaje: 60, precio: 1600, porcentajeMayorista: 30, precioMayorista: 1300 });
    escribirMay(m, '1500');
    t('escribir el mayorista $1.500: el % mayorista se ajusta a 50 y se guarda $1.500', m.el('pPorcentajeMay').value === '50' && fin(m)[1] === 1500, [m.el('pPorcentajeMay').value, fin(m)]);
    t('  la nota lo dice, y no pregunta nada', /se ajustó a 50%/.test(m.el('pPrecioMayNota').textContent) && (await m.run('avisoPrecioFicha()')) === true && m.llamadas.length === 0);
    t('  el de mostrador no se toca', fin(m)[0] === 1600 && m.el('pPorcentaje').value === '60');
    escribirMay(m, '1234');
    t('  $1.234 (no redondo): % 23,4 y se guarda $1.234 tal cual', m.el('pPorcentajeMay').value === '23.4' && fin(m)[1] === 1234, [m.el('pPorcentajeMay').value, fin(m)]);
    m.doc.activeElement = null;
    m.el('pCosto').value = '2000'; m.run('calcPrecioModal()');
    t('  después el costo sube a $2.000: 2.000 + 23,4% = 2.468 -> $2.500; mostrador 2.000 + 60% = $3.200', fin(m)[1] === 2500 && fin(m)[0] === 3200, fin(m));
  }
  {
    const m = armar({ conf: false });
    m.abrir({ nombre: 'Normal', costo: 1000, porcentaje: 60, precio: 1600, porcentajeMayorista: 30, precioMayorista: 1300 });
    escribirMay(m, '1000');
    t('mayorista escrito igual al costo: la nota avisa', /casi no deja ganancia/.test(m.el('pPrecioMayNota').textContent));
    const r = await m.run('avisoPrecioFicha()');
    const d = m.llamadas[0] || {};
    t('  y al guardar pregunta "no ganás nada", arrancando en Volver', d.tipo === 'conf' && /no ganás nada/.test(d.msg) && d.o.focoEnNo === true, d);
    t('  "Volver" no guarda y deja el cursor en el mayorista', r === false && m.doc.activeElement === m.el('pPrecioMay'));
  }
  {
    const m = armar();
    m.abrir({ nombre: 'Normal', costo: 1000, porcentaje: 60, precio: 1600, porcentajeMayorista: 30, precioMayorista: 1300 });
    escribirMay(m, '0');
    t('escribir 0: sin mayorista, % mayorista 0, no pregunta', fin(m)[1] === 0 && m.el('pPorcentajeMay').value === '0' && (await m.run('avisoPrecioFicha()')) === true && m.llamadas.length === 0);
    escribirMay(m, '');
    t('  borrar para escribir otro no toca el %', m.el('pPorcentajeMay').value === '0');
  }
  {
    /* Los dos cartelitos, uno después del otro: el de mostrador y el mayorista. */
    const m = armar({ opcion: ['dejar', 'calc'] });
    m.abrir({ nombre: 'Granola - Keto', costo: 14401, porcentaje: 75, precio: 25300, porcentajeMayorista: 20, precioMayorista: 17281 });
    const r = await m.run('avisoPrecioFicha()');
    t('mostrador y mayorista distintos: dos cartelitos, primero el de mostrador', m.llamadas.length === 2 && /tiene el precio en \$25\.300/.test(m.llamadas[0].msg) && /mayorista de Granola - Keto es \$17\.281/.test(m.llamadas[1].msg), m.llamadas.map(x => x.msg));
    t('  "Dejar" en el primero y "Usar" en el segundo: $25.300 y $17.300 (14.401 x 1,2 = 17.281,2 -> 17.300)', r === true && fin(m)[0] === 25300 && fin(m)[1] === 17300, fin(m));
  }
  {
    const m = armar({ opcion: ['calc'] });
    m.abrir({ nombre: 'X', costo: 14401, porcentaje: 75, precio: 25300, porcentajeMayorista: 20, precioMayorista: 17281 });
    m.ctx.pedirOpcion = async (msg, o) => { m.llamadas.push({ msg }); return m.llamadas.length === 1 ? 'calc' : null; };
    t('  si cierra el segundo sin elegir, no guarda nada', (await m.run('avisoPrecioFicha()')) === false);
  }
  {
    const m = armar({ conf: true });
    m.abrir({ nombre: 'Sin costo', costo: 0, porcentaje: 0, precio: 32000, porcentajeMayorista: 30, precioMayorista: 26000 });
    t('sin costo con mayorista: se ven $32.000 y $26.000', m.el('pPrecio').value == 32000 && m.el('pPrecioMay').value == 26000);
    await m.run('avisoPrecioFicha()');
    t('  un solo cartelito, que dice los dos precios', m.llamadas.length === 1 && /\$32\.000 \(mayorista \$26\.000\)/.test(m.llamadas[0].msg), m.llamadas.map(x => x.msg));
    t('  y se guardan los dos tal cual', fin(m)[0] === 32000 && fin(m)[1] === 26000);
  }
  {
    const m = armar({ opcion: 'dejar' });
    m.ctx._tipoVentaProd = 'peso';
    m.abrir({ nombre: 'Almendras', costo: 20000, porcentaje: 65, precio: 33000, porcentajeMayorista: 30, precioMayorista: 26100 });
    await m.run('avisoPrecioFicha()');
    t('por peso, el del mayorista también dice "el kilo"', /\$26\.100 el kilo/.test(m.llamadas[0].msg) && /\$26\.000 el kilo/.test(m.llamadas[0].msg), m.llamadas[0] && m.llamadas[0].msg);
  }

  console.log('\n=== en admin.html ===');
  const inpM = (HTML.match(/<input[^>]*id="pPrecioMay"[^>]*>/) || [''])[0];
  t('la casilla del mayorista ya no está bloqueada y escribe con mayoristaEscritoFicha', !/readonly/.test(inpM) && inpM.includes('oninput="mayoristaEscritoFicha(this)"'), inpM);
  const spM = cuerpo(HTML, 'saveProduct');
  t('saveProduct guarda el mayorista de la ficha', spM.includes("const precioMayCalc=(typeof mayoristaFichaFinal==='function')?mayoristaFichaFinal()"));
  t('y el Historial dice si cambió el mayorista', spM.includes("cambios.push('mayorista: $'"));
  t('la primera fila de la tabla de tamaños muestra el mismo mayorista', cuerpo(VAR, '_valoresPpal').includes('mayoristaFichaFinal()'));
  const sp = cuerpo(HTML, 'saveProduct');
  const iA = sp.indexOf('avisoPrecioFicha()'), iG = sp.indexOf('avisoGuardarSinGanancia(_filasSG)');
  t('saveProduct pregunta el precio antes que el aviso de sin ganancia', iA > 0 && iG > iA);
  t('el aviso de sin ganancia mira el precio que se guarda de verdad', sp.includes("precio:(typeof precioFichaFinal==='function'?precioFichaFinal()"));
  t('lo que se guarda es el precio de la ficha', sp.includes("const precioCalc=(typeof precioFichaFinal==='function')?precioFichaFinal()"));
  const inp = (HTML.match(/<input[^>]*id="pPrecio"[^>]*>/) || [''])[0];
  t('la casilla ya no está bloqueada y escribe con precioEscritoFicha', !/readonly/.test(inp) && inp.includes('oninput="precioEscritoFicha(this)"'), inp);
  const om = cuerpo(HTML, 'openModal');
  t('openModal: nuevo sin precio fijo, uno que existe con el suyo', om.includes('precioFichaReset()') && om.includes('precioFichaAlAbrir(p)'));
  t('el script se carga', HTML.includes('<script src="admin-precio-ficha.js"></script>'));
  t('la primera fila de la tabla de tamaños muestra el mismo precio', cuerpo(VAR, '_valoresPpal').includes('precioFichaFinal()'));

  console.log('\n=== el aviso de sin ganancia con un % negativo ===');
  {
    const c2 = { console, Math, Number, String, msgs: [] };
    c2.pedirConfirmacion = async (msg) => { c2.msgs.push(msg); return true; };
    vm.createContext(c2);
    vm.runInContext(cuerpo(COSTOS, '_mayoristaSinGanancia') + cuerpo(COSTOS, '_precioSinGanancia') +
      constLinea(COSTOS, '_costoPesos') + cuerpo(COSTOS, 'avisoGuardarSinGanancia'), c2);
    await vm.runInContext('avisoGuardarSinGanancia([{ nombre: "X", costo: 1000, precio: 900, porcentaje: -10 }])', c2);
    const msg = c2.msgs[0] || '';
    t('precio $900 con costo $1.000: dice "por debajo del costo", no "no tiene % cargado"',
      msg.includes('por debajo del costo') && !msg.includes('no tiene % de ganancia'), msg);
    t('  y dice "subile el precio", no "cargale el % de ganancia"', msg.includes('subile el precio') && !msg.includes('cargale'), msg);
    c2.msgs.length = 0;
    await vm.runInContext('avisoGuardarSinGanancia([{ nombre: "X", costo: 1000, precio: 1000, porcentaje: 0 }])', c2);
    t('  con el % en 0, sigue diciendo "cargale el % de ganancia"', (c2.msgs[0] || '').includes('cargale el % de ganancia'), c2.msgs[0]);
  }

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})();
