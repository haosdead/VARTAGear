const CSV_URL = 'data.csv';
const ITEMS_PER_PAGE = 21; /* Кількість товарів на сторінці для заповнення менших карток (кратне 3, 5, 6, 7) */

let allProducts = [], filteredProducts = [], cart = [], currentPage = 1;
let currentModalPics = [], currentModalPicIndex = 0;

document.addEventListener('DOMContentLoaded', loadCSV);

function loadCSV() {
    Papa.parse(CSV_URL, {
        download: true, header: true, skipEmptyLines: true,
        complete: function(res) {
            allProducts = res.data.filter(p => p.Name).map((p, i) => ({
                ...p,
                myId: i,
                Price: parseFloat(p.Price) || 0,
                OldPrice: p.OldPrice ? parseFloat(p.OldPrice) || null : null,
                Badge: p.Badge ? p.Badge.trim().toUpperCase() : ""
            }));
            // Сортування: SALE завжди зверху
            allProducts.sort((a, b) => (b.Badge === 'SALE') - (a.Badge === 'SALE'));
            filteredProducts = [...allProducts];
            renderCatalog();
            buildCategoryTree();
        }
    });
}

function renderCatalog() {
    const container = document.getElementById('catalog');
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const items = filteredProducts.slice(start, start + ITEMS_PER_PAGE);

    container.innerHTML = items.map(p => {
        const pics = p.Pictures ? p.Pictures.split(',').map(s => s.trim()) : [];
        const mainPic = pics[0] || '';
        return `
        <div class="card" onclick="openModal(${p.myId})">
            <div class="card-img-wrap">
                ${p.Badge === 'SALE' ? '<div class="badge-sale">SALE</div>' : ''}
                <img src="${mainPic}" loading="lazy" alt="${p.Name}">
            </div>
            <div class="card-info">
                <div>
                    <small>${p.SubCategory || p.Category}</small>
                    <h4>${p.Name}</h4>
                    <div class="price-box">
                        ${p.OldPrice ? `<span class="old-price">${p.OldPrice} грн</span>` : ''}
                        ${p.Price} грн
                    </div>
                </div>
                <button class="buy-btn-card" onclick="event.stopPropagation(); openModal(${p.myId})">
                    <i class="fas fa-shopping-cart"></i> КУПИТИ
                </button>
            </div>
        </div>`;
    }).join('');
    renderPagination();
}

function buildCategoryTree() {
    const tree = document.getElementById('category-tree');
    const structure = {};
    allProducts.forEach(p => {
        if (!structure[p.Category]) structure[p.Category] = new Set();
        if (p.SubCategory) structure[p.Category].add(p.SubCategory);
    });
    tree.innerHTML = Object.keys(structure).map(cat => `
        <div class="cat-group">
            <div class="cat-name-wrapper" onclick="toggleCategory(this.parentNode)">
                <span class="cat-name">${cat}</span>
                <i class="fas fa-chevron-down cat-toggle"></i>
            </div>
            <div class="sub-list">
                ${Array.from(structure[cat]).map(sub => `<div class="sub-item" onclick="filterBy('sub', '${sub}')">${sub}</div>`).join('')}
            </div>
        </div>`).join('');
}

// Функція для плавного розгортання/згортання меню
function toggleCategory(catGroupElement) {
    catGroupElement.classList.toggle('active');
}

function openModal(id) {
    const p = allProducts.find(x => x.myId === id);
    if(!p) return;

    document.getElementById('modal-name').innerText = p.Name;
    document.getElementById('modal-price').innerText = `${p.Price} грн`;
    document.getElementById('modal-old-price').innerText = p.OldPrice ? `${p.OldPrice} грн` : '';
    document.getElementById('modal-desc').innerHTML = p.Description || 'Опис очікується...';
    document.getElementById('modal-vendor').innerText = `Артикул: ${p.VendorCode}`;

    currentModalPics = p.Pictures ? p.Pictures.split(',').map(s => s.trim()) : [];
    currentModalPicIndex = 0;
    updateModalGallery();

    const sizes = p.Sizes ? p.Sizes.split(',') : [];
    const sel = document.getElementById('modal-size-selector');
    sel.innerHTML = sizes.length > 0 && sizes[0].trim() !== "" ? 
        '<option value="">Оберіть розмір</option>' + sizes.map(s => `<option value="${s.trim()}">${s.trim()}</option>`).join('') :
        '<option value="Універсальний">Універсальний</option>';

    document.getElementById('product-modal').style.display = 'flex';
    document.getElementById('body-overlay').classList.add('active');
    document.body.style.overflow = 'hidden';

    document.getElementById('modal-add-btn').onclick = () => {
        if (!sel.value) return alert('Оберіть розмір!');
        cart.push({ ...p, selectedSize: sel.value });
        updateCartUI();
        closeModal();
        toggleCart(true);
    };
}

