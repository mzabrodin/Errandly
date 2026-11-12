import { randomUUID } from 'node:crypto';

import { API_PREFIX } from '../config/urls.js';

export const AVATAR_CONTENT_TYPE = 'image/webp';
export const AVATARS_PATH = `/${API_PREFIX}/avatars`;

const AVATAR_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

export function newAvatarKey(): string {
  return `${randomUUID()}.webp`;
}

export function isAvatarKey(value: string): boolean {
  return AVATAR_KEY.test(value);
}

export function avatarUrlOf(user: {
  uploadedAvatarKey: string | null;
  providerAvatarUrl: string | null;
}): string | null {
  if (user.uploadedAvatarKey !== null) return `${AVATARS_PATH}/${user.uploadedAvatarKey}`;
  return user.providerAvatarUrl;
}
