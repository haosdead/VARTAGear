const CSV_URL = 'data.csv';
const ITEMS_PER_PAGE = 21;

let allProducts = [], filteredProducts = [], cart = [], currentPage = 1;
let currentModalPics = [], currentModalPicIndex = 0;

document.addEventListener('DOMContentLoaded', () => {
    // Спочатку дістаємо дані з пам'яті браузера
    const savedCart = localStorage.getItem('varta_cart');
    if (savedCart) {
        cart = JSON.parse(savedCart);
    }
    
    // Оновлюємо інтерфейс (лічильник та список)
    updateCartUI();
    
    // Завантажуємо товари
    loadCSV();
});

// ========================================================
// 2. ДОДАВАННЯ: Оновлена функція з записом у пам'ять
// ========================================================
// Примітка: переконайтеся, що всередині вашої функції openModal 
// код натискання на кнопку виглядає саме так:
function setupAddToCart(p, sel) {
    document.getElementById('modal-add-btn').onclick = () => {
        if (!sel.value) return alert('Оберіть розмір!');
        
        // Додаємо товар у масив
        cart.push({ ...p, selectedSize: sel.value });
        
        // ЗБЕРІГАЄМО ОНОВЛЕНИЙ МАСИВ У ПАМ'ЯТЬ
        localStorage.setItem('varta_cart', JSON.stringify(cart));
        
        updateCartUI();
        closeModal();
        toggleCart(true);
    };
}

function loadCSV() {
    Papa.parse(CSV_URL, {
        download: true, 
        header: true, 
        skipEmptyLines: true,
        complete: function(res) {
            // 1. Парсинг даних та підготовка об'єктів
            allProducts = res.data.filter(p => p.Name).map((p, i) => ({
                ...p,
                myId: i,
                Price: parseFloat(p.Price) || 0,
                OldPrice: p.OldPrice ? parseFloat(p.OldPrice) || null : null,
                Badge: p.Badge ? p.Badge.trim().toUpperCase() : ""
            }));

            // 2. Сортування (SALE завжди вище в загальному списку)
            allProducts.sort((a, b) => (b.Badge === 'SALE') - (a.Badge === 'SALE'));
            
            // 3. Копіюємо у відфільтровані товари для початкового показу
            filteredProducts = [...allProducts];

            // 4. Оновлюємо інтерфейс
            renderCatalog();       // Малюємо основну сітку
            buildCategoryTree();   // Будуємо меню категорій
            renderSaleCarousel();  // ЗАПУСКАЄМО КАРУСЕЛЬ SALE (НОВЕ)

            // 5. Перевірка URL-параметрів (якщо хтось перейшов за посиланням на конкретний товар)
            const params = new URLSearchParams(window.location.search);
            const prodId = params.get('product');
            if (prodId !== null) {
                // Невелика затримка, щоб все встигло провантажитись перед відкриттям модалки
                setTimeout(() => openModal(parseInt(prodId), false), 300); 
            }
        },
        error: function(err) { 
            console.error("Помилка завантаження CSV:", err); 
        }
    });
}

