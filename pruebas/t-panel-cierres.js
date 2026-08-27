/**
 * DOS CIERRES DEL PANEL: LA SESION DEL CLIENTE Y LA DEVOLUCION DE STOCK.
 *
 * 1) /admin NO puede desloguear al cliente de la tienda.
 *    `admin.html` hacia `auth.signOut()` a cualquiera que no fuera admin. Pero /admin y
 *    la tienda son EL MISMO ORIGEN, y Firebase comparte la sesion entre pestañas: un
 *    cliente que entraba a /admin por curiosidad quedaba deslogueado de la tienda en
 *    TODAS sus pestañas, en silencio, con el carrito armado y sin entender que paso.
 *    Impedir que entre al panel es correcto; cerrarle la sesion de la tienda no.
 *
 * 2) `devolverStockPedido` decidia con la copia en memoria.
 *    La guarda `if(!pedido||!pedido.stockDescontado)return false;` miraba el objeto que le
 *    pasaban (de `pedidosData`) y recien despues abria la transaccion que devuelve el
 *    stock. Dos problemas, los dos ya conocidos en este proyecto:
 *      - la decision y la escritura no eran coherentes: un doble click alcanzaba para
 *        devolver la mercaderia DOS veces (la misma forma del bug de las Cloud Functions);
 *      - y si `pedidosData` estaba vacia -entrar derecho a Pedidos la deja asi- el pedido
 *        llegaba en null, esto devolvia false, y `deletePedido` borraba el pedido SIN
 *        devolver una sola unidad.
 *    Ahora todo se decide adentro de la transaccion, sobre el documento vivo, con todas
 *    las lecturas antes de la primera escritura.
 */
const fs = require('fs');
const src = fs.readFileSync('admin.html', 'utf8');

function cuerpo(nombre) {
  let i = src.indexOf('function ' + nombre + '(');
  if (i < 0) throw new Error('no encontre ' + nombre);
  if (src.slice(Math.max(0, i - 6), i) === 'async ') i -= 6;
  let prof = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (!prof) break; }
  }
  return src.slice(i, k + 1);
}

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + extra + ']' : '')); }
};

/* ================= 1) el gate de /admin ================= */

function entrarAlPanel(email, adminsEnLaBase) {
  const reg = { signOuts: 0, elementos: {} };
  function elem(id) {
    return (reg.elementos[id] = reg.elementos[id] ||
      { _id: id, textContent: '', innerHTML: '', value: '', style: { display: '' } });
  }
  let alCambiar = null;
  const authFalso = {
    onAuthStateChanged: cb => { alCambiar = cb; },
    signOut: () => { reg.signOuts++; },
  };
  const ent = {
    MAIL_DUENIO: 'duenio@brotes.com',
    /* `auth` y `storage` NO van aca: los declara el propio sandbox con let, igual que
       admin.html, y _initAuth les asigna. Ponerlos tambien como parametro es redeclarar. */
    firebase: { auth: () => authFalso, storage: () => ({}) },
    document: { getElementById: elem },
    setTimeout: fn => fn,
    db: { collection: () => ({ doc: id => ({
      get: async () => ({ exists: adminsEnLaBase.indexOf(id) >= 0 }) }) }) },
    console: { warn() {} },
    /* Todo lo que corre SOLO si la cuenta si es admin */
    loadProducts: () => Promise.resolve(),
    actualizarBadgeAlertas: () => {}, loadListas: () => {}, loadFacturaConfig: () => {},
    loadTelegramConfig: () => {}, loadResenasConfig: () => {}, loadPedidosCfgEditor: () => {},
    loadAtajos: () => {}, escucharUso: () => {},
  };
  const nombres = Object.keys(ent);
  const api = new Function(...nombres,
    'let auth=null,storage=null;\n' +
    ['isAllowedEmail', '_initAuth'].map(cuerpo).join('\n') +
    '\nreturn {init:_initAuth};'
  )(...nombres.map(n => ent[n]));

  api.init();
  return alCambiar({ email: email }).then(() => reg);
}

