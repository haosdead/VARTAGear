// --- КОНФІГУРАЦІЯ ---
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTba0F9SbTUxpjBJ2uggBkP6iPNuEoWcc6-PhBRvQosa1sAqvJvEye_fQmeMFgoUl_6VCvq0WX8W--3/pub?gid=859081876&single=true&output=csv';
const ITEMS_PER_PAGE = 12;

// Глобальні змінні стану
let allProducts = [];      
let filteredProducts = []; 
let cart = [];             
let currentPage = 1;       
let currentModalPics = []; 
let currentModalPicIndex = 0;

// --- ІНІЦІАЛІЗАЦІЯ ---
document.addEventListener('DOMContentLoaded', () => {
    loadCSV();
    
    // Закриття всього при кліку на фон
    document.getElementById('body-overlay').onclick = () => {
        closeAllPanels();
    };
});

// --- РОБОТА З ДАНИМИ ---
function loadCSV() {
    Papa.parse(CSV_URL, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function(res) {
            allProducts = res.data.filter(p => p.Name).map((p, i) => ({
                ...p,
                myUniqueId: i,
                Price: parseFloat(p.Price) || 0,
                Badge: p.Badge ? p.Badge.trim().toUpperCase() : "" 
            }));

            // Сортування: SALE завжди зверху
            allProducts.sort((a, b) => {
                if (a.Badge === 'SALE' && b.Badge !== 'SALE') return -1;
                if (a.Badge !== 'SALE' && b.Badge === 'SALE') return 1;
                return 0;
            });

            filteredProducts = [...allProducts];
            renderCatalog();
            buildCategoryTree(); // Будуємо меню Категорія -> Підкатегорія
            checkUrlHash();
        }
    });
}

