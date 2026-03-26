// --- КОНФІГУРАЦІЯ ---
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTba0F9SbTUxpjBJ2uggBkP6iPNuEoWcc6-PhBRvQosa1sAqvJvEye_fQmeMFgoUl_6VCvq0WX8W--3/pub?gid=859081876&single=true&output=csv'; // Переконайся, що файл у папці або встав посилання на Google CSV
const ITEMS_PER_PAGE = 10;

// Глобальні змінні стану
let allProducts = [];      // Всі товари з бази
let filteredProducts = []; // Товари після фільтрів та пошуку
let cart = [];             // Кошик
let currentPage = 1;       // Поточна сторінка
let currentModalPics = []; // Картинки для галереї в модалці
let currentModalPicIndex = 0;

// --- ІНІЦІАЛІЗАЦІЯ ПРИ ЗАВАНТАЖЕННІ ---
document.addEventListener('DOMContentLoaded', () => {
    loadCSV();
    initFAQ();
    
    // Закриття всього при кліку на фон
    document.getElementById('body-overlay').onclick = () => {
        toggleMobileMenu(false);
        toggleCart(false);
        closeModal();
    };
});

// --- РОБОТА З ДАНИМИ (CSV) ---
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
                // Додаємо захист: якщо Badge порожній, робимо його порожнім рядком
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
            generateCategoryFilters();
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
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 50px; color: #888;">Товарів не знайдено за вашим запитом.</div>`;
    } else {
        container.innerHTML = items.map(p => {
            const pic = p.Pictures ? p.Pictures.split(',')[0].trim() : 'placeholder.jpg';
            const badge = p.Badge ? `<div class="badge badge-${p.Badge.toLowerCase()}">${p.Badge === 'SALE' ? 'АКЦІЯ' : p.Badge}</div>` : '';
            
            return `
                <div class="card" onclick="openModal(${p.myUniqueId})">
                    <div class="card-img-container">
                        ${badge}
                        <img src="${pic}" alt="${p.Name}" loading="lazy">
                    </div>
                    <div class="card-body">
                        <small style="color:var(--varta-lime)">${p.SubCategory || p.Category || 'Спорядження'}</small>
                        <h4 style="margin:10px 0; min-height: 40px;">${p.Name}</h4>
                        <div style="margin-bottom:15px">
                            ${p.OldPrice ? `<span style="text-decoration:line-through; color:#666; margin-right:10px; font-size: 0.9rem;">${p.OldPrice}</span>` : ''}
                            <b style="font-size:1.2rem; color: #fff;">${p.Price} грн</b>
                        </div>
                        <button class="btn-buy" onclick="event.stopPropagation(); openModal(${p.myUniqueId})">КУПИТИ</button>
                    </div>
                </div>`;
        }).join('');
    }
    
    renderPagination();
}

// --- ПАГІНАЦІЯ ---
function renderPagination() {
    const paginationContainer = document.getElementById('pagination');
    if (!paginationContainer) return;

    const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
    let html = '';

    if (totalPages > 1) {
        for (let i = 1; i <= totalPages; i++) {
            html += `<button class="f-btn ${i === currentPage ? 'active' : ''}" 
                     onclick="currentPage=${i}; renderCatalog(); window.scrollTo(0,0)">${i}</button>`;
        }
    }
    paginationContainer.innerHTML = html;
}

