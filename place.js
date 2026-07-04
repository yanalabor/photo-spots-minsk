// ===== ПРОВЕРКА АВТОРИЗАЦИИ =====
if (!isLoggedIn()) {
    document.querySelector('.place-container').innerHTML = `
        <div class="empty-state" style="margin-top: 60px;">
            <p>🔒</p>
            <h3>Требуется авторизация</h3>
            <p>Чтобы просматривать детали и оставлять отзывы, войдите или зарегистрируйтесь</p>
            <a href="index.html" class="browse-btn">← Вернуться на карту и войти</a>
        </div>
    `;
    throw new Error('Требуется авторизация');
}

// ===== ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: безопасно установить textContent =====
function setTextSafe(id, value) {
    const el = document.getElementById(id);
    if (!el) {
        console.warn(`⚠️ Элемент с id="${id}" не найден на странице!`);
        return;
    }
    el.textContent = value;
}

// ===== ПОЛУЧЕНИЕ ID МЕСТА ИЗ URL =====
const urlParams = new URLSearchParams(window.location.search);
const placeId = parseInt(urlParams.get('id'));

if (!placeId || isNaN(placeId)) {
    window.location.href = 'index.html';
}

console.log('🔍 Загрузка места id=' + placeId);

// ===== ЗАГРУЗКА ДАННЫХ =====
let place = null;
let placeReviews = [];

async function loadPlaceData() {
    try {
        place = await fetchPlaceById(placeId);
        console.log('✅ Место загружено, полный объект:', place);

        if (!place || place.error) {
            throw new Error(place?.error || 'Место не найдено на сервере');
        }

        try {
            placeReviews = await fetchReviews(placeId);
            console.log('✅ Отзывы загружены:', placeReviews);
        } catch (e) {
            console.log('⚠️ Отзывы не загрузились:', e.message);
        }

        fillPlaceData();
        renderReviews();
        updateReviewFormVisibility();

    } catch (error) {
        console.error('❌ Ошибка загрузки места:', error);
        document.querySelector('.place-container').innerHTML = `
            <div class="empty-state" style="margin-top: 60px;">
                <p>❌</p>
                <h3>Ошибка загрузки</h3>
                <p>${error.message}</p>
                <a href="index.html" class="browse-btn">← Вернуться на карту</a>
            </div>
        `;
    }
}

