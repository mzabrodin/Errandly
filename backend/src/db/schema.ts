// Every table in one place for Drizzle (drizzle-kit, the typed `db.query` API, the seed).
// Each table is owned by one module; only that module's repositories may query it
// (enforced by src/architecture.spec.ts).
export * from '../users/users.schema.js';
export * from '../auth/auth.schema.js';
export * from '../groups/groups.schema.js';
export * from '../tasks/tasks.schema.js';
export * from '../notifications/notifications.schema.js';
export * from '../calendar/calendar.schema.js';
export * from '../common/events/event-publications.schema.js';
export * from './relations.js';
