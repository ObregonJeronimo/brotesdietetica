/**
 * BROTES DIETÉTICA - SCRIPT PRINCIPAL
 * Firebase Firestore + Filtros jerárquicos + Búsqueda + Orden + Paginación
 */
/* El numero al que se manda el pedido. Arranca con el de config-negocio.js y lo
   REEMPLAZA el del Editor Web cuando llega (ver _aplicarSiteContent).
   Antes era una constante leida una sola vez al cargar, mientras que los botones de
   WhatsApp de la pagina SI se reescribian con el valor del Editor Web. O sea que el
   comercio podia cambiar su numero desde el panel, ver todos los botones apuntando al
   nuevo, y los PEDIDOS seguian yendose al viejo. Dejaba de recibir pedidos sin que
   nada avisara, que es la peor forma de fallar que tiene una tienda. */
let WHATSAPP_NUMBER = (typeof NEGOCIO !== 'undefined' && NEGOCIO.whatsapp) ? NEGOCIO.whatsapp : '5493516872770';
const PRODUCTS_PER_PAGE = 10;
function optImg(url,w){return url||'';}
let productos = [];
let carrito = [];
let categoriaActual = 'Todos';
let subcategoriaActual = null;
let ordenPrecio = null;
/* Arranca en 'asc' para que el catalogo se vea ordenado alfabeticamente,
   pero DEBE poder volver a null: el comparador de aplicarFiltros() evalua
   ordenAlfa antes que ordenPrecio, asi que si ordenAlfa nunca es falsy el
   boton de precio no hace nada. Los dos ordenes son mutuamente excluyentes
   (ver toggleSortPrice / toggleSortAlfa). */
/* ===== CONFIGURACION DE PEDIDOS =====
   Se edita desde /admin -> Editor Web -> Pedidos y envio (Firestore config/pedidos).
   Estos son solo los valores por defecto para el caso en que el documento no
   exista todavia; apenas carga Firestore, mandan los de la base.
   minimoPedido 0 = sin minimo. envioGratisActivo false = nunca hay envio gratis. */
const PEDIDOS = {
    /* false = el comercio no hace envios: en toda la web solo existe el retiro */
    haceEnvios: true,
    /* Descontar stock automaticamente al confirmar un pedido web. Si el comercio
       lleva el stock a mano y los numeros no son confiables, se puede apagar para
       que la tienda no rechace pedidos por un stock que no refleja la realidad. */
    descontarStock: true,
    minimoPedido: 30000,
    envioPrecio: 2000,
    envioGratisActivo: true,
    envioGratisDesde: 100000
};
function _num(v, porDefecto){ const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : porDefecto; }
/* Costo de envio segun el subtotal ya con descuentos aplicados */
function costoEnvio(subtotalConDesc, tipoEntrega){
    if (!PEDIDOS.haceEnvios) return 0;
    if (tipoEntrega === 'retiro') return 0;
    if (PEDIDOS.envioGratisActivo && subtotalConDesc >= PEDIDOS.envioGratisDesde) return 0;
    return PEDIDOS.envioPrecio;
}
async function loadPedidosConfig(){
    try{
        const snap = await db.collection('config').doc('pedidos').get();
        if(!snap.exists) return;
        const d = snap.data();
        PEDIDOS.minimoPedido     = _num(d.minimoPedido, PEDIDOS.minimoPedido);
        PEDIDOS.envioPrecio      = _num(d.envioPrecio, PEDIDOS.envioPrecio);
        PEDIDOS.envioGratisDesde = _num(d.envioGratisDesde, PEDIDOS.envioGratisDesde);
        if(typeof d.envioGratisActivo === 'boolean') PEDIDOS.envioGratisActivo = d.envioGratisActivo;
        if(typeof d.haceEnvios === 'boolean') PEDIDOS.haceEnvios = d.haceEnvios;
        if(typeof d.descontarStock === 'boolean') PEDIDOS.descontarStock = d.descontarStock;
    }catch(e){ console.log('Config de pedidos no cargada:', e); }
    aplicarModoEntrega();
    updateCartUI();
}

let ordenAlfa = 'asc';
let busquedaTexto = '';
let paginaActual = 1;

document.addEventListener('DOMContentLoaded', () => {
    initNavbar(); initMotion(); initParticles(); initContactForm(); initCart(); loadPedidosConfig();
    loadProductsFromFirebase(); initScrollAnimations();
});

function initNavbar() {
    const navbar = document.getElementById('mainNavbar');
    window.addEventListener('scroll', () => { navbar.classList.toggle('scrolled', window.scrollY > 50); updateActiveNavLink(); });
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => { const c = document.querySelector('.navbar-collapse'); if (c.classList.contains('show')) bootstrap.Collapse.getInstance(c)?.hide(); });
    });
}
function updateActiveNavLink() {
    let cur = '';
    document.querySelectorAll('section[id]').forEach(s => { if (window.scrollY >= s.offsetTop - 100 && window.scrollY < s.offsetTop - 100 + s.offsetHeight) cur = s.id; });
    document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + cur));
}

/* Un solo lugar decide si el equipo aguanta movimiento ambiental (bucles
   infinitos). Las animaciones de entrada corren siempre: son una sola pasada. */
function equipoCapaz() {
    if (window.innerWidth < 992) return false;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if ((navigator.hardwareConcurrency || 8) <= 4) return false;
    if ((navigator.deviceMemory || 8) <= 4) return false;
    return true;
}
/* .motion-rica habilita en CSS lo que late, se mece y va a la deriva */
function initMotion() { if (equipoCapaz()) document.documentElement.classList.add('motion-rica'); }

function initParticles() {
    const c = document.getElementById('particles'); if (!c) return;
    if (!equipoCapaz()) return;
    const count = window.innerWidth < 1400 ? 5 : 8;
    for (let i = 0; i < count; i++) { const p = document.createElement('div'); p.className='particle'; p.style.left=Math.random()*100+'%'; p.style.top=Math.random()*100+'%'; p.style.animationDelay=Math.random()*15+'s'; p.style.animationDuration=(15+Math.random()*10)+'s'; p.style.width=(5+Math.random()*15)+'px'; p.style.height=p.style.width; c.appendChild(p); }
}

function initContactForm() {
    const form = document.getElementById('contactForm'); if (!form) return;
    form.addEventListener('submit', (e) => { e.preventDefault(); const n=document.getElementById('nombre').value.trim(),em=document.getElementById('email').value.trim(),m=document.getElementById('mensaje').value.trim(); const cap=s=>s?s.charAt(0).toUpperCase()+s.slice(1):s; const msg='Hola! Mi nombre es *'+cap(n)+'*, tengo una consulta:\n\n'+cap(m)+'\n\nMi mail es: '+em; window.open('https://wa.me/'+WHATSAPP_NUMBER+'?text='+encodeURIComponent(msg),'_blank'); form.reset(); if(document.getElementById('chatFloatBox'))document.getElementById('chatFloatBox').classList.remove('show'); if(document.getElementById('chatFloatBtn'))document.getElementById('chatFloatBtn').classList.remove('hide'); });
}

async function loadProductsFromFirebase(retries) {
    if (retries === undefined) retries = 2;
    const loading = document.getElementById('productsLoading'); if (loading) loading.classList.add('show');
    try {
        /* Se sirve del cache si la ultima bajada fue hace poco.
           Cada visita hacia un get() de la coleccion entera: con 3.000 productos son
           3.000 lecturas por persona, y navegar entre categorias las repetia. Con esto,
           moverse por la tienda durante los proximos minutos sale del cache y no cuesta
           lecturas.
           La ventana es corta a proposito: si el comercio cambia un precio, lo peor que
           puede pasar es que alguien que ya estaba navegando vea el anterior por unos
           minutos. Mas largo empezaria a mostrar precios que no son. */
        const CACHE_MS = 3 * 60 * 1000;
        let snap = null;
        const desde = Number(localStorage.getItem('brotes_cat_ts') || 0);
        if (Date.now() - desde < CACHE_MS) {
            try {
                const c = await db.collection('productos').get({ source: 'cache' });
                if (!c.empty) snap = c;
            } catch (e) { /* sin cache disponible: se pide al servidor */ }
        }
        if (!snap) {
            snap = await db.collection('productos').get();
            try { localStorage.setItem('brotes_cat_ts', String(Date.now())); } catch (e) {}
        }
        productos = snap.docs.map(d => { const r=d.data(); return { id:d.id, nombre:r.nombre||'', nombreMostrado:r.nombreMostrado||null, gramaje:r.gramaje||null, precio:r.precio||0, descuento:Math.min(100,Math.max(0,r.descuento||0)), stock:r.stock||0, categoria:r.categoria||'', subcategoria:r.subcategoria||null, imagen:r.imagen||null, descripcion:r.descripcion||r.nombre||'', popular:r.popular||false, oculto:r.oculto===true, valoresNutricionales:r.valoresNutricionales||'', imagenesExtra:r.imagenesExtra||[],
            /* gramajePadreId lo escribe el panel al asociar un gramaje, pero aca no se copiaba:
               p.gramajePadreId quedaba undefined siempre, asi que el filtro de aplicarFiltros no
               excluia al hijo (dos tarjetas de almendras en la grilla, una de 250g y otra de 1kg)
               y el padre nunca mostraba los botones de gramaje. Todo el agrupado estaba muerto. */
            gramajePadreId:r.gramajePadreId||null, tipoVenta:r.tipoVenta||'unidad' }; })
            .filter(p => !p.oculto);
        renderCategoryFilters(getCategoriasConSub(productos)); aplicarFiltros();
        _searchCache.clear();
        let carritoActualizado=false;
        /* Si el producto ya no esta en el catalogo (lo ocultaron para re-etiquetar, o lo
           borraron) hay que SACARLO del carrito. Ojo: `productos` ya viene filtrado por
           !oculto en la linea de arriba, asi que un producto ocultado no aparece aca. El
           carrito vive en localStorage y sobrevive dias: sin esta parte el item quedaba ahi
           con el precio congelado del dia que se agrego, viajaba al pedido y el comercio
           terminaba vendiendo al precio viejo algo que ya habia sacado de la tienda. El
           guard de productos.length es para no vaciarle el carrito a nadie si la carga del
           catalogo vino vacia por un error. */
        const _fuera=[];
        if(productos.length){
            carrito=carrito.filter(item=>{const sigue=productos.some(p=>p.id===item.id);if(!sigue){_fuera.push(item.nombre||'un producto');carritoActualizado=true;}return sigue;});
        }
        carrito=carrito.map(item=>{const prod=productos.find(p=>p.id===item.id);if(prod){const pf=precioFinal(prod);if(pf!==item.precio){carritoActualizado=true;return{...item,precio:pf,nombre:prod.nombreMostrado||prod.nombre};}}return item;});
        if(_fuera.length)showToast(_fuera.join(', ')+(_fuera.length>1?' ya no están disponibles':' ya no está disponible')+' y se quitaron del carrito','error');
        if(carritoActualizado){saveCart();updateCartUI();}
        /* Scroll automático a productos SOLO si la URL lo pide (#productos).
           Antes las dos ramas del ternario eran 'productos', así que en toda
           visita la página se bajaba sola y nadie veía el hero. */
        if(!window._autoScrollDone){
            window._autoScrollDone=true;
            const target=window.location.hash==='#productos'?'productos':null;
            if(target){
                setTimeout(()=>{const s=document.getElementById(target);if(s)s.scrollIntoView({behavior:'smooth',block:'start'});},600);
            }
        }
    } catch(e) { console.error(e); if(retries>0){setTimeout(()=>loadProductsFromFirebase(retries-1),1500);return;} showToast('Error al cargar productos.','error'); }
    finally { if (loading) loading.classList.remove('show'); }
}


function getCategoriasConSub(prods) {
    const m = {}; prods.forEach(p => { if(!p.categoria)return; if(!m[p.categoria])m[p.categoria]=new Set(); if(p.subcategoria)m[p.categoria].add(p.subcategoria); }); return m;
}