// ==========================================
// 1. ОНОВЛЕНИЙ РЕНДЕР КАТАЛОГУ (Логіка приховування)
// ==========================================
// 1. ОНОВЛЕНИЙ РЕНДЕР КАТАЛОГУ (Логіка приховування SALE)
// ==========================================
// ==========================================
// 1. ОНОВЛЕНИЙ РЕНДЕР КАТАЛОГУ (Повернули кнопку КУПИТИ)
// ==========================================
function renderCatalog(page = 1) {
    const catalog = document.getElementById('catalog');
    const pagination = document.getElementById('pagination');
    const carouselSection = document.getElementById('main-sale-carousel');
    
    let productsToShow = [...filteredProducts];
    
    const isMainPage = 
        (!window.currentCategory || window.currentCategory === 'all') && 
        (!window.currentSearchQuery || window.currentSearchQuery === '') && 
        (!window.currentBadgeFilter || window.currentBadgeFilter === 'all');

    if (isMainPage) {
        if (carouselSection) carouselSection.style.display = 'block';
        productsToShow = productsToShow.filter(p => p.Badge !== 'SALE');
    } else {
        if (carouselSection) carouselSection.style.display = 'none';
    }

    if (productsToShow.length === 0) {
        catalog.innerHTML = '<p style="text-align:center; grid-column:1/-1; color:#888;">Товарів не знайдено.</p>';
        pagination.innerHTML = '';
        return;
    }

    const itemsPerPage = 12; 
    const start = (page - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const paginated = productsToShow.slice(start, end);

    catalog.innerHTML = paginated.map(p => {
        const isSale = p.Badge === 'SALE';
        const cardClass = isSale ? 'card sale-card' : 'card';
        const badgeHTML = isSale ? `<div class="badge-sale">🔥 SALE</div>` : (p.Badge ? `<div class="badge-top">⭐ ТОП</div>` : '');
        
        const priceHTML = isSale ? 
            `<div class="price-box-sale"><span class="old-price">${p.OldPrice} грн</span><span class="current-price">${p.Price} грн</span></div>` :
            `<div class="price-box"><span class="current-price">${p.Price} грн</span></div>`;
            
        const mainPic = p.Pictures ? p.Pictures.split(',')[0].trim() : '';
        
        // Визначаємо стиль кнопки (зелена для звичайних, червона для SALE)
        const btnClass = isSale ? 'buy-btn-card buy-btn-sale' : 'buy-btn-card';
        
        return `
        <div class="${cardClass}" onclick="openModal(${p.myId})">
            <div class="card-img-wrap">
                ${badgeHTML}
                <img src="${mainPic}" alt="${p.Name}" loading="lazy">
            </div>
            <div class="card-info">
                <h4>${p.Name}</h4>
                ${priceHTML}
                <button class="${btnClass}"><i class="fas fa-shopping-cart"></i> КУПИТИ</button>
            </div>
        </div>`;
    }).join('');

    renderPagination(productsToShow.length, page);
}

// ==========================================
// 2. УЛЬОТНА 3D КАРУСЕЛЬ (Логіка)
// ==========================================


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

function toggleCategory(catGroupElement) {
    catGroupElement.classList.toggle('active');
}

// =================== ОНОВЛЕНА openModal ===================
function openModal(id, updateUrl = true) {
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

    // ВІШАЄМО ОБРОБНИК КЛІКУ НА КНОПКУ "ДОДАТИ В КОШИК"
    document.getElementById('modal-add-btn').onclick = () => {
        if (!sel.value) return alert('Оберіть розмір!');
        
        // Додаємо товар у масив
        cart.push({ ...p, selectedSize: sel.value });
        
        // ЗБЕРІГАЄМО ОНОВЛЕНИЙ МАСИВ У ПАМ'ЯТЬ
        localStorage.setItem('varta_cart', JSON.stringify(cart));
        
        updateCartUI();
        closeModal();
        toggleCart(true);
    };

    // Оновлення URL (унікальне посилання на товар)
    if (updateUrl) {
        const url = new URL(window.location);
        url.searchParams.set('product', id);
        window.history.pushState({ productId: id }, '', url);
    }
}
// Додайте цю нову функцію в кінець script.js
// Функція розгортання/згортання опису
function toggleModalDescription() {
    const descEl = document.getElementById('modal-desc');
    const containerEl = document.getElementById('modal-desc-container');
    const textEl = document.getElementById('desc-toggle-text');

    descEl.classList.toggle('expanded');
    containerEl.classList.toggle('active');

    if (containerEl.classList.contains('active')) {
        textEl.innerText = 'Згорнути';
    } else {
        textEl.innerText = 'Розгорнути';
    }
}

function updateModalGallery() {
    if(currentModalPics.length === 0) return;
    document.getElementById('modal-main-img').src = currentModalPics[currentModalPicIndex] || '';
    document.getElementById('modal-thumbnails').innerHTML = currentModalPics.map((src, i) => 
        `<img src="${src}" class="${i === currentModalPicIndex ? 'active' : ''}" onclick="setModalPic(${i})" alt="thumb">`).join('');
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
    
    if (totalPages <= 1) { 
        container.innerHTML = ''; 
        return; 
    }

    let html = '';
    if (currentPage > 1) {
        html += `<button class="page-btn" onclick="changePage(${currentPage - 1})">❮</button>`;
    }
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
        } else if (i === currentPage - 2 || i === currentPage + 2) {
            html += `<span class="page-dots">...</span>`;
        }
    }
    if (currentPage < totalPages) {
        html += `<button class="page-btn" onclick="changePage(${currentPage + 1})">❯</button>`;
    }
    container.innerHTML = html;
}

