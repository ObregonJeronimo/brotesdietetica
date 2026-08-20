/**
 * BROTES DIETÉTICA — DATOS DEL NEGOCIO (fuente única de verdad)
 * =============================================================================
 * TODO lo que cambia si el negocio se muda, cambia de teléfono o cambia la zona
 * de reparto está en este archivo. Editás acá y se actualiza en toda la web:
 * hero, carrito, checkout, footer, políticas, mayoristas y reseñas.
 *
 * Después de editar:  npm run build   (regenera los .min)  y  git push
 *
 * OJO: este archivo se sirve al navegador. No pongas nada secreto acá
 * (tokens, claves privadas, contraseñas). Ver SETUP.md → "Manejo de credenciales".
 * =============================================================================
 */
const NEGOCIO = {
  /* --- Identidad --------------------------------------------------------- */
  nombre: 'Brotes Dietética',
  nombreCorto: 'Brotes',
  tagline: 'Tu dietética de confianza',
  descripcion: 'Productos naturales y de calidad a la puerta de tu casa.',

  /* --- Contacto ---------------------------------------------------------- */
  /* Formato internacional sin + ni espacios: así lo necesita wa.me */
  whatsapp: '5493516872770',
  /* Cómo se muestra el teléfono en pantalla */
  telefonoDisplay: '+54 9 351 687-2770',
  /* Para los links tel: */
  telefonoLink: '+5493516872770',
  email: 'brotesdietetica@gmail.com',
  instagram: 'brotesdietetica',
  instagramUrl: 'https://instagram.com/brotesdietetica',

  /* --- Ubicación y logística -------------------------------------------- */
  direccion: 'Manuel de Falla',
  direccionCompleta: 'Manuel de Falla, X5021 Córdoba',
  ciudad: 'Córdoba',
  provincia: 'Córdoba',
  pais: 'Argentina',
  codigoPostal: 'X5021',
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Manuel+de+Falla%2C+X5021+C%C3%B3rdoba',

  /* Zona de reparto. Se usa en el hero, el footer, el checkout y las políticas.
     Cambiá estos dos valores y se actualiza en todos lados. */
  zonaEnvio: 'Rivera Indarte y alrededores',
  zonaEnvioDetalle: 'Hacemos envíos en Rivera Indarte y alrededores.',

  horario: 'Lun - Sáb: 9:00 - 20:00',

  /* --- Ecommerce --------------------------------------------------------- */
  /* Los umbrales de envio NO viven aca. La barra de progreso del carrito y el
     checkout leen config/pedidos de Firestore (defaults en app.js), y eso se edita
     desde /admin -> Configuracion -> Pedidos y envios.
     Aca habia dos claves, envioGratisDesde y envioBonificadoDesde, con un comentario
     que decia que manejaban la barra del carrito: no las leia nadie, asi que se las
     cambiaba, se hacia el deploy y no pasaba nada. Se sacaron para que no vuelva a
     costar una tarde entender por que. */

  /* --- Desarrollador (footer "Desarrollado por") ------------------------- */
  dev: {
    nombre: 'Deft Software Solutions',
    /* Contacto comercial de Deft. Cambiar SOLO aca: el pie del sitio y la pagina de
       politicas lo leen de este objeto, no lo tienen escrito. */
    contacto: 'Joaco Brarda Melchionna',
    whatsapp: '5493512333009',
    telefonoDisplay: '+54 9 3512 33-3009',
    /* Para los links tel:. Faltaba, y sin esto data-negocio-href="devTelLink"
       escribia tel:undefined. */
    telefonoLink: '+5493512333009',
    web: '',
  },

  /* --- Admins del panel /admin ------------------------------------------
     Esto SOLO controla lo que muestra la interfaz. La seguridad real está en
     firestore.rules → isAdmin(). Si agregás uno acá, agregalo también allá. */
  /* Solo informativo. Quien entra al panel se decide en la coleccion /admins de
     Firestore, y se maneja desde /admin -> Configuracion -> Quien puede entrar.
     Esta lista no habilita ni bloquea a nadie: si la tocas, no pasa nada. */
  /* El dueño. El panel lo lee de aca (admin.html -> MAIL_DUENIO) para no tenerlo
     repetido en el codigo de la interfaz.
     OJO: figura ADEMAS en firestore.rules y storage.rules, y eso no se puede
     evitar: las reglas se evaluan en el servidor y no pueden leer este archivo.
     Ese literal es la salida de emergencia si la coleccion /admins quedara vacia
     o inaccesible. Si cambia el dueño, hay que tocar los TRES lugares. */
  mailDuenio: 'jeroobregon03@gmail.com',
};

