/**
 * BROTES Cloud Functions
 * - notifyTelegramOnNewOrder: dispara mensaje a Telegram cada vez que se crea un pedido web
 * - procesarUsoCupon:         incrementa usos del cupon y lo desactiva al llegar a maxUsos
 * - rateLimitPedidos:         borra el pedido si el mismo uid hizo mas de 5 en una hora
 * - sanitizarPedido:          limpia los campos de texto del pedido del lado del servidor
 * - sincronizarClaimAdmin:    pone/saca el custom claim `admin` segun la coleccion /admins
 *                             (Storage no puede leer Firestore, por eso hace falta el claim)
 * - aplicarClaimAlIngresar:   aplica el claim al primer ingreso de un admin que se agrego
 *                             antes de que tuviera cuenta de Google
 * - descontarStockPedido:     descuenta el stock del pedido web (el cliente no tiene
 *                             permiso de escritura sobre /productos, y no deberia)
 *
 * Requiere documento Firestore: config/telegram con campos `token` y `chatId`
 * (ese doc solo lo pueden leer los admins, ver firestore.rules).
 *
 * Las de pedidos son Gen 2 y estan todas en southamerica-east1, la misma region que
 * Firestore. Requiere plan Blaze.
 */

const {onDocumentCreated, onDocumentWritten} = require('firebase-functions/v2/firestore');
const {onObjectFinalized, onObjectDeleted} = require('firebase-functions/v2/storage');
/* Gen 1 solo para el disparador de creacion de usuario: Gen 2 no tiene triggers de Auth
   (los blocking functions necesitan Identity Platform). Conviven sin problema. */
const functionsV1 = require('firebase-functions/v1');
const {logger} = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

/** Helper: envia mensaje a Telegram */
async function sendTelegramMessage(token, chatId, text) {
  if (!token || !chatId) {
    logger.warn('Telegram no configurado (falta token o chatId)');
    return false;
  }
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      })
    });
    if (!res.ok) {
      const body = await res.text();
      logger.error('Telegram API error:', res.status, body);
      return false;
    }
    return true;
  } catch (e) {
    logger.error('Error enviando a Telegram:', e);
    return false;
  }
}

/** Helper: escapa caracteres HTML especiales para Telegram parse_mode HTML */
function escHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Trigger: cada vez que se crea un pedido en Firestore
 * Si el pedido tiene origen='web', notifica a Telegram
 */
