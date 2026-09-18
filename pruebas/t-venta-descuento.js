/* EL DESCUENTO DE LA VENTA EN $ Y EN %, Y EL CIERRE DEL SELECTOR DE CLIENTE
   =============================================================================
   Portado de YERCO (commit 60e7269). Lo que NO se portó igual: alla el subtotal
   de items es precio*cantidad, y acá eso estaria mil veces mal para los de
   granel -precio POR KILO, cantidad en GRAMOS-, asi que el subtotal pasa por
   subtotalItem(). Esa es la afirmacion central de esta suite.

   Las funciones se sacan del fuente real de admin.html y se corren en un vm con
   un document de mentira. Lo que depende de eventos y foco -el desplegable- se
   verifica en el navegador con pruebas/venta-banco.html; acá solo se afirma que
   los tres arreglos estan puestos donde tienen que estar.
   ============================================================================= */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ADMIN = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

let ok = 0, mal = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d + (extra ? '   (' + extra + ')' : '')); }
  else { mal++; console.log('  FALLA ' + d + (extra ? '   (' + extra + ')' : '')); }
};
const grupo = n => console.log('\n' + n);

/* ---------------------------------------------- las funciones, del fuente real */
function cuerpo(nombre) {
  const i = ADMIN.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  let prof = 0, fin = -1;
  for (let j = ADMIN.indexOf('{', i); j < ADMIN.length; j++) {
    if (ADMIN[j] === '{') prof++;
    else if (ADMIN[j] === '}') { prof--; if (!prof) { fin = j; break; } }
  }
  return fin < 0 ? null : ADMIN.slice(i, fin + 1);
}

const NECESARIAS = ['esPorPeso', 'tipoVentaDe', 'precioConDsc', 'subtotalItem', 'costoItem',
  'calcularTotalesVenta', '_ventaSubtotalItems', '_syncDescuentoInputs',
  'onChangeDescuento', 'onChangeDescuentoMonto', 'renderVentaItems'];

grupo('Las funciones existen en admin.html');
const faltan = NECESARIAS.filter(n => !cuerpo(n));
t('estan las ' + NECESARIAS.length + ' que hacen falta', faltan.length === 0, faltan.join(', ') || 'ninguna falta');
/* =================== 4. EL FUENTE: lo que no se puede correr acá =================== */
grupo('FIX 2 en el HTML');
t('existe el input del monto', /id="ventaDescuentoMonto"/.test(ADMIN));
t('llama a onChangeDescuentoMonto', /id="ventaDescuentoMonto"[^>]*oninput="onChangeDescuentoMonto\(\)"/.test(ADMIN));
t('el % acepta decimales (step 0.01)', /id="ventaDescuentoPct"[^>]*step="0\.01"/.test(ADMIN));
t('abrir una venta nueva resetea el monto', /if\(dcInput\)dcInput\.value='0';const dcMon=document\.getElementById\('ventaDescuentoMonto'\);if\(dcMon\)dcMon\.value='0'/.test(ADMIN));
t('editar una venta precarga el monto', /if\(dcInput\)dcInput\.value=v\.descuentoPct\|\|0;const dcMon=document\.getElementById\('ventaDescuentoMonto'\);if\(dcMon\)dcMon\.value=v\.descuentoMonto\|\|0/.test(ADMIN));
t('_ventaSubtotalItems pasa por subtotalItem (no precio*cantidad)',
  /_ventaSubtotalItems\(\)\{return ventaItems\.reduce\(function\(s,i\)\{return s\+subtotalItem\(i\);\}/.test(ADMIN));
t('saveVenta sigue guardando descuentoPct', /descuentoPct:totales\.descuentoPct\|\|0/.test(ADMIN));

grupo('FIX 1 en el selector de cliente');
t('la carga async solo re-abre si el input sigue enfocado',
  /if\(document\.activeElement===document\.getElementById\('ventaCliente'\)\)showClienteSelect\(\);/.test(ADMIN));
t('ya no re-abre a ciegas',
  !/clientesAuthData=snap\.docs\.map\(d=>\(\{uid:d\.id,\.\.\.d\.data\(\)\}\)\);\s*\n\s*showClienteSelect\(\);/.test(ADMIN));
t('la lista de la venta hace preventDefault en su mousedown',
  /list\.onmousedown=function\(e\)\{ e\.preventDefault\(\); \};\s*\n\s*list\.classList\.add\('open'\);/.test(ADMIN));
t('son DOS listas con preventDefault (venta y pedido)',
  (ADMIN.match(/list\.onmousedown=function\(e\)\{ e\.preventDefault\(\); \};/g) || []).length === 2,
  (ADMIN.match(/list\.onmousedown=function\(e\)\{ e\.preventDefault\(\); \};/g) || []).length + ' listas');
t('el cierre al tocar afuera es pointerdown en captura',
  /document\.addEventListener\('pointerdown',function\(e\)\{var list=document\.getElementById\('clienteSelectList'\)[\s\S]*?\},true\);/.test(ADMIN));
t('y esta scopeado al modal de la venta',
  /e\.target\.closest\('#ventaModal \.cliente-select-wrap'\)/.test(ADMIN));
t('sin cliente elegido deja Consumidor Final',
  /if\(!ventaClienteSelected\)pickCliente\('','Consumidor Final'\);\},true\)/.test(ADMIN));