/* Helpers para armar links de WhatsApp sin repetir el número por todo el código */
NEGOCIO.waLink = function (texto) {
  const base = 'https://wa.me/' + NEGOCIO.whatsapp;
  return texto ? base + '?text=' + encodeURIComponent(texto) : base;
};
NEGOCIO.waDevLink = function (texto) {
  const base = 'https://wa.me/' + NEGOCIO.dev.whatsapp;
  return texto ? base + '?text=' + encodeURIComponent(texto) : base;
};

/**
 * Rellena el HTML estático con los datos de arriba.
 * Cualquier elemento con data-negocio="clave" recibe el valor como texto,
 * y con data-negocio-href="clave" lo recibe como href.
 * Así el HTML no repite el teléfono ni la dirección en 20 lugares.
 */
NEGOCIO.hidratarDOM = function (root) {
  const scope = root || document;
  /* El elemento se pasa para que un link de WhatsApp pueda traer su propio mensaje en
     data-negocio-msg. El numero es un dato del negocio y va en este archivo; el texto
     del mensaje es copy de esa pantalla en particular y va en el HTML, al lado del
     boton que lo usa. Antes el mensaje del boton del desarrollador estaba escrito aca
     adentro y los del comercio directamente en el href, con el numero pegado: si el
     comercio cambiaba de telefono, esos botones seguian mandando al viejo. */
  const valor = (clave, el) => {
    const msg = el && el.getAttribute('data-negocio-msg');
    switch (clave) {
      case 'waLink': return NEGOCIO.waLink(msg || '');
      case 'waDevLink': return NEGOCIO.waDevLink(msg || 'Hola! Me gustaría hacer un sistema');
      case 'telLink': return 'tel:' + NEGOCIO.telefonoLink;
      case 'devTelLink': return 'tel:' + NEGOCIO.dev.telefonoLink;
      case 'mailLink': return 'mailto:' + NEGOCIO.email;
      case 'devTelefono': return NEGOCIO.dev.telefonoDisplay;
      case 'devNombre': return NEGOCIO.dev.nombre;
      default: return NEGOCIO[clave];
    }
  };
  scope.querySelectorAll('[data-negocio]').forEach(el => {
    const v = valor(el.getAttribute('data-negocio'), el);
    if (v != null) el.textContent = v;
  });
  scope.querySelectorAll('[data-negocio-href]').forEach(el => {
    const v = valor(el.getAttribute('data-negocio-href'), el);
    if (v != null) el.setAttribute('href', v);
  });
};

/**
 * Numero de pedido, un solo formato para todos.
 * ---------------------------------------------------------------------------
 * Estaba escrito cuatro veces con tres anchos distintos: el cliente confirmaba y
 * veia "#007", en Mis Pedidos el mismo pedido era "#000007", y el comercio lo veia
 * como "#00007" en el panel y en el aviso de Telegram. Cuando el cliente llamaba
 * diciendo "el pedido 7" no habia forma de buscarlo escribiendo lo que el leia.
 * Cinco digitos porque es lo que ya usan el panel y la funcion de Telegram, o sea
 * lo que el comercio tiene a la vista todos los dias.
 */
NEGOCIO.nroPedido = function (n) {
  return '#' + String(Number(n) || 0).padStart(5, '0');
};

/**
 * Numero de venta. Es OTRA numeracion que la de pedidos y por eso tiene su propia
 * funcion: un pedido web #00042 y una venta #000042 no son lo mismo y no deberian
 * parecerlo. Seis digitos porque es lo que ya usan la tarjeta de venta, la factura A4
 * y el modal de edicion. El ticket termico imprimia cinco, asi que el papel que se le
 * daba al cliente y la pantalla del comercio mostraban numeros distintos para la
 * misma venta; con esto imprimen el mismo.
 */
