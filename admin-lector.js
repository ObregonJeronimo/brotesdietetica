/* =============================================================================
   LECTOR DE CÓDIGOS DE BARRAS  —  Brotes Dietética
   =============================================================================
   Un lector USB no es un dispositivo especial para el navegador: se presenta
   como un teclado. "Escribe" el código entero en milisegundos y termina con
   Enter. No hay permiso que pedir ni driver que instalar — se enchufa y anda.

   De ahí sale la única heurística del archivo: si varias teclas llegan separadas
   por menos de 40 ms y termina en Enter, eso lo escribió una máquina. Una
   persona tecleando no baja de ~80 ms entre teclas ni de lejos.

   EL CATÁLOGO ARRANCA SIN NINGÚN CÓDIGO CARGADO, y cargarlos a mano de a uno no
   va a pasar nunca. Por eso el flujo es aprender en el mostrador: la primera vez
   que se escanea algo desconocido, el panel pregunta a qué producto corresponde
   y lo guarda. De la segunda vez en adelante, ese producto entra de una.

   Lo que se vende suelto (a granel, fraccionado) no tiene código de fábrica y no
   lo va a tener nunca: eso se sigue buscando por nombre. El lector es una ayuda
   para lo envasado, no un reemplazo del buscador.
   ============================================================================= */

const LECTOR_GAP_MAX = 40;    /* ms entre teclas para considerarlo una máquina */
const LECTOR_LARGO_MIN = 4;   /* menos que esto es un tipeo suelto, no un código */

let _lecBuf = '';
let _lecUltima = 0;
let _lecRafaga = false;
let _lecCodigoPendiente = null;

/* Capture phase: tiene que correr antes que cualquier otro handler para poder
   frenar el Enter, que si no dispara el submit del formulario que esté abierto. */
document.addEventListener('keydown', function (e) {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  /* `key` no siempre viene. Un evento sintetico, un autocompletado del navegador o
     una extension pueden disparar keydown sin el campo, y mas abajo se hace
     e.key.length. Esto corria en fase de CAPTURA sobre document, es decir antes que
     cualquier otro handler de la pagina y en CADA tecla del panel, asi que una
     excepcion aca ensuciaba la consola de errores constantemente.
     Visto en produccion: "Cannot read properties of undefined (reading 'length')". */
  if (typeof e.key !== 'string') { _lecBuf = ''; _lecRafaga = false; return; }
  const t = e.timeStamp;
  const gap = t - _lecUltima;
  _lecUltima = t;

  if (e.key === 'Enter') {
    const cod = _lecBuf;
    _lecBuf = '';
    const eraRafaga = _lecRafaga;
    _lecRafaga = false;
    if (eraRafaga && cod.length >= LECTOR_LARGO_MIN && gap <= LECTOR_GAP_MAX) {
      e.preventDefault();
      e.stopPropagation();
      _enterUno = 0;            /* el Enter de la pistola no cuenta para cerrar */
      _limpiarCampo(e.target, cod);
      procesarCodigoLeido(cod);
    } else {
      /* Enter de una persona: puede ser el de cerrar la venta. */
      _enterHumano(e);
    }
    return;
  }
  _enterUno = 0;   /* cualquier otra tecla corta la seguidilla de Enters */
  if (e.key.length !== 1) { _lecBuf = ''; _lecRafaga = false; return; }
  if (gap > LECTOR_GAP_MAX) { _lecBuf = e.key; _lecRafaga = false; }
  else { _lecBuf += e.key; _lecRafaga = _lecBuf.length >= 2; }
}, true);

/* Si el foco estaba en un campo, el código ya se escribió ahí. Se borra para que
   no quede pegado adelante de lo que la persona escriba después. */
