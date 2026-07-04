// ===== ПРОВЕРКА АВТОРИЗАЦИИ =====
if (!isLoggedIn()) {
    document.getElementById('favoritesGrid').innerHTML = '';
    document.getElementById('emptyState').innerHTML = `
        <p>🔒</p>
        <h3>Требуется авторизация</h3>
        <p>Войдите или зарегистрируйтесь, чтобы сохранять избранные места</p>
        <a href="index.html" class="browse-btn">← Вернуться на карту и войти</a>
    `;
    document.getElementById('emptyState').style.display = 'block';
    document.getElementById('favoritesCount').textContent = 'Сохранено мест: 0';
} else {
    loadFavorites();
}

// ===== ЗАГРУЗКА ИЗБРАННОГО С СЕРВЕРА =====
async function loadFavorites() {
    const favoritesGrid = document.getElementById('favoritesGrid');
    const emptyState = document.getElementById('emptyState');
    const favoritesCount = document.getElementById('favoritesCount');

    try {
        console.log('🔄 Загружаем избранное с сервера...');
        const favPlaces = await fetchFavorites();
        console.log('✅ Избранное загружено:', favPlaces);

        favoritesCount.textContent = `Сохранено мест: ${favPlaces.length}`;

        if (favPlaces.length === 0) {
            favoritesGrid.innerHTML = '';
            emptyState.innerHTML = `
                <p></p>
                <h3>В избранном пока пусто</h3>
                <p>Добавляйте места, нажимая ❤️ на карте</p>
                <a href="index.html" class="browse-btn">Смотреть места</a>
            `;
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        favoritesGrid.innerHTML = '';

        favPlaces.forEach(place => {
            const imageUrl = place.image || place.photo_url || place.main_photo_url ||
                `https://placehold.co/400x200?text=${encodeURIComponent(place.name || place.title || 'Место')}`;
            const rating = place.rating || place.avg_rating || 0;
            const lat = place.lat || place.latitude;
            const lng = place.lng || place.longitude;
            const tagsArray = Array.isArray(place.tags) ? place.tags : [];

            const card = document.createElement('div');
            card.className = 'favorite-card';
            card.innerHTML = `
                <div class="favorite-card-image">
                    <img src="${imageUrl}" alt="${place.name || place.title}" 
                         onerror="this.src='https://placehold.co/400x200?text=Нет+фото'">
                    <button class="remove-fav-btn" data-id="${place.id}" title="Удалить">✕</button>
                </div>
                <div class="favorite-card-info">
                    <h3>${place.name || place.title || 'Без названия'}</h3>
                    <div class="favorite-card-rating">★ ${rating}</div>
                    <p>${place.description || ''}</p>
                    <div class="favorite-card-tags">
                        ${tagsArray.map(tag => `<span class="tag">#${tag}</span>`).join(' ')}
                    </div>
                    <span class="view-on-map-btn" data-lat="${lat}" data-lng="${lng}" data-id="${place.id}">
                        📍 Показать на карте
                    </span>
                </div>
            `;

            const removeBtn = card.querySelector('.remove-fav-btn');
            removeBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    await removeFromFavorites(place.id);
                    card.style.opacity = '0';
                    card.style.transform = 'scale(0.9)';
                    card.style.transition = 'all 0.3s';
                    setTimeout(() => loadFavorites(), 300);
                } catch (error) {
                    alert('❌ Ошибка: ' + error.message);
                }
            });

            const viewBtn = card.querySelector('.view-on-map-btn');
            viewBtn.addEventListener('click', () => {
                window.location.href = `index.html?place=${place.id}`;
            });

            favoritesGrid.appendChild(card);
        });

    } catch (error) {
        console.error('❌ Ошибка загрузки избранного:', error);
        favoritesGrid.innerHTML = '';
        emptyState.innerHTML = `
            <p>❌</p>
            <h3>Ошибка загрузки</h3>
            <p>${error.message}</p>
            <a href="index.html" class="browse-btn">Вернуться на карту</a>
        `;
        emptyState.style.display = 'block';
    }
}

console.log('✅ Страница избранного готова');