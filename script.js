// --- КОНФІГУРАЦІЯ ---
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTba0F9SbTUxpjBJ2uggBkP6iPNuEoWcc6-PhBRvQosa1sAqvJvEye_fQmeMFgoUl_6VCvq0WX8W--3/pub?gid=859081876&single=true&output=csv';
const ITEMS_PER_PAGE = 12;

let allProducts = [], filteredProducts = [], cart = [];
let currentPage = 1;
let modalImages = [];
let currentImgIdx = 0;

// --- ІНІЦІАЛІЗАЦІЯ ---
document.addEventListener('DOMContentLoaded', loadCSV);

function loadCSV() {
    Papa.parse(CSV_URL, {
        download: true, header: true, skipEmptyLines: true,
        complete: function(res) {
            allProducts = res.data.filter(p => p.Name).map((p, i) => ({
                ...p,
                myUniqueId: i,
                Price: parseFloat(p.Price) || 0,
                Badge: p.Badge ? p.Badge.trim().toUpperCase() : ""
            }));

            // SALE нагору
            allProducts.sort((a, b) => (b.Badge === 'SALE') - (a.Badge === 'SALE'));
            filteredProducts = [...allProducts];
            
            renderCatalog();
            buildCategoryTree();
            checkUrlHash();
        }
    });
}

// --- КАТАЛОГ ---
function renderCatalog() {
    const container = document.getElementById('catalog');
    if (!container) return;

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const items = filteredProducts.slice(start, start + ITEMS_PER_PAGE);

    container.innerHTML = items.map(p => {
        const pic = p.Pictures ? p.Pictures.split(',')[0].trim() : 'placeholder.jpg';
        const badge = p.Badge === 'SALE' ? `<div class="badge-sale">SALE</div>` : 
                     (p.Badge === 'TOP' ? `<div class="badge-top">TOP</div>` : '');
        
        return `
            <div class="card" onclick="openModal(${p.myUniqueId})">
                <div class="card-img-wrap">
                    ${badge}
                    <img src="${pic}" loading="lazy">
                </div>
                <div class="card-info">
                    <div>
                        <small style="color:var(--accent)">${p.Category}</small>
                        <h4>${p.Name}</h4>
                    </div>
                    <div class="price-box">${p.Price} грн</div>
                </div>
            </div>`;
    }).join('');
    renderPagination();
}

// --- МОДАЛКА (КАРУСЕЛЬ + ОПИС) ---
function openModal(id) {
    const p = allProducts.find(x => x.myUniqueId === id);
    if (!p) return;

    window.location.hash = p.VendorCode || id;
    
    document.getElementById('modal-name').innerText = p.Name;
    document.getElementById('modal-price').innerText = p.Price + ' грн';
    document.getElementById('modal-old-price').innerText = p.OldPrice ? p.OldPrice + ' грн' : '';
    document.getElementById('modal-desc').innerHTML = p.Description || 'Опис відсутній';

    // Налаштування фото (Карусель)
    modalImages = p.Pictures ? p.Pictures.split(',').map(s => s.trim()) : [];
    currentImgIdx = 0;
    updateModalGallery();

    // Налаштування розмірів
    const sizes = p.Sizes ? p.Sizes.split(',') : [];
    const sizeSelector = document.getElementById('modal-size-selector');
    sizeSelector.innerHTML = sizes.length > 0 && sizes[0] !== "" 
        ? '<option value="">Оберіть розмір</option>' + sizes.map(s => `<option value="${s.trim()}">${s.trim()}</option>`).join('')
        : '<option value="Стандарт">Стандарт</option>';

    document.getElementById('product-modal').style.display = 'flex';
    document.getElementById('body-overlay').classList.add('active');
    document.body.style.overflow = 'hidden';

    // Кнопка кошика
    document.getElementById('modal-add-btn').onclick = () => {
        const selectedSize = sizeSelector.value;
        if (!selectedSize) return alert('Будь ласка, оберіть розмір!');
        cart.push({ ...p, selectedSize });
        updateCartUI();
        closeModal();
        toggleCart(true);
    };
}

// ЛОГІКА СЛАЙДЕРА В МОДАЛЦІ
function updateModalGallery() {
    if (modalImages.length > 0) {
        document.getElementById('modal-main-img').src = modalImages[currentImgIdx];
        const thumbBox = document.getElementById('modal-thumbnails');
        thumbBox.innerHTML = modalImages.map((src, idx) => `
            <img src="${src}" class="${idx === currentImgIdx ? 'active-thumb' : ''}" 
                 onclick="setModalPic(${idx})">
        `).join('');
    }
}