// --- ВІДОБРАЖЕННЯ КАТАЛОГУ ---
function renderCatalog() {
    const container = document.getElementById('catalog');
    if (!container) return;

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const items = filteredProducts.slice(start, start + ITEMS_PER_PAGE);
    
    if (items.length === 0) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 50px; color: #888;">Товарів не знайдено.</div>`;
    } else {
        container.innerHTML = items.map(p => {
            const pic = p.Pictures ? p.Pictures.split(',')[0].trim() : 'placeholder.jpg';
            const badgeHtml = p.Badge === 'SALE' ? `<div class="badge-sale">SALE</div>` : 
                             (p.Badge === 'TOP' ? `<div class="badge-top">TOP</div>` : '');
            
            return `
                <div class="card" onclick="openModal(${p.myUniqueId})">
                    <div class="card-img-wrap">
                        ${badgeHtml}
                        <img src="${pic}" alt="${p.Name}" loading="lazy">
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
    }
    renderPagination();
}

// --- ПОБУДОВА МЕНЮ (Категорія -> Підкатегорія) ---
function buildCategoryTree() {
    const treeContainer = document.getElementById('category-tree');
    if (!treeContainer) return;

    const structure = {};
    allProducts.forEach(p => {
        if (!structure[p.Category]) structure[p.Category] = new Set();
        if (p.SubCategory) structure[p.Category].add(p.SubCategory);
    });

    treeContainer.innerHTML = Object.keys(structure).map(cat => `
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

// --- ПАГІНАЦІЯ (Кнопки в ряд) ---
function renderPagination() {
    const container = document.getElementById('pagination');
    if (!container) return;

    const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
    let html = '';
    if (totalPages > 1) {
        for (let i = 1; i <= totalPages; i++) {
            html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" 
                     onclick="currentPage=${i}; renderCatalog(); window.scrollTo(0,0)">${i}</button>`;
        }
    }
    container.innerHTML = html;
}

// --- МОДАЛЬНЕ ВІКНО ---
function openModal(id) {
    const p = allProducts.find(x => x.myUniqueId === id);
    if (!p) return;
    
    window.location.hash = p.VendorCode || id;
    
    document.getElementById('modal-name').innerText = p.Name;
    document.getElementById('modal-price').innerText = p.Price + ' грн';
    document.getElementById('modal-old-price').innerText = p.OldPrice ? p.OldPrice + ' грн' : '';
    document.getElementById('modal-desc').innerHTML = p.Description || '';
    
    const pics = p.Pictures ? p.Pictures.split(',').map(s => s.trim()) : [];
    currentModalPics = pics;
    currentModalPicIndex = 0;
    
    if(pics.length > 0) {
        document.getElementById('modal-main-img').src = pics[0];
        document.getElementById('modal-thumbnails').innerHTML = pics.map((src, i) => 
            `<img src="${src}" onclick="changeModalPicDirect(${i})">`
        ).join('');
    }

    const sizes = p.Sizes ? p.Sizes.split(',') : [];
    const sizeSelector = document.getElementById('modal-size-selector');
    sizeSelector.innerHTML = sizes.length > 0 && sizes[0] !== "" 
        ? '<option value="">Оберіть розмір</option>' + sizes.map(s => `<option value="${s.trim()}">${s.trim()}</option>`).join('')
        : '<option value="Стандарт">Стандарт</option>';
    
    document.getElementById('product-modal').style.display = 'flex';
    document.getElementById('body-overlay').classList.add('active');
    document.body.style.overflow = 'hidden';

    document.getElementById('modal-add-btn').onclick = () => {
        const selectedSize = sizeSelector.value;
        if (!selectedSize) return alert('Оберіть розмір!');
        cart.push({ ...p, selectedSize });
        updateCartUI();
        closeModal();
        toggleCart(true);
    };
}

function changeModalPicDirect(index) {
    currentModalPicIndex = index;
    document.getElementById('modal-main-img').src = currentModalPics[index];
}

function closeModal() {
    document.getElementById('product-modal').style.display = 'none';
    document.getElementById('body-overlay').classList.remove('active');
    document.body.style.overflow = 'auto';
    window.location.hash = '';
}

// --- ФІЛЬТРИ ТА ПОШУК ---
function filterByBadge(badgeType, btn) {
    document.querySelectorAll('.filter-tag').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filteredProducts = (badgeType === 'all') ? [...allProducts] : allProducts.filter(p => p.Badge === badgeType);
    currentPage = 1;
    renderCatalog();
}

function resetPageAndFilter() {
    const query = document.getElementById('search').value.toLowerCase();
    filteredProducts = allProducts.filter(p => 
        p.Name.toLowerCase().includes(query) || (p.VendorCode && p.VendorCode.toLowerCase().includes(query))
    );
    currentPage = 1;
    renderCatalog();
}

function resetFilters() {
    document.getElementById('search').value = '';
    filterByBadge('all', document.querySelector('.filter-tag'));
    toggleMobileMenu(false);
}

// --- КОШИК ---
function updateCartUI() {
    const countLabel = document.getElementById('cart-count');
    const content = document.getElementById('cart-content');
    const footer = document.getElementById('cart-footer');
    const totalLabel = document.getElementById('cart-total-price');

    countLabel.innerText = cart.length;
    if (cart.length === 0) {
        content.innerHTML = 'Кошик порожній';
        footer.style.display = 'none';
    } else {
        footer.style.display = 'block';
        let total = 0;
        content.innerHTML = cart.map((item, idx) => {
            total += item.Price;
            return `
                <div class="cart-item-row">
                    <b>${item.Name}</b> (${item.selectedSize})<br>
                    ${item.Price} грн <span onclick="removeFromCart(${idx})" style="color:red; cursor:pointer; float:right;">✕</span>
                </div>`;
        }).join('');
        totalLabel.innerText = total;
    }
}

function removeFromCart(index) {
    cart.splice(index, 1);
    updateCartUI();
}

function checkout(platform) {
    if (cart.length === 0) return;
    const name = document.getElementById('cust-name').value;
    const phone = document.getElementById('cust-phone').value;
    if(!name || !phone) return alert('Заповніть контактні дані!');

    let msg = `🛒 ЗАМОВЛЕННЯ:\n` + cart.map(i => `- ${i.Name} (${i.selectedSize})`).join('\n') + `\n💰 Разом: ${document.getElementById('cart-total-price').innerText} грн\n👤 ${name}, ${phone}`;
    window.open(`https://t.me/vartagear?text=${encodeURIComponent(msg)}`);
}

// --- ІНТЕРФЕЙС ---
function toggleMobileMenu(show) {
    document.getElementById('mobile-menu').classList.toggle('active', show);
    document.getElementById('body-overlay').classList.toggle('active', show);
}

function toggleCart(show) {
    document.getElementById('cart-sidebar').classList.toggle('active', show);
    document.getElementById('body-overlay').classList.toggle('active', show);
}

function closeAllPanels() {
    toggleMobileMenu(false);
    toggleCart(false);
    closeModal();
}

function checkUrlHash() {
    const hash = window.location.hash.substring(1);
    if (hash) {
        const p = allProducts.find(x => x.VendorCode === hash || x.myUniqueId == hash);
        if (p) openModal(p.myUniqueId);
    }
}