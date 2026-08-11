const SUPABASE_URL = 'https://tfzkcejlbasehjmtiwpw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmemtjZWpsYmFzZWhqbXRpd3B3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NDA4OTIsImV4cCI6MjEwMjAxNjg5Mn0.yC2uQ4-KGErtVgUlgiGmSukwBi3zc7PpVs4WlqLEtJc';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let adminProfile = null;
let allClients = [];

function getSiteUrl() {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'https://vartagear.com.ua/admin.html';
    return window.location.origin + '/admin.html';
}

const STATUS_LABELS = {
    new: 'Нове', confirmed: 'Підтверджено', processing: 'В обробці',
    shipped: 'Відправлено', delivered: 'Доставлено', cancelled: 'Скасовано'
};

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await sb.auth.getSession();
    if (session?.user) await checkAdminAccess(session.user);
});

sb.auth.onAuthStateChange(async (_e, session) => {
    if (session?.user) await checkAdminAccess(session.user);
    else showLoginScreen();
});

async function checkAdminAccess(user) {
    const { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).single();
    if (!profile || profile.role !== 'admin') {
        showLoginMsg('Доступ заборонено. Потрібна роль admin.', true);
        await sb.auth.signOut();
        return;
    }
    adminProfile = profile;
    document.getElementById('admin-login-screen').style.display = 'none';
    document.getElementById('admin-dashboard').style.display = 'flex';
    document.getElementById('admin-user-email').textContent = user.email;
    loadAdminOrders();
    loadAdminClients();
    loadAdminPromos();
}

function showLoginScreen() {
    document.getElementById('admin-login-screen').style.display = 'flex';
    document.getElementById('admin-dashboard').style.display = 'none';
}

function showLoginMsg(msg, isError) {
    const el = document.getElementById('admin-login-msg');
    el.textContent = msg;
    el.className = 'admin-msg ' + (isError ? 'error' : 'success');
}

async function adminLogin() {
    const email = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-password').value;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) showLoginMsg(error.message, true);
}

async function adminLoginGoogle() {
    await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: getSiteUrl() } });
}

async function adminLogout() {
    await sb.auth.signOut();
    showLoginScreen();
}

function switchAdminTab(tab) {
    document.querySelectorAll('.admin-nav-item').forEach(n => n.classList.toggle('active', n.dataset.tab === tab));
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('admin-tab-' + tab).classList.add('active');
    const titles = { orders: 'Замовлення', clients: 'Клієнти', promos: 'Промокоди' };
    document.getElementById('admin-page-title').textContent = titles[tab];
}

async function loadAdminOrders() {
    const container = document.getElementById('admin-orders-table');
    container.innerHTML = '<div class="admin-loading"><i class="fas fa-spinner fa-spin"></i></div>';

    const statusFilter = document.getElementById('order-status-filter').value;
    let query = sb.from('orders').select('*, order_items(*)').order('created_at', { ascending: false });
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);

    const { data: orders, error } = await query;
    if (error) { container.innerHTML = '<p class="admin-error">' + error.message + '</p>'; return; }
    if (!orders?.length) { container.innerHTML = '<p class="admin-empty">Замовлень немає</p>'; return; }

    // Дістаємо email клієнтів
    const userIds = [...new Set(orders.map(o => o.user_id).filter(Boolean))];
    let profileMap = {};
    if (userIds.length) {
        const { data: profiles } = await sb.from('profiles').select('id, email, full_name').in('id', userIds);
        (profiles || []).forEach(p => { profileMap[p.id] = p; });
    }

    container.innerHTML = `<table class="admin-table">
        <thead><tr>
            <th>ID</th><th>Клієнт</th><th>Товари</th><th>Сума</th><th>Статус</th><th>Дата</th><th>Дії</th>
        </tr></thead>
        <tbody>${orders.map(o => {
            const items = (o.order_items || []).map(i => i.product_name).join(', ');
            const prof = profileMap[o.user_id];
            const client = prof?.email || o.shipping_data?.name || 'Гість';
            const date = new Date(o.created_at).toLocaleDateString('uk-UA');
            return `<tr>
                <td data-label="ID"><code>${o.id.slice(0, 8)}</code></td>
                <td data-label="Клієнт">${client}</td>
                <td data-label="Товари" class="td-items" title="${items}">${items.slice(0, 40)}${items.length > 40 ? '...' : ''}</td>
                <td data-label="Сума"><strong>${o.total_amount} ₴</strong></td>
                <td data-label="Статус">
                    <select class="status-select status-${o.status}" onchange="updateOrderStatus('${o.id}', this.value)">
                        ${Object.entries(STATUS_LABELS).map(([k, v]) =>
                            `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v}</option>`
                        ).join('')}
                    </select>
                </td>
                <td data-label="Дата">${date}</td>
                <td data-label="Дії">
                    <button class="admin-btn-icon" onclick="viewOrderDetails('${o.id}')" title="Деталі"><i class="fas fa-eye"></i></button>
                </td>
            </tr>`;
        }).join('')}</tbody>
    </table>`;
}

