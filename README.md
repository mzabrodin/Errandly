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

- **Frontend:** React 19, TypeScript, Vite, React Router, TanStack Query, i18next, Vitest + Testing Library
- **Backend:** NestJS, TypeScript, PostgreSQL, OpenAPI (Swagger), Vitest
- **Інфраструктура:** Docker Compose, GitHub Actions, oxlint, Prettier, husky + lint-staged

## Структура

```
frontend/   SPA-клієнт
backend/    REST API
.github/    CI
```

## Запуск

### Docker (усе однією командою)

```bash
docker compose up --build
```

- застосунок: http://localhost:8080
- API: http://localhost:3000/api
- документація API: http://localhost:3000/api/docs

Якщо порт 5432 зайнятий, задайте інший: `DB_PORT=5433 docker compose up --build`.

### Локальна розробка

Потрібен Node.js 22+.

```bash
npm install
cp backend/.env.example backend/.env
docker compose up -d db   # лише база даних
npm run dev:backend       # http://localhost:3000
npm run dev:frontend      # http://localhost:5173, /api проксіюється на бекенд
```

### Перевірки

```bash
npm run lint
npm run format:check
npm run build
npm test
```

Перед комітом husky автоматично форматує змінені файли.
