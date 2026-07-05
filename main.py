import os
import shutil
import random
import requests
from pathlib import Path
from typing import Optional
import bcrypt
import pymysql
from fastapi import FastAPI, File, UploadFile, Request, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv
import re

# 1. Загружаем переменные окружения
load_dotenv()

app = FastAPI(title="Minsk Places API")

# --- НАСТРОЙКА CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- НАСТРОЙКА СТАТИКИ ---
BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

# Автоматически создаем папки для статики, если их нет
(STATIC_DIR / "images").mkdir(parents=True, exist_ok=True)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# --- НАСТРОЙКА БАЗЫ ДАННЫХ ---
DB_CONFIG = {
    "host": os.getenv("DB_HOST"),
    "port": int(os.getenv("DB_PORT", 3306)),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "database": os.getenv("DB_NAME"),
    "cursorclass": pymysql.cursors.DictCursor,
    "charset": "utf8mb4",
    "use_unicode": True,
}

# ==========================================
# ХЕЛПЕРЫ И ЦЕНЗОР ТЕКСТА
# ==========================================
import re

BAD_WORDS = [
    "бля",
    "хуй",
    "хуе",
    "еб",
    "пизд",
    "сук",
    "пидор",
    "мудак",
    "гондон",
    "залуп",
    "шлюх",
    "дроч",
    "мраз",
    "твар"
]

def censor_text(text: str) -> str:
    if not text:
        return text

    # Проверяем текст целиком без пробелов и разделителей
    normalized_text = re.sub(r'[^а-яё]', '', text.lower())

    # Если нашли мат, написанный через пробелы/точки/дефисы
    if any(bad in normalized_text for bad in BAD_WORDS):
        words = text.split()
        result = []

        for word in words:
            clean = re.sub(r'[^а-яё]', '', word.lower())

            # обычный мат
            if any(bad in clean for bad in BAD_WORDS):
                result.append('*' * len(word))
            # случай "с у к а", "х у й" и т.д.
            elif len(word) == 1 and any(
                bad in normalized_text for bad in BAD_WORDS
            ):
                result.append('*')
            else:
                result.append(word)

        return ' '.join(result)

    return text


def normalize_place(item: dict, request: Request) -> dict:
    place_id = item.get("id")
    avg_rating = 0.0
    reviews_count = 0

    try:
        connection = pymysql.connect(**DB_CONFIG)
        with connection.cursor() as cursor:
            cursor.execute("SELECT rating FROM reviews WHERE place_id = %s", (place_id,))
            ratings = cursor.fetchall()
            if ratings:
                reviews_count = len(ratings)
                total = sum(float(r["rating"]) for r in ratings)
                avg_rating = round(total / reviews_count, 1)
    except Exception as e:
        print(f"Ошибка подсчета рейтинга для места {place_id}: {e}")
    finally:
        if 'connection' in locals() and connection.open:
            connection.close()

    photo_url = item.get("photo_url")
    if photo_url and not photo_url.startswith(("http://", "https://")):
        base_url = str(request.base_url).rstrip("/")
        photo_url = f"{base_url}{photo_url}"
    elif not photo_url:
        photo_url = "https://placehold.co/600x400?text=Нет+фото"

    tags_raw = item.get("tags", "")
    tags_list = [t.strip() for t in tags_raw.split(",")] if tags_raw else []

    return {
        "id": item.get("id"),
        "title": item.get("title"),
        "description": item.get("description"),
        "latitude": float(item.get("latitude")) if item.get("latitude") is not None else 0.0,
        "longitude": float(item.get("longitude")) if item.get("longitude") is not None else 0.0,
        "image": photo_url,
        "tags": tags_list,
        "user_id": item.get("user_id"),
        "avg_rating": avg_rating,
        "reviews_count": reviews_count
    }


def attach_review_photo(review: dict, request: Request) -> dict:
    base = str(request.base_url).rstrip("/")
    raw = review.get("photo_url")
    if raw:
        review["image"] = base + raw if raw.startswith("/") else raw
    else:
        review["image"] = None
    return review


def save_uploaded_file(file: UploadFile, filename: str) -> str:
    file_path = STATIC_DIR / "images" / filename
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return f"/static/images/{filename}"


@app.get("/")
def home():
    return {"message": "Бэкенд работает!"}


