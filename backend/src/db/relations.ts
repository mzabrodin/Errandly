import { relations } from 'drizzle-orm';

import { authIdentities, emailTokens, passwordCredentials, sessions } from '../auth/auth.schema.js';
import {
  calendarConnections,
  calendarEventLinks,
  calendarSettings,
} from '../calendar/calendar.schema.js';
import { absences, groups, invites, memberships } from '../groups/groups.schema.js';
import {
  notificationPreferences,
  notifications,
  notificationSettings,
  taskReminders,
  weeklyDigests,
} from '../notifications/notifications.schema.js';
import { tasks, taskSeries, taskSwaps } from '../tasks/tasks.schema.js';
import { users } from '../users/users.schema.js';

// Relations for the typed `db.query` API. They live here, not in the module schemas,
// so the schema files never import each other in a cycle.

export const usersRelations = relations(users, ({ many, one }) => ({
  passwordCredentials: one(passwordCredentials),
  authIdentities: many(authIdentities),
  sessions: many(sessions),
  emailTokens: many(emailTokens),
  memberships: many(memberships),
  notifications: many(notifications),
  notificationSettings: one(notificationSettings),
  notificationPreferences: many(notificationPreferences),
  calendarConnections: many(calendarConnections),
  calendarSettings: one(calendarSettings),
}));

export const passwordCredentialsRelations = relations(passwordCredentials, ({ one }) => ({
  user: one(users, { fields: [passwordCredentials.userId], references: [users.id] }),
}));

export const authIdentitiesRelations = relations(authIdentities, ({ one }) => ({
  user: one(users, { fields: [authIdentities.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const emailTokensRelations = relations(emailTokens, ({ one }) => ({
  user: one(users, { fields: [emailTokens.userId], references: [users.id] }),
}));

export const groupsRelations = relations(groups, ({ many }) => ({
  memberships: many(memberships),
  invites: many(invites),
  absences: many(absences),
  series: many(taskSeries),
  tasks: many(tasks),
}));

export const membershipsRelations = relations(memberships, ({ one, many }) => ({
  group: one(groups, { fields: [memberships.groupId], references: [groups.id] }),
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
  absences: many(absences),
}));

export const invitesRelations = relations(invites, ({ one }) => ({
  group: one(groups, { fields: [invites.groupId], references: [groups.id] }),
  inviter: one(users, { fields: [invites.invitedBy], references: [users.id] }),
}));

export const absencesRelations = relations(absences, ({ one }) => ({
  group: one(groups, { fields: [absences.groupId], references: [groups.id] }),
  membership: one(memberships, {
    fields: [absences.groupId, absences.userId],
    references: [memberships.groupId, memberships.userId],
  }),
}));

export const taskSeriesRelations = relations(taskSeries, ({ one, many }) => ({
  group: one(groups, { fields: [taskSeries.groupId], references: [groups.id] }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  series: one(taskSeries, { fields: [tasks.seriesId], references: [taskSeries.id] }),
  group: one(groups, { fields: [tasks.groupId], references: [groups.id] }),
  assignee: one(users, { fields: [tasks.assigneeId], references: [users.id] }),
  calendarEventLinks: many(calendarEventLinks),
  offeredInSwaps: many(taskSwaps, { relationName: 'offeredTask' }),
  requestedInSwaps: many(taskSwaps, { relationName: 'requestedTask' }),
}));

export const taskSwapsRelations = relations(taskSwaps, ({ one }) => ({
  group: one(groups, { fields: [taskSwaps.groupId], references: [groups.id] }),
  offeredTask: one(tasks, {
    fields: [taskSwaps.offeredTaskId],
    references: [tasks.id],
    relationName: 'offeredTask',
  }),
  requestedTask: one(tasks, {
    fields: [taskSwaps.requestedTaskId],
    references: [tasks.id],
    relationName: 'requestedTask',
  }),
  proposer: one(users, { fields: [taskSwaps.proposerId], references: [users.id] }),
  recipient: one(users, { fields: [taskSwaps.recipientId], references: [users.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
  group: one(groups, { fields: [notifications.groupId], references: [groups.id] }),
  task: one(tasks, { fields: [notifications.taskId], references: [tasks.id] }),
}));

export const notificationPreferencesRelations = relations(notificationPreferences, ({ one }) => ({
  user: one(users, { fields: [notificationPreferences.userId], references: [users.id] }),
}));

export const taskRemindersRelations = relations(taskReminders, ({ one }) => ({
  task: one(tasks, { fields: [taskReminders.taskId], references: [tasks.id] }),
  user: one(users, { fields: [taskReminders.userId], references: [users.id] }),
}));

export const weeklyDigestsRelations = relations(weeklyDigests, ({ one }) => ({
  user: one(users, { fields: [weeklyDigests.userId], references: [users.id] }),
}));

export const notificationSettingsRelations = relations(notificationSettings, ({ one }) => ({
  user: one(users, { fields: [notificationSettings.userId], references: [users.id] }),
}));

export const calendarSettingsRelations = relations(calendarSettings, ({ one }) => ({
  user: one(users, { fields: [calendarSettings.userId], references: [users.id] }),
}));

export const calendarConnectionsRelations = relations(calendarConnections, ({ one, many }) => ({
  user: one(users, { fields: [calendarConnections.userId], references: [users.id] }),
  eventLinks: many(calendarEventLinks),
}));

export const calendarEventLinksRelations = relations(calendarEventLinks, ({ one }) => ({
  connection: one(calendarConnections, {
    fields: [calendarEventLinks.connectionId],
    references: [calendarConnections.id],
  }),
  task: one(tasks, { fields: [calendarEventLinks.taskId], references: [tasks.id] }),
}));
