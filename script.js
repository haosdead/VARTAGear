const CSV_URL = 'data.csv';
const ITEMS_PER_PAGE = 21;

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
        },
        error: function(err) {
            console.error("Помилка завантаження CSV:", err);
        }
    });
}

function renderCatalog() {
    const container = document.getElementById('catalog');
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const items = filteredProducts.slice(start, start + ITEMS_PER_PAGE);

    if (items.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding: 50px; width: 100%; grid-column: 1/-1; color: #888;">Товарів не знайдено</div>';
        return;
    }

    container.innerHTML = items.map(p => {
        const pics = p.Pictures ? p.Pictures.split(',').map(s => s.trim()) : [];
        const mainPic = pics[0] || '';
        const isSale = p.Badge === 'SALE';
        
        return `
        <div class="card ${isSale ? 'sale-card' : ''}" onclick="openModal(${p.myId})">
            <div class="card-img-wrap">
                ${isSale ? '<div class="badge-sale"><i class="fas fa-fire"></i> SALE</div>' : ''}
                <img src="${mainPic}" loading="lazy" alt="${p.Name}">
            </div>
            <div class="card-info">
                <div>
                    <small>${p.SubCategory || p.Category}</small>
                    <h4>${p.Name}</h4>
                    <div class="price-box ${isSale ? 'price-box-sale' : ''}">
                        ${p.OldPrice ? `<span class="old-price">${p.OldPrice} грн</span>` : ''}
                        <span class="current-price">${p.Price} грн</span>
                    </div>
                </div>
                <button class="buy-btn-card ${isSale ? 'buy-btn-sale' : ''}" onclick="event.stopPropagation(); openModal(${p.myId})">
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

function toggleCategory(catGroupElement) {
    catGroupElement.classList.toggle('active');
}

function openModal(id) {
    const p = allProducts.find(x => x.myId === id);
    if(!p) return;

    document.getElementById('modal-name').innerText = p.Name;
    document.getElementById('modal-price').innerText = `${p.Price} грн`;
    
    const oldPriceEl = document.getElementById('modal-old-price');
    if (p.OldPrice) {
        oldPriceEl.innerText = `${p.OldPrice} грн`;
        oldPriceEl.style.display = 'inline-block';
    } else {
        oldPriceEl.innerText = '';
        oldPriceEl.style.display = 'none';
    }

    // Форматування опису (абзаци)
    if (p.Description) {
        let formattedDesc = p.Description.replace(/\n/g, '<br>');
        document.getElementById('modal-desc').innerHTML = formattedDesc;
    } else {
        document.getElementById('modal-desc').innerHTML = 'Опис очікується...';
    }

    document.getElementById('modal-vendor').innerText = `Артикул: ${p.VendorCode || 'Не вказано'}`;

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
    document.getElementById('cart-count').innerText = cart.length;
    const content = document.getElementById('cart-content');
    const footer = document.getElementById('cart-footer');
    
    if (cart.length === 0) {
        content.innerHTML = '<div style="text-align:center; padding:50px 0; color:#666;"><i class="fas fa-shopping-cart" style="font-size:40px; margin-bottom:15px; opacity:0.3"></i><br>Кошик порожній</div>';
        footer.style.display = 'none';
        hideCheckoutForm();
    } else {
        footer.style.display = 'block';
        let total = 0;
        content.innerHTML = cart.map((it, i) => {
            total += parseFloat(it.Price);
            return `
            <div class="cart-item">
                <div class="cart-item-info">
                    <span class="cart-item-title">${it.Name}</span>
                    <span class="cart-item-meta">Розмір: ${it.selectedSize}</span>
                    <span class="cart-item-price">${it.Price} грн</span>
                </div>
                <span class="cart-item-remove" onclick="removeFromCart(${i})"><i class="fas fa-times"></i></span>
            </div>`;
        }).join('');
        
        document.getElementById('cart-total-price').innerText = total;
        document.getElementById('final-total-price').innerText = total;
    }
}

function removeFromCart(i) { cart.splice(i, 1); updateCartUI(); }

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
function closeModal() { document.getElementById('product-modal').style.display = 'none'; document.getElementById('body-overlay').classList.remove('active'); document.body.style.overflow = 'auto'; }
function closeAllPanels() { toggleMobileMenu(false); toggleCart(false); closeModal(); }
function resetFilters() { document.getElementById('search-input').value = ''; filterByBadge('all', document.querySelector('.filter-tag')); }