function _limpiarCampo(target, cod) {
  if (!target || !target.value) return;
  const tag = (target.tagName || '').toLowerCase();
  if (tag !== 'input' && tag !== 'textarea') return;
  if (target.value.indexOf(cod) !== -1) {
    target.value = target.value.replace(cod, '');
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

/* ===================== VENTA RAPIDA: DOBLE ENTER =====================

   El que atiende no deberia tener que soltar la pistola. El flujo es: tocar V,
   escanear todo lo que compra el cliente, y cerrar con DOS Enter seguidos. Sin
   mouse y sin poner el foco en ningun campo.

   Por que DOS y no uno: la pistola termina cada lectura con un Enter. Cuando la
   rafaga se detecta, ese Enter se traga arriba y no llega aca; pero si un lector
   escribe mas lento que LECTOR_GAP_MAX, su Enter pasa por humano. Con un solo
   Enter, ese caso registraria la venta a mitad de carga. Con dos seguidos no:
   entre lectura y lectura hay digitos, y cualquier tecla que no sea Enter corta
   la seguidilla.

   Y tienen que ser RAPIDOS, uno detras del otro: si pasa mas de VENTA_DOBLE_ENTER_MS
   se vuelve a empezar. Un Enter suelto no hace nada, a proposito.

   Vive en este archivo y no en admin.html porque es el unico lugar que sabe si un
   Enter lo mando la pistola o una persona: arriba ya se distinguio la rafaga. */

const VENTA_DOBLE_ENTER_MS = 1000;
let _enterUno = 0;

/* Sobre que modal cierra. Devuelve null si no hay ninguno de venta abierto. */
function _ventaRapidaDestino() {
  if (_modalAbierto('ventaModal')) {
    return { boton: 'saveVentaBtn', guardar: 'saveVenta',
             items: (typeof ventaItems !== 'undefined') ? ventaItems : null, que: 'venta' };
  }
  if (_modalAbierto('ventaMayModal')) {
    return { boton: 'saveVentaMayBtn', guardar: 'saveVentaMay',
             items: (typeof ventaMayItems !== 'undefined') ? ventaMayItems : null, que: 'venta mayorista' };
  }
  return null;
}

/* Escribiendo en un campo, Enter es del campo: confirma el cliente que se esta
   buscando, salta a la linea siguiente de una nota. No puede cerrar la venta. */
function _escribiendo(el) {
  if (!el) return false;
  const tag = (el.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true;
}

/* Con OTRA ventana encima -asignar un codigo, una confirmacion- el Enter es de
   esa, no de la venta que quedo atras. */
function _hayOtroModalEncima(idVenta) {
  return [].slice.call(document.querySelectorAll('.modal-overlay.show'))
           .some(function (m) { return m.id !== idVenta; });
}

function _enterHumano(e) {
  const d = _ventaRapidaDestino();
  if (!d) { _enterUno = 0; return; }
  if (_escribiendo(e.target)) { _enterUno = 0; return; }
  if (_hayOtroModalEncima(d.que === 'venta' ? 'ventaModal' : 'ventaMayModal')) { _enterUno = 0; return; }

  const ahora = Date.now();
  if (!_enterUno || (ahora - _enterUno) > VENTA_DOBLE_ENTER_MS) {
    /* Primer Enter: no pasa nada, a proposito. */
    _enterUno = ahora;
    return;
  }
  _enterUno = 0;
  e.preventDefault();
  cerrarVentaRapida(d);
}

/* Si falta algo para poder cerrar, se dice QUE falta. Quedarse callado con la
   pistola en la mano es peor que no tener el atajo. */
function cerrarVentaRapida(d) {
  const btn = document.getElementById(d.boton);
  if (btn && btn.disabled) return;             /* ya se esta guardando */
  if (!d.items || !d.items.length) {
    showAdminToast('No hay productos en la ' + d.que + '. Escanealos antes de cerrar.', 'error');
    return;
  }
  if (typeof window[d.guardar] !== 'function') {
    showAdminToast('No se pudo registrar la ' + d.que, 'error');
    return;
  }
  window[d.guardar]();
}

/* ============================ RUTEO ============================ */

function _modalAbierto(id) {
  const m = document.getElementById(id);
  return !!(m && m.classList.contains('show'));
}

function _normCod(v) {
  return String(v == null ? '' : v).trim().toUpperCase();
}

/* Un codigo escaneado puede ser de DOS clases, y las dos valen:
     - codigoBarras: el de fabrica, el que ya viene impreso en el envase
     - codigo:       el interno de Brotes, que es el que sale en las etiquetas que
                     imprime el propio comercio
   El catalogo arranca sin codigos de barra -hoy hay 1 cargado de 1484-, asi que si
   solo se mirara ese campo la pistola no serviria para nada hasta cargarlos todos a
   mano. Los 1484 SI tienen `codigo`.

   Las dos comparaciones son EXACTAS. El buscador del modal de venta usa includes()
   -'000320'.includes('320')-, y para elegir a mano esta bien; para agregar SOLO no
   sirve: '320' entraria en media docena de productos y se cargaria cualquiera. */
function coincidenciasCodigo(cod) {
  if (typeof allProducts === 'undefined' || !Array.isArray(allProducts)) return [];
  const c = _normCod(cod);
  if (!c) return [];
  return allProducts.filter(p => _normCod(p.codigoBarras) === c || _normCod(p.codigo) === c);
}

/* Solo devuelve producto si hay UNO. Con dos o mas no se elige por el operador:
   agregar el equivocado a una venta es plata mal cobrada y stock mal descontado.

   Si ningun campo coincide, queda un tercer caso: las ETIQUETAS QUE IMPRIME EL
   LOCAL. Esas no estan guardadas en ningun campo -son un EAN-13 que lleva adentro
   el codigo interno, con prefijo y digito verificador-, asi que hay que decodificarlas.
   Sin esto, escanear una bolsa de granel etiquetada por el propio local abria "a que
   producto corresponde este codigo", como si fuera de un fabricante desconocido. */
function buscarPorCodigo(cod) {
  const m = coincidenciasCodigo(cod);
  if (m.length === 1) return m[0];
  if (m.length > 1) return null;   /* ambiguo: lo avisa procesarCodigoLeido */
  if (typeof etiquetaProductoDe === 'function' &&
      typeof allProducts !== 'undefined' && Array.isArray(allProducts)) {
    return etiquetaProductoDe(cod, allProducts);
  }
  return null;
}

/* Para la unicidad del codigo de barras se mira SOLO ese campo: que un codigo de
   barras coincida con el codigo interno de otro producto no lo vuelve duplicado. */
function productoConCodigoBarras(cod, exceptoId) {
  if (typeof allProducts === 'undefined' || !Array.isArray(allProducts)) return null;
  const c = _normCod(cod);
  if (!c) return null;
  return allProducts.find(p => p.id !== exceptoId && _normCod(p.codigoBarras) === c) || null;
}

function procesarCodigoLeido(cod) {
  /* Editando un producto, escanear ES cargarle el código. Es la forma natural de
     darle de alta a uno nuevo sin tener que tipear trece dígitos. */
  const campo = document.getElementById('pCodigoBarras');
  if (_modalAbierto('productModal') && campo) {
    const otro = productoConCodigoBarras(cod, (typeof editingId !== 'undefined' ? editingId : null));
    if (otro) {
      showAdminToast('Ese código ya es de "' + (otro.nombreMostrado || otro.nombre) + '"', 'error');
      return;
    }
    if (typeof etiquetaProductoDe === 'function' && etiquetaProductoDe(cod, allProducts || [])) {
      showAdminToast('Ese es un código impreso por el local, no uno de fábrica. ' +
                     'Este campo es para el código que trae el envase.', 'error');
      return;
    }
    campo.value = cod;
    showAdminToast('Código cargado', 'success');
    return;
  }

  /* CON "CODIGO DESCONOCIDO" ABIERTO NO SE SIGUE ESCANEANDO A CIEGAS.
     El chequeo de ventaModal esta mas abajo y ese modal sigue abierto DETRAS, asi
     que sin esto la lectura siguiente entraba a la venta de atras mientras la
     pantalla seguia mostrando el codigo viejo: el cajero no veia lo que estaba
     cargando, y si despues elegia un producto le asignaba el codigo ANTERIOR.
     Se resuelve el que quedo pendiente -asignarlo, crearlo o cancelar- y se sigue. */
  if (_modalAbierto('asignarCodigoModal')) {
    showAdminToast('Resolvé primero el código que quedó pendiente, o cancelá.', 'error');
    return;
  }

  const prod = buscarPorCodigo(cod);

  /* Dos productos con el mismo codigo: no se adivina. Pasa si alguien cargo dos
     veces el mismo codigo de barras, o si un codigo de barras coincide con el
     codigo interno de otro producto. */
  if (!prod) {
    const varios = coincidenciasCodigo(cod);
    if (varios.length > 1) {
      showAdminToast('El codigo ' + cod + ' lo tienen ' + varios.length + ' productos (' +
        varios.slice(0, 2).map(p => p.nombreMostrado || p.nombre).join(', ') +
        (varios.length > 2 ? '...' : '') + '). Corrija el repetido antes de escanearlo.', 'error');
      return;
    }
  }

  if (_modalAbierto('ventaModal')) {
    if (prod) _agregarYAvisar(prod, addVentaItem, () => _cantEnVenta('min', prod.id));
    else openAsignarCodigo(cod, 'venta');
    return;
  }
  if (_modalAbierto('ventaMayModal')) {
    if (prod) _agregarYAvisar(prod, addVentaMayItem, () => _cantEnVenta('may', prod.id));
    else openAsignarCodigo(cod, 'ventaMay');
    return;
  }

  /* Cargando una compra, escanear es lo mismo que buscar el producto y hacerle
     click: entra a la lista y queda listo para ponerle cuanto y a cuanto. Es el
     caso donde mas se nota, porque una compra son veinte productos seguidos y
     tipear veinte nombres es justo lo que la pistola viene a evitar. */
  if (_modalAbierto('compraModal')) {
    if (prod) { if (typeof compraEscanear === 'function') compraEscanear(prod); }
    else openAsignarCodigo(cod, 'compra');
    return;
  }

  /* Con OTRO modal abierto —un cliente, un cupón, el cierre de caja— escanear no puede
     cambiar de sección ni abrir la ficha del producto encima: eso secuestraba el panel y
     se perdía lo que la persona estaba cargando. Pasa de verdad: el lector está en el
     mostrador y alguien apoya algo sobre el gatillo. Se avisa y no se toca nada. */
  if (document.querySelector('.modal-overlay.show')) {
    showAdminToast(prod
      ? ('Código de "' + (prod.nombreMostrado || prod.nombre) + '". Cierre esta ventana para usarlo.')
      : 'Código desconocido. Cierre esta ventana para asignarlo.', 'error');
    return;
  }

  /* Fuera de una venta, escanear es consultar: abre la ficha del producto. */
  if (prod) {
    switchSection('products');
    openModal(prod.id);
  } else {
    openAsignarCodigo(cod, 'ficha');
  }
}

function _avisarAgregado(p) {
  showAdminToast('Agregado: ' + (p.nombreMostrado || p.nombre), 'success');
}

/* Cuanto hay de ese producto en la venta que se esta cargando. Se lee la lista
   en el momento, no una copia: es la unica forma de saber si el producto entro
   de verdad. */
function _cantEnVenta(ctx, id) {
  const lista = (ctx === 'may')
    ? (typeof ventaMayItems !== 'undefined' ? ventaMayItems : [])
    : (typeof ventaItems !== 'undefined' ? ventaItems : []);
  const it = (lista || []).find(x => x.id === id);
  return it ? Number(it.cantidad || 0) : 0;
}

/* Avisa DESPUES de agregar, y SOLO si de verdad entro.

   Antes avisaba en la misma linea que agregaba, y eso era mentira en un caso
   concreto: un producto que se vende por peso no entra de a uno, abre un
   dialogo preguntando cuantos gramos. Si la persona lo cancela no se agrega
   nada, pero el cartel verde "Agregado: X" ya habia salido igual. En el
   mostrador eso es peor que no avisar: se sigue con la venta creyendo que el
   producto esta cargado.

   No alcanza con esperar la promesa: agregar y cancelar terminan las dos sin
   devolver nada. Lo que se compara es la cantidad de ese producto en la venta,
   antes y despues. Si subio, entro.

   No se hace await de esto arriba a proposito: el que llama es el manejador de
   teclas del lector, que no tiene nada que esperar. El cartel sale cuando la
   persona termina de responder. */
async function _agregarYAvisar(prod, agregar, verCantidad) {
  const antes = verCantidad();
  try {
    await agregar(prod.id);
  } catch (e) {
    console.warn('No se pudo agregar el producto escaneado:', e);
    return;
  }
  if (verCantidad() > antes) _avisarAgregado(prod);
}

/* ============================ APRENDER ============================ */

function openAsignarCodigo(cod, destino) {
  _lecCodigoPendiente = { cod: cod, destino: destino };
  const el = document.getElementById('asignarCodigoTexto');
  if (el) el.textContent = cod;
  const b = document.getElementById('asignarCodigoBuscar');
  if (b) b.value = '';
  renderAsignarCodigoLista();
  document.getElementById('asignarCodigoModal').classList.add('show');
  setTimeout(() => { if (b) b.focus(); }, 60);
}
function closeAsignarCodigo() {
  document.getElementById('asignarCodigoModal').classList.remove('show');
  _lecCodigoPendiente = null;
}

/* EL PRODUCTO NO EXISTE TODAVIA.

   "Asignar" sirve cuando el producto YA esta cargado y lo unico que le falta es el
   codigo. Pero en el mostrador pasa seguido lo otro: llega mercaderia nueva, el
   cajero la escanea y no esta en el catalogo. Sin esta salida quedaba trabado a
   mitad de una venta -la lista decia "Ningun producto con ese nombre" y el unico
   boton era Cancelar-, y habia que cancelar, ir a Productos, crearlo, volver y
   empezar la venta de nuevo.

   Ahora se abre la ficha de producto nuevo con el codigo de barras ya puesto y un
   codigo interno sugerido. Al guardarlo, se escanea otra vez y entra a la venta:
   una lectura mas, y ningun camino raro que mantener. */
function crearProductoConCodigo() {
  const pend = _lecCodigoPendiente;
  const cod = pend ? pend.cod : '';
  closeAsignarCodigo();
  if (typeof switchSection === 'function') switchSection('products');
  if (typeof openModal !== 'function') {
    if (typeof showAdminToast === 'function') showAdminToast('No se pudo abrir la ficha del producto', 'error');
    return;
  }
  openModal();
  const campo = document.getElementById('pCodigoBarras');
  if (campo && cod) campo.value = cod;
  const cInterno = document.getElementById('pCodigo');
  if (cInterno && !cInterno.value && typeof sugerirCodigoProducto === 'function') {
    cInterno.value = sugerirCodigoProducto();
    if (typeof _pintarEstadoCodigo === 'function') _pintarEstadoCodigo();
  }
  const nom = document.getElementById('pNombre');
  if (nom) setTimeout(function () { nom.focus(); }, 80);
  if (typeof showAdminToast === 'function') {
    showAdminToast('Cargá el producto y guardalo. Después escanealo otra vez y entra a la venta.', 'info');
  }
}

function renderAsignarCodigoLista() {
  const cont = document.getElementById('asignarCodigoLista');
  if (!cont) return;
  const q = ((document.getElementById('asignarCodigoBuscar') || {}).value || '').toLowerCase().trim();
  let arr = (typeof allProducts !== 'undefined' && Array.isArray(allProducts)) ? allProducts : [];
  if (q) arr = arr.filter(p => ((p.nombreMostrado || '') + ' ' + (p.nombre || '')).toLowerCase().includes(q));
  else arr = arr.filter(p => !p.codigoBarras);   /* sin buscar, los que faltan asignar */
  arr = arr.slice(0, 40);
  if (!arr.length) {
    cont.innerHTML = '<p style="font-size:0.85rem;color:var(--text-dim);padding:0.6rem 0">' +
      (q ? 'Ningún producto con ese nombre.' : 'Todos los productos ya tienen código.') + '</p>';
    return;
  }
  cont.innerHTML = arr.map(p =>
    '<button type="button" onclick="asignarCodigoA(\'' + p.id + '\')" ' +
      'style="display:flex;width:100%;gap:0.6rem;align-items:center;text-align:left;background:none;border:none;' +
      'border-bottom:1px solid rgba(255,255,255,0.05);padding:0.55rem 0.3rem;cursor:pointer;color:var(--text-main)">' +
      '<span style="flex:1;font-size:0.87rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
        esc(p.nombreMostrado || p.nombre) + '</span>' +
      (p.codigoBarras ? '<span style="font-size:0.7rem;color:#EDB833;white-space:nowrap">ya tiene código</span>' : '') +
      '<span style="font-size:0.8rem;color:var(--text-dim);white-space:nowrap">$' + Number(p.precio || 0).toLocaleString('es-AR') + '</span>' +
    '</button>').join('');
}

async function asignarCodigoA(prodId) {
  if (!_lecCodigoPendiente) return;
  const { cod, destino } = _lecCodigoPendiente;
  const p = allProducts.find(x => x.id === prodId);
  if (!p) return;
  if (p.codigoBarras && p.codigoBarras !== cod &&
      !await pedirConfirmacion('"' + (p.nombreMostrado || p.nombre) + '" ya tiene el código ' + p.codigoBarras + '. ¿Reemplazarlo?',{titulo:'Ese producto ya tiene código',aceptar:'Reemplazar'})) return;
  /* Se le pregunta a Firestore, no a allProducts: la lista en memoria se cargo al entrar al
     panel y si el otro admin le asigno este codigo a otro producto desde la otra PC, aca
     sigue figurando como libre. Sin este control quedaban dos productos con el mismo codigo
     y el escaneo del mostrador metia en la venta el equivocado: mismo nombre, otro precio.
     Es el mismo control que ya hace el modal de producto mas arriba. */
  try {
    const dup = await db.collection('productos').where('codigoBarras', '==', cod).limit(1).get();
    if (!dup.empty && dup.docs[0].id !== prodId) {
      const d = dup.docs[0].data() || {};
      showAdminToast('Ese codigo ya es de "' + (d.nombreMostrado || d.nombre || 'otro producto') + '"', 'error');
      return;
    }
  } catch (e) {
    /* Si la consulta falla (sin red, reglas) no se bloquea la asignacion: queda como antes. */
    console.warn('No se pudo verificar si el codigo ya existe:', e);
  }
  try {
    await db.collection('productos').doc(prodId).update({ codigoBarras: cod });
    p.codigoBarras = cod;   /* espejo en memoria: el proximo escaneo entra de una */
    if (typeof logAction === 'function') logAction('editar', 'Código de barras asignado', cod + ' → ' + (p.nombreMostrado || p.nombre));
    showAdminToast('Código asignado a "' + (p.nombreMostrado || p.nombre) + '"', 'success');
    closeAsignarCodigo();
    if (destino === 'venta') addVentaItem(prodId);
    else if (destino === 'ventaMay') addVentaMayItem(prodId);
    /* Se le pasa el producto entero: compraEscanear necesita su `lista` para
       comprobar que sea de este proveedor. */
    else if (destino === 'compra') { if (typeof compraEscanear === 'function') compraEscanear(p); }
    else { switchSection('products'); openModal(prodId); }
  } catch (e) {
    showAdminToast('Error: ' + e.message, 'error');
  }
}
