// ==========================================
// API-КЛИЕНТ ДЛЯ СВЯЗИ С БЭКЕНДОМ
// ==========================================


const API_BASE = "https://hopeful-wholeness-production-9a83.up.railway.app";

// Текущий пользователь (сохраняется после входа)
let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');

function isLoggedIn() {
    return currentUser !== null;
}

function getUserId() {
    return currentUser ? currentUser.id : null;
}

// ===== УНИВЕРСАЛЬНАЯ ФУНКЦИЯ ЗАПРОСА =====
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;

    const config = {
        headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true',
            ...options.headers,
        },
        ...options,
    };

    // Если body — FormData, убираем Content-Type (браузер сам поставит с boundary)
    if (options.body instanceof FormData) {
        delete config.headers['Content-Type'];
    }

    console.log(`📡 ${options.method || 'GET'} ${url}`);

    try {
        const response = await fetch(url, config);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            let errorMessage = `Ошибка ${response.status}`;

            if (errorData.detail) {
                if (typeof errorData.detail === 'object') {
                    errorMessage = errorData.detail.map(err => `${err.loc.join('.')}: ${err.msg}`).join(', ');
                } else {
                    errorMessage = errorData.detail;
                }
            } else if (errorData.error) {
                errorMessage = errorData.error;
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();
        console.log(`✅ Ответ от ${endpoint}:`, data);
        return data;
    } catch (error) {
        console.error(`❌ Ошибка запроса к ${endpoint}:`, error.message);
        throw error;
    }
}

// ==========================================
// АВТОРИЗАЦИЯ
// ==========================================

async function registerUser(name, email, password) {
    const data = await apiRequest('/api/register', {
        method: 'POST',
        body: JSON.stringify({
            username: name,
            email: email, // ИСПРАВЛЕНО: теперь отправляем email на бэкенд!
            password: password
        }),
    });

    if (data.error || data.status === "error") {
        throw new Error(data.error || data.message || "Ошибка регистрации");
    }

    const userId = data.id ?? data.user_id;
    if (userId === undefined || userId === null) {
        throw new Error("Бэкенд не вернул ID пользователя!");
    }

    currentUser = {
        id: parseInt(userId),
        name: data.username || name,
        email: data.email || email
    };
    localStorage.setItem('currentUser', JSON.stringify(currentUser));

    return currentUser;
}

async function loginUser(email, password) {
    try {
        const data = await apiRequest('/api/login', {
            method: 'POST',
            body: JSON.stringify({
                username: email,
                password: password
            }),
        });

        if (data.error) {
            throw new Error(data.error);
        }

        const userId = data.id ?? data.user_id;
        if (userId === undefined || userId === null) {
            throw new Error("Бэкенд не вернул ID пользователя при входе!");
        }

        // ИСПРАВЛЕНО: теперь берем email напрямую из ответа бэкенда (data.email)
        currentUser = {
            id: parseInt(userId),
            name: data.username || email,
            email: data.email || email // Если бэкенд почему-то пустой, останется инпут
        };
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        return currentUser;
    } catch (error) {
        throw new Error(error.message || "Неверный логин или пароль");
    }
}


function logoutUser() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    localStorage.removeItem('favoritesList');
}

// ==========================================
// МЕСТА
// ==========================================

async function fetchAllPlaces() {
    // Передаём user_id, чтобы получить также свои приватные места (если залогинены)
    const query = isLoggedIn() ? `?user_id=${getUserId()}` : '';
    const data = await apiRequest(`/api/places${query}`);
    return Array.isArray(data) ? data : (data.places || []);
}

async function fetchPlacesByTag(tag) {
    const query = isLoggedIn() ? `?tag=${encodeURIComponent(tag)}&user_id=${getUserId()}` : `?tag=${encodeURIComponent(tag)}`;
    const data = await apiRequest(`/api/places${query}`);
    return Array.isArray(data) ? data : (data.places || []);
}

async function fetchPlaceById(placeId) {
    const query = isLoggedIn() ? `?user_id=${getUserId()}` : '';
    const data = await apiRequest(`/api/places/${placeId}${query}`);
    return data.place || data;
}

