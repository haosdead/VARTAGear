const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQbyMki6lBczqgrhuK20OMPP-XeXjGEeDHPqJCPR84MMMOYvGrqU4Y-stTmajVxW55cpgUJ-199Hu7M/pub?gid=534882426&single=true&output=csv';
const ITEMS_PER_PAGE = 21;
// === РОЗУМНЕ БЛОКУВАННЯ СКРОЛУ ===
let savedScrollY = 0;

function lockScroll() {
    savedScrollY = window.scrollY; // Запам'ятовуємо, де був клієнт
    document.body.style.position = 'fixed';
    document.body.style.top = `-${savedScrollY}px`;
    document.body.style.width = '100%';
    document.body.classList.add('no-scroll');
}

function unlockScroll() {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    document.body.classList.remove('no-scroll');
    // Миттєво повертаємо клієнта на ту ж висоту
    window.scrollTo({ top: savedScrollY, behavior: 'instant' }); 
}
// ==================================
let allProducts = [], filteredProducts = [], cart = [], currentPage = 1;
let currentModalPics = [], currentModalPicIndex = 0;
let wishlist = JSON.parse(localStorage.getItem('varta_wishlist')) || [];
let recentlyViewed = JSON.parse(localStorage.getItem('varta_recent')) || [];

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

    updateWishlistUI();        // <--- ДОДАЄМО ТУТ (відновлює сердечка)
    renderRecentlyViewedUI();
});

// ========================================================
// 2. ДОДАВАННЯ: Оновлена функція з записом у пам'ять
// ========================================================

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
                // БЕРЕМО СТАБІЛЬНИЙ ID З ТАБЛИЦІ (АБО АРТИКУЛ).
                // Перевіряємо колонку ID, потім SKU. Якщо їх немає - беремо індекс.
                myId: p.ID ? p.ID.toString().trim() : (p.SKU ? p.SKU.toString().trim() : i.toString()),
                Price: parseFloat(p.Price) || 0,
                OldPrice: p.OldPrice ? parseFloat(p.OldPrice) || null : null,
                Badge: p.Badge ? p.Badge.trim().toUpperCase() : "",
                Priority: parseInt(p.Priority) || 999 
            }));

            // 2. Розумне сортування
            allProducts.sort((a, b) => {
                if (a.Badge === 'SALE' && b.Badge !== 'SALE') return -1;
                if (b.Badge === 'SALE' && a.Badge !== 'SALE') return 1;
                if (a.Badge === 'TOP' && b.Badge !== 'TOP') return -1;
                if (b.Badge === 'TOP' && a.Badge !== 'TOP') return 1;
                return a.Priority - b.Priority;
            });
            
            // 3. Копіюємо у відфільтровані товари для початкового показу
            filteredProducts = [...allProducts];

            // 4. Оновлюємо інтерфейс
            renderCatalog();       
            buildCategoryTree();   
            renderSaleCarousel();  

            // 5. Перевірка URL-параметрів (БЕЗ parseInt, бо ID може бути текстом)
            const params = new URLSearchParams(window.location.search);
            const prodId = params.get('product');
            if (prodId !== null) {
                setTimeout(() => openModal(prodId, false), 300); 
            }

            // ==========================================
            // 6. ХОВАЄМО ПРЕЛОАДЕР ПІСЛЯ ЗАВАНТАЖЕННЯ
            // ==========================================
            const loader = document.getElementById('varta-preloader');
            if (loader && loader.style.display !== 'none') {
                setTimeout(() => {
                    loader.classList.remove('active'); 
                    setTimeout(() => {
                        loader.style.display = 'none';
                    }, 1000);
                }, 500); 
            }
        },
        error: function(err) { 
            console.error("Помилка завантаження CSV:", err); 
            const loader = document.getElementById('varta-preloader');
            if (loader && loader.style.display !== 'none') {
                loader.classList.remove('active');
                setTimeout(() => {
                    loader.style.display = 'none';
                }, 1000);
            }
        }
    });
}
// ==========================================
// 1. ОНОВЛЕНИЙ РЕНДЕР КАТАЛОГУ (НОВИНКИ + СЕЙЛ У КАРУСЕЛІ)
// ==========================================
// ==========================================
// 1. ОНОВЛЕНИЙ РЕНДЕР КАТАЛОГУ (НОВИНКИ + СЕЙЛ У КАРУСЕЛІ)
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
        productsToShow = productsToShow.filter(p => p.Badge !== 'SALE' && p.Badge !== 'NEW');
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
        const isNew = p.Badge === 'NEW';
        const isTop = p.Badge === 'TOP';
        
        let cardClass = 'card';
        let badgeHTML = '';
        let btnClass = 'buy-btn-card';

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

        const isWish = wishlist.some(x => String(x.myId) === String(p.myId));

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
        <div class="${cardClass}" onclick="openModal('${p.myId}')">
            <div class="card-img-wrap">
                ${badgeHTML}
                <img src="${mainPic}" alt="${p.Name}" loading="lazy">
                <button class="wishlist-btn-card ${isWish ? 'active' : ''}" onclick="toggleWishlistProduct('${p.myId}', event)">
                    <i class="${isWish ? 'fas' : 'far'} fa-heart"></i>
                </button>
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
function generateStockCardsHTML(sizesString, totalQuantity) {
    try {
        let html = `<div class='stock-container'>
                        <p class='stock-title'>📦 НАЯВНІСТЬ НА СКЛАДІ:</p>
                        <div class='stock-grid'>`;
                        
        if (!sizesString || sizesString.trim() === "" || sizesString === "undefined") {
            html += `
                <div class="stock-card universal">
                    <span class="stock-size">Універсальний</span>
                    <span class="stock-count">${totalQuantity || 0} шт.</span>
                </div>`;
        } else {
            let sizeItems = sizesString.split(',');
            // Сортування
            sizeItems.sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));
            
            sizeItems.forEach(item => {
                let parts = item.split('-');
                if (parts.length >= 2) {
                    let sizeName = parts[0].trim();
                    let sizeQty = parts[1].trim();
                    html += `
                    <div class="stock-card">
                        <span class="stock-size">${sizeName}</span>
                        <span class="stock-count">${sizeQty} шт.</span>
                    </div>`;
                }
            });
        }
        html += `</div></div>`;
        return html;
    } catch (err) {
        console.error("Помилка генерації карток:", err);
        return "";
    }
}

