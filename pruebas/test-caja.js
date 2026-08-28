/* Test de la aritmetica del arqueo. Carga admin-caja.js en un contexto vm junto
   con el codigo de prueba, para poder tocar las variables de modulo directamente. */
const fs = require('fs');
const vm = require('vm');

const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'admin-caja.js'), 'utf8');

/* keyDeMedio / medioKeyDeVenta son los de admin.html (Capa 0), copiados tal cual */
const HELPERS = `
function keyDeMedio(m){const t=(m||'').toLowerCase();
  if(t.startsWith('efec'))return'efectivo';
  if(t.startsWith('tarj')||t.includes('debi')||t.includes('cred'))return'tarjeta';
  if(t.startsWith('trans'))return'transferencia';
  if(t.includes('corriente')||t.includes('fiado'))return'cuenta_corriente';
  return'otro';}
function medioKeyDeVenta(v){return (v&&v.medioPagoKey)||keyDeMedio(v&&v.medioPago);}
`;

const TESTS = `
let fallos = 0, pasados = 0;
function chk(nombre, real, esperado){
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if(ok){ pasados++; console.log('  OK   ' + nombre); }
  else  { fallos++; console.log('  FALLA ' + nombre + '\\n        esperado: ' + JSON.stringify(esperado) + '\\n        real:     ' + JSON.stringify(real)); }
}

/* ---------- Caso del plan: el que decide si la caja sirve o no ---------- */
console.log('\\nCaso 1 - mezcla de medios de pago');
cajaActual = { montoInicial: 20000, estado: 'abierta' };
cajaVentas = [
  { total: 10000, envio: 0, medioPago: 'Efectivo' },
  { total: 30000, envio: 0, medioPago: 'Tarjeta de debito' },
  { total: 5000,  envio: 0, medioPago: 'Cuenta corriente' }
];
cajaMovs = [
  { tipo: 'ingreso', monto: 2000 },
  { tipo: 'egreso',  monto: 8000 }
];
let t = calcularTotalesCaja();
chk('esperado = 20000 + 10000 + 2000 - 8000', t.esperado, 24000);
chk('tarjeta NO suma al efectivo', t.esperado !== 54000, true);
chk('cuenta corriente NO suma al efectivo', t.esperado !== 29000, true);
chk('bruto incluye todas las ventas', t.bruto, 45000);
chk('desglose efectivo', t.porMedio.efectivo, 10000);
chk('desglose tarjeta', t.porMedio.tarjeta, 30000);
chk('desglose cuenta corriente', t.porMedio.cuenta_corriente, 5000);

/* ---------- El envio SI entra al cajon ---------- */
console.log('\\nCaso 2 - venta con envio cobrado en efectivo');
cajaActual = { montoInicial: 0, estado: 'abierta' };
cajaVentas = [ { total: 12000, envio: 2000, medioPago: 'Efectivo' } ];
cajaMovs = [];
t = calcularTotalesCaja();
chk('esperado usa el BRUTO (con flete)', t.esperado, 12000);
chk('ventasEnvio queda registrado aparte', t.envio, 2000);
chk('si usara el neto daria 10000 (faltante de 2000)', t.esperado !== 10000, true);

/* ---------- medioPagoKey guardado pisa al texto libre ---------- */
console.log('\\nCaso 3 - ventas viejas sin medioPagoKey');
cajaActual = { montoInicial: 5000, estado: 'abierta' };
cajaVentas = [
  { total: 1000, medioPago: 'EFECTIVO' },
  { total: 2000, medioPago: 'efectivo ' },
  { total: 3000, medioPagoKey: 'efectivo', medioPago: 'lo que sea' },
  { total: 4000, medioPago: 'Transferencia bancaria' },
  { total: 7000, medioPago: 'Mercado Pago' }
];
cajaMovs = [];
t = calcularTotalesCaja();
chk('normaliza mayusculas y espacios', t.porMedio.efectivo, 6000);
chk('medioPagoKey tiene prioridad', t.porMedio.efectivo === 6000, true);
chk('transferencia va a su casillero', t.porMedio.transferencia, 4000);
chk('desconocido cae en "otro" y no en efectivo', t.porMedio.otro, 7000);
chk('esperado = 5000 + 6000', t.esperado, 11000);

/* ---------- Caja vacia ---------- */
console.log('\\nCaso 4 - caja recien abierta, sin nada');
cajaActual = { montoInicial: 15000, estado: 'abierta' };
cajaVentas = []; cajaMovs = [];
t = calcularTotalesCaja();
chk('esperado = fondo inicial', t.esperado, 15000);
chk('count en cero', t.count, 0);

/* ---------- Egresos pueden dejar la caja por debajo del fondo ---------- */
console.log('\\nCaso 5 - egreso mayor a lo vendido');
cajaActual = { montoInicial: 10000, estado: 'abierta' };
cajaVentas = [ { total: 3000, medioPago: 'Efectivo' } ];
cajaMovs = [ { tipo: 'egreso', monto: 12000 } ];
t = calcularTotalesCaja();
chk('esperado = 10000 + 3000 - 12000', t.esperado, 1000);

/* ---------- Campos faltantes no rompen la suma ---------- */
console.log('\\nCaso 6 - datos incompletos');
cajaActual = { montoInicial: 1000, estado: 'abierta' };
cajaVentas = [ { medioPago: 'Efectivo' }, { total: null, medioPago: 'Efectivo' }, { total: 500, medioPago: 'Efectivo' } ];
cajaMovs = [ { tipo: 'ingreso' }, { tipo: 'egreso', monto: null } ];
t = calcularTotalesCaja();
chk('total/monto ausentes cuentan como 0', t.esperado, 1500);
chk('sin NaN', Number.isFinite(t.esperado), true);

/* ---------- Minorista y mayorista por separado ----------
   La caja decia "Ventas (3)" y para saber QUE se habia vendido habia que irse a
   la seccion de ventas y revisar una por una. El dato ya estaba: cada venta
   viene etiquetada con _tipo segun de cual de las dos colecciones salio. */
console.log('\\nCaso 5 - la caja separa minorista de mayorista');
cajaActual = { montoInicial: 0, estado: 'abierta' };
cajaMovs = [];
cajaVentas = [
  { total: 1000, medioPago: 'Efectivo', _tipo: 'minorista' },
  { total: 2500, medioPago: 'Efectivo', _tipo: 'minorista' },
  { total: 9000, medioPago: 'Transferencia', _tipo: 'mayorista' }
];
let tt = calcularTotalesCaja();
chk('cuenta 2 minoristas', tt.porTipo.minorista.count, 2);
chk('suma 3500 en minorista', tt.porTipo.minorista.total, 3500);
chk('cuenta 1 mayorista', tt.porTipo.mayorista.count, 1);
chk('suma 9000 en mayorista', tt.porTipo.mayorista.total, 9000);
chk('los dos suman el bruto', tt.porTipo.minorista.total + tt.porTipo.mayorista.total, tt.bruto);
chk('y las cuentas suman el total', tt.porTipo.minorista.count + tt.porTipo.mayorista.count, tt.count);

/* Sin _tipo se cuenta como minorista: es lo que eran todas las ventas antes de
   que existiera la mayorista, asi que una venta vieja no puede desaparecer. */
cajaVentas = [{ total: 500, medioPago: 'Efectivo' }];
tt = calcularTotalesCaja();
chk('una venta sin _tipo cuenta como minorista', tt.porTipo.minorista.count, 1);
chk('y no se pierde del total', tt.count, 1);

console.log('\\nCaso 6 - el texto de la cantidad');
chk('una sola', _nVentas(1), '1 venta');
chk('varias', _nVentas(4), '4 ventas');
chk('ninguna', _nVentas(0), '0 ventas');


console.log('');
console.log('Caso 7 - la columna del modal de ventas');
const _col = _columnaVentas('Ventas minoristas', 'bi-bag', [
  { numero: 12, total: 1500, cliente: 'Ana', medioPago: 'Efectivo',
    items: [{ nombre: 'Nueces', cantidad: 2, precio: 750 }] },
  { numero: 13, total: 900, medioPago: 'Tarjeta', items: [] }
]);
const tiene = (h, t) => h.indexOf(t) >= 0;
chk('pone el titulo', tiene(_col, 'Ventas minoristas'), true);
chk('dice cuantas son', tiene(_col, '2 ventas'), true);
chk('suma el total de la columna', tiene(_col, '2.400'), true);
chk('lista el cliente', tiene(_col, 'Ana'), true);
chk('el que no tiene queda como consumidor final', tiene(_col, 'Consumidor final'), true);
chk('muestra el medio de pago', tiene(_col, 'Tarjeta'), true);
chk('detalla el item', tiene(_col, 'Nueces'), true);
chk('las etiquetas div abren y cierran igual',
    _col.split('<div').length, _col.split('</div>').length);

const _vacia = _columnaVentas('Ventas mayoristas', 'bi-box-seam', []);
chk('sin ventas avisa en vez de quedar en blanco', tiene(_vacia, 'No hubo ventas'), true);
chk('y dice 0 ventas', tiene(_vacia, '0 ventas'), true);

console.log('\\n' + pasados + ' pasaron, ' + fallos + ' fallaron');
globalThis.__fallos = fallos;
`;

const sandbox = {
  console,
  db: null,
  auth: null,
  firebase: null,
  window: {},
  document: { getElementById: () => null },
  esc: s => String(s == null ? '' : s),
  showAdminToast: () => {},
  hoyAR: () => '2026-08-14'
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

/* Un solo script: asi el codigo de prueba comparte el scope lexico del modulo
   y puede asignar cajaVentas / cajaMovs / cajaActual, que son `let`. */
vm.runInContext(HELPERS + '\n' + SRC + '\n' + TESTS, sandbox, { filename: 'admin-caja.js' });

process.exit(sandbox.__fallos > 0 ? 1 : 0);