exports.notifyTelegramOnNewOrder = onDocumentCreated(
  {
    document: 'pedidos/{pedidoId}',
    region: 'southamerica-east1',
    memory: '256MiB',
    timeoutSeconds: 30
  },
  async (event) => {
    const snap = event.data;
    if (!snap) {
      logger.warn('Sin datos en el evento');
      return;
    }
    const pedido = snap.data();
    /* Solo notificamos pedidos hechos desde la web */
    if (pedido.origen !== 'web') {
      logger.info('Pedido omitido (origen no es web):', event.params.pedidoId);
      return;
    }
    /* Leer configuración de Telegram */
    let token = null;
    let chatId = null;
    try {
      const cfgSnap = await db.collection('config').doc('telegram').get();
      if (cfgSnap.exists) {
        const data = cfgSnap.data();
        token = data.token || null;
        chatId = data.chatId || null;
      }
    } catch (e) {
      logger.error('No se pudo leer config/telegram:', e);
      return;
    }
    if (!token || !chatId) {
      logger.warn('Telegram no está configurado, omito notificación');
      return;
    }
    /* Construir mensaje */
    const num = String(pedido.numero || 0).padStart(5, '0');
    /* Telegram rechaza con 400 cualquier mensaje de mas de 4096 caracteres, y esta
       funcion trabaja sobre la carga de CREACION: los limites que pone sanitizarPedido
       llegan despues. Las reglas no acotan `notas` ni el largo de la lista de items,
       asi que un pedido de 100 productos -o unas notas largas- dejaban al comercio sin
       el aviso del pedido, que muchas veces es el unico que ve. Se recorta cada parte
       y despues el mensaje entero, para que el aviso llegue aunque venga podado. */
    const cortar = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '…' : s; };
    const items = (pedido.items || []);
    /* Se mide el texto YA escapado: escHtml puede quintuplicar el largo (un & son 5
       caracteres), asi que contar los nombres crudos no alcanza. Se corta por items
       enteros para no partir una entidad al medio. */
    const partes = [];
    let largoItems = 0;
    for (const i of items) {
      const txt = `${escHtml(cortar(i && i.nombre, 60))} x${i && i.cantidad}`;
      if (partes.length >= 40 || largoItems + txt.length > 1800) break;
      partes.push(txt);
      largoItems += txt.length + 2;
    }
    let itemsTxt = partes.join(', ');
    if (partes.length < items.length) itemsTxt += ` … y ${items.length - partes.length} más`;
    let msg = `<b>🛒 Nuevo pedido WEB #${num}</b>\n`;
    msg += `<b>Cliente:</b> ${escHtml(cortar(pedido.cliente || '-', 120))}\n`;
    msg += `<b>Tel:</b> ${escHtml(cortar(pedido.telefono || '-', 30))}\n`;
    msg += `<b>Entrega:</b> ${pedido.tipoEntrega === 'retiro' ? 'Retiro en local' : 'Envío a domicilio'}\n`;
    if (pedido.direccion) msg += `<b>Dirección:</b> ${escHtml(cortar(pedido.direccion, 200))}\n`;
    if (pedido.notas) msg += `<b>Notas:</b> ${escHtml(cortar(pedido.notas, 400))}\n`;
    if (itemsTxt) msg += `<b>Items:</b> ${itemsTxt}\n`;
    msg += `<b>Total:</b> $${(pedido.total || 0).toLocaleString('es-AR')}`;
    /* Red final. Se corta en el ultimo salto de linea completo: al ras se podria
       partir una etiqueta <b> o una entidad HTML, y Telegram rechaza el mensaje
       entero con 400 igual que si fuera largo. Cada linea es un par <b>..</b>
       cerrado, asi que cortando por lineas el HTML siempre queda balanceado. */
    if (msg.length > 4000) {
      const corte = msg.lastIndexOf('\n', 4000);
      msg = msg.slice(0, corte > 0 ? corte : 4000) + '\n…(mensaje recortado)';
    }
    /* Enviar */
    const ok = await sendTelegramMessage(token, chatId, msg);
    if (ok) {
      logger.info('Notificación Telegram enviada para pedido #' + num);
    } else {
      logger.error('Falló envío Telegram para pedido #' + num);
    }
  }
);


/**
 * CUPONES: incrementa usos y desactiva si llega al máximo
 * Se ejecuta cuando se registra un uso en /cuponesUsos
 */
exports.procesarUsoCupon = onDocumentCreated(
  {
    document: 'cuponesUsos/{usoId}',
    region: 'southamerica-east1',
    memory: '256MiB',
    timeoutSeconds: 30
  },
  async (event) => {
    const uso = event.data?.data();
    if (!uso || !uso.cuponId) return;
    try {
      const cupRef = db.collection('cupones').doc(uso.cuponId);
      await db.runTransaction(async tx => {
        const snap = await tx.get(cupRef);
        if (!snap.exists) return;
        const cup = snap.data();
        const nuevosUsos = (parseInt(cup.usos) || 0) + 1;
        const updates = { usos: nuevosUsos };
        if (cup.maxUsos && nuevosUsos >= parseInt(cup.maxUsos)) {
          updates.activo = false;
          logger.info(`Cupón ${cup.codigo} desactivado por alcanzar maxUsos (${nuevosUsos}/${cup.maxUsos})`);
        }
        tx.update(cupRef, updates);
      });
    } catch (e) {
      logger.error('Error procesando uso de cupón:', e);
    }
  }
);

/**
 * RATE LIMIT: se ejecuta cuando se crea un documento en /pedidos
 * OJO con la region: si se pasa solo el path (sin objeto de opciones) la
 * funcion se despliega en us-central1 y queda en otra region que Firestore.
 */
