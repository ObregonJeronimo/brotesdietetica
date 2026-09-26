/* EL TICKET TÉRMICO: EL PAPEL, NO EL DIÁLOGO
   =============================================================================
   Primera parte de SPEC-ROLES-TICKET.md §B: el documento. Se arma con lo que
   quedó GUARDADO en la venta -reimprimir una venta vieja tiene que dar el mismo
   papel que salió ese día- y a granel la cantidad va en kg con el precio por kg,
   que es donde vive la trampa del x1000: 250 g a $32.830 el kilo son $8.208, y
   la cuenta cruda da $8.207.500, impreso y en la mano del cliente.
   ============================================================================= */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'admin-ticket.js'), 'utf8');

let ok = 0, mal = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d + (extra ? '   (' + extra + ')' : '')); }
  else { mal++; console.log('  FALLA ' + d + (extra ? '   (' + extra + ')' : '')); }
};
const grupo = n => console.log('\n' + n);

const SB = { console, window: {}, NEGOCIO: { nombre: 'Brotes Dietética' }, Date, Math, Number, String, Object, Array };
SB.globalThis = SB;
vm.createContext(SB);
vm.runInContext(SRC, SB, { filename: 'admin-ticket.js' });
const doc = (v, cfg) => vm.runInContext('ticketDocumento(' + JSON.stringify(v) + ',' + JSON.stringify(cfg || null) + ')', SB);

const FECHA = { seconds: 1789000000 };

grupo('A granel: 250 g a $32.830 el kilo');
let html = doc({ numero: 12, fecha: FECHA, medioPago: 'Efectivo', total: 8208,
  items: [{ nombre: 'Almendras', precio: 32830, cantidad: 250, tipoVenta: 'peso', subtotal: 8208 }] });
t('la cantidad sale en kg', html.indexOf('0,250 kg') > 0);
t('el precio unitario dice /kg', html.indexOf('$32.830/kg') > 0);
t('el importe son $8.208', html.indexOf('$8.208') > 0);
t('y NO $8.207.500 (la trampa del x1000)', html.indexOf('8.207.500') < 0);
t('no imprime gramos como si fueran unidades', html.indexOf('250 u') < 0);

grupo('Por unidad');
html = doc({ numero: 13, fecha: FECHA, medioPago: 'Efectivo', total: 3600,
  items: [{ nombre: 'Yerba', precio: 1200, cantidad: 3, tipoVenta: 'unidad', subtotal: 3600 }] });
t('la cantidad va entera', html.indexOf('3 u') > 0);
t('el precio no lleva /kg', html.indexOf('/kg') < 0);
t('el importe son $3.600', html.indexOf('$3.600') > 0);

grupo('Manda lo GUARDADO, no lo recalculado');
html = doc({ numero: 14, fecha: FECHA, medioPago: 'Efectivo', total: 999,
  items: [{ nombre: 'Yerba', precio: 1200, cantidad: 3, tipoVenta: 'unidad', subtotal: 111 }] });
t('el total impreso es el de la venta', html.indexOf('$999') > 0, 'aunque los items sumen otra cosa');
t('y el renglon usa su subtotal guardado', html.indexOf('$111') > 0);

grupo('Una venta vieja, sin subtotal ni tipoVenta guardados');
html = doc({ numero: 15, fecha: FECHA, medioPago: 'Efectivo',
  items: [{ nombre: 'Algo', precio: 1000, cantidad: 2 }] });
t('sin tipoVenta se trata como unidad', html.indexOf('2 u') > 0);
t('y el importe se calcula: $2.000', html.indexOf('$2.000') > 0);

grupo('El vuelto, solo en efectivo');
const conVuelto = { numero: 16, fecha: FECHA, medioPago: 'Efectivo', medioPagoKey: 'efectivo', total: 8208, pagoCon: 10000,
  items: [{ nombre: 'Almendras', precio: 32830, cantidad: 250, tipoVenta: 'peso', subtotal: 8208 }] };
html = doc(conVuelto);
t('sale el vuelto', html.indexOf('Vuelto') > 0 && html.indexOf('$1.792') > 0);
html = doc(Object.assign({}, conVuelto, { medioPago: 'Tarjeta de debito', medioPagoKey: 'tarjeta' }));
t('con tarjeta NO sale', html.indexOf('Vuelto') < 0);
html = doc(Object.assign({}, conVuelto, { pagoCon: 0 }));
t('sin lo que pago tampoco', html.indexOf('Vuelto') < 0);

grupo('Descuento y envio');
html = doc({ numero: 17, fecha: FECHA, medioPago: 'Efectivo', total: 3100, subtotalProductos: 3600,
  descuentoPct: 13.89, descuentoMonto: 500, envio: 0,
  items: [{ nombre: 'Yerba', precio: 1200, cantidad: 3, tipoVenta: 'unidad', subtotal: 3600 }] });
t('muestra el subtotal', html.indexOf('Subtotal') > 0);
t('y el descuento con su porcentaje', html.indexOf('13.89%') > 0 && html.indexOf('-$500') > 0);
html = doc({ numero: 18, fecha: FECHA, medioPago: 'Efectivo', total: 5600, subtotalProductos: 3600, envio: 2000,
  items: [{ nombre: 'Yerba', precio: 1200, cantidad: 3, tipoVenta: 'unidad', subtotal: 3600 }] });
t('el envio sale cuando se cobro', html.indexOf('Envío') > 0 && html.indexOf('$2.000') > 0);

grupo('La cabecera y el pie');
html = doc({ numero: 19, fecha: FECHA, medioPago: 'Efectivo', total: 100, items: [] }, { pie: 'CUIT 20-12345678-9' });
t('el nombre del negocio', html.indexOf('Brotes Dietética') > 0);
t('el numero de venta', html.indexOf('#0019') > 0);
t('la fecha y hora', /\d{2}\/\d{2}\/\d{4}/.test(html));
t('el pie configurado', html.indexOf('CUIT 20-12345678-9') > 0);
t('el medio de pago', html.indexOf('Efectivo') > 0);

grupo('El ancho del papel');
html = doc({ numero: 20, fecha: FECHA, total: 1, items: [] }, { ancho: '58' });
t('58 mm arma el papel angosto', html.indexOf('58mm') > 0 && html.indexOf('80mm') < 0);
html = doc({ numero: 21, fecha: FECHA, total: 1, items: [] }, { ancho: '80' });
t('80 mm el ancho', html.indexOf('80mm') > 0);
html = doc({ numero: 22, fecha: FECHA, total: 1, items: [] });
t('sin configurar usa 80', html.indexOf('80mm') > 0);

grupo('Nada de HTML del nombre del producto adentro del papel');
html = doc({ numero: 23, fecha: FECHA, total: 1, items: [{ nombre: '<script>alert(1)</script>', precio: 1, cantidad: 1, subtotal: 1 }] });
t('el nombre va escapado', html.indexOf('<script>alert') < 0 && html.indexOf('&lt;script&gt;') > 0);

console.log('\n' + ok + ' pasaron, ' + mal + ' fallaron');
process.exit(mal ? 1 : 0);
