/* =============================================================================
   DESPLEGABLES CON BUSCADOR  —  Brotes Dietética
   =============================================================================
   Categoría, subcategoría y lista en el formulario de producto. Con treinta
   proveedores y decenas de categorías, un <select> obliga a leer la lista entera
   hasta encontrar el que se busca.

   EL <select> NO SE REEMPLAZA. Queda en su lugar, invisible, y sigue siendo el que
   manda: saveProduct lee su .value, el onchange de categoría rellena las
   subcategorías, y openModal le pone el valor al editar. Encima se dibuja un botón
   con un panel de búsqueda, y nada de lo que ya funcionaba se entera del cambio.

   Para que el botón diga siempre lo mismo que el select:
     - elegir en el panel escribe select.value y dispara 'change', como un clic;
     - un .value puesto desde el código -openModal al editar- se intercepta en ESE
       select, no en todos;
     - si se reescriben las opciones -updateCatSelects-, lo avisa un MutationObserver;
     - form.reset() no avisa nada, así que se escucha el reset del formulario.
   ============================================================================= */

/* Sin mayúsculas ni tildes: "organico" encuentra "Orgánico". */
function selbNormalizar(t) {
  return String(t == null ? '' : t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/* Las opciones que coinciden con lo escrito. La vacía ("Sin lista", "Ninguna") se
   ofrece mientras no se busque nada: buscando, estorba. */
function selbFiltrar(opciones, texto) {
  const q = selbNormalizar(texto);
  return (opciones || []).filter(o => (q ? o.value !== '' && selbNormalizar(o.texto).includes(q) : true));
}

/* ======================== LA PANTALLA ======================== */

function selbMejorar(sel, opciones) {
  if (!sel || sel.dataset.selb) return;
  sel.dataset.selb = '1';
  const o = opciones || {};

  const caja = document.createElement('div');
  caja.className = 'selb';
  sel.parentNode.insertBefore(caja, sel);
  caja.appendChild(sel);
  sel.classList.add('selb-nativo');
  sel.tabIndex = -1;
  sel.setAttribute('aria-hidden', 'true');

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'form-input selb-boton';
  boton.setAttribute('aria-haspopup', 'listbox');
  boton.setAttribute('aria-expanded', 'false');
  boton.innerHTML = '<span></span><i class="bi bi-chevron-down"></i>';
  caja.appendChild(boton);

  const panel = document.createElement('div');
  panel.className = 'selb-panel';
  panel.hidden = true;
  panel.innerHTML = '<input type="text" class="form-input selb-buscar" placeholder="Escribí para buscar..." autocomplete="off">' +
    '<div class="selb-lista" role="listbox"></div>';
  caja.appendChild(panel);
  const buscar = panel.querySelector('.selb-buscar');
  const lista = panel.querySelector('.selb-lista');
  let foco = 0, visibles = [];

  const opcionesDe = () => [...sel.options].map(op => ({ value: op.value, texto: op.textContent }));

  function pintar() {
    const op = sel.options[sel.selectedIndex];
    const span = boton.querySelector('span');
    span.textContent = op ? op.textContent : '';
    span.classList.toggle('selb-vacio', !sel.value);
    if (typeof o.alPintar === 'function') o.alPintar();
  }
  function pintarLista() {
    visibles = selbFiltrar(opcionesDe(), buscar.value);
    foco = Math.max(0, Math.min(foco, visibles.length - 1));
    lista.innerHTML = visibles.length
      ? visibles.map((v, i) => '<button type="button" role="option" data-i="' + i + '" aria-selected="' + (v.value === sel.value) +
          '" class="selb-op' + (v.value === sel.value ? ' activo' : '') + (i === foco ? ' foco' : '') + '"></button>').join('')
      : '<div class="selb-nada">Nada coincide con lo que escribiste.</div>';
    /* textContent y no innerHTML: los nombres los carga el comercio. */
    lista.querySelectorAll('.selb-op').forEach((b, i) => { b.textContent = visibles[i].texto; });
    const f = lista.querySelector('.selb-op.foco');
    if (f) f.scrollIntoView({ block: 'nearest' });
  }
  function abrir() {
    if (!panel.hidden) return;
    buscar.value = '';
    foco = Math.max(0, opcionesDe().findIndex(v => v.value === sel.value));
    panel.hidden = false;
    boton.setAttribute('aria-expanded', 'true');
    pintarLista();
    buscar.focus();
  }
  function cerrar(devolverFoco) {
    if (panel.hidden) return;
    panel.hidden = true;
    boton.setAttribute('aria-expanded', 'false');
    if (devolverFoco) boton.focus();
  }
  function elegir(v) {
    if (!v) return;
    const cambio = sel.value !== v.value;
    sel.value = v.value;
    cerrar(true);
    if (cambio) sel.dispatchEvent(new Event('change', { bubbles: true }));
  }

  boton.addEventListener('click', () => (panel.hidden ? abrir() : cerrar(false)));
  buscar.addEventListener('input', () => { foco = 0; pintarLista(); });
  buscar.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); foco++; pintarLista(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); foco--; pintarLista(); }
    else if (e.key === 'Enter') { e.preventDefault(); elegir(visibles[foco]); }
    /* El formulario de atrás no se cierra porque admin-atajos.js, que se entera antes
       del Escape, se fija si hay un panel abierto. stopPropagation solo no alcanzaba. */
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(true); }
    else if (e.key === 'Tab') cerrar(false);
  });
  /* mousedown y no click: con click, el foco se iba del buscador antes de que el
     clic llegara a la opción. */
  lista.addEventListener('mousedown', e => {
    const b = e.target.closest('.selb-op');
    if (!b) return;
    e.preventDefault();
    elegir(visibles[Number(b.dataset.i)]);
  });
  document.addEventListener('mousedown', e => { if (!caja.contains(e.target)) cerrar(false); });
  /* Escape con el panel abierto pero el foco afuera del buscador: un clic en el borde
     del panel lo saca de ahí, y así no lo cerraba nadie. */
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) cerrar(true); });

  const propiedad = nombre => {
    const d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, nombre);
    if (!d || !d.set) return;
    Object.defineProperty(sel, nombre, {
      configurable: true,
      get() { return d.get.call(this); },
      set(v) { d.set.call(this, v); pintar(); },
    });
  };
  propiedad('value');
  propiedad('selectedIndex');
  sel.addEventListener('change', pintar);
  new MutationObserver(pintar).observe(sel, { childList: true, subtree: true });
  /* openModal hace form.reset() al abrir. Ahí también se cierra el panel: si el
     modal se cerró sin un clic afuera -al terminar de guardar, por ejemplo-, el
     panel volvía a aparecer abierto y con la búsqueda de la vez anterior. */
  if (sel.form) sel.form.addEventListener('reset', () => { cerrar(false); setTimeout(pintar, 0); });
  /* saveProduct hace pLista.focus() cuando falta la lista. El select está
     invisible: el foco va al botón, y se abre para elegir. */
  sel.focus = () => { boton.focus(); abrir(); };
  pintar();
}

['pCategoria', 'pSubcategoria', 'pLista'].forEach(id => {
  const sel = document.getElementById(id);
  if (!sel) return;
  selbMejorar(sel, id === 'pCategoria'
    ? { alPintar: () => { if (typeof _pintarAvisoCategoria === 'function') _pintarAvisoCategoria(); } }
    : null);
});
