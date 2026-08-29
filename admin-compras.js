/* =============================================================================
   COMPRAS A PROVEEDORES  —  Brotes Dietética
   =============================================================================
   La contracara de una venta. Una venta saca stock y entra plata; una compra mete
   stock y sale plata. El sistema tenía solo la mitad del circuito: sabía todo lo
   que se vendía y nada de lo que se compraba.

   Antes, cuando llegaba el proveedor, pasaban tres cosas sueltas y ninguna se
   conectaba con las otras: en Caja quedaba un egreso "Pago a proveedor" que no
   decía a quién, el stock había que subirlo a mano con la carga en tanda, y la
   factura terminaba en un cajón. Una compra junta las tres.

   TRES DECISIONES, tomadas con el cliente:

   1) EL STOCK NO SE SUMA SIEMPRE. Hay una casilla, encendida por defecto. Se
      apaga cuando la mercadería ya se contó a mano, o cuando se carga una compra
      vieja para tener el histórico de gasto: sumar ahí duplicaría el inventario.
      Apagada, la pantalla lo dice con un cartel, porque es justo el caso en el
      que después nadie se acuerda de por qué el stock no subió.

   2) LOS COSTOS NO SE PISAN SOLOS. Si pagaste $14.000 el kilo y el producto
      tenía $12.000, la compra NO lo cambia: al guardar se pregunta, con la lista
      de los que cambiaron y de cuánto a cuánto. Un costo que se mueve solo mueve
      el margen de toda la pantalla de Ganancia sin que nadie lo haya decidido.

   3) EL COSTO ES POR LA MISMA UNIDAD QUE EL PRECIO. En un producto por peso el
      precio es POR KILO y el stock va en GRAMOS. Entonces la compra pide los
      gramos que entraron y el costo POR KILO, y el subtotal divide por mil. Si se
      cargara el costo "por lo que entró", el margen de todos los productos a
      granel saldría mil veces mal y nadie lo notaría hasta cerrar el mes.

   BORRAR UNA COMPRA DEVUELVE EL STOCK que había sumado. Sin eso, una compra
   cargada dos veces por error se arregla borrando una y el inventario queda
   inflado para siempre, sin rastro de por qué.
   ============================================================================= */

let _compraItems = [];        /* los renglones que se están cargando */
let _compraArchivo = null;    /* la factura elegida, todavía sin subir */
let _compraProveedor = null;  /* id de lista */
let _comprasCache = null;     /* { dias, porProveedor, lista } */

const _cpPesos = n => '$' + Math.round(Number(n || 0)).toLocaleString('es-AR');

function _cpEsPeso(p) { return !!(p && p.tipoVenta === 'peso'); }

/* Lo que se cobra por un renglón. En los de peso el costo es por kilo y la
   cantidad son gramos: por eso divide por mil. Es la misma cuenta que
   subtotalItem() hace del lado de las ventas. */
function _cpSubtotal(it) {
  const c = Number(it.costoUnitario || 0), q = Number(it.cantidad || 0);
  return it.tipoVenta === 'peso' ? Math.round(c * q / 1000) : Math.round(c * q);
}

function _cpTotal() { return _compraItems.reduce((s, i) => s + _cpSubtotal(i), 0); }

function _cpUnidad(it) { return it.tipoVenta === 'peso' ? 'g' : 'u'; }

function _cpCant(it) {
  const q = Number(it.cantidad || 0);
  if (it.tipoVenta !== 'peso') return q.toLocaleString('es-AR') + ' u';
  return q < 1000 ? q.toLocaleString('es-AR') + ' g'
                  : (q / 1000).toLocaleString('es-AR', { maximumFractionDigits: 3 }) + ' kg';
}

/* ============================ CARGA ============================ */

