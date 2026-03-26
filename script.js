let allProducts = [];
let filteredProducts = [];
let cart = [];

// НАЛАШТУВАННЯ
const CSV_URL = 'data.csv'; 
const ITEMS_PER_PAGE = 10; // Тільки 10 товарів на сторінці
let currentPage = 1;

// Галерея модалки
let currentModalPics = [];
let currentModalPicIndex = 0;

// Ініціалізація
document.addEventListener('DOMContentLoaded', () => {
    loadCSV();
});

function loadCSV() {
    Papa.parse(CSV_URL, {
        download: true,
        header: true,
        complete: function(results) {
            // Фільтруємо сміття
            allProducts = results.data.filter(p => p.Name && p.Name.trim() !== "");
            filteredProducts = [...allProducts]; // Спочатку показуємо все
            
            populateMainCategories();
            renderCatalog();
        }
    });
}

// ПАГІНАЦІЯ ТА ВИВІД
function renderCatalog() {
    const container = document.getElementById('catalog');
    container.innerHTML = '';
    
    // Розрахунок товарів для поточної сторінки
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const pageItems = filteredProducts.slice(startIndex, endIndex);

    if (pageItems.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 50px; color: #888;">Товарів не знайдено</div>';
        renderPagination(0);
        return;
    }

    pageItems.forEach((item) => {
        // Знаходимо індекс оригінального товару
        const originalIndex = allProducts.findIndex(p => p.VendorCode === item.VendorCode);
        
        const pics = item.Pictures ? item.Pictures.split(',') : [];
        const mainPic = pics[0] || 'https://via.placeholder.com/400x400?text=No+Photo';

        const card = document.createElement('div');
        card.className = 'card';
        // Клік на картку відкриває модалку
        card.onclick = (e) => {
            if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'SELECT') {
                openModal(originalIndex);
            }
        };

        card.innerHTML = `
            <div class="card-img-container">
                <img src="${mainPic.trim()}" alt="${item.Name}" loading="lazy">
            </div>
            <div class="card-body">
                <div class="subcat-label">${item.SubCategory}</div>
                <h4 class="card-name">${item.Name}</h4>
                <div class="price-block">
                    ${item.OldPrice ? `<span class="old-price">${item.OldPrice} грн</span>` : ''}
                    <span class="price">${item.Price} грн</span>
                </div>
                <button class="btn-buy" onclick="addToCartFromCard(event, ${originalIndex})">Купити</button>
            </div>
        `;
        container.appendChild(card);
    });

    renderPagination(filteredProducts.length);
}

function renderPagination(totalItems) {
    const container = document.getElementById('pagination');
    container.innerHTML = '';
    
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    
    if (totalPages <= 1) return; // Не треба кнопок, якщо сторінка одна

    // Максимум 5 кнопок навколо поточної
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    
    if (endPage - startPage < 4) {
        startPage = Math.max(1, endPage - 4);
    }

    for (let i = startPage; i <= endPage; i++) {
        const btn = document.createElement('button');
        btn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
        btn.innerText = i;
        btn.onclick = () => {
            currentPage = i;
            renderCatalog();
            window.scrollTo({top: 0, behavior: 'smooth'});
        };
        container.appendChild(btn);
    }
}

// ФІЛЬТРАЦІЯ ТА КАТЕГОРІЇ
function populateMainCategories() {
    const cats = [...new Set(allProducts.map(p => p.Category))].filter(Boolean).sort();
    const select = document.getElementById('filter-cat');
    cats.forEach(c => {
        let opt = document.createElement('option');
        opt.value = c; opt.innerText = c; select.appendChild(opt);
    });
}