function updateModalGallery() {
    document.getElementById('modal-main-img').src = currentModalPics[currentModalPicIndex] || '';
    document.getElementById('modal-thumbnails').innerHTML = currentModalPics.map((src, i) => 
        `<img src="${src}" class="${i === currentModalPicIndex ? 'active' : ''}" onclick="setModalPic(${i})" alt="thumb ${i}">`).join('');
}

function setModalPic(i) { currentModalPicIndex = i; updateModalGallery(); }
function changeModalPic(step) {
    if (currentModalPics.length === 0) return;
    currentModalPicIndex = (currentModalPicIndex + step + currentModalPics.length) % currentModalPics.length;
    updateModalGallery();
}

function filterBy(type, val) {
    filteredProducts = allProducts.filter(p => type === 'cat' ? p.Category === val : p.SubCategory === val);
    currentPage = 1; renderCatalog(); toggleMobileMenu(false);
}

function filterByBadge(badge, btn) {
    document.querySelectorAll('.filter-tag').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filteredProducts = badge === 'all' ? [...allProducts] : allProducts.filter(p => p.Badge === badge);
    currentPage = 1; renderCatalog();
}

function resetPageAndFilter() {
    const q = document.getElementById('search-input').value.toLowerCase().trim();
    filteredProducts = allProducts.filter(p => p.Name.toLowerCase().includes(q) || (p.VendorCode || "").toLowerCase().includes(q));
    currentPage = 1; renderCatalog();
}

function renderPagination() {
    const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
    const container = document.getElementById('pagination');
    let html = '';
    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="page-btn ${i===currentPage?'active':''}" onclick="changePage(${i})">${i}</button>`;
    }
    container.innerHTML = html;
}

function changePage(page) {
    currentPage = page;
    renderCatalog();
    window.scrollTo(0,0);
}

function updateCartUI() {
    document.getElementById('cart-count').innerText = cart.length;
    const content = document.getElementById('cart-content');
    const footer = document.getElementById('cart-footer');
    if (cart.length === 0) {
        content.innerHTML = '<div style="text-align:center; padding:30px; color:#666; font-size:14px;">Порожньо</div>';
        footer.style.display = 'none';
    } else {
        footer.style.display = 'block';
        let total = 0;
        content.innerHTML = cart.map((it, i) => {
            total += parseFloat(it.Price);
            return `<div style="padding:10px 0; border-bottom:1px solid #222; font-size:14px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <b>${it.Name}</b> (${it.selectedSize})<br>${it.Price} грн 
                </div>
                <span onclick="removeFromCart(${i})" style="color:red; cursor:pointer; font-size:18px; padding:0 5px;">✕</span>
            </div>`;
        }).join('');
        document.getElementById('cart-total-price').innerText = total;
    }
}

function removeFromCart(i) { cart.splice(i, 1); updateCartUI(); }
function toggleMobileMenu(s) { document.getElementById('mobile-menu').classList.toggle('active', s); document.getElementById('body-overlay').classList.toggle('active', s); document.body.style.overflow = s ? 'hidden' : 'auto'; }
function toggleCart(s) { document.getElementById('cart-sidebar').classList.toggle('active', s); document.getElementById('body-overlay').classList.toggle('active', s); document.body.style.overflow = s ? 'hidden' : 'auto'; }
function closeModal() { document.getElementById('product-modal').style.display = 'none'; document.getElementById('body-overlay').classList.remove('active'); document.body.style.overflow = 'auto'; }
function closeAllPanels() { toggleMobileMenu(false); toggleCart(false); closeModal(); }
function resetFilters() { document.getElementById('search-input').value = ''; filterByBadge('all', document.querySelector('.filter-tag')); }

function checkout(platform) {
    if (cart.length === 0) return;
    let txt = "🪖 ЗАМОВЛЕННЯ VARTA GEAR:\n\n";
    cart.forEach((it, i) => { txt += `${i+1}. ${it.Name} (${it.selectedSize}) - ${it.Price} грн\n`; });
    txt += `\n💰 РАЗОМ: ${document.getElementById('cart-total-price').innerText} грн`;
    const encoded = encodeURIComponent(txt);
    if(platform === 'tg') window.open(`https://t.me/vartagear?text=${encoded}`);
    else window.open(`https://wa.me/+380933923810?text=${encoded}`);
}