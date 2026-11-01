# CODEFORGE — сайт студии цифровой разработки

Премиальный тёмный сайт IT-компании с живой анимированной сценой программиста на первом экране, многошаговой формой заказа, реальным сохранением заявок в базу данных, уведомлениями в Telegram/e-mail и защищённой админ-панелью.

![Hero](public/assets/img/og-image.png)

## Что внутри

| Часть | Реализация |
|---|---|
| Фронтенд | Чистый HTML + CSS + JavaScript без сборки (`public/`) |
| Hero-сцена | Анимированная сцена 1600×900 (SVG + DOM): программист печатает — каждый символ в редакторе вызывает нажатие пальца нужной руки, голова поворачивается к активному монитору, терминал выполняет команды, превью «перезагружается» после каждого файла. Код сменяется: TypeScript, CSS, Python, HTML, Go |
| Бэкенд | Node.js + Express (`server/`) |
| База данных | SQLite из коробки (встроенный `node:sqlite`, ноль настроек) или PostgreSQL / Supabase через `DATABASE_URL` |
| Валидация | Zod на сервере + зеркальная валидация на клиенте |
| Загрузка файлов | Multer: белый список расширений, проверка сигнатур файлов, лимиты, случайные имена, хранение вне публичной папки |
| Антиспам | Honeypot-поле, подписанный токен формы (минимальное время заполнения, одноразовость), лимит заявок с IP, проверка MX-записей домена почты |
| Уведомления | Telegram Bot API, e-mail команде и подтверждение клиенту (SMTP / Nodemailer) |
| Админ-панель | `/admin` — вход, статистика, поиск, фильтры, детали заявки, смена статуса, заметки, история, скачивание файлов, экспорт CSV |
| SEO | meta, Open Graph, JSON-LD, ЧПУ `/projects/<slug>`, `/sitemap.xml`, `/robots.txt`, серверный рендеринг страниц проектов и правовых страниц |

## Быстрый старт

Требуется **Node.js 22.13+**.

```bash
npm install
cp .env.example .env
npm run hash-password          # введите пароль → вставьте ADMIN_PASSWORD_HASH в .env
npm start                      # http://localhost:3000
```

- Сайт: `http://localhost:3000`
- Админ-панель: `http://localhost:3000/admin` (логин `ADMIN_USER`, по умолчанию `admin`)
- Тесты API: `npm test`

Для разработки без хеша можно временно задать `ADMIN_PASSWORD=...` в `.env`.

## Настройка (.env)

Все переменные описаны в [`.env.example`](.env.example). Главное:

- `SITE_URL` — публичный адрес (canonical, Open Graph, sitemap, ссылки в уведомлениях).
- `SESSION_SECRET` — случайная строка ≥ 32 символов, **обязательна в production**.
- `DATABASE_URL` — пусто = SQLite в `data/`; строка подключения Postgres/Supabase = PostgreSQL. Таблицы создаются автоматически.
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` — уведомления о новых заявках.
- `SMTP_*`, `MAIL_FROM`, `MAIL_NOTIFY_TO` — письма команде и подтверждение клиенту.
- `TRUST_PROXY=true` — если сайт за nginx / Render / Railway (корректные IP для лимитов).

### Supabase

Settings → Database → Connection string (URI) → вставьте в `DATABASE_URL`. SSL включается автоматически для доменов Supabase.

## Деплой

Подходит любой хостинг Node.js (VPS, Render, Railway, Fly.io):

```bash
NODE_ENV=production npm start
```

Нужен постоянный диск для `data/` (SQLite и загруженные файлы) либо PostgreSQL/Supabase для заявок. Загруженные файлы всегда хранятся на диске в `DATA_DIR/uploads`.

> Статический хостинг (GitHub Pages и т. п.) покажет вёрстку, но заявки отправляться не будут: для приёма заявок нужен сервер.

## Видео вместо анимированной сцены (опционально)

Сцена программиста нарисована кодом и работает без внешних файлов. Если у вас есть лицензированное видео, добавьте атрибуты к `.hero__media` в `public/index.html`:

```html
<div class="hero__media" aria-hidden="true"
     data-video-webm="/assets/video/hero.webm"
     data-video-mp4="/assets/video/hero.mp4"
     data-video-mobile="/assets/video/hero-mobile.mp4"
     data-poster="/assets/video/hero-poster.jpg">
```

Видео запускается автоматически, без звука и элементов управления, зацикливается и плавно заменяет сцену после загрузки; на телефонах берётся облегчённая версия.

## Структура

```
public/               статический фронтенд
  index.html          главная страница
  assets/css/main.css дизайн-система и все секции
  assets/js/main.js   навигация, анимации появления, счётчики, курсор, частицы, FAQ
  assets/js/hero-scene.js   живая сцена программиста
  assets/js/order-form.js   многошаговая форма заказа
  admin/              админ-панель
server/
  index.js            Express-приложение и API
  db/                 адаптеры SQLite и PostgreSQL
  validation.js       Zod-схемы, проверка домена почты
  security.js         токены формы, лимиты, сессии, хеш паролей
  uploads.js          безопасная загрузка файлов
  notify.js           Telegram и e-mail
  projects.js         демо-концепты портфолио
  render.js, content/ серверный рендеринг страниц проектов и правовых страниц
test/api.test.js      интеграционные тесты API
```

## API

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/api/form-token` | антиспам-токен формы |
| POST | `/api/orders` | создание заявки (multipart) → `{ number }` |
| POST | `/api/admin/login`, `/api/admin/logout` | вход/выход |
| GET | `/api/admin/orders?q=&status=&service=&budget=&sort=&page=` | список с поиском и фильтрами |
| GET/PATCH | `/api/admin/orders/:id` | детали / смена статуса и заметки |
| GET | `/api/admin/orders/:id/files/:fileId` | скачивание файла |
| GET | `/api/admin/stats`, `/api/admin/export.csv` | статистика, экспорт |

## Перед запуском в продакшн заменить

- контакты `hello@codeforge.dev`, `@codeforge_studio` и ссылки на соцсети (в `public/index.html` и `server/render.js`) — сейчас это заглушки;
- тексты политики конфиденциальности и соглашения (`server/content/`) — проверить с юристом и добавить реквизиты;
- проекты в портфолио — демонстрационные концепты и везде помечены как «Демо-концепт».
