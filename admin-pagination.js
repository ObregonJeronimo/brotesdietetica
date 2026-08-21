// Admin pagination - loaded after main admin script
const ADMIN_PER_PAGE = 20;
let adminTablePage = 1;
let adminStockPage = 1;

// Override renderTable to add pagination
const _origRenderTable = renderTable;
renderTable = function(prods) {
    const totalPages = Math.ceil(prods.length / ADMIN_PER_PAGE);
    if (adminTablePage > totalPages) adminTablePage = totalPages || 1;
    const start = (adminTablePage - 1) * ADMIN_PER_PAGE;
    const pageItems = prods.slice(start, start + ADMIN_PER_PAGE);
    _origRenderTable(pageItems);
    renderAdminPagination('sec-products', adminTablePage, totalPages, prods.length, 'table');
};

/* Al buscar o filtrar se vuelve a la pagina 1. Antes se quedaba en la pagina que ya
   estaba abierta y solo se clampeaba hacia abajo: el admin mirando la pagina 5 del
   catalogo escribia 'aceite', caian 3 paginas de resultados y veia la 3 (los ultimos
   siete). Concluia que ese aceite no estaba cargado y lo creaba de nuevo, duplicado en
   el catalogo publico con otro precio y otro stock.
   El reset NO puede ir adentro de filterTable a secas, porque adminGoPage() la usa para
   redibujar al cambiar de pagina y volveria siempre a la 1. Por eso se compara la firma
   de los cuatro filtros y solo se resetea si alguno cambio; asi tampoco se pierde la
   pagina cuando filterTable() se llama despues de guardar un producto. */
const _origFilterTable = filterTable;
let _firmaFiltrosTabla = null;
filterTable = function () {
    const firma = ['searchInput', 'filterCat', 'filterLista', 'filterVisibilidad']
        .map(id => (document.getElementById(id) || {}).value || '').join('~|~');
    if (firma !== _firmaFiltrosTabla) { _firmaFiltrosTabla = firma; adminTablePage = 1; }
    _origFilterTable();
};

/* Stock: el buscador y el filtro de categoria son los unicos que llaman a
   filterStockList(), asi que aca el reset puede ser directo. */
const _origFilterStockList = filterStockList;
filterStockList = function () {
    adminStockPage = 1;
    _origFilterStockList();
};

// Override renderStockList to add pagination
const _origRenderStock = renderStockList;
let stockSortDir = null;
renderStockList = function() {
    const c = document.getElementById('stockList'); if (!c) return;
    const q = (document.getElementById('stockSearch')?.value || '').toLowerCase();
    const cat = document.getElementById('stockFilterCat')?.value || '';
    let f = allProducts;
    if (q) f = f.filter(p => (p.nombre || '').toLowerCase().includes(q));
    if (cat) f = f.filter(p => p.categoria === cat);
    if (stockSortDir) {
        f = [...f].sort((a, b) => stockSortDir === 'desc' ? (b.stock || 0) - (a.stock || 0) : (a.stock || 0) - (b.stock || 0));
    }
    if (!f.length) { c.innerHTML = '<div class="empty-state" style="padding:2rem"><p>No hay productos</p></div>'; removePagination('sec-stock'); return; }
    const totalPages = Math.ceil(f.length / ADMIN_PER_PAGE);
    if (adminStockPage > totalPages) adminStockPage = totalPages || 1;
    const start = (adminStockPage - 1) * ADMIN_PER_PAGE;
    const pageItems = f.slice(start, start + ADMIN_PER_PAGE);
    c.innerHTML = pageItems.map(p => {
        const img = p.imagen || 'img/default-product.svg';
        return '<div class="stock-row"><img src="' + img + '" onerror="this.src=\'img/default-product.svg\'"><div class="stock-row-info"><strong>' + p.nombre + '</strong><small>' + (p.categoria || '') + (p.subcategoria ? ' / ' + p.subcategoria : '') + '</small></div><input type="number" class="stock-input" id="stock-' + p.id + '" value="' + (p.stock || 0) + '" min="0"><button class="stock-save" onclick="saveStock(\'' + p.id + '\')"><i class="bi bi-check-lg"></i></button></div>';
    }).join('');
    renderAdminPagination('sec-stock', adminStockPage, totalPages, f.length, 'stock');
};

function toggleStockSort() {
    if (!stockSortDir) stockSortDir = 'desc';
    else if (stockSortDir === 'desc') stockSortDir = 'asc';
    else stockSortDir = null;
    const btn = document.getElementById('stockSortBtn');
    if (btn) {
        if (stockSortDir === 'desc') btn.innerHTML = '<i class="bi bi-sort-numeric-down"></i> Mayor stock';
        else if (stockSortDir === 'asc') btn.innerHTML = '<i class="bi bi-sort-numeric-up"></i> Menor stock';
        else btn.innerHTML = '<i class="bi bi-sort-numeric-down"></i> Ordenar stock';
    }
    adminStockPage = 1;
    renderStockList();
}

function renderAdminPagination(containerId, currentPage, totalPages, totalItems, type) {
    const container = document.getElementById(containerId);
    if (!container) return;
    let pag = container.querySelector('.admin-pagination');
    if (!pag) { pag = document.createElement('div'); pag.className = 'admin-pagination'; container.appendChild(pag); }
    if (totalPages <= 1) { pag.innerHTML = ''; return; }
    let html = '<div style="display:flex;justify-content:center;align-items:center;gap:0.4rem;margin-top:1.25rem;flex-wrap:wrap">';
    html += '<button class="btn btn-sm btn-secondary" onclick="adminGoPage(\'' + type + '\',' + (currentPage - 1) + ')"' + (currentPage === 1 ? ' disabled' : '') + ' style="min-width:36px;width:auto"><i class="bi bi-chevron-left"></i></button>';
    for (let i = 1; i <= totalPages; i++) {
        if (totalPages <= 7 || i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            html += '<button class="btn btn-sm ' + (i === currentPage ? 'btn-primary' : 'btn-secondary') + '" onclick="adminGoPage(\'' + type + '\',' + i + ')" style="min-width:36px;width:auto">' + i + '</button>';
        } else if (i === currentPage - 2 || i === currentPage + 2) {
            html += '<span style="color:var(--text-dim);padding:0 0.2rem">...</span>';
        }
    }
    html += '<button class="btn btn-sm btn-secondary" onclick="adminGoPage(\'' + type + '\',' + (currentPage + 1) + ')"' + (currentPage === totalPages ? ' disabled' : '') + ' style="min-width:36px;width:auto"><i class="bi bi-chevron-right"></i></button>';
    html += '</div>';
    html += '<p style="text-align:center;font-size:0.78rem;color:var(--text-dim);margin-top:0.5rem">' + ((currentPage - 1) * ADMIN_PER_PAGE + 1) + ' - ' + Math.min(currentPage * ADMIN_PER_PAGE, totalItems) + ' de ' + totalItems + '</p>';
    pag.innerHTML = html;
}

function removePagination(containerId) {
    const container = document.getElementById(containerId);
    if (container) { const pag = container.querySelector('.admin-pagination'); if (pag) pag.innerHTML = ''; }
}

function adminGoPage(type, page) {
    if (type === 'table') { adminTablePage = page; filterTable(); }
    else if (type === 'stock') { adminStockPage = page; renderStockList(); }
    /* El historial de cajas vive en admin-caja.js y se pagina en memoria: la
       consulta a Firestore la hace loadHistorialCajas() al cambiar de mes, no
       al cambiar de pagina. */
    else if (type === 'cajas' && typeof cajaHistGoPage === 'function') cajaHistGoPage(page);
}