async function createPlace({ title, description, latitude, longitude, tags, file }) {
    if (!isLoggedIn()) throw new Error('Необходимо войти');

    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description || '');
    formData.append('latitude', latitude);
    formData.append('longitude', longitude);
    formData.append('tags', tags || '');
    formData.append('user_id', getUserId());
    if (file) formData.append('file', file);

    const data = await apiRequest('/api/places', {
        method: 'POST',
        body: formData,
    });

    return data;
}

// ==========================================
// ОТЗЫВЫ
// ==========================================

async function fetchReviews(placeId) {
    const data = await apiRequest(`/api/places/${placeId}/reviews`);
    return Array.isArray(data) ? data : (data.reviews || []);
}

async function fetchUserReviews(userId) {
    const data = await apiRequest(`/api/users/${userId}/reviews`);
    return Array.isArray(data) ? data : (data.reviews || []);
}

async function addReview(placeId, rating, comment, file) {
    if (!isLoggedIn()) throw new Error('Необходимо войти');

    const formData = new FormData();
    formData.append('place_id', placeId);
    formData.append('user_id', getUserId());
    formData.append('rating', rating);
    formData.append('comment', comment);
    if (file) formData.append('file', file);

    const data = await apiRequest('/api/reviews', {
        method: 'POST',
        body: formData,
    });

    return data;
}

async function updateReview(reviewId, { rating, comment, file } = {}) {
    if (!isLoggedIn()) throw new Error('Необходимо войти');

    const formData = new FormData();
    formData.append('user_id', getUserId());
    if (rating !== undefined && rating !== null) formData.append('rating', rating);
    if (comment !== undefined && comment !== null) formData.append('comment', comment);
    if (file) formData.append('file', file);

    const data = await apiRequest(`/api/reviews/${reviewId}`, {
        method: 'PUT',
        body: formData,
    });

    return data;
}

async function deleteReview(reviewId) {
    if (!isLoggedIn()) throw new Error('Необходимо войти');

    const data = await apiRequest(`/api/reviews/${reviewId}`, {
        method: 'DELETE',
        body: JSON.stringify({ user_id: getUserId() }),
    });

    return data;
}

// ==========================================
// ИЗБРАННОЕ
// ==========================================

async function fetchFavorites() {
    if (!isLoggedIn()) return [];

    const data = await apiRequest(`/api/users/${getUserId()}/favorites`);
    return Array.isArray(data) ? data : (data.favorites || []);
}

async function addToFavorites(placeId) {
    if (!isLoggedIn()) throw new Error('Необходимо войти');

    const data = await apiRequest('/api/favorites', {
        method: 'POST',
        body: JSON.stringify({
            user_id: getUserId(),
            place_id: placeId
        }),
    });

    return data;
}

async function removeFromFavorites(placeId) {
    if (!isLoggedIn()) throw new Error('Необходимо войти');

    const data = await apiRequest('/api/favorites', {
        method: 'DELETE',
        body: JSON.stringify({
            user_id: getUserId(),
            place_id: placeId
        }),
    });

    return data;
}

// ==========================================
// ФОТОГРАФИИ
// ==========================================

function getPhotoUrl(filename) {
    return `${API_BASE}/static/images/${filename}`;
}

async function uploadPhoto(placeId, file) {
    const formData = new FormData();
    formData.append('file', file);

    const data = await apiRequest(`/api/places/${placeId}/upload-photo`, {
        method: 'POST',
        body: formData,
    });

    return data;
}

// ==========================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ЛОКАЛЬНОГО ХРАНИЛИЩА
// ==========================================

function getLocalFavorites() {
    return JSON.parse(localStorage.getItem('favorites') || '[]');
}

function setLocalFavorites(ids) {
    localStorage.setItem('favorites', JSON.stringify(ids));
}

console.log(' API-клиент готов. Базовый URL:', API_BASE);
console.log(' Пользователь:', isLoggedIn() ? currentUser.name : 'не авторизован');

// ==========================================
// ЗАПРОСЫ ДЛЯ СБРОСА ПАРОЛЯ И ВХОДА ПО OTP
// ==========================================