// Коли змінюється головна категорія, оновлюємо підкатегорії
document.getElementById('filter-cat').addEventListener('change', function() {
    const mainCat = this.value;
    const subSelect = document.getElementById('filter-subcat');
    subSelect.innerHTML = '<option value="">Усі підкатегорії</option>';
    subSelect.disabled = true;

    if (mainCat) {
        const subCats = [...new Set(allProducts
            .filter(p => p.Category === mainCat)
            .map(p => p.SubCategory))]
            .filter(Boolean).sort();
        
        if (subCats.length > 0) {
            subCats.forEach(s => {
                let opt = document.createElement('option');
                opt.value = s; opt.innerText = s; subSelect.appendChild(opt);
            });
            subSelect.disabled = false;
        }
    }
});

function resetPageAndFilter() {
    currentPage = 1; // Завжди повертаємось на 1 сторінку при пошуку
    filterItems();
}

function filterItems() {
    const q = document.getElementById('search').value.toLowerCase().trim();
    const cat = document.getElementById('filter-cat').value;
    const subcat = document.getElementById('filter-subcat').value;

    filteredProducts = allProducts.filter(p => {
        const name = (p.Name || "").toLowerCase();
        const desc = (p.Description || "").toLowerCase();
        const vendor = (p.VendorCode || "").toLowerCase();

        // Пошук в назві, описі та артикулі
        const matchSearch = q === "" || name.includes(q) || desc.includes(q) || vendor.includes(q);
        const matchCat = cat === "" || p.Category === cat;
        const matchSub = subcat === "" || p.SubCategory === subcat;
        
        return matchSearch && matchCat && matchSub;
    });
    
    renderCatalog();
}

// МОДАЛЬНЕ ВІКНО ТА КАРУСЕЛЬ (Карусель з фото)
function openModal(index) {
    const item = allProducts[index];
    if (!item) return;

    // Інфо
    document.getElementById('modal-name').innerText = item.Name;
    document.getElementById('modal-subcat').innerText = item.SubCategory;
    document.getElementById('modal-desc').innerText = item.Description || "Опис відсутній.";
    document.getElementById('modal-price').innerText = `${item.Price} грн`;
    document.getElementById('modal-old-price').innerText = item.OldPrice ? `${item.OldPrice} грн` : '';
    document.getElementById('modal-vendor').innerText = `Арт: ${item.VendorCode}`;

    // Розміри
    const sizes = item.Sizes ? item.Sizes.split(',') : [];
    const sizeSelect = document.getElementById('modal-size-selector');
    sizeSelect.innerHTML = '<option value="">Оберіть розмір</option>';
    sizes.forEach(s => {
        let opt = document.createElement('option');
        opt.value = s.trim(); opt.innerText = s.trim(); sizeSelect.appendChild(opt);
    });

    // Кнопка купити в модалці
    const addBtn = document.getElementById('modal-add-btn');
    addBtn.onclick = () => addToCartFromModal(index);

    // Галерея / Карусель
    currentModalPics = item.Pictures ? item.Pictures.split(',').map(p => p.trim()) : [];
    currentModalPicIndex = 0;
    renderModalGallery();

    document.getElementById('product-modal').classList.add('open');
    document.body.style.overflow = 'hidden'; // Заборонити скрол фону
}

function closeModal() {
    document.getElementById('product-modal').classList.remove('open');
    document.body.style.overflow = '';
}

// Закриття по кліку на фоні
window.onclick = function(event) {
    const modal = document.getElementById('product-modal');
    if (event.target === modal) {
        closeModal();
    }
}

// Логіка каруселі
function renderModalGallery() {
    const mainImg = document.getElementById('modal-main-img');
    const thumbsContainer = document.getElementById('modal-thumbnails');
    const prevBtn = document.querySelector('.prev-pic');
    const nextBtn = document.querySelector('.next-pic');

    thumbsContainer.innerHTML = '';
    
    if (currentModalPics.length === 0) {
        mainImg.src = 'https://via.placeholder.com/400x400?text=No+Photo';
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
        return;
    }

    mainImg.src = currentModalPics[currentModalPicIndex];

    // Показуємо кнопки навігації тільки якщо > 1 фото
    const showNav = currentModalPics.length > 1;
    prevBtn.style.display = showNav ? 'block' : 'none';
    nextBtn.style.display = showNav ? 'block' : 'none';

    // Рендер мініатюр
    if (showNav) {
        currentModalPics.forEach((pic, index) => {
            const img = document.createElement('img');
            img.src = pic;
            img.className = `thumb ${index === currentModalPicIndex ? 'active' : ''}`;
            img.onclick = () => {
                currentModalPicIndex = index;
                renderModalGallery();
            };
            thumbsContainer.appendChild(img);
        });
    }
}