async function updateOrderStatus(orderId, newStatus) {
    const { error } = await sb.from('orders').update({ status: newStatus }).eq('id', orderId);
    if (error) { alert('Помилка: ' + error.message); return; }

    if (newStatus === 'delivered') {
        const { data: order } = await sb.from('orders').select('user_id, total_amount').eq('id', orderId).single();
        if (order?.user_id) {
            const pts = Math.floor(order.total_amount / 100);
            if (pts > 0) {
                const { data: prof } = await sb.from('profiles').select('bonus_points').eq('id', order.user_id).single();
                await sb.from('profiles').update({ bonus_points: (prof?.bonus_points || 0) + pts }).eq('id', order.user_id);
                await sb.from('bonus_transactions').insert([{
                    user_id: order.user_id, amount: pts, type: 'earn',
                    description: 'Бонуси за доставлене замовлення', order_id: orderId
                }]);
            }
        }
    }
    loadAdminOrders();
}

async function viewOrderDetails(orderId) {
    const { data: order } = await sb.from('orders').select('*, order_items(*)').eq('id', orderId).single();
    if (!order) return;
    const s = order.shipping_data || {};
    const items = (order.order_items || []).map(i =>
        `• ${i.product_name} (${i.size || '—'}) × ${i.quantity} — ${i.price} ₴`
    ).join('\n');
    alert(`Замовлення #${orderId.slice(0, 8)}\n\nТовари:\n${items}\n\nСума: ${order.total_amount} ₴\nПромо: ${order.promo_code || '—'}\nБонуси: -${order.bonus_used || 0} ₴\n\nДоставка:\n${s.name || ''}\n${s.phone || ''}\n${s.city || ''}, ${s.np || ''}\nОплата: ${s.paymentMethod || '—'}`);
}

async function loadAdminClients() {
    const container = document.getElementById('admin-clients-table');
    container.innerHTML = '<div class="admin-loading"><i class="fas fa-spinner fa-spin"></i></div>';

    const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) { container.innerHTML = '<p class="admin-error">' + error.message + '</p>'; return; }

    allClients = data || [];
    renderClientsTable(allClients);
}

function filterClients() {
    const q = document.getElementById('client-search').value.toLowerCase();
    const filtered = allClients.filter(c =>
        (c.email || '').toLowerCase().includes(q) || (c.full_name || '').toLowerCase().includes(q)
    );
    renderClientsTable(filtered);
}

