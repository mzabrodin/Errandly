# API-контракт фронтенду

Фронтенд звертається до `/api` (у dev — через проксі Vite). Поки бекенд у розробці, ці ендпоінти імітує MSW (`src/mocks/handlers.ts`), тому мок — це робоча специфікація: якщо реалізація на бекенді відрізняється, оновіть і моки, і цей файл.

Типи даних — `src/shared/api/types.ts`. Час — ISO 8601 в UTC. Автентифікація — cookie-сесія (`credentials: 'include'`).

## Помилки

Тіло помилки: `{ "code": "...", "fields"?: { "<поле>": "<код>" }, "retryAfterSeconds"?: number }`.

| Статус | Коди                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------ |
| 400    | `VALIDATION` (з `fields`: `required`, `tooLong`, `weak`, `invalid`, `inPast`, `noWeekdays`), `TOKEN_INVALID` |
| 401    | `UNAUTHENTICATED`, `INVALID_CREDENTIALS`                                                                     |
| 403    | `FORBIDDEN` (не учасник групи), `ADMIN_ONLY`, `NOT_ASSIGNEE`, `EMAIL_NOT_VERIFIED`                           |
| 409    | `EMAIL_TAKEN`, `LAST_ADMIN`, `TASK_DONE`, `UNDO_EXPIRED`, `CANNOT_REMOVE_SELF`                               |
| 410    | `INVITE_INVALID`                                                                                             |
| 423    | `ACCOUNT_LOCKED` (+ `retryAfterSeconds`)                                                                     |

## Автентифікація

| Метод | Шлях                        | Тіло → відповідь                          | FR    |
| ----- | --------------------------- | ----------------------------------------- | ----- |
| GET   | `/auth/me`                  | → `User` або 401                          | —     |
| POST  | `/auth/register`            | `{ name, email, password }` → 201 `User`  | 01–04 |
| POST  | `/auth/login`               | `{ email, password }` → `User`            | 05–06 |
| POST  | `/auth/logout`              | → 204                                     | 09    |
| GET   | `/auth/google?next=`        | редирект на OAuth Google, потім на `next` | 07    |
| POST  | `/auth/forgot-password`     | `{ email }` → 204 (завжди)                | 08    |
| POST  | `/auth/reset-password`      | `{ token, password }` → 204               | 08    |
| POST  | `/auth/verify-email`        | `{ token }` → `User`                      | 04    |
| POST  | `/auth/verify-email/resend` | → 204                                     | 04    |

Посилання в листах фронтенд очікує такі: `/verify-email/:token`, `/reset-password/:token`, `/invite/:token`.

## Групи

| Метод  | Шлях                              | Тіло → відповідь                                                                                 | FR    |
| ------ | --------------------------------- | ------------------------------------------------------------------------------------------------ | ----- |
| GET    | `/groups`                         | → `GroupSummary[]`                                                                               | 18    |
| POST   | `/groups`                         | `{ name }` → 201 `Group`                                                                         | 10    |
| GET    | `/groups/:id`                     | → `Group` (з учасниками та їхніми відсутностями)                                                 | 40    |
| POST   | `/groups/:id/invites`             | `{ email? }` → 201 `{ url, expiresAt }` (адмін)                                                  | 11    |
| GET    | `/invites/:token`                 | → `InviteInfo` або 410 (публічний)                                                               | 12–14 |
| POST   | `/invites/:token/accept`          | → `{ groupId }`                                                                                  | 12    |
| DELETE | `/groups/:id/members/:userId`     | → 204, перерозподіл задач (адмін)                                                                | 15    |
| PATCH  | `/groups/:id/members/:userId`     | `{ role: "admin" \| "member" }` → 204; 409 `LAST_ADMIN`, якщо знімають останнього адміна (адмін) | 16    |
| POST   | `/groups/:id/leave`               | → 204 або 409 `LAST_ADMIN`                                                                       | 16    |
| POST   | `/groups/:id/absences`            | `{ from, to }` (yyyy-mm-dd) → 201                                                                | 17    |
| DELETE | `/groups/:id/absences/:absenceId` | → 204                                                                                            | 17    |

## Задачі

