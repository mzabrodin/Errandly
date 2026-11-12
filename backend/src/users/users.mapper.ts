import type { UserDto } from './dto/user.dto.js';
import { avatarUrlOf } from './users.rules.js';
import type { UserRow } from './users.schema.js';

export function toUserDto(row: UserRow): UserDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerifiedAt !== null,
    timezone: row.timezone,
    locale: row.locale,
    avatarUrl: avatarUrlOf(row),
  };
}