(async () => {
  console.log('\nUN CLIENTE COMUN ABRE /admin POR CURIOSIDAD');
  let reg = await entrarAlPanel('ana.cliente@gmail.com', []);
  t('NO se le cierra la sesion de la tienda', reg.signOuts === 0, 'signOut() llamado ' + reg.signOuts + ' vez/veces');
  /* Ni siquiera lo toca: sale antes de pedir el elemento. */
  t('igual NO se le abre el panel',
    !reg.elementos.dashboard || reg.elementos.dashboard.style.display !== 'block',
    reg.elementos.dashboard ? reg.elementos.dashboard.style.display : '(nunca lo toco)');
  t('y se le dice por que', /no tiene permisos/i.test(reg.elementos.loginError.innerHTML),
    reg.elementos.loginError.innerHTML.slice(0, 80));
  t('el cartel se muestra', reg.elementos.loginError.style.display === 'block');
  t('con una salida a mano, por si es un admin con la cuenta equivocada',
    /logout\(\)/.test(reg.elementos.loginError.innerHTML));

  console.log('\nEL DUEÑO ENTRA NORMALMENTE');
  reg = await entrarAlPanel('duenio@brotes.com', []);
  t('no se lo desloguea', reg.signOuts === 0);
  t('y se le abre el panel', reg.elementos.dashboard.style.display === 'block',
    reg.elementos.dashboard.style.display);
  t('con la pantalla de login escondida', reg.elementos.loginScreen.style.display === 'none');
  t('y su mail en pantalla', reg.elementos.userEmail.textContent === 'duenio@brotes.com');

  console.log('\nUN ADMIN DE LA COLECCION /admins TAMBIEN ENTRA');
  reg = await entrarAlPanel('empleada@brotes.com', ['empleada@brotes.com']);
  t('entra', reg.elementos.dashboard.style.display === 'block');
  t('sin deslogueos', reg.signOuts === 0);

  /* ================= 2) devolverStockPedido ================= */

  function devolver({ enBase, enCache, revienta }) {
    const reg = { orden: [], updates: [] };
    const productos = { yerba: { stock: 10 }, nuez: { stock: 4700 } };
    const ent = {
      console: { warn() {} },
      db: {
        collection: col => ({ doc: id => ({ __col: col, __id: id }) }),
        runTransaction: async fn => {
          if (revienta) throw new Error('ABORTED: contencion');
          return fn({
            get: async ref => {
              reg.orden.push('leer ' + ref.__col + '/' + ref.__id);
              if (ref.__col === 'pedidos') {
                return { exists: enBase !== null, data: () => enBase };
              }
              const d = productos[ref.__id];
              return { exists: !!d, data: () => d };
            },
            update: (ref, patch) => {
              reg.orden.push('ESCRIBIR ' + ref.__col + '/' + ref.__id);
              reg.updates.push({ ref: ref.__col + '/' + ref.__id, patch: patch });
            },
          });
        },
      },
    };
    const nombres = Object.keys(ent);
    const fn = new Function(...nombres, cuerpo('devolverStockPedido') + '\nreturn devolverStockPedido;')
      (...nombres.map(n => ent[n]));
    return fn('ped1', enCache).then(r => ({ reg, r }));
  }

  const VIVO = { stockDescontado: true, items: [
    { id: 'yerba', cantidad: 4, tipoVenta: 'unidad' },
    { id: 'nuez', cantidad: 250, tipoVenta: 'peso' },
  ] };
  const stockDe = reg2 => Object.fromEntries(reg2.updates
    .filter(u => u.ref.startsWith('productos/')).map(u => [u.ref.split('/')[1], u.patch.stock]));

  console.log('\nDEVOLVER EL STOCK DE UN PEDIDO');
  let d = await devolver({ enBase: VIVO, enCache: VIVO });
  t('devuelve true', d.r === true, d.r);
  t('devuelve las 4 unidades de yerba (10 -> 14)', stockDe(d.reg).yerba === 14, JSON.stringify(stockDe(d.reg)));
  t('y 250 GRAMOS de nueces (4700 -> 4950)', stockDe(d.reg).nuez === 4950);
  t('baja la bandera del pedido', d.reg.updates.some(u => u.ref === 'pedidos/ped1' && u.patch.stockDescontado === false));
  t('lee el pedido VIVO adentro de la transaccion', d.reg.orden[0] === 'leer pedidos/ped1', d.reg.orden[0]);
  t('TODAS las lecturas antes de la primera escritura',
    d.reg.orden.findIndex(x => x.startsWith('ESCRIBIR')) > d.reg.orden.map(x => x.startsWith('leer')).lastIndexOf(true),
    d.reg.orden.join(' | '));

  console.log('\nDOBLE CLICK: la copia en memoria dice true, el documento vivo dice false');
  d = await devolver({ enBase: Object.assign({}, VIVO, { stockDescontado: false }), enCache: VIVO });
  t('NO devuelve stock por segunda vez', !d.reg.updates.length, JSON.stringify(d.reg.updates));
  t('y avisa que no devolvio nada', d.r === false, d.r);

  console.log('\nCON pedidosData VACIA (entraste derecho a Pedidos)');
  d = await devolver({ enBase: VIVO, enCache: null });
  t('IGUAL devuelve el stock: la cache no decide', stockDe(d.reg).yerba === 14, JSON.stringify(stockDe(d.reg)));
  t('IGUAL devuelve los gramos', stockDe(d.reg).nuez === 4950);
  t('y devuelve true', d.r === true);

  console.log('\nEL PEDIDO YA NO EXISTE');
  d = await devolver({ enBase: null, enCache: VIVO });
  t('no escribe nada', !d.reg.updates.length, JSON.stringify(d.reg.updates));
  t('y devuelve false, no error', d.r === false, d.r);

  console.log('\nSI LA TRANSACCION REVIENTA, hay que poder distinguirlo');
  d = await devolver({ enBase: VIVO, enCache: VIVO, revienta: true });
  t('devuelve "error", no false', d.r === 'error', d.r);
  t('   (deletePedido usa esa diferencia para NO borrar el pedido)', d.r !== false);

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})();
