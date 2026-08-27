/**
 * EL CAMINO DEL CLIENTE, EJECUTADO DE VERDAD CONTRA firestore.rules.
 *
 *   npm run test:reglas
 *
 * Por que existe esta suite y no alcanza con las otras 12: las demas sacan una
 * funcion del archivo y la corren aislada. Ninguna toca las REGLAS. Y el peor bug
 * que tuvo este proyecto vivia justo ahi: el checkout escribia en /productos, que
 * las reglas solo permiten a admins, asi que todo pedido web fallaba en silencio.
 * Se escapo porque el checkout siempre se probo con una cuenta de admin.
 *
 * Aca se levanta el emulador de Firestore, se le cargan las reglas REALES del
 * repo y se hace cada operacion del camino de compra con la identidad de un
 * cliente comun: logueado con Google, sin documento en /admins. Lo que el
 * emulador conteste es el resultado; no hay mocks de por medio.
 *
 * NO TOCA LA BASE DE PRODUCCION. El emulador es un proceso local en memoria y el
 * proyecto que usa se llama demo-brotes, que no existe en Firebase.
 *
 * Se le habla por REST con un JWT sin firmar, que es lo que hace por dentro
 * @firebase/rules-unit-testing. Se hace asi para no agregarle el SDK de Firebase
 * entero como dependencia a un repo que hoy tiene dos (terser y clean-css).
 *
 * Sobre creadoEn: el codigo manda serverTimestamp() y aca va una fecha concreta.
 * Es equivalente PARA ESTAS REGLAS: ninguna mira el valor de creadoEn, solo que
 * el campo este (hasAll). Si alguna vez una regla compara contra request.time,
 * esto hay que cambiarlo por un transform.
 */
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST) {
  console.log('  FALLA  no hay emulador: falta FIRESTORE_EMULATOR_HOST');
  console.log('         correr con: npm run test:reglas');
  console.log('\n0 pasaron, 1 fallaron');
  process.exit(1);
}
const PID = process.env.GCLOUD_PROJECT || 'demo-brotes';
const BASE = 'http://' + HOST + '/v1/projects/' + PID + '/databases/(default)/documents';

/* ---------- identidades ---------- */
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function sesion(uid, email) {
  const now = Math.floor(Date.now() / 1000);
  return b64({ alg: 'none', typ: 'JWT' }) + '.' + b64({
    iss: 'https://securetoken.google.com/' + PID, aud: PID,
    sub: uid, user_id: uid, iat: now, exp: now + 3600, auth_time: now,
    email: email, email_verified: true,
    firebase: { sign_in_provider: 'google.com', identities: { email: [email] } }
  }) + '.';
}
const SEMBRADOR = 'owner';                                        /* saltea las reglas, solo para preparar datos */
const CLIENTE   = sesion('uid-cliente', 'clienta@gmail.com');     /* el que compra: NO esta en /admins */
const OTRO      = sesion('uid-otro', 'otro@gmail.com');
const ADMIN     = sesion('uid-admin', 'admin@brotes.test');       /* si esta en /admins */
const DUENIO    = sesion('uid-duenio', 'jeroobregon03@gmail.com');/* la salida de emergencia de las reglas */
const DOBLE     = sesion('uid-doble', 'doble@gmail.com');         /* para la carrera de los dos _onUserLogin */
const ANONIMO   = null;

/* ---------- traduccion a JSON de Firestore ---------- */
function val(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  return { mapValue: { fields: campos(v) } };
}
function campos(o) { const f = {}; for (const k of Object.keys(o)) f[k] = val(o[k]); return f; }

