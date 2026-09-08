/**
 * CUPONES IMPRESOS EN EL TICKET.
 *
 * Una PROMO es lo que se configura en el panel. Un CÓDIGO es una entrega de esa
 * promo: sale impreso en un ticket y vale una sola vez.
 *
 * LO QUE ESTA PRUEBA CUIDA
 *
 * 1. Que el carácter de control atrape los errores de tipeo. Es lo único que
 *    separa "ese código no existe" de aceptar por casualidad el cupón de otro
 *    cliente. Se prueba EXHAUSTIVAMENTE: cada carácter del código cambiado por
 *    cada uno de los otros 30, sobre muchos códigos. No un ejemplo.
 *
 * 2. Que no se pueda descontar más de lo que vale la venta. Un total en negativo
 *    no significa nada y la caja no cierra.
 *
 * 3. Que un cupón usado, vencido o apagado no pase.
 */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

const src = fs.readFileSync(path.join(RAIZ, 'admin-cupones-ticket.js'), 'utf8');
const M = new Function(src.slice(0, src.indexOf("if (typeof window !== 'undefined')")) + `;return {
  ALF: CTK_ALFABETO, LARGO: CTK_LARGO,
  nuevo: cuponTicketNuevoCodigo, norm: cuponTicketNormalizar,
  formato: cuponTicketFormatoOk, validar: cuponTicketValidar,
  desdePromo: cuponTicketDesdePromo, promos: cuponTicketPromosDisponibles };`)();

let ok = 0, fail = 0;
const t = (d, c) => { if (c) { ok++; console.log('  OK   ' + d); } else { fail++; console.log('  FALLA ' + d); } };

/* Azar reproducible: con Math.random un fallo no se podria volver a mirar. */
let _s = 12345;
const azar = () => { _s = (_s * 1103515245 + 12345) % 2147483648; return _s / 2147483648; };

/* ===================================================== EL ALFABETO */
console.log('\n-- los caracteres --');
t('no tiene los que se confunden al leer (0 O 1 I L)',
  ['0', 'O', '1', 'I', 'L'].every(c => M.ALF.indexOf(c) < 0));
t('no tiene repetidos', new Set(M.ALF).size === M.ALF.length);
t('son 31', M.ALF.length === 31);
t('todos son letras o numeros', /^[0-9A-Z]+$/.test(M.ALF));

/* ===================================================== EL CÓDIGO */
console.log('\n-- el codigo --');
const cod = M.nuevo(azar);
t('tiene 7 caracteres: 6 mas el de control', cod.length === M.LARGO + 1);
t('usa solo el alfabeto', [...cod].every(c => M.ALF.indexOf(c) >= 0));
t('se da por bien formado', M.formato(cod));
/* Dos códigos seguidos no pueden salir iguales. */
const muchos = new Set();
for (let i = 0; i < 5000; i++) muchos.add(M.nuevo(azar));
t('5000 codigos seguidos, ninguno repetido', muchos.size === 5000);
t('todos bien formados', [...muchos].every(M.formato));

/* Se acepta como lo tipea una persona, no como lo imprimio la impresora. */
console.log('\n-- como lo tipea la gente --');
t('en minuscula', M.formato(cod.toLowerCase()));
t('con espacios', M.formato(cod.slice(0, 3) + ' ' + cod.slice(3)));
t('con guion', M.formato(cod.slice(0, 3) + '-' + cod.slice(3)));
t('con espacios a los costados', M.formato('  ' + cod + '  '));
t('vacio no pasa', !M.formato(''));
t('null no rompe', !M.formato(null));
t('uno corto no pasa', !M.formato(cod.slice(0, 5)));
t('uno largo no pasa', !M.formato(cod + 'X'));

/* ============================================ EL CONTROL, EXHAUSTIVO
   Este es el punto. Se toman 300 codigos y a cada uno se le cambia CADA
   caracter por CADA uno de los otros 30: 300 x 7 x 30 = 63.000 codigos mal
   tipeados. Ninguno puede pasar. */