// ========================================================
// 🧠 РОЗУМНИЙ ФОРМАТУВАЛЬНИК ОПИСУ (Читає будь-який хаос)
// ========================================================
// ========================================================
// 🧠 РОЗУМНИЙ ФОРМАТУВАЛЬНИК ОПИСУ V6.0 (ПИЛОСОС СМІТТЯ)
// ========================================================
function formatDescription(htmlString) {
    if (!htmlString) return '';
    let tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlString.replace(/&nbsp;/g, ' ');

    let finalHTML = '';
    let currentSize = null;
    let currentGridHTML = '';

    const sizeStandalone = /^[\s\-\*•<>\/]*(s|m|l|xl|xxl|xxxl|2xl|3xl|4xl|5xl|xs|хс|с|м|л|хл|2хл|3хл|4хл|5хл|s\/m|l\/xl|2xl\/3xl)[\s:\.\-<>\/]*$/i;
    const sizeInline = /^[\s\-\*•<>\/]*(s|m|l|xl|xxl|xxxl|2xl|3xl|4xl|5xl|xs|хс|с|м|л|хл|2хл|3хл|4хл|5хл|s\/m|l\/xl|2xl\/3xl)[\s:\-]+(.*)/i;
    const keywords = ['груд', 'плеч', 'довжин', 'рукав', 'пояс', 'стегн', 'бедр', 'бедір', 'ширин', 'крок', 'талі'];

    function flushGrid() {
        if (currentSize && currentGridHTML) {
            finalHTML += `<h4 class="desc-size-header">📏 РОЗМІР ${currentSize.toUpperCase()}</h4>`;
            finalHTML += `<div class="desc-size-grid">${currentGridHTML}</div>`;
            currentSize = null;
            currentGridHTML = '';
        }
    }

    function extractMeasurement(rawText) {
        // 🔥 ПИЛОСОС: Знищуємо зламані теги, які пролізли як текст (напр. < p> або < /p>)
        let text = rawText
            .replace(/<\/?\s*p\s*>/gi, '') 
            .replace(/^[<>\-\*•\s]+/, '') 
            .replace(/[<>\-\*•\s]+$/, '')
            .trim();
            
        let low = text.toLowerCase();
        if (!keywords.some(k => low.includes(k))) return null;

        const match = text.match(/^([^\d]+)(\d+(?:[.,]\d+)?)/);
        if (match) {
            let label = match[1].replace(/[:\-;\.,\s<>\/]+$/, '').trim();
            let val = match[2];
            if (label.length > 2) {
                return `<div class="size-row"><span class="size-label">${label}</span><span class="size-value">${val} см</span></div>`;
            }
        }
        return null;
    }

    Array.from(tempDiv.childNodes).forEach(node => {
        if (node.nodeName === 'TABLE' || node.nodeName === 'FIGURE' || (node.querySelector && node.querySelector('table'))) {
            flushGrid();
            finalHTML += `<div class="desc-table-wrapper">${node.outerHTML || node.textContent}</div>`;
            return;
        }

        let text = (node.textContent || '').trim();
        
        // 🔥 ПИЛОСОС 2: Видаляємо зламані теги перед перевіркою
        text = text.replace(/<\/?\s*p\s*>/gi, '').trim();

        // Ігноруємо пусті рядки та випадкові знаки ">"
        if (!text || text === '>' || text === '<') return;
        
        // Ігноруємо непотрібні заголовки
        // 🔥 Ігноруємо ТІЛЬКИ пусті технічні заголовки (повномірні/маломірки залишаємо!)
        let lowText = text.toLowerCase();
        if (lowText === 'розмірна сітка' || lowText === 'розміри:' || lowText === 'розміри') return;

        let matchStandalone = text.match(sizeStandalone);
        if (matchStandalone && !lowText.includes('матеріал')) {
            flushGrid();
            currentSize = matchStandalone[1];
            return;
        }

        let matchInline = text.match(sizeInline);
        if (matchInline && !lowText.includes('матеріал')) {
            let restOfText = matchInline[2];
            if (/\d/.test(restOfText)) {
                flushGrid();
                currentSize = matchInline[1];
                let parts = restOfText.split(/[,;]/);
                parts.forEach(p => {
                    let row = extractMeasurement(p);
                    if (row) currentGridHTML += row;
                });
                return;
            }
        }

        let row = extractMeasurement(text);
        if (row && currentSize) {
            currentGridHTML += row;
            return;
        } else if (row && !currentSize) {
            currentSize = "УНІВЕРСАЛЬНИЙ";
            currentGridHTML += row;
            return;
        }

        flushGrid();
        let cleanDesc = text.replace(/^[<>\-\*•\s]+/, '').trim();
        if (cleanDesc.length > 2) {
            finalHTML += `<p class="desc-text">${cleanDesc}</p>`;
        }
    });

    flushGrid();
    return finalHTML;
}
// =================== ОНОВЛЕНА openModal ===================
// =================== ОНОВЛЕНА openModal (З ФІКСОМ КНОПКИ) ===================
function openModal(id, updateUrl = true) {
    // ШУКАЄМО ТОВАР ЯК РЯДОК (String)
    const p = allProducts.find(x => String(x.myId) === String(id));
    if(!p) return;
    
    // === 🔥 АНАЛІТИКА ===
    if (typeof gtag === 'function' && p) {
        gtag('event', 'view_item', {
            currency: 'UAH',
            value: Number(p.Price) || 0,
            items: [{
                item_id: p.VendorCode || 'SKU_UNKNOWN',
                item_name: p.Name,
                item_category: p.Category || 'Без категорії',
                price: Number(p.Price) || 0,
                quantity: 1
            }]
        });
    }

    addToRecentlyViewed(p);
    document.getElementById('modal-name').innerText = p.Name;
    document.getElementById('modal-price').innerText = `${p.Price} грн`;
    
    const oldPriceEl = document.getElementById('modal-old-price');
    if (p.OldPrice) {
        oldPriceEl.innerText = `${p.OldPrice} грн`;
        oldPriceEl.style.display = 'inline-block'; 
    } else {
        oldPriceEl.style.display = 'none'; 
    }
    
    // ОПИС + КАРТКИ НАЯВНОСТІ
    // ==========================================
   // ==========================================
    // ==========================================
    // 🔥 ОПИС + КАРТКИ НАЯВНОСТІ
    // ==========================================
    // Проганяємо опис через наш розумний форматувальник
    let cleanDescription = formatDescription(p.Description);
    
    // Генеруємо картки залишків ("S - 2 шт")
    let stockHTML = generateStockCardsHTML(String(p.Sizes), p.Quantity);
    
    // Виводимо все на екран
    document.getElementById('modal-desc').innerHTML = cleanDescription + stockHTML;
    
    document.getElementById('modal-vendor').innerText = `Артикул: ${p.VendorCode}`;

    currentModalPics = p.Pictures ? p.Pictures.split(',').map(s => s.trim()) : [];
    currentModalPicIndex = 0;
    updateModalGallery();

    // ВИПАДАЮЧИЙ СПИСОК РОЗМІРІВ (З ЗАЛИШКАМИ)
    const sizes = p.Sizes ? p.Sizes.split(',') : [];
    const sel = document.getElementById('modal-size-selector');
    
    if (sizes.length > 0 && sizes[0].trim() !== "") {
        sizes.sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));
        let optionsHTML = '<option value="">Оберіть розмір</option>';
        
        sizes.forEach(s => {
            let parts = s.split('-');
            let cleanSizeName = parts[0].trim();
            let qty = parts.length > 1 ? parts[1].trim() : "";
            
            if (qty) {
                optionsHTML += `<option value="${cleanSizeName}">${cleanSizeName} — є ${qty} шт.</option>`;
            } else {
                optionsHTML += `<option value="${cleanSizeName}">${cleanSizeName}</option>`;
            }
        });
        sel.innerHTML = optionsHTML;
    } else {
        sel.innerHTML = `<option value="Універсальний">Універсальний — є ${p.Quantity || 0} шт.</option>`;
    }

    renderCrossSell(p);

    document.getElementById('product-modal').style.display = 'flex';
    document.getElementById('body-overlay').classList.add('active');
    lockScroll();

    // ЛИПКА КНОПКА ДЛЯ МОБІЛЬНИХ
    const stickyPanel = document.getElementById('sticky-mobile-cart');
    const stickyPrice = document.getElementById('sticky-price');
    const stickyAddBtn = document.getElementById('sticky-add-btn');
    const modalContent = document.querySelector('.modal-content');
    
    if (stickyPrice) stickyPrice.innerText = `${p.Price} грн`;
    
    if (stickyAddBtn) {
        stickyAddBtn.onclick = () => {
            document.getElementById('modal-add-btn').click(); 
        };
    }

    if (modalContent && stickyPanel) {
        stickyPanel.classList.remove('visible');
        modalContent.onscroll = null; 
        
        modalContent.onscroll = () => {
            if (modalContent.scrollTop > 200) {
                stickyPanel.classList.add('visible');
            } else {
                stickyPanel.classList.remove('visible');
            }
        };
    }

    // === КНОПКА "ДОДАТИ В КОШИК" ===
    document.getElementById('modal-add-btn').onclick = () => {
        // Перевірка чи обрано розмір
        if (sizes.length > 0 && sizes[0].trim() !== "" && !sel.value) {
            return alert('Оберіть розмір!');
        }
        
        // Аналітика додавання
        if (typeof gtag === 'function' && p) {
            gtag('event', 'add_to_cart', {
                currency: 'UAH',
                value: Number(p.Price) || 0,
                items: [{
                    item_id: p.VendorCode || 'SKU_UNKNOWN',
                    item_name: p.Name,
                    item_category: p.Category || 'Без категорії',
                    price: Number(p.Price) || 0,
                    quantity: 1
                }]
            });
        }

        // Додавання в кошик
        cart.push({ ...p, selectedSize: sel.value || 'Універсальний' });
        localStorage.setItem('varta_cart', JSON.stringify(cart));
        
        updateCartUI();
        closeModal(false); 
        toggleCart(true); 
    };

    if (updateUrl) {
        const url = new URL(window.location);
        url.searchParams.set('product', id);
        window.history.pushState({ productId: id }, '', url);

        const canonicalTag = document.getElementById('canonical-url');
        if (canonicalTag) canonicalTag.href = url.href; 
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
    applySorting(); // Застосовуємо вибране сортування перед малюванням
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
        
    applySorting(); // Застосовуємо вибране сортування перед малюванням
    currentPage = 1; 
    renderCatalog();
}