function _norm(s){return(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
/* Levenshtein iterativo - sin recursión, mucho más rápido */
function _levenshtein(a,b){const la=a.length,lb=b.length;if(!la)return lb;if(!lb)return la;if(Math.abs(la-lb)>2)return 3;/* atajo: si difieren mucho en largo, no vale la pena */const row=Array.from({length:lb+1},(_,i)=>i);for(let i=1;i<=la;i++){let prev=i;for(let j=1;j<=lb;j++){const val=a[i-1]===b[j-1]?row[j-1]:1+Math.min(prev,row[j],row[j-1]);row[j-1]=prev;prev=val;}row[lb]=prev;}return row[lb];}
const _STOPWORDS=new Set(['de','la','el','los','las','un','una','unos','unas','con','sin','y','o','en','a','al','del','x']);
/* Cache de textos normalizados por producto */
const _searchCache=new Map();
function _getTexto(p){if(_searchCache.has(p.id))return _searchCache.get(p.id);const t=_norm((p.nombreMostrado||p.nombre)+' '+p.categoria+' '+(p.subcategoria||'')+' '+(p.descripcion||''));_searchCache.set(p.id,t);return t;}
/* Quita plurales y sufijos comunes para comparar raíces (nueces→nuez, aceites→aceit) */
function _raiz(w){w=w.replace(/ces$/,'z');w=w.replace(/es$/,'');w=w.replace(/s$/,'');return w;}
function _matchPalabra(pal,texto){const words=texto.split(/\s+/);/* palabras cortas (<=3 letras): solo match al inicio de alguna palabra, evita falsos positivos como 'te' en 'inTEgral' */if(pal.length<=3){return words.some(w=>w.startsWith(pal));}if(texto.includes(pal))return true;const palR=_raiz(pal);for(const w of words){const wR=_raiz(w);if(wR===palR)return true;if(wR.length>=3&&palR.length>=3&&(wR.startsWith(palR)||palR.startsWith(wR)))return true;/* fuzzy solo para typos en palabras largas */if(pal.length>=5&&Math.abs(w.length-pal.length)<=2&&_levenshtein(pal,w)<=1)return true;}return false;}
function _searchScore(q,p){const texto=_getTexto(p);const palabras=_norm(q).split(/\s+/).filter(w=>w.length>1&&!_STOPWORDS.has(w));if(!palabras.length)return 1;return palabras.every(pal=>_matchPalabra(pal,texto))?1:0;}
/* Debounce: espera 200ms desde el último keystroke antes de filtrar */
let _searchTimer=null;
function onSearchInput(v){busquedaTexto=v;clearTimeout(_searchTimer);_searchTimer=setTimeout(()=>{paginaActual=1;aplicarFiltros();},200);}
function aplicarFiltros() {
    let r = [...productos];
    /* Excluir productos hijos de gramaje: solo se muestran como botones dentro del padre de gramaje */
    r = r.filter(p => !p.gramajePadreId);
    if (categoriaActual === 'Populares') r = r.filter(p => p.popular === true);
    else if (categoriaActual === 'Ofertas') r = r.filter(p => (p.descuento||0) > 0);
    else if (categoriaActual !== 'Todos') r = r.filter(p => p.categoria === categoriaActual);
    if (subcategoriaActual) r = r.filter(p => p.subcategoria === subcategoriaActual);
    if (busquedaTexto) { r=r.filter(p=>_searchScore(busquedaTexto,p)>0); }
    r.sort((a,b)=>{
        if(ordenAlfa){const cmp=(a.nombre||'').localeCompare(b.nombre||'','es');if(cmp!==0)return ordenAlfa==='asc'?cmp:-cmp;}
        if(ordenPrecio){const cmp=precioFinal(a)-precioFinal(b);if(cmp!==0)return ordenPrecio==='asc'?cmp:-cmp;}
        return 0;
    });
    renderProductsPaginated(r); updateSortButtonUI(); revelar(document);
}

function filterByCategory(cat) { categoriaActual=cat; subcategoriaActual=null; paginaActual=1; aplicarFiltros(); }
function filterBySubCategory(cat,sub) { categoriaActual=cat; subcategoriaActual=sub; paginaActual=1; aplicarFiltros(); }
/* Ordenar por precio APAGA el orden alfabetico y viceversa: si quedan los dos
   activos gana siempre el alfabetico y el boton de precio parece roto.
   updateSortButtonUI() ya atenua el boton que quedo inactivo. */
function toggleSortPrice() { if(!ordenPrecio)ordenPrecio='asc';else if(ordenPrecio==='asc')ordenPrecio='desc';else ordenPrecio='asc'; ordenAlfa=null; paginaActual=1; aplicarFiltros(); }
function toggleSortAlfa() { if(!ordenAlfa)ordenAlfa='asc';else if(ordenAlfa==='asc')ordenAlfa='desc';else ordenAlfa='asc'; ordenPrecio=null; paginaActual=1; aplicarFiltros(); }
function updateSortButtonUI() { const b=document.getElementById('sortBtn'),a=document.getElementById('sortAlfaBtn'); if(b){b.innerHTML=ordenPrecio==='desc'?'<i class="bi bi-sort-numeric-down-alt"></i> Mayor precio':'<i class="bi bi-sort-numeric-up"></i> Menor precio';b.style.borderColor=ordenPrecio?'var(--color-primary)':'';b.style.opacity=ordenPrecio?'1':'0.5';} if(a){a.innerHTML=ordenAlfa==='desc'?'<i class="bi bi-sort-alpha-up-alt"></i> Z-A':'<i class="bi bi-sort-alpha-down"></i> A-Z';a.style.borderColor=ordenAlfa?'var(--color-primary)':'';a.style.opacity=ordenAlfa?'1':'0.5';} }

function renderCategoryFilters(mapa) {
    const container = document.getElementById('categoryFilters'); if (!container) return;
    container.innerHTML = '';
    const popBtn = document.createElement('button');
    popBtn.className = 'filter-btn'+(categoriaActual==='Populares'?' active':''); popBtn.innerHTML = '<i class="bi bi-star-fill" style="margin-right:4px"></i>Populares';
    popBtn.addEventListener('click', () => { setActiveFilter(popBtn); hideAllSubFilters(); filterByCategory('Populares'); });
    container.appendChild(popBtn);
    const todosBtn = document.createElement('button');
    todosBtn.className = 'filter-btn'+(categoriaActual==='Todos'?' active':''); todosBtn.textContent = 'Todos';
    todosBtn.addEventListener('click', () => { setActiveFilter(todosBtn); hideAllSubFilters(); filterByCategory('Todos'); });
    container.appendChild(todosBtn);
    if(productos.some(p=>(p.descuento||0)>0)){
        const ofBtn=document.createElement('button');
        ofBtn.className='filter-btn'+(categoriaActual==='Ofertas'?' active':'');
        ofBtn.innerHTML='<i class="bi bi-tag-fill" style="margin-right:4px;color:#7b6b4e"></i>Ofertas';
        ofBtn.addEventListener('click',()=>{setActiveFilter(ofBtn);hideAllSubFilters();subcategoriaActual=null;paginaActual=1;filterByCategory('Ofertas');});
        container.appendChild(ofBtn);
    }
    Object.keys(mapa).sort((a,b)=>{const yA=a.toUpperCase().startsWith('YERBA')?1:0;const yB=b.toUpperCase().startsWith('YERBA')?1:0;if(yA!==yB)return yA-yB;return a.localeCompare(b);}).forEach(cat => {
        const subs = [...mapa[cat]].sort();
        const wrapper = document.createElement('div'); wrapper.className = 'filter-group';
        const catBtn = document.createElement('button'); catBtn.className = 'filter-btn'; catBtn.textContent = cat;
        const subRow = document.createElement('div'); subRow.className = 'sub-filters-row';
        if (subs.length > 0) {
            const allBtn = document.createElement('button'); allBtn.className = 'sub-btn active'; allBtn.textContent = 'Todo';
            allBtn.addEventListener('click', () => { subRow.querySelectorAll('.sub-btn').forEach(b=>b.classList.remove('active')); allBtn.classList.add('active'); subcategoriaActual=null; paginaActual=1; aplicarFiltros(); });
            subRow.appendChild(allBtn);
            subs.forEach(sub => {
                const subBtn = document.createElement('button'); subBtn.className = 'sub-btn'; subBtn.textContent = sub;
                subBtn.addEventListener('click', () => { subRow.querySelectorAll('.sub-btn').forEach(b=>b.classList.remove('active')); subBtn.classList.add('active'); filterBySubCategory(cat,sub); });
                subRow.appendChild(subBtn);
            });
        }
        catBtn.addEventListener('click', () => { setActiveFilter(catBtn); hideAllSubFilters(); if(subs.length>0)subRow.classList.add('show'); subcategoriaActual=null; paginaActual=1; filterByCategory(cat); });
        wrapper.appendChild(catBtn);
        if (subs.length > 0) wrapper.appendChild(subRow);
        container.appendChild(wrapper);
    });
}
function setActiveFilter(btn) { document.querySelectorAll('#categoryFilters .filter-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); }
function hideAllSubFilters() { document.querySelectorAll('.sub-filters-row').forEach(r=>r.classList.remove('show')); }

function formatPrice(v) { const n=Number(v)||0; return n.toLocaleString('es-AR',{minimumFractionDigits:0}); }
/* Precio final que paga el cliente (aplica descuento del producto si tiene) */
/* ===== PRODUCTOS POR PESO =====
   Los que se venden sueltos tienen el precio POR KILO y la cantidad en GRAMOS,
   igual que en el panel. El subtotal nunca se calcula a mano: siempre por
   subtotalCarrito(), porque la multiplicacion estaba repetida en siete lugares
   y con dos formas de vender una copia sin dividir por 1000 cobra mil veces de
   mas. */
function esPesoProd(x){return !!(x&&x.tipoVenta==='peso');}
function fmtGramos(gr){const g=Number(gr||0);
    if(Math.abs(g)<1000)return g.toLocaleString('es-AR')+' g';
    return (g/1000).toLocaleString('es-AR',{maximumFractionDigits:3})+' kg';}
function subtotalCarrito(i){const c=Number(i.cantidad||0),pr=Number(i.precio||0);
    return esPesoProd(i)?Math.round(pr*c/1000):pr*c;}
/* Cuanto suma o resta cada toque de + / -. En gramos, de a 100. */
function pasoCantidad(i){return esPesoProd(i)?100:1;}

function precioFinal(p){const dsc=Math.min(100,Math.max(0,p.descuento||0));return dsc>0?Math.round(p.precio*(1-dsc/100)):p.precio;}
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;}

function renderProductsPaginated(list) {
    const totalPages = Math.ceil(list.length / PRODUCTS_PER_PAGE);
    if (paginaActual > totalPages) paginaActual = totalPages || 1;
    const start = (paginaActual - 1) * PRODUCTS_PER_PAGE;
    const end = start + PRODUCTS_PER_PAGE;
    const pageItems = list.slice(start, end);
    renderProducts(pageItems);
    renderPagination(totalPages, list.length);
}

function renderPagination(totalPages, totalItems) {
    const container = document.getElementById('paginationContainer'); if(!container) return;
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    let html = '<div class="pagination-container">';
    html += '<button onclick="goToPage('+(paginaActual-1)+')"'+(paginaActual===1?' disabled':'')+'><i class="bi bi-chevron-left"></i></button>';
    for (let i = 1; i <= totalPages; i++) {
        if (totalPages <= 7 || i === 1 || i === totalPages || (i >= paginaActual - 1 && i <= paginaActual + 1)) {
            html += '<button onclick="goToPage('+i+')"'+(i===paginaActual?' class="active"':'')+'>'+i+'</button>';
        } else if (i === paginaActual - 2 || i === paginaActual + 2) {
            html += '<span style="padding:0 0.3rem;color:var(--color-text-light)">...</span>';
        }
    }
    html += '<button onclick="goToPage('+(paginaActual+1)+')"'+(paginaActual===totalPages?' disabled':'')+'><i class="bi bi-chevron-right"></i></button>';
    html += '</div>';
    html += '<p class="pagination-info">Mostrando '+(((paginaActual-1)*PRODUCTS_PER_PAGE)+1)+' - '+Math.min(paginaActual*PRODUCTS_PER_PAGE, totalItems)+' de '+totalItems+' productos</p>';
    container.innerHTML = html;
}

function goToPage(page) {
    paginaActual = page;
    aplicarFiltros();
    const section = document.getElementById('productos');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderProducts(list) {
    const c = document.getElementById('productsGrid'); if(!c)return;
    if (list.length===0) { c.innerHTML='<div class="empty-products"><i class="bi bi-search" style="font-size:2.5rem;color:var(--color-text-light)"></i><p style="color:var(--color-text-light);margin-top:1rem;font-size:1.05rem">No se encontraron productos</p></div>'; return; }
    c.innerHTML = list.map(p => {
        const ci=carrito.find(i=>i.id===p.id),qty=ci?ci.cantidad:0;
        const img=optImg(p.imagen,400)||'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22%3E%3Crect fill=%22%23e8e0d5%22 width=%22400%22 height=%22300%22/%3E%3Ctext x=%22200%22 y=%22155%22 text-anchor=%22middle%22 fill=%22%23999%22 font-size=%2216%22%3ESin imagen%3C/text%3E%3C/svg%3E';
        const noStock = p.stock === 0;
        const maxOut = qty>=p.stock;
        let btnContent;
        if(noStock){
            btnContent='<span class="atc-text"><i class="bi bi-x-circle"></i> Sin stock</span>';
        }else if(qty===0){
            btnContent='<span class="atc-text"><i class="bi bi-cart-plus"></i> Agregar</span>';
        }else{
            btnContent='<span class="atc-qty-wrap"><button class="atc-qty-btn" onclick="event.stopPropagation();updateProductQuantity(\''+p.id+'\',-1)"><i class="bi bi-dash"></i></button><span class="atc-qty-num">'+qty+'</span><button class="atc-qty-btn" onclick="event.stopPropagation();updateProductQuantity(\''+p.id+'\',1)"'+(maxOut?' disabled':'')+'><i class="bi bi-plus"></i></button></span>';
        }
        const atcTag=qty>0?'div':'button';
        const atcAttrs=qty>0
            ?'class="add-to-cart-btn added"'
            :'class="add-to-cart-btn"'+(noStock?' disabled':'')+' onclick="'+(qty===0?'addToCart(\''+p.id+'\')':'event.stopPropagation()')+'"';
        /* Gramajes asociados: hijos de este producto (sistema independiente de envasado propio) */
        const hijos=productos.filter(h=>h.gramajePadreId===p.id);
        const gramajeHTML=hijos.length>0?'<div class="gramaje-btns">'+
            '<button class="gramaje-btn active" onclick="event.stopPropagation();addToCart(\''+p.id+'\')" data-id="'+p.id+'">'+esc(p.gramaje||'Base')+'</button>'+
            hijos.map(h=>'<button class="gramaje-btn" onclick="event.stopPropagation();addToCart(\''+h.id+'\')" data-id="'+h.id+'">'+esc(h.gramaje||h.nombre)+'</button>').join('')+
            '</div>':'';
        const dscPct=Math.min(100,Math.max(0,p.descuento||0));
        const nombreDisplay=p.nombreMostrado||p.nombre;
        const badgeDesc=dscPct>0?'<span class="product-discount-ribbon">-'+(p.descuento||0)+'%</span>':'';
        const precioConDesc=dscPct>0?Math.round(p.precio*(1-dscPct/100)):p.precio;
        /* En los que se venden sueltos el precio es POR KILO, y hay que decirlo:
           si no, el cliente ve $9.000 y cree que esa es la bolsa. */
        const sufKilo=esPesoProd(p)?'<span class="precio-por-kilo">el kilo</span>':'';
        const precioHtml=dscPct>0
            ?'<span class="product-price product-price-off" onclick="openProductDetailModal(\''+p.id+'\')" style="cursor:pointer"><span class="price-original">$'+formatPrice(p.precio)+'</span> $'+formatPrice(precioConDesc)+sufKilo+'</span>'
            :'<span class="product-price" onclick="openProductDetailModal(\''+p.id+'\')" style="cursor:pointer">$'+formatPrice(p.precio)+sufKilo+'</span>';
        return '<article class="product-card" data-id="'+p.id+'">' +
            '<div class="product-image" onclick="openProductDetailModal(\''+p.id+'\')" style="cursor:pointer">' +
            badgeDesc +
            '<div class="img-skeleton"></div>' +
            '<img src="'+esc(img)+'" alt="'+esc(nombreDisplay)+'" loading="lazy" decoding="async" onload="this.style.opacity=1;this.previousElementSibling.style.display=\'none\'" onerror="if(this.dataset.orig&&this.src!==this.dataset.orig){this.src=this.dataset.orig;}else{this.src=\'img/default-product.svg\';}this.style.opacity=1;this.previousElementSibling.style.display=\'none\'" data-orig="'+esc(p.imagen||'')+'" style="opacity:0;transition:opacity 0.3s">' +
            '<span class="product-category">'+esc(p.categoria)+(p.subcategoria?' - '+esc(p.subcategoria):'')+'</span>' +
            (noStock?'<span class="product-stock out">Sin stock</span>':'') +
            '</div>' +
            '<div class="product-info">' +
            '<h3 class="product-name" onclick="openProductDetailModal(\''+p.id+'\')" style="cursor:pointer">'+esc(nombreDisplay)+'</h3>' +
            '<div class="product-footer">' +
            precioHtml +
            '</div>' +
            '<'+atcTag+' '+atcAttrs+'>' +
            btnContent +
            '</'+atcTag+'>' +
            gramajeHTML+
            '</div></article>';
    }).join('');
}

// === CARRITO ===
function initCart() {
    try{const saved=localStorage.getItem('brotesCart'); if(saved){carrito=JSON.parse(saved);updateCartUI();}}catch(e){carrito=[];console.warn('No se pudo cargar el carrito:',e);}
    document.getElementById('cartToggle')?.addEventListener('click',openCart);
    document.getElementById('cartClose')?.addEventListener('click',closeCart);
    document.getElementById('cartOverlay')?.addEventListener('click',closeCart);
    document.getElementById('browseProductsBtn')?.addEventListener('click',()=>closeCart());
    document.getElementById('goToCartBtn')?.addEventListener('click',()=>openCart());
    document.getElementById('checkoutBtn')?.addEventListener('click',checkout);
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeCart();});
}
function openCart(){document.getElementById('cartSidebar')?.classList.add('show');document.getElementById('cartOverlay')?.classList.add('show');document.body.style.overflow='hidden';}
function closeCart(){document.getElementById('cartSidebar')?.classList.remove('show');document.getElementById('cartOverlay')?.classList.remove('show');document.body.style.overflow='';}

function updateProductQuantity(id,ch) {
    if(!clienteAuth&&ch>0){requireLoginToBuy();return;}
    const p=productos.find(x=>x.id===id); if(!p)return;
    let idx=carrito.findIndex(i=>i.id===id);
    if(idx===-1&&ch>0){carrito.push({id:p.id,nombre:p.nombreMostrado||p.nombre,precio:precioFinal(p),precioOriginal:p.precio||0,descuento:Math.min(100,Math.max(0,p.descuento||0)),imagen:p.imagen,cantidad:1});showToast((p.nombreMostrado||p.nombre)+' agregado','success');}
    else if(idx!==-1){const nq=carrito[idx].cantidad+ch;if(nq<=0){carrito.splice(idx,1);showToast((p.nombreMostrado||p.nombre)+' eliminado','info');}else if(nq<=p.stock){carrito[idx].cantidad=nq;}else{showToast('Stock máximo','error');return;}}
    saveCart();updateCartUI();updateProductCard(id);
}
function requireLoginToBuy(){
    showToast('Iniciá sesión para agregar productos','info');
    /* Marcar que venía a comprar - al volver del login (redirect en móvil) se abre el carrito */
    try{sessionStorage.setItem('_intentoCompra','1');}catch(e){}
    /* Abrir el login directamente */
    if(typeof authLogin==='function')authLogin();
}
/* Salto del boton del carrito: confirma la accion sin leer el toast.
   Se reinicia la animacion quitando y volviendo a poner la clase. */
function _acusarCarrito(){
    if(window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;
    [document.getElementById('cartToggle'), document.getElementById('cartCount')].forEach(el => {
        if(!el) return;
        el.classList.remove('acusa');
        void el.offsetWidth;
        el.classList.add('acusa');
    });
}
/* =============================================================================
   SELECTOR DE GRAMOS (tienda)
   =============================================================================
   Los productos que se venden sueltos no se agregan "de a uno": el cliente elige
   cuanto lleva. Se abre al tocar Agregar, con los pesos de siempre a un click y
   el precio calculandose en vivo.

   Va con los colores de la tienda (--color-primary, --color-fondo), que son otros
   que los del panel. Y con estilos inline en vez de tocar styles.css: es un solo
   componente y asi no hay que acordarse de correr el build del CSS.

   Devuelve los GRAMOS, o null si se cerro sin elegir.
   ============================================================================= */
function pedirGramosTienda(p){
    const RAPIDOS=[100,250,500,1000];
    const precioKg=precioFinal(p);
    const stock=Number(p.stock||0);
    const nombre=p.nombreMostrado||p.nombre||'';
    return new Promise(resolve=>{
        const ov=document.createElement('div');
        ov.setAttribute('role','dialog');
        ov.setAttribute('aria-modal','true');
        ov.style.cssText='position:fixed;inset:0;z-index:10050;background:rgba(20,37,26,0.55);display:flex;align-items:center;justify-content:center;padding:1rem';
        const btnRap=RAPIDOS.filter(g=>!stock||g<=stock).map(g=>
            '<button type="button" data-g="'+g+'" style="flex:1 1 auto;min-width:70px;padding:0.6rem 0.4rem;border:1.5px solid var(--brand-crudo);background:#fff;color:var(--color-primary);font-family:inherit;font-weight:700;font-size:0.9rem;border-radius:10px;cursor:pointer">'
            +fmtGramos(g)+'</button>').join('');
        ov.innerHTML=
            '<div style="background:#fff;border-radius:16px;padding:1.5rem;width:100%;max-width:380px;box-shadow:0 20px 50px rgba(0,0,0,0.3)">'+
              '<h3 style="font-family:var(--font-display);color:var(--color-primary);font-size:1.15rem;margin:0 0 0.2rem">&iquest;Cu&aacute;nto quer&eacute;s?</h3>'+
              '<p style="color:var(--color-text-light);font-size:0.88rem;margin:0 0 0.15rem">'+esc(nombre)+'</p>'+
              '<p style="color:var(--color-text-light);font-size:0.82rem;margin:0 0 0.9rem">$'+formatPrice(precioKg)+' el kilo'+
                 (stock>0?' &middot; hay '+fmtGramos(stock):'')+'</p>'+
              '<div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-bottom:0.7rem">'+btnRap+'</div>'+
              '<div style="display:flex;align-items:center;gap:0.5rem">'+
                '<input type="number" min="1" step="50" inputmode="numeric" placeholder="gramos" '+
                  'style="flex:1;padding:0.7rem 0.8rem;border:1.5px solid var(--brand-crudo);border-radius:10px;font-family:inherit;font-size:1rem;text-align:right;color:var(--color-text)">'+
                '<span style="color:var(--color-text-light);font-size:0.9rem">gramos</span>'+
              '</div>'+
              '<div class="pgt-total" aria-live="polite" style="display:flex;justify-content:space-between;align-items:center;margin-top:0.8rem;min-height:1.7rem;color:var(--color-text-light);font-size:0.9rem"></div>'+
              '<div class="pgt-aviso" style="color:var(--color-secondary-dark);font-size:0.8rem;min-height:1.1rem"></div>'+
              '<div style="display:flex;gap:0.6rem;margin-top:1rem">'+
                '<button type="button" class="pgt-no" style="flex:0 0 auto;padding:0.75rem 1.1rem;border:1.5px solid var(--brand-crudo);background:#fff;color:var(--color-text);font-family:inherit;font-weight:600;border-radius:10px;cursor:pointer">Cancelar</button>'+
                '<button type="button" class="pgt-si" disabled style="flex:1;padding:0.75rem 1rem;border:none;background:var(--color-primary);color:#fff;font-family:inherit;font-weight:700;border-radius:10px;cursor:pointer">Agregar</button>'+
              '</div>'+
            '</div>';
        document.body.appendChild(ov);
        const inp=ov.querySelector('input');
        const ok=ov.querySelector('.pgt-si');
        const tot=ov.querySelector('.pgt-total');
        const avi=ov.querySelector('.pgt-aviso');
        let cerrado=false;
        const cerrar=v=>{if(cerrado)return;cerrado=true;document.removeEventListener('keydown',tecla,true);ov.remove();resolve(v);};
        function pintar(){
            const g=parseInt(inp.value,10);
            const valido=Number.isFinite(g)&&g>0&&(!stock||g<=stock);
            ok.disabled=!valido;
            ok.style.opacity=valido?'1':'0.5';
            tot.innerHTML=(Number.isFinite(g)&&g>0)
                ?'<span>'+fmtGramos(g)+'</span><b style="color:var(--color-primary);font-size:1.1rem">$'+formatPrice(Math.round(precioKg*g/1000))+'</b>':'';
            /* Aca SI se bloquea si no alcanza: a diferencia del mostrador, el pedido
               web se prepara despues y prometer stock que no hay es peor. */
            avi.textContent=(Number.isFinite(g)&&g>0&&stock&&g>stock)?('Solo quedan '+fmtGramos(stock)+'.'):'';
        }
        function tecla(e){
            if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cerrar(null);}
            else if(e.key==='Enter'&&!ok.disabled){e.preventDefault();cerrar(parseInt(inp.value,10));}
        }
        ov.querySelectorAll('[data-g]').forEach(b=>b.addEventListener('click',()=>{inp.value=b.getAttribute('data-g');pintar();inp.focus();}));
        inp.addEventListener('input',pintar);
        ok.addEventListener('click',()=>{if(!ok.disabled)cerrar(parseInt(inp.value,10));});
        ov.querySelector('.pgt-no').addEventListener('click',()=>cerrar(null));
        ov.addEventListener('mousedown',e=>{if(e.target===ov)cerrar(null);});
        document.addEventListener('keydown',tecla,true);
        setTimeout(()=>inp.focus(),40);
    });
}

async function addToCart(id) {
    if(!clienteAuth){requireLoginToBuy();return;}
    _acusarCarrito();
    const p=productos.find(x=>x.id===id); if(!p||(p.stock||0)<=0)return;
    const existing=carrito.find(i=>i.id===id);
    /* Por peso: se pregunta cuanto ANTES de tocar el carrito. Si ya estaba, los
       gramos se suman, que es lo que espera alguien que agrega dos veces. */
    if(esPesoProd(p)){
        const yaHay=existing?Number(existing.cantidad||0):0;
        const gr=await pedirGramosTienda(Object.assign({},p,{stock:Math.max(0,(p.stock||0)-yaHay)}));
        if(gr==null)return;
        if(existing){existing.cantidad=yaHay+gr;}
        else{carrito.push({id:p.id,nombre:p.nombreMostrado||p.nombre,tipoVenta:'peso',precio:precioFinal(p),precioOriginal:p.precio||0,descuento:Math.min(100,Math.max(0,p.descuento||0)),cantidad:gr,imagen:p.imagen||''});}
        showToast(fmtGramos(gr)+' de '+(p.nombreMostrado||p.nombre)+' agregado','success');
        saveCart();updateCartUI();updateProductCard(id);
        return;
    }
    if(existing){
        if(existing.cantidad<p.stock){existing.cantidad++;}else{showToast('Stock máximo','error');return;}
    }else{
        carrito.push({id:p.id,nombre:p.nombreMostrado||p.nombre,precio:precioFinal(p),precioOriginal:p.precio||0,descuento:Math.min(100,Math.max(0,p.descuento||0)),imagen:p.imagen,cantidad:1});
        showToast((p.nombreMostrado||p.nombre)+' agregado','success');
    }
    saveCart();updateCartUI();updateProductCard(id);
}
function updateProductCard(id) {
    const p=productos.find(x=>x.id===id);if(!p)return;
    const card=document.querySelector('.product-card[data-id="'+id+'"]');
    if(!card)return;
    const ci=carrito.find(i=>i.id===id),qty=ci?ci.cantidad:0;
    const noStock=(p.stock||0)<=0;
    const maxOut=qty>=p.stock;
    const oldEl=card.querySelector('.add-to-cart-btn');
    if(!oldEl)return;
    let btnContent;
    if(noStock){
        btnContent='<span class="atc-text"><i class="bi bi-x-circle"></i> Sin stock</span>';
    }else if(qty===0){
        btnContent='<span class="atc-text"><i class="bi bi-cart-plus"></i> Agregar</span>';
    }else{
        btnContent='<span class="atc-qty-wrap"><button class="atc-qty-btn" onclick="event.stopPropagation();updateProductQuantity(\''+id+'\',-1)"><i class="bi bi-dash"></i></button><span class="atc-qty-num">'+qty+'</span><button class="atc-qty-btn" onclick="event.stopPropagation();updateProductQuantity(\''+id+'\',1)"'+(maxOut?' disabled':'')+'><i class="bi bi-plus"></i></button></span>';
    }
    const newTag=qty>0?'div':'button';
    const newEl=document.createElement(newTag);
    newEl.className='add-to-cart-btn'+(qty>0?' added':'');
    if(newTag==='button'){newEl.disabled=noStock;newEl.setAttribute('onclick',qty===0?'addToCart(\''+id+'\')':'event.stopPropagation()');}
    newEl.innerHTML=btnContent;
    oldEl.parentNode.replaceChild(newEl,oldEl);
}
function updateCartItemQuantity(id,ch){const p=productos.find(x=>x.id===id),idx=carrito.findIndex(i=>i.id===id);if(idx===-1)return;const stock=p?p.stock:carrito[idx].cantidad;const nq=carrito[idx].cantidad+ch;if(nq<=0)removeFromCart(id);else if(nq<=stock){carrito[idx].cantidad=nq;saveCart();updateCartUI();updateProductCard(id);}else showToast('Stock máximo: '+(esPesoProd(carrito[idx])?fmtGramos(stock):stock),'error');}
function removeFromCart(id){const idx=carrito.findIndex(i=>i.id===id);if(idx!==-1){const nm=carrito[idx].nombre;carrito.splice(idx,1);showToast(nm+' eliminado','info');saveCart();updateCartUI();updateProductCard(id);}}
function saveCart(){try{localStorage.setItem('brotesCart',JSON.stringify(carrito));}catch(e){console.warn('No se pudo guardar el carrito:',e);}}
function clearCart(){if(carrito.length===0)return;if(!confirm('Vaciar todo el carrito?'))return;const ids=carrito.map(i=>i.id);carrito=[];saveCart();updateCartUI();ids.forEach(id=>updateProductCard(id));showToast('Carrito vaciado','info');}

let _pdmCurrentImgIdx=0;
let _pdmImages=[];
function openProductDetailModal(id){
    const p=productos.find(x=>x.id===id);if(!p)return;
    /* Construir lista de imagenes: imagen principal + imagenesExtra (del admin) */
    const imgsArr=[];
    if(p.imagen)imgsArr.push(p.imagen);
    if(Array.isArray(p.imagenesExtra))p.imagenesExtra.forEach(u=>{if(u&&!imgsArr.includes(u))imgsArr.push(u);});
    /* Compat con campo viejo "imagenes" si existiera */
    if(Array.isArray(p.imagenes))p.imagenes.forEach(u=>{if(u&&!imgsArr.includes(u))imgsArr.push(u);});
    _pdmImages=imgsArr;
    _pdmCurrentImgIdx=0;
    const ci=carrito.find(i=>i.id===id),qty=ci?ci.cantidad:0;
    const noStock=(p.stock||0)<=0;
    const maxOut=qty>=p.stock;
    const imgsHtml=_pdmImages.length?_pdmImages.map((url,i)=>'<img src="'+esc(optImg(url,800)||url)+'" class="pdm-img'+(i===0?' active':'')+'" data-idx="'+i+'" alt="'+esc(p.nombre)+'" data-orig="'+esc(url||'')+'" onerror="if(this.dataset.orig&&this.src!==this.dataset.orig){this.src=this.dataset.orig;}else{this.src=\'img/default-product.svg\';}">').join(''):'<div class="pdm-img-placeholder"><i class="bi bi-image"></i> Sin imagen</div>';
    const carouselNav=_pdmImages.length>1?'<button class="pdm-carousel-btn pdm-prev" onclick="pdmCarouselNav(-1)"><i class="bi bi-chevron-left"></i></button><button class="pdm-carousel-btn pdm-next" onclick="pdmCarouselNav(1)"><i class="bi bi-chevron-right"></i></button><div class="pdm-carousel-dots">'+_pdmImages.map((_,i)=>'<span class="pdm-dot'+(i===0?' active':'')+'" onclick="pdmCarouselGoTo('+i+')"></span>').join('')+'</div>':'';
    let btnContent;
    if(noStock){btnContent='<i class="bi bi-x-circle"></i> Sin stock';}
    else if(qty===0){btnContent='<i class="bi bi-cart-plus"></i> Agregar al carrito';}
    else{btnContent='<span class="pdm-qty-wrap"><button class="pdm-qty-btn" onclick="event.stopPropagation();updateProductQuantity(\''+id+'\',-1);refreshProductDetailModal(\''+id+'\')"><i class="bi bi-dash"></i></button><span class="pdm-qty-num">'+qty+'</span><button class="pdm-qty-btn" onclick="event.stopPropagation();updateProductQuantity(\''+id+'\',1);refreshProductDetailModal(\''+id+'\')"'+(maxOut?' disabled':'')+'><i class="bi bi-plus"></i></button></span>';}
    const desc=p.descripcion||'';
    const vn=p.valoresNutricionales||p.infoNutricional||p.tablaNutricional||'';
    const nombreDisplay=p.nombreMostrado||p.nombre;
    const dscPct=Math.min(100,Math.max(0,p.descuento||0));
    const precioRowHtml=dscPct>0
        ?'<div class="pdm-price-row"><span class="pdm-price product-price-off">$'+formatPrice(Math.round(p.precio*(1-dscPct/100)))+'</span><span class="price-original" style="font-size:1rem">$'+formatPrice(p.precio)+'</span><span style="background:linear-gradient(135deg,#a79066,#8a7856);color:#161616;font-size:0.72rem;font-weight:800;padding:2px 8px;border-radius:6px;margin-left:6px">-'+(p.descuento||0)+'% OFF</span>'+(noStock?'<span class="pdm-stock-tag">Sin stock</span>':'')+'</div>'
        :'<div class="pdm-price-row"><span class="pdm-price">$'+formatPrice(p.precio)+'</span>'+(noStock?'<span class="pdm-stock-tag">Sin stock</span>':'')+'</div>';
    /* Gramajes asociados */
    const pdmHijos=productos.filter(h=>h.gramajePadreId===p.id);
    const pdmGramajeHtml=pdmHijos.length>0?'<div class="pdm-section"><h4>Presentaciones</h4><div class="gramaje-btns">'+
        '<button class="gramaje-btn active" onclick="addToCart(\''+p.id+'\');showToast(\''+esc((p.nombreMostrado||p.nombre)).replace(/'/g,"")+'\'+\' agregado\',\'success\')">'+esc(p.gramaje||'Base')+'</button>'+
        pdmHijos.map(h=>'<button class="gramaje-btn" onclick="addToCart(\''+h.id+'\');showToast(\'Agregado\',\'success\')">'+esc(h.gramaje||h.nombre)+'</button>').join('')+
        '</div></div>':'';
    document.getElementById('productDetailBody').innerHTML=
        '<div class="pdm-carousel">'+imgsHtml+carouselNav+'</div>'+
        '<div class="pdm-info">'+
        '<div class="pdm-cat">'+esc(p.categoria||'')+(p.subcategoria?' &middot; '+esc(p.subcategoria):'')+'</div>'+
        '<h2 class="pdm-name">'+esc(nombreDisplay)+'</h2>'+
        precioRowHtml+
        pdmGramajeHtml+
        (desc?'<div class="pdm-section"><h4>Descripción</h4><p>'+esc(desc).replace(/\n/g,'<br>')+'</p></div>':'')+
        (vn?'<div class="pdm-section"><h4>Información nutricional</h4><div class="pdm-nutritional">'+esc(vn).replace(/\n/g,'<br>')+'</div></div>':'')+
        (!desc&&!vn?'<div class="pdm-section pdm-no-info"><i class="bi bi-info-circle"></i> Próximamente más información sobre este producto</div>':'')+
        (qty===0||noStock?'<button class="pdm-add-btn'+(noStock?' disabled':'')+'" id="pdmAddBtn-'+id+'" onclick="'+(qty===0&&!noStock?'addToCart(\''+id+'\');refreshProductDetailModal(\''+id+'\')'  :'event.stopPropagation()')+'"'+(noStock?' disabled':'')+'>'+btnContent+'</button>':'<div class="pdm-add-btn added" id="pdmAddBtn-'+id+'">'+btnContent+'</div>')+
        '</div>';
    const footerEl=document.getElementById('productDetailFooter');
    const btnEl=document.getElementById('productDetailBody').querySelector('.pdm-add-btn');
    if(btnEl&&footerEl){footerEl.innerHTML='';footerEl.appendChild(btnEl);}
    document.getElementById('productDetailModal').classList.add('show');
    document.getElementById('productDetailOverlay').classList.add('show');
    document.body.style.overflow='hidden';
}
function refreshProductDetailModal(id){
    /* Solo actualizar el boton (no re-renderizar todo el modal para evitar bugs y perder handlers) */
    const p=productos.find(x=>x.id===id);if(!p)return;
    const btnEl=document.getElementById('pdmAddBtn-'+id)||(document.getElementById('productDetailFooter')&&document.getElementById('productDetailFooter').querySelector('#pdmAddBtn-'+id));
    if(!btnEl)return;
    const ci=carrito.find(i=>i.id===id),qty=ci?ci.cantidad:0;
    const noStock=(p.stock||0)<=0;
    const maxOut=qty>=p.stock;
    let btnContent,newEl;
    if(noStock){
        btnContent='<i class="bi bi-x-circle"></i> Sin stock';
        newEl='<button class="pdm-add-btn" id="pdmAddBtn-'+id+'" onclick="event.stopPropagation()" disabled>'+btnContent+'</button>';
    }else if(qty===0){
        btnContent='<i class="bi bi-cart-plus"></i> Agregar al carrito';
        newEl='<button class="pdm-add-btn" id="pdmAddBtn-'+id+'" onclick="addToCart(\''+id+'\');refreshProductDetailModal(\''+id+'\')">' +btnContent+'</button>';
    }else{
        btnContent='<span class="pdm-qty-wrap"><button class="pdm-qty-btn" onclick="event.stopPropagation();updateProductQuantity(\''+id+'\',-1);refreshProductDetailModal(\''+id+'\')"><i class="bi bi-dash"></i></button><span class="pdm-qty-num">'+qty+'</span><button class="pdm-qty-btn" onclick="event.stopPropagation();updateProductQuantity(\''+id+'\',1);refreshProductDetailModal(\''+id+'\')"'+(maxOut?' disabled':'')+'><i class="bi bi-plus"></i></button></span>';
        newEl='<div class="pdm-add-btn added" id="pdmAddBtn-'+id+'">'+btnContent+'</div>';
    }
    btnEl.outerHTML=newEl;
}
function closeProductDetailModal(){
    document.getElementById('productDetailModal')?.classList.remove('show');
    document.getElementById('productDetailOverlay')?.classList.remove('show');
    document.body.style.overflow='';
}
function pdmCarouselNav(delta){
    if(!_pdmImages.length)return;
    _pdmCurrentImgIdx=(_pdmCurrentImgIdx+delta+_pdmImages.length)%_pdmImages.length;
    pdmCarouselGoTo(_pdmCurrentImgIdx);
}
function pdmCarouselGoTo(idx){
    if(!_pdmImages.length)return;
    _pdmCurrentImgIdx=idx;
    document.querySelectorAll('.pdm-img').forEach((el,i)=>el.classList.toggle('active',i===idx));
    document.querySelectorAll('.pdm-dot').forEach((el,i)=>el.classList.toggle('active',i===idx));
}
document.addEventListener('keydown',e=>{
    if(!document.getElementById('productDetailModal')?.classList.contains('show'))return;
    if(e.key==='Escape')closeProductDetailModal();
    else if(e.key==='ArrowLeft')pdmCarouselNav(-1);
    else if(e.key==='ArrowRight')pdmCarouselNav(1);
});

function updateCartUI() {
    const body=document.getElementById('cartBody'),empty=document.getElementById('cartEmpty'),footer=document.getElementById('cartFooter'),count=document.getElementById('cartCount'),total=document.getElementById('cartTotal'),cta=document.getElementById('ctaCartCount'),ckBtn=document.getElementById('checkoutBtn');
    /* Los items por peso no suman al contador de unidades del carrito: 250 gramos
       no son 250 productos. Cuentan como uno. */
    const ti=carrito.reduce((s,i)=>s+(esPesoProd(i)?1:i.cantidad),0),tp=carrito.reduce((s,i)=>s+subtotalCarrito(i),0);
    if(count)count.textContent=ti;if(cta)cta.textContent=ti;if(total)total.textContent='$'+formatPrice(tp);
    if(carrito.length===0){if(empty)empty.style.display='block';if(footer)footer.style.display='none';body?.querySelectorAll('.cart-item').forEach(i=>i.remove());}
    else{if(empty)empty.style.display='none';if(footer){footer.style.display='';footer.style.removeProperty('display');}renderCartItems();}
    if(ckBtn){const min=PEDIDOS.minimoPedido;ckBtn.disabled=carrito.length===0||tp<min;if(min>0&&tp>0&&tp<min){ckBtn.innerHTML='<i class="bi bi-bag-check"></i> Mínimo $'+formatPrice(min);}else{ckBtn.innerHTML='<i class="bi bi-bag-check"></i> Confirmar';}}
    updateShippingBar(tp);
}
function renderCartItems() {
    const body=document.getElementById('cartBody'),empty=document.getElementById('cartEmpty');if(!body)return;
    body.querySelectorAll('.cart-item').forEach(i=>i.remove());
    carrito.forEach(item=>{const p=productos.find(x=>x.id===item.id),ms=p?p.stock:item.cantidad;const el=document.createElement('div');el.className='cart-item';el.innerHTML='<img src="'+esc(optImg(item.imagen,200)||'img/default-product.svg')+'" alt="'+esc(item.nombre)+'" class="cart-item-image"><div class="cart-item-info"><h4 class="cart-item-name">'+esc(item.nombre)+'</h4><span class="cart-item-price">$'+formatPrice(item.precio)+(esPesoProd(item)?' el kilo':'')+'</span>'+(esPesoProd(item)?'<span class="cart-item-price" style="display:block;opacity:0.8;font-size:0.85em">'+fmtGramos(item.cantidad)+' = $'+formatPrice(subtotalCarrito(item))+'</span>':'')+'<div class="cart-item-controls"><button class="qty-btn" onclick="updateCartItemQuantity(\''+item.id+'\',-'+pasoCantidad(item)+')"><i class="bi bi-dash"></i></button><span class="qty-value">'+(esPesoProd(item)?fmtGramos(item.cantidad):item.cantidad)+'</span><button class="qty-btn" onclick="updateCartItemQuantity(\''+item.id+'\','+pasoCantidad(item)+')"'+(item.cantidad>=ms?' disabled':'')+'><i class="bi bi-plus"></i></button><button class="cart-item-remove" onclick="removeFromCart(\''+item.id+'\')"><i class="bi bi-trash"></i></button></div></div>';body.insertBefore(el,empty);});
}

function updateShippingBar(total) {
    const msg=document.getElementById('shippingMsg'),fill=document.getElementById('shippingBarFill'),wrap=document.getElementById('shippingProgress');
    if(!msg||!fill)return;
    const MIN=PEDIDOS.minimoPedido, GRATIS=(PEDIDOS.haceEnvios&&PEDIDOS.envioGratisActivo)?PEDIDOS.envioGratisDesde:0;
    /* Sin minimo y sin envio gratis no hay nada que mostrar */
    if(MIN<=0 && !GRATIS){ if(wrap)wrap.style.display='none'; return; }
    if(wrap)wrap.style.display='';
    /* La barra se llena hasta la meta mas lejana que este activa */
    const meta = GRATIS || MIN;
    const pct = Math.min(100, meta>0 ? (total/meta*100) : 0);
    _renderMarcadoresEnvio(MIN, GRATIS, meta);
    if(MIN>0 && total<MIN){
        msg.textContent='Faltan $'+formatPrice(MIN-total)+' para el pedido minimo ($'+formatPrice(MIN)+')';
        msg.className='shipping-msg under-min'; fill.style.width=pct+'%'; fill.style.background='#c0392b';
    } else if(GRATIS && total<GRATIS){
        msg.textContent='Faltan $'+formatPrice(GRATIS-total)+' para envio gratis!';
        msg.className='shipping-msg near-free'; fill.style.width=pct+'%'; fill.style.background='#a79066';
    } else if(GRATIS){
        msg.textContent='Tenes envio gratis!';
        msg.className='shipping-msg free-shipping'; fill.style.width='100%'; fill.style.background='var(--color-primary)';
    } else {
        msg.textContent='Pedido minimo alcanzado';
        msg.className='shipping-msg free-shipping'; fill.style.width='100%'; fill.style.background='var(--color-primary)';
    }
}
/* Los marcadores de la barra se dibujan segun la config, no hardcodeados en el HTML */
function _renderMarcadoresEnvio(MIN, GRATIS, meta){
    const bar=document.querySelector('.shipping-bar'); if(!bar||!meta)return;
    const firma=MIN+'|'+GRATIS; if(bar.dataset.firma===firma)return; bar.dataset.firma=firma;
    bar.querySelectorAll('.shipping-marker').forEach(m=>m.remove());
    const corto=v=>v>=1000?Math.round(v/1000)+'k':String(v);
    const puntos=[]; if(MIN>0)puntos.push(MIN); if(GRATIS&&GRATIS!==MIN)puntos.push(GRATIS);
    puntos.forEach(v=>{const m=document.createElement('div');m.className='shipping-marker';m.style.left=Math.min(100,v/meta*100)+'%';m.textContent=corto(v);bar.appendChild(m);});
}


function checkout() {
    if(carrito.length===0){showToast('Carrito vacío','error');return;}
    if(!clienteAuth){requireLoginToBuy();return;}
    openCheckoutModal();
}

function openCheckoutModal(){
    const loginRequired = document.getElementById('chkLoginRequired');
    const datosSection = document.getElementById('chkDatosSection');
    const confirmBtn = document.getElementById('chkConfirmBtn');

    /* El botón y los campos SIEMPRE visibles - no obligamos a login */
    if (datosSection) datosSection.style.display = 'block';
    if (confirmBtn) confirmBtn.style.display = '';

    const wrap = document.getElementById('chkDirGuardadasWrap');
    const sel = document.getElementById('chkDirSelect');
    const nuevaDirWrap = document.getElementById('chkNuevaDirWrap');
    const nomDirWrap = document.getElementById('chkNombreDirWrap');

    if (clienteAuth) {
        /* Logueado: ocultar aviso de login y pre-llenar datos */
        if (loginRequired) loginRequired.style.display = 'none';
        const nEl=document.getElementById('chkNombre'),aEl=document.getElementById('chkApellido'),tEl=document.getElementById('chkTelefono');
        if(nEl&&!nEl.value)nEl.value = clienteAuth.nombre || '';
        if(aEl&&!aEl.value)aEl.value = clienteAuth.apellido || '';
        if(tEl&&!tEl.value)tEl.value = clienteAuth.telefono || '';
        /* Cargar direcciones guardadas */
        const dirs = clienteAuth.direcciones || [];
        if (dirs.length) {
            sel.innerHTML = dirs.map((d,i) =>
                `<option value="${i}">${d.nombre} — ${d.texto}</option>`
            ).join('') + '<option value="nueva">+ Nueva dirección...</option>';
            if (wrap) wrap.style.display = 'block';
            if (nuevaDirWrap) nuevaDirWrap.style.display = 'none';
            document.getElementById('chkDireccion').value = dirs[0].texto;
            sel.value = '0';
        } else {
            if (wrap) wrap.style.display = 'none';
            if (nuevaDirWrap) nuevaDirWrap.style.display = 'block';
            if (nomDirWrap) nomDirWrap.style.display = 'block';
        }
    } else {
        /* No logueado: mostrar aviso opcional de login, campos vacíos editables */
        if (loginRequired) loginRequired.style.display = 'block';
        if (wrap) wrap.style.display = 'none';
        if (nuevaDirWrap) nuevaDirWrap.style.display = 'block';
        if (nomDirWrap) nomDirWrap.style.display = 'none';
        /* Pre-llenar desde localStorage si compró antes (sin login) */
        try{
            const saved=JSON.parse(localStorage.getItem('brotes_checkout_data')||'{}');
            const nEl=document.getElementById('chkNombre'),aEl=document.getElementById('chkApellido'),tEl=document.getElementById('chkTelefono'),dEl=document.getElementById('chkDireccion');
            if(nEl&&!nEl.value&&saved.nombre)nEl.value=saved.nombre;
            if(aEl&&!aEl.value&&saved.apellido)aEl.value=saved.apellido;
            if(tEl&&!tEl.value&&saved.telefono)tEl.value=saved.telefono;
            if(dEl&&!dEl.value&&saved.direccion)dEl.value=saved.direccion;
        }catch(e){}
    }
    setCheckoutEntrega(PEDIDOS.haceEnvios?'envio':'retiro');
    aplicarModoEntrega();
    /* Limpiar cupón al abrir nuevo checkout */
    quitarCupon();
    updateCheckoutResumen();
    document.getElementById('checkoutOverlay').classList.add('show');
    document.getElementById('checkoutModal').classList.add('show');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('chkNombre')?.focus(), 150);
}

function onSelectDireccion(val) {
    const dirs = clienteAuth?.direcciones || [];
    const input = document.getElementById('chkDireccion');
    const nuevaDirWrap = document.getElementById('chkNuevaDirWrap');
    const nomDirWrap = document.getElementById('chkNombreDirWrap');
    if (val === 'nueva') {
        if (input) input.value = '';
        if (nuevaDirWrap) nuevaDirWrap.style.display = 'block';
        if (nomDirWrap) nomDirWrap.style.display = dirs.length < 5 ? 'block' : 'none';
        const nomDirInput = document.getElementById('chkNombreDir');
        if (nomDirInput) nomDirInput.value = '';
    } else {
        const dir = dirs[parseInt(val)];
        if (dir) {
            if (input) input.value = dir.texto;
        }
        if (nuevaDirWrap) nuevaDirWrap.style.display = 'none';
    }
}

function closeCheckoutModal(){
    document.getElementById('checkoutOverlay')?.classList.remove('show');
    document.getElementById('checkoutModal')?.classList.remove('show');
    document.body.style.overflow='';_cuponAplicado=null;const ci=document.getElementById('chkCuponInput');if(ci)ci.value='';const cm=document.getElementById('chkCuponMsg');if(cm)cm.innerHTML='';
    const btn=document.getElementById('chkConfirmBtn');
    if(btn){btn.disabled=false;btn.innerHTML='<i class="bi bi-whatsapp"></i> Confirmar pedido';}
}

/* Si el comercio no hace envios, el checkout no ofrece la opcion: se esconde el
   selector, se fuerza retiro y se oculta el campo de direccion. */
function aplicarModoEntrega(){
    const toggle=document.querySelector('.chk-entrega-toggle');
    if(!PEDIDOS.haceEnvios){
        if(toggle)toggle.style.display='none';
        setCheckoutEntrega('retiro');
    } else if(toggle){
        toggle.style.display='';
    }
}
function setCheckoutEntrega(tipo){
    /* Sin envios no se puede elegir envio ni aunque llamen a mano a la funcion */
    if(!PEDIDOS.haceEnvios) tipo='retiro';
    window._chkTipoEntrega=tipo==='retiro'?'retiro':'envio';
    document.querySelectorAll('.chk-entrega-btn').forEach(b=>{
        b.classList.toggle('active',b.getAttribute('data-tipo')===window._chkTipoEntrega);
    });
    /* Mostrar/ocultar campo direccion segun tipo */
    const dirGroup=document.getElementById('chkDireccionGroup');
    const dirInput=document.getElementById('chkDireccion');
    /* La direccion de retiro solo tiene sentido si el cliente eligio retirar.
       Antes se mostraba siempre, incluso a quien pidio envio a domicilio. */
    const retiroInfo=document.getElementById('chkRetiroInfo');
    if(retiroInfo)retiroInfo.style.display=(window._chkTipoEntrega==='retiro')?'':'none';
    if(window._chkTipoEntrega==='retiro'){
        if(dirGroup)dirGroup.style.display='none';
        if(dirInput)dirInput.removeAttribute('required');
    }else{
        if(dirGroup)dirGroup.style.display='';
        if(dirInput)dirInput.setAttribute('required','required');
    }
    updateCheckoutResumen();
}

function updateCheckoutResumen(){
    const subtotal=carrito.reduce((s,i)=>s+subtotalCarrito(i),0);
    const tipoEntrega=PEDIDOS.haceEnvios?(window._chkTipoEntrega||'envio'):'retiro';
    const dcMonto=_cuponAplicado?Math.min(_cuponAplicado.monto||0,subtotal):0;
    const subtotalConDesc=subtotal-dcMonto;
    const envio=costoEnvio(subtotalConDesc,tipoEntrega);
    const total=subtotalConDesc+envio;
    const el=document.getElementById('chkResumen');
    if(!el)return;
    const envioRow=tipoEntrega==='retiro'
        ?'<div class="chk-resumen-row"><span><i class="bi bi-shop"></i> Retiro en local</span><span style="color:#3d402f">sin cargo</span></div>'
        :('<div class="chk-resumen-row"><span><i class="bi bi-truck"></i> Envío</span><span'+(envio===0?' style="color:#3d402f;font-weight:600"':'')+'>'+(envio===0?'GRATIS':'$'+formatPrice(envio))+'</span></div>');
    const cuponRow=_cuponAplicado?'<div class="chk-resumen-row" style="color:#3d402f"><span><i class="bi bi-ticket-perforated"></i> Cupón '+_cuponAplicado.codigo+'</span><span>-$'+formatPrice(dcMonto)+'</span></div>':'';
    /* Lista de productos */
    const itemsList = carrito.map(i => {
        /* A granel la cantidad son GRAMOS: "x250" se lee como 250 unidades. Se muestra
           igual que en el carrito (renderCartItems) y en el mensaje de WhatsApp. */
        const _bdg = 'background:#e7e8dd;color:#3d402f;border-radius:10px;padding:1px 7px;font-size:0.75rem;font-weight:700';
        const cant = esPesoProd(i)
            ? '<span style="'+_bdg+'">'+fmtGramos(i.cantidad)+'</span> '
            : (i.cantidad > 1 ? '<span style="'+_bdg+'">x'+i.cantidad+'</span> ' : '');
        /* subtotalCarrito(i), NO precio*cantidad: a granel el precio es POR KILO y la
           cantidad viene en gramos. Esta es la pantalla donde el cliente confirma la
           compra, asi que el renglon mostraba $4.500.000 justo arriba de un TOTAL de
           $4.500. El nombre se escapa como en el carrito: los nombres del catalogo
           entran por el Excel del proveedor, que no lo escribe el comercio. */
        return '<div class="chk-resumen-item">'+cant+'<span class="chk-resumen-item-name">'+esc(i.nombre)+'</span><span>$'+formatPrice(subtotalCarrito(i))+'</span></div>';
    }).join('');
    el.innerHTML=
        '<div style="margin-bottom:0.5rem;padding-bottom:0.5rem;border-bottom:1px solid #eee">'+itemsList+'</div>'+
        '<div class="chk-resumen-row"><span>Subtotal ('+carrito.length+' '+(carrito.length===1?'producto':'productos')+')</span><span>$'+formatPrice(subtotal)+'</span></div>'+
        envioRow+cuponRow+
        '<div class="chk-resumen-total"><span>TOTAL</span><span>$'+formatPrice(total)+'</span></div>';
}


/* ===== SEGURIDAD - SANITIZACIÓN ===== */
function sanitizeText(val, maxLen) {
    if (!val) return '';
    /* Eliminar caracteres de control y HTML */
    return String(val)
        .replace(/[<>"'`]/g, '')
        .replace(/[\x00-\x1F\x7F]/g, '')
        .trim()
        .slice(0, maxLen || 500);
}
function sanitizePhone(val) {
    if (!val) return '';
    return String(val).replace(/[^0-9+\-\s()]/g, '').trim().slice(0, 30);
}

async function confirmCheckout(){
    /* Si ingresó una nueva dirección con nombre, guardarla en el perfil */
    const nomDirInput = document.getElementById('chkNombreDir');
    const nomDir = sanitizeText(nomDirInput?.value, 60);
    const selDir = document.getElementById('chkDirSelect');
    /* Guardar si: hay nombre, y (no hay select visible O eligió "nueva") */
    const selVisible = selDir && selDir.offsetParent !== null;
    const esNueva = !selVisible || selDir.value === 'nueva';
    if (clienteAuth && nomDir && esNueva) {
        const dirs = clienteAuth.direcciones || [];
        const dirTexto = sanitizeText(document.getElementById('chkDireccion').value, 200);
        if (dirs.length < 5 && dirTexto) {
            dirs.push({ nombre: nomDir, texto: dirTexto });
            try {
                await db.collection('clientesAuth').doc(clienteAuth.uid).update({ direcciones: dirs });
                clienteAuth.direcciones = dirs;
                console.log('Dirección guardada:', nomDir, dirTexto);
            } catch(e) { console.warn('Error guardando dirección:', e); }
        }
    }
    const nombre=sanitizeText(document.getElementById('chkNombre').value, 80);
    const apellido=sanitizeText(document.getElementById('chkApellido').value, 80);
    const telefono=sanitizePhone(document.getElementById('chkTelefono').value);
    const direccion=sanitizeText(document.getElementById('chkDireccion').value, 200);
    const notas=sanitizeText(document.getElementById('chkNotas').value, 500);
    const tipoEntrega=PEDIDOS.haceEnvios?(window._chkTipoEntrega||'envio'):'retiro';
    /* Validaciones */
    if(!nombre){showToast('Ingresá tu nombre','error');document.getElementById('chkNombre').focus();return;}
    if(!apellido){showToast('Ingresá tu apellido','error');document.getElementById('chkApellido').focus();return;}
    if(!telefono){showToast('Ingresá tu teléfono','error');document.getElementById('chkTelefono').focus();return;}
    const telefonoLimpio=telefono.replace(/\D/g,'');
    if(telefonoLimpio.length<8){showToast('El teléfono debe tener al menos 8 dígitos','error');document.getElementById('chkTelefono').focus();return;}
    if(tipoEntrega==='envio'&&!direccion){showToast('Para envío necesitamos tu dirección','error');document.getElementById('chkDireccion').focus();return;}
    /* Guardar datos en localStorage para próxima vez */
    try{localStorage.setItem('brotes_checkout_data',JSON.stringify({nombre,apellido,telefono,direccion,notas,tipoEntrega}));}catch(e){}
    const btn=document.getElementById('chkConfirmBtn');
    btn.disabled=true;btn.innerHTML='<i class="bi bi-arrow-repeat spin"></i> Confirmando...';
    try{
        if(!firebase||!firebase.firestore){throw new Error('Firebase no inicializado');}
        const db=firebase.firestore();
        const subtotal=carrito.reduce((s,i)=>s+subtotalCarrito(i),0);
        const dcMonto=_cuponAplicado?Math.min(_cuponAplicado.monto||0,subtotal):0;
        const subtotalConDesc=subtotal-dcMonto;
        const envio=costoEnvio(subtotalConDesc,tipoEntrega);
        const total=subtotalConDesc+envio;
        /* firestore.rules pide validString(cliente,120), pero nombre y apellido se
           sanitizan a 80 CADA UNO y ningun input tiene maxlength: el tope real era
           80+1+80=161. Un nombre largo hacia que la regla rechazara el create.
           Se recorta en vez de frenar: al cliente no le importa el limite, y el
           comercio prefiere el pedido con el nombre cortado antes que ningun pedido. */
        const clienteNombreCompleto=(nombre+' '+apellido).slice(0,120);
        /* Los tres topes que siguen son los de firestore.rules. Estan aca porque si la
           regla rechaza el create, el catch de mas abajo NO frena: el numero de pedido
           ya se consumio (queda un hueco en la numeracion), el uso del cupon se
           registra igual contra un pedido que no existe, el carrito se vacia, y el
           unico rastro es el WhatsApp que el cliente tiene que acordarse de mandar.
           Es exactamente el modo de falla del bug historico: nadie ve un error. */
        /* 1. total > 0. Con un cupon que cubre todo el carrito y retiro en local el
              total da 0 y la regla rechaza el create. */
        if(!(total>0)){
            showToast('El total del pedido queda en $0. Revisa el cupon o el carrito.','error');
            const b=document.getElementById('chkConfirmBtn');
            if(b){b.disabled=false;b.innerHTML='Confirmar pedido';}
            return;
        }
        /* 2. total < 10.000.000. */
        if(total>=10000000){
            showToast('El total supera el maximo por pedido. Escribinos por WhatsApp para un pedido de este tamaño.','error');
            const b=document.getElementById('chkConfirmBtn');
            if(b){b.disabled=false;b.innerHTML='Confirmar pedido';}
            return;
        }
        /* 3. items.size() <= 100. Se llega repitiendo un pedido viejo grande
              (repetirPedido) o armando un carrito enorme a mano. */
        if(carrito.length>100){
            showToast('El pedido no puede tener mas de 100 productos distintos (tenes '+carrito.length+'). Sacá algunos y confirmá el resto.','error');
            const b=document.getElementById('chkConfirmBtn');
            if(b){b.disabled=false;b.innerHTML='Confirmar pedido';}
            return;
        }
        /* El stock NO se descuenta desde aca, y el motivo importa:
           firestore.rules tiene /productos como `allow write: if isAdmin()`, asi que
           este update lo rechazaba SIEMPRE para un cliente comun. La transaccion
           entera moria con permission-denied, el catch solo avisaba por consola, la
           ejecucion seguia de largo, y el pedido terminaba guardado con numero 1 y
           con stockDescontado en true sin haber descontado una sola unidad.
           No se noto antes porque el que probaba el checkout estaba logueado con una
           cuenta de admin, que si tiene permiso: andaba para nosotros dos y para
           nadie mas.
           Ahora el descuento real lo hace descontarStockPedido() en Cloud Functions
           con el Admin SDK, que ademas puede validar los precios contra el catalogo.
           Aca queda solo el aviso temprano de faltantes, que es cortesia y no
           control: leer productos si esta permitido. */
        let pedidoNum=null;
        const cntRef=db.collection('config').doc('pedidosCount');
        let _faltante=null;

        if(PEDIDOS.descontarStock){
            const porProd={};
            carrito.forEach(i=>{porProd[i.id]=(porProd[i.id]||0)+i.cantidad;});
            const ids=Object.keys(porProd);
            try{
                const snaps=await Promise.all(ids.map(id=>db.collection('productos').doc(id).get()));
                /* Se aprovecha esta misma lectura fresca para comparar tambien el PRECIO.
                   `productos` se baja una sola vez al cargar la pagina y el carrito vive en
                   localStorage: el cliente que deja la pestaña abierta a la mañana y confirma
                   a la tarde compraba a los precios de la mañana, y como el pedido quedaba
                   internamente consistente nadie se enteraba de que el comercio cobro de
                   menos. Si algun precio cambio se actualiza el carrito y se corta, para que
                   el cliente vea el total nuevo ANTES de confirmar. */
                const _cambios=[];
                for(let k=0;k<ids.length;k++){
                    if(!snaps[k].exists)continue;
                    const prod=snaps[k].data(),disp=Number(prod.stock||0);
                    if(disp<porProd[ids[k]]){
                        _faltante={nombre:prod.nombreMostrado||prod.nombre||'un producto',disponible:disp};
                        break;
                    }
                    const _enCarrito=carrito.find(x=>x.id===ids[k]);
                    const _pfFresco=precioFinal({precio:Number(prod.precio||0),descuento:Number(prod.descuento||0)});
                    if(_enCarrito&&_pfFresco!==Number(_enCarrito.precio||0)){
                        _cambios.push({id:ids[k],nombre:prod.nombreMostrado||prod.nombre||'un producto',precio:_pfFresco,precioOriginal:Number(prod.precio||0),descuento:Math.min(100,Math.max(0,Number(prod.descuento||0)))});
                    }
                }
                if(!_faltante&&_cambios.length){
                    const _porId={};_cambios.forEach(c=>{_porId[c.id]=c;});
                    carrito=carrito.map(it=>_porId[it.id]?{...it,precio:_porId[it.id].precio,precioOriginal:_porId[it.id].precioOriginal,descuento:_porId[it.id].descuento}:it);
                    saveCart();updateCartUI();updateCheckoutResumen();
                    showToast('El precio de "'+_cambios[0].nombre+'" cambio'+(_cambios.length>1?' (y '+(_cambios.length-1)+' mas)':'')+'. Actualizamos el carrito, revisa el total antes de confirmar.','error');
                    const b=document.getElementById('chkConfirmBtn');
                    if(b){b.disabled=false;b.innerHTML='Confirmar pedido';}
                    return;
                }
            }catch(e){
                /* Si no se pudo leer, se sigue: quien decide de verdad es el servidor */
                console.warn('No se pudo verificar el stock antes de confirmar:',e);
            }
            if(_faltante){
                showToast('Nos quedamos sin stock de "'+_faltante.nombre+'" (quedan '+_faltante.disponible+'). Revisa el carrito.','error');
                loadProductsFromFirebase();
                const b=document.getElementById('chkConfirmBtn');
                if(b){b.disabled=false;b.innerHTML='Confirmar pedido';}
                return;
            }
        }

        /* El numero sale de config/pedidosCount, que las reglas SI le permiten
           escribir a un usuario logueado. Va en transaccion para que dos pedidos
           simultaneos no saquen el mismo numero. */
        try{
            pedidoNum=await db.runTransaction(async t=>{
                const snapCnt=await t.get(cntRef);
                const next=(snapCnt.exists?(parseInt(snapCnt.data().count)||0):0)+1;
                t.set(cntRef,{count:next});
                return next;
            });
        }catch(e){
            /* Antes esto seguia de largo y guardaba el pedido como N°1, pisando el
               numero del primer pedido real. Un pedido con un numero que miente es
               peor que un pedido que no se hizo: frenamos y avisamos. */
            console.error('No se pudo numerar el pedido:',e);
            showToast('No pudimos confirmar el pedido. Proba de nuevo en un momento.','error');
            const b=document.getElementById('chkConfirmBtn');
            if(b){b.disabled=false;b.innerHTML='Confirmar pedido';}
            return;
        }

        /* Crear pedido en BDD (NO se toca la coleccion clientes desde la web) */
        const pedido={
            numero:pedidoNum,
            estado:'pendiente',
            cliente:clienteNombreCompleto,
            /* El uid sale de Auth y no de clienteAuth. clienteAuth se arma leyendo
               /clientesAuth y puede quedar en null si esa lectura falla; el pedido se
               guardaba entonces con clienteAuthUid:null, y ese pedido no aparece nunca
               en "Mis Pedidos" del cliente ni lo puede contar rateLimitPedidos, que
               corta con `if (!uid) return`. Se lee firebase.auth() en vez de la
               constante authClient a proposito: authClient se declara con const mas
               abajo en este mismo archivo, y si algo revienta antes queda en zona
               muerta y tirar aca seria peor.
               Ademas firestore.rules ahora exige que este campo sea el uid de quien
               escribe, asi que tiene que salir de la misma fuente que mira la regla. */
            clienteAuthUid:(firebase.auth().currentUser&&firebase.auth().currentUser.uid)||(clienteAuth?clienteAuth.uid:null),
            clienteEmail:clienteAuth?clienteAuth.email:null,
            clienteId:clienteAuth?clienteAuth.clienteId:null,
            telefono:telefonoLimpio,
            direccion:tipoEntrega==='envio'?direccion:null,
            notas:notas||null,
            tipoEntrega:tipoEntrega,
            /* Lo pone en true descontarStockPedido() cuando descuenta de verdad.
               Nace en false a proposito: si la funcion no llega a correr, el panel
               tiene que descontar al convertirlo en venta, no dar por hecho que ya
               esta hecho. */
            stockDescontado:false,
            items:carrito.map(i=>({id:i.id,nombre:i.nombre,tipoVenta:i.tipoVenta||'unidad',precio:i.precio,precioOriginal:i.precioOriginal||i.precio,descuento:i.descuento||0,cantidad:i.cantidad,subtotal:subtotalCarrito(i)})),
            subtotalProductos:subtotal,
            envio:envio,
            envioGratis:tipoEntrega==='envio'&&envio===0,
            total:total,
            cupon:_cuponAplicado?{codigo:_cuponAplicado.codigo,monto:dcMonto}:null,
            origen:'web',
            creadoEn:firebase.firestore.FieldValue.serverTimestamp()
        };
        let _pedidoGuardado=true;
        try{
            await db.collection('pedidos').add(pedido);
        }catch(e){
            _pedidoGuardado=false;
            /* Si falla el guardado (billing, red, reglas), NO frenar: el pedido por WhatsApp es lo importante */
            console.warn('No se pudo guardar el pedido en BDD, se continua con WhatsApp:',e);
        }
        /* Construir mensaje de WhatsApp con el numero de pedido */
        /* Un solo formato para todo el sistema, definido en config-negocio.js. Aca
           decia 3 digitos y en Mis Pedidos 6: el mismo pedido tenia dos nombres. */
        const numeroFmt=(typeof NEGOCIO!=='undefined'&&NEGOCIO.nroPedido)
            ?NEGOCIO.nroPedido(pedidoNum).slice(1)
            :String(pedidoNum).padStart(5,'0');
        let msg='Hola! *Pedido confirmado N°'+numeroFmt+'*\n\n';
        msg+='*Cliente:* '+clienteNombreCompleto+'\n';
        msg+='*Tel:* '+telefonoLimpio+'\n';
        msg+='*Entrega:* '+(tipoEntrega==='retiro'?'Retiro en local':'Envío a domicilio')+'\n';
        if(tipoEntrega==='envio'&&direccion)msg+='*Dirección:* '+direccion+'\n';
        if(_cuponAplicado)msg+='*Cupón:* '+_cuponAplicado.codigo+' (-$'+dcMonto.toLocaleString('es-AR')+')\n';
        if(notas)msg+='*Notas:* '+notas+'\n';
        /* El detalle va SIEMPRE. Este mensaje es el respaldo si el pedido no llega a
           guardarse en la base, y sin los productos ni el total no alcanza para armar
           nada: el comercio recibia un aviso de que alguien compro algo, sin saber que. */
        msg+='\n*Pedido:*\n';
        carrito.forEach(i=>{msg+='- '+(esPesoProd(i)?fmtGramos(i.cantidad)+' de ':i.cantidad+'x ')+i.nombre+' = $'+subtotalCarrito(i).toLocaleString('es-AR')+'\n';});
        msg+='\nSubtotal: $'+subtotal.toLocaleString('es-AR')+'\n';
        if(dcMonto)msg+='Cupon '+_cuponAplicado.codigo+': -$'+dcMonto.toLocaleString('es-AR')+'\n';
        if(tipoEntrega==='envio')msg+='Envio: '+(envio?('$'+envio.toLocaleString('es-AR')):'gratis')+'\n';
        msg+='*TOTAL: $'+total.toLocaleString('es-AR')+'*';
        msg+='\n\nGracias!';
        /* Limpiar carrito y resetear las cards de productos */
        const idsAResetear=carrito.map(i=>i.id);
        carrito=[];saveCart();updateCartUI();
        idsAResetear.forEach(id=>updateProductCard(id));
        closeCheckoutModal();closeCart();
        (_pedidoGuardado
            ? showToast('Pedido N'+String.fromCharCode(176)+numeroFmt+' confirmado','success')
            /* No entro al sistema: el comercio lo va a ver solo por WhatsApp, y el
               cliente tiene que saberlo para no quedarse esperando. */
            : showToast('Te abrimos WhatsApp con el pedido. Envialo para confirmarlo.','error'));
        /* Registrar uso del cupón ANTES de abrir WhatsApp (en móvil location.href corta la ejecución del código que sigue) */
        if (_cuponAplicado) {
            try {
                const cuponId = _cuponAplicado.id || (await db.collection('cupones').where('codigo','==',_cuponAplicado.codigo).get()).docs[0]?.id;
                if (cuponId) {
                    /* Verificaciones finales con datos frescos de la BDD */
                    let puedeUsar = true;
                    /* 1. Máximo de usos global (lee el cupón actualizado) */
                    try {
                        const cupFresh = await db.collection('cupones').doc(cuponId).get();
                        if (cupFresh.exists) {
                            const cd = cupFresh.data();
                            if (cd.activo === false) puedeUsar = false;
                            if (cd.maxUsos && (parseInt(cd.usos||0) >= parseInt(cd.maxUsos))) puedeUsar = false;
                        }
                    } catch(e) {}
                    /* 2. Que este cliente no lo haya usado ya (por cuponId, no por código) */
                    if (puedeUsar && clienteAuth) {
                        const chk = await db.collection('cuponesUsos').where('cuponId','==',cuponId).where('uid','==',clienteAuth.uid).get();
                        if (!chk.empty) puedeUsar = false;
                    }
                    if (puedeUsar) {
                        const usoData = {
                            cuponId: cuponId,
                            codigo: _cuponAplicado.codigo,
                            fecha: firebase.firestore.FieldValue.serverTimestamp(),
                            pedidoNum: pedidoNum
                        };
                        if (clienteAuth) { usoData.uid = clienteAuth.uid; usoData.email = clienteAuth.email; }
                        else if (nombre && apellido) { usoData.nombreCliente = nombre+' '+apellido; usoData.telefono = telefono; }
                        await db.collection('cuponesUsos').doc().set(usoData);
                    }
                }
            } catch(e) { console.warn('Error registrando uso de cupón:', e); }
        }
        /* Abrir WhatsApp - en móvil location.href, en desktop nueva pestaña */
        const waUrl='https://wa.me/'+WHATSAPP_NUMBER+'?text='+encodeURIComponent(msg);
        const esMovil=/iPad|iPhone|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if(esMovil){window.location.href=waUrl;}else{window.open(waUrl,'_blank');}
    }catch(e){
        console.error('Error en checkout:',e);
        showToast('Error: '+(e.message||'No se pudo confirmar'),'error');
        btn.disabled=false;btn.innerHTML='<i class="bi bi-whatsapp"></i> Confirmar pedido y enviar por WhatsApp';
    }
}

function showToast(message,type){type=type||'info';const c=document.getElementById('toastContainer');if(!c)return;const icons={success:'bi-check-circle-fill',error:'bi-exclamation-circle-fill',info:'bi-info-circle-fill'};const t=document.createElement('div');t.className='toast '+type;t.innerHTML='<i class="toast-icon bi '+(icons[type]||icons.info)+'"></i><span class="toast-message">'+message+'</span>';c.appendChild(t);setTimeout(()=>{t.classList.add('removing');setTimeout(()=>t.remove(),300);},3000);}

/* Revelado al entrar en pantalla. A diferencia de antes, ahora TAMBIEN corre en
   movil: es IntersectionObserver + transform/opacity, de lo mas barato que hay, y
   es justo donde mas se nota que la pagina esta viva.
   Las clases se agregan por JS, asi que si esto falla no se oculta nada. */
const _REVELAR = '.feature-card,.service-card,.product-card,.review-card,' +
                 '.why-us-content,.trust-badge,.section-header>*,.cta-content>*,' +
                 '.products-toolbar,.footer-brand,.footer-title';
function initScrollAnimations(){
    if(window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;
    if(!('IntersectionObserver' in window)) return;
    const obs = new IntersectionObserver(entradas => {
        entradas.forEach(e => {
            if(!e.isIntersecting) return;
            e.target.classList.add('visible');
            /* soltamos will-change cuando termina, para no dejar capas vivas */
            setTimeout(() => e.target.classList.add('listo'), 700);
            obs.unobserve(e.target);
        });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    revelar(document, obs);
    window._revealObs = obs;
    /* Red de seguridad: si el observer no llega a disparar (navegador raro, la
       pestana quedo en segundo plano al cargar), a los 3 segundos mostramos todo.
       Nunca dejar contenido invisible por una animacion. */
    setTimeout(() => {
        document.querySelectorAll('.reveal:not(.visible)').forEach(el => el.classList.add('visible','listo'));
    }, 3000);
}
/* Marca y observa. El escalonado se calcula por posicion dentro del grupo, tope
   de 5 para que el ultimo de una grilla larga no espere una eternidad. */
function revelar(raiz, obs){
    obs = obs || window._revealObs; if(!obs) return;
    raiz.querySelectorAll(_REVELAR).forEach(el => {
        if(el.classList.contains('reveal')) return;
        el.classList.add('reveal');
        const hermanos = el.parentElement ? [...el.parentElement.children] : [];
        const i = Math.min(hermanos.indexOf(el), 5);
        if(i > 0) el.style.transitionDelay = (i * 0.07) + 's';
        obs.observe(el);
    });
}

function toggleCategoryFilters(){const f=document.getElementById('categoryFilters');const btn=document.getElementById('toggleCatsBtn');f.classList.toggle('cat-hidden');if(f.classList.contains('cat-hidden')){btn.innerHTML='<i class="bi bi-funnel"></i> Categorias';}else{btn.innerHTML='<i class="bi bi-funnel-fill"></i> Categorias';}}

window.filterByCategory=filterByCategory;window.filterBySubCategory=filterBySubCategory;window.updateProductQuantity=updateProductQuantity;window.addToCart=addToCart;window.updateCartItemQuantity=updateCartItemQuantity;window.removeFromCart=removeFromCart;window.onSearchInput=onSearchInput;window.toggleSortPrice=toggleSortPrice;window.toggleSortAlfa=toggleSortAlfa;window.goToPage=goToPage;window.toggleCategoryFilters=toggleCategoryFilters;window.openProductDetailModal=openProductDetailModal;window.closeProductDetailModal=closeProductDetailModal;window.pdmCarouselNav=pdmCarouselNav;window.pdmCarouselGoTo=pdmCarouselGoTo;window.refreshProductDetailModal=refreshProductDetailModal;window.clearCart=clearCart;window.openCheckoutModal=openCheckoutModal;window.closeCheckoutModal=closeCheckoutModal;window.setCheckoutEntrega=setCheckoutEntrega;window.confirmCheckout=confirmCheckout;window.onSelectDireccion=onSelectDireccion;window.aplicarCupon=aplicarCupon;window.quitarCupon=quitarCupon;window.authLogin=authLogin;window.onMobilePersonaClick=onMobilePersonaClick;window.authLogout=authLogout;window.toggleUserMenu=toggleUserMenu;window.closeUserMenu=closeUserMenu;window.guardarDatosCliente=guardarDatosCliente;window.openPerfilModal=openPerfilModal;window.closePerfilModal=closePerfilModal;window.switchPerfilTab=switchPerfilTab;window.guardarPerfil=guardarPerfil;window.mostrarFormDir=mostrarFormDir;window.cancelarFormDir=cancelarFormDir;window.guardarDireccion=guardarDireccion;window.eliminarDireccion=eliminarDireccion;window.openHistorialModal=openHistorialModal;window.closeHistorialModal=closeHistorialModal;window.filterHistPedidos=filterHistPedidos;window.repetirPedido=repetirPedido;

// Cargar contenido editable desde Firestore
/* Los textos e imagenes de la tienda viven en Firestore y pisan a los del HTML.
   Traerlos tarda, asi que en la primera carga se ve un instante el texto de
   fabrica y despues cambia solo: un parpadeo feo con CUALQUIER texto que el
   comercio personalice, no solo con uno.
   Se guarda la ultima version conocida y se aplica al instante; despues llega la
   de Firestore y normalmente es identica, asi que no se ve ningun salto.
   Solo hay contenido publico aca dentro: ningun dato de cliente. */
const _SC_CACHE = 'brotes_siteContent';
/**
 * Una URL de imagen de verdad, no cualquier cosa que empiece con http.
 * ---------------------------------------------------------------------------
 * En config/siteContent quedaron guardados heroImg y ctaImg apuntando a
 * "https://<dominio>/admin": basura de la epoca en que guardar el Editor Web leia
 * el src de un <img> vacio, y un src vacio resuelve a la URL de la PROPIA pagina.
 * El bug de escritura ya esta arreglado, pero el valor malo sigue en la base, y
 * un `startsWith('http')` lo acepta igual. Consecuencia hoy, en produccion: el
 * navegador se descarga el panel de administracion TRES veces (~208 KB, el pedazo
 * mas grande de la pagina) para intentar usar un documento HTML como foto de
 * fondo, y el cliente ve el hero sin imagen.
 *
 * Se valida en la tienda y no se limpia la base a mano para que quede curado para
 * todos los visitantes en el momento del deploy, y tambien contra lo que se
 * escriba mal en el futuro, venga de donde venga.
 */
function esUrlImagen(u) {
    if (!u || typeof u !== 'string') return false;
    var v = u.trim();
    if (!v) return false;
    /* Un archivo del propio repo. Relativo a proposito: sirve en cualquier dominio. */
    if (/^\.?\/?img\//i.test(v)) return true;
    if (!/^https?:\/\//i.test(v)) return false;
    /* Lo que sube el Editor Web va a Firebase Storage. */
    if (/(firebasestorage\.googleapis\.com|\.firebasestorage\.app|storage\.googleapis\.com)/i.test(v)) return true;
    /* O al menos que el path termine en un archivo de imagen. Descarta "/admin". */
    return /\.(jpe?g|png|webp|avif|gif|svg)(\?|#|$)/i.test(v);
}

/**
 * Un logo SUBIDO desde el Editor Web: vive en Firebase Storage.
 * ---------------------------------------------------------------------------
 * Los tres logos existen en dos lados a la vez: como archivo del repo (que es lo
 * que dice el HTML) y como valor en config/siteContent. Mientras el valor
 * guardado sea un puntero a un archivo del repo, no agrega NADA —muestra el mismo
 * archivo que el HTML— y en cambio se queda viejo solo: el dia que el archivo del
 * repo cambia de nombre o de formato, el puntero sigue apuntando al anterior y el
 * logo se rompe en produccion.
 *
 * Paso exactamente eso al cambiar la marca: siteContent tenia guardado
 * ".../img/logo-brotes-dark.svg", un archivo que ya no existe, y pisaba al PNG
 * nuevo que el HTML traia bien.
 *
 * Asi que el puntero al repo se ignora y manda el HTML, que es el que se
 * actualiza junto con los archivos. Firestore solo pisa cuando el comercio subio
 * un logo de verdad, que es para lo que esta el campo.
 */
function esSubidaDelPanel(u) {
    if (!esUrlImagen(u)) return false;
    return /(firebasestorage\.googleapis\.com|\.firebasestorage\.app|storage\.googleapis\.com)/i.test(u);
}

/**
 * Un logo del repo guardado con URL absoluta del dominio de hoy deja de cargar el
 * dia que el cliente se muda a su propio dominio. Se pasa a ruta relativa, que
 * muestra exactamente el mismo archivo y sobrevive a la mudanza.
 */
function urlImagenPortable(u) {
    if (!esUrlImagen(u)) return null;
    try {
        var p = new URL(u, location.href);
        if (p.origin === location.origin && /^\/img\//i.test(p.pathname)) return p.pathname.slice(1);
    } catch (e) { /* no era una URL absoluta: se deja como vino */ }
    return u;
}

function _aplicarSiteContent(d){ if(!d) return;const s=(id,val)=>{const el=document.querySelector(id);if(el&&val)el.textContent=val;};s('.hero-badge span',d.heroBadge);const tl=document.querySelectorAll('.title-line');if(tl[0]&&d.heroTitle1)tl[0].textContent=d.heroTitle1;const th=document.querySelectorAll('.title-highlight');if(th[0]&&d.heroTitle2)th[0].textContent=d.heroTitle2;s('.hero-subtitle',d.heroSubtitle);const stats=document.querySelectorAll('.stat-item');if(stats[0]&&d.stat1Num){stats[0].querySelector('.stat-number').textContent=d.stat1Num;stats[0].querySelector('.stat-label').textContent=d.stat1Label||'';}if(stats[1]&&d.stat2Num){stats[1].querySelector('.stat-number').textContent=d.stat2Num;stats[1].querySelector('.stat-label').textContent=d.stat2Label||'';}s('.why-us-section .section-tag',d.nosotrosTag);s('.why-us-section .section-title',d.nosotrosTitulo);s('.why-us-text',d.nosotrosTexto);const badges=document.querySelectorAll('.trust-badge span');if(badges[0]&&d.badge1)badges[0].textContent=d.badge1;if(badges[1]&&d.badge2)badges[1].textContent=d.badge2;const cards=document.querySelectorAll('.feature-card');if(cards[0]){if(d.card1t)cards[0].querySelector('h4').textContent=d.card1t;if(d.card1p)cards[0].querySelector('p').textContent=d.card1p;}if(cards[1]){if(d.card2t)cards[1].querySelector('h4').textContent=d.card2t;if(d.card2p)cards[1].querySelector('p').textContent=d.card2p;}if(cards[2]){if(d.card3t)cards[2].querySelector('h4').textContent=d.card3t;if(d.card3p)cards[2].querySelector('p').textContent=d.card3p;}if(cards[3]){if(d.card4t)cards[3].querySelector('h4').textContent=d.card4t;if(d.card4p)cards[3].querySelector('p').textContent=d.card4p;}s('.cta-title',d.ctaTitulo);s('.cta-text',d.ctaTexto);s('.footer-description',d.footerDesc);if(d.instagram){const ig=document.querySelector('.social-links a[aria-label="Instagram"]');if(ig)ig.href=d.instagram;}if(d.whatsapp){const _num=String(d.whatsapp).replace(/[^0-9]/g,'');if(_num.length>=8){/* El mismo numero para los botones Y para el pedido: si divergen, el comercio ve los botones bien y no le entran las ventas. */WHATSAPP_NUMBER=_num;const wa=document.querySelectorAll('a[href*="wa.me"]:not(.wa-dev)');wa.forEach(a=>{a.href=a.href.replace(/wa\.me\/[0-9]+/,'wa.me/'+_num);});}}if(d.email){const em=document.querySelector('.social-links a[aria-label="Email"]');if(em)em.href='mailto:'+d.email;}/* El telefono que se muestra tambien sale del panel. Sin esto, cambiar el numero
   en el Editor Web arreglaba los links de WhatsApp pero el texto seguia mostrando el
   viejo: el cliente leia un numero y el boton lo mandaba a otro. */
if(d.telefonoDisplay){document.querySelectorAll('[data-negocio="telefonoDisplay"]').forEach(el=>{el.textContent=d.telefonoDisplay;});if(typeof NEGOCIO!=='undefined')NEGOCIO.telefonoDisplay=d.telefonoDisplay;}if(esUrlImagen(d.heroImg)){const ho=document.querySelector('.hero-overlay');if(ho){const heroOptim=optImg(d.heroImg,1600);const pre=new Image();pre.fetchPriority='high';pre.onload=()=>{ho.style.backgroundImage='url('+heroOptim+')';ho.style.backgroundSize='cover';ho.style.backgroundPosition='center';ho.style.opacity='0.45';};pre.onerror=()=>{ho.style.backgroundImage='url('+d.heroImg+')';ho.style.backgroundSize='cover';ho.style.backgroundPosition='center';ho.style.opacity='0.45';};pre.src=heroOptim;}}else{const ho=document.querySelector('.hero-overlay');if(ho)ho.style.opacity='0.45';}if(esUrlImagen(d.ctaImg)){const cta=document.querySelector('.cta-background');if(cta){const st=document.createElement('style');st.textContent='.cta-background::before{background-image:url('+d.ctaImg+')!important}';document.head.appendChild(st);}}if(esSubidaDelPanel(d.logoIcon)){const li=document.querySelector('.logo-img');if(li)li.src=d.logoIcon;}if(esSubidaDelPanel(d.logoText)){const lt=document.querySelector('.brand-text-img');if(lt)lt.src=d.logoText;}if(esSubidaDelPanel(d.logoFooter)){const lf=document.querySelector('.footer-brand img');if(lf)lf.src=d.logoFooter;}}
async function loadSiteContent(){
    try{ _aplicarSiteContent(JSON.parse(localStorage.getItem(_SC_CACHE)||'null')); }catch(e){}
    try{
        const snap=await db.collection('config').doc('siteContent').get();
        if(!snap.exists)return;
        const d=snap.data();
        _aplicarSiteContent(d);
        try{ localStorage.setItem(_SC_CACHE, JSON.stringify(d)); }catch(e){}
    }catch(e){ console.log('Site content not loaded:',e); }
}
loadSiteContent();

// === REVIEWS ===
let allReviewsIndex=[];let rvFilter='all';let rvPage=0;
async function loadReviews(){
    const grid=document.getElementById('reviewsGrid');if(!grid)return;
    try{
        const snap=await db.collection('resenas').orderBy('fecha','desc').limit(50).get();
        allReviewsIndex=snap.docs.filter(d=>{const r=d.data();return r.visible===true&&r.usado===true;}).map(d=>{const r=d.data();return{...r,fecha:r.fecha&&r.fecha.toDate?r.fecha.toDate():new Date()};});
        const filtersEl=document.getElementById('reviewsFilters');
        if(filtersEl)filtersEl.style.display=allReviewsIndex.length>0?'flex':'none';
        rvPage=0;renderReviewsIndex();
    }catch(e){console.error('Reviews error:',e);grid.innerHTML='';}
}
function filterReviews(f){
    rvFilter=f;rvPage=0;
    document.querySelectorAll('.rv-filter-btn').forEach(b=>b.classList.remove('active'));
    event.target.classList.add('active');
    renderReviewsIndex();
}
window.filterReviews=filterReviews;
function rvGoPage(p){rvPage=p;renderReviewsIndex();document.getElementById('resenas').scrollIntoView({behavior:'smooth'});}
window.rvGoPage=rvGoPage;
function renderReviewsIndex(){
    const grid=document.getElementById('reviewsGrid');if(!grid)return;
    let items=allReviewsIndex;
    if(rvFilter==='positive')items=items.filter(r=>(r.estrellas||0)>=3);
    else if(rvFilter==='negative')items=items.filter(r=>(r.estrellas||0)<=2);
    else if(typeof rvFilter==='number')items=items.filter(r=>(r.estrellas||0)===rvFilter);
    const isMobile=window.innerWidth<=768;
    const perPage=isMobile?4:10;
    const pages=Math.ceil(items.length/perPage)||1;
    if(rvPage>=pages)rvPage=pages-1;
    const shown=items.slice(rvPage*perPage,(rvPage+1)*perPage);
    if(!shown.length){grid.innerHTML='<div style="text-align:center;padding:2rem;color:#999;grid-column:1/-1"><p>'+(rvFilter==='all'?'Aun no hay opiniones.':'No hay opiniones con este filtro.')+'</p></div>';document.getElementById('reviewsPager').innerHTML='';return;}
    grid.innerHTML=shown.map(r=>{
        const stars='&#9733;'.repeat(r.estrellas||0)+'&#9734;'.repeat(5-(r.estrellas||0));
        const fecha=r.fecha.toLocaleDateString('es-AR');
        const hora=r.fecha.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
        return '<div class="review-card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.3rem"><div class="review-stars">'+stars+'</div><span class="review-date">'+fecha+' '+hora+'</span></div><div class="review-text">"'+esc(r.comentario||'')+'"</div><div class="review-author">'+esc(r.nombre||'')+'</div></div>';
    }).join('');
    const pg=document.getElementById('reviewsPager');
    if(pages>1){pg.innerHTML='<button onclick="rvGoPage('+(rvPage-1)+')" style="padding:0.4rem 1rem;border:1px solid #ccc;border-radius:8px;background:white;cursor:pointer"'+(rvPage===0?' disabled':'')+'>Ant</button><span style="padding:0.4rem 0.5rem;font-size:0.85rem;color:#666">'+(rvPage+1)+'/'+pages+'</span><button onclick="rvGoPage('+(rvPage+1)+')" style="padding:0.4rem 1rem;border:1px solid #ccc;border-radius:8px;background:white;cursor:pointer"'+(rvPage>=pages-1?' disabled':'')+'>Sig</button>';}else{pg.innerHTML='';}
}
loadReviews();


/* ===== AUTH CLIENTES ===== */
const authClient = firebase.auth();

/* Refresh del estado de auth cuando el DOM esté listo. SOLO redibuja el nav: ya no
   vuelve a llamar a _onUserLogin. Este era el cuarto llamador, compitiendo con los
   otros tres; onAuthStateChanged se dispara igual al cargar si hay sesion, asi que
   este bloque nunca hizo falta para cargar los datos. (En YERCO no existe.) */
document.addEventListener('DOMContentLoaded', function() {
    const user = authClient.currentUser;
    if (user) _updateNavAuth(user);
});
let clienteAuth = null; // datos del cliente en Firestore
let _pedidosListener = null;

/* Detectar mobile (iOS, Android, cualquier browser móvil) */
const _isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const _isMobileAuth = _isIOS || /Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

/* Inicializar auth.

   ESTE BLOQUE ES EL DE YERCO, PORTADO TAL CUAL, y el orden importa.

   Antes, en Brotes, _onUserLogin lo llamaban CUATRO lugares: el DOMContentLoaded de
   arriba, el .then de getRedirectResult, el .then de signInWithPopup, y este
   onAuthStateChanged. Firebase avisa la misma sesion por varios de esos caminos a la
   vez, asi que se pisaban entre ellos. La tanda 2 le puso un candado por uid adentro
   de _onUserLogin para sobrevivir a eso; el candado se deja, pero ahora hay UN solo
   llamador y el candado pasa a ser red de seguridad en vez de la unica defensa.

   Ahora, igual que YERCO:
     1) setPersistence PRIMERO;
     2) onAuthStateChanged es la unica fuente de verdad -se dispara al cargar si hay
        sesion, despues del popup, y al volver de un redirect-, con un guarda de
        reentrada y otro de "mismo uid ya procesado";
     3) getRedirectResult NO inicia sesion: solo detecta que volvimos de un redirect
        para reabrir el carrito. */
let _loginActivo = sessionStorage.getItem('_authLoginActivo') === '1';
let _authProcesando = false;      /* evita ejecuciones concurrentes de _onUserLogin */
let _ultimoUidProcesado = null;   /* evita reprocesar el mismo usuario */

/* 1) Persistencia LOCAL primero: la sesion sobrevive a recargas y cierres del navegador */
authClient.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .catch(e => console.error('setPersistence error:', e));

/* 2) La UNICA fuente de verdad del login */
authClient.onAuthStateChanged(async user => {
    if (user) {
        if (_authProcesando) return;
        if (_ultimoUidProcesado === user.uid && clienteAuth) {
            _updateNavAuth(user);
            return;
        }
        _authProcesando = true;
        const wasActive = _loginActivo;
        _loginActivo = false;
        sessionStorage.removeItem('_authLoginActivo');
        try {
            await _onUserLogin(user, wasActive);
            _ultimoUidProcesado = user.uid;
        } catch (e) {
            /* Sin este catch, una excepcion dejaba _authProcesando en true para
               siempre y ningun login posterior volvia a procesarse. */
            console.error('_onUserLogin error:', e);
        } finally {
            _authProcesando = false;
        }
    } else {
        _ultimoUidProcesado = null;
        _onUserLogout();
    }
});

/* 3) getRedirectResult: SOLO para saber que volvimos de un redirect y reabrir el
   carrito si la persona estaba intentando comprar. El login lo hace onAuthStateChanged. */
authClient.getRedirectResult().then(result => {
    if (result && result.user) {
        if (sessionStorage.getItem('_intentoCompra') === '1') {
            sessionStorage.removeItem('_intentoCompra');
            setTimeout(() => { if (carrito.length > 0 && typeof openCart === 'function') openCart(); }, 1000);
        }
    }
}).catch(e => { console.error('getRedirectResult error:', e); });

/* Google ya nos dice como se llama la persona: displayName viene en el mismo objeto
   `user` y de hecho se usa mas abajo para las iniciales del avatar. Pero el alta lo
   guardaba en blanco, asi que en el panel el cliente quedaba como "Sin nombre /
   datos incompletos" para siempre si nunca completaba el modal — que solo aparece
   en el login ACTIVO, no al restaurar la sesion.
   Se parte por el primer espacio: lo que sigue es apellido. El telefono no lo da
   Google, asi que "datos incompletos" se mantiene hasta que lo carguen, que es lo
   correcto.
   Los topes son los de firestore.rules (80 por campo): un displayName largo hacia
   que el alta entera se rechazara y el cliente quedaba sin documento.
   NOTA: en YERCO esto quedo en linea dentro de _onUserLogin. Aca es una funcion
   aparte para que las pruebas puedan ejecutarla; si se portan cambios entre los dos
   repos, es la unica diferencia. */
function _nombreDesdeGoogle(displayName) {
    const dn = String(displayName || '').trim().replace(/\s+/g, ' ');
    const corte = dn.indexOf(' ');
    return {
        nombre: (corte > 0 ? dn.slice(0, corte) : dn).slice(0, 80),
        apellido: (corte > 0 ? dn.slice(corte + 1) : '').slice(0, 80)
    };
}

/* Firebase avisa la MISMA sesión por DOS caminos y los dos estaban enganchados sin
   ningún candado: onAuthStateChanged y el .then de signInWithPopup (en móvil,
   getRedirectResult). Las dos corridas hacían ref.get(), las dos veían que el
   documento no existe, y las dos llamaban a ref.set(). El segundo set cae sobre un
   documento que YA existe, así que las reglas lo evalúan como UPDATE —que sólo deja
   tocar nombre/apellido/teléfono/direcciones— y devuelven permission-denied.
   Medido en el emulador: pruebas/reglas-cliente.js, "el segundo set del mismo login
   se evalúa como update y muere".
   Como ese set no estaba en try/catch, esa corrida moría ahí: no llegaba ni al modal
   de datos ni a _refreshCheckoutAuth. Y además se consumían DOS clienteId para el
   mismo cliente, dejando un hueco en la numeración.
   Pasa una sola vez por cliente, en su primer login. Por eso nunca se vio probando
   con una cuenta de admin: su documento ya existía hacía meses. */
let _loginEnCurso = null, _loginEnCursoUid = null, _loginPideModal = false;
function _onUserLogin(user, showModal=false) {
    /* El aviso que pide el modal puede ser justo el que se descarta. El pedido se
       guarda aparte para que la corrida que sí sigue lo tenga en cuenta. */
    if (showModal) _loginPideModal = true;
    if (_loginEnCurso && _loginEnCursoUid === user.uid) return _loginEnCurso;
    _loginEnCursoUid = user.uid;
    _loginEnCurso = _onUserLoginReal(user)
        .catch(e => { console.error('No se pudo cargar la sesión del cliente:', e); })
        .finally(() => { _loginEnCurso = null; _loginEnCursoUid = null; _loginPideModal = false; });
    return _loginEnCurso;
}

async function _onUserLoginReal(user) {
    /* Mostrar avatar inmediatamente mientras carga Firestore */
    _updateNavAuth(user);
    /* checkout se refresca al final, después de cargar Firestore */
    /* Cargar o crear doc en clientesAuth */
    const ref = db.collection('clientesAuth').doc(user.uid);
    const snap = await ref.get();
    if (!snap.exists) {
        /* Asignar ID de cliente incremental */
        let clienteId = 1;
        try {
            const cntRef = db.collection('config').doc('clientesAuthCount');
            await db.runTransaction(async t => {
                const s = await t.get(cntRef);
                clienteId = (s.exists ? (parseInt(s.data().count) || 0) : 0) + 1;
                t.set(cntRef, { count: clienteId });
            });
        } catch(e) { console.warn('clienteId error:', e); }
        /* Nuevo cliente — crear doc básico */
        const _quien = _nombreDesdeGoogle(user.displayName);
        try {
            await ref.set({
                email: user.email,
                nombre: _quien.nombre,
                apellido: _quien.apellido,
                telefono: '',
                direcciones: [],
                clienteId: clienteId,
                creadoEn: firebase.firestore.FieldValue.serverTimestamp()
            });
            clienteAuth = { uid: user.uid, email: user.email, nombre: _quien.nombre, apellido: _quien.apellido, telefono: '', direcciones: [], clienteId };
        } catch(e) {
            /* Red de seguridad para la carrera que el candado no cubre: dos pestañas
               abiertas, u otro dispositivo creando el documento entre nuestro get y
               nuestro set. Las reglas rechazan ese segundo set porque lo ven como
               update. En vez de morir, nos quedamos con lo que quedó guardado. */
            const fresco = await ref.get();
            if (!fresco.exists) throw e;
            console.warn('El documento del cliente ya existía; se usa el guardado.');
            clienteAuth = { uid: user.uid, ...fresco.data(), clienteId: fresco.data().clienteId || null };
        }
    } else {
        clienteAuth = { uid: user.uid, ...snap.data(), clienteId: snap.data().clienteId || null };
    }
    _updateNavAuth(user);
    /* Si faltan datos obligatorios Y fue un login activo, mostrar modal */
    if (_loginPideModal && (!clienteAuth.nombre || !clienteAuth.apellido || !clienteAuth.telefono)) {
        _showModalDatos();
    }
    /* Si el checkout estaba abierto, refrescar solo la parte de auth sin resetear el formulario */
    if (document.getElementById('checkoutModal')?.classList.contains('show')) {
        _refreshCheckoutAuth();
    }
}

function _refreshCheckoutAuth() {
    const loginRequired = document.getElementById('chkLoginRequired');
    const datosSection = document.getElementById('chkDatosSection');
    const confirmBtn = document.getElementById('chkConfirmBtn');
    /* El botón y los datos siempre visibles. El login solo pre-llena y oculta el aviso. */
    if (datosSection) datosSection.style.display = 'block';
    if (confirmBtn) confirmBtn.style.display = '';
    if (!clienteAuth) {
        if (loginRequired) loginRequired.style.display = 'block';
        return;
    }
    if (loginRequired) loginRequired.style.display = 'none';
    /* Pre-llenar solo si el campo está vacío (no pisar lo que el usuario escribió) */
    const n = document.getElementById('chkNombre');
    const a = document.getElementById('chkApellido');
    const t = document.getElementById('chkTelefono');
    if (n && !n.value) n.value = clienteAuth.nombre || '';
    if (a && !a.value) a.value = clienteAuth.apellido || '';
    if (t && !t.value) t.value = clienteAuth.telefono || '';
    /* Cargar direcciones guardadas */
    const dirs = clienteAuth.direcciones || [];
    const wrap = document.getElementById('chkDirGuardadasWrap');
    const sel = document.getElementById('chkDirSelect');
    const nuevaDirWrap = document.getElementById('chkNuevaDirWrap');
    const nomDirWrap = document.getElementById('chkNombreDirWrap');
    if (dirs.length) {
        sel.innerHTML = dirs.map((d,i) =>
            `<option value="${i}">${d.nombre} — ${d.texto}</option>`
        ).join('') + '<option value="nueva">+ Nueva dirección...</option>';
        if (wrap) wrap.style.display = 'block';
        if (nuevaDirWrap) nuevaDirWrap.style.display = 'none';
        /* Solo pre-seleccionar si no hay dirección ya elegida */
        if (!document.getElementById('chkDireccion').value) {
            document.getElementById('chkDireccion').value = dirs[0].texto;
            sel.value = '0';
        }
    } else {
        if (wrap) wrap.style.display = 'none';
        if (nuevaDirWrap) nuevaDirWrap.style.display = 'block';
        if (nomDirWrap) nomDirWrap.style.display = 'block';
    }
    updateCheckoutResumen();
}

function _onUserLogout() {
    clienteAuth = null;
    _updateNavAuth(null);
    if (_pedidosListener) { _pedidosListener(); _pedidosListener = null; }
}

function _updateNavAuth(user) {
    const authBtn = document.getElementById('authNavBtn');
    const loginBtn = document.getElementById('loginNavBtn');
    const loginBtnMobile = document.getElementById('loginNavBtnMobile');
    const userBtn = document.getElementById('userNavBtn');
    const initials = document.getElementById('avatarInitials');
    const udNombre = document.getElementById('udNombre');
    const udEmail = document.getElementById('udEmail');
    if (!authBtn) return;
    authBtn.style.display = 'flex';
    if (user) {
        loginBtn.style.display = 'none';
        if (loginBtnMobile){loginBtnMobile.style.display='none';loginBtnMobile.style.visibility='hidden';}
        userBtn.style.display = 'flex';
        const nombre = (clienteAuth && clienteAuth.nombre) || user.displayName || '';
        const apellido = (clienteAuth && clienteAuth.apellido) || '';
        initials.textContent = ((nombre[0] || '') + (apellido[0] || '')).toUpperCase() || user.email[0].toUpperCase();
        udNombre.textContent = (nombre + (apellido ? ' ' + apellido : '')) || user.email;
        udEmail.textContent = user.email;
    } else {
        loginBtn.style.display = 'flex';
        if (loginBtnMobile){loginBtnMobile.style.display='flex';loginBtnMobile.style.visibility='visible';}
        userBtn.style.display = 'none';
    }
}

function onMobilePersonaClick() {
    if (clienteAuth) { toggleUserMenu(); } else { authLogin(); }
}
/* Un login a la vez. Sin esto, un segundo clic -que es lo normal cuando el boton parece
   colgado- hace que Firebase rechace el PRIMER popup con auth/cancelled-popup-request, y
   el catch de abajo se lo tomaba como "el popup no es viable" y disparaba un redirect
   ENCIMA del segundo popup, que seguia vivo. */
let _authLoginEnCurso = false;
function authLogin() {
    if (_authLoginEnCurso) return;
    _authLoginEnCurso = true;
    try {
        _loginActivo = true;
        sessionStorage.setItem('_authLoginActivo', '1');
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('email');
        provider.addScope('profile');
        provider.setCustomParameters({ prompt: 'select_account' });
        /* POPUP-FIRST en TODOS los dispositivos, igual que YERCO.
           Antes, en movil, Brotes arrancaba directo con signInWithRedirect. El redirect
           depende de cookies de terceros -que Safari, Firefox y Chrome bloquean- y por eso
           es MENOS confiable que el popup, no mas. El redirect queda solo como fallback
           automatico cuando el popup no es viable. */
        firebase.auth().signInWithPopup(provider)
            .then(result => {
                /* NO se llama a _onUserLogin aca: onAuthStateChanged ya lo procesa cuando
                   el popup sale bien. Aca solo se deja la marca de que fue un login ACTIVO
                   (para que despues se abra el modal de datos) y se limpia la bandera. */
                if (result && result.user) {
                    _loginActivo = true;
                }
                _authLoginEnCurso = false;
                sessionStorage.removeItem('_authLoginActivo');
            })
            .catch(e => {
                console.error('popup error:', e.code, e.message);
                /* Errores donde el popup NUNCA llego a abrirse: ahi si conviene redirect.
                   Ojo con los dos que NO estan en esta lista, y por que:

                   - auth/cancelled-popup-request significa "otra peticion de popup dejo sin
                     efecto a esta", o sea que HAY OTRO POPUP VIVO. Disparar un redirect ahi
                     navega la pestaña de la tienda, le mata el `opener` al popup que sigue
                     abierto, y el popup queda en blanco para siempre sin nadie a quien
                     devolverle el resultado. Es exactamente lo que se vio: la tienda en el
                     selector de cuentas de Google y, al lado, un popup en la pantalla de
                     permisos que ya no le podia contestar a nadie.
                   - auth/popup-closed-by-user en ESCRITORIO es la persona cerrandolo a
                     proposito: no hay que secuestrarle la pagina por eso. En movil casi
                     siempre es el navegador bloqueandolo, y ahi si -ver esCierreEnMovil-. */
                const necesitaRedirect = [
                    'auth/popup-blocked',
                    'auth/operation-not-supported-in-this-environment',
                    'auth/web-storage-unsupported',
                    'auth/network-request-failed'
                ].includes(e.code);
                const esCierreEnMovil = e.code === 'auth/popup-closed-by-user' && _isMobileAuth;
                if (necesitaRedirect || esCierreEnMovil) {
                    /* El redirect se lleva la pagina entera: el candado ya no importa, pero
                       se suelta por si el propio redirect falla y volvemos aca. */
                    _authLoginEnCurso = false;
                    firebase.auth().signInWithRedirect(provider).catch(er => {
                        console.error('redirect error:', er);
                        showToast('No se pudo iniciar sesión. Probá con otro navegador.', 'error');
                        _loginActivo = false;
                        sessionStorage.removeItem('_authLoginActivo');
                    });
                    return;
                }
                if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/user-cancelled') {
                    showToast('Error al iniciar sesión: ' + (e.message || e.code), 'error');
                }
                _loginActivo = false;
                _authLoginEnCurso = false;
                sessionStorage.removeItem('_authLoginActivo');
            });
    } catch(e) {
        console.error('authLogin error:', e);
        _authLoginEnCurso = false;
        showToast('Error al iniciar sesión: ' + e.message, 'error');
        _loginActivo = false;
        sessionStorage.removeItem('_authLoginActivo');
    }
}

function authLogout() {
    authClient.signOut();
    closeUserMenu();
}

function toggleUserMenu() {
    document.getElementById('userDropdown').classList.toggle('open');
}

function closeUserMenu() {
    document.getElementById('userDropdown')?.classList.remove('open');
}

/* Cerrar dropdown al clickear fuera */
document.addEventListener('click', function(e) {
    const btn = document.getElementById('avatarNavBtn');
    const dd = document.getElementById('userDropdown');
    if (dd && btn && !btn.contains(e.target) && !dd.contains(e.target)) {
        dd.classList.remove('open');
    }
});

/* === MODAL COMPLETAR DATOS === */
function _showModalDatos() {
    const m = document.getElementById('modalCompletarDatos');
    if (!m) return;
    m.style.display = 'flex';
    if (clienteAuth) {
        document.getElementById('cdNombre').value = clienteAuth.nombre || '';
        document.getElementById('cdApellido').value = clienteAuth.apellido || '';
        document.getElementById('cdTelefono').value = clienteAuth.telefono || '';
    }
}

async function guardarDatosCliente() {
    const nombre = sanitizeText(document.getElementById('cdNombre').value, 80);
    const apellido = sanitizeText(document.getElementById('cdApellido').value, 80);
    const telefono = sanitizePhone(document.getElementById('cdTelefono').value);
    const err = document.getElementById('cdError');
    if (!nombre || !apellido || !telefono) {
        err.textContent = 'Completá todos los campos obligatorios.';
        err.style.display = 'block';
        return;
    }
    err.style.display = 'none';
    try {
        const user = authClient.currentUser;
        await db.collection('clientesAuth').doc(user.uid).update({ nombre, apellido, telefono });
        clienteAuth.nombre = nombre;
        clienteAuth.apellido = apellido;
        clienteAuth.telefono = telefono;
        document.getElementById('modalCompletarDatos').style.display = 'none';
        _updateNavAuth(user);
    } catch (e) {
        err.textContent = 'Error al guardar: ' + e.message;
        err.style.display = 'block';
    }
}

/* === MODAL PERFIL === */
function openPerfilModal() {
    if (!clienteAuth) return;
    const m = document.getElementById('modalPerfil');
    m.style.display = 'flex';
    document.getElementById('pfNombre').value = clienteAuth.nombre || '';
    document.getElementById('pfApellido').value = clienteAuth.apellido || '';
    document.getElementById('pfTelefono').value = clienteAuth.telefono || '';
    document.getElementById('pfEmail').value = clienteAuth.email || '';
    switchPerfilTab('datos');
    renderDirecciones();
}

function closePerfilModal() {
    document.getElementById('modalPerfil').style.display = 'none';
}

function switchPerfilTab(tab) {
    document.getElementById('perfilTabDatos').style.display = tab === 'datos' ? 'block' : 'none';
    document.getElementById('perfilTabDirecciones').style.display = tab === 'direcciones' ? 'block' : 'none';
    document.querySelectorAll('.perfil-tab').forEach((b, i) => b.classList.toggle('active', (i === 0 && tab === 'datos') || (i === 1 && tab === 'direcciones')));
}

async function guardarPerfil() {
    const nombre = sanitizeText(document.getElementById('pfNombre').value, 80);
    const apellido = sanitizeText(document.getElementById('pfApellido').value, 80);
    const telefono = sanitizePhone(document.getElementById('pfTelefono').value);
    if (!nombre || !apellido || !telefono) { showToast('Completá todos los campos', 'error'); return; }
    try {
        await db.collection('clientesAuth').doc(clienteAuth.uid).update({ nombre, apellido, telefono });
        clienteAuth.nombre = nombre; clienteAuth.apellido = apellido; clienteAuth.telefono = telefono;
        _updateNavAuth(authClient.currentUser);
        showToast('Perfil actualizado', 'success');
        closePerfilModal();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

/* === DIRECCIONES === */
function renderDirecciones() {
    const dirs = clienteAuth?.direcciones || [];
    const c = document.getElementById('listaDirecciones');
    if (!c) return;
    if (!dirs.length) { c.innerHTML = '<p style="color:#999;font-size:0.88rem">No tenés direcciones guardadas.</p>'; return; }
    c.innerHTML = dirs.map((d, i) => `
        <div class="dir-card">
            <div><div class="dir-card-name">${esc(d.nombre)}</div><div class="dir-card-text">${esc(d.texto)}</div></div>
            <button class="dir-card-del" onclick="eliminarDireccion(${i})"><i class="bi bi-trash"></i></button>
        </div>`).join('');
    const addBtn = document.getElementById('btnAgregarDir');
    if (addBtn) addBtn.style.display = dirs.length >= 5 ? 'none' : 'block';
}

function mostrarFormDir() {
    document.getElementById('formDireccion').style.display = 'block';
    document.getElementById('dirNombre').value = '';
    document.getElementById('dirTexto').value = '';
}

function cancelarFormDir() {
    document.getElementById('formDireccion').style.display = 'none';
}

async function guardarDireccion() {
    /* sanitizeText además de escapar al renderizar: estos valores los lee también
       el panel /admin, así que no queremos guardar HTML en la base. */
    const nombre = sanitizeText(document.getElementById('dirNombre').value, 60);
    const texto = sanitizeText(document.getElementById('dirTexto').value, 200);
    if (!nombre || !texto) { showToast('Completá los campos de la dirección', 'error'); return; }
    const dirs = clienteAuth.direcciones || [];
    if (dirs.length >= 5) { showToast('Máximo 5 direcciones', 'error'); return; }
    dirs.push({ nombre, texto });
    try {
        await db.collection('clientesAuth').doc(clienteAuth.uid).update({ direcciones: dirs });
        clienteAuth.direcciones = dirs;
        cancelarFormDir();
        renderDirecciones();
        showToast('Dirección guardada', 'success');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function eliminarDireccion(idx) {
    const dirs = clienteAuth.direcciones || [];
    dirs.splice(idx, 1);
    try {
        await db.collection('clientesAuth').doc(clienteAuth.uid).update({ direcciones: dirs });
        clienteAuth.direcciones = dirs;
        renderDirecciones();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

/* === HISTORIAL PEDIDOS === */
let _todosPedidosCliente = [];
let _filtroHistPedidos = 'todos';

function openHistorialModal() {
    if (!clienteAuth) return;
    document.getElementById('modalHistorial').style.display = 'flex';
    _cargarPedidosCliente();
}

function closeHistorialModal() {
    document.getElementById('modalHistorial').style.display = 'none';
    if (_pedidosListener) { _pedidosListener(); _pedidosListener = null; }
}

function _cargarPedidosCliente() {
    if (!clienteAuth) return;
    const c = document.getElementById('listaPedidosCliente');
    c.innerHTML = '<div style="text-align:center;padding:2rem;color:#999">Cargando...</div>';
    if (_pedidosListener) { _pedidosListener(); }
    _pedidosListener = db.collection('pedidos')
        .where('clienteAuthUid', '==', clienteAuth.uid)
        .orderBy('creadoEn', 'desc')
        .onSnapshot(snap => {
            _todosPedidosCliente = snap.docs.map(d => ({ id: d.id, ...d.data(), creadoEn: d.data().creadoEn?.toDate?.() || new Date() }));
            _renderPedidosCliente();
        }, err => {
            console.warn('pedidos listener error:', err);
            /* Fallback sin orderBy si falta el índice */
            db.collection('pedidos').where('clienteAuthUid', '==', clienteAuth.uid).get()
                .then(snap => {
                    _todosPedidosCliente = snap.docs.map(d => ({ id: d.id, ...d.data(), creadoEn: d.data().creadoEn?.toDate?.() || new Date() })).sort((a,b)=>b.creadoEn-a.creadoEn);
                    _renderPedidosCliente();
                })
                .catch(() => { c.innerHTML = '<div style="text-align:center;padding:2rem;color:#999">Sin pedidos aún.</div>'; });
        });
}

function filterHistPedidos(estado) {
    _filtroHistPedidos = estado;
    document.querySelectorAll('.hist-tab').forEach(b => b.classList.remove('active'));
    const tabs = { todos: 0, pendiente: 1, confirmado: 2, entregado: 3 };
    document.querySelectorAll('.hist-tab')[tabs[estado]]?.classList.add('active');
    _renderPedidosCliente();
}

function _renderPedidosCliente() {
    const c = document.getElementById('listaPedidosCliente');
    let pedidos = _todosPedidosCliente;
    if (_filtroHistPedidos !== 'todos') pedidos = pedidos.filter(p => p.estado === _filtroHistPedidos);
    if (!pedidos.length) {
        c.innerHTML = '<div style="text-align:center;padding:2rem;color:#999">Sin pedidos.</div>';
        return;
    }
    c.innerHTML = pedidos.map(p => {
        const num = (typeof NEGOCIO !== 'undefined' && NEGOCIO.nroPedido)
            ? NEGOCIO.nroPedido(p.numero)
            : '#' + String(p.numero || 0).padStart(5, '0');
        const fecha = p.creadoEn.toLocaleDateString('es-AR');
        const items = (p.items || []).map(i => '<div style="font-size:0.8rem;color:#555;padding:1px 0">• '+esc(i.nombre)+' <span style="color:#888">'+esc(esPesoProd(i)?fmtGramos(i.cantidad):'x'+i.cantidad)+'</span></div>').join('');
        const estadoClass = 'estado-' + (p.estado || 'pendiente');
        const estadoLabel = { pendiente: 'Pendiente', confirmado: 'Confirmado', entregado: 'Entregado' }[p.estado] || p.estado;
        return `<div class="pedido-hist-card">
            <div class="pedido-hist-top">
                <span class="pedido-hist-num">${num}</span>
                <span class="pedido-hist-estado ${estadoClass}">${estadoLabel}</span>
                <span class="pedido-hist-total">$${(p.total||0).toLocaleString('es-AR')}</span>
            </div>
            <div style="font-size:0.78rem;color:#888;margin-bottom:0.5rem">${fecha} · ${p.tipoEntrega==='envio'?'Envío':'Retiro'}</div>
            <div class="pedido-hist-items">${items}</div>
            <button class="btn-repetir" onclick="repetirPedido('${p.id}')"><i class="bi bi-arrow-repeat"></i> Repetir pedido</button>
        </div>`;
    }).join('');
}

async function repetirPedido(pedidoId) {
    const pedido = _todosPedidosCliente.find(p => p.id === pedidoId);
    if (!pedido) return;
    /* Se avisa antes de pisar el carrito. Antes lo vaciaba de una: si ya habias armado
       algo, desaparecia sin preguntar y sin forma de recuperarlo. */
    if (carrito.length && !confirm('Esto reemplaza lo que tenés en el carrito (' +
        carrito.length + ' producto' + (carrito.length === 1 ? '' : 's') + '). ¿Seguir?')) return;
    let agregados = 0, omitidos = [];
    carrito = [];
    for (const item of (pedido.items || [])) {
        const prod = productos.find(p => p.id === item.id);
        if (!prod) { omitidos.push(item.nombre + ' (ya no existe)'); continue; }
        if ((prod.stock || 0) <= 0) { omitidos.push(item.nombre + ' (sin stock)'); continue; }
        /* Se cobra el precio VIGENTE con su descuento, igual que addToCart. Antes usaba
           prod.precio pelado: un producto con 20% off que la web mostraba a $8.000 entraba
           al carrito a $10.000, o sea que repetir un pedido salia mas caro que armarlo a
           mano y el cliente veia un precio distinto del de la ficha. */
        /* El tipoVenta sale del CATALOGO, que es quien manda hoy sobre que significa
           `cantidad`. Sin este campo el carrito trataba los 250 GRAMOS de un granel
           como 250 unidades y los cotizaba al precio del KILO: $4.500.000 en vez de
           $4.500, y el cliente lo veia en su propio carrito.
           Y si el comercio le cambio la forma de venta al producto desde que se hizo
           el pedido, la cantidad guardada ya no significa lo mismo: se omite con aviso
           en vez de cobrar mil veces de mas o de menos. */
        const modoAhora = prod.tipoVenta || 'unidad';
        if ((item.tipoVenta || 'unidad') !== modoAhora) {
            omitidos.push(item.nombre + ' (cambio la forma de venta)');
            continue;
        }
        carrito.push({ id: prod.id, nombre: prod.nombre, precio: precioFinal(prod),
            precioOriginal: prod.precio, descuento: prod.descuento || 0,
            imagen: prod.imagen, cantidad: item.cantidad, tipoVenta: modoAhora });
        agregados++;
    }
    saveCart(); updateCartUI();
    closeHistorialModal();
    if (omitidos.length) showToast('Omitidos: ' + omitidos.join(', '), 'error');
    if (agregados) { showToast('Pedido cargado en tu carrito', 'success'); openCart(); }
}

/* ===== CUPONES ===== */
let _cuponAplicado = null;

async function aplicarCupon() {
    /* Si ya hay un cupón aplicado, no hacer nada */
    if (_cuponAplicado) return;
    const input = document.getElementById('chkCuponInput');
    const msg = document.getElementById('chkCuponMsg');
    const btn = input?.nextElementSibling;
    /* Sanitizar: solo letras mayúsculas, números y guiones */
    let codigo = (input?.value || '').trim().toUpperCase().replace(/[^A-Z0-9\-]/g, '');
    if (input) input.value = codigo;
    if (!codigo) { if(msg) msg.innerHTML=''; return; }
    /* Limitar longitud para evitar abusos */
    if (codigo.length > 30) { if(msg) msg.innerHTML='<span style="color:#e53e3e">Código inválido.</span>'; return; }
    if (btn) { btn.disabled=true; btn.textContent='Verificando...'; }
    try {
        const snap = await db.collection('cupones').where('codigo', '==', codigo).where('activo', '==', true).get();
        if (snap.empty) {
            if(msg) msg.innerHTML='<span style="color:#e53e3e">Cupón no válido o inactivo.</span>';
            if(btn){btn.disabled=false;btn.textContent='Aplicar';}
            return;
        }
        const cupDoc = snap.docs[0];
        const cup = cupDoc.data();
        const monto = parseInt(cup.monto || 0);
        if (isNaN(monto) || monto < 1) {
            if(msg) msg.innerHTML='<span style="color:#e53e3e">Cupón inválido.</span>';
            if(btn){btn.disabled=false;btn.textContent='Aplicar';}
            return;
        }
        /* Verificar máximo de usos global */
        const usos = parseInt(cup.usos || 0);
        if (cup.maxUsos && usos >= parseInt(cup.maxUsos)) {
            if(msg) msg.innerHTML='<span style="color:#e53e3e">Este cupón ya alcanzó el máximo de usos.</span>';
            if(btn){btn.disabled=false;btn.textContent='Aplicar';}
            return;
        }
        /* Verificar uso por cliente (una vez por usuario) */
        if (clienteAuth) {
            const yaUsado = await db.collection('cuponesUsos')
                .where('cuponId', '==', cupDoc.id)
                .where('uid', '==', clienteAuth.uid)
                .get();
            if (!yaUsado.empty) {
                if(msg) msg.innerHTML='<span style="color:#e53e3e">Ya usaste este cupón anteriormente.</span>';
                if(btn){btn.disabled=false;btn.textContent='Aplicar';}
                return;
            }
        }
        /* Verificar límite de compra */
        const subtotal = carrito.reduce((s,i) => s + subtotalCarrito(i), 0);
        if (cup.limiteCompra && subtotal < Number(cup.limiteCompra)) {
            if(msg) msg.innerHTML='<span style="color:#e53e3e">Este cupón requiere una compra mínima de $'+Number(cup.limiteCompra).toLocaleString('es-AR')+'.</span>';
            if(btn){btn.disabled=false;btn.textContent='Aplicar';}
            return;
        }
        /* Aplicar — deshabilitar input y botón para evitar doble aplicación */
        _cuponAplicado = { codigo, monto: monto, id: cupDoc.id };
        if(input){input.disabled=true;input.style.opacity='0.6';}
        if(btn){btn.disabled=true;btn.textContent='Aplicado ✓';btn.style.background='#3d402f';}
        if(msg) msg.innerHTML='<span style="color:#3d402f;font-weight:600">✓ $'+monto.toLocaleString('es-AR')+' de descuento aplicado.</span> <button onclick="quitarCupon()" style="background:none;border:none;color:#888;cursor:pointer;font-size:0.8rem;text-decoration:underline">Quitar</button>';
        updateCheckoutResumen();
    } catch(e) {
        if(msg) msg.innerHTML='<span style="color:#e53e3e">Error al verificar el cupón.</span>';
        if(btn){btn.disabled=false;btn.textContent='Aplicar';}
    }
}

function quitarCupon() {
    _cuponAplicado = null;
    const input = document.getElementById('chkCuponInput');
    const btn = input?.nextElementSibling;
    const msg = document.getElementById('chkCuponMsg');
    if(input){input.disabled=false;input.value='';input.style.opacity='1';}
    if(btn){btn.disabled=false;btn.textContent='Aplicar';btn.style.background='';}
    if(msg) msg.innerHTML='';
    updateCheckoutResumen();
}
