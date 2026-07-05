// ===== ПРОВЕРКА АВТОРИЗАЦИИ =====
if (!isLoggedIn()) {
    alert(' Для доступа к личному кабинету необходимо войти!');
    window.location.href = 'index.html';
}

const user = currentUser;
console.log(' Пользователь:', user);

// Принудительно берем ID из currentUser, если во внешнюю переменную user записался старый объект
const currentUserId = user.id || (JSON.parse(localStorage.getItem('currentUser')) || {}).id;

// ===== ЗАПОЛНЕНИЕ ПРОФИЛЯ =====
const profileNameEl = document.getElementById('profileName');
const profileEmailEl = document.getElementById('profileEmail');
const profileDateEl = document.getElementById('profileDate');

console.log("=== ОТЛАДКА ОБЪЕКТА USER ===", user);

if (profileNameEl) {
    // Выводим имя (капитализируем первую букву для красоты, если пришло "крис")
    const rawName = user.username || user.name || 'Пользователь';
    profileNameEl.textContent = rawName.charAt(0).toUpperCase() + rawName.slice(1);
}

if (profileEmailEl) {
    const rawEmail = user.email ? user.email.trim() : '';
    const rawName = (user.username || user.name || '').trim();

    // Проверка: если почты нет, или в ней нет знака @, или она полностью совпадает с именем
    if (!rawEmail || !rawEmail.includes('@') || rawEmail.toLowerCase() === rawName.toLowerCase()) {
        // Принудительно генерируем почту из имени, чтобы не было дубля!
        const cleanName = rawName.toLowerCase().replace(/\s+/g, '');
        profileEmailEl.textContent = `${cleanName}@mail.ru`;
    } else {
        profileEmailEl.textContent = rawEmail;
    }
}

if (profileDateEl) {
    profileDateEl.textContent = user.created_at || new Date().toISOString().split('T')[0];
}
// ===== ЗАГРУЗКА ДАННЫХ ПРОФИЛЯ =====
async function loadProfileData() {
    try {
        // 1. Избранное
        const favs = await fetchFavorites();
        const statFavsEl = document.getElementById('statFavorites');
        if (statFavsEl) statFavsEl.textContent = favs.length;
        renderFavoritesTab(favs);

        // 2. Отзывы
        let myReviews = [];
        if (currentUserId) {
            myReviews = await fetchUserReviews(currentUserId);
        }
        const statReviewsEl = document.getElementById('statReviews');
        if (statReviewsEl) statReviewsEl.textContent = myReviews.length;
        renderReviewsTab(myReviews);

        // 3. Мои созданные места
        const allMyPlaces = await fetchAllPlaces();
        console.log("ID текущего юзера:", currentUserId);

        const myPlaces = allMyPlaces.filter(p => p.user_id !== null && p.user_id !== undefined && Number(p.user_id) === Number(currentUserId));

        const statAddedEl = document.getElementById('statAdded') || document.getElementById('statPlaces');
        if (statAddedEl) statAddedEl.textContent = myPlaces.length;

        const grid = document.getElementById('profileMyPlacesGrid') || document.getElementById('profilePlacesGrid');
        if (!grid) {
            console.error(" КРИТИЧЕСКАЯ ОШИБКА: На странице HTML нет контейнера с ID 'profileMyPlacesGrid'!");
        }

        renderMyPlacesTab(myPlaces);

    } catch (error) {
        console.error(' Ошибка загрузки профиля:', error);
    }
}

// ===== ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК =====
const profileTabs = document.querySelectorAll('.profile-tab');
const tabContents = document.querySelectorAll('.tab-content');

profileTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        profileTabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        tab.classList.add('active');

        const targetContent = document.getElementById(tab.dataset.tab);
        if (targetContent) targetContent.classList.add('active');

        if (tab.dataset.tab === 'tab-add' && typeof addPlaceMap !== 'undefined') {
            setTimeout(() => {
                addPlaceMap.invalidateSize();
                addPlaceMap.setView([53.9000, 27.5667], 12);
            }, 250);
        }
    });
});