async function llamar(metodo, url, tok, cuerpo) {
  const h = { 'Content-Type': 'application/json' };
  if (tok) h.Authorization = 'Bearer ' + tok;
  const r = await fetch(url, { method: metodo, headers: h, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  let j = null;
  try { j = await r.json(); } catch (e) { /* 200 sin cuerpo */ }
  const err = (j && j.error) ? j.error : (Array.isArray(j) && j[0] && j[0].error ? j[0].error : null);
  return { ok: r.ok && !err, http: r.status, code: err ? err.status : null, msg: err ? String(err.message).split('\n')[0] : '' };
}

/* Cada helper imita UNA operacion del SDK compat que usa la tienda. */
const crear      = (p, d, t) => llamar('PATCH', BASE + '/' + p + '?currentDocument.exists=false', t, { fields: campos(d) });
const setear     = (p, d, t) => llamar('PATCH', BASE + '/' + p, t, { fields: campos(d) });   /* .set() sin merge: reemplaza */
const actualizar = (p, d, t) => llamar('PATCH', BASE + '/' + p + '?currentDocument.exists=true&' +
                                  Object.keys(d).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&'),
                                  t, { fields: campos(d) });                                 /* .update(): solo esos campos */
const agregar    = (c, d, t) => llamar('POST', BASE + '/' + c, t, { fields: campos(d) });    /* .add(): id automatico */
const leer       = (p, t)    => llamar('GET', BASE + '/' + p, t);
const borrar     = (p, t)    => llamar('DELETE', BASE + '/' + p, t);
const consultar  = (q, t)    => llamar('POST', BASE + ':runQuery', t, { structuredQuery: q });
const donde      = (col, campo, valor) => ({ from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: campo }, op: 'EQUAL', value: val(valor) } } });

/* ---------- marcador ---------- */
let ok = 0, fail = 0;
function anotar(desc, bien, detalle) {
  if (bien) { ok++; console.log('  OK   ' + desc); }
  else { fail++; console.log('  FALLA ' + desc + (detalle ? '   [' + detalle + ']' : '')); }
}
async function permitido(desc, fn) {
  const r = await fn();
  anotar(desc, r.ok, r.ok ? '' : (r.code || r.http) + ' ' + r.msg);
}
async function denegado(desc, fn) {
  const r = await fn();
  anotar(desc, r.code === 'PERMISSION_DENIED', r.ok ? 'PASO y no tenia que pasar' : (r.code || r.http) + ' ' + r.msg);
}

/* ---------- el pedido que escribe app.js, campo por campo (app.js ~900) ---------- */
function pedidoReal(extra) {
  return Object.assign({
    numero: 1,
    estado: 'pendiente',
    cliente: 'Ana Perez',
    clienteAuthUid: 'uid-cliente',
    clienteEmail: 'clienta@gmail.com',
    clienteId: 1,
    telefono: '3516872770',
    direccion: null,
    notas: null,
    tipoEntrega: 'retiro',
    stockDescontado: false,
    items: [{ id: 'prod1', nombre: 'Semillas Chia', precio: 2300, precioOriginal: 2300, descuento: 0, cantidad: 2, subtotal: 4600 }],
    subtotalProductos: 4600,
    envio: 0,
    envioGratis: false,
    total: 4600,
    cupon: null,
    origen: 'web',
    creadoEn: new Date()
  }, extra || {});
}