# ==========================================
# МЕСТА
# ==========================================
@app.get("/api/places")
def get_places(request: Request, user_id: Optional[int] = None, tag: Optional[str] = None):
    try:
        connection = pymysql.connect(**DB_CONFIG)
        with connection.cursor() as cursor:
            if user_id is not None:
                sql = "SELECT p.id, p.title, p.description, p.latitude, p.longitude, p.photo_url, p.tags, p.user_id FROM places p WHERE p.user_id IS NULL OR p.user_id = %s"
                params = (user_id,)
            else:
                sql = "SELECT p.id, p.title, p.description, p.latitude, p.longitude, p.photo_url, p.tags, p.user_id FROM places p WHERE p.user_id IS NULL"
                params = ()
            cursor.execute(sql, params)
            result = cursor.fetchall()
            places = [normalize_place(p, request) for p in result]

            if tag:
                places = [p for p in places if tag in p.get("tags", [])]

            return places
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Ошибка подключения к базе: {str(e)}"})
    finally:
        if "connection" in locals() and connection.open:
            connection.close()


@app.get("/api/places/{place_id}")
def get_place_by_id(place_id: int, request: Request, user_id: Optional[int] = None):
    try:
        connection = pymysql.connect(**DB_CONFIG)
        with connection.cursor() as cursor:
            sql = "SELECT * FROM places WHERE id = %s"
            cursor.execute(sql, (place_id,))
            place = cursor.fetchone()

            if not place:
                return JSONResponse(status_code=404, content={"error": "Место не найдено"})

            owner_id = place.get("user_id")
            if owner_id is not None and owner_id != user_id:
                return JSONResponse(status_code=404, content={"error": "Место не найдено"})

            return normalize_place(place, request)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Ошибка подключения к базе: {str(e)}"})
    finally:
        if "connection" in locals() and connection.open:
            connection.close()


@app.post("/api/places")
def create_place(
    request: Request,
    title: str = Form(...),
    description: str = Form(""),
    latitude: float = Form(...),
    longitude: float = Form(...),
    tags: str = Form(""),
    user_id: int = Form(...),
    file: Optional[UploadFile] = File(None),
):
    connection = pymysql.connect(**DB_CONFIG)
    try:
        with connection.cursor() as cursor:
            sql = """
                INSERT INTO places (user_id, title, description, latitude, longitude, tags)
                VALUES (%s, %s, %s, %s, %s, %s)
            """
            cursor.execute(sql, (user_id, title, description, latitude, longitude, tags))
            connection.commit()
            new_id = cursor.lastrowid

            photo_url = None
            if file is not None and file.filename:
                ext = file.filename.split(".")[-1]
                file_name = f"{new_id}_photo.{ext}"
                photo_url = save_uploaded_file(file, file_name)
                cursor.execute("UPDATE places SET photo_url = %s WHERE id = %s", (photo_url, new_id))
                connection.commit()

            return {"status": "success", "message": "Место добавлено!", "id": new_id, "photo_url": photo_url}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Ошибка добавления места: {str(e)}"})
    finally:
        if "connection" in locals() and connection.open:
            connection.close()


# ==========================================
# РЕГИСТРАЦИЯ / ВХОД
# ==========================================
class UserRegister(BaseModel):
    username: str
    email: str
    password: str


@app.post("/api/register")
def register_user(user: UserRegister):
    try:
        connection = pymysql.connect(**DB_CONFIG)
        with connection.cursor() as cursor:
            check_sql = "SELECT id FROM users WHERE username = %s OR email = %s"
            cursor.execute(check_sql, (user.username, user.email))
            existing_user = cursor.fetchone()

            if existing_user:
                return JSONResponse(status_code=409, content={"error": "Пользователь с таким логином или почтой уже существует"})

            password_bytes = user.password.encode("utf-8")
            salt = bcrypt.gensalt()
            hashed_password = bcrypt.hashpw(password_bytes, salt).decode("utf-8")

            insert_sql = "INSERT INTO users (username, email, password_hash) VALUES (%s, %s, %s)"
            cursor.execute(insert_sql, (user.username, user.email, hashed_password))
            connection.commit()
            new_id = cursor.lastrowid

            return {
                "status": "success",
                "message": f"Пользователь {user.username} успешно зарегистрирован!",
                "id": new_id,
                "username": user.username,
                "email": user.email
            }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Ошибка при регистрации: {str(e)}"})
    finally:
        if "connection" in locals() and connection.open:
            connection.close()


class UserLogin(BaseModel):
    username: str
    password: str


