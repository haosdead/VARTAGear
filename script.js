let products = [];
let cart = [];
const CSV_URL = 'data.csv'; // Назва твого файлу на GitHub

// Завантаження та обробка CSV
Papa.parse(CSV_URL, {
    download: true,
    header: true,
    complete: function(results) {
        // Фільтруємо порожні рядки
        products = results.data.filter(p => p.Name && p.Name.trim() !== "");
        populateCategories();
        renderCatalog(products);
    }
});

// Створення списку категорій у фільтрі
function populateCategories() {
    const cats = [...new Set(products.map(p => p.Category))].filter(Boolean);
    const select = document.getElementById('filter-cat');
    cats.forEach(c => {
        let opt = document.createElement('option');
        opt.value = c;
        opt.innerText = c;
        select.appendChild(opt);
    });
}

// Вивід карток товарів
function renderCatalog(items) {
    const container = document.getElementById('catalog');
    container.innerHTML = '';
    
    items.forEach((item, index) => {
        const pics = item.Pictures ? item.Pictures.split(',') : [];
        const sizes = item.Sizes ? item.Sizes.split(',') : [];
        const mainPic = pics[0] || 'https://via.placeholder.com/300x300?text=No+Photo';

        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="card-img-container" onclick="openGallery('${item.Pictures}')">
                <img src="${mainPic.trim()}" alt="${item.Name}" loading="lazy">
            </div>
            <div class="card-body">
                <div style="font-size: 0.8rem; color: var(--khaki);">${item.SubCategory}</div>
                <h4 style="margin: 5px 0;">${item.Name}</h4>
                <div class="price">
                    ${item.OldPrice && item.OldPrice !== "" ? `<span class="old-price">${item.OldPrice} грн</span>` : ''}
                    ${item.Price} грн
                </div>
                <select class="size-selector" id="size-${index}">
                    <option value="">Оберіть розмір</option>
                    ${sizes.map(s => `<option value="${s.trim()}">${s.trim()}</option>`).join('')}
                </select>
                <button class="btn-buy" onclick="addToCart(${index})">До кошика</button>
            </div>
        `;
        container.appendChild(card);
    });
}

// Фільтрація
function filterItems() {
    const q = document.getElementById('search').value.toLowerCase();
    const color = document.getElementById('filter-color').value.toLowerCase();
    const cat = document.getElementById('filter-cat').value;

    const filtered = products.filter(p => {
        const name = p.Name ? p.Name.toLowerCase() : "";
        const desc = p.Description ? p.Description.toLowerCase() : "";
        const pCat = p.Category || "";

        const matchName = name.includes(q) || desc.includes(q);
        const matchColor = color === "" || name.includes(color) || desc.includes(color);
        const matchCat = cat === "" || pCat === cat;
        
        return matchName && matchColor && matchCat;
    });
    renderCatalog(filtered);
}

// Кошик
function addToCart(idx) {
    const sizeSelect = document.getElementById(`size-${idx}`);
    const size = sizeSelect.value;
    
    if(!size) { 
        alert('Будь ласка, оберіть розмір!'); 
        return; 
    }
    
    const item = products[idx];
    cart.push({ 
        name: item.Name, 
        price: item.Price, 
        size: size 
    });
    
    updateCartUI();
    toggleCart(true);
}

function updateCartUI() {
    document.getElementById('cart-count').innerText = cart.length;
    const content = document.getElementById('cart-content');
    
    if(cart.length === 0) { 
        content.innerText = 'Порожньо'; 
        return; 
    }
    
    content.innerHTML = cart.map((it, i) => `
        <div class="cart-item">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                    <b>${it.name}</b><br>
                    <small>Розмір: ${it.size} | Ціна: ${it.price} грн</small>
                </div>
                <span onclick="removeFromCart(${i})" style="color:#ff4444; cursor:pointer; padding:5px;">✕</span>
            </div>
        </div>
    `).join('');
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

// Оформлення замовлення
function checkout(platform) {
    if(cart.length === 0) {
        alert("Кошик порожній!");
        return;
    }
    
    let text = "🪖 Нове замовлення:\n\n";
    let total = 0;
    
    cart.forEach((it, index) => {
        text += `${index + 1}. ${it.name}\n   📏 Розмір: ${it.size}\n   💰 Ціна: ${it.price} грн\n\n`;
        total += parseFloat(it.price);
    });
    
    text += `💵 Разом: ${total} грн`;
    
    const encoded = encodeURIComponent(text);
    
    if(platform === 'tg') {
        window.open(`https://t.me/vartagear?text=${encoded}`); 
    } else {
        window.open(`https://wa.me/+380933923810?text=${encoded}`); 
    }
}

// Перегляд фото
function openGallery(picsStr) {
    const pics = picsStr.split(',');
    if(pics.length > 0) {
        window.open(pics[0].trim(), '_blank');
    }
}