exports.rateLimitPedidos = onDocumentCreated(
  {
    document: 'pedidos/{pedidoId}',
    region: 'southamerica-east1',
    memory: '256MiB',
    timeoutSeconds: 30
  },
  async (event) => {
  const data = event.data?.data();
  if (!data) return;

  const uid = data.clienteAuthUid;
  if (!uid) return; // sin uid no podemos limitar

  const ahora = new Date();
  const haceUnaHora = new Date(ahora.getTime() - 60 * 60 * 1000);

  try {
    const snap = await db.collection('pedidos')
      .where('clienteAuthUid', '==', uid)
      .where('creadoEn', '>=', haceUnaHora)
      .get();

    const LIMITE = 5;
    if (snap.size > LIMITE) {
      logger.warn(`Rate limit: UID ${uid} hizo ${snap.size} pedidos en la ultima hora. Se marca el pedido.`);
      /* Antes esto BORRABA el pedido, y eso hacia dos daños.

         El primero es una carrera: descontarStockPedido escucha la creacion del
         mismo documento y corre en paralelo, sin orden garantizado. Si su
         transaccion ya habia commiteado, el stock de todos los productos quedaba
         descontado y el documento que lo justificaba desaparecia: sin pedido, sin
         venta, sin nada que auditar. El comercio veia faltar stock y ningun
         movimiento que lo explicara. En el orden inverso, el t.update final de
         descontarStockPedido explotaba con NOT_FOUND y revertia todo, dejando
         solo un error en los logs.

         El segundo es de trato: el que pasa el limite no es necesariamente un
         bot. Alcanza un cliente indeciso que confirma y reintenta seis veces en
         una hora, o una familia desde la misma cuenta. A esa persona se le
         borraba el pedido en silencio, sin un mensaje, sin nada.

         Marcarlo resuelve las dos cosas: el documento sigue existiendo, asi que
         el stock descontado tiene quien lo justifique y el comercio decide si lo
         atiende o lo descarta. Y no cuesta mas: el documento ya se escribio, esto
         es un update. */
      await db.collection('pedidos').doc(event.params.pedidoId).update({
        bloqueadoPorLimite: true,
        pedidosEnLaHora: snap.size,
        motivoBloqueo: `Se hicieron ${snap.size} pedidos en una hora desde la misma cuenta (el limite es ${LIMITE}).`
      }).catch((e) => logger.error('No se pudo marcar el pedido:', e));
    }
  } catch (e) {
    logger.error('Error en rateLimitPedidos:', e);
  }
  });

/**
 * SANITIZACIÓN SERVER-SIDE: limpia y valida pedidos al crearse
 */