| Метод  | Шлях                                    | Тіло → відповідь                                                  | FR           |
| ------ | --------------------------------------- | ----------------------------------------------------------------- | ------------ |
| GET    | `/groups/:id/tasks?from=&to=&seriesId=` | → `Task[]` за `dueAt` у `[from, to)`; усі параметри необов'язкові | 23           |
| GET    | `/tasks/:id`                            | → `Task` (403 для не-учасника, 404 якщо видалено)                 | 23, 40       |
| POST   | `/groups/:id/tasks`                     | `TaskInput` → 201 `Task` (перший екземпляр)                       | 19–21, 27–30 |
| PATCH  | `/tasks/:id?scope=one\|series`          | `TaskInput` → `Task`                                              | 22, 30       |
| DELETE | `/tasks/:id?scope=one\|series`          | → 204                                                             | 22           |
| POST   | `/tasks/:id/complete`                   | → `Task` (лише виконавець)                                        | 24           |
| DELETE | `/tasks/:id/complete`                   | → `Task`; виконавець — протягом 24 год, адміністратор — будь-коли | 24           |
| PATCH  | `/tasks/:id/assignee`                   | `{ assigneeId }` → `Task` (адмін)                                 | 30–31        |

`TaskInput.assigneeId = null` означає автоматичний розподіл. `status` обчислює сервер: `done` → `overdue` (термін минув) → `unassigned` → `planned`.

## Профіль і акаунт

| Метод  | Шлях                | Тіло → відповідь                                                                                               | Вимоги                 |
| ------ | ------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------- |
| PATCH  | `/me`               | `{ name?, timezone? }` → `User`                                                                                | NFR-COMP-03            |
| POST   | `/me/avatar`        | `multipart/form-data`, поле `file` (зображення ≤ 512 КБ; клієнт сам стискає до 256×256) → `User` з `avatarUrl` | —                      |
| DELETE | `/me/avatar`        | → `User` (`avatarUrl: null`)                                                                                   | —                      |
| POST   | `/me/password`      | `{ currentPassword, newPassword }` → 204; 400 `WRONG_PASSWORD`                                                 | FR-01 (правила пароля) |
| DELETE | `/me`               | → 204; 409 `LAST_ADMIN` + `groups: string[]`, якщо користувач — єдиний адмін групи з учасниками                | NFR-LEG-02             |
| POST   | `/me/calendar/sync` | → `Settings` (оновлює `calendar.lastSyncedAt`)                                                                 | FR-35                  |

## Сповіщення в сервісі

| Метод | Шлях                  | Тіло → відповідь                                              |
| ----- | --------------------- | ------------------------------------------------------------- |
| GET   | `/notifications`      | → `{ items: AppNotification[], unread: number }` (останні 50) |
| POST  | `/notifications/read` | `{ ids?: string[] }` → 204; без `ids` — позначити всі         |

Типи подій (`AppNotification.type`): `groupCreated`, `groupJoined`, `memberJoined` (адмінам), `taskAssigned`, `taskUnassigned` (попередньому виконавцю), `taskOverdue` (від фонового процесу FR-25), `roleGranted`, `roleRevoked`, `removedFromGroup`. Сповіщення не створюється, якщо дію виконав сам отримувач. Фронтенд опитує список раз на 30 с.

## Листи

Шаблони й відправка — `backend/src/mail` (`MailService.send(template, to, data)`). Шаблони: `verifyEmail`, `resetPassword`, `invite`, `taskAssigned`, `taskDueSoon`, `taskOverdue`; поля даних описані в `backend/src/mail/templates/index.ts`. Посилання в листах фронтенд очікує на `/verify-email/:token`, `/reset-password/:token`, `/invite/:token`, `/g/:groupId/tasks/:taskId`, `/settings`.

## Статистика та налаштування

| Метод  | Шлях                                   | Тіло → відповідь                                                                                      | FR        |
| ------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------- |
| GET    | `/groups/:id/stats?period=week\|month` | → `MemberStats[]`                                                                                     | 39        |
| GET    | `/me/settings`                         | → `Settings`                                                                                          | 32–35, 38 |
| PATCH  | `/me/settings`                         | `{ reminderMinutes?, notifications? }` → `Settings`; `notifications.weeklyDigest` — тижневий підсумок | 33, 38    |
| POST   | `/me/calendar/connect`                 | → `{ url }` — адреса згоди Google OAuth                                                               | 32        |
| DELETE | `/me/calendar`                         | → `Settings`, токени видалено                                                                         | 32        |

Після OAuth-згоди бекенд має повернути користувача на `/settings?calendar=connected`. Якщо `settings.calendar.syncStatus = "paused"`, фронтенд показує банер «Синхронізацію з календарем призупинено» (FR-35).