/**
 * Отправляет email на бэкенд для генерации 5-значного кода
 */
async function requestResetCode(email) {
    // Делаем POST-запрос на бэкенд
    const data = await apiRequest('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email })
    });
    return data;
}

/**
 * Отправляет email и введённый код для проверки
 */
/**
 * Отправляет email и введённый код для проверки и авторизует пользователя
 */
async function verifyResetCode(email, code) {
    // Делаем POST-запрос на бэкенд для валидации OTP
    const data = await apiRequest('/api/auth/verify-reset-code', {
        method: 'POST',
        body: JSON.stringify({
            email: email,
            code: code
        })
    });
    
    // Если проверка прошла успешно и бэкенд вернул пользователя, логиним его в системе
    if (data && (data.id || data.user_id)) {
        const userId = data.id ?? data.user_id;
        
        currentUser = {
            id: parseInt(userId),
            name: data.username || email,
            email: data.email || email
        };
        
        // Сохраняем в localStorage, чтобы сессия не сбрасывалась при перезагрузке
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        console.log('✅ Успешный вход по OTP-коду. Пользователь:', currentUser.name);
    }
    
    return data;
} и // ===== КАРТА =====
const MINSK_CENTER = [53.9000, 27.5667];
const map = L.map('map').setView(MINSK_CENTER, 12);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

// Кластеризация
const markerCluster = L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 50,
    iconCreateFunction: function (cluster) {
        const count = cluster.getChildCount();
        let size = 'small';
        if (count > 10) size = 'large';
        else if (count > 5) size = 'medium';
        return L.divIcon({
            html: `<div><span>${count}</span></div>`,
            className: `marker-cluster marker-cluster-${size}`,
            iconSize: L.point(40, 40)
        });
    }
});

const customIcon = L.icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
    iconSize: [38, 38],
    iconAnchor: [19, 38],
    popupAnchor: [0, -38]
});

// ===== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ =====
let allPlaces = [];          // Все места с сервера (публичные + свои приватные)
let allMarkers = [];         // Маркеры на карте
let favoritesList = [];      // ID избранных мест
let activeFilter = 'all';
let activeTagFilter = null;  // Динамический хэштег из URL или клика (не из фиксированного списка)

// ===== ЗАГРУЗКА ДАННЫХ С СЕРВЕРА =====
async function loadData() {
    try {
        console.log('🔄 Загружаем места с сервера...');
        allPlaces = await fetchAllPlaces();
        console.log(`✅ Загружено ${allPlaces.length} мест`);

        // Загружаем избранное если пользователь авторизован
        if (isLoggedIn()) {
            try {
                const favs = await fetchFavorites();
                favoritesList = favs.map(f => f.place_id || f.id);
            } catch (e) {
                favoritesList = getLocalFavorites();
            }
        } else {
            favoritesList = [];
        }

        applyFiltersAndRender();

    } catch (error) {
        console.error('❌ Ошибка загрузки:', error);
        alert('Не удалось загрузить данные с сервера. Проверьте подключение.');
    }
}

// ===== ПРИМЕНЕНИЕ ФИЛЬТРОВ (тег из списка + динамический хэштег + поиск) =====
function applyFiltersAndRender() {
    let filtered = allPlaces;

    if (activeFilter !== 'all') {
        filtered = filtered.filter(place => (place.tags || []).includes(activeFilter));
    }

    if (activeTagFilter) {
        filtered = filtered.filter(place => (place.tags || []).includes(activeTagFilter));
    }

    const query = (searchInput.value || '').toLowerCase().trim();
    if (query) {
        filtered = filtered.filter(place =>
            (place.name || place.title || '').toLowerCase().includes(query) ||
            (place.tags || []).some(tag => tag.toLowerCase().includes(query)) ||
            (place.description || '').toLowerCase().includes(query)
        );
    }

    renderPlacesList(filtered);
    addAllMarkers(filtered);
    renderActiveTagBanner();
}
// Внутри async function loadData(), сразу после applyFiltersAndRender();
renderPopularHashtags();