async function cargarCompras(dias) {
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - dias * 86400000);
  try {
    const q = await db.collection('compras')
      .where('fecha', '>=', desde).where('fecha', '<=', hasta).get();
    const lista = [];
    q.forEach(d => lista.push(Object.assign({ docId: d.id }, d.data())));
    lista.sort((a, b) => _cpMs(b.fecha) - _cpMs(a.fecha));
    const porProveedor = {};
    lista.forEach(c => {
      const k = c.proveedorId || '__sin__';
      const p = (porProveedor[k] = porProveedor[k] || { total: 0, count: 0, compras: [] });
      p.total += Number(c.total || 0); p.count++; p.compras.push(c);
    });
    _comprasCache = { dias: dias, porProveedor: porProveedor, lista: lista };
  } catch (e) {
    console.warn('compras:', e);
    _comprasCache = { dias: dias, porProveedor: {}, lista: [] };
  }
  return _comprasCache;
}

function _cpMs(f) {
  if (!f) return 0;
  if (f.seconds) return f.seconds * 1000;
  const d = new Date(f);
  return isNaN(d) ? 0 : d.getTime();
}

function _cpFechaTxt(f) {
  const ms = _cpMs(f);
  if (!ms) return '-';
  return new Date(ms).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/* ============================ TARJETA EN LA FICHA ============================ */

/* El bloque de compras que se dibuja dentro de la ficha del proveedor. */
function renderComprasDeProveedor(listaId, dias) {
  const d = (_comprasCache && _comprasCache.porProveedor[listaId]) || { total: 0, count: 0, compras: [] };
  const filas = d.compras.slice(0, 8).map(c =>
    '<div style="display:flex;gap:0.6rem;align-items:baseline;padding:0.4rem 0;font-size:0.84rem;border-bottom:1px solid rgba(255,255,255,0.04)">' +
      '<span style="color:var(--text-dim);font-size:0.76rem;white-space:nowrap;width:4.2rem;flex:0 0 auto">' + _cpFechaTxt(c.fecha) + '</span>' +
      '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
        (c.comprobante ? esc(c.comprobante) : '<span style="color:var(--text-dim)">sin comprobante</span>') +
        (c.sumoStock === false ? ' <span style="font-size:0.68rem;color:#EDB833">sin stock</span>' : '') +
        (c.facturaUrl ? ' <i class="bi bi-paperclip" style="font-size:0.72rem;color:var(--text-dim)"></i>' : '') +
      '</span>' +
      '<span style="font-weight:600;white-space:nowrap">' + _cpPesos(c.total) + '</span>' +
      '<button class="btn btn-secondary" style="width:auto;flex:0 0 auto;padding:0.12rem 0.45rem;font-size:0.7rem" ' +
        'onclick="verCompra(\'' + c.docId + '\')">Ver</button>' +
    '</div>').join('');

  return '<div class="card" style="padding:1.15rem 1.25rem">' +
    '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:0.6rem;margin-bottom:0.6rem">' +
      '<h3 style="font-size:0.92rem;font-weight:700">Compras</h3>' +
      '<button class="btn btn-primary" style="width:auto;flex:0 0 auto;padding:0.3rem 0.75rem;font-size:0.78rem" ' +
        'onclick="openCompraModal(\'' + listaId + '\')"><i class="bi bi-plus-lg"></i> Cargar compra</button>' +
    '</div>' +
    '<div style="display:flex;justify-content:space-between;gap:1rem;padding:0.33rem 0;font-size:0.86rem">' +
      '<span style="color:var(--text-dim)">Gastado en ' + dias + ' días</span>' +
      '<span style="font-weight:700;white-space:nowrap">' + _cpPesos(d.total) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;gap:1rem;padding:0.33rem 0;font-size:0.86rem;margin-bottom:0.5rem">' +
      '<span style="color:var(--text-dim)">Compras cargadas</span>' +
      '<span style="font-weight:600">' + d.count + '</span></div>' +
    (filas || '<p style="font-size:0.83rem;color:var(--text-dim);line-height:1.5">' +
      'Todavía no hay compras cargadas de este proveedor. Cargando una queda el gasto, ' +
      'la factura y —si querés— el stock que entró.</p>') +
    (d.compras.length > 8 ? '<p style="font-size:0.76rem;color:var(--text-dim);margin-top:0.4rem">y ' +
      (d.compras.length - 8) + ' más</p>' : '') +
    '</div>';
}

/* ============================ EL FORMULARIO ============================ */

function openCompraModal(listaId) {
  _compraItems = [];
  _compraArchivo = null;
  _compraProveedor = listaId || null;
  const m = document.getElementById('compraModal');
  if (!m) return;
  const sel = document.getElementById('compraProveedor');
  if (sel) {
    sel.innerHTML = (listasData || []).map(l =>
      '<option value="' + l.id + '"' + (l.id === listaId ? ' selected' : '') + '>' + esc(l.nombre) + '</option>').join('');
  }
  const hoy = new Date();
  const f = document.getElementById('compraFecha');
  if (f) f.value = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0');
  ['compraComprobante', 'compraNotas', 'compraBuscar'].forEach(id => {
    const e = document.getElementById(id); if (e) e.value = '';
  });
  const chk = document.getElementById('compraSumarStock');
  if (chk) chk.checked = true;
  const fi = document.getElementById('compraFactura');
  if (fi) fi.value = '';
  renderCompraItems();
  compraBuscarProd('');
  m.classList.add('show');
}

function closeCompraModal() {
  const m = document.getElementById('compraModal');
  if (m) m.classList.remove('show');
  _compraItems = []; _compraArchivo = null;
}

/* Buscador: solo los productos del proveedor elegido. Comprarle a FRUTICOR un
   producto que en el catálogo figura de otro proveedor casi siempre es que se
   eligió mal el proveedor, no que el producto cambió de mano. */
function compraBuscarProd(q) {
  const cont = document.getElementById('compraLista');
  if (!cont) return;
  const prov = (document.getElementById('compraProveedor') || {}).value || _compraProveedor;
  const t = String(q || '').trim().toLowerCase();
  const yaEsta = new Set(_compraItems.map(i => i.id));
  let prods = (typeof allProducts !== 'undefined' ? allProducts : []).filter(p => p.lista === prov);
  if (t) prods = prods.filter(p => String(p.nombreMostrado || p.nombre || '').toLowerCase().includes(t) ||
                                   String(p.codigo || '').toLowerCase().includes(t));
  prods = prods.filter(p => !yaEsta.has(p.id)).slice(0, 40);
  if (!prods.length) {
    cont.innerHTML = '<p style="font-size:0.82rem;color:var(--text-dim);padding:0.5rem 0">' +
      (t ? 'Ningún producto de este proveedor coincide con la búsqueda.'
         : 'Este proveedor no tiene productos en el catálogo.') + '</p>';
    return;
  }
  cont.innerHTML = prods.map(p =>
    '<button type="button" class="cp-prod" onclick="compraAgregar(\'' + p.id + '\')">' +
      '<span class="cp-prod-n">' + esc(p.nombreMostrado || p.nombre) + '</span>' +
      '<span class="cp-prod-d">' + esc(p.codigo || '') +
        ' · costo ' + _cpPesos(p.costo) + (_cpEsPeso(p) ? ' el kilo' : '') + '</span>' +
    '</button>').join('');
}

function compraAgregar(id) {
  const p = (allProducts || []).find(x => x.id === id);
  if (!p) return;
  _compraItems.push({
    id: p.id, nombre: p.nombreMostrado || p.nombre,
    tipoVenta: _cpEsPeso(p) ? 'peso' : 'unidad',
    cantidad: 0,
    /* Arranca con el costo que ya tiene cargado: la mayoría de las veces no
       cambió, y así solo hay que tocar los que sí. */
    costoUnitario: Number(p.costo || 0),
    costoAnterior: Number(p.costo || 0),
  });
  renderCompraItems();
  compraBuscarProd((document.getElementById('compraBuscar') || {}).value || '');
}

function compraQuitar(i) {
  _compraItems.splice(i, 1);
  renderCompraItems();
  compraBuscarProd((document.getElementById('compraBuscar') || {}).value || '');
}

function compraCampo(i, campo, valor) {
  if (!_compraItems[i]) return;
  _compraItems[i][campo] = Math.max(0, Number(valor) || 0);
  const t = document.getElementById('compraTotal');
  if (t) t.textContent = _cpPesos(_cpTotal());
  const sub = document.getElementById('cpSub' + i);
  if (sub) sub.textContent = _cpPesos(_cpSubtotal(_compraItems[i]));
}

function renderCompraItems() {
  const cont = document.getElementById('compraItems');
  if (!cont) return;
  if (!_compraItems.length) {
    cont.innerHTML = '<p style="font-size:0.83rem;color:var(--text-dim);padding:0.6rem 0">' +
      'Buscá un producto de la lista de abajo para empezar a cargar la compra.</p>';
  } else {
    cont.innerHTML = _compraItems.map((it, i) =>
      '<div class="cp-row">' +
        '<span class="cp-row-n">' + esc(it.nombre) +
          (it.tipoVenta === 'peso' ? ' <span class="cp-tag">por peso</span>' : '') + '</span>' +
        '<label class="cp-f"><span>' + (it.tipoVenta === 'peso' ? 'Gramos' : 'Unidades') + '</span>' +
          '<input type="number" min="0" step="1" class="form-input" value="' + (it.cantidad || '') + '" ' +
          'oninput="compraCampo(' + i + ',\'cantidad\',this.value)"></label>' +
        '<label class="cp-f"><span>Costo' + (it.tipoVenta === 'peso' ? ' por kilo' : ' c/u') + '</span>' +
          '<input type="number" min="0" step="0.01" class="form-input" value="' + (it.costoUnitario || '') + '" ' +
          'oninput="compraCampo(' + i + ',\'costoUnitario\',this.value)"></label>' +
        '<span class="cp-sub" id="cpSub' + i + '">' + _cpPesos(_cpSubtotal(it)) + '</span>' +
        '<button type="button" class="cp-x" onclick="compraQuitar(' + i + ')" title="Sacar de la compra">&times;</button>' +
      '</div>').join('');
  }
  const t = document.getElementById('compraTotal');
  if (t) t.textContent = _cpPesos(_cpTotal());
  compraAvisoStock();
}

/* El cartel de que el stock NO se va a sumar. Va bien visible porque es
   exactamente lo que después nadie recuerda haber desmarcado. */
function compraAvisoStock() {
  const chk = document.getElementById('compraSumarStock');
  const av = document.getElementById('compraAvisoStock');
  if (!chk || !av) return;
  av.style.display = chk.checked ? 'none' : 'flex';
}

function compraArchivoElegido(input) {
  const f = input.files && input.files[0];
  const nom = document.getElementById('compraFacturaNombre');
  if (!f) { _compraArchivo = null; if (nom) nom.textContent = ''; return; }
  if (f.size > 10 * 1024 * 1024) {
    showAdminToast('La factura no puede pesar más de 10 MB', 'error');
    input.value = ''; _compraArchivo = null; if (nom) nom.textContent = '';
    return;
  }
  const ok = /^image\//.test(f.type) || f.type === 'application/pdf';
  if (!ok) {
    showAdminToast('La factura tiene que ser una imagen o un PDF', 'error');
    input.value = ''; _compraArchivo = null; if (nom) nom.textContent = '';
    return;
  }
  _compraArchivo = f;
  if (nom) nom.textContent = f.name + ' · ' + Math.round(f.size / 1024) + ' KB';
}

/* ============================ GUARDAR ============================ */

async function guardarCompra() {
  const prov = (document.getElementById('compraProveedor') || {}).value;
  if (!prov) return showAdminToast('Elegí el proveedor', 'error');
  const conCantidad = _compraItems.filter(i => Number(i.cantidad || 0) > 0);
  if (!conCantidad.length) return showAdminToast('Cargá al menos un producto con cantidad', 'error');
  const sinCosto = conCantidad.filter(i => Number(i.costoUnitario || 0) <= 0);
  if (sinCosto.length) {
    return showAdminToast('Falta el costo de: ' + sinCosto.map(i => i.nombre).join(', '), 'error');
  }
  const fechaTxt = (document.getElementById('compraFecha') || {}).value;
  if (!fechaTxt) return showAdminToast('Elegí la fecha de la compra', 'error');
  const fecha = new Date(fechaTxt + 'T12:00:00');
  if (isNaN(fecha)) return showAdminToast('La fecha no es válida', 'error');

  const sumaStock = !!(document.getElementById('compraSumarStock') || {}).checked;
  const lista = (listasData || []).find(l => l.id === prov);
  const total = conCantidad.reduce((s, i) => s + _cpSubtotal(i), 0);

  const resumen = conCantidad.map(i => '- ' + i.nombre + ': ' + _cpCant(i) + ' a ' + _cpPesos(i.costoUnitario) +
      (i.tipoVenta === 'peso' ? ' el kilo' : ' c/u')).join('\n');
  const aviso = sumaStock
    ? '\nEl stock de esos productos va a subir.'
    : '\nOJO: el stock NO se va a tocar, porque destildaste la casilla.';
  if (!await pedirConfirmacion(
      'Compra a ' + ((lista && lista.nombre) || 'proveedor') + ' por ' + _cpPesos(total) + '\n\n' + resumen + '\n' + aviso,
      { titulo: 'Guardar compra', aceptar: 'Guardar' })) return;

  const btn = document.getElementById('compraGuardarBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Guardando...'; }
  try {
    /* La factura primero: si falla la subida, no queda una compra apuntando a un
       archivo que no existe. */
    let facturaUrl = '', facturaNombre = '';
    if (_compraArchivo) {
      const ext = (_compraArchivo.name.split('.').pop() || 'dat').toLowerCase().replace(/[^a-z0-9]/g, '');
      const ref = storage.ref('compras/' + Date.now() + '_' + prov + '.' + ext);
      const snap = await ref.put(_compraArchivo, { contentType: _compraArchivo.type });
      facturaUrl = await snap.ref.getDownloadURL();
      facturaNombre = _compraArchivo.name;
    }

    /* Número de compra, con transacción: dos admins cargando a la vez sacaban el
       mismo número, igual que pasaba con las ventas. */
    const cnt = db.collection('config').doc('comprasCount');
    const numero = await db.runTransaction(async tx => {
      const sn = await tx.get(cnt);
      const n = (sn.exists ? (parseInt(sn.data().count) || 0) : 0) + 1;
      tx.set(cnt, { count: n });
      return n;
    });

    const items = conCantidad.map(i => ({
      id: i.id, nombre: i.nombre, tipoVenta: i.tipoVenta,
      cantidad: Number(i.cantidad), costoUnitario: Number(i.costoUnitario),
      subtotal: _cpSubtotal(i),
    }));

    const doc = {
      numero: numero, proveedorId: prov, proveedorNombre: (lista && lista.nombre) || '',
      fecha: fecha, comprobante: ((document.getElementById('compraComprobante') || {}).value || '').trim(),
      items: items, total: total,
      facturaUrl: facturaUrl, facturaNombre: facturaNombre,
      sumoStock: sumaStock,
      notas: ((document.getElementById('compraNotas') || {}).value || '').trim(),
      usuario: (auth && auth.currentUser && auth.currentUser.email) || '',
      creadoEn: firebase.firestore.FieldValue.serverTimestamp(),
    };
    const ref = await db.collection('compras').add(doc);

    if (sumaStock) {
      const lote = db.batch();
      items.forEach(i => {
        lote.update(db.collection('productos').doc(i.id),
          { stock: firebase.firestore.FieldValue.increment(Number(i.cantidad)) });
      });
      await lote.commit();
      /* En memoria también, para no releer los 636. */
      items.forEach(i => {
        const p = (allProducts || []).find(x => x.id === i.id);
        if (p) p.stock = Number(p.stock || 0) + Number(i.cantidad);
      });
    }

    if (typeof logAction === 'function') {
      logAction('crear', 'Compra #' + String(numero).padStart(4, '0') + ' - ' + _cpPesos(total),
        ((lista && lista.nombre) || '') + ' | ' + items.length + ' items' + (sumaStock ? ' | stock sumado' : ' | sin tocar stock'));
    }
    showAdminToast('Compra #' + String(numero).padStart(4, '0') + ' guardada', 'success');
    closeCompraModal();

    /* Recién ahora se ofrece mover los costos: la compra ya está guardada, así
       que decir que no acá no pierde nada. */
    await ofrecerActualizarCostos(conCantidad);

    if (typeof _refrescarAlertas === 'function') _refrescarAlertas(true);
    if (typeof loadProveedores === 'function') loadProveedores();
  } catch (e) {
    console.error('guardarCompra:', e);
    showAdminToast('No se pudo guardar: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg"></i> Guardar compra'; }
  }
}

/* Los costos NO se pisan solos: se muestran los que cambiaron y decide la
   persona. Un costo que se mueve solo mueve el margen de toda la pantalla de
   Ganancia sin que nadie lo haya decidido. */
async function ofrecerActualizarCostos(items) {
  const cambian = items.filter(i => {
    const p = (allProducts || []).find(x => x.id === i.id);
    return p && Math.round(Number(p.costo || 0)) !== Math.round(Number(i.costoUnitario || 0));
  });
  if (!cambian.length) return;
  const detalle = cambian.map(i => {
    const p = (allProducts || []).find(x => x.id === i.id);
    return '- ' + i.nombre + ': ' + _cpPesos(p.costo) + ' → ' + _cpPesos(i.costoUnitario) +
           (i.tipoVenta === 'peso' ? ' el kilo' : '');
  }).join('\n');
  if (!await pedirConfirmacion(
      'En esta compra pagaste distinto de lo que el producto tiene cargado como costo:\n\n' + detalle +
      '\n\nSi los actualizó, el precio de venta NO cambia: cambia el margen que muestra Ganancia.',
      { titulo: 'Actualizar costos', aceptar: 'Actualizar' })) return;
  try {
    const lote = db.batch();
    cambian.forEach(i => lote.update(db.collection('productos').doc(i.id), { costo: Number(i.costoUnitario) }));
    await lote.commit();
    cambian.forEach(i => {
      const p = (allProducts || []).find(x => x.id === i.id);
      if (p) p.costo = Number(i.costoUnitario);
    });
    if (typeof logAction === 'function') {
      logAction('editar', 'Costos actualizados desde una compra: ' + cambian.length,
        cambian.map(i => i.nombre).join(' | ').slice(0, 900));
    }
    showAdminToast(cambian.length + ' costo' + (cambian.length === 1 ? '' : 's') + ' actualizado' + (cambian.length === 1 ? '' : 's'), 'success');
    if (typeof _reRenderProductos === 'function') _reRenderProductos();
  } catch (e) {
    showAdminToast('No se pudieron actualizar los costos: ' + e.message, 'error');
  }
}

/* ============================ VER Y BORRAR ============================ */

function verCompra(docId) {
  const c = (_comprasCache && _comprasCache.lista.find(x => x.docId === docId));
  if (!c) return;
  const body = document.getElementById('compraVerBody');
  const tit = document.getElementById('compraVerTitulo');
  if (!body) return;
  if (tit) tit.innerHTML = '<i class="bi bi-bag-check"></i> Compra #' + String(c.numero || 0).padStart(4, '0');
  const fila = (e, v) => '<div style="display:flex;justify-content:space-between;gap:1rem;padding:0.3rem 0;font-size:0.86rem">' +
    '<span style="color:var(--text-dim)">' + e + '</span><span style="font-weight:600;white-space:nowrap">' + v + '</span></div>';
  body.innerHTML =
    fila('Proveedor', esc(c.proveedorNombre || '-')) +
    fila('Fecha', _cpFechaTxt(c.fecha)) +
    fila('Comprobante', c.comprobante ? esc(c.comprobante) : '<span style="color:var(--text-dim)">sin comprobante</span>') +
    fila('Total', _cpPesos(c.total)) +
    fila('Cargada por', esc(c.usuario || '-')) +
    (c.sumoStock === false
      ? '<p style="font-size:0.82rem;color:#EDB833;margin:0.5rem 0;line-height:1.5">' +
        'Esta compra <b>no sumó stock</b>: se guardó con la casilla destildada.</p>' : '') +
    '<div style="margin-top:0.7rem;padding-top:0.55rem;border-top:1px solid var(--border)">' +
      (c.items || []).map(i =>
        '<div style="display:flex;gap:0.6rem;align-items:baseline;padding:0.3rem 0;font-size:0.84rem">' +
          '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(i.nombre) + '</span>' +
          '<span style="color:var(--text-dim);font-size:0.78rem;white-space:nowrap">' + _cpCant(i) + '</span>' +
          '<span style="color:var(--text-dim);font-size:0.78rem;white-space:nowrap">' + _cpPesos(i.costoUnitario) +
            (i.tipoVenta === 'peso' ? '/kg' : '') + '</span>' +
          '<span style="font-weight:600;white-space:nowrap;min-width:5rem;text-align:right">' + _cpPesos(i.subtotal) + '</span>' +
        '</div>').join('') +
    '</div>' +
    (c.notas ? '<p style="font-size:0.82rem;color:var(--text-dim);margin-top:0.6rem;line-height:1.5"><b>Notas:</b> ' + esc(c.notas) + '</p>' : '') +
    (c.facturaUrl
      ? '<div style="margin-top:0.8rem"><a href="' + esc(c.facturaUrl) + '" target="_blank" rel="noopener" ' +
        'class="btn btn-secondary" style="width:auto;display:inline-flex"><i class="bi bi-paperclip"></i> Ver la factura</a></div>'
      : '<p style="font-size:0.8rem;color:var(--text-dim);margin-top:0.7rem">Sin factura adjunta.</p>');
  const del = document.getElementById('compraVerBorrar');
  if (del) del.setAttribute('onclick', "borrarCompra('" + docId + "')");
  document.getElementById('compraVerModal').classList.add('show');
}

function closeCompraVerModal() {
  const m = document.getElementById('compraVerModal');
  if (m) m.classList.remove('show');
}

/* El stock que queda al devolver una compra. El piso es 0: si de lo que entro
   ya se vendio parte, restar todo lo comprado daria negativo, y un stock
   negativo rompe los avisos de stock bajo y deja el inventario sin sentido.
   Aparte para poder probarla sola. */
function _cpStockTrasDevolver(antes, quita) {
  return Math.max(0, Number(antes || 0) - Number(quita || 0));
}

/* Lo que va a quedar clavado en 0 por haberse vendido. Se calcula con lo que
   ya está en memoria: es solo para avisar antes de confirmar, la cuenta de
   verdad la hace la transacción. */
function _cpAvisoVendidos(c, devuelve) {
  if (!devuelve) return '';
  const cortos = (c.items || []).filter(i => {
    const p = (allProducts || []).find(x => x.id === i.id);
    return p && Number(p.stock || 0) < Number(i.cantidad || 0);
  });
  if (!cortos.length) return '';
  return '\n\nOJO: de ' + cortos.map(i => i.nombre).join(', ') +
    ' ya se vendió parte de lo que entró con esta compra. Su stock va a quedar en 0, ' +
    'no en negativo, así que el inventario no va a coincidir con la resta exacta.';
}

async function borrarCompra(docId) {
  const c = (_comprasCache && _comprasCache.lista.find(x => x.docId === docId));
  if (!c) return;
  const devuelve = c.sumoStock !== false;
  if (!await pedirConfirmacion(
      'Compra #' + String(c.numero || 0).padStart(4, '0') + ' de ' + esc(c.proveedorNombre || '') +
      ' por ' + _cpPesos(c.total) + '.\n\n' +
      (devuelve
        ? 'Como esta compra sumó stock, se le va a RESTAR a esos productos lo que había sumado.'
        : 'Esta compra no había sumado stock, así que el inventario no se toca.') +
      _cpAvisoVendidos(c, devuelve) +
      '\n\nEsto no se puede deshacer.',
      { titulo: 'Eliminar compra', peligro: true })) return;
  try {
    let _tocados = [];
    if (devuelve && (c.items || []).length) {
      /* Antes esto era un batch con increment(-cantidad), a ciegas. Si algo de lo
         que entró con la compra YA SE VENDIÓ, restar todo lo comprado deja el
         stock en negativo: pasó con el Hornito de Yeso, entraron 2, se vendió 1,
         se revirtió la compra y quedó en -1.

         Un stock negativo no es solo un número feo: la tienda lo trata como
         "hay menos que cero", los avisos de stock bajo se vuelven locos y el
         inventario deja de servir para pedir mercadería.

         Ahora se lee el stock real y se baja hasta 0 como piso. Va en una
         transacción -todas las lecturas primero, después las escrituras- para
         que una venta que entre en el medio no se pierda. */
      const items = (c.items || []).filter(i => i.id);
      _tocados = await db.runTransaction(async tx => {
        const refs = items.map(i => db.collection('productos').doc(i.id));
        const snaps = [];
        for (const r of refs) snaps.push(await tx.get(r));
        const res = [];
        snaps.forEach((sn, k) => {
          if (!sn.exists) return;
          const antes = Number(sn.data().stock || 0);
          const quita = Number(items[k].cantidad || 0);
          const despues = _cpStockTrasDevolver(antes, quita);
          tx.update(refs[k], { stock: despues });
          res.push({ id: items[k].id, nombre: items[k].nombre, antes: antes,
                     quita: quita, despues: despues, faltaba: antes - quita < 0 });
        });
        return res;
      });
      _tocados.forEach(x => {
        const p = (allProducts || []).find(y => y.id === x.id);
        if (p) p.stock = x.despues;
      });
    }
    await db.collection('compras').doc(docId).delete();
    if (typeof logAction === 'function') {
      logAction('eliminar', 'Compra #' + String(c.numero || 0).padStart(4, '0') + ' eliminada',
        (c.proveedorNombre || '') + ' | ' + _cpPesos(c.total) + (devuelve ? ' | stock devuelto' : ' | sin stock que devolver'));
    }
    const _clavados = _tocados.filter(x => x.faltaba);
    if (_clavados.length) {
      showAdminToast('Compra eliminada. De ' + _clavados.length + ' producto' +
        (_clavados.length === 1 ? '' : 's') + ' ya se había vendido parte: su stock quedó en 0, no en negativo.', 'info');
    } else {
      showAdminToast('Compra eliminada', 'success');
    }
    closeCompraVerModal();
    if (typeof _refrescarAlertas === 'function') _refrescarAlertas(true);
    if (typeof loadProveedores === 'function') loadProveedores();
  } catch (e) {
    showAdminToast('No se pudo eliminar: ' + e.message, 'error');
  }
}

window.openCompraModal = openCompraModal;
window.closeCompraModal = closeCompraModal;
window.compraBuscarProd = compraBuscarProd;
window.compraAgregar = compraAgregar;
window.compraQuitar = compraQuitar;
window.compraCampo = compraCampo;
window.compraAvisoStock = compraAvisoStock;
window.compraArchivoElegido = compraArchivoElegido;
window.guardarCompra = guardarCompra;
window.verCompra = verCompra;
window.closeCompraVerModal = closeCompraVerModal;
window.borrarCompra = borrarCompra;