// ===== РЕНДЕР: ИЗБРАННОЕ =====
function renderFavoritesTab(favs) {
    const grid = document.getElementById('profileFavoritesGrid');
    const empty = document.getElementById('emptyFavorites');

    if (!grid) return;
    grid.innerHTML = '';

    if (!favs || favs.length === 0) {
        if (empty) empty.style.display = 'block';
        return;
    }

    if (empty) empty.style.display = 'none';

    favs.forEach(place => {
        const displayTitle = place.title || place.name || 'Без названия';
        const imageUrl = place.image || place.photo_url || `https://placehold.co/400x200?text=${encodeURIComponent(displayTitle)}`;
        const rating = place.rating || place.avg_rating || 0;
        const tagsArray = Array.isArray(place.tags) ? place.tags : [];

        const card = document.createElement('div');
        card.className = 'favorite-card';
        card.innerHTML = `
            <div class="favorite-card-image">
                <img src="${imageUrl}" alt="${displayTitle}" onerror="this.src='https://placehold.co/400x200?text=Нет+фото'">
            </div>
            <div class="favorite-card-info">
                <h3>${displayTitle}</h3>
                <div class="favorite-card-rating">★ ${rating}</div>
                <p>${place.description || ''}</p>
                <div class="favorite-card-tags">
                    ${tagsArray.map(tag => `<span class="tag">#${tag}</span>`).join(' ')}
                </div>
                <a href="place.html?id=${place.id}" class="view-on-map-btn">📍 Подробнее</a>
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderReviewsTab(reviews) {
    const list = document.getElementById('profileReviewsList');
    const empty = document.getElementById('emptyReviews');

    if (!list) return;
    list.innerHTML = '';

    if (!reviews || reviews.length === 0) {
        if (empty) empty.style.display = 'block';
        return;
    }

    if (empty) empty.style.display = 'none';

    reviews.forEach(review => {
        const item = document.createElement('div');
        item.className = 'review-profile-item';
        item.setAttribute('data-id', review.id);
        item.style.cssText = 'background: #fff; padding: 15px; border-radius: 8px; margin-bottom: 15px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); border-left: 4px solid #3498db;';

        const ratingValue = review.rating || review.stars || review.score || 0;
        const starsHtml = '⭐'.repeat(ratingValue) + '☆'.repeat(5 - ratingValue);

        // ЖЕЛЕЗНО берём путь к фото из базы данных
        let reviewImageUrl = review.image || review.photo_url|| null;

        // Если вдруг пришёл только относительный путь (без готового image) — достраиваем
        // через API_BASE (реальный адрес бэкенда), а не захардкоженный localhost
        if (reviewImageUrl && !reviewImageUrl.startsWith('http')) {
        reviewImageUrl = `${API_BASE}${reviewImageUrl.startsWith('/') ? '' : '/'}${reviewImageUrl}`;
        }

        item.innerHTML = `
            <div class="review-main-content">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <h4 style="margin: 0; font-size: 16px; color: #2c3e50;">${review.place_title || review.place_name || 'Отзыв к месту'}</h4>
                    <div class="review-stars" style="color: #f1c40f; font-size: 14px; font-weight: bold;">
                        ${starsHtml} <span style="color: #333; margin-left: 5px;">(${ratingValue})</span>
                    </div>
                </div>
                <p class="review-text-display" style="margin: 0 0 10px 0; color: #555; line-height: 1.4;">${review.text || review.comment || 'Текст отзыва отсутствует'}</p>
                
                ${reviewImageUrl ? `
                    <div class="review-image-container" style="margin-bottom: 12px; margin-top: 5px;">
                      <img src="${reviewImageUrl}" alt="Фото к отзыву" style="max-width: 100%; max-height: 250px; border-radius: 6px; object-fit: cover; display: block; box-shadow: 0 1px 3px rgba(0,0,0,0.1);" onerror="console.log('🚨 Ошибка загрузки картинки. Исходный src:', this.getAttribute('src')); if(!this.X){this.X=true; const s=this.getAttribute('src'); this.src=window.API_BASE+(s.startsWith('/')?'':'/')+s; console.log('🔄 Пробуем загрузить с бэкенда:', this.src);}else{console.log('❌ Не удалось загрузить ниоткуда, скрываем.'); this.style.display='none';}"">
                    </div>
                ` : ''}

                <div style="margin-top: 5px;">
                    <small style="color: #999; font-size: 12px;">Отправлено: ${review.created_at ? review.created_at.split('T')[0] : 'Неизвестно'}</small>
                </div>
                
                <div class="review-actions" style="display: flex; gap: 10px; margin-top: 12px;">
                    <button class="edit-review-btn" style="border: 1px solid #ccc; padding: 5px 12px; border-radius: 4px; cursor: pointer; background: #fff; color: #333; font-size: 13px;">✏️ Редактировать</button>
                    <button class="delete-review-btn" style="border: 1px solid #ccc; padding: 5px 12px; border-radius: 4px; cursor: pointer; background: #fff; color: #e74c3c; font-size: 13px;">🗑️ Удалить</button>
                </div>
            </div>
        `;

        // --- ЛОГИКА: РЕДАКТИРОВАНИЕ ОТЗЫВА ---
        item.querySelector('.edit-review-btn').addEventListener('click', () => {
            if (item.querySelector('.edit-review-form-inline')) return; // защита от дублирования формы

            const mainContent = item.querySelector('.review-main-content');
            mainContent.style.display = 'none';

            const formDiv = document.createElement('div');
            formDiv.className = 'edit-review-form-inline';
            formDiv.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

            formDiv.innerHTML = `
                <label style="font-size: 13px; font-weight: bold; color: #555;">Новая оценка (1-5):</label>
                <input type="number" class="edit-review-rating" value="${ratingValue}" min="1" max="5" style="padding: 6px; border: 1px solid #ccc; border-radius: 4px; width: 70px;">
                
                <label style="font-size: 13px; font-weight: bold; color: #555;">Текст отзыва:</label>
                <textarea class="edit-review-text" style="padding: 6px; border: 1px solid #ccc; border-radius: 4px; resize: vertical; min-height: 60px;">${review.text || review.comment || ''}</textarea>
                
                <label style="font-size: 13px; font-weight: bold; color: #555; margin-top: 5px;">Фото места:</label>
                <div style="display: flex; flex-direction: column; gap: 5px;">
                    <input type="file" class="edit-review-photo" accept="image/*" style="font-size: 13px;">
                    ${reviewImageUrl ? `
                        <button type="button" class="delete-review-photo-btn" style="align-self: flex-start; background: #e74c3c; color: white; border: none; padding: 3px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;">❌ Удалить текущее фото</button>
                    ` : ''}
                </div>
                
                <div style="display: flex; gap: 10px; margin-top: 10px;">
                    <button class="save-review-btn" style="background: #2ecc71; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px;">Сохранить</button>
                    <button class="cancel-review-btn" style="background: #95a5a6; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px;">Отмена</button>
                </div>
            `;

            item.appendChild(formDiv);

            let shouldDeletePhoto = false;
            let fileToUpload = null;

            const photoInput = formDiv.querySelector('.edit-review-photo');
            photoInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    fileToUpload = e.target.files[0];
                    shouldDeletePhoto = false;
                    console.log('📎 Файл успешно выбран:', fileToUpload.name);
                }
            });

            const delPhotoBtn = formDiv.querySelector('.delete-review-photo-btn');
            if (delPhotoBtn) {
                delPhotoBtn.addEventListener('click', () => {
                    shouldDeletePhoto = true;
                    fileToUpload = null;
                    delPhotoBtn.textContent = '⏳ Фото будет удалено при сохранении';
                    delPhotoBtn.style.background = '#7f8c8d';
                    delPhotoBtn.disabled = true;
                    photoInput.disabled = true;
                });
            }

            formDiv.querySelector('.cancel-review-btn').addEventListener('click', () => {
                formDiv.remove();
                mainContent.style.display = 'block';
            });

            formDiv.querySelector('.save-review-btn').addEventListener('click', async () => {
                const newRating = parseInt(formDiv.querySelector('.edit-review-rating').value);
                const newText = formDiv.querySelector('.edit-review-text').value.trim();

                if (isNaN(newRating) || newRating < 1 || newRating > 5) {
                    alert('Оценка должна быть числом от 1 до 5!');
                    return;
                }
                if (!newText) {
                    alert('Текст не может быть пустым!');
                    return;
                }

                try {
                    const formData = new FormData();
                    formData.append('user_id', parseInt(currentUserId));
                    formData.append('rating', newRating);
                    formData.append('text', newText);
                    formData.append('delete_photo', shouldDeletePhoto ? 'true' : 'false');

                    if (fileToUpload) {
                        formData.append('file', fileToUpload);
                    }

                    const res = await apiRequest(`/api/reviews/${review.id}`, {
                        method: 'PUT',
                        body: formData
                    });

                    if (res.status === 'success' || res.message || !res.error) {
                        alert('✨ Отзыв успешно обновлен!');
                        window.location.reload();
                    } else {
                        alert('Ошибка: ' + (res.error || 'Неизвестная ошибка'));
                    }
                } catch (error) {
                    alert('Ошибка изменения отзыва: ' + error.message);
                }
            });
        });

        // --- ЛОГИКА: УДАЛЕНИЕ ОТЗЫВА ---
        item.querySelector('.delete-review-btn').addEventListener('click', async () => {
            if (!confirm('Вы уверены, что хотите удалить этот отзыв?')) return;
            try {
                const res = await apiRequest(`/api/reviews/${review.id}`, {
                    method: 'DELETE',
                    body: JSON.stringify({ user_id: parseInt(currentUserId) })
                });
                if (res.status === 'success' || !res.error) {
                    alert('🗑️ Отзыв успешно удален!');
                    window.location.reload();
                } else {
                    alert('Ошибка удаления: ' + (res.error || 'Неизвестная ошибка'));
                }
            } catch (error) {
                alert('Ошибка при удалении отзыва: ' + error.message);
            }
        });

        list.appendChild(item);
    });
}