@app.post("/api/login")
def login_user(user: UserLogin):
    try:
        with pymysql.connect(**DB_CONFIG) as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT id, username, email, password_hash FROM users WHERE username = %s OR email = %s",
                    (user.username, user.username)
                )
                result = cursor.fetchone()

                if not result:
                    return JSONResponse(status_code=401, content={"error": "Неверный логин или пароль"})

                hashed_password = result["password_hash"]
                if bcrypt.checkpw(user.password.encode('utf-8'), hashed_password.encode('utf-8')):
                    return {
                        "status": "success",
                        "message": f"Добро пожаловать, {result['username']}!",
                        "id": result["id"],
                        "username": result["username"],
                        "email": result["email"]
                    }
                else:
                    return JSONResponse(status_code=401, content={"error": "Неверный логин или пароль"})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Ошибка на бэкенде: {str(e)}"})


# ==========================================
# ОТЗЫВЫ (С ФИЛЬТРАЦИЕЙ ТЕКСТА)
# ==========================================
@app.post("/api/reviews")
def add_review(
    place_id: int = Form(...),
    user_id: int = Form(...),
    rating: int = Form(...),
    comment: str = Form(...),
    file: Optional[UploadFile] = File(None),
):
    if rating < 1 or rating > 5:
        return JSONResponse(status_code=400, content={"error": "Оценка должна быть от 1 до 5"})

    clean_comment = censor_text(comment)

    connection = pymysql.connect(**DB_CONFIG)
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM reviews WHERE place_id = %s AND user_id = %s", (place_id, user_id))
            if cursor.fetchone():
                return JSONResponse(status_code=409, content={"error": "Вы уже оставляли отзыв к этому месту"})

            cursor.execute(
                "INSERT INTO reviews (place_id, user_id, rating, comment) VALUES (%s, %s, %s, %s)",
                (place_id, user_id, rating, clean_comment),
            )
            connection.commit()
            new_id = cursor.lastrowid

            photo_url = None
            if file is not None and file.filename:
                ext = file.filename.split(".")[-1]
                file_name = f"review_{new_id}.{ext}"
                photo_url = save_uploaded_file(file, file_name)
                cursor.execute("UPDATE reviews SET photo_url = %s WHERE id = %s", (photo_url, new_id))
                connection.commit()

            return {
                "status": "success",
                "message": "Отзыв успешно добавлен!",
                "id": new_id,
                "photo_url": photo_url,
                "comment": clean_comment
            }
    except pymysql.err.IntegrityError:
        return JSONResponse(status_code=409, content={"error": "Вы уже оставляли отзыв к этому месту"})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Ошибка добавления отзыва: {str(e)}"})
    finally:
        if "connection" in locals() and connection.open:
            connection.close()


@app.put("/api/reviews/{review_id}")
async def update_review(
    review_id: int,
    user_id: int = Form(...),
    rating: int = Form(...),
    comment: str = Form(...),
    delete_photo: str = Form("false"),
    file: Optional[UploadFile] = File(None)
):
    clean_comment = censor_text(comment)
    
    connection = pymysql.connect(**DB_CONFIG)
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT * FROM reviews WHERE id = %s AND user_id = %s", (review_id, user_id))
            review = cursor.fetchone()
            if not review:
                return JSONResponse(status_code=403, content={"error": "Отзыв не найден или нет прав доступа"})
            
            photo_url = review.get("photo_url")
            
            if delete_photo == "true":
                photo_url = None
            
            if file and file.filename:
                file_extension = Path(file.filename).suffix
                unique_filename = f"review_{review_id}_{random.randint(1000, 9999)}{file_extension}"
                photo_url = save_uploaded_file(file, unique_filename)

            sql = """
                UPDATE reviews 
                SET rating = %s, comment = %s, photo_url = %s 
                WHERE id = %s
            """
            cursor.execute(sql, (rating, clean_comment, photo_url, review_id))
            connection.commit()
            
        return {"status": "success", "message": "Отзыв успешно обновлен", "comment": clean_comment}
        
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Ошибка базы данных: {str(e)}"})
    finally:
        if "connection" in locals() and connection.open:
            connection.close()


class ReviewDelete(BaseModel):
    user_id: int