console.log('\n-- que atrape los errores de tipeo --');
let probados = 0, colados = 0;
for (let n = 0; n < 300; n++) {
  const c = M.nuevo(azar);
  for (let i = 0; i < c.length; i++) {
    for (const letra of M.ALF) {
      if (letra === c[i]) continue;
      const roto = c.slice(0, i) + letra + c.slice(i + 1);
      probados++;
      if (M.formato(roto)) colados++;
    }
  }
}
t('ningun error de un caracter se cuela (' + probados.toLocaleString('es-AR') + ' probados)',
  colados === 0);

/* Transposiciones: cambiar dos caracteres de lugar es el otro error tipico. */
let tProb = 0, tColados = 0;
for (let n = 0; n < 500; n++) {
  const c = M.nuevo(azar);
  for (let i = 0; i < c.length - 1; i++) {
    if (c[i] === c[i + 1]) continue;
    const roto = c.slice(0, i) + c[i + 1] + c[i] + c.slice(i + 2);
    tProb++;
    if (M.formato(roto)) tColados++;
  }
}
t('las transposiciones tambien se atrapan (' + tProb + ' probadas, ' + tColados + ' coladas)',
  tColados === 0);

/* ===================================================== LA VALIDACIÓN */
console.log('\n-- cuando se puede usar y cuando no --');
const HOY = new Date('2026-09-07T12:00:00').getTime();
const base = { codigo: 'ABC2345', monto: 2000, limiteCompra: 0, maxUsos: 1, usos: 0, activo: true };

t('uno nuevo, en una venta que da, pasa', M.validar(base, 10000, HOY).ok);
t('  y descuenta lo que dice', M.validar(base, 10000, HOY).monto === 2000);

t('uno ya usado no pasa', !M.validar(Object.assign({}, base, { usos: 1 }), 10000, HOY).ok);
t('  y lo dice claro', /ya se us/.test(M.validar(Object.assign({}, base, { usos: 1 }), 10000, HOY).motivo));
t('uno apagado no pasa', !M.validar(Object.assign({}, base, { activo: false }), 10000, HOY).ok);
t('uno que no existe no pasa', !M.validar(null, 10000, HOY).ok);

/* Vencimiento */
const vencido = Object.assign({}, base, { vence: new Date(HOY - 86400000) });
const vigente = Object.assign({}, base, { vence: new Date(HOY + 86400000) });
t('uno vencido no pasa', !M.validar(vencido, 10000, HOY).ok);
t('  y dice cuando vencio', /venci/.test(M.validar(vencido, 10000, HOY).motivo));
t('uno que vence manana si pasa', M.validar(vigente, 10000, HOY).ok);
t('sin vencimiento no caduca', M.validar(base, 10000, HOY).ok);
/* Las fechas de Firestore vienen como {seconds}, no como Date. */
t('entiende la fecha de Firestore',
  !M.validar(Object.assign({}, base, { vence: { seconds: (HOY - 86400000) / 1000 } }), 10000, HOY).ok);

/* Compra mínima */
const conMinimo = Object.assign({}, base, { limiteCompra: 15000 });
t('por debajo del minimo no pasa', !M.validar(conMinimo, 10000, HOY).ok);
t('  y dice cuanto falta', /15\.000/.test(M.validar(conMinimo, 10000, HOY).motivo));
t('justo en el minimo si pasa', M.validar(conMinimo, 15000, HOY).ok);

/* El tope: nunca mas que la venta. */
t('no descuenta mas que el total de la venta',
  M.validar(Object.assign({}, base, { monto: 50000 }), 8000, HOY).monto === 8000);
t('una venta en cero no deja usarlo', !M.validar(base, 0, HOY).ok);
t('un cupon sin monto no pasa', !M.validar(Object.assign({}, base, { monto: 0 }), 10000, HOY).ok);

/* ===================================================== DE PROMO A CÓDIGO */
console.log('\n-- generar un codigo desde una promo --');
const promo = { id: 'VOLVE2000', nombre: 'Volvé y llevate $2.000', monto: 2000, limiteCompra: 12000, maxUsos: 100 };
const nuevo = M.desdePromo(promo, 'XYZ2345', 'venta9', 30, HOY);
t('copia el monto de la promo', nuevo.monto === 2000);
t('copia la compra minima', nuevo.limiteCompra === 12000);
/* Lo que NO se copia: el limite de la promo es cuantas se entregan; el del
   codigo es cuantas veces se usa ESE codigo, y es una. */
