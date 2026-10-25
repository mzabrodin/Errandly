# Errandly

Сервіс для розподілу побутових задач між співмешканцями з інтеграцією Google Calendar.

## Можливості

- групи співмешканців і запрошення за посиланням або email;
- повторювані задачі зі складністю та термінами;
- автоматичний рівномірний розподіл задач (найменше навантаження + ротація) з ручним коригуванням;
- синхронізація задач і нагадувань із Google Calendar;
- статуси виконання, календарний вигляд і статистика групи.

## Команда

| Учасник             | Роль                              |
| ------------------- | --------------------------------- |
| Бублик Світлана     | Frontend Engineer                 |
| Владимирська Поліна | UI/UX Designer                    |
| Дирда Вікторія      | Backend Engineer, QA Engineer     |
| Дорошенко Лука      | Project Manager, Business Analyst |
| Забродін Максим     | Backend Engineer, DevOps Engineer |
| Хаймик Тетяна       | Frontend Engineer, QA Engineer    |

## Стек

- **Frontend:** React 19, TypeScript, Vite, React Router, TanStack Query, i18next, openapi-fetch, Vitest + Testing Library
- **Backend:** NestJS, TypeScript, PostgreSQL, OpenAPI (Swagger), pino, Vitest
- **Інфраструктура:** Docker Compose, Mailpit, GitHub Actions, oxlint, Prettier, husky + lint-staged + commitlint

## Структура

```text
frontend/            SPA-клієнт
  src/app/           корінь застосунку, роутер, провайдери
  src/pages/         сторінки
  src/shared/        спільний шар: API-клієнт, i18n, утиліти (без бізнес-логіки)
backend/             REST API
  src/config/        змінні середовища (з валідацією), адреси
  src/logger/        логування
  openapi.json       контракт API (згенерований)
.github/             CI, шаблон PR
```

Залежності між шарами фронтенду йдуть лише вниз: `app → pages → shared`. Лінтер це перевіряє.

## Запуск

Потрібні Node.js 24 (`.nvmrc`) і Docker.

### Docker

```bash
docker compose up -d --build
```

- застосунок: <http://localhost:8080>
- API: <http://localhost:3000/api>
- Mailpit (усі листи з dev-середовища): <http://localhost:8025>

Значення за замовчуванням підходять для розробки. Щоб змінити порти чи паролі, скопіюйте `.env.example` у `.env` (наприклад, `POSTGRES_PORT=5433`, якщо порт 5432 зайнятий).

### Локальна розробка

```bash
npm install
cp backend/.env.example backend/.env
docker compose up -d postgresql mailpit   # лише залежності
npm run dev:backend                       # http://localhost:3000, Swagger UI: /api/docs
npm run dev:frontend                      # http://localhost:5173, /api проксіюється на бекенд
```

### Перевірки

```bash
npm run lint
npm run format:check
npm run build
npm test
npm run test:cov -w backend
npm run test:e2e -w backend
```

## Типізований API

Джерело правди — DTO бекенду. Після зміни контролерів чи DTO виконайте:

```bash
npm run api:sync
```

Swagger UI (`/api/docs`) доступний лише в режимі розробки (`NODE_ENV=development`, тобто `npm run dev:backend`); у Docker і production його немає. Команда оновлює `backend/openapi.json` і `frontend/src/shared/api/schema.d.ts`. Обидва файли комітяться. CI перевіряє, що вони актуальні. На фронтенді запити робляться через `api` з `src/shared/api/client.ts`: шляхи, параметри й відповіді перевіряються компілятором.

## Змінні середовища та секрети

Конфігурація задається лише змінними середовища (NFR-DEP-02). Бекенд перевіряє їх під час запуску й не стартує з некоректними значеннями. Секрети не комітяться: `.env` у `.gitignore`, у репозиторії є лише `.env.example`.