// ===== РЕНДЕР: МОИ СОЗДАННЫЕ МЕСТА =====
function renderMyPlacesTab(places) {
    const grid = document.getElementById('profileMyPlacesGrid');
    const empty = document.getElementById('emptyMyPlaces');

    if (!grid) return;
    grid.innerHTML = '';

    if (!places || places.length === 0) {
        if (empty) empty.style.display = 'block';
        return;
    }

    if (empty) empty.style.display = 'none';

    places.forEach(place => {
        const card = document.createElement('div');
        card.className = 'favorite-card';
        card.setAttribute('data-id', place.id);

        const avgRating = Number(place.avg_rating || 0);
        const count = Number(place.reviews_count || 0);

        const starsHtml = count > 0
            ? '⭐'.repeat(Math.round(avgRating)) + '☆'.repeat(5 - Math.round(avgRating))
            : '☆'.repeat(5);

        card.innerHTML = `
            <img src="${place.image || '/static/images/default.jpg'}" alt="${place.title}" onerror="this.src='https://placehold.co/600x400?text=Нет+фото'">
            <div class="favorite-card-content" style="padding: 15px;">
                <h3>${place.title}</h3>
                <p>${place.description || 'Нет описания'}</p>

                <div class="tags" style="margin-top: 10px;">
                    ${place.tags ? place.tags.map(t => `<span class="tag" style="background:#eee; padding:2px 6px; border-radius:4px; margin-right:5px; font-size:12px;">#${t}</span>`).join('') : ''}
                </div>
                
                <div class="place-actions" style="display: flex; gap: 10px; margin-top: 15px;">
                        <button class="edit-place-btn" style="flex: 1; border: 1px solid #ccc; padding: 8px; border-radius: 4px; cursor: pointer; background: #fff; color: #333;"> Редактировать</button>
                        <button class="delete-place-btn" style="flex: 1; border: 1px solid #ccc; padding: 8px; border-radius: 4px; cursor: pointer; background: #fff; color: #333;"> Удалить</button>
                </div>
            </div>
        `;

        // --- УДАЛЕНИЕ МЕСТА ---
        card.querySelector('.delete-place-btn').addEventListener('click', async () => {
            if (!confirm(`Вы уверены, что хотите удалить место "${place.title}"?`)) return;

            try {
                const res = await apiRequest(`/api/places/${place.id}?user_id=${currentUserId}`, {
                    method: 'DELETE'
                });

                if (res.success || res.message) {
                    alert('🗑️ Место успешно удалено!');
                    card.remove();
                    const statAddedEl = document.getElementById('statAdded') || document.getElementById('statPlaces');
                    if (statAddedEl) {
                        statAddedEl.textContent = parseInt(statAddedEl.textContent) - 1;
                    }
                } else if (res.error) {
                    alert(' Ошибка: ' + res.error);
                }
            } catch (error) {
                alert('Не удалось удалить место: ' + error.message);
            }
        });

        // --- РЕДАКТИРОВАНИЕ МЕСТА ---
        card.querySelector('.edit-place-btn').addEventListener('click', () => {
            const actionsDiv = card.querySelector('.place-actions');
            actionsDiv.style.display = 'none';

            const formDiv = document.createElement('div');
            formDiv.className = 'edit-place-form-inline';
            formDiv.style.cssText = 'margin-top: 15px; display: flex; flex-direction: column; gap: 8px;';

            formDiv.innerHTML = `
                <label style="font-size: 13px; font-weight: bold; color: #555;">Название:</label>
                <input type="text" class="edit-place-title" value="${place.title}" style="padding: 6px; border: 1px solid #ccc; border-radius: 4px;">
                
                <label style="font-size: 13px; font-weight: bold; color: #555;">Описание:</label>
                <textarea class="edit-place-desc" style="padding: 6px; border: 1px solid #ccc; border-radius: 4px; resize: vertical;">${place.description || ''}</textarea>
                
                <label style="font-size: 13px; font-weight: bold; color: #555;">Теги (через запятую):</label>
                <input type="text" class="edit-place-tags" value="${place.tags ? place.tags.join(', ') : ''}" style="padding: 6px; border: 1px solid #ccc; border-radius: 4px;">
                
                <label style="font-size: 13px; font-weight: bold; color: #555; margin-top: 5px;">Изменить фото:</label>
                <input type="file" class="edit-place-photo" accept="image/*" style="font-size: 13px;">
                
                <div style="display: flex; gap: 10px; margin-top: 10px;">
                    <button class="save-place-btn" style="flex: 1; background: #2ecc71; color: white; border: none; padding: 6px; border-radius: 4px; cursor: pointer;">Сохранить</button>
                    <button class="cancel-place-btn" style="flex: 1; background: #95a5a6; color: white; border: none; padding: 6px; border-radius: 4px; cursor: pointer;">Отмена</button>
                </div>
            `;

            card.querySelector('.favorite-card-content').appendChild(formDiv);

            formDiv.querySelector('.cancel-place-btn').addEventListener('click', () => {
                formDiv.remove();
                actionsDiv.style.display = 'flex';
            });

            formDiv.querySelector('.save-place-btn').addEventListener('click', async () => {
                const newTitle = formDiv.querySelector('.edit-place-title').value.trim();
                const newDesc = formDiv.querySelector('.edit-place-desc').value.trim();
                const newTags = formDiv.querySelector('.edit-place-tags').value.trim();
                const photoInput = formDiv.querySelector('.edit-place-photo');

                if (!newTitle) {
                    alert('Название места не может быть пустым!');
                    return;
                }

                try {
                    const res = await apiRequest(`/api/places/${place.id}?user_id=${currentUserId}`, {
                        method: 'PUT',
                        body: JSON.stringify({
                            title: newTitle,
                            description: newDesc,
                            tags: newTags
                        })
                    });

                    if (res.success || res.message) {
                        if (photoInput.files && photoInput.files[0]) {
                            const uploadRes = await uploadPhoto(place.id, photoInput.files[0]);
                            if (uploadRes.error) {
                                alert(' Данные обновлены, но фото загрузить не удалось: ' + uploadRes.error);
                            }
                        }

                        alert(' Данные места и фото успешно обновлены!');
                        loadProfileData();
                    } else if (res.error) {
                        alert(' Ошибка: ' + res.error);
                    }
                } catch (error) {
                    alert(' Ошибка изменения: ' + error.message);
                }
            });
        });

        grid.appendChild(card);
    });
}

// ===== ВКЛАДКА: ДОБАВИТЬ МЕСТО (Карта Leaflet) =====
let selectedLat = null;
let selectedLng = null;
let selectedMarker = null;

const addPlaceMap = L.map('addPlaceMap').setView([53.9000, 27.5667], 11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
}).addTo(addPlaceMap);

addPlaceMap.on('click', function (e) {
    selectedLat = e.latlng.lat.toFixed(6);
    selectedLng = e.latlng.lng.toFixed(6);

    document.getElementById('addPlaceLat').value = selectedLat;
    document.getElementById('addPlaceLng').value = selectedLng;
    document.getElementById('addPlaceCoordsDisplay').value = `${selectedLat}, ${selectedLng}`;

    if (selectedMarker) addPlaceMap.removeLayer(selectedMarker);
    selectedMarker = L.marker([selectedLat, selectedLng]).addTo(addPlaceMap);
    selectedMarker.bindPopup('Выбранная точка').openPopup();
});

document.getElementById('addPlaceForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    if (!selectedLat || !selectedLng) {
        alert('Пожалуйста, выберите точку на карте!');
        return;
    }

    const name = document.getElementById('addPlaceName').value.trim();
    const description = document.getElementById('addPlaceDesc').value.trim();
    const tagsStr = document.getElementById('addPlaceTags').value.trim();
    const photoInput = document.getElementById('addPlacePhoto');
    const photoFile = photoInput.files[0] || null;

    try {
        await createPlace({
            title: name,
            description: description,
            latitude: parseFloat(selectedLat),
            longitude: parseFloat(selectedLng),
            tags: tagsStr,
            file: photoFile,
        });

        loadProfileData();
        document.getElementById('addPlaceForm').style.display = 'none';
        document.getElementById('addSuccess').style.display = 'block';

    } catch (err) {
        console.error(' Не удалось сохранить место:', err);
        alert('Не удалось сохранить место на сервере: ' + err.message);
    }
});

// ===== ВЫХОД ИЗ СИСТЕМЫ =====
document.getElementById('logoutBtn').addEventListener('click', () => {
    if (confirm('Вы уверены, что хотите выйти?')) {
        logoutUser();
        window.location.href = 'index.html';
    }
});

// ===== СТАРТ И ЛОГИКА АВАТАРА ПРИ ЗАГРУЗКЕ СТРАНИЦЫ =====
document.addEventListener('DOMContentLoaded', () => {
    // 1. Инициализация данных профиля после полной загрузки DOM
    loadProfileData();
    console.log(' Модуль профиля успешно запущен');

    // 2. Логика интерактивного аватара
    const avatarBlock = document.getElementById('currentAvatar');
    const changeBtn = document.getElementById('changeAvatarBtn');
    const picker = document.getElementById('avatarPicker');
    const customInput = document.getElementById('customAvatarInput');

    if (!avatarBlock || !changeBtn || !picker) return;

    // Подгружаем сохраненный аватар пользователя при старте
    const savedAvatar = localStorage.getItem(`avatar_${currentUserId}`);
    if (savedAvatar) {
        if (savedAvatar.startsWith('data:image') || savedAvatar.startsWith('http') || savedAvatar.startsWith('/')) {
            avatarBlock.innerHTML = `<img src="${savedAvatar}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        } else {
            avatarBlock.textContent = savedAvatar;
        }
    }

    const togglePicker = (e) => {
        e.stopPropagation();
        picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
    };

    changeBtn.addEventListener('click', togglePicker);
    avatarBlock.addEventListener('click', togglePicker);

    document.addEventListener('click', () => {
        picker.style.display = 'none';
    });
    picker.addEventListener('click', (e) => e.stopPropagation());

    document.querySelectorAll('.avatar-item').forEach(item => {
        item.addEventListener('click', () => {
            const emoji = item.textContent;
            avatarBlock.innerHTML = emoji;
            localStorage.setItem(`avatar_${currentUserId}`, emoji);
            picker.style.display = 'none';
        });
    });

    if (customInput) {
        customInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function (event) {
                const base64Image = event.target.result;
                avatarBlock.innerHTML = `<img src="${base64Image}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
                localStorage.setItem(`avatar_${currentUserId}`, base64Image);
                picker.style.display = 'none';
            };
            reader.readAsDataURL(file);
        });
    }
});