// Новая функция рендера кликабельных хэштегов в блоке поиска
function renderPopularHashtags() {
    const container = document.getElementById('dynamicHashtagsContainer');
    if (!container) return;

    // Собираем все уникальные теги из загруженных мест
    const allTags = new Set();
    allPlaces.forEach(place => {
        if (Array.isArray(place.tags)) {
            place.tags.forEach(t => allTags.add(t));
        }
    });

    container.innerHTML = '';
    allTags.forEach(tag => {
        const btn = document.createElement('button');
        btn.className = 'tag-filter-btn';
        btn.style.cssText = 'background:#e1e8ed; border:none; border-radius:12px; padding:4px 10px; font-size:12px; cursor:pointer; color:#2c3e50; transition: 0.2s;';
        btn.textContent = `#${tag}`;

        // Эффект наведения
        btn.onmouseover = () => btn.style.background = '#3498db';
        btn.onmouseover = () => { btn.style.background = '#3498db'; btn.style.color = '#fff'; };
        btn.onmouseout = () => { btn.style.background = '#e1e8ed'; btn.style.color = '#2c3e50'; };

        btn.addEventListener('click', () => {
            activeTagFilter = tag; // Устанавливаем фильтр в map.js
            applyFiltersAndRender(); // Запускаем перерисовку карты и списка
        });
        container.appendChild(btn);
    });
}

// ===== БАННЕР "ФИЛЬТР ПО ТЕГУ #xxx" С КНОПКОЙ СБРОСА =====
function renderActiveTagBanner() {
    let banner = document.getElementById('activeTagBanner');
    if (!activeTagFilter) {
        if (banner) banner.remove();
        return;
    }
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'activeTagBanner';
        banner.style.cssText = 'background:#2c3e50;color:#fff;padding:10px 16px;margin:10px 16px;border-radius:8px;display:flex;justify-content:space-between;align-items:center;';
        document.querySelector('main').prepend(banner);
    }
    banner.innerHTML = `
        <span>Фильтр по тегу: <strong>#${activeTagFilter}</strong></span>
        <button id="clearTagFilterBtn" style="background:transparent;border:1px solid #fff;color:#fff;border-radius:6px;padding:4px 10px;cursor:pointer;">✕ Сбросить</button>
    `;
    document.getElementById('clearTagFilterBtn').addEventListener('click', () => {
        activeTagFilter = null;
        window.history.replaceState({}, document.title, window.location.pathname);
        applyFiltersAndRender();
    });
}