| Змінна                                        | Призначення                                           | Секрет | Де задається            |
| --------------------------------------------- | ----------------------------------------------------- | ------ | ----------------------- |
| `NODE_ENV`                                    | `development` / `production` / `test`                 | ні     | `backend/.env`, compose |
| `PORT`                                        | порт API                                              | ні     | `backend/.env`, compose |
| `APP_URL`                                     | публічна адреса застосунку: CORS, OAuth, посилання    | ні     | `backend/.env`, compose |
| `LOG_LEVEL`                                   | `fatal`…`trace`, `silent`                             | ні     | `backend/.env`, `.env`  |
| `DATABASE_URL`                                | підключення до PostgreSQL                             | так    | `backend/.env`, compose |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `_DB` | облікові дані бази в compose                          | так    | `.env`                  |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE`     | поштовий сервер (за замовчуванням Mailpit)            | ні     | `backend/.env`, `.env`  |
| `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`       | облікові дані пошти (Gmail: app password)             | так    | `backend/.env`, `.env`  |
| `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`          | підпис сесій, шифрування Google-токенів (буде додано) | так    | `backend/.env`          |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`   | OAuth-клієнт Google (буде додано)                     | так    | `backend/.env`          |
| `VITE_API_URL`                                | адреса API для фронтенду, якщо не той самий origin    | ні     | `frontend/.env`         |

- Усе з префіксом `VITE_` потрапляє в браузер, тому секретів там бути не може.
- **GitHub Secrets** зараз не потрібні: CI використовує лише вбудований `GITHUB_TOKEN`. Під час деплою секрети додаються в GitHub Environment `production` (Settings → Environments), а не в змінні репозиторію.
- Увімкніть **Secret scanning** і **Push protection** (Settings → Code security). Для публічних репозиторіїв вони безкоштовні й закривають перевірку «сканування секретів» із ПР3.

### Google OAuth

Вхід через Google і доступ до календаря — окремі потоки (SYS-06): календар підключається за бажанням, зокрема користувачами, які зареєструвалися за email. Адреси повернення будуються з `APP_URL`, окремі змінні не потрібні. У Google Cloud Console для кожного `APP_URL` зареєструйте:

- `<APP_URL>/api/auth/google/callback` — вхід;
- `<APP_URL>/api/calendar/google/callback` — підключення календаря.

Для розробки це `http://localhost:5173` і `http://localhost:8080`.

## Логування

Бекенд пише структуровані логи через pino: JSON у production, читабельний формат у розробці. Кожен запис містить час, рівень та ідентифікатор запиту (SYS-27). nginx передає `X-Request-Id`, бекенд повертає його у відповіді, тож запит можна знайти і в логах nginx, і в логах бекенду:

```bash
docker compose logs -f backend frontend
```

Заголовки `Authorization`, `Cookie`, `Set-Cookie` і поля `password`/`token` маскуються. Тіла запитів не логуються. У коді використовуйте `Logger` з `@nestjs/common` (`new Logger(MyService.name)`). `console.*` заборонено лінтером.

## Якість коду

- **Типізація:** спільний `tsconfig.base.json` зі `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` та іншими прапорцями. Лінтер забороняє `any`, неперевірені приведення типів і неявні перетворення в умовах.
- **Лінтер:** oxlint з type-aware правилами (`.oxlintrc.json` у корені та в кожному пакеті).
- **Форматер:** Prettier із сортуванням імпортів.
- **Хуки:** перед комітом lint-staged форматує змінені файли й запускає лінтер, commitlint перевіряє повідомлення.

### Повідомлення комітів

[Conventional Commits](https://www.conventionalcommits.org/): `тип(область): опис`, наприклад:

```text
feat(backend): add group invitations
fix(frontend): keep form values on validation error
chore(deps): update vite
```

Типи: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. Області:
`frontend`, `backend`, `db`, `ci`, `docker`, `deps`, `deps-dev`, `docs`.

### Pull requests

Зміни в `main` — лише через PR з одним схваленням і зеленим CI (NFR-MAIN-03, NFR-PROC-02). Налаштовується вручну: Settings → Branches → правило для `main`: «Require a pull request» (1 approval) і «Require status checks» (`check`, `docker`).

### Оновлення залежностей

Dependabot (`.github/dependabot.yml`) щопонеділка відкриває згруповані PR для npm, GitHub Actions і Docker-образів. Релізи, молодші за 7 днів, пропускаються, а оновлення безпеки приходять одразу. Їх перевіряють і зливають як звичайні PR. Щоб отримувати PR із виправленнями вразливостей, увімкніть **Dependabot security updates** (Settings → Code security).

### Перехід на LF

Репозиторій зберігає файли з LF (`.gitattributes`). Якщо клон був створений раніше і `npm run format:check` скаржиться
на всі файли, оновіть робочу копію (незакомічені зміни буде втрачено):

```bash
git rm --cached -r -q . && git reset --hard
```
