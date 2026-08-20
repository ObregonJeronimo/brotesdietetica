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
    whatsapp: '5493512067970',
    telefonoDisplay: '+54 9 351 206-7970',
    web: '',
  },

  /* --- Admins del panel /admin ------------------------------------------
     Esto SOLO controla lo que muestra la interfaz. La seguridad real está en
     firestore.rules → isAdmin(). Si agregás uno acá, agregalo también allá. */
  /* Solo informativo. Quien entra al panel se decide en la coleccion /admins de
     Firestore, y se maneja desde /admin -> Configuracion -> Quien puede entrar.
     Esta lista no habilita ni bloquea a nadie: si la tocas, no pasa nada. */
  ADMIN_EMAILS_INFORMATIVO: [
    'jeroobregon03@gmail.com',   /* dueño, fijo en las reglas */
  ],
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
  const valor = (clave) => {
    switch (clave) {
      case 'waLink': return NEGOCIO.waLink();
      case 'waDevLink': return NEGOCIO.waDevLink('Hola! Me gustaría hacer un sistema');
      case 'telLink': return 'tel:' + NEGOCIO.telefonoLink;
      case 'mailLink': return 'mailto:' + NEGOCIO.email;
      case 'devTelefono': return NEGOCIO.dev.telefonoDisplay;
      case 'devNombre': return NEGOCIO.dev.nombre;
      default: return NEGOCIO[clave];
    }
  };
  scope.querySelectorAll('[data-negocio]').forEach(el => {
    const v = valor(el.getAttribute('data-negocio'));
    if (v != null) el.textContent = v;
  });
  scope.querySelectorAll('[data-negocio-href]').forEach(el => {
    const v = valor(el.getAttribute('data-negocio-href'));
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

document.addEventListener('DOMContentLoaded', () => NEGOCIO.hidratarDOM());
