import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';

import { DomainError } from '../errors/domain-error.js';

// In the shared kernel so `users` can read the caller without importing `auth` (a cycle).

export interface RequestUser {
  id: string;
  sessionId: string;
}

export const IS_PUBLIC_KEY = 'errandly:public';

export function Public(): ClassDecorator & MethodDecorator {
  return SetMetadata(IS_PUBLIC_KEY, true);
}

// Keyed by the request object, so no global type augmentation of Express is needed
const requestUsers = new WeakMap<object, RequestUser>();

export function setRequestUser(request: object, user: RequestUser): void {
  requestUsers.set(request, user);
}

export function requestUserOf(request: object): RequestUser | undefined {
  return requestUsers.get(request);
}

export function currentUserOf(context: ExecutionContext): RequestUser {
  const user = requestUserOf(context.switchToHttp().getRequest<object>());
  if (!user) throw new DomainError('UNAUTHENTICATED');
  return user;
}

export function optionalUserOf(context: ExecutionContext): RequestUser | null {
  return requestUserOf(context.switchToHttp().getRequest<object>()) ?? null;
}

/** On a @Public() route without a session it answers 401 */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  currentUserOf(context),
);

export const OptionalUser = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  optionalUserOf(context),
);