function renderClientsTable(clients) {
    const container = document.getElementById('admin-clients-table');
    if (!clients.length) { container.innerHTML = '<p class="admin-empty">Клієнтів немає</p>'; return; }

    container.innerHTML = `<table class="admin-table">
        <thead><tr>
            <th>Ім'я</th><th>Email</th><th>Заявки на Промо</th><th>Бонуси</th><th>Роль</th><th>Дата</th><th>Дії</th>
        </tr></thead>
        <tbody>${clients.map(c => {
            const date = new Date(c.created_at).toLocaleDateString('uk-UA');
            
            // Формуємо кнопки заявок (Якщо статус pending - показуємо)
            let requestsHTML = '';
            if (c.tg_status === 'pending') {
                requestsHTML += `<button class="admin-btn-sm" style="background:#2AABEE; color:#fff; border:none; padding: 5px 12px; margin-right: 5px;" onclick="approveSocialPromo('${c.id}', '${c.email}', 'tg')" title="Схвалити Telegram"><i class="fab fa-telegram-plane"></i> Дати код</button>`;
            }
            if (c.inst_status === 'pending') {
                requestsHTML += `<button class="admin-btn-sm" style="background:linear-gradient(45deg, #f09433, #dc2743); color:#fff; border:none; padding: 5px 12px;" onclick="approveSocialPromo('${c.id}', '${c.email}', 'inst')" title="Схвалити Instagram"><i class="fab fa-instagram"></i> Дати код</button>`;
            }
            if (requestsHTML === '') requestsHTML = '<span style="color:#555;">—</span>';

            return `<tr>
                <td data-label="Ім'я">${c.full_name || '—'}</td>
                <td data-label="Email">${c.email || '—'}</td>
                <td data-label="Заявки" class="td-actions">${requestsHTML}</td>
                <td data-label="Бонуси"><span class="bonus-badge">${c.bonus_points || 0}</span></td>
                <td data-label="Роль"><span class="role-badge role-${c.role}">${c.role}</span></td>
                <td data-label="Дата">${date}</td>
                <td data-label="Дії" class="td-actions">
                    <button class="admin-btn-sm" onclick="grantBonus('${c.id}', '${c.email}')" title="Нарахувати бонуси">
                        <i class="fas fa-gift"></i>
                    </button>
                    <button class="admin-btn-sm" onclick="assignPersonalPromo('${c.id}', '${c.email}')" title="Створити ручний промокод">
                        <i class="fas fa-tag"></i>
                    </button>
                    <select class="role-select" onchange="changeUserRole('${c.id}', this.value)">
                        <option value="client" ${c.role === 'client' ? 'selected' : ''}>client</option>
                        <option value="admin" ${c.role === 'admin' ? 'selected' : ''}>admin</option>
                    </select>
                </td>
            </tr>`;
        }).join('')}</tbody>
    </table>`;
}

// Функція-генератор, яка одним кліком схвалює заявку і робить код
window.approveSocialPromo = async function(userId, email, network) {
    if (!confirm(`Підтвердити підписку та видати промокод 10% для ${email}?`)) return;
    
    // Генеруємо випадковий код, наприклад TG-4821 або INST-9214
    const codePrefix = network === 'tg' ? 'TG-' : 'INST-';
    const code = codePrefix + Math.floor(Math.random() * 9000 + 1000);
    
    // 1. Створюємо персональний промокод у базі
    const { error: promoError } = await sb.from('promo_codes').insert([{
        code: code,
        discount_percent: 10,
        is_global: false,
        assigned_user_id: userId,
        description: `Бонус за підписку на ${network === 'tg' ? 'Telegram' : 'Instagram'}`
    }]);
    
    if (promoError) {
        alert('Помилка створення промокоду: ' + promoError.message);
        return;
    }
    
    // 2. Міняємо статус заявки в профілі на 'approved', щоб кнопка зникла
    const updateData = {};
    if (network === 'tg') updateData.tg_status = 'approved';
    if (network === 'inst') updateData.inst_status = 'approved';
    
    await sb.from('profiles').update(updateData).eq('id', userId);
    
    alert(`✅ Клієнту успішно видано персональний промокод: ${code}`);
    loadAdminClients(); // Оновлюємо таблицю, кнопка заявки зникне
    loadAdminPromos(); // Оновлюємо сусідню вкладку промокодів
};

async function grantBonus(userId, email) {
    const amount = prompt(`Скільки бонусів нарахувати для ${email}?`, '100');
    if (!amount || isNaN(amount)) return;
    const pts = parseInt(amount);

    const { data: prof } = await sb.from('profiles').select('bonus_points').eq('id', userId).single();
    await sb.from('profiles').update({ bonus_points: (prof?.bonus_points || 0) + pts }).eq('id', userId);
    await sb.from('bonus_transactions').insert([{
        user_id: userId, amount: pts, type: 'admin_grant', description: 'Нараховано адміністратором'
    }]);
    alert(`✅ Нараховано ${pts} бонусів`);
    loadAdminClients();
}

