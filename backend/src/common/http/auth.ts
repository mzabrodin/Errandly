import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';

import { DomainError } from '../errors/domain-error.js';

// The pieces of authentication every module needs. They live in the shared kernel, so `users`
// can read the signed-in user without importing `auth` (which imports `users`: a cycle).
// The auth module's SessionGuard fills them in.

/** Who is calling: the user and the session the request came with */
export interface RequestUser {
  id: string;
  /** Id of the session row (the SHA-256 of the cookie token) */
  sessionId: string;
}

export const IS_PUBLIC_KEY = 'errandly:public';

/** The route works without a session; SessionGuard denies everything else (default-deny) */
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

/** The signed-in user; on a @Public() route without a session it answers 401 */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  currentUserOf(context),
);

/** The signed-in user if there is one; for @Public() routes that answer differently when signed in */
export const OptionalUser = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  optionalUserOf(context),
);
