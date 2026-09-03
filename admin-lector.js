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
      _limpiarCampo(e.target, cod);
      procesarCodigoLeido(cod);
    }
    return;
  }
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

/* ============================ RUTEO ============================ */

function _modalAbierto(id) {
  const m = document.getElementById(id);
  return !!(m && m.classList.contains('show'));
}

function buscarPorCodigo(cod) {
  if (typeof allProducts === 'undefined' || !Array.isArray(allProducts)) return null;
  return allProducts.find(p => p.codigoBarras && String(p.codigoBarras) === String(cod)) || null;
}

function procesarCodigoLeido(cod) {
  /* Editando un producto, escanear ES cargarle el código. Es la forma natural de
     darle de alta a uno nuevo sin tener que tipear trece dígitos. */
  const campo = document.getElementById('pCodigoBarras');
  if (_modalAbierto('productModal') && campo) {
    const otro = buscarPorCodigo(cod);
    if (otro && otro.id !== (typeof editingId !== 'undefined' ? editingId : null)) {
      showAdminToast('Ese código ya es de "' + (otro.nombreMostrado || otro.nombre) + '"', 'error');
      return;
    }
    campo.value = cod;
    showAdminToast('Código cargado', 'success');
    return;
  }

  const prod = buscarPorCodigo(cod);

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