t('el codigo vale UNA sola vez, no las 100 de la promo', nuevo.maxUsos === 1);
t('arranca sin usos', nuevo.usos === 0);
t('arranca activo', nuevo.activo === true);
t('vence a los 30 dias', Math.round((nuevo.vence.getTime() - HOY) / 86400000) === 30);
t('sin dias indicados usa 30', M.desdePromo(promo, 'X', null, null, HOY).vence.getTime() === nuevo.vence.getTime());
t('queda marcado como salido de un ticket', nuevo.origen === 'ticket');
t('recuerda de que promo salio', nuevo.promoId === 'VOLVE2000');
t('y de que venta', nuevo.ventaId === 'venta9');
t('sin promo no genera nada', M.desdePromo(null, 'X', 'v', 30, HOY) === null);

/* ===================================================== QUE PROMOS SE OFRECEN */
console.log('\n-- que promos puede elegir la cajera --');
const lista = [
  { id: 'A', monto: 2000, activo: true, maxUsos: 100, entregados: 10 },
  { id: 'B', monto: 3000, activo: false, maxUsos: 100 },              /* apagada */
  { id: 'C', monto: 1000, activo: true, maxUsos: 50, entregados: 50 },/* agotada */
  { id: 'D', monto: 0, activo: true },                                 /* sin monto */
  { id: 'E', monto: 5000, activo: true },                              /* sin tope */
  { id: 'XYZ2345', monto: 2000, activo: true, origen: 'ticket' },      /* entregado en un ticket */
  { id: 'QWE4567', monto: 1500, activo: true, origen: 'resena' },      /* entregado por una resena */
  { id: 'RTY8901', monto: 1500, activo: true, origen: 'loquesea' },    /* un origen que todavia no existe */
];
const disp = M.promos(lista).map(c => c.id);
t('ofrece la que tiene cupo', disp.indexOf('A') >= 0);
t('y la que no tiene tope', disp.indexOf('E') >= 0);
t('no ofrece una apagada', disp.indexOf('B') < 0);
t('no ofrece una agotada', disp.indexOf('C') < 0);
t('no ofrece una sin monto', disp.indexOf('D') < 0);
/* Sin esto, la lista de la cajera se llenaria con los cientos de codigos ya
   entregados y no encontraria las cinco promos de verdad. */
t('no ofrece los codigos entregados en un ticket', disp.indexOf('XYZ2345') < 0);
t('ni los entregados por una resena', disp.indexOf('QWE4567') < 0);
/* Y tampoco uno de un origen que todavia no existe: filtrar por una lista de
   valores conocidos dejaria entrar al proximo que se invente. */
t('ni los de un origen nuevo que aparezca manana', disp.indexOf('RTY8901') < 0);
t('sin cupones no rompe', M.promos(null).length === 0);

/* ================================================== QUE ESTE ENCHUFADO */
console.log('\n-- el cable --');
const html = fs.readFileSync(path.join(RAIZ, 'admin.html'), 'utf8');
const mod = fs.readFileSync(path.join(RAIZ, 'admin-cupones-ticket.js'), 'utf8');
const reglas = fs.readFileSync(path.join(RAIZ, 'firestore.rules'), 'utf8');

t('admin.html carga el modulo', html.indexOf('<script src="admin-cupones-ticket.js"></script>') > 0);
t('hay campo para tipear el cupon en la venta', html.indexOf('id="ventaCuponCodigo"') > 0);
t('con Enter tambien se aplica', /ventaCuponCodigo[\s\S]{0,300}Enter[\s\S]{0,60}cuponCajaAplicar/.test(html));
t('hay checkbox para entregar uno', html.indexOf('id="ventaEmitirCupon"') > 0);
t('y el select de promos', html.indexOf('id="ventaCuponPromo"') > 0);
t('el select aparece solo si se tilda', /cuponEmitirCambio/.test(html) &&
  /id="ventaCuponPromoWrap" style="display:none"/.test(html));

/* Al abrir el modal no puede quedar el cupon de la venta anterior. */
t('el modal de venta arranca limpio',
  /function openVentaModal[\s\S]{0,400}cuponCajaReset/.test(html));

/* El uso y la entrega van DESPUES del add: ninguna de las dos puede impedir que
   la venta se guarde, que es lo unico que no se puede perder. */