// --- МОДАЛЬНЕ ВІКНО ТА ГАЛЕРЕЯ ---
function openModal(id) {
    const p = allProducts.find(x => x.myUniqueId === id);
    if (!p) return;
    
    // Оновлюємо URL для Deep Linking
    window.location.hash = p.VendorCode || id;
    
    document.getElementById('modal-name').innerText = p.Name;
    document.getElementById('modal-price').innerText = p.Price + ' грн';
    document.getElementById('modal-desc').innerText = p.Description || 'Детальний опис товару уточнюйте у менеджера.';
    
    // Налаштування розмірів
    const sizes = p.Sizes ? p.Sizes.split(',') : [];
    const sizeSelector = document.getElementById('modal-size-selector');
    if (sizes.length > 0 && sizes[0] !== "") {
        sizeSelector.style.display = 'block';
        sizeSelector.innerHTML = '<option value="">Оберіть розмір</option>' + 
            sizes.map(s => `<option value="${s.trim()}">${s.trim()}</option>`).join('');
    } else {
        sizeSelector.style.display = 'none';
        sizeSelector.innerHTML = '<option value="Без розміру">Стандарт</option>';
    }
    
    // Налаштування галереї
    currentModalPics = p.Pictures ? p.Pictures.split(',').map(s => s.trim()) : [];
    currentModalPicIndex = 0;
    updateModalGallery();
    
    document.getElementById('product-modal').classList.add('open');
    document.getElementById('body-overlay').classList.add('active');
    document.body.style.overflow = 'hidden'; // Заборона скролу фону

    // Налаштування кнопки додавання
    document.getElementById('modal-add-btn').onclick = () => {
        const selectedSize = sizeSelector.value;
        if (!selectedSize) return alert('Будь ласка, оберіть розмір!');
        
        cart.push({ ...p, selectedSize: selectedSize });
        updateCartUI();
        closeModal();
        toggleCart(true);
    };
}

function updateModalGallery() {
    const mainImg = document.getElementById('modal-main-img');
    const thumbContainer = document.getElementById('modal-thumbnails');
    
    if (currentModalPics.length > 0) {
        mainImg.src = currentModalPics[currentModalPicIndex];
        thumbContainer.innerHTML = currentModalPics.map((src, i) => 
            `<img src="${src}" class="thumb ${i === currentModalPicIndex ? 'active' : ''}" 
             onclick="currentModalPicIndex=${i}; updateModalGallery();">`
        ).join('');
    }
}

function changeModalPic(direction) {
    currentModalPicIndex = (currentModalPicIndex + direction + currentModalPics.length) % currentModalPics.length;
    updateModalGallery();
}

function closeModal() {
    document.getElementById('product-modal').classList.remove('open');
    document.getElementById('body-overlay').classList.remove('active');
    document.body.style.overflow = '';
    history.replaceState(null, null, ' '); // Прибираємо хеш з URL
}

// --- ФІЛЬТРАЦІЯ ТА ПОШУК ---
function generateCategoryFilters() {
    const menuContainer = document.getElementById('categories-list');
    if (!menuContainer) return;

    const categories = [...new Set(allProducts.map(p => p.Category).filter(Boolean))];
    menuContainer.innerHTML = categories.map(cat => 
        `<div class="faq-question" style="padding: 10px 0; border-bottom: 1px solid #222;" 
              onclick="filterByCategory('${cat}')">${cat}</div>`
    ).join('');
}

function filterByCategory(cat) {
    filteredProducts = allProducts.filter(p => p.Category === cat);
    currentPage = 1;
    renderCatalog();
    toggleMobileMenu(false);
}

function filterByBadge(badgeType, btn) {
    document.querySelectorAll('.f-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (badgeType === 'all') {
        filteredProducts = [...allProducts];
    } else {
        filteredProducts = allProducts.filter(p => p.Badge?.toLowerCase() === badgeType.toLowerCase());
    }
    currentPage = 1;
    renderCatalog();
}

function resetPageAndFilter() {
    const query = document.getElementById('search').value.toLowerCase();
    filteredProducts = allProducts.filter(p => 
        p.Name.toLowerCase().includes(query) || 
        (p.VendorCode && p.VendorCode.toLowerCase().includes(query))
    );
    currentPage = 1;
    renderCatalog();
}

function resetFilters() {
    document.getElementById('search').value = '';
    filteredProducts = [...allProducts];
    currentPage = 1;
    document.querySelectorAll('.f-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.f-btn').classList.add('active');
    renderCatalog();
}