// ===== ПОПАП МАРКЕРА =====
function createPopupContent(place) {
    const isFav = favoritesList.includes(place.id);
    const favClass = isFav ? 'in-fav' : '';
    const favText = isFav ? '❤️ В избранном' : '🤍 В избранное';

    const imageUrl = place.image || place.photo_url || place.main_photo_url ||
        `https://placehold.co/400x200?text=${encodeURIComponent(place.name || place.title)}`;

    const isPrivate = place.user_id !== undefined && place.user_id !== null;
    const privateBadge = isPrivate ? '<span class="tag" style="background:#8e44ad;">🔒 моё место</span>' : '';

    return `
        <div class="popup-card">
            <img src="${imageUrl}" alt="${place.name || place.title}" class="popup-image" 
                 onerror="this.src='https://placehold.co/400x200?text=Нет+фото'">
            <div class="popup-info">
                <h3>${place.name || place.title}</h3>
                <div class="popup-rating">★ ${place.rating || place.avg_rating || 0}</div>
                <p>${place.description || ''}</p>
                <div class="popup-tags">
                    ${privateBadge}
                    ${(place.tags || []).map(tag => `<span class="tag">#${tag}</span>`).join(' ')}
                </div>
                <button class="popup-details-btn" onclick="goToPlace(${place.id})">
                    Подробнее →
                </button>
                <button class="popup-fav-btn ${favClass}" onclick="toggleFavorite(${place.id}, this)">
                    ${favText}
                </button>
            </div>
        </div>
    `;
}

// ===== НАВИГАЦИЯ =====
function goToPlace(id) {
    if (!isLoggedIn()) {
        alert('🔒 Необходимо войти, чтобы посмотреть детали!');
        openModal();
        return;
    }
    window.location.href = `place.html?id=${id}`;
}

async function toggleFavorite(placeId, btnElement) {
    if (!isLoggedIn()) {
        alert('🔒 Необходимо войти, чтобы сохранять в избранное!');
        openModal();
        return;
    }

    try {
        if (favoritesList.includes(placeId)) {
            await removeFromFavorites(placeId);
            favoritesList = favoritesList.filter(id => id !== placeId);
            if (btnElement) {
                btnElement.textContent = '🤍 В избранное';
                btnElement.classList.remove('in-fav');
            }
        } else {
            await addToFavorites(placeId);
            favoritesList.push(placeId);
            if (btnElement) {
                btnElement.textContent = '❤️ В избранном';
                btnElement.classList.add('in-fav');
            }
        }
        setLocalFavorites(favoritesList);
    } catch (error) {
        alert('❌ Ошибка: ' + error.message);
    }
}

// ===== МАРКЕРЫ =====
function showOnlyPlace(placeId) {
    markerCluster.clearLayers();
    allMarkers = [];

    const place = allPlaces.find(p => p.id === placeId);
    if (place) {
        const lat = place.lat || place.latitude;
        const lng = place.lng || place.longitude;
        const marker = L.marker([lat, lng], { icon: customIcon });
        marker.bindPopup(createPopupContent(place), { maxWidth: 300, className: 'custom-popup' });
        markerCluster.addLayer(marker);
        allMarkers.push({ marker, place });
        map.setView([lat, lng], 16);
        marker.openPopup();
    }
    map.addLayer(markerCluster);
}

function addAllMarkers(places) {
    markerCluster.clearLayers();
    allMarkers = [];

    places.forEach(place => {
        const lat = place.lat || place.latitude;
        const lng = place.lng || place.longitude;
        if (!lat || !lng) return;

        const marker = L.marker([lat, lng], { icon: customIcon });
        marker.bindPopup(createPopupContent(place), { maxWidth: 300, className: 'custom-popup' });
        markerCluster.addLayer(marker);
        allMarkers.push({ marker, place });
    });

    map.addLayer(markerCluster);
}

// ===== БОКОВАЯ ПАНЕЛЬ =====
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const floatMenuBtn = document.getElementById('floatMenuBtn');
const closeSidebar = document.getElementById('closeSidebar');
const menuToggle = document.getElementById('menuToggle');

function openSidebar() {
    sidebar.classList.remove('sidebar-hidden');
    overlay.classList.add('active');
    floatMenuBtn.style.display = 'none';
}

function closeSidebarPanel() {
    sidebar.classList.add('sidebar-hidden');
    overlay.classList.remove('active');
    floatMenuBtn.style.display = 'block';
}

floatMenuBtn.addEventListener('click', openSidebar);
menuToggle.addEventListener('click', openSidebar);
closeSidebar.addEventListener('click', closeSidebarPanel);
overlay.addEventListener('click', closeSidebarPanel);

// ===== РЕНДЕР СПИСКА =====
const placesList = document.getElementById('placesList');
const searchInput = document.getElementById('searchInput');
const placesCount = document.getElementById('placesCount');

function renderPlacesList(places) {
    placesList.innerHTML = '';
    placesCount.textContent = `Найдено мест: ${places.length}`;

    if (places.length === 0) {
        placesList.innerHTML = '<li style="text-align: center; color: #999; padding: 20px;">Ничего не найдено 😔</li>';
        return;
    }

    places.forEach(place => {
        const imageUrl = place.image || place.photo_url || place.main_photo_url ||
            `https://placehold.co/80?text=Нет`;
        const rating = place.rating || place.avg_rating || 0;
        const isPrivate = place.user_id !== undefined && place.user_id !== null;

        const li = document.createElement('li');
        li.className = 'place-card';
        li.innerHTML = `
            <img src="${imageUrl}" alt="${place.name || place.title}" class="place-card-img" 
                 onerror="this.src='https://placehold.co/80?text=Нет'">
            <div class="place-card-info">
                <strong class="place-card-name">${isPrivate ? '🔒 ' : ''}${place.name || place.title}</strong>
                <span class="place-card-rating">★ ${rating}</span>
                <p class="place-card-desc">${place.description || ''}</p>
                <div class="place-card-tags">
                    ${(place.tags || []).map(tag => `<span class="tag">#${tag}</span>`).join(' ')}
                </div>
            </div>
        `;

        li.addEventListener('click', () => {
            showOnlyPlace(place.id);
            closeSidebarPanel();
        });

        placesList.appendChild(li);
    });
}

// ===== ФИЛЬТРЫ (фиксированный список тегов в сайдбаре) =====
const filterTags = document.querySelectorAll('.filter-tag');

filterTags.forEach(btn => {
    btn.addEventListener('click', () => {
        filterTags.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = btn.dataset.tag;
        applyFiltersAndRender();
    });
});

// ===== ПОИСК =====
searchInput.addEventListener('input', () => {
    applyFiltersAndRender();
});

// ===== МОДАЛЬНОЕ ОКНО =====
const authModal = document.getElementById('authModal');
const closeModalBtn = document.getElementById('closeModal');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const modalTabs = document.querySelectorAll('.modal-tab');
const switchLinks = document.querySelectorAll('.switch-link');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

function openModal() {
    authModal.classList.add('active');
}

function closeModal() {
    authModal.classList.remove('active');
}

function switchTab(tabName) {
    modalTabs.forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === tabName) tab.classList.add('active');
    });
    loginForm.classList.remove('active');
    registerForm.classList.remove('active');
    if (tabName === 'login') {
        loginForm.classList.add('active');
    } else {
        registerForm.classList.add('active');
    }
}

loginBtn.addEventListener('click', function (e) {
    if (isLoggedIn()) {
        window.location.href = 'profile.html';
    } else {
        openModal();
    }
});

closeModalBtn.addEventListener('click', closeModal);
authModal.addEventListener('click', (e) => {
    if (e.target === authModal) closeModal();
});

modalTabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});
switchLinks.forEach(link => {
    link.addEventListener('click', () => switchTab(link.dataset.tab));
});

// ===== ОБРАБОТКА ФОРМ =====
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    try {
        const user = await loginUser(email, password);
        updateUIAfterLogin(user);
        alert('✅ Вы успешно вошли!');
        closeModal();
        loginForm.reset();
        await loadData();
    } catch (error) {
        alert('❌ Ошибка входа: ' + error.message);
    }
});

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const passwordConfirm = document.getElementById('regPasswordConfirm').value;

    if (password !== passwordConfirm) {
        alert('❌ Пароли не совпадают!');
        return;
    }

    try {
        const user = await registerUser(name, email, password);
        updateUIAfterLogin(user);
        alert('✅ Регистрация успешна! Добро пожаловать, ' + user.name + '!');
        closeModal();
        registerForm.reset();
        await loadData();
    } catch (error) {
        alert('❌ Ошибка регистрации: ' + error.message);
    }
});

// ===== UI ПОСЛЕ ВХОДА/ВЫХОДА =====
function updateUIAfterLogin(user) {
    loginBtn.textContent = '👤 ' + (user.name || user.email || 'Пользователь');
    loginBtn.style.background = '#27ae60';
    loginBtn.style.borderColor = '#27ae60';
    loginBtn.title = 'Личный кабинет';
    logoutBtn.style.display = 'inline-block';
}

function updateUIAfterLogout() {
    loginBtn.textContent = 'Войти';
    loginBtn.style.background = 'transparent';
    loginBtn.style.borderColor = 'white';
    loginBtn.title = '';
    logoutBtn.style.display = 'none';
    favoritesList = [];
}

logoutBtn.addEventListener('click', async () => {
    if (confirm('Вы уверены, что хотите выйти?')) {
        logoutUser();
        updateUIAfterLogout();
        // Перезапрашиваем места с сервера БЕЗ user_id —
        // приватные места пользователя должны исчезнуть с карты
        await loadData();
        alert('👋 Вы вышли из аккаунта');
    }
});

// ===== ИНИЦИАЛИЗАЦИЯ =====
if (isLoggedIn()) {
    updateUIAfterLogin(currentUser);
}

// ===== ОБРАБОТКА ПАРАМЕТРОВ URL (place И tag) =====
const urlParams = new URLSearchParams(window.location.search);

const tagParam = urlParams.get('tag');
if (tagParam) {
    activeTagFilter = tagParam;
}

const placeParam = parseInt(urlParams.get('place'));

// ===== ЗАПУСК =====
loadData().then(() => {
    if (placeParam && !isNaN(placeParam)) {
        setTimeout(() => {
            showOnlyPlace(placeParam);
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 800);
    }
});

console.log(' Карта готова!');

// ==========================================
// ЛОГИКА ВОССТАНОВЛЕНИЯ ПАРОЛЯ (OTP КОД)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    const authModal = document.getElementById('authModal');
    const resetModal = document.getElementById('resetPasswordModal');
    const forgotLink = document.getElementById('forgotPasswordLink');
    const closeResetBtn = document.getElementById('closeResetModal');

    const stepEmail = document.getElementById('resetStepEmail');
    const stepCode = document.getElementById('resetStepCode');
    const backToEmailBtn = document.getElementById('backToEmailBtn');

    const sendCodeBtn = document.getElementById('sendResetCodeBtn');
    const verifyCodeBtn = document.getElementById('verifyResetCodeBtn');

    const emailInput = document.getElementById('resetEmailInput');
    const codeInput = document.getElementById('resetCodeInput');

    // 1. Открытие окна сброса пароля
    if (forgotLink) {
        forgotLink.addEventListener('click', () => {
            // Закрываем обычное окно авторизации, чтобы они не накладывались
            if (authModal) authModal.style.display = 'none';

            // Сбрасываем шаги на начальный (ввод email)
            stepEmail.style.display = 'block';
            stepCode.style.display = 'none';
            emailInput.value = '';
            codeInput.value = '';

            resetModal.style.display = 'flex';
        });
    }

    if (closeResetBtn) {
        closeResetBtn.addEventListener('click', () => {
            resetModal.style.display = 'none';
        });
    }

    if (resetModal) {
        resetModal.addEventListener('click', (e) => {
            if (e.target === resetModal) {
                resetModal.style.display = 'none';
            }
        });
    }

    if (backToEmailBtn) {
        backToEmailBtn.addEventListener('click', () => {
            stepCode.style.display = 'none';
            stepEmail.style.display = 'block';
            codeInput.value = '';
        });
    }

    if (sendCodeBtn) {
        sendCodeBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const email = emailInput.value.trim();

            if (!email) {
                alert('Пожалуйста, введите Email');
                return;
            }

            sendCodeBtn.disabled = true;
            sendCodeBtn.textContent = 'Отправка...';

            try {
                const result = await requestResetCode(email);

                alert('Код успешно отправлен на вашу почту!');
                stepEmail.style.display = 'none';
                stepCode.style.display = 'block';
            } catch (error) {
                alert(error.message || 'Ошибка при отправке кода. Проверьте правильность Email.');
            } finally {
                sendCodeBtn.disabled = false;
                sendCodeBtn.textContent = 'Получить код';
            }
        });
    }

    if (verifyCodeBtn) {
        verifyCodeBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const email = emailInput.value.trim();
            const code = codeInput.value.trim();

            if (code.length !== 5) {
                alert('Код должен состоять строго из 5 цифр');
                return;
            }

            verifyCodeBtn.disabled = true;
            verifyCodeBtn.textContent = 'Проверка...';

            try {
                const data = await verifyResetCode(email, code);

                const userId = data.id ?? data.user_id;
                if (userId === undefined || userId === null) {
                    throw new Error('Бэкенд не вернул ID пользователя');
                }

                currentUser = {
                    id: parseInt(userId),
                    name: data.username || email,
                    email: data.email || email
                };
                localStorage.setItem('currentUser', JSON.stringify(currentUser));

                updateUIAfterLogin(currentUser);
                resetModal.style.
