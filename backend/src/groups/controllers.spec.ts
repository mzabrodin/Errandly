import { AbsencesController } from './absences.controller.js';
import type { AbsencesService } from './absences.service.js';
import { GroupsController } from './groups.controller.js';
import type { GroupsService } from './groups.service.js';
import { InvitesController } from './invites.controller.js';
import type { InvitesService } from './invites.service.js';

// Controllers only pass the caller and the inputs on; the e2e tests run them for real

function recorder(calls: unknown[][]): object {
  return new Proxy(
    {},
    {
      get:
        (_target, method: string) =>
        (...args: unknown[]) => {
          calls.push([method, ...args]);
          return Promise.resolve(method);
        },
    },
  );
}

const user = { id: 'u1', sessionId: 's1' };

describe('groups controllers', () => {
  it('pass the caller and inputs to the services', async () => {
    const calls: unknown[][] = [];
    const groups = new GroupsController(recorder(calls) as GroupsService);
    const invites = new InvitesController(recorder(calls) as InvitesService);
    const absences = new AbsencesController(recorder(calls) as AbsencesService);

    await groups.list(user);
    await groups.create(user, { name: 'Room 12' });
    await groups.get(user, 'g1');
    await groups.removeMember(user, 'g1', 'u2');
    await groups.updateMember(user, 'g1', 'u2', { role: 'admin' });
    await groups.leave(user, 'g1');
    await invites.create(user, 'g1', { email: 'a@errandly.test' });
    await invites.info(null, 'tok');
    await invites.info(user, 'tok');
    await invites.accept(user, 'tok');
    await absences.create(user, 'g1', { from: '2026-11-20', to: '2026-11-22' });
    await absences.remove(user, 'g1', 'a1');

    expect(calls).toEqual([
      ['list', 'u1'],
      ['create', 'u1', 'Room 12'],
      ['get', 'g1', 'u1'],
      ['removeMember', 'g1', 'u1', 'u2'],
      ['changeRole', 'g1', 'u1', 'u2', 'admin'],
      ['leave', 'g1', 'u1'],
      ['create', 'g1', 'u1', 'a@errandly.test'],
      ['info', 'tok', null],
      ['info', 'tok', 'u1'],
      ['accept', 'tok', 'u1'],
      ['add', 'g1', 'u1', '2026-11-20', '2026-11-22'],
      ['remove', 'g1', 'u1', 'a1'],
    ]);
  });
});