exports.sanitizarPedido = onDocumentCreated(
  {
    document: 'pedidos/{pedidoId}',
    region: 'southamerica-east1',
    memory: '256MiB',
    timeoutSeconds: 30
  },
  async (event) => {
  const data = event.data?.data();
  if (!data) return;

  function sanitize(val, maxLen) {
    if (!val) return '';
    return String(val).replace(/[<>"'`\x00-\x1F\x7F]/g, '').trim().slice(0, maxLen);
  }

  try {
    await db.collection('pedidos').doc(event.params.pedidoId).update({
      cliente: sanitize(data.cliente, 120),
      telefono: sanitize(data.telefono, 30).replace(/[^0-9+\-\s()]/g, ''),
      direccion: data.direccion ? sanitize(data.direccion, 200) : null,
      notas: data.notas ? sanitize(data.notas, 500) : null,
    });
  } catch (e) {
    logger.error('Error en sanitizarPedido:', e);
  }
  });

/**
 * DESCUENTA EL STOCK DE UN PEDIDO WEB
 *
 * Por que vive aca y no en la web: firestore.rules tiene /productos como
 * `allow write: if isAdmin()`. Cuando el descuento se intentaba desde el
 * navegador del cliente, la transaccion moria con permission-denied SIEMPRE, y
 * como el error se tragaba en un catch, el pedido terminaba guardado sin
 * descontar una sola unidad. Solo funcionaba probandolo con una cuenta de admin,
 * que es justo lo que hace el que desarrolla.
 *
 * Aca corre con el Admin SDK, que no pasa por las reglas. El cliente nunca
 * necesita permiso de escritura sobre el catalogo, que es como tiene que ser.
 *
 * Si no alcanza el stock igual se descuenta y el producto queda en negativo: eso
 * avisa que el conteo fisico esta mal, que es informacion util. El pedido queda
 * marcado con `stockFaltante` para que el panel lo muestre antes de prepararlo.
 */
exports.descontarStockPedido = onDocumentCreated(
  {
    document: 'pedidos/{pedidoId}',
    region: 'southamerica-east1',
    memory: '256MiB',
    timeoutSeconds: 60
  },
  async (event) => {
  const snap = event.data;
  const data = snap && snap.data();
  if (!data || data.origen !== 'web') return;
  /* Las guardas de stockDescontado y bloqueadoPorLimite NO se pueden decidir aca.
     `data` es la carga del evento de CREACION, congelada:
       - stockDescontado nace SIEMPRE en false (lo escribe app.js a proposito), asi
         que "no descontar dos veces" era inalcanzable: si el evento se reentrega
         -la entrega es at-least-once- vuelve a llegar el mismo false y se descuenta
         de nuevo.
       - bloqueadoPorLimite ni siquiera existe en esa carga, porque rateLimitPedidos
         lo agrega con un update POSTERIOR. Era codigo muerto: al pedido frenado por
         limite se le descontaba el stock igual, mientras el panel afirmaba lo
         contrario.
     Las dos se deciden ahora adentro de la transaccion, leyendo el documento vivo,
     que es el unico lugar donde la decision y la escritura no se pueden cruzar. */

  try {
    const cfg = await db.collection('config').doc('pedidos').get();
    if (cfg.exists && cfg.data().descontarStock === false) return;
  } catch (e) {
    logger.warn('No se pudo leer config/pedidos, se descuenta igual:', e);
  }

  const porProd = {};
  (data.items || []).forEach((i) => {
    if (i && i.id) porProd[i.id] = (porProd[i.id] || 0) + Number(i.cantidad || 0);
  });
  const ids = Object.keys(porProd).filter((id) => porProd[id] > 0);
  if (!ids.length) return;

  try {
    const faltantes = await db.runTransaction(async (t) => {
      /* Primero el pedido vivo, y TODAS las lecturas antes de cualquier escritura,
         que es lo que exige una transaccion de Firestore. */
      const pedSnap = await t.get(snap.ref);
      if (!pedSnap.exists) return null;               /* lo borraron mientras tanto */
      const ped = pedSnap.data();
      if (ped.stockDescontado === true) return null;  /* ya se descontó: no dos veces */
      if (ped.bloqueadoPorLimite === true) return null; /* rateLimitPedidos lo frenó */
      const refs = ids.map((id) => db.collection('productos').doc(id));
      const snaps = await t.getAll(...refs);
      const falt = [];
      const bajoCosto = [];
      /* Un item cuyo producto ya no existe se salteaba sin dejar rastro: no descontaba,
         no entraba en falt, no sumaba al total de catalogo, y el pedido se marcaba
         stockDescontado:true igual. Pasa cuando el comercio borra y vuelve a crear un
         producto y el cliente tenia el id viejo en el carrito de localStorage. Ahora
         queda anotado en el documento para que el panel lo pueda mostrar. */
      const desconocidos = [];
      let totalCatalogo = 0;

      snaps.forEach((sn, k) => {
        if (!sn.exists) { desconocidos.push(ids[k]); return; }
        const p = sn.data();
        const disp = Number(p.stock || 0);
        const pedido = porProd[ids[k]];
        if (disp < pedido) {
          falt.push({
            id: ids[k],
            nombre: p.nombreMostrado || p.nombre || ids[k],
            pedido: pedido,
            disponible: disp
          });
        }
        /* Precio de catalogo al momento de procesar, para poder comparar contra lo
           que se le cobro. No se corrige solo: que el precio haya cambiado entre que
           el cliente abrio la pagina y confirmo es normal y no es fraude, y encima el
           cliente acepto ESE precio. Cambiarselo despues seria peor. */
        const base = Number(p.precio || 0);
        const desc = Number(p.descuento || 0);
        const unidad = Math.round(base * (1 - desc / 100));
        /* En un producto a granel el precio es POR KILO y la cantidad viene en GRAMOS,
           igual que en subtotalCarrito() de la tienda. Multiplicar derecho daba el
           total x1000: 250 g de nueces a $18.000 el kilo salian $4.500.000 en vez de
           $4.500. Y como abajo se marca revisarPrecio cuando lo cobrado es menos de la
           mitad del catalogo, TODO pedido que tuviera un producto por peso quedaba
           marcado como sospechoso. Se toma tipoVenta del catalogo y no del item del
           pedido, que lo manda el cliente. */
        totalCatalogo += (p.tipoVenta === 'peso')
          ? Math.round(unidad * pedido / 1000)
          : unidad * pedido;

        /* Y aca la senal que SI distingue una manipulacion de un cambio de precios.
           Con inflacion, un pedido legitimo hecho con la pagina abierta hace rato paga
           MENOS que el catalogo de hoy: por monto solo, es igual a uno manipulado.
           Lo que nunca pasa por un cambio de precios es cobrar por debajo del COSTO,
           porque el comercio estaria perdiendo plata en cada unidad. Eso es la firma de
           alguien tocando el carrito desde la consola. */
        const itemPedido = (data.items || []).find((it) => it && it.id === ids[k]);
        const cobradoUnidad = itemPedido ? Number(itemPedido.precio || 0) : null;
        const costoUnidad = Number(p.costo || 0);
        if (cobradoUnidad !== null && costoUnidad > 0 && cobradoUnidad < costoUnidad) {
          bajoCosto.push({
            id: ids[k],
            nombre: p.nombreMostrado || p.nombre || ids[k],
            cobrado: cobradoUnidad,
            costo: costoUnidad
          });
        }
      });

      snaps.forEach((sn, k) => {
        if (!sn.exists) return;
        t.update(refs[k], {
          stock: admin.firestore.FieldValue.increment(-porProd[ids[k]])
        });
      });

      const cobrado = Number(data.subtotalProductos || 0);
      const patch = {
        stockDescontado: true,
        stockFaltante: falt.length ? falt : null,
        /* Los items que ya no existen en el catalogo: sin esto el pedido se marcaba
           como descontado sin decir que hubo productos que no se pudieron tocar. */
        itemsDesconocidos: desconocidos.length ? desconocidos : null,
        subtotalCatalogo: totalCatalogo
      };
      /* Un producto que ya no existe hace que el subtotal de catalogo no sea
         comparable con lo cobrado, asi que la señal de "revisar precio" por monto
         quedaria mal calibrada: se pide revisar el pedido a mano. */
      if (desconocidos.length) patch.revisarPrecio = true;
      /* Dos motivos distintos para marcarlo, y se guarda cual fue:
         - bajoCosto: algun item se cobro por debajo de lo que le cuesta al comercio.
           Eso no lo produce un cambio de precios, asi que es el aviso fuerte.
         - la mitad: el total quedo por debajo de la mitad del catalogo de hoy. Puede
           ser inflacion sobre una pagina vieja, asi que es un aviso mas flojo, pero
           conviene mirarlo igual antes de entregar. */
      if (bajoCosto.length) {
        patch.revisarPrecio = true;
        patch.itemsBajoCosto = bajoCosto;
      } else if (totalCatalogo > 0 && cobrado < totalCatalogo * 0.5) {
        patch.revisarPrecio = true;
      }
      patch.diferenciaCatalogo = totalCatalogo - cobrado;
      t.update(snap.ref, patch);

      return falt;
    });

    /* null = la transaccion decidio no hacer nada (ya estaba descontado, lo frenó el
       rate limit, o el pedido ya no existe). No es un error y no se toca el pedido. */
    if (faltantes === null) {
      logger.info('No se descuenta stock del pedido', { pedido: event.params.pedidoId });
      return;
    }
    if (faltantes.length) {
      logger.warn('Pedido con stock insuficiente', {
        pedido: event.params.pedidoId,
        faltantes: faltantes
      });
    }
  } catch (e) {
    logger.error('Error descontando stock del pedido:', e);
    try {
      await snap.ref.update({
        stockDescontado: false,
        stockError: String(e && e.message ? e.message : e).slice(0, 300)
      });
    } catch (e2) {
      logger.error('Tampoco se pudo marcar el error en el pedido:', e2);
    }
  }
  });

/**
 * SINCRONIZA EL CUSTOM CLAIM `admin` CON LA COLECCION /admins
 *
 * Las reglas de Firestore resuelven quien es admin leyendo /admins, pero las de
 * Storage NO pueden leer Firestore. Para que un admin nuevo pueda subir imagenes
 * hace falta que la marca viaje en su token, y eso es un custom claim.
 *
 * Ojo con el caso que parece un detalle y no lo es: se puede agregar como admin a
 * alguien que NUNCA inicio sesion. Ese usuario todavia no existe en Auth, asi que
 * no hay a quien ponerle el claim. En ese caso se deja anotado en el documento y
 * lo aplica aplicarClaimAlIngresar cuando la persona entra por primera vez.
 */
exports.sincronizarClaimAdmin = onDocumentWritten(
  {
    document: 'admins/{mail}',
    region: 'southamerica-east1',
    memory: '256MiB',
    timeoutSeconds: 60
  },
  async (event) => {
  const mail = event.params.mail;
  const existiaAntes = !!(event.data && event.data.before && event.data.before.exists);
  const existeAhora = !!(event.data && event.data.after && event.data.after.exists);

  /* CORTE DEL BUCLE. Esta funcion escribe en el MISMO documento que la dispara
     (claimPendiente y claimAplicadoEn), asi que cada una de esas escrituras la volvia
     a disparar: se quedaba girando sola, poniendo el mismo claim una y otra vez y
     facturando invocaciones para siempre.
     Lo unico que hay que sincronizar es cuando el documento APARECE (se agrego un
     admin) o DESAPARECE (se lo quito). Un update —que es lo que hace esta funcion, y
     tambien cualquier retoque de los campos de control— no cambia nada de eso. */
  if (existiaAntes === existeAhora) return;

  let user = null;
  try {
    user = await admin.auth().getUserByEmail(mail);
  } catch (e) {
    if (existeAhora) {
      /* Todavia no tiene cuenta. Queda pendiente y se resuelve al primer ingreso. */
      logger.info('Admin agregado sin cuenta de Auth todavia: ' + mail);
      try {
        await db.collection('admins').doc(mail).set({ claimPendiente: true }, { merge: true });
      } catch (e2) { logger.error('No se pudo marcar claimPendiente:', e2); }
    }
    return;
  }

  try {
    const claims = Object.assign({}, user.customClaims || {});
    if (existeAhora) claims.admin = true; else delete claims.admin;
    await admin.auth().setCustomUserClaims(user.uid, claims);
    /* Se invalidan los tokens vigentes. Al quitar un admin esto es lo que importa:
       sin esto seguiria pudiendo subir imagenes hasta que su token venciera solo. */
    await admin.auth().revokeRefreshTokens(user.uid);
    if (existeAhora) {
      await db.collection('admins').doc(mail).set(
        { claimPendiente: false, claimAplicadoEn: new Date() }, { merge: true });
    }
    logger.info((existeAhora ? 'Claim admin puesto a ' : 'Claim admin quitado a ') + mail);
  } catch (e) {
    logger.error('Error sincronizando el claim de ' + mail + ':', e);
  }
  });

/**
 * Aplica el claim la primera vez que entra alguien que ya estaba en /admins.
 * Cubre el caso de arriba: se lo agrego al panel antes de que tuviera cuenta.
 */
exports.aplicarClaimAlIngresar = functionsV1
  .region('southamerica-east1')
  .auth.user()
  .onCreate(async (user) => {
    const mail = (user.email || '').toLowerCase();
    if (!mail) return;
    try {
      const snap = await db.collection('admins').doc(mail).get();
      if (!snap.exists) return;
      await admin.auth().setCustomUserClaims(user.uid, { admin: true });
      await db.collection('admins').doc(mail).set(
        { claimPendiente: false, claimAplicadoEn: new Date() }, { merge: true });
      logger.info('Claim admin aplicado al primer ingreso de ' + mail);
    } catch (e) {
      logger.error('Error aplicando el claim al ingresar (' + mail + '):', e);
    }
  });


/* ===========================================================================
 * ESPACIO OCUPADO EN STORAGE
 * ---------------------------------------------------------------------------
 * El panel muestra cuanto espacio hay ocupado y no deja pasar el tope. Para eso
 * necesita un numero, y Storage no expone un "total" que se pueda consultar.
 *
 * Se resuelve con tres piezas que se complementan:
 *
 *   sumarUsoStorage / restarUsoStorage
 *     Reaccionan a cada archivo que entra o sale y ajustan el total al momento,
 *     asi la barra se mueve apenas se sube algo. Son baratas pero no perfectas:
 *     pisar un archivo con otro del mismo nombre dispara solo el alta, sin la
 *     baja, y el total queda de mas.
 *
 *   recalcularUsoStorage
 *     La cuenta exacta. Recorre el bucket entero y reemplaza el total. El listado
 *     del Admin SDK ya trae el tamaño de cada archivo, asi que son unas pocas
 *     peticiones aunque haya miles. Corrige la desviacion de las otras dos.
 *     Se dispara escribiendo `recalcular: true` en config/storage, que es lo que
 *     hace el panel al abrirse si el numero quedo viejo.
 *
 * El documento config/storage queda con: bytes, archivos, actualizado y exacto.
 * `exacto` en false significa "esto viene de sumas y restas, puede haber
 * corrido un poco"; el panel lo usa para saber cuando conviene recalcular.
 * =========================================================================== */

const REF_USO = () => db.collection('config').doc('storage');

exports.sumarUsoStorage = onObjectFinalized(
  {
    /* En la region del BUCKET, no en la de Firestore: un disparador de Storage
       tiene que estar donde vive el bucket o el despliegue lo rechaza. */
    region: 'us-east1', memory: '256MiB', timeoutSeconds: 60},
  async (event) => {
    const size = Number(event.data && event.data.size) || 0;
    if (!size) return;
    try {
      await REF_USO().set({
        bytes: admin.firestore.FieldValue.increment(size),
        archivos: admin.firestore.FieldValue.increment(1),
        actualizado: admin.firestore.FieldValue.serverTimestamp(),
        exacto: false
      }, {merge: true});
    } catch (e) {
      logger.error('No se pudo sumar el uso de storage:', e);
    }
  }
);

exports.restarUsoStorage = onObjectDeleted(
  {
    /* En la region del BUCKET, no en la de Firestore: un disparador de Storage
       tiene que estar donde vive el bucket o el despliegue lo rechaza. */
    region: 'us-east1', memory: '256MiB', timeoutSeconds: 60},
  async (event) => {
    const size = Number(event.data && event.data.size) || 0;
    if (!size) return;
    try {
      await REF_USO().set({
        bytes: admin.firestore.FieldValue.increment(-size),
        archivos: admin.firestore.FieldValue.increment(-1),
        actualizado: admin.firestore.FieldValue.serverTimestamp(),
        exacto: false
      }, {merge: true});
    } catch (e) {
      logger.error('No se pudo restar el uso de storage:', e);
    }
  }
);

exports.recalcularUsoStorage = onDocumentWritten(
  {
    document: 'config/storage',
    region: 'southamerica-east1',
    memory: '512MiB',
    timeoutSeconds: 300
  },
  async (event) => {
    const despues = event.data && event.data.after && event.data.after.data();
    /* Solo trabaja cuando se lo piden. Sin esta salida temprana la propia
       escritura del resultado volveria a dispararla, y no pararia nunca. */
    if (!despues || despues.recalcular !== true) return;

    try {
      const bucket = admin.storage().bucket();
      let bytes = 0;
      let archivos = 0;
      let pageToken;
      /* getFiles ya devuelve el tamaño de cada archivo en la misma respuesta, asi
         que esto son unas pocas peticiones y no una por archivo. */
      do {
        const [files, next] = await bucket.getFiles({maxResults: 1000, pageToken, autoPaginate: false});
        files.forEach((f) => {
          const t = Number(f.metadata && f.metadata.size) || 0;
          if (t > 0) { bytes += t; archivos++; }
        });
        pageToken = next && next.pageToken;
      } while (pageToken);

      await REF_USO().set({
        bytes: bytes,
        archivos: archivos,
        actualizado: admin.firestore.FieldValue.serverTimestamp(),
        exacto: true,
        recalcular: false
      }, {merge: true});
      logger.info(`Uso de storage recalculado: ${archivos} archivos, ${bytes} bytes`);
    } catch (e) {
      logger.error('No se pudo recalcular el uso de storage:', e);
      await REF_USO().set({recalcular: false, error: String(e && e.message || e)}, {merge: true})
        .catch(() => {});
    }
  }
);