t('ya no queda el listener de click sin scope',
  !/addEventListener\('click',function\(e\)\{if\(!e\.target\.closest\('\.cliente-select-wrap'\)\)/.test(ADMIN));


/* Lo de arriba se afirma sobre el TEXTO del archivo y corre siempre. Lo de abajo
   necesita que las funciones existan: si falta alguna se corta aca, y al menos
   quedan dichas todas las de arriba en vez de una sola linea. */
if (faltan.length) { console.log('\n' + ok + ' pasaron, ' + (mal) + ' fallaron'); process.exit(1); }

/* ------------------------------------------------------ el panel, lo minimo */
const CAMPOS = {};
function elemento(id) {
  return { id, value: '', textContent: '', innerHTML: '', style: {}, focus() { SANDBOX.document.activeElement = this; } };
}
const SANDBOX = {
  console,
  window: { _pedidoCuponVenta: null, _pedidoEnvioVenta: null },
  document: {
    activeElement: null,
    getElementById: (id) => (CAMPOS[id] || (CAMPOS[id] = elemento(id)))
  },
  esc: s => String(s == null ? '' : s),
  ventaItems: [],
  ventaTipoEntrega: 'retiro',
  ENVIO_PRECIO: 2000,
  ENVIO_GRATIS_DESDE: Infinity,
  editingVentaId: null,
  ventasData: []
};
SANDBOX.globalThis = SANDBOX;
vm.createContext(SANDBOX);
vm.runInContext(NECESARIAS.map(cuerpo).join('\n'), SANDBOX, { filename: 'admin.html' });

const correr = js => vm.runInContext(js, SANDBOX);
/* Los elementos se crean al pedirlos, igual que los pide el panel. */
const campo = id => SANDBOX.document.getElementById(id);
const pct = () => Number(campo('ventaDescuentoPct').value);
const monto = () => Number(campo('ventaDescuentoMonto').value);
const totales = () => correr('calcularTotalesVenta()');
function items(arr) { SANDBOX.ventaItems = arr; }
function tocarMonto(v) { campo('ventaDescuentoMonto').value = String(v); correr('onChangeDescuentoMonto()'); }
function tocarPct(v) { campo('ventaDescuentoPct').value = String(v); correr('onChangeDescuento()'); }

/* =================== 1. POR UNIDAD: el caso que trajo YERCO =================== */
grupo('Por unidad: 3 x $1.200 = $3.600');
items([{ id: 'p1', nombre: 'Yerba', precio: 1200, costo: 600, cantidad: 3, descuento: 0, tipoVenta: 'unidad' }]);
t('el subtotal de items da 3600', correr('_ventaSubtotalItems()') === 3600, '$' + correr('_ventaSubtotalItems()'));

tocarMonto(500);
t('$500 se convierte en 13,89%', pct() === 13.89, pct() + '%');
t('y lo que se descuenta son $500 exactos', totales().descuentoMonto === 500, '$' + totales().descuentoMonto);
t('el total queda en $3.100', totales().total === 3100, '$' + totales().total);

tocarPct(25);
t('25% se convierte en $900', monto() === 900, '$' + monto());
t('descuentoPct es lo que se guarda', totales().descuentoPct === 25);

tocarMonto(999999);
t('un monto mayor al subtotal se topea al subtotal', pct() === 100 && totales().descuentoMonto === 3600,
  pct() + '% / $' + totales().descuentoMonto);
t('y el total no se va abajo de cero', totales().total === 0);

tocarMonto(-50);
t('un monto negativo queda en 0', pct() === 0);
tocarPct(-10); t('un % negativo queda en 0', pct() === 0);
tocarPct(150); t('un % mayor a 100 se topea en 100', pct() === 100);
tocarMonto('');
t('el campo vacio no rompe nada', pct() === 0 && totales().descuentoMonto === 0);

/* ============ 2. A GRANEL: LA TRAMPA DEL x1000, lo que separa el port ============
   500 g de algo a $4.500 el kilo son $2.250, NO $2.250.000. Con la formula de
   YERCO (precio*cantidad) este bloque entero da mal por mil. */
grupo('A granel: 500 g a $4.500 el kilo = $2.250  (la trampa del x1000)');
items([{ id: 'p2', nombre: 'Nuez pecan', precio: 4500, costo: 2000, cantidad: 500, descuento: 0, tipoVenta: 'peso' }]);
t('el subtotal son $2.250 y no $2.250.000', correr('_ventaSubtotalItems()') === 2250, '$' + correr('_ventaSubtotalItems()'));
t('_ventaSubtotalItems coincide con calcularTotalesVenta',
  correr('_ventaSubtotalItems()') === totales().subtotal);

tocarMonto(500);
t('$500 da 22,22% y no 0,02%', pct() === 22.22, pct() + '%');
t('y se descuentan $500, no $5', totales().descuentoMonto === 500, '$' + totales().descuentoMonto);
tocarPct(10);
t('10% de $2.250 son $225', monto() === 225, '$' + monto());

grupo('Mezcla de unidad y granel');
items([
  { id: 'p1', nombre: 'Yerba', precio: 1200, costo: 600, cantidad: 3, descuento: 0, tipoVenta: 'unidad' },
  { id: 'p2', nombre: 'Nuez pecan', precio: 4500, costo: 2000, cantidad: 500, descuento: 0, tipoVenta: 'peso' }
]);
t('3600 + 2250 = 5850', correr('_ventaSubtotalItems()') === 5850, '$' + correr('_ventaSubtotalItems()'));
tocarMonto(585);
t('$585 sobre 5850 da 10%', pct() === 10, pct() + '%');

grupo('El descuento por item entra en la cuenta');
items([{ id: 'p1', nombre: 'Yerba', precio: 1200, costo: 600, cantidad: 3, descuento: 50, tipoVenta: 'unidad' }]);
t('con 50% por item el subtotal es 1800', correr('_ventaSubtotalItems()') === 1800, '$' + correr('_ventaSubtotalItems()'));
tocarMonto(900);
t('$900 sobre 1800 da 50%', pct() === 50, pct() + '%');

/* =================== 3. QUE EL CAMPO $ NO PISE LO QUE SE TIPEA =================== */
grupo('El campo $ no se pisa mientras se escribe adentro');
items([{ id: 'p1', nombre: 'Yerba', precio: 1200, costo: 600, cantidad: 3, descuento: 0, tipoVenta: 'unidad' }]);
tocarPct(20);
t('con el foco afuera, el % actualiza el $', monto() === 720, '$' + monto());
campo('ventaDescuentoMonto').focus();
campo('ventaDescuentoMonto').value = '5';
tocarPct(30);
t('con el foco DENTRO del $, el % no lo pisa', campo('ventaDescuentoMonto').value === '5',
  campo('ventaDescuentoMonto').value);
SANDBOX.document.activeElement = null;
correr('renderVentaItems()');
t('y renderVentaItems lo deja al dia cuando se sale', monto() === 1080, '$' + monto());
items([]);
correr('renderVentaItems()');
t('sin items el campo $ vuelve a 0', monto() === 0, '$' + monto());

console.log('\n' + ok + ' pasaron, ' + mal + ' fallaron');
process.exit(mal ? 1 : 0);