function changeModalPic(step) {
    currentImgIdx += step;
    if (currentImgIdx >= modalImages.length) currentImgIdx = 0;
    if (currentImgIdx < 0) currentImgIdx = modalImages.length - 1;
    updateModalGallery();
}

function setModalPic(idx) {
    currentImgIdx = idx;
    updateModalGallery();
}

// --- КАТЕГОРІЇ ТА ФІЛЬТРИ ---
function buildCategoryTree() {
    const tree = document.getElementById('category-tree');
    if (!tree) return;
    const structure = {};
    allProducts.forEach(p => {
        if (!structure[p.Category]) structure[p.Category] = new Set();
        if (p.SubCategory) structure[p.Category].add(p.SubCategory);
    });

    tree.innerHTML = Object.keys(structure).map(cat => `
        <div class="cat-item">
            <span class="cat-name" onclick="filterBy('cat', '${cat}')">${cat}</span>
            <div class="sub-list">
                ${Array.from(structure[cat]).map(sub => `
                    <div class="sub-item" onclick="filterBy('sub', '${sub}')">${sub}</div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

function filterBy(type, value) {
    if (type === 'cat') filteredProducts = allProducts.filter(p => p.Category === value);
    if (type === 'sub') filteredProducts = allProducts.filter(p => p.SubCategory === value);
    currentPage = 1;
    renderCatalog();
    toggleMobileMenu(false);
}

function filterByBadge(badge, btn) {
    document.querySelectorAll('.filter-tag').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filteredProducts = (badge === 'all') ? [...allProducts] : allProducts.filter(p => p.Badge === badge);
    currentPage = 1;
    renderCatalog();
}

// --- СЛУЖБОВІ ФУНКЦІЇ ---
function toggleMobileMenu(show) {
    document.getElementById('mobile-menu').classList.toggle('active', show);
    document.getElementById('body-overlay').classList.toggle('active', show);
}

function toggleCart(show) {
    document.getElementById('cart-sidebar').classList.toggle('active', show);
    document.getElementById('body-overlay').classList.toggle('active', show);
}

function closeModal() {
    document.getElementById('product-modal').style.display = 'none';
    document.getElementById('body-overlay').classList.remove('active');
    document.body.style.overflow = 'auto';
    window.location.hash = '';
}

function renderPagination() {
    const total = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
    const container = document.getElementById('pagination');
    if (!container) return;
    let btns = '';
    for (let i = 1; i <= total; i++) {
        btns += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="currentPage=${i}; renderCatalog(); window.scrollTo(0,0)">${i}</button>`;
    }
    container.innerHTML = btns;
}

function updateCartUI() {
    const count = document.getElementById('cart-count');
    const content = document.getElementById('cart-content');
    const totalLabel = document.getElementById('cart-total-price');
    const footer = document.getElementById('cart-footer');

    count.innerText = cart.length;
    if (cart.length === 0) {
        content.innerHTML = 'Кошик порожній';
        footer.style.display = 'none';
    } else {
        footer.style.display = 'block';
        let total = 0;
        content.innerHTML = cart.map((item, idx) => {
            total += item.Price;
            return `<div class="cart-item"><b>${item.Name}</b> (${item.selectedSize})<br>${item.Price} грн <span onclick="removeFromCart(${idx})" style="color:red; cursor:pointer; float:right">✕</span></div>`;
        }).join('');
        totalLabel.innerText = total;
    }
}

function removeFromCart(idx) {
    cart.splice(idx, 1);
    updateCartUI();
}

function resetPageAndFilter() {
    const query = document.getElementById('search').value.toLowerCase();
    filteredProducts = allProducts.filter(p => p.Name.toLowerCase().includes(query) || (p.VendorCode && p.VendorCode.toLowerCase().includes(query)));
    currentPage = 1;
    renderCatalog();
}

function checkUrlHash() {
    const hash = window.location.hash.substring(1);
    if (hash) {
        const p = allProducts.find(x => x.VendorCode === hash || x.myUniqueId == hash);
        if (p) openModal(p.myUniqueId);
    }
}

function checkout(platform) {
    if (cart.length === 0) return;
    const name = document.getElementById('cust-name').value;
    const phone = document.getElementById('cust-phone').value;
    if (!name || !phone) return alert('Заповніть контакти!');
    let msg = `🛒 ЗАМОВЛЕННЯ:\n` + cart.map(i => `- ${i.Name} (${i.selectedSize})`).join('\n') + `\n💰 Разом: ${document.getElementById('cart-total-price').innerText} грн`;
    window.open(`https://t.me/vartagear?text=${encodeURIComponent(msg)}`);
}