function changePage(page) {
    currentPage = page;
    renderCatalog();
    window.scrollTo(0,0);
}

// =================== ЛОГІКА КОШИКА ТА ОФОРМЛЕННЯ ===================
function updateCartUI() {
    // Оновлюємо число на іконці кошика
    const cartCount = document.getElementById('cart-count');
    if (cartCount) cartCount.innerText = cart.length;

    const content = document.getElementById('cart-content');
    const footer = document.getElementById('cart-footer');
    
    if (cart.length === 0) {
        content.innerHTML = '<div style="text-align:center; padding:50px 0; color:#666; user-select:none;">Кошик порожній</div>';
        if (footer) footer.style.display = 'none';
        
        // Видаляємо ключ з пам'яті зовсім, якщо кошик порожній
        localStorage.removeItem('varta_cart');
    } else {
        if (footer) footer.style.display = 'block';
        let total = 0;
        
        content.innerHTML = cart.map((it, i) => {
            total += parseFloat(it.Price);
            return `
            <div class="cart-item">
                <div class="cart-item-info">
                    <span class="cart-item-title">${it.Name.toUpperCase()}</span>
                    <span class="cart-item-meta">Розмір: ${it.selectedSize}</span>
                    <span class="cart-item-price">${it.Price} грн</span>
                </div>
                <span class="cart-item-remove" onclick="removeFromCart(${i})"><i class="fas fa-times"></i></span>
            </div>`;
        }).join('');
        
        // Оновлюємо ціни в усіх блоках
        const totalPriceEl = document.getElementById('cart-total-price');
        const finalPriceEl = document.getElementById('final-total-price');
        
        if (totalPriceEl) totalPriceEl.innerText = total;
        if (finalPriceEl) finalPriceEl.innerText = total;
    }
}

function removeFromCart(i) {
    // Видаляємо елемент з масиву
    cart.splice(i, 1);
    
    // Оновлюємо пам'ять (якщо масив порожній, запишеться [])
    localStorage.setItem('varta_cart', JSON.stringify(cart));
    
    updateCartUI();
}

function showCheckoutForm() {
    document.getElementById('cart-items-container').style.display = 'none';
    document.getElementById('checkout-form-container').style.display = 'block';
}

function hideCheckoutForm() {
    document.getElementById('cart-items-container').style.display = 'block';
    document.getElementById('checkout-form-container').style.display = 'none';
}