t('el uso se registra despues de crear la venta',
  /const ventaRefNueva=await db\.collection\('ventas'\)\.add\(venta\);[\s\S]{0,600}cuponCajaRegistrarUso\(ventaRefNueva\.id/.test(html));
t('y la entrega tambien',
  /const ventaRefNueva=[\s\S]{0,900}cuponTicketEmitir\(ventaRefNueva\.id\)/.test(html));
t('el cupon entregado se le pega a la venta, para el ticket',
  /ventaRefNueva\.update\(\{cuponEmitido:_cupEmit\}\)/.test(html));

/* El ticket. */
t('el ticket imprime el cupon', html.indexOf('function _ctkBloqueTicket') > 0);
t('  y sale despues del total', html.indexOf("t+=_ctkBloqueTicket(venta);") > 0);
t('  con el codigo grande, que lo va a leer una persona', /letter-spacing:3px/.test(html));
t('  y dice hasta cuando vale', /V&aacute;lido hasta el/.test(html));
t('  y que vale una sola vez', /Vale una sola vez/.test(html));
t('sin cupon emitido no imprime nada',
  /const c=venta&&venta\.cuponEmitido;if\(!c\|\|!c\.codigo\)return '';/.test(html));

/* La lista de cupones del panel es para las PROMOS. Si entraran los codigos
   entregados, en un mes no se encuentra ninguna promo entre cientos de codigos. */
/* Una promo es un cupon SIN origen. Filtrar por 'ticket' dejaba entrar los que
   entrega la Cloud Function por una resena -origen 'resena'-, y esos apareceran
   como promos elegibles: la cajera podria entregarle a alguien el cupon de otro. */
t('los codigos entregados no ensucian la lista de promos',
  /\.filter\(c=>!c\.origen\)/.test(html));

/* El contador de usos lo lleva la Cloud Function procesarUsoCupon al crearse el
   documento de uso. Tocarlo tambien aca lo contaria dos veces. */
t('la caja no toca el contador de usos, lo hace la Cloud Function',
  mod.indexOf('procesarUsoCupon') > 0 &&
  !/cupones'\)\.doc\([^)]*\)\.update\(\{\s*usos/.test(mod));
t('pero si cuenta las entregas de la promo',
  /entregados: firebase\.firestore\.FieldValue\.increment\(1\)/.test(mod));

/* Si algo falla despues de guardar la venta, la venta NO se pierde y se avisa. */
t('un fallo al registrar el uso no tira abajo la venta',
  /La venta se guardó, pero no se pudo marcar el cupón/.test(mod));
t('un fallo al generar el cupon tampoco',
  /La venta se guardó, pero no se pudo generar el cupón/.test(mod));

/* La regla: el mostrador lo escribe un admin, sin cliente logueado enfrente. */
t('las reglas dejan al admin registrar un canje de mostrador',
  /allow create: if isAdmin\(\)/.test(reglas));
t('y NO aflojan lo que tapo el agujero del cliente comun',
  /request\.resource\.data\.uid == request\.auth\.uid/.test(reglas));

/* El codigo generado lleva fecha: la lista del panel ordena por creadoEn y
   Firestore deja afuera en silencio a los documentos que no lo tienen. */
t('el cupon generado lleva creadoEn', /creadoEn: new Date\(ahora\)/.test(mod));

/* EL NOMBRE DEL CAMPO DEL MINIMO DE COMPRA.
   El panel lo guarda como `limiteCompra` y la tienda lo lee asi (app.js ~2039).
   Este modulo lo leia como `limite`, que no existe: el minimo quedaba en cero y
   un cupon para compras desde $50.000 servia para una de $100. No daba error ni
   se veia en pantalla. Las pruebas no lo atraparon porque le pasaban el nombre
   equivocado a proposito, que es la forma mas facil de probar algo que no existe. */
console.log('\n-- el nombre del campo del minimo --');
const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
t('la tienda lee limiteCompra', app.indexOf('limiteCompra') > 0);
t('el panel lo guarda como limiteCompra', html.indexOf('limiteCompra:limite') > 0);
t('este modulo lo lee igual', mod.indexOf('cupon.limiteCompra') > 0);
t('y la funcion tambien',
  fs.readFileSync(path.join(RAIZ, 'functions', 'index.js'), 'utf8').indexOf('p.limiteCompra') > 0);
t('el minimo se respeta de verdad',
  !M.validar({ monto: 2000, limiteCompra: 50000, maxUsos: 1, usos: 0, activo: true }, 100, HOY).ok);

/* ============================== EL PASO 2: LA RESEÑA ==============================
   El cupón por dejar una reseña lo genera una Cloud Function, no el navegador:
   crear un cupón es escribir en /cupones y eso las reglas se lo reservan a los
   admins. Si el cliente pudiera, se pondría el monto que quisiera.

   El generador de códigos está escrito DOS VECES -una en el navegador, otra en el
   servidor- porque son dos mundos que no comparten código. Que sean iguales no se
   puede dar por sentado: si alguien toca uno solo, el local emitiría códigos con
   un alfabeto y la caja validaría con otro, y nadie se enteraría hasta que un
   cliente reclame. Por eso se comparan acá. */
console.log('\n-- el cupon por dejar una resena --');
const fn = fs.readFileSync(path.join(RAIZ, 'functions', 'index.js'), 'utf8');
const reglas2 = fs.readFileSync(path.join(RAIZ, 'firestore.rules'), 'utf8');
const res = fs.readFileSync(path.join(RAIZ, 'resena.html'), 'utf8');

const alfFn = (fn.match(/const ALF = '([^']+)'/) || [])[1];
t('el alfabeto del servidor existe', !!alfFn);
t('y es identico al del navegador', alfFn === M.ALF);
/* La cuenta del control tambien: si difiere, la caja rechazaria todos los codigos
   que entrega la funcion. */
t('la cuenta del caracter de control es la misma',
  fn.indexOf('ALF.indexOf(c[i]) * (i + 2)') > 0 && mod.indexOf('* (i + 2)') > 0);

t('la funcion premiarResena existe', fn.indexOf('exports.premiarResena = onDocumentWritten') > 0);
/* Solo en el momento exacto en que la resena se completa. */
t('solo entrega cuando la resena pasa a completada',
  fn.indexOf('if (antes && antes.usado === true) return;') > 0);
t('no entrega dos veces por la misma resena',
  fn.indexOf('if ((await premioRef.get()).exists) return;') > 0);
t('sin cuenta no entrega: no hay a quien darselo', fn.indexOf('if (!uid) return;') > 0);
t('sin una promo marcada tampoco', fn.indexOf("'paraResenas', '==', true") > 0);
t('el codigo entregado vale una sola vez', fn.indexOf('maxUsos: 1, usos: 0, activo: true') > 0);
t('y se comprueba que el codigo no exista antes de usarlo',
  fn.indexOf("db.collection('cupones').doc(c).get()).exists") > 0);

/* El codigo NO puede vivir en la resena: las completadas las lista cualquiera
   -asi las muestra la tienda- y ahi seria publico para todo el mundo. */
t('el codigo va en resenaPremios, no en la resena',
  fn.indexOf("collection('resenaPremios')") > 0);
t('y solo lo lee su dueno',
  /match \/resenaPremios[\s\S]{0,220}resource\.data\.uid == request\.auth\.uid/.test(reglas2));
t('nadie puede escribirlo desde el navegador',
  !/match \/resenaPremios[\s\S]{0,260}allow (write|create|update)/.test(reglas2));

/* La pagina de la resena lo muestra al terminar. */
t('la pagina de resena espera el cupon', res.indexOf('function esperarPremio') > 0);
t('  y lo pide despues de enviar', /showView\('successArea'\);\s*esperarPremio/.test(res));
t('  lo lee de resenaPremios', res.indexOf("collection('resenaPremios')") > 0);
/* Si la funcion no llega a tiempo, mejor no mostrar nada que prometer un
   descuento que no aparece. */
t('  y si no llega a tiempo no promete nada', res.indexOf('for(let intento=0;intento<12') > 0);

/* El ticket promete el monto SOLO si hay una promo activa para resenas: no se
   puede prometer un descuento que no se va a entregar. */
t('el ticket promete el descuento', html.indexOf('function _ctkPromesaResena') > 0);
t('  con el monto de la promo', html.indexOf("y llevate <b>$'+") > 0);
t('  y sin promo activa vuelve al texto de siempre',
  html.indexOf("if(!p)return 'Escane&aacute; el QR y") > 0);

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
