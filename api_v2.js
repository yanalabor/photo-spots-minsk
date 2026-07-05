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
}