// ===== ЗАПОЛНЕНИЕ ДАННЫХ =====
function fillPlaceData() {
    console.log(' Заполняем страницу данными места:', place);

    const imageUrl = place.image || place.photo_url || place.main_photo_url ||
        `https://placehold.co/800x400?text=${encodeURIComponent(place.name || place.title || 'Место')}`;
    const rating = place.rating || place.avg_rating || 0;
    const lat = place.lat || place.latitude || 53.9;
    const lng = place.lng || place.longitude || 27.56;
    const images = place.images || [imageUrl];

    setTextSafe('placeName', place.name || place.title || 'Без названия');

    const mainImg = document.getElementById('placeMainImage');
    if (mainImg) {
        mainImg.src = imageUrl;
        mainImg.alt = place.name || place.title || '';
        mainImg.onerror = function () {
            this.src = 'https://placehold.co/800x400?text=Нет+фото';
        };
    }

    const thumbnailsDiv = document.getElementById('placeThumbnails');
    if (thumbnailsDiv) {
        thumbnailsDiv.innerHTML = '';
        images.forEach((img, index) => {
            const thumb = document.createElement('img');
            thumb.src = img;
            thumb.alt = `${place.name || place.title} фото ${index + 1}`;
            thumb.className = 'thumbnail';
            if (index === 0) thumb.classList.add('active');
            thumb.onerror = function () {
                this.src = 'https://placehold.co/70?text=Нет';
            };
            thumb.addEventListener('click', () => {
                mainImg.src = img;
                document.querySelectorAll('.thumbnail').forEach(t => t.classList.remove('active'));
                thumb.classList.add('active');
            });
            thumbnailsDiv.appendChild(thumb);
        });
    }

    setTextSafe('placeDescription', place.description || 'Описание отсутствует');
    setTextSafe('placeRating', Number(rating).toFixed(1));
    setTextSafe('reviewsCount', `(${placeReviews.length} отзывов)`);

    const starsDisplay = document.getElementById('starsDisplay');
    if (starsDisplay) {
        const stars = starsDisplay.querySelectorAll('.star');
        const fullStars = Math.floor(rating);
        stars.forEach((star, i) => {
            star.classList.remove('filled', 'half');
            if (i < fullStars) {
                star.classList.add('filled');
            } else if (i === fullStars && (rating - fullStars) >= 0.5) {
                star.classList.add('half');
            }
        });
    }

    // Хэштеги — кликабельны, ведут на карту с примененным фильтром по тегу
    const placeTagsDiv = document.getElementById('placeTags');
    if (placeTagsDiv) {
        placeTagsDiv.innerHTML = '';
        (place.tags || []).forEach(tag => {
            const link = document.createElement('a');
            link.className = 'tag';
            link.href = `index.html?tag=${encodeURIComponent(tag)}`;
            link.textContent = '#' + tag;
            link.style.cursor = 'pointer';
            link.style.textDecoration = 'none';
            placeTagsDiv.appendChild(link);
        });
    }

    setTextSafe('placeCoords', place.address || `${lat}, ${lng}`);

    const miniMapEl = document.getElementById('miniMap');
    if (miniMapEl) {
        const miniMap = L.map('miniMap').setView([lat, lng], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(miniMap);
        L.marker([lat, lng]).addTo(miniMap).bindPopup(`<b>${place.name || place.title}</b>`).openPopup();
    }

    updateFavButton();
}

// ===== ЕСЛИ ПОЛЬЗОВАТЕЛЬ УЖЕ ОСТАВЛЯЛ ОТЗЫВ — СКРЫВАЕМ ФОРМУ =====
function updateReviewFormVisibility() {
    const reviewFormBox = document.querySelector('.review-form-box');
    if (!reviewFormBox) return;

    const myUserId = getUserId();
    const alreadyReviewed = placeReviews.some(r => r.user_id === myUserId);

    if (alreadyReviewed) {
        reviewFormBox.innerHTML = `
            <p style="text-align:center; color:#666; padding: 12px;">
                Вы уже оставили отзыв к этому месту. Изменить или удалить его можно в личном кабинете.
            </p>
        `;
    }
}

// ===== ОТЗЫВЫ =====
function renderReviews() {
    const reviewsList = document.getElementById('reviewsList');
    const noReviews = document.getElementById('noReviews');
    if (!reviewsList || !noReviews) return;

    if (!placeReviews || placeReviews.length === 0) {
        reviewsList.innerHTML = '';
        noReviews.style.display = 'block';
        return;
    }

    noReviews.style.display = 'none';
    reviewsList.innerHTML = '';

    placeReviews.forEach(review => {
        const reviewCard = document.createElement('div');
        reviewCard.className = 'review-card';
        const reviewStars = '★'.repeat(review.rating || 0) + '☆'.repeat(5 - (review.rating || 0));
        const authorName = review.author || review.username || 'Пользователь';
        const photoHtml = review.image
            ? `<img src="${review.image}" alt="Фото к отзыву" style="max-width:150px; border-radius:8px; margin-top:8px;">`
            : '';

        reviewCard.innerHTML = `
            <div class="review-header">
                <div class="review-author">👤 ${authorName}</div>
                <div class="review-date">${review.date || review.created_at || '—'}</div>
            </div>
            <div class="review-rating">${reviewStars}</div>
            <p class="review-text">${review.text || review.comment || ''}</p>
            ${photoHtml}
        `;
        reviewsList.appendChild(reviewCard);
    });
}

// ===== КНОПКА ИЗБРАННОГО =====
const addToFavBtn = document.getElementById('addToFavBtn');

async function updateFavButton() {
    if (!addToFavBtn) return;
    try {
        const favs = await fetchFavorites();
        const isFav = favs.some(f => (f.place_id || f.id) === placeId);

        if (isFav) {
            addToFavBtn.textContent = ' В избранном';
            addToFavBtn.classList.add('in-favorites');
        } else {
            addToFavBtn.textContent = '🤍 В избранное';
            addToFavBtn.classList.remove('in-favorites');
        }
    } catch (e) {
        const localFavs = JSON.parse(localStorage.getItem('favorites') || '[]');
        if (localFavs.includes(placeId)) {
            addToFavBtn.textContent = ' В избранном';
            addToFavBtn.classList.add('in-favorites');
        }
    }
}

if (addToFavBtn) {
    addToFavBtn.addEventListener('click', async () => {
        try {
            const favs = await fetchFavorites();
            const isFav = favs.some(f => (f.place_id || f.id) === placeId);

            if (isFav) {
                await removeFromFavorites(placeId);
            } else {
                await addToFavorites(placeId);
            }

            updateFavButton();
        } catch (error) {
            alert('❌ Ошибка: ' + error.message);
        }
    });
}

// ===== ЗВЕЗДНЫЙ РЕЙТИНГ =====
const starRatingInput = document.getElementById('starRatingInput');
if (starRatingInput) {
    const ratingStars = starRatingInput.querySelectorAll('span');
    const ratingInput = document.getElementById('reviewRating');

    ratingStars.forEach(star => {
        star.addEventListener('click', () => {
            const value = parseInt(star.dataset.value);
            ratingInput.value = value;
            ratingStars.forEach(s => {
                if (parseInt(s.dataset.value) <= value) {
                    s.textContent = '★';
                    s.classList.add('selected');
                } else {
                    s.textContent = '☆';
                    s.classList.remove('selected');
                }
            });
        });

        star.addEventListener('mouseenter', () => {
            const value = parseInt(star.dataset.value);
            ratingStars.forEach(s => {
                if (parseInt(s.dataset.value) <= value) {
                    s.textContent = '★';
                }
            });
        });

        star.addEventListener('mouseleave', () => {
            const currentValue = parseInt(ratingInput.value);
            ratingStars.forEach(s => {
                if (parseInt(s.dataset.value) <= currentValue) {
                    s.textContent = '★';
                } else {
                    s.textContent = '☆';
                }
            });
        });
    });
}

// ===== ФОТО К ОТЗЫВУ: кнопка + ==========
const reviewPhotoBtn = document.getElementById('reviewPhotoBtn');
const reviewPhotoInput = document.getElementById('reviewPhotoInput');
const reviewPhotoLabel = document.getElementById('reviewPhotoLabel');
const reviewPhotoPreview = document.getElementById('reviewPhotoPreview');
let selectedReviewPhoto = null;

if (reviewPhotoBtn && reviewPhotoInput) {
    reviewPhotoBtn.addEventListener('click', () => reviewPhotoInput.click());

    reviewPhotoInput.addEventListener('change', () => {
        const file = reviewPhotoInput.files[0];
        if (!file) return;
        selectedReviewPhoto = file;
        reviewPhotoLabel.textContent = file.name;
        const reader = new FileReader();
        reader.onload = (e) => {
            reviewPhotoPreview.src = e.target.result;
            reviewPhotoPreview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    });
}

// ===== ОТПРАВКА ОТЗЫВА =====
const reviewForm = document.getElementById('reviewForm');
if (reviewForm) {
    reviewForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const ratingInput = document.getElementById('reviewRating');
        const rating = parseInt(ratingInput.value);
        const text = document.getElementById('reviewText').value.trim();

        if (rating === 0) {
            alert('Пожалуйста, поставьте оценку!');
            return;
        }

        if (!text) {
            alert('Пожалуйста, напишите отзыв!');
            return;
        }

        try {
            await addReview(placeId, rating, text, selectedReviewPhoto);

            placeReviews = await fetchReviews(placeId);
            renderReviews();

            const newAvg = placeReviews.length > 0
                ? (placeReviews.reduce((sum, r) => sum + (r.rating || 0), 0) / placeReviews.length).toFixed(1)
                : place.rating;

            setTextSafe('placeRating', newAvg);
            setTextSafe('reviewsCount', `(${placeReviews.length} отзывов)`);

            const starsDisplay = document.getElementById('starsDisplay');
            if (starsDisplay) {
                const stars = starsDisplay.querySelectorAll('.star');
                stars.forEach((star, i) => {
                    star.classList.remove('filled', 'half');
                    if (i < Math.floor(newAvg)) {
                        star.classList.add('filled');
                    } else if (i === Math.floor(newAvg) && (newAvg - Math.floor(newAvg)) >= 0.5) {
                        star.classList.add('half');
                    }
                });
            }

            reviewForm.reset();
            ratingInput.value = 0;
            selectedReviewPhoto = null;
            if (reviewPhotoPreview) reviewPhotoPreview.style.display = 'none';
            if (reviewPhotoLabel) reviewPhotoLabel.textContent = 'Добавить фото';
            const ratingStars = document.querySelectorAll('#starRatingInput span');
            ratingStars.forEach(s => {
                s.textContent = '☆';
                s.classList.remove('selected');
            });

            alert('Спасибо за отзыв!');
            updateReviewFormVisibility();

        } catch (error) {
            alert(' Ошибка: ' + error.message);
        }
    });
}

// ===== КНОПКА ВХОДА =====
const loginBtn = document.getElementById('loginBtn');
if (loginBtn && currentUser) {
    loginBtn.textContent = '👤 ' + (currentUser.name || currentUser.email || 'Пользователь');
    loginBtn.style.background = '#27ae60';
    loginBtn.style.borderColor = '#27ae60';
}

// ===== ЗАПУСК =====
loadPlaceData();
console.log(' Страница места готова');