async function assignPersonalPromo(userId, email) {
    const code = prompt(`Промокод для ${email}:`, 'VIP' + Math.floor(Math.random() * 900 + 100));
    if (!code) return;
    const discount = prompt('Знижка (%):', '10');
    if (!discount) return;

    const { error } = await sb.from('promo_codes').insert([{
        code: code.toUpperCase(),
        discount_percent: parseInt(discount),
        is_global: false,
        assigned_user_id: userId,
        description: `Персональний промокод для ${email}`
    }]);
    if (error) alert('Помилка: ' + error.message);
    else { alert(`✅ Промокод ${code.toUpperCase()} створено`); loadAdminPromos(); }
}

async function changeUserRole(userId, role) {
    if (!confirm(`Змінити роль на "${role}"?`)) { loadAdminClients(); return; }
    await sb.from('profiles').update({ role }).eq('id', userId);
    loadAdminClients();
}

async function loadAdminPromos() {
    const container = document.getElementById('admin-promos-table');
    const { data, error } = await sb.from('promo_codes').select('*').order('created_at', { ascending: false });
    if (error) { container.innerHTML = '<p class="admin-error">' + error.message + '</p>'; return; }
    if (!data?.length) { container.innerHTML = '<p class="admin-empty">Промокодів немає</p>'; return; }

    const userIds = [...new Set(data.map(p => p.assigned_user_id).filter(Boolean))];
    let emailMap = {};
    if (userIds.length) {
        const { data: profiles } = await sb.from('profiles').select('id, email').in('id', userIds);
        (profiles || []).forEach(p => { emailMap[p.id] = p.email; });
    }

    container.innerHTML = `<table class="admin-table">
        <thead><tr>
            <th>Код</th><th>Знижка</th><th>Тип</th><th>Використань</th><th>Клієнт</th><th>Активний</th><th>Дії</th>
        </tr></thead>
        <tbody>${data.map(p => `<tr>
            <td data-label="Код"><code>${p.code}</code></td>
            <td data-label="Знижка">-${p.discount_percent}%</td>
            <td data-label="Тип">${p.is_global ? 'Глобальний' : 'Персональний'}</td>
            <td data-label="Використано">${p.used_count || 0}${p.max_uses ? '/' + p.max_uses : ''}</td>
            <td data-label="Клієнт">${emailMap[p.assigned_user_id] || '—'}</td>
            <td data-label="Активний">${p.active ? '✅' : '❌'}</td>
            <td data-label="Дії">
                <button class="admin-btn-icon" onclick="togglePromo('${p.id}', ${!p.active})" title="Вкл/Викл">
                    <i class="fas fa-power-off"></i>
                </button>
            </td>
        </tr>`).join('')}</tbody>
    </table>`;
}

async function createPromoCode() {
    const code = document.getElementById('new-promo-code').value.trim().toUpperCase();
    const discount = parseInt(document.getElementById('new-promo-discount').value);
    const desc = document.getElementById('new-promo-desc').value.trim();
    const maxUses = document.getElementById('new-promo-max-uses').value;
    const userEmail = document.getElementById('new-promo-user-email').value.trim();
    const expires = document.getElementById('new-promo-expires').value;

    if (!code || !discount) return alert('Вкажіть код та знижку');

    let assignedUserId = null;
    if (userEmail) {
        const { data: user } = await sb.from('profiles').select('id').eq('email', userEmail).single();
        if (!user) return alert('Клієнта з таким email не знайдено');
        assignedUserId = user.id;
    }

    const { error } = await sb.from('promo_codes').insert([{
        code, discount_percent: discount, description: desc || null,
        max_uses: maxUses ? parseInt(maxUses) : null,
        is_global: !assignedUserId, assigned_user_id: assignedUserId,
        expires_at: expires ? new Date(expires).toISOString() : null
    }]);
    if (error) alert('Помилка: ' + error.message);
    else {
        alert('✅ Промокод створено');
        document.getElementById('new-promo-code').value = '';
        document.getElementById('new-promo-discount').value = '';
        document.getElementById('new-promo-desc').value = '';
        loadAdminPromos();
    }
}

async function togglePromo(id, active) {
    await sb.from('promo_codes').update({ active }).eq('id', id);
    loadAdminPromos();
}