function submitOrder(platform) {
    if (cart.length === 0) return;
    
    const name = document.getElementById('order-name').value.trim();
    const phone = document.getElementById('order-phone').value.trim();
    const city = document.getElementById('order-city').value.trim();
    const np = document.getElementById('order-np').value.trim();
    const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;

    if (!name || !phone || !city || !np) {
        alert('Будь ласка, заповніть всі поля для доставки!');
        return;
    }

    let txt = "🪖 НОВЕ ЗАМОВЛЕННЯ VARTA GEAR:\n\n";
    cart.forEach((it, i) => { 
        txt += `${i+1}. ${it.Name} (Розмір: ${it.selectedSize}) - ${it.Price} грн\n`; 
    });
    
    const total = document.getElementById('cart-total-price').innerText;
    txt += `\n💰 РАЗОМ: ${total} грн\n\n`;
    
    txt += `📦 ДАНІ ДОСТАВКИ:\n`;
    txt += `👤 ПІБ: ${name}\n`;
    txt += `📞 Тел: ${phone}\n`;
    txt += `🏙 Місто: ${city}\n`;
    txt += `📮 Відділення НП: ${np}\n`;
    txt += `💳 Оплата: ${paymentMethod}\n`;

    const encoded = encodeURIComponent(txt);
    if(platform === 'tg') {
        window.open(`https://t.me/vartagear?text=${encoded}`);
    } else {
        window.open(`https://wa.me/+380933923810?text=${encoded}`);
    }
}

// Функція для блоку довіри (Ovals)
function openTrustInfo(type) {
    const messages = {
        warranty: "Політика VARTA GEAR:\nВи можете обміняти або повернути товар протягом 14 днів, якщо він не був у вжитку та збережено товарний вигляд. Ми цінуємо нашу репутацію.",
        payment: "Безпечна оплата:\nМи відправляємо накладеним платежем через Нову Пошту. Ви оглядаєте товар у відділенні і платите тільки якщо все влаштовує.",
        support: "Консультація 24/7:\nНаші менеджери завжди на зв'язку в Telegram та WhatsApp, щоб допомогти з вибором розміру або спорядження."
    };
    alert(messages[type] || "Деталі уточнюйте у менеджера.");
}

// Допоміжні функції інтерфейсу
function toggleMobileMenu(s) { document.getElementById('mobile-menu').classList.toggle('active', s); document.getElementById('body-overlay').classList.toggle('active', s); document.body.style.overflow = s ? 'hidden' : 'auto'; }
function toggleCart(s) { document.getElementById('cart-sidebar').classList.toggle('active', s); document.getElementById('body-overlay').classList.toggle('active', s); document.body.style.overflow = s ? 'hidden' : 'auto'; }
function closeModal(updateUrl = true) { 
    document.getElementById('product-modal').style.display = 'none'; 
    document.getElementById('body-overlay').classList.remove('active'); 
    document.body.style.overflow = 'auto'; 
    
    // НОВЕ: Прибираємо товар з посилання
    if (updateUrl) {
        const url = new URL(window.location);
        url.searchParams.delete('product');
        window.history.pushState({}, '', url);
    }
}
function closeAllPanels() { toggleMobileMenu(false); toggleCart(false); closeModal(); }
function resetFilters() { document.getElementById('search-input').value = ''; filterByBadge('all', document.querySelector('.filter-tag')); }
function toggleModalDescription() {
    const descEl = document.getElementById('modal-desc');
    const containerEl = document.getElementById('modal-desc-container');
    descEl.classList.toggle('expanded');
    containerEl.classList.toggle('active'); // Повертає іконку стрілки
}
// =================== ПЛАВНА ПРОКРУТКА ВГОРУ ===================
window.onscroll = function() {
    const btn = document.getElementById("scrollTopBtn");
    // Показувати кнопку, якщо прокрутили більше 400 пікселів вниз
    if (document.body.scrollTop > 400 || document.documentElement.scrollTop > 400) {
        btn.style.display = "flex";
    } else {
        btn.style.display = "none";
    }
};

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =================== НАВІГАЦІЯ БРАУЗЕРА (КНОПКА НАЗАД) ===================
window.addEventListener('popstate', () => {
    const params = new URLSearchParams(window.location.search);
    const prodId = params.get('product');
    
    if (prodId !== null) {
        // Якщо натиснули "Вперед" і там є товар
        openModal(parseInt(prodId), false); 
    } else {
        // Якщо натиснули "Назад" на головну сторінку - ховаємо всі панелі
        closeModal(false);
        toggleMobileMenu(false);
        toggleCart(false);
    }
});