NEGOCIO.nroVenta = function (n) {
  return '#' + String(Number(n) || 0).padStart(6, '0');
};

/**
 * Lo que el comercio cambia desde el panel gana sobre lo de arriba.
 * ---------------------------------------------------------------------------
 * Los datos de contacto se pueden editar desde /admin -> Editor Web, y eso queda
 * en Firestore (config/siteContent). index.html ya lo aplica porque carga el SDK
 * de Firebase, pero mayoristas.html y politicas.html cargan SOLO este archivo:
 * el comercio cambiaba su WhatsApp en el panel y la pagina de mayoristas seguia
 * mandando los pedidos al numero viejo, sin que nadie se enterara hasta que
 * alguien reclamara una consulta que nunca llego.
 *
 * Se lee por la API REST y no con el SDK a proposito: son dos paginas estaticas y
 * sumarles ~400 KB de SDK por un telefono no se justifica. config/siteContent es
 * de lectura publica (firestore.rules -> match /config/{doc} allow read), asi que
 * una sola peticion sin autenticar alcanza. El id del proyecto no es secreto: ya
 * esta a la vista en firebase-config.js, que se sirve en la tienda.
 *
 * Primero se pinta con los valores de arriba, para que la pagina no espere a la
 * red; si el panel tiene otro valor, se repinta un instante despues. Si la
 * peticion falla, queda lo de arriba y no se rompe nada.
 */
NEGOCIO._PROYECTO = 'brotesdietetica-2f78e';

NEGOCIO.aplicarContenidoDelPanel = function () {
  if (typeof fetch !== 'function') return Promise.resolve(false);
  const url = 'https://firestore.googleapis.com/v1/projects/' + NEGOCIO._PROYECTO +
              '/databases/(default)/documents/config/siteContent';
  return fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const f = j && j.fields;
      if (!f) return false;
      const txt = (k) => (f[k] && typeof f[k].stringValue === 'string' ? f[k].stringValue.trim() : '');

      /* WhatsApp: en el panel se guarda como digitos. Se valida el largo porque un
         numero a medio escribir mandaria los pedidos a la nada. */
      const wa = txt('whatsapp').replace(/[^0-9]/g, '');
      if (wa.length >= 8 && wa !== NEGOCIO.whatsapp) {
        NEGOCIO.whatsapp = wa;
        /* El link tel: sale de los digitos y siempre queda bien. */
        NEGOCIO.telefonoLink = '+' + wa;
      }
      /* Como se MUESTRA el telefono lo escribe el comercio en el panel, en su propio
         campo. Antes esto lo armaba con un regex a partir de los digitos, y ese regex
         mentia: 5493516872770 salia "+54 9 351 6872770" (sin separar el final) y un
         numero de Buenos Aires salia "+54 1 155...". Los codigos de area argentinos
         van de 2 a 4 digitos y no se distinguen mirando el numero, asi que no hay
         formula: lo sabe quien tiene el telefono. */
      const disp = txt('telefonoDisplay');
      if (disp) NEGOCIO.telefonoDisplay = disp;
      else if (wa.length >= 8 && wa !== NEGOCIO.whatsapp) NEGOCIO.telefonoDisplay = '+' + wa;

      const mail = txt('email');
      if (mail && mail.indexOf('@') > 0) NEGOCIO.email = mail;

      /* En el panel Instagram se guarda como URL completa; aca arriba esta como
         usuario. Se acepta cualquiera de las dos formas. */
      const ig = txt('instagram');
      if (ig) {
        if (/^https?:\/\//i.test(ig)) {
          NEGOCIO.instagramUrl = ig;
          const u = ig.replace(/\/+$/, '').split('/').pop();
          if (u) NEGOCIO.instagram = u;
        } else {
          NEGOCIO.instagram = ig.replace(/^@/, '');
          NEGOCIO.instagramUrl = 'https://instagram.com/' + NEGOCIO.instagram;
        }
      }

      NEGOCIO.hidratarDOM();
      return true;
    })
    .catch(() => false);
};

document.addEventListener('DOMContentLoaded', () => {
  NEGOCIO.hidratarDOM();
  NEGOCIO.aplicarContenidoDelPanel();
});
