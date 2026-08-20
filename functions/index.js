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
    const itemsTxt = (pedido.items || [])
      .map(i => `${escHtml(i.nombre)} x${i.cantidad}`)
      .join(', ');
    let msg = `<b>🛒 Nuevo pedido WEB #${num}</b>\n`;
    msg += `<b>Cliente:</b> ${escHtml(pedido.cliente || '-')}\n`;
    msg += `<b>Tel:</b> ${escHtml(pedido.telefono || '-')}\n`;
    msg += `<b>Entrega:</b> ${pedido.tipoEntrega === 'retiro' ? 'Retiro en local' : 'Envío a domicilio'}\n`;
    if (pedido.direccion) msg += `<b>Dirección:</b> ${escHtml(pedido.direccion)}\n`;
    if (pedido.notas) msg += `<b>Notas:</b> ${escHtml(pedido.notas)}\n`;
    if (itemsTxt) msg += `<b>Items:</b> ${itemsTxt}\n`;
    msg += `<b>Total:</b> $${(pedido.total || 0).toLocaleString('es-AR')}`;
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
      logger.warn(`Rate limit: UID ${uid} hizo ${snap.size} pedidos en la ultima hora. Eliminando el excedente.`);
      /* Eliminar el pedido recién creado */
      await db.collection('pedidos').doc(event.params.pedidoId).delete();
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
  if (data.stockDescontado === true) return;   /* idempotente: no descontar dos veces */

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
      const refs = ids.map((id) => db.collection('productos').doc(id));
      const snaps = await t.getAll(...refs);
      const falt = [];
      let totalCatalogo = 0;

      snaps.forEach((sn, k) => {
        if (!sn.exists) return;
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
           el cliente abrio la pagina y confirmo es normal y no es fraude. */
        const base = Number(p.precio || 0);
        const desc = Number(p.descuento || 0);
        totalCatalogo += Math.round(base * (1 - desc / 100)) * pedido;
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
        subtotalCatalogo: totalCatalogo
      };
      /* Solo se marca cuando la diferencia no se explica por un cambio de precios:
         pagar menos de la mitad de lo que vale hoy es otra cosa. */
      if (totalCatalogo > 0 && cobrado < totalCatalogo * 0.5) patch.revisarPrecio = true;
      t.update(snap.ref, patch);

      return falt;
    });

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