function renderSaleCarousel() {
    const track = document.getElementById('sale-carousel-track');
    if (!track) return;

    carouselItemsData = allProducts.filter(p => p.Badge === 'SALE');
    if (carouselItemsData.length === 0) {
        document.getElementById('main-sale-carousel').style.display = 'none';
        return;
    }

    track.innerHTML = carouselItemsData.map((p, i) => {
        const mainPic = p.Pictures ? p.Pictures.split(',')[0].trim() : '';
        return `
        <div class="carousel-3d-item" onclick="openModal(${p.myId})">
            <div class="badge-sale" style="top:10px; left:10px;">🔥 SALE</div>
            <img src="${mainPic}" class="carousel-img" alt="${p.Name}" loading="lazy">
            <div class="carousel-info">
                <h4>${p.Name.toUpperCase()}</h4>
                <div class="price-box-sale">
                    <span class="old-price" style="font-size:12px;">${p.OldPrice ? p.OldPrice + ' грн' : ''}</span>
                    <span class="current-price" style="font-size:18px; text-shadow:none;">${p.Price} грн</span>
                </div>
                <button class="btn-buy-carousel"><i class="fas fa-shopping-cart"></i> КУПИТИ</button>
            </div>
        </div>`;
    }).join('');

    current3DIndex = 0; 
    update3DCarousel();
}

function moveCarousel3D(direction) {
    if (carouselItemsData.length === 0) return;
    current3DIndex += direction;
    
    // Зациклення: якщо дійшли до кінця - йдемо на початок і навпаки
    if (current3DIndex < 0) current3DIndex = carouselItemsData.length - 1;
    if (current3DIndex >= carouselItemsData.length) current3DIndex = 0;
    
    update3DCarousel();
}

function update3DCarousel() {
    const items = document.querySelectorAll('.carousel-3d-item');
    if (items.length === 0) return;

    const isMobile = window.innerWidth <= 767;
    const offsetBase = isMobile ? 120 : 250; 
    // Зменшуємо кут для Android, щоб легше було малювати 3D
    const rotateBase = isMobile ? 25 : 45;   

    items.forEach((item, index) => {
        let offset = index - current3DIndex;
        if (offset > Math.floor(items.length / 2)) offset -= items.length;
        if (offset < -Math.floor(items.length / 2)) offset += items.length;

        // Залізно вимикаємо blur всюди, щоб не вантажити телефон
        item.style.filter = 'none';

        if (offset === 0) {
            // АКТИВНА КАРТКА
            // Використовуємо translate3d для GPU-прискорення
            item.style.transform = `translate3d(0px, 0px, 50px) rotateY(0deg) scale(1)`;
            item.style.zIndex = 10;
            item.style.opacity = 1;
            item.style.pointerEvents = 'auto'; 
            item.classList.add('active-3d');
        } else {
            // БОКОВІ КАРТКИ
            const sign = Math.sign(offset);     
            const absOffset = Math.abs(offset); 
            
            const translateZ = absOffset === 1 ? -150 : -300;
            const scale = absOffset === 1 ? 0.85 : 0.65;
            const opacity = absOffset === 1 ? 0.6 : 0; 
            
            // GPU-прискорений запис через translate3d
            item.style.transform = `translate3d(${sign * offsetBase * absOffset}px, 0px, ${translateZ}px) rotateY(${-sign * rotateBase}deg) scale(${scale})`;
            item.style.zIndex = 10 - absOffset;
            item.style.opacity = opacity;
            item.style.pointerEvents = 'none'; 
            item.classList.remove('active-3d');
        }
    });
}

// Якщо повертають екран телефону - перемальовуємо
window.addEventListener('resize', update3DCarousel);