// Domain names for the API contract. The shapes come from the backend DTOs via
// backend/openapi.json → schema.d.ts (npm run api:sync); behaviour rules: docs/api.md
import type { components } from './schema';

type Schemas = components['schemas'];

export type User = Schemas['UserDto'];
export type Locale = Schemas['Locale'];

export type GroupRole = Schemas['GroupRole'];
export type GroupSummary = Schemas['GroupSummaryDto'];
export type Absence = Schemas['AbsenceDto'];
export type Member = Schemas['MemberDto'];
export type Group = Schemas['GroupDto'];
export type Invite = Schemas['InviteDto'];
export type InviteInfo = Schemas['InviteInfoDto'];

export type TaskStatus = Schemas['TaskStatus'];
/** 1 = Monday … 7 = Sunday for weekly series */
export type Recurrence = Schemas['TaskDto']['recurrence'];
export type Task = Schemas['TaskDto'];
/** Task form; `assigneeId: null` means automatic assignment */
export type TaskInput = Schemas['CreateTaskDto'];
export type EditScope = Schemas['EditScope'];

export type StatsPeriod = Schemas['StatsPeriod'];
export type MemberStats = Schemas['MemberStatsDto'];

export type NotificationType = Schemas['NotificationType'];
export type AppNotification = Schemas['NotificationDto'];
export type NotificationList = Schemas['NotificationListDto'];

export type CalendarStatus = Schemas['CalendarStatusDto'];
export type Settings = Schemas['SettingsDto'];
export type SettingsPatch = Schemas['UpdateSettingsDto'];
export type ProfilePatch = Schemas['UpdateProfileDto'];