function resetPageAndFilter() {
    const q = document.getElementById('search-input').value.toLowerCase().trim();
    
    // === 🔥 АНАЛІТИКА: Відстеження пошуку по сайту ===
    // Відправляємо подію тільки якщо ввели хоча б 3 символи (щоб уникнути спаму від кожної літери)
    if (typeof gtag === 'function' && q.length > 2) {
        gtag('event', 'search', {
            search_term: q
        });
        console.log("🔍 Аналітика: Шукали", q);
    }
    // === КІНЕЦЬ ===

    // 1. Повідомляємо системі, що ми шукаємо текст
    window.currentSearchQuery = q;
    
    // 2. Скидаємо категорії та бейджі
    window.currentCategory = 'all'; 
    window.currentBadgeFilter = 'all'; 

    // 3. Шукаємо по назві або артикулу
    filteredProducts = allProducts.filter(p => p.Name.toLowerCase().includes(q) || (p.VendorCode || "").toLowerCase().includes(q));
    
    // 4. Малюємо результати
    applySorting(); // Застосовуємо вибране сортування перед малюванням
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
// =================== ЛОГІКА КОШИКА ТА ДОСТАВКИ ===================
// ==========================================
// 🎟️ СИСТЕМА ПРОМОКОДІВ
// ==========================================
let currentDiscount = 0; // Відсоток знижки

function applyPromoCode() {
    const inputEl = document.getElementById('promo-input');
    const msgEl = document.getElementById('promo-message');
    if (!inputEl || !msgEl) return;
    
    const inputCode = inputEl.value.trim().toUpperCase();
    
    const validCodes = {
        'VARTA10': 10,
        'ZSU15': 15,
        'TG5': 5
    };

    if (inputCode === '') {
        currentDiscount = 0;
        msgEl.innerHTML = '';
    } else if (validCodes[inputCode]) {
        currentDiscount = validCodes[inputCode];
        msgEl.innerHTML = `<span style="color: var(--mono-lime); font-weight: bold;">✅ Код прийнято! Перераховуємо...</span>`;
    } else {
        currentDiscount = 0;
        msgEl.innerHTML = `<span style="color: #ff3300;">❌ Промокод не знайдено</span>`;
    }
    
    updateCartUI(); 
}

// ==========================================
// 🛒 ОНОВЛЕНИЙ КОШИК З РОЗУМНИМИ ЗНИЖКАМИ
// ==========================================
function updateCartUI() {
    const cartCount = document.getElementById('cart-count');
    if (cartCount) cartCount.innerText = cart.length;

    const content = document.getElementById('cart-content');
    const footer = document.getElementById('cart-footer');
    
    const FREE_SHIPPING_THRESHOLD = 3000; 
    const shippingContainer = document.getElementById('free-shipping-container');
    const shippingText = document.getElementById('shipping-text');
    const shippingBar = document.getElementById('shipping-bar-fill');
    
    if (cart.length === 0) {
        content.innerHTML = '<div style="text-align:center; padding:50px 0; color:#666; user-select:none;">Кошик порожній</div>';
        if (footer) footer.style.display = 'none';
        if (shippingContainer) shippingContainer.style.display = 'none';
        localStorage.removeItem('varta_cart');
    } else {
        if (footer) footer.style.display = 'block';
        if (shippingContainer) shippingContainer.style.display = 'block';
        
        let total = 0;
        content.innerHTML = cart.map((it, i) => {
            total += parseFloat(it.Price) || 0;
            
            // НОВЕ: Маркуємо акційні товари прямо в кошику
            let isSale = String(it.Badge || it.badge || '').toUpperCase().includes('SALE');
            let saleTag = isSale ? `<span style="color:#ff3300; font-size:10px; border:1px solid #ff3300; padding:1px 4px; border-radius:3px; margin-left:5px;">АКЦІЯ</span>` : '';

            return `
            <div class="cart-item">
                <div class="cart-item-info">
                    <span class="cart-item-title">${it.Name.toUpperCase()} ${saleTag}</span>
                    <span class="cart-item-meta">Розмір: ${it.selectedSize}</span>
                    <span class="cart-item-price">${it.Price} грн</span>
                </div>
                <span class="cart-item-remove" onclick="removeFromCart(${i})"><i class="fas fa-times"></i></span>
            </div>`;
        }).join('');
        
        const totalPriceEl = document.getElementById('cart-total-price');
        const finalPriceEl = document.getElementById('final-total-price');
        const msgEl = document.getElementById('promo-message');
        
        // 🔥 РОЗУМНЕ ЗАСТОСУВАННЯ ПРОМОКОДУ (Ігнорує SALE)
        let finalTotal = total;
        let discountAmount = 0;

        if (currentDiscount > 0) {
            let discountableSum = 0;
            
            cart.forEach(item => {
                let badgeText = String(item.Badge || item.badge || '').toUpperCase();
                if (!badgeText.includes('SALE') && !badgeText.includes('АКЦІЯ')) {
                    discountableSum += Number(item.Price) || 0;
                }
            });

            discountAmount = Math.round(discountableSum * (currentDiscount / 100));
            finalTotal = total - discountAmount;

            if (discountAmount > 0) {
                let priceHTML = `<s style="color:#888; font-size:14px; margin-right:8px;">${total}</s> <span style="color:var(--mono-lime)">${finalTotal}</span>`;
                if (totalPriceEl) totalPriceEl.innerHTML = priceHTML;
                if (finalPriceEl) finalPriceEl.innerHTML = priceHTML;
                if (msgEl) msgEl.innerHTML = `<span style="color: var(--mono-lime); font-weight: bold;">✅ Знижка -${discountAmount} грн!</span>`;
            } else {
                if (totalPriceEl) totalPriceEl.innerText = total;
                if (finalPriceEl) finalPriceEl.innerText = total;
                if (msgEl) msgEl.innerHTML = `<span style="color:#ff3300; font-weight:bold;">❌ Код не діє на акційні товари</span>`;
            }
        } else {
            if (totalPriceEl) totalPriceEl.innerText = total;
            if (finalPriceEl) finalPriceEl.innerText = total;
        }

        // РОЗРАХУНОК ПОЛОСКИ ДОСТАВКИ
        const percent = Math.min((finalTotal / FREE_SHIPPING_THRESHOLD) * 100, 100);
        if (shippingBar) shippingBar.style.width = percent + '%';
        
        if (finalTotal >= FREE_SHIPPING_THRESHOLD) {
            if (shippingText) shippingText.innerHTML = '🎉 У вас <b>БЕЗКОШТОВНА ДОСТАВКА</b>!';
            if (shippingBar) shippingBar.style.backgroundColor = '#25D366'; 
        } else {
            const left = FREE_SHIPPING_THRESHOLD - finalTotal;
            if (shippingText) shippingText.innerHTML = `До безкоштовної доставки залишилося: <b style="color:var(--mono-lime)">${left} грн</b>`;
            if (shippingBar) shippingBar.style.backgroundColor = 'var(--mono-lime)';
        }
    }
    
    if (typeof animateCartIcon === 'function') animateCartIcon();
}
function removeFromCart(i) {
    const itemToRemove = cart[i]; // Запам'ятовуємо товар перед видаленням
    
    // === 🔥 АНАЛІТИКА: Видалення з кошика ===
    if (typeof gtag === 'function' && itemToRemove) {
        gtag('event', 'remove_from_cart', {
            currency: 'UAH',
            value: Number(itemToRemove.Price) || 0,
            items: [{
                item_id: itemToRemove.VendorCode || 'SKU_UNKNOWN',
                item_name: itemToRemove.Name,
                item_category: itemToRemove.Category || 'Без категорії',
                price: Number(itemToRemove.Price) || 0,
                quantity: itemToRemove.quantity || 1
            }]
        });
        console.log("🗑 Аналітика: Видалено з кошика", itemToRemove.Name);
    }
    // === КІНЕЦЬ ===

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
function toggleMobileMenu(s) { 
    document.getElementById('mobile-menu').classList.toggle('active', s); 
    document.getElementById('body-overlay').classList.toggle('active', s); 
    // Застосовуємо розумний скрол
    if (s) lockScroll(); else unlockScroll(); 
}

function toggleCart(s) { 
    document.getElementById('cart-sidebar').classList.toggle('active', s); 
    document.getElementById('body-overlay').classList.toggle('active', s); 
    // Застосовуємо розумний скрол
    if (s) lockScroll(); else unlockScroll(); 
}
function closeModal(updateUrl = true) { 
    // 1. Ховаємо модалку та затемнення
    document.getElementById('product-modal').style.display = 'none'; 
    document.getElementById('body-overlay').classList.remove('active'); 
    
    // 2. Повертаємо скрол на те саме місце (щоб екран не стрибав)
    if (typeof unlockScroll === 'function') {
        unlockScroll(); 
    } else {
        document.body.classList.remove('no-scroll'); 
    }
    
    // 3. Очищаємо URL та канонічний тег для Google
    if (updateUrl) {
        const url = new URL(window.location);
        url.searchParams.delete('product');
        window.history.pushState({}, '', url);

        const canonicalTag = document.getElementById('canonical-url');
        if (canonicalTag) {
            canonicalTag.href = 'https://vartagear.com.ua/'; 
        }
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
        <div class="carousel-3d-item" onclick="openModal('${p.myId}')">
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
    // Спочатку дістаємо дані з пам'яті браузера
    const savedCart = localStorage.getItem('varta_cart');
    if (savedCart) {
        cart = JSON.parse(savedCart);
    }
    
    // Оновлюємо інтерфейс кошика
    updateCartUI();
    
    // НОВЕ: Показуємо преміальні скелети, поки вантажиться база
    renderSkeletons(); 
    
    // Завантажуємо товари
    loadCSV();

    updateWishlistUI();        
    renderRecentlyViewedUI();
});

// НОВЕ: ФУНКЦІЯ СКЕЛЕТНОГО ЗАВАНТАЖЕННЯ (Адаптивна)
function renderSkeletons() {
    const catalog = document.getElementById('catalog');
    if (!catalog) return;
    
    let skeletonsHTML = '';
    // Малюємо 12 пустих карток (як на 1 сторінці)
    for(let i=0; i<12; i++) {
        skeletonsHTML += `
        <div class="card skeleton-card">
            <div class="skeleton-img"></div>
            <div class="card-info" style="padding: 15px;">
                <div class="skeleton-line title-line"></div>
                <div class="skeleton-line title-line-short"></div>
                <div class="skeleton-line price-line"></div>
                <div class="skeleton-button"></div>
            </div>
        </div>`;
    }
    catalog.innerHTML = skeletonsHTML;
}

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


function renderCrossSell(currentProduct) {
    const csSection = document.getElementById('cross-sell-section');
    const csGrid = document.getElementById('cross-sell-grid');
    if (!csSection || !csGrid) return;
    
    let available = allProducts.filter(p => p.myId !== currentProduct.myId);
    available.sort(() => 0.5 - Math.random());
    let recommendations = available.slice(0, 4);
    
    if (recommendations.length === 0) {
        csSection.style.display = 'none';
        return;
    }

    csSection.style.display = 'block';
    csGrid.innerHTML = recommendations.map(p => {
        const pic = p.Pictures ? p.Pictures.split(',')[0].trim() : '';
        return `
        <div class="cs-card" onclick="openModal('${p.myId}', false)">
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

// Миттєвий перехід на головну без перезавантаження сторінки
// Миттєвий перехід на головну без перезавантаження сторінки (З ФІКСОМ КАРУСЕЛІ)
function goHome(e) {
    if(e) e.preventDefault();
    
    // 1. Очищаємо URL
    window.history.pushState({}, '', window.location.pathname); 
    
    // 2. Скидаємо ВСІ фільтри
    window.currentCategory = 'all';
    window.currentSearchQuery = '';
    window.currentBadgeFilter = 'all';
    window.currentColorFilter = 'all';
    
    // 3. Очищаємо поле пошуку
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    
    // 4. ПРАВИЛЬНЕ ПЕРЕМИКАННЯ КНОПОК
    // Знімаємо active з усіх тегів і кнопок кольорів
    document.querySelectorAll('.filter-tag, .color-btn').forEach(b => b.classList.remove('active'));
    
    // Робимо активною саме кнопку "Всі"
    const allBtn = document.getElementById('all-products-btn') || document.querySelector('.filter-tag');
    if (allBtn) allBtn.classList.add('active');
    
    // Робимо активною кнопку "Всі кольори"
    const allColorsBtn = document.querySelector('.color-btn[onclick*="all"]');
    if (allColorsBtn) allColorsBtn.classList.add('active');

    // 5. Повертаємо всі товари
    filteredProducts = [...allProducts];
    currentPage = 1;
    
    // 6. Повертаємо карусель
    const carouselSection = document.getElementById('main-sale-carousel');
    if (carouselSection) {
        carouselSection.style.display = 'block';
        setTimeout(() => {
            if (typeof update3DCarousel === 'function') update3DCarousel();
        }, 10);
    }
    
    // 7. Оновлюємо каталог і скролимо наверх
    renderCatalog(); 
    closeAllPanels(); 
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
}

// ========================================================
// ЗУМ ФОТОГРАФІЙ (ЛАЙТБОКС)
// ========================================================
function openLightbox() {
    const imgSrc = document.getElementById('modal-main-img').src;
    if (!imgSrc) return;
    document.getElementById('lightbox-img').src = imgSrc;
    document.getElementById('image-lightbox').style.display = 'flex';
    
    lockScroll(); // Запам'ятовуємо скрол
}

function closeLightbox() {
    document.getElementById('image-lightbox').style.display = 'none';
    
    unlockScroll(); // Повертаємо скрол
}


// ========================================================
// СОРТУВАННЯ ЗА ЦІНОЮ
// ========================================================
window.currentSortMode = 'default';

function sortCatalog() {
    const sortSelect = document.getElementById('price-sort');
    window.currentSortMode = sortSelect ? sortSelect.value : 'default';
    
    applySorting(); // Застосовуємо сортування до масиву
    currentPage = 1; // Скидаємо на першу сторінку
    renderCatalog(); // Перемальовуємо каталог
}

function applySorting() {
    if (window.currentSortMode === 'asc') {
        // Дешевші
        filteredProducts.sort((a, b) => a.Price - b.Price);
    } else if (window.currentSortMode === 'desc') {
        // Дорожчі
        filteredProducts.sort((a, b) => b.Price - a.Price);
    } else {
        // За замовчуванням (ТОП -> SALE -> Пріоритет)
        filteredProducts.sort((a, b) => {
            if (a.Badge === 'SALE' && b.Badge !== 'SALE') return -1;
            if (b.Badge === 'SALE' && a.Badge !== 'SALE') return 1;
            if (a.Badge === 'TOP' && b.Badge !== 'TOP') return -1;
            if (b.Badge === 'TOP' && a.Badge !== 'TOP') return 1;
            return a.Priority - b.Priority;
        });
    }
}

// --- 1. СПИСОК БАЖАНЬ ---
function toggleWishlist(s) {
    document.getElementById('wishlist-sidebar').classList.toggle('active', s);
    document.getElementById('body-overlay').classList.toggle('active', s);
    updateWishlistUI();
}

// --- 1. СПИСОК БАЖАНЬ ---
function toggleWishlistProduct(id, event) {
    if(event) event.stopPropagation(); 
    
    // Перетворюємо в рядок для безпечного пошуку
    const p = allProducts.find(x => String(x.myId) === String(id));
    const index = wishlist.findIndex(x => String(x.myId) === String(id));
    
    if (index > -1) {
        // Видаляємо з обраного
        wishlist.splice(index, 1);
    } else if (p) {
        // Додаємо в обране
        wishlist.push(p);
        
        // === 🔥 АНАЛІТИКА: Додано в обране ===
        if (typeof gtag === 'function') {
            gtag('event', 'add_to_wishlist', {
                currency: 'UAH',
                value: Number(p.Price) || 0,
                items: [{
                    item_id: p.VendorCode || 'SKU_UNKNOWN',
                    item_name: p.Name,
                    item_category: p.Category || 'Без категорії',
                    price: Number(p.Price) || 0,
                    quantity: 1
                }]
            });
            console.log("❤️ Аналітика: Додано в обране", p.Name);
        }
        // === КІНЕЦЬ ===
    }
    
    localStorage.setItem('varta_wishlist', JSON.stringify(wishlist));
    renderCatalog(currentPage); 
    updateWishlistUI();
}
function updateWishlistUI() {
    document.getElementById('wishlist-count').innerText = wishlist.length;
    const content = document.getElementById('wishlist-content');
    if (wishlist.length === 0) {
        content.innerHTML = '<p style="text-align:center; padding:20px;">Список порожній</p>';
    } else {
        content.innerHTML = wishlist.map(it => `
            <div class="cart-item">
                <div class="cart-item-info" onclick="openModal('${it.myId}'); toggleWishlist(false);">
                    <span class="cart-item-title">${it.Name}</span>
                    <span class="cart-item-price">${it.Price} грн</span>
                </div>
                <span class="cart-item-remove" onclick="toggleWishlistProduct('${it.myId}')"><i class="fas fa-times"></i></span>
            </div>
        `).join('');
    }
}

// =================== НАВІГАЦІЯ БРАУЗЕРА (КНОПКА НАЗАД) ===================
window.addEventListener('popstate', () => {
    const params = new URLSearchParams(window.location.search);
    const prodId = params.get('product');
    
    if (prodId !== null) {
        // ВИДАЛЕНО parseInt, бо тепер працюємо з текстом
        openModal(prodId, false); 
    } else {
        closeModal(false);
        toggleMobileMenu(false);
        toggleCart(false);
    }
});

// --- 2. НЕЩОДАВНО ПЕРЕГЛЯНУТІ ---
function addToRecentlyViewed(product) {
    if (!recentlyViewed) recentlyViewed = [];
    
    // 1. Видаляємо дублікати (якщо товар вже є в списку)
    recentlyViewed = recentlyViewed.filter(p => p.myId !== product.myId);
    
    // 2. Додаємо новий товар на самий початок
    recentlyViewed.unshift(product);
    
    // 3. ОБМЕЖЕННЯ: Залишаємо строго 3 останні товари
    recentlyViewed = recentlyViewed.slice(0, 3);
    
    // 4. Зберігаємо в пам'ять телефону/браузера
    localStorage.setItem('varta_recently_viewed', JSON.stringify(recentlyViewed));
    
    // 5. Оновлюємо блок на екрані
    if (typeof renderRecentlyViewedUI === 'function') {
        renderRecentlyViewedUI();
    }
}

// --- 2. НЕЩОДАВНО ПЕРЕГЛЯНУТІ (ОНОВЛЕНИЙ ІДЕАЛЬНИЙ ВИГЛЯД) ---
function renderRecentlyViewedUI() {
    const section = document.getElementById('recently-viewed-section');
    const grid = document.getElementById('recently-viewed-grid');
    if (!section || recentlyViewed.length === 0) return;

    section.style.display = 'block';
    
    grid.innerHTML = recentlyViewed.map(p => {
        const isSale = p.Badge === 'SALE';
        const isNew = p.Badge === 'NEW';
        const isTop = p.Badge === 'TOP';
        
        let cardClass = 'card';
        let badgeHTML = '';
        let btnClass = 'buy-btn-card';

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

        const isWish = wishlist.some(x => String(x.myId) === String(p.myId));

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
        <div class="${cardClass}" onclick="openModal('${p.myId}')">
            <div class="card-img-wrap">
                ${badgeHTML}
                <img src="${mainPic}" alt="${p.Name}" loading="lazy">
                <button class="wishlist-btn-card ${isWish ? 'active' : ''}" onclick="toggleWishlistProduct('${p.myId}', event)">
                    <i class="${isWish ? 'fas' : 'far'} fa-heart"></i>
                </button>
            </div>
            <div class="card-info">
                <h4>${p.Name}</h4>
                ${priceHTML}
                <button class="${btnClass}"><i class="fas fa-shopping-cart"></i> КУПИТИ</button>
            </div>
        </div>`;
    }).join('');
}

// --- 3. АНІМАЦІЯ КОШИКА ---
// Додай цей виклик всередині функції updateCartUI()
function animateCartIcon() {
    const btn = document.getElementById('cart-icon-btn');
    btn.classList.add('cart-bounce');
    setTimeout(() => btn.classList.remove('cart-bounce'), 600);
}


// РОЗУМНИЙ ФІЛЬТР ЗА КОЛЬОРАМИ (З УРАХУВАННЯМ КАТЕГОРІЇ)
// ========================================================
window.currentColorFilter = 'all';

function filterByColor(colorKey, btn) {
    // 1. Візуальна активація кнопки
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    window.currentColorFilter = colorKey;

    // 2. Словник синонімів кольорів
    const colorMap = {
        'black': ['black', 'чорний', 'черн', 'blk', 'поліція', 'police', 'dark side'],
        'olive': ['olive', 'green', 'олива', 'хакі', 'khaki', 'зелен', 'ranger', 'od green'],
        'coyote': ['coyote', 'tan', 'sand', 'койот', 'пісок', 'brown', 'коричн', 'coy', 'dark earth'],
        'multicam': ['multicam', 'мультикам', 'mcam', 'mc', 'мультік', 'мк'],
        'pixel': ['mm14', 'піксель', 'pixel', 'пиксель', 'пікс', 'zsu', 'зсу', 'мм14'],
        'blue': ['blue', 'синій', 'синий', 'блакитний', 'дснс', 'dsns', 'navy', 'dark blue']
    };

    // 3. ФІЛЬТРАЦІЯ: спочатку беремо товари поточної категорії, а потім фільтруємо за кольором
    let baseProducts = [];

    if (!window.currentCategory || window.currentCategory === 'all') {
        // Якщо категорія не обрана — шукаємо по всіх товарах
        baseProducts = [...allProducts];
    } else {
        // Якщо ми в категорії — беремо товари ТІЛЬКИ цієї категорії
        baseProducts = allProducts.filter(p => p.Category === window.currentCategory || p.SubCategory === window.currentCategory);
    }

    // 4. Застосовуємо фільтр кольору до обраної бази товарів
    if (colorKey === 'all') {
        filteredProducts = baseProducts;
    } else {
        const keywords = colorMap[colorKey];
        filteredProducts = baseProducts.filter(p => {
            const textToSearch = ((p.Color || '') + ' ' + (p.Name || '')).toLowerCase();
            return keywords.some(kw => textToSearch.includes(kw));
        });
    }

    // 5. Оновлюємо інтерфейс
    applySorting(); 
    currentPage = 1; 
    renderCatalog();
}

// ========================================================
// ПЛАВАЮЧА КНОПКА ЗВ'ЯЗКУ (FAB)
// ========================================================
function toggleFabMenu() {
    const wrap = document.querySelector('.floating-contact-wrap');
    if (wrap) wrap.classList.toggle('active');
}

// Автоматично закриваємо меню, якщо клікнули в іншому місці екрана
document.addEventListener('click', (e) => {
    const wrap = document.querySelector('.floating-contact-wrap');
    if (wrap && wrap.classList.contains('active')) {
        // Якщо клік був НЕ по самій кнопці чи її меню
        if (!wrap.contains(e.target)) {
            wrap.classList.remove('active');
        }
    }
});

// ========================================================
// VIP-ФІЛЬТР: БРОНЕЗАХИСТ ТА ШОЛОМИ
// ========================================================
function filterByPremiumArmor() {
    // 1. Повідомляємо системі про зміну категорії
    window.currentCategory = 'premium-armor';
    window.currentSearchQuery = '';
    window.currentBadgeFilter = 'all';
    window.currentColorFilter = 'all';
    
    // 2. Знімаємо виділення з кнопок "Всі", "Новинки" тощо
    document.querySelectorAll('.filter-tag').forEach(b => b.classList.remove('active'));

    // 3. Відбираємо товари: тільки Броня та Шоломи (беремо з колонок Category)
    filteredProducts = allProducts.filter(p => {
        const catText = (p.Category || '').toLowerCase();
        return catText.includes('бронезахист') || catText.includes('шолом');
    });
    
    // 4. Перемальовуємо каталог
    applySorting();
    currentPage = 1;
    renderCatalog();
    
    // 5. Плавний скролл прямо до карток товарів
    const catalogEl = document.getElementById('catalog');
    if (catalogEl) {
        window.scrollTo({ top: catalogEl.offsetTop - 80, behavior: 'smooth' });
    }
}



function closePromoPopup() {
    const popup = document.getElementById('tg-discount-popup');
    if (popup) {
        popup.classList.remove('show');
        // Записуємо в пам'ять браузера, що юзер закрив вікно. Більше воно його не потурбує.
        localStorage.setItem('varta_popup_closed', 'true'); 
    }
}

// ==========================================
// ФІЛЬТРАЦІЯ ПО БАНЕРАХ (ТАКТИКА / CASUAL)
// ==========================================
function filterByBanner(type) {
    // 1. Скидаємо інші фільтри
    window.currentSearchQuery = '';
    window.currentBadgeFilter = 'all';
    window.currentColorFilter = 'all';
    document.querySelectorAll('.filter-tag, .color-btn').forEach(b => b.classList.remove('active'));

    // 2. Фільтруємо масив
    if (type === 'tactical') {
        window.currentCategory = 'tactical';
        filteredProducts = allProducts.filter(p => {
            const cat = ((p.Category || '') + ' ' + (p.SubCategory || '')).toUpperCase();
            // Все, що стосується війни, броні та тактики
            return cat.includes('ВІЙСЬК') || cat.includes('ТАКТИЧ') || cat.includes('БРОНЕ') || cat.includes('МІЛІТАРІ') || cat.includes('ШОЛОМ');
        });
    } else if (type === 'casual') {
        window.currentCategory = 'casual';
        filteredProducts = allProducts.filter(p => {
            const cat = ((p.Category || '') + ' ' + (p.SubCategory || '')).toUpperCase();
            // Все, що стосується цивільного/чоловічого одягу
            return cat.includes('ЧОЛОВІК') || cat.includes('ПОВСЯКДЕН') || cat.includes('СПОРТИВН') || (cat.includes('ОДЯГ') && !cat.includes('МІЛІТАРІ'));
        });
    }

    // 3. Оновлюємо і скролимо
    applySorting();
    currentPage = 1;
    renderCatalog();

    // Плавний скрол прямо до товарів, щоб клієнт одразу бачив результат
    const catalogEl = document.getElementById('catalog');
    if (catalogEl) {
        window.scrollTo({ top: catalogEl.offsetTop - 80, behavior: 'smooth' });
    }
}
// ==========================================
// 📏 МОДАЛКА: ЯК ЗНЯТИ ЗАМІРИ
// ==========================================
function openMeasureGuide(e) {
    if(e) e.stopPropagation();
    const modal = document.getElementById('measure-modal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeMeasureGuide(e) {
    // Закриваємо тільки якщо клікнули на хрестик або на темний фон
    if (e && e.target.closest('.measure-content') && !e.target.classList.contains('lightbox-close')) {
        return; 
    }
    const modal = document.getElementById('measure-modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// ==========================================
// 💬 SOCIAL PROOF: ІЛЮЗІЯ ЖИВОЇ ЧЕРГИ
// ==========================================
const socialNames = ["Олександр", "Дмитро", "Андрій (ЗСУ)", "Максим", "Ігор", "Сергій", "Влад", "Микола (НГУ)", "Тарас", "Євген", "Коля Мирний", "Олег Сафронов", "Богдан"];
const socialCities = ["Київ", "Львів", "Дніпро", "Одеса", "Харків", "Полтава", "Запоріжжя", "Вінниця", "Кривий Ріг", "Хмельницький", "Вінниця", "Рівне";
const socialActions = [
    "щойно замовив",
    "додав у кошик",
    "залишив відгук 5 зірок на",
    "оформив замовлення на"
];
// Якщо в allProducts є товари, ми будемо брати назви звідти. Якщо ні - використовуємо ці:
const fallbackProducts = ["Тактичний Убакс", "Куртку Ріп-стоп", "Штани Ріп-Стоп", "Бойову сорочку", "Комплект форми Піксель", "Тактичні кросівки", "Тактичний ремінь", "Убакс (Олива)", "Штани (Койот)"];

let socialToastTimer;

function showSocialToast() {
    const toast = document.getElementById('social-proof-toast');
    const content = document.getElementById('social-toast-content');
    if (!toast || !content) return;

    // Генеруємо випадкові дані
    const name = socialNames[Math.floor(Math.random() * socialNames.length)];
    const city = socialCities[Math.floor(Math.random() * socialCities.length)];
    const action = socialActions[Math.floor(Math.random() * socialActions.length)];
    const time = Math.floor(Math.random() * 12) + 1; // Від 1 до 12 хвилин тому
    
    // Беремо випадковий товар з реальної бази (якщо вона завантажена), або з резервного списку
    let product = fallbackProducts[Math.floor(Math.random() * fallbackProducts.length)];
    if (typeof allProducts !== 'undefined' && allProducts.length > 0) {
        const randomItem = allProducts[Math.floor(Math.random() * allProducts.length)];
        product = randomItem.Name;
    }

    content.innerHTML = `
        <b>${name}</b> (м. ${city})<br>
        ${action} <b>${product.toLowerCase()}</b>
        <span class="time-ago">${time} хв. тому</span>
    `;

    toast.classList.add('show');

    // Ховаємо через 6 секунд
    setTimeout(() => {
        toast.classList.remove('show');
    }, 6000);
}

function closeSocialToast() {
    document.getElementById('social-proof-toast').classList.remove('show');
}

// Запускаємо інтервал (60 000 мілісекунд = 1 хвилина)
// Робимо затримку 10 секунд перед першим показом
setTimeout(() => {
    showSocialToast();
    socialToastTimer = setInterval(showSocialToast, 60000);
}, 10000);
