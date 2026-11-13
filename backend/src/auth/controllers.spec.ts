import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import type { EnvironmentVariables } from '../config/env.validation.js';
import { AccountController } from './account.controller.js';
import { AuthController } from './auth.controller.js';
import type { AuthService } from './auth.service.js';

// Controllers only map HTTP to a service call and handle the cookie; the integration tests run them for real

const config = { get: () => 'development' } as unknown as ConfigService<EnvironmentVariables, true>;
const user = { id: 'u1', sessionId: 's1' };
const dto = { id: 'u1', name: 'Anya' };
const session = { token: 'abc', expiresAt: new Date('2026-12-09T00:00:00Z') };

function recordingResponse() {
  const calls: string[] = [];
  const response = {
    cookie: (name: string, value: string) => calls.push(`set ${name}=${value}`),
    clearCookie: (name: string) => calls.push(`clear ${name}`),
  } as unknown as Response;
  return { calls, response };
}

describe('AuthController', () => {
  const calls: unknown[][] = [];
  const auth = new Proxy(
    {},
    {
      get:
        (_target, method: string) =>
        (...args: unknown[]) => {
          calls.push([method, ...args]);
          return Promise.resolve(
            method === 'register' || method === 'login' ? { user: dto, session } : dto,
          );
        },
    },
  ) as unknown as AuthService;
  const controller = new AuthController(auth, config);

  beforeEach(() => {
    calls.length = 0;
  });

  it('signs in on register and login by setting the cookie', async () => {
    const { calls: cookies, response } = recordingResponse();
    const register = { name: 'Anya', email: 'a@errandly.test', password: 'Pass1234' };

    await expect(controller.register(register, response)).resolves.toBe(dto);
    await expect(
      controller.login({ email: 'a@errandly.test', password: 'Pass1234' }, response),
    ).resolves.toBe(dto);

    expect(cookies).toEqual(['set errandly_session=abc', 'set errandly_session=abc']);
  });

  it('logs out with the cookie token and clears the cookie', async () => {
    const { calls: cookies, response } = recordingResponse();
    const request = { headers: { cookie: 'errandly_session=abc' } } as Request;

    await controller.logout(request, response);

    expect(calls).toEqual([['logout', 'abc']]);
    expect(cookies).toEqual(['clear errandly_session']);
  });

  it('changes the password of the signed-in user', async () => {
    const account = new AccountController(auth);

    await account.changePassword(user, { currentPassword: 'Pass1234', newPassword: 'New12345' });

    expect(calls).toEqual([['changePassword', user, 'Pass1234', 'New12345']]);
  });
});