@app.delete("/api/reviews/{review_id}")
def delete_review(review_id: int, payload: ReviewDelete):
    connection = pymysql.connect(**DB_CONFIG)
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT user_id FROM reviews WHERE id = %s", (review_id,))
            row = cursor.fetchone()
            if not row:
                return JSONResponse(status_code=404, content={"error": "Отзыв не найден"})
            if row["user_id"] != payload.user_id:
                return JSONResponse(status_code=403, content={"error": "Нельзя удалить чужой отзыв"})

            cursor.execute("DELETE FROM reviews WHERE id = %s", (review_id,))
            connection.commit()
            return {"status": "success", "message": "Отзыв удалён"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Ошибка удаления отзыва: {str(e)}"})
    finally:
        if "connection" in locals() and connection.open:
            connection.close()


@app.get("/api/places/{place_id}/reviews")
def get_place_reviews(place_id: int, request: Request):
    try:
        with pymysql.connect(**DB_CONFIG) as conn:
            with conn.cursor() as cursor:
                sql = """
                    SELECT r.id, r.user_id, r.rating, r.comment, r.photo_url, r.created_at, u.username 
                    FROM reviews r
                    JOIN users u ON r.user_id = u.id
                    WHERE r.place_id = %s
                    ORDER BY r.created_at DESC
                """
                cursor.execute(sql, (place_id,))
                reviews = cursor.fetchall()
                return [attach_review_photo(r, request) for r in reviews]
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Ошибка получения отзывов: {str(e)}"})


@app.get("/api/users/{user_id}/reviews")
def get_user_reviews(user_id: int, request: Request):
    try:
        with pymysql.connect(**DB_CONFIG) as conn:
            with conn.cursor() as cursor:
                sql = """
                    SELECT r.id, r.place_id, r.rating, r.comment, r.photo_url, r.created_at,
                           p.title AS placeName
                    FROM reviews r
                    JOIN places p ON r.place_id = p.id
                    WHERE r.user_id = %s
                    ORDER BY r.created_at DESC
                """
                cursor.execute(sql, (user_id,))
                reviews = cursor.fetchall()
                return [attach_review_photo(r, request) for r in reviews]
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Ошибка получения отзывов: {str(e)}"})


# ==========================================
# ИЗБРАННОЕ
# ==========================================
class FavoriteAction(BaseModel):
    user_id: int
    place_id: int


@app.post("/api/favorites")
def add_to_favorites(fav: FavoriteAction):
    try:
        with pymysql.connect(**DB_CONFIG) as conn:
            with conn.cursor() as cursor:
                sql = "INSERT IGNORE INTO favorites (user_id, place_id) VALUES (%s, %s)"
                cursor.execute(sql, (fav.user_id, fav.place_id))
                conn.commit()
                return {"status": "success", "message": "Место добавлено в избранное!"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Ошибка добавления: {str(e)}"})


@app.delete("/api/favorites")
def remove_from_favorites(fav: FavoriteAction):
    try:
        with pymysql.connect(**DB_CONFIG) as conn:
            with conn.cursor() as cursor:
                sql = "DELETE FROM favorites WHERE user_id = %s AND place_id = %s"
                cursor.execute(sql, (fav.user_id, fav.place_id))
                conn.commit()
                return {"status": "success", "message": "Место удалено из избранного"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Ошибка удаления: {str(e)}"})


@app.get("/api/users/{user_id}/favorites")
def get_user_favorites(user_id: int, request: Request):
    try:
        with pymysql.connect(**DB_CONFIG) as conn:
            with conn.cursor() as cursor:
                sql = """
                    SELECT p.id, p.title, p.description, p.latitude, p.longitude, p.photo_url, p.tags
                    FROM favorites f
                    JOIN places p ON f.place_id = p.id
                    WHERE f.user_id = %s
                """
                cursor.execute(sql, (user_id,))
                favorites = cursor.fetchall()
                return [normalize_place(f, request) for f in favorites]
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Ошибка получения избранного: {str(e)}"})


# ==========================================
# ДОПОЛНИТЕЛЬНОЕ УПРАВЛЕНИЕ МЕСТАМИ
# ==========================================
@app.post("/api/places/{place_id}/upload-photo")
async def upload_place_photo(place_id: int, file: UploadFile = File(...)):
    try:
        file_extension = Path(file.filename).suffix or ".jpg"
        filename = f"place_{place_id}{file_extension}"
        photo_url = save_uploaded_file(file, filename)

        connection = pymysql.connect(**DB_CONFIG)
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM places WHERE id = %s", (place_id,))
            if not cursor.fetchone():
                return JSONResponse(status_code=404, content={"error": "Место не найдено"})

            sql = "UPDATE places SET photo_url = %s WHERE id = %s"
            cursor.execute(sql, (photo_url, place_id))
            connection.commit()

        return {"success": True, "message": "Фотография успешно обновлена", "photo_url": photo_url}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Ошибка при загрузке фото: {str(e)}"})
    finally:
        if "connection" in locals() and connection.open:
            connection.close()


class PlaceUpdateModel(BaseModel):
    title: str
    description: str
    tags: str


@app.delete("/api/places/{place_id}")
def delete_user_place(place_id: int, user_id: int):
    connection = pymysql.connect(**DB_CONFIG)
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT user_id FROM places WHERE id = %s", (place_id,))
            place = cursor.fetchone()
            if not place:
                return JSONResponse(status_code=404, content={"error": "Место не найдено"})
            
            if place.get("user_id") != user_id:
                return JSONResponse(status_code=403, content={"error": "Нет прав на удаление этого места"})
            
            cursor.execute("DELETE FROM places WHERE id = %s", (place_id,))
            connection.commit()
            return {"success": True, "message": "Место успешно удалено"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        if "connection" in locals() and connection.open:
            connection.close()


@app.put("/api/places/{place_id}")
def update_user_place(place_id: int, user_id: int, data: PlaceUpdateModel):
    connection = pymysql.connect(**DB_CONFIG)
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT user_id FROM places WHERE id = %s", (place_id,))
            place = cursor.fetchone()
            if not place:
                return JSONResponse(status_code=404, content={"error": "Место не найдено"})
            
            if place.get("user_id") != user_id:
                return JSONResponse(status_code=403, content={"error": "Нет прав на редактирование"})
            
            sql = "UPDATE places SET title = %s, description = %s, tags = %s WHERE id = %s"
            cursor.execute(sql, (data.title, data.description, data.tags, place_id))
            connection.commit()
            return {"success": True, "message": "Данные места обновлены"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        if "connection" in locals() and connection.open:
            connection.close()


# ==========================================
# ВОССТАНОВЛЕНИЕ ДОСТУПА И ВХОД ПО OTP
# ==========================================
class ForgotPasswordRequest(BaseModel):
    email: str

class VerifyResetCodeRequest(BaseModel):
    email: str
    code: str


@app.post("/api/auth/forgot-password")
def forgot_password(payload: ForgotPasswordRequest):
    resend_api_key = os.getenv("RESEND_API_KEY")

    if not resend_api_key:
        return JSONResponse(status_code=500, content={"error": "RESEND_API_KEY не настроен на бэкенде"})

    connection = pymysql.connect(**DB_CONFIG)
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE email = %s", (payload.email,))
            user = cursor.fetchone()
            if not user:
                return JSONResponse(status_code=404, content={"error": "Пользователь с таким Email не найден"})

            otp_code = str(random.randint(10000, 99999))
            cursor.execute("UPDATE users SET reset_code = %s WHERE email = %s", (otp_code, payload.email))
            connection.commit()

            email_html = (
                f"<p>Ваш одноразовый код для входа на сайт «Фото-места Минска»: "
                f"<strong>{otp_code}</strong></p>"
                f"<p>Код действителен для одного входа.</p>"
            )

            resend_response = requests.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {resend_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": "Фото-места Минска <onboarding@resend.dev>",
                    "to": [payload.email],
                    "subject": "Код подтверждения входа",
                    "html": email_html,
                },
                timeout=10,
            )

            if resend_response.status_code >= 400:
                return JSONResponse(status_code=500, content={"error": f"Ошибка отправки письма: {resend_response.text}"})

            return {"status": "success", "message": "Код успешно отправлен!"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Ошибка на бэкенде: {str(e)}"})
    finally:
        if "connection" in locals() and connection.open:
            connection.close()


@app.post("/api/auth/verify-reset-code")
def verify_reset_code(payload: VerifyResetCodeRequest):
    connection = pymysql.connect(**DB_CONFIG)
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, username, email, reset_code FROM users WHERE email = %s", (payload.email,))
            user = cursor.fetchone()

            if not user:
                return JSONResponse(status_code=404, content={"error": "Пользователь не найден"})

            db_code = user.get("reset_code")
            if not db_code or db_code.strip() != payload.code.strip():
                return JSONResponse(status_code=401, content={"error": "Неверный или устаревший код подтверждения"})

            cursor.execute("UPDATE users SET reset_code = NULL WHERE id = %s", (user["id"],))
            connection.commit()

            return {
                "status": "success",
                "message": f"Добро пожаловать, {user['username']}!",
                "id": user["id"],
                "username": user["username"],
                "email": user["email"]
            }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Ошибка верификации: {str(e)}"})
    finally:
        if "connection" in locals() and connection.open:
            connection.close()