async function main() {
  /* base limpia */
  await fetch('http://' + HOST + '/emulator/v1/projects/' + PID + '/databases/(default)/documents', { method: 'DELETE' });

  /* datos previos, cargados salteando las reglas */
  await setear('admins/admin@brotes.test', { mail: 'admin@brotes.test' }, SEMBRADOR);
  await setear('productos/prod1', { nombre: 'Semillas Chia', precio: 2300, stock: 10, activo: true }, SEMBRADOR);
  await setear('config/siteContent', { heroTitulo: 'Brotes' }, SEMBRADOR);
  await setear('config/telegram', { token: 'SECRETO' }, SEMBRADOR);
  await setear('cupones/cup1', { codigo: 'PRIMERA', activo: true, maxUsos: 10, usos: 0 }, SEMBRADOR);
  await setear('pedidos/ped-mio', pedidoReal(), SEMBRADOR);
  await setear('pedidos/ped-ajeno', pedidoReal({ clienteAuthUid: 'uid-otro' }), SEMBRADOR);
  await setear('resenas/tok-libre', { usado: false, ventaNum: 7, nombre: '', comentario: '', estrellas: 0 }, SEMBRADOR);
  await setear('resenas/tok-ajeno', { usado: false, ventaNum: 8, clienteAuthUid: 'uid-otro', nombre: '', comentario: '', estrellas: 0 }, SEMBRADOR);

  console.log('\nEl arnes se prueba a si mismo (si esto falla, lo demas no significa nada)');
  await permitido('un admin de /admins puede escribir productos', () => setear('productos/px', { nombre: 'x' }, ADMIN));
  await denegado('un cliente comun NO puede escribir productos', () => setear('productos/py', { nombre: 'y' }, CLIENTE));
  await permitido('el dueno entra sin documento en /admins (salida de emergencia)', () => setear('productos/pz', { nombre: 'z' }, DUENIO));

  console.log('\nEL BUG HISTORICO: el checkout escribia en /productos');
  await denegado('cliente descontando stock a mano (asi fallaba en silencio)', () => actualizar('productos/prod1', { stock: 8 }, CLIENTE));
  await permitido('la tienda SI puede leer productos sin sesion', () => leer('productos/prod1', ANONIMO));

  console.log('\nPrimer login del cliente (app.js _onUserLogin ~1240)');
  await permitido('config/clientesAuthCount arranca en 1 cuando no existe', () => setear('config/clientesAuthCount', { count: 1 }, CLIENTE));
  await permitido('el siguiente cliente lo lleva a 2', () => setear('config/clientesAuthCount', { count: 2 }, OTRO));
  await denegado('nadie puede volverlo a 0', () => setear('config/clientesAuthCount', { count: 0 }, CLIENTE));
  await denegado('ni saltearlo a 999', () => setear('config/clientesAuthCount', { count: 999 }, CLIENTE));
  await permitido('crea su clientesAuth con el payload real de app.js:1245',
    () => crear('clientesAuth/uid-cliente', { email: 'clienta@gmail.com', nombre: '', apellido: '', telefono: '', direcciones: [], clienteId: 3, creadoEn: new Date() }, CLIENTE));
  await denegado('no puede crear el de otro', () => crear('clientesAuth/uid-otro', { email: 'x@x.com', nombre: '', apellido: '', telefono: '', direcciones: [], creadoEn: new Date() }, CLIENTE));

  /* Firebase avisa la MISMA sesion por dos caminos y app.js engancha los dos sin
     ningun candado: onAuthStateChanged (app.js:1220) y el .then de signInWithPopup
     (app.js:1371) — en movil, getRedirectResult (app.js:1203). Las dos corridas
     hacen ref.get(), las dos ven que el documento no existe, y las dos llaman a
     ref.set(). La segunda cae sobre un documento que YA existe, asi que las reglas
     la evaluan como UPDATE, y el update solo deja tocar cuatro campos.
     Esto pasa una sola vez por cliente: en su primer login. Justo el paso que nunca
     se ejecuto, porque un admin ya tenia su documento creado hace meses. */
  console.log('\nLos dos avisos de login de Firebase, corriendo sobre el mismo cliente nuevo');
  const altaCliente = { email: 'doble@gmail.com', nombre: '', apellido: '', telefono: '', direcciones: [], clienteId: 5, creadoEn: new Date() };
  await permitido('el primer _onUserLogin crea el documento', () => crear('clientesAuth/uid-doble', altaCliente, DOBLE));
  /* Esta linea es la razon por la que app.js NO puede permitirse llamar dos veces a
     ref.set(): el segundo set cae sobre un documento que ya existe, las reglas lo
     leen como update, y el update solo deja tocar nombre/apellido/telefono/
     direcciones. Medido: PERMISSION_DENIED. Como el set de app.js:1245 no esta en
     try/catch, esa corrida muere ahi y no llega ni al modal de datos ni a
     _refreshCheckoutAuth. */
  await denegado('el segundo set del mismo login se evalua como update y muere',
    () => setear('clientesAuth/uid-doble', Object.assign({}, altaCliente, { clienteId: 6, creadoEn: new Date() }), DOBLE));

  console.log('\nPerfil del cliente (app.js 773 / 1452 / 1493 / 1536)');
  await permitido('guarda nombre, apellido y telefono', () => actualizar('clientesAuth/uid-cliente', { nombre: 'Ana', apellido: 'Perez', telefono: '3516872770' }, CLIENTE));
  await permitido('guarda una direccion', () => actualizar('clientesAuth/uid-cliente', { direcciones: ['Colon 123'] }, CLIENTE));
  await denegado('XSS almacenado: no puede meterse un clienteId (regresion)', () => actualizar('clientesAuth/uid-cliente', { clienteId: '<img src=x onerror=alert(1)>' }, CLIENTE));
  await denegado('no puede guardar 6 direcciones', () => actualizar('clientesAuth/uid-cliente', { direcciones: ['a', 'b', 'c', 'd', 'e', 'f'] }, CLIENTE));
  await denegado('no puede leer el perfil de otro', () => leer('clientesAuth/uid-otro', CLIENTE));

  console.log('\nEL PEDIDO WEB - esto es lo que nunca se ejecuto (0 pedidos en la base)');
  await permitido('EL PRIMER PEDIDO DE LA BASE: pedidosCount no existe y se pone en 1', () => setear('config/pedidosCount', { count: 1 }, CLIENTE));
  await permitido('el segundo pedido lo lleva a 2 (numero correlativo)', () => setear('config/pedidosCount', { count: 2 }, CLIENTE));
  await denegado('no puede resetear el contador a 0 y pisar numeros', () => setear('config/pedidosCount', { count: 0 }, CLIENTE));
  await denegado('no puede dejarlo en 999999999', () => setear('config/pedidosCount', { count: 999999999 }, CLIENTE));
  await permitido('GUARDA EL PEDIDO con el objeto exacto de app.js:929', () => agregar('pedidos', pedidoReal({ numero: 3 }), CLIENTE));
  await denegado('sin sesion no se puede pedir', () => agregar('pedidos', pedidoReal(), ANONIMO));
  await permitido('pedido con envio y direccion', () => agregar('pedidos', pedidoReal({ tipoEntrega: 'envio', direccion: 'Colon 123', envio: 1500, total: 6100 }), CLIENTE));
  await permitido('pedido con cupon aplicado', () => agregar('pedidos', pedidoReal({ cupon: { codigo: 'PRIMERA', monto: 1000 }, total: 3600 }), CLIENTE));

  /* rateLimitPedidos y "Mis Pedidos" se apoyan en clienteAuthUid. La regla no lo
     miraba, asi que el pedido entraba igual con el campo en null -y entonces
     rateLimitPedidos corta con `if (!uid) return` y el limite de 5 por hora se
     saltea omitiendo un campo- o con el uid de otra persona, y el pedido le aparecia
     a ella en "Mis Pedidos" con nombre, telefono y direccion del que lo hizo. */
  console.log('\nEl pedido tiene que estar firmado por quien lo hace');
  await denegado('pedido con clienteAuthUid en null', () => agregar('pedidos', pedidoReal({ clienteAuthUid: null }), CLIENTE));
  await denegado('pedido firmado con el uid de otra persona', () => agregar('pedidos', pedidoReal({ clienteAuthUid: 'uid-otro' }), CLIENTE));
  await denegado('pedido sin el campo clienteAuthUid', () => {
    const p = pedidoReal(); delete p.clienteAuthUid; return agregar('pedidos', p, CLIENTE);
  });

  console.log('\nBordes del pedido que las reglas rechazan');
  await denegado('total 0 (un cupon que cubre todo, o todo gratis)', () => agregar('pedidos', pedidoReal({ total: 0 }), CLIENTE));
  await denegado('carrito de 101 items', () => agregar('pedidos', pedidoReal({ items: Array.from({ length: 101 }, () => ({ id: 'p', nombre: 'n', precio: 1, cantidad: 1, subtotal: 1 })) }), CLIENTE));
  await denegado('nombre de mas de 120 caracteres', () => agregar('pedidos', pedidoReal({ cliente: 'A'.repeat(121) }), CLIENTE));
  await denegado('telefono de mas de 30 caracteres', () => agregar('pedidos', pedidoReal({ telefono: '1'.repeat(31) }), CLIENTE));

  console.log('\nMis Pedidos (app.js _cargarPedidosCliente ~1574)');
  await permitido('lista los propios filtrando por clienteAuthUid', () => consultar(donde('pedidos', 'clienteAuthUid', 'uid-cliente'), CLIENTE));
  await denegado('no puede listar los pedidos de otro', () => consultar(donde('pedidos', 'clienteAuthUid', 'uid-otro'), CLIENTE));
  await denegado('no puede listar la coleccion entera', () => consultar({ from: [{ collectionId: 'pedidos' }] }, CLIENTE));
  await permitido('lee el detalle de un pedido suyo', () => leer('pedidos/ped-mio', CLIENTE));
  await denegado('no lee el pedido de otro', () => leer('pedidos/ped-ajeno', CLIENTE));
  await denegado('no puede cancelar su propio pedido', () => actualizar('pedidos/ped-mio', { estado: 'cancelado' }, CLIENTE));

  console.log('\nCupones (app.js ~998)');
  await permitido('la tienda lee los cupones sin sesion', () => leer('cupones/cup1', ANONIMO));
  await permitido('registra el uso con su uid', () => agregar('cuponesUsos', { cuponId: 'cup1', codigo: 'PRIMERA', uid: 'uid-cliente', email: 'clienta@gmail.com', fecha: new Date(), pedidoNum: 3 }, CLIENTE));
  await denegado('el canje de invitado (sin uid) queda afuera', () => agregar('cuponesUsos', { cuponId: 'cup1', codigo: 'PRIMERA', nombreCliente: 'Ana Perez', telefono: '351', fecha: new Date(), pedidoNum: 4 }, CLIENTE));
  await denegado('no puede registrar un uso a nombre de otro', () => agregar('cuponesUsos', { cuponId: 'cup1', codigo: 'PRIMERA', uid: 'uid-otro', fecha: new Date() }, CLIENTE));
  await permitido('consulta si ya uso el cupon (cuponId + uid)', () => consultar({ from: [{ collectionId: 'cuponesUsos' }], where: { compositeFilter: { op: 'AND', filters: [{ fieldFilter: { field: { fieldPath: 'cuponId' }, op: 'EQUAL', value: val('cup1') } }, { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: val('uid-cliente') } }] } } }, CLIENTE));

  console.log('\nResenas (resena.html:261)');
  await permitido('completa un token de mostrador sin dueno', () => actualizar('resenas/tok-libre', { nombre: 'Ana', estrellas: 5, comentario: 'Todo bien', fecha: new Date(), visible: true, usado: true, clienteAuthUid: 'uid-cliente', clienteEmail: 'clienta@gmail.com' }, CLIENTE));
  await denegado('no puede completar el token atado a otra cuenta', () => actualizar('resenas/tok-ajeno', { nombre: 'Ana', estrellas: 1, comentario: 'x', fecha: new Date(), visible: true, usado: true, clienteAuthUid: 'uid-cliente', clienteEmail: 'clienta@gmail.com' }, CLIENTE));
  await denegado('no puede volver a usar un token ya completado', () => actualizar('resenas/tok-libre', { nombre: 'Ana', estrellas: 1, comentario: 'otra vez', fecha: new Date(), visible: true, usado: true, clienteAuthUid: 'uid-cliente' }, CLIENTE));
  await denegado('no puede fabricarse tokens de resena', () => setear('resenas/inventado', { usado: false, ventaNum: 99 }, CLIENTE));
  await denegado('no puede borrar una resena', () => borrar('resenas/tok-libre', CLIENTE));

  console.log('\nLo que el cliente NO tiene que poder ver');
  await denegado('el token del bot de Telegram', () => leer('config/telegram', CLIENTE));
  await permitido('los textos de la web, sin sesion', () => leer('config/siteContent', ANONIMO));
  await denegado('la lista de admins', () => consultar({ from: [{ collectionId: 'admins' }] }, CLIENTE));
  await denegado('las ventas del negocio', () => consultar({ from: [{ collectionId: 'ventas' }] }, CLIENTE));
  await denegado('la caja', () => consultar({ from: [{ collectionId: 'cajas' }] }, CLIENTE));
  await denegado('los clientes del mostrador', () => consultar({ from: [{ collectionId: 'clientes' }] }, CLIENTE));

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); console.log('\n' + ok + ' pasaron, ' + (fail + 1) + ' fallaron'); process.exit(1); });
