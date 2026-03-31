const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQbyMki6lBczqgrhuK20OMPP-XeXjGEeDHPqJCPR84MMMOYvGrqU4Y-stTmajVxW55cpgUJ-199Hu7M/pub?gid=1194843878&single=true&output=csv';
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
        
        // 1. Додаємо товар у масив кошика
        cart.push({ ...p, selectedSize: sel.value });
        
        // 2. ЗБЕРІГАЄМО ОНОВЛЕНИЙ МАСИВ У ПАМ'ЯТЬ (localStorage)
        localStorage.setItem('varta_cart', JSON.stringify(cart));
        
        // 3. НАДСИЛАЄМО ПОДІЮ В GOOGLE ANALYTICS 4
        if (typeof gtag === 'function') {
            const productPrice = parseFloat(p.Price) || 0; // Захист від помилок у ціні
            gtag('event', 'add_to_cart', {
                currency: 'UAH',
                value: productPrice,
                items: [{
                    item_id: String(p.myId),
                    item_name: p.Name,
                    item_category: p.Category,
                    item_variant: sel.value,
                    price: productPrice,
                    quantity: 1
                }]
            });
        }

        // 4. Оновлюємо інтерфейс
        updateCartUI();
        closeModal();
        showToast(p.Name);
        
        // Якщо захочете автоматично відкривати кошик — розкоментуйте нижче:
        // toggleCart(true);
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
                Badge: p.Badge ? p.Badge.trim().toUpperCase() : "",
                // Перетворюємо пріоритет у число (якщо пусто — буде 999)
                Priority: parseInt(p.Priority) || 999 
            }));

            // 2. Розумне сортування
            // 2. Розумне сортування (SALE -> TOP -> Пріоритет 1,2...)
            allProducts.sort((a, b) => {
                // 1. Спочатку перевіряємо SALE (він найголовніший)
                if (a.Badge === 'SALE' && b.Badge !== 'SALE') return -1;
                if (b.Badge === 'SALE' && a.Badge !== 'SALE') return 1;
                
                // 2. Далі йде TOP
                if (a.Badge === 'TOP' && b.Badge !== 'TOP') return -1;
                if (b.Badge === 'TOP' && a.Badge !== 'TOP') return 1;

                // 3. Якщо статуси однакові або їх немає — сортуємо за цифрами (1, 2, 3...)
                return a.Priority - b.Priority;
            });
            
            // 3. Копіюємо у відфільтровані товари для початкового показу
            filteredProducts = [...allProducts];

            // 4. Оновлюємо інтерфейс
            renderCatalog();       // Малюємо основну сітку
            buildCategoryTree();   // Будуємо меню категорій
            renderSaleCarousel();  // ЗАПУСКАЄМО КАРУСЕЛЬ SALE

            // 5. Перевірка URL-параметрів
            const params = new URLSearchParams(window.location.search);
            const prodId = params.get('product');
            if (prodId !== null) {
                setTimeout(() => openModal(parseInt(prodId), false), 300); 
            }
        },
        error: function(err) { 
            console.error("Помилка завантаження CSV:", err); 
        }
    });
}
// ==========================================
// 1. ОНОВЛЕНИЙ РЕНДЕР КАТАЛОГУ (НОВИНКИ + СЕЙЛ У КАРУСЕЛІ)
// ==========================================
function renderCatalog(page = 1) {
    const catalog = document.getElementById('catalog');
    const pagination = document.getElementById('pagination');
    const carouselSection = document.getElementById('main-sale-carousel');
    
    let productsToShow = [...filteredProducts];
    
    // Перевіряємо, чи ми на самій першій сторінці (без фільтрів і категорій)
    const isMainPage = 
        (!window.currentCategory || window.currentCategory === 'all') && 
        (!window.currentSearchQuery || window.currentSearchQuery === '') && 
        (!window.currentBadgeFilter || window.currentBadgeFilter === 'all');

    if (isMainPage) {
        if (carouselSection) carouselSection.style.display = 'block'; // Карусель показуємо
        
        // ХОВАЄМО з сітки і SALE (бо вони в каруселі), і NEW (бо вони чекають на клік по кнопці)
        productsToShow = productsToShow.filter(p => p.Badge !== 'SALE' && p.Badge !== 'NEW');
    } else {
        if (carouselSection) carouselSection.style.display = 'none'; // Ховаємо карусель
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
        // Визначаємо статуси
        const isSale = p.Badge === 'SALE';
        const isNew = p.Badge === 'NEW';
        const isTop = p.Badge === 'TOP';
        
        let cardClass = 'card';
        let badgeHTML = '';
        let btnClass = 'buy-btn-card';

        // Призначаємо дизайн залежно від бейджа
        if (isSale) {
            cardClass = 'card sale-card';
            badgeHTML = `<div class="badge-sale">🔥 SALE</div>`;
            btnClass = 'buy-btn-card buy-btn-sale';
        } else if (isNew) {
            cardClass = 'card new-card';
            badgeHTML = `<div class="badge-new">✨ НОВИНКА</div>`;
            btnClass = 'buy-btn-card buy-btn-new';
        } else if (isTop) {
            cardClass = 'card top-card';
            badgeHTML = `<div class="badge-top">🏆 ТОП ПРОДАЖІВ</div>`;
            btnClass = 'buy-btn-card buy-btn-top';
        }

        // УНІВЕРСАЛЬНА ЦІНА (з червоним закресленням для ВСІХ товарів, якщо є OldPrice)
        let priceHTML = '';
        if (p.OldPrice) {
            priceHTML = `
            <div class="global-price-box">
                <span class="old-price-global">${p.OldPrice} грн</span>
                <span class="current-price" ${isSale ? 'style="color: var(--sale);"' : ''}>${p.Price} грн</span>
            </div>`;
        } else {
            priceHTML = `
            <div class="global-price-box">
                <span class="current-price" ${isSale ? 'style="color: var(--sale);"' : ''}>${p.Price} грн</span>
            </div>`;
        }

        const mainPic = p.Pictures ? p.Pictures.split(',')[0].trim() : '';
        
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
    // Беремо опис, і якщо він є — робимо всі літери ВЕЛИКИМИ
// Беремо опис товару
    let descriptionText = p.Description || 'Опис очікується...';

    // Прибираємо артефакти &nbsp; та замінюємо їх на звичайний пробіл
    descriptionText = descriptionText.replace(/&nbsp;/g, ' ');

    // Вставляємо чистий HTML (заголовки стануть великими завдяки CSS)
    document.getElementById('modal-desc').innerHTML = descriptionText;
    
    // Залишаємо артикул без змін
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
    // 1. Повідомляємо системі, що ми в категорії
    window.currentCategory = val;
    // 2. Скидаємо інші фільтри, щоб вони не перетиналися
    window.currentSearchQuery = ''; 
    window.currentBadgeFilter = 'all'; 

    // 3. Фільтруємо масив товарів
    filteredProducts = allProducts.filter(p => type === 'cat' ? p.Category === val : p.SubCategory === val);
    
    // 4. Оновлюємо інтерфейс
    currentPage = 1; 
    renderCatalog(); 
    toggleMobileMenu(false);
}

function filterByBadge(badge, btn) {
    document.querySelectorAll('.filter-tag').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Запам'ятовуємо фільтр
    window.currentBadgeFilter = badge; 
    
    // Якщо це не 'all', примусово робимо текст великими літерами для порівняння
    const badgeToCompare = badge === 'all' ? 'all' : badge.toUpperCase();
    
    filteredProducts = badge === 'all' ? 
        [...allProducts] : 
        allProducts.filter(p => p.Badge === badgeToCompare);
        
    currentPage = 1; 
    renderCatalog();
}

function resetPageAndFilter() {
    const q = document.getElementById('search-input').value.toLowerCase().trim();
    
    // 1. Повідомляємо системі, що ми шукаємо текст
    window.currentSearchQuery = q;
    // 2. Скидаємо категорії та бейджі
    window.currentCategory = 'all'; 
    window.currentBadgeFilter = 'all'; 

    // 3. Шукаємо по назві або артикулу
    filteredProducts = allProducts.filter(p => p.Name.toLowerCase().includes(q) || (p.VendorCode || "").toLowerCase().includes(q));
    
    // 4. Малюємо результати
    currentPage = 1; 
    renderCatalog();
}

// ==========================================
// ПАГІНАЦІЯ ТА ПЕРЕХІД МІЖ СТОРІНКАМИ
// ==========================================
// ==========================================
// РОЗУМНА ПАГІНАЦІЯ (Ховає зайві сторінки під ...)
// ==========================================
function renderPagination(totalItems, currentPage) {
    const itemsPerPage = 12; 
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const paginationBar = document.getElementById('pagination');

    if (totalPages <= 1) {
        paginationBar.innerHTML = '';
        return;
    }

    let html = '';
    const range = 1; // Скільки сторінок показувати з боків від поточної
    
    // Кнопка "Назад" (якщо ми не на 1 сторінці)
    if (currentPage > 1) {
        html += `<button class="page-btn" onclick="goToPage(${currentPage - 1})">❮</button>`;
    }

    for (let i = 1; i <= totalPages; i++) {
        // Завжди показуємо першу, останню та сусідні з поточною сторінки
        if (i === 1 || i === totalPages || (i >= currentPage - range && i <= currentPage + range)) {
            const activeClass = (i === currentPage) ? 'active' : '';
            html += `<button class="page-btn ${activeClass}" onclick="goToPage(${i})">${i}</button>`;
        } 
        // Додаємо три крапки, якщо є розрив у цифрах
        else if (i === currentPage - range - 1 || i === currentPage + range + 1) {
            html += `<span class="page-dots">...</span>`;
        }
    }

    // Кнопка "Вперед" (якщо ми не на останній сторінці)
    if (currentPage < totalPages) {
        html += `<button class="page-btn" onclick="goToPage(${currentPage + 1})">❯</button>`;
    }
    
    paginationBar.innerHTML = html;
}

// Функція для плавного перемикання та правильного скролу
function goToPage(pageNumber) {
    // 1. Малюємо нову сторінку з товарами
    renderCatalog(pageNumber); 
    
    // 2. Шукаємо блок фільтрів або пошуку, щоб прокрутити екран до нього
    const filtersBlock = document.querySelector('.quick-filters');
    const searchBlock = document.querySelector('.main-search-wrapper');
    
    // Плавний скрол (щоб клієнт не губився, а бачив початок списку товарів)
    if (filtersBlock) {
        filtersBlock.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (searchBlock) {
        searchBlock.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
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

function submitOrder(platform, event) {
    // Зупиняємо стандартну поведінку кнопки, щоб не кидало в порожній чат при помилках
    if (event) event.preventDefault(); 

    try {
        if (cart.length === 0) {
            alert("Кошик порожній!");
            return;
        }
        
        // Перевіряємо, чи всі текстові поля існують
        const nameEl = document.getElementById('order-name');
        const phoneEl = document.getElementById('order-phone');
        const cityEl = document.getElementById('order-city');
        const npEl = document.getElementById('order-np');

        if (!nameEl || !phoneEl || !cityEl || !npEl) {
            alert("Системна помилка: Не знайдено поля форми в HTML.");
            return;
        }

        const name = nameEl.value.trim();
        const phone = phoneEl.value.trim();
        const city = cityEl.value.trim();
        const np = npEl.value.trim();
        
        // БЕЗПЕЧНЕ отримання оплати (фікс для повної оплати)
        const paymentRadio = document.querySelector('input[name="payment-method"]:checked');
        const paymentMethod = paymentRadio ? paymentRadio.value : "Не вказано";

        if (!name || !phone || !city || !np) {
            alert('Будь ласка, заповніть всі поля для доставки!');
            return;
        }

        let txt = "🪖 НОВЕ ЗАМОВЛЕННЯ VARTA GEAR:\n\n";
        cart.forEach((it, i) => { 
            txt += `${i+1}. ${it.Name} (Розмір: ${it.selectedSize}) - ${it.Price} грн\n`; 
        });
        
        const totalEl = document.getElementById('cart-total-price');
        const total = totalEl ? totalEl.innerText : "0";

        txt += `\n💰 РАЗОМ: ${total} грн\n\n`;
        
        txt += `📦 ДАНІ ДОСТАВКИ:\n`;
        txt += `👤 ПІБ: ${name}\n`;
        txt += `📞 Тел: ${phone}\n`;
        txt += `🏙 Місто: ${city}\n`;
        txt += `📮 Відділення НП: ${np}\n`;
        txt += `💳 Оплата: ${paymentMethod}\n`;

        const encoded = encodeURIComponent(txt);
        
        // Відправляємо тільки в TG або WA
        if (platform === 'tg') {
            window.open(`https://t.me/vartagear?text=${encoded}`);
        } else if (platform === 'wa') {
            window.open(`https://wa.me/+380933923810?text=${encoded}`);
        }
    } catch (error) {
        // Якщо стається якась помилка, ми побачимо її тут!
        console.error("Помилка формування замовлення:", error);
        alert("Сталася помилка: " + error.message);
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


// ==========================================
// 3. УПРАВЛІННЯ КАРУСЕЛЛЮ: СВАЙП (ТАЧ) + СТРІЛКИ
// ==========================================
let touchStartX = 0;
let touchEndX = 0;

// Чекаємо завантаження сторінки
document.addEventListener('DOMContentLoaded', () => {
    const carouselViewport = document.querySelector('.carousel-3d-viewport');
    
    if (carouselViewport) {
        // Засікаємо, де палець торкнувся екрану
        carouselViewport.addEventListener('touchstart', e => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        // Засікаємо, де палець відірвався від екрану
        carouselViewport.addEventListener('touchend', e => {
            touchEndX = e.changedTouches[0].screenX;
            handleCarouselSwipe();
        }, { passive: true });
    }
});

// Перевіряємо напрямок свайпу і крутимо карусель
function handleCarouselSwipe() {
    const swipeThreshold = 45; // Чутливість свайпу (мінімальна відстань у пікселях)
    
    if (touchEndX < touchStartX - swipeThreshold) {
        moveCarousel3D(1); // Свайпнули вліво -> Наступний товар
    }
    
    if (touchEndX > touchStartX + swipeThreshold) {
        moveCarousel3D(-1); // Свайпнули вправо -> Попередній товар
    }
}

// Додаємо змінні для автоплею десь біля current3DIndex
let autoplayTimer;

// Функція запуску
function startAutoplay() {
    stopAutoplay(); // Очищаємо старий таймер, щоб вони не накладалися
    autoplayTimer = setInterval(() => {
        moveCarousel3D(1); // Карусель робить крок вправо кожні 4 секунди
    }, 4000); // 4000 мілісекунд = 4 секунди
}

// Функція зупинки
function stopAutoplay() {
    clearInterval(autoplayTimer);
}

// Додаємо "розумну" зупинку, коли клієнт взаємодіє з каруселлю
document.addEventListener('DOMContentLoaded', () => {
    const carouselViewport = document.querySelector('.carousel-3d-viewport');
    
    if (carouselViewport) {
        // ЗУПИНЯЄМО, коли клієнт наводить мишку або торкається пальцем
        carouselViewport.addEventListener('mouseenter', stopAutoplay);
        carouselViewport.addEventListener('touchstart', stopAutoplay, { passive: true });
        
        // ЗАПУСКАЄМО ЗНОВУ, коли клієнт забирає мишку/палець
        carouselViewport.addEventListener('mouseleave', startAutoplay);
        carouselViewport.addEventListener('touchend', startAutoplay, { passive: true });
    }
});

// ==========================================
// 5. СПЛИВАЮЧЕ ПОВІДОМЛЕННЯ (TOAST)
// ==========================================
function showToast(productName) {
    const toast = document.getElementById('toast-notification');
    const msg = document.getElementById('toast-message');
    
    if (!toast || !msg) return; // Захист від помилок

    // Обрізаємо занадто довгі назви, щоб не ламався дизайн
    const shortName = productName.length > 25 ? productName.substring(0, 25) + '...' : productName;
    
    // Вставляємо текст
    msg.innerHTML = `<strong>${shortName}</strong> додано у кошик!`;
    
    // Показуємо (виїжджає знизу)
    toast.classList.add('show');
    
    // Ховаємо через 3 секунди
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ==========================================
// БЕЗКІНЕЧНА СТРІЧКА ВІДГУКІВ
// ==========================================
const customerReviews = [
    { name: "Олександр", text: "Замовляв фліску та штани. Якість топ, розмір підійшов ідеально. Відправили в той же день. Рекомендую!", rating: 5 },
    { name: "Максим", text: "Дуже зручна амуніція. Матеріали міцні, шви надійні. Окрема подяка менеджеру за детальну консультацію.", rating: 5 },
    { name: "Андрій", text: "Брав тактичні кросівки. Вже місяць в жорстких умовах - політ нормальний. Ноги не парять і не промокають.", rating: 5 },
    { name: "Дмитро", text: "Швидка доставка. Якість форми перевершила очікування, тканина ріп-стоп дійсно міцна. Слава Україні!", rating: 5 },
    { name: "Віталій", text: "Замовляв рюкзак і пару підсумків. Все прийшло швидко, фурнітура якісна. Буду замовляти тут ще.", rating: 5 },
    { name: "Сергій", text: "Куртка супер, не продувається і добре тримає тепло. Дякую магазину Varta Gear за вашу надійну роботу.", rating: 5 },
    { name: "Ігор", text: "Відмінний магазин тактичного спорядження. Адекватні ціни і дійсно якісний товар, який не підведе.", rating: 5 }
];

function renderReviews() {
    const track = document.getElementById('reviews-track');
    if (!track) return;

    // Створюємо HTML для карток
    const cardsHTML = customerReviews.map(r => `
        <div class="review-card">
            <div class="review-header">
                <div class="reviewer-avatar"><i class="fas fa-user-shield"></i></div>
                <div class="reviewer-info">
                    <h4>${r.name}</h4>
                    <div class="stars">${'★'.repeat(r.rating)}</div>
                </div>
                <i class="fas fa-quote-right quote-icon"></i>
            </div>
            <p class="review-text">"${r.text}"</p>
        </div>
    `).join('');

    // ДУБЛЮЄМО контент (вставляємо двічі), щоб стрічка крутилася безкінечно без ривків
    track.innerHTML = cardsHTML + cardsHTML;
}

// Запускаємо рендер відгуків при завантаженні сторінки
document.addEventListener('DOMContentLoaded', () => {
    renderReviews(); // Викликаємо нашу функцію
});

// Функція для генерації "З цим також купують"
function renderCrossSell(currentProduct) {
    const csSection = document.getElementById('cross-sell-section');
    const csGrid = document.getElementById('cross-sell-grid');
    
    // 1. Відкидаємо поточний товар, щоб не показувати його ж
    let available = allProducts.filter(p => p.myId !== currentProduct.myId);
    
    // 2. Вибираємо пріоритетні товари (ТОП та Акції)
    let priorityItems = available.filter(p => p.Badge === 'TOP' || p.Badge === 'SALE');
    
    // 3. Перемішуємо їх випадковим чином
    priorityItems.sort(() => 0.5 - Math.random());
    
    // 4. Беремо 4 штуки
    let recommendations = priorityItems.slice(0, 4);
    
    // 5. Якщо ТОПів менше 4-х, добираємо рандомні товари з тієї ж категорії
    if (recommendations.length < 4) {
        let sameCat = available.filter(p => p.Category === currentProduct.Category && !recommendations.includes(p));
        sameCat.sort(() => 0.5 - Math.random());
        
        recommendations = [...recommendations, ...sameCat].slice(0, 4);
    }
    
    // Якщо взагалі немає що запропонувати (буває при порожній базі)
    if (recommendations.length === 0) {
        csSection.style.display = 'none';
        return;
    }

    // Показуємо секцію і малюємо картки
    csSection.style.display = 'block';
    csGrid.innerHTML = recommendations.map(p => {
        const pic = p.Pictures ? p.Pictures.split(',')[0].trim() : '';
        return `
        <div class="cs-card" onclick="openModal(${p.myId}, false)">
            <div class="cs-img-wrap">
                <img src="${pic}" alt="${p.Name}">
            </div>
            <div class="cs-info">
                <h4>${p.Name}</h4>
                <div class="cs-price">${p.Price} грн</div>
            </div>
        </div>
        `;
    }).join('');
}