// --- КОШИК ТА ЗАМОВЛЕННЯ ---
function updateCartUI() {
    const countLabel = document.getElementById('cart-count');
    const content = document.getElementById('cart-content');
    const footer = document.getElementById('cart-footer');
    const totalPriceLabel = document.getElementById('cart-total-price');

    countLabel.innerText = cart.length;
    
    if (cart.length === 0) {
        content.innerHTML = 'Кошик порожній';
        footer.style.display = 'none';
    } else {
        footer.style.display = 'block';
        let total = 0;
        content.innerHTML = cart.map((item, idx) => {
            total += parseFloat(item.Price);
            return `
                <div style="padding:15px 0; border-bottom:1px solid #333; position: relative;">
                    <b style="font-size: 0.9rem;">${item.Name}</b><br>
                    <small style="color: #888;">Розмір: ${item.selectedSize} | ${item.Price} грн</small>
                    <span onclick="removeFromCart(${idx})" style="position: absolute; right: 0; top: 15px; color: #ff4400; cursor: pointer;">✕</span>
                </div>`;
        }).join('');
        totalPriceLabel.innerText = total;
    }
}

function removeFromCart(index) {
    cart.splice(index, 1);
    updateCartUI();
}

function checkout(platform) {
    if (cart.length === 0) return;

    const name = document.getElementById('cust-name').value.trim();
    const phone = document.getElementById('cust-phone').value.trim();
    const city = document.getElementById('cust-city').value.trim();
    const post = document.getElementById('cust-post').value.trim();
    const pay = document.querySelector('input[name="pay-method"]:checked').value;

    if (!name || !phone || !city || !post) {
        alert('Заповніть, будь ласка, всі дані для доставки Новою Поштою!');
        return;
    }

    const total = document.getElementById('cart-total-price').innerText;
    
    let message = `🛒 НОВЕ ЗАМОВЛЕННЯ VARTA GEAR:\n`;
    message += `━━━━━━━━━━━━━━━\n`;
    cart.forEach((item, i) => {
        message += `${i+1}. ${item.Name}\n   Розмір: ${item.selectedSize} | ${item.Price} грн\n`;
    });
    message += `━━━━━━━━━━━━━━━\n`;
    message += `💰 РАЗОМ: ${total} грн\n`;
    message += `💳 ОПЛАТА: ${pay}\n`;
    message += `📍 ДОСТАВКА: ${city}, ${post}\n`;
    message += `👤 ОТРИМУВАЧ: ${name}, ${phone}\n`;

    const encoded = encodeURIComponent(message);
    
    // Встав тут свій реальний номер телефону
    const phoneNum = "380933923810"; 
    
    if (platform === 'tg') {
        window.open(`https://t.me/vartagear?text=${encoded}`);
    } else {
        window.open(`https://wa.me/${phoneNum}?text=${encoded}`);
    }
}

// --- ІНТЕРФЕЙСНІ ФУНКЦІЇ ---
function toggleMobileMenu(show) {
    const menu = document.getElementById('mobile-menu');
    const overlay = document.getElementById('body-overlay');
    if (show) {
        menu.classList.add('open');
        overlay.classList.add('active');
    } else {
        menu.classList.remove('open');
        overlay.classList.remove('active');
    }
}

function toggleCart(show) {
    const cartMenu = document.getElementById('cart-sidebar');
    const overlay = document.getElementById('body-overlay');
    if (show) {
        cartMenu.classList.add('active');
        overlay.classList.add('active');
    } else {
        cartMenu.classList.remove('active');
        overlay.classList.remove('active');
    }
}

function initFAQ() {
    document.querySelectorAll('.faq-question').forEach(q => {
        q.addEventListener('click', () => {
            q.parentElement.classList.toggle('active');
        });
    });
}

// Перевірка хешу в URL (для відкриття товару за прямим посиланням)
function checkUrlHash() {
    const hash = window.location.hash.substring(1);
    if (hash) {
        const product = allProducts.find(p => p.VendorCode === hash || p.myUniqueId == hash);
        if (product) openModal(product.myUniqueId);
    }
}