function changeModalPic(direction) {
    currentModalPicIndex += direction;
    if (currentModalPicIndex >= currentModalPics.length) currentModalPicIndex = 0;
    if (currentModalPicIndex < 0) currentModalPicIndex = currentModalPics.length - 1;
    renderModalGallery();
}

// КОШИК ТА ЗАМОВЛЕННЯ
function addToCartFromCard(event, index) {
    event.stopPropagation(); // Зупинити відкриття модалки
    // На картці немає вибору розміру, тому відкриваємо модалку
    openModal(index);
}

function addToCartFromModal(index) {
    const sizeSelect = document.getElementById('modal-size-selector');
    const size = sizeSelect.value;
    
    if(!size) { 
        sizeSelect.style.borderColor = '#ff4444';
        setTimeout(() => sizeSelect.style.borderColor = '', 1000);
        return; 
    }
    
    const item = allProducts[index];
    cart.push({ name: item.Name, price: item.Price, size: size, vendor: item.VendorCode });
    
    updateCartUI();
    closeModal();
    toggleCart(true);
}

function updateCartUI() {
    document.getElementById('cart-count').innerText = cart.length;
    const content = document.getElementById('cart-content');
    const footer = document.getElementById('cart-footer');
    
    if(cart.length === 0) { 
        content.innerHTML = '<div style="text-align:center; padding: 30px; color:#666;">Порожньо</div>'; 
        footer.style.display = 'none';
        return; 
    }
    
    footer.style.display = 'block';
    let totalPrice = 0;

    content.innerHTML = cart.map((it, i) => {
        totalPrice += parseFloat(it.price);
        return `
            <div class="cart-item">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <b style="color:white;">${it.name}</b><br>
                        <small style="color:var(--mono-coyote);">Розмір: ${it.size} | Арт: ${it.vendor}</small><br>
                        <b>${it.price} грн</b>
                    </div>
                    <span onclick="removeFromCart(${i})" style="color:#ff4444; cursor:pointer; padding:5px; font-weight:bold;">✕</span>
                </div>
            </div>
        `;
    }).join('');

    document.getElementById('cart-total-price').innerText = totalPrice;
}

function removeFromCart(i) {
    cart.splice(i, 1);
    updateCartUI();
}

function toggleCart(show = null) {
    const sidebar = document.getElementById('cart-sidebar');
    if(show === true) sidebar.classList.add('active');
    else if(show === false) sidebar.classList.remove('active');
    else sidebar.classList.toggle('active');
}

function checkout(platform) {
    if(cart.length === 0) return;
    
    let text = "🪖 ЗАМОВЛЕННЯ VARTA GEAR:\n\n";
    let total = 0;
    
    cart.forEach((it, index) => {
        text += `${index + 1}. ${it.name}\n   Арт: ${it.vendor}\n   📏 Розмір: ${it.size}\n   💰 Ціна: ${it.price} грн\n\n`;
        total += parseFloat(it.price);
    });
    
    text += `💵 РАЗОМ ДО ОПЛАТИ: ${total} грн`;
    
    const encoded = encodeURIComponent(text);
    
    if(platform === 'tg') {
        window.open(`https://t.me/vartagear?text=${encoded}`); // ЗАМІНИ vartagear НА СВІЙ НІК
    } else {
        window.open(`https://wa.me/+380933923810?text=${encoded}`); // ЗАМІНИ НОМЕР НА СВІЙ
    }
}