import { waitFor } from '@testing-library/react';

import { renderApiHook, stubApi } from '../../test/api';
import {
  useAcceptInvite,
  useAddAbsence,
  useCreateGroup,
  useDeleteAbsence,
  useLeaveGroup,
  useRemoveMember,
  useSetMemberRole,
} from './groups';
import { useAnswerSwap, useCancelSwap, useProposeSwap } from './swaps';
import {
  useCompleteTask,
  useCreateTask,
  useDeleteTask,
  useReassignTask,
  useUpdateTask,
} from './tasks';
import type { TaskInput } from './types';

const G = 'g1';
const TASK: TaskInput = {
  title: 'Trash',
  description: '',
  dueAt: '2026-11-20T18:00:00.000Z',
  difficulty: 2,
  recurrence: { type: 'once' },
  assigneeId: null,
};

const TASK_KEYS = [
  ['tasks', G],
  ['stats', G],
  ['swaps', G],
];
const GROUP_KEYS = [['groups'], ...TASK_KEYS];
const SWAP_KEYS = [
  ['swaps', G],
  ['tasks', G],
  ['stats', G],
];

type AnyMutation = () => { mutateAsync: (input: never) => Promise<unknown> };

const CASES: [string, AnyMutation, unknown, string, unknown[][]][] = [
  ['create a task', () => useCreateTask(G), TASK, `POST /api/groups/${G}/tasks`, TASK_KEYS],
  [
    'edit a series',
    () => useUpdateTask(G),
    { ...TASK, id: 't1', scope: 'series' },
    'PATCH /api/tasks/t1?scope=series',
    TASK_KEYS,
  ],
  [
    'delete one instance',
    () => useDeleteTask(G),
    { id: 't1', scope: 'one' },
    'DELETE /api/tasks/t1?scope=one',
    TASK_KEYS,
  ],
  [
    'complete',
    () => useCompleteTask(G),
    { id: 't1', done: true },
    'POST /api/tasks/t1/complete',
    TASK_KEYS,
  ],
  [
    'undo',
    () => useCompleteTask(G),
    { id: 't1', done: false },
    'DELETE /api/tasks/t1/complete',
    TASK_KEYS,
  ],
  [
    'reassign',
    () => useReassignTask(G),
    { id: 't1', assigneeId: 'u2' },
    'PATCH /api/tasks/t1/assignee',
    TASK_KEYS,
  ],
  ['create a group', useCreateGroup, 'Room 12', 'POST /api/groups', [['groups']]],
  ['accept an invite', useAcceptInvite, 'tok', 'POST /api/invites/tok/accept', [['groups']]],
  [
    'remove a member',
    () => useRemoveMember(G),
    'u2',
    `DELETE /api/groups/${G}/members/u2`,
    GROUP_KEYS,
  ],
  [
    'grant admin',
    () => useSetMemberRole(G),
    { userId: 'u2', role: 'admin' },
    `PATCH /api/groups/${G}/members/u2`,
    GROUP_KEYS,
  ],
  ['leave', () => useLeaveGroup(G), undefined, `POST /api/groups/${G}/leave`, GROUP_KEYS],
  [
    'add an absence',
    () => useAddAbsence(G),
    { from: '2026-11-20', to: '2026-11-22' },
    `POST /api/groups/${G}/absences`,
    GROUP_KEYS,
  ],
  [
    'delete an absence',
    () => useDeleteAbsence(G),
    'a1',
    `DELETE /api/groups/${G}/absences/a1`,
    GROUP_KEYS,
  ],
  [
    'propose a swap',
    () => useProposeSwap(G),
    { taskId: 't1', requestedTaskId: 't2' },
    'POST /api/tasks/t1/swaps',
    SWAP_KEYS,
  ],
  [
    'accept a swap',
    () => useAnswerSwap(G),
    { swapId: 's1', accept: true },
    'POST /api/swaps/s1/accept',
    SWAP_KEYS,
  ],
  [
    'decline a swap',
    () => useAnswerSwap(G),
    { swapId: 's1', accept: false },
    'POST /api/swaps/s1/decline',
    SWAP_KEYS,
  ],
  ['cancel a swap', () => useCancelSwap(G), 's1', 'DELETE /api/swaps/s1', SWAP_KEYS],
];

describe('mutations', () => {
  it.each(CASES)('%s: sends the request and refreshes what it changed', async (...testCase) => {
    const [, useHook, input, request, keys] = testCase;
    const calls = stubApi();
    const { result, invalidated } = renderApiHook(useHook);

    await result.current.mutateAsync(input as never);

    expect(calls.map(({ method, path, search }) => `${method} ${path}${search}`)).toEqual([
      request,
    ]);
    expect(invalidated()).toEqual(keys);
  });

  it('refreshes the swaps after a failed answer too, since it means the swap went stale', async () => {
    stubApi(() => ({ status: 409, body: { code: 'SWAP_STALE' } }));
    const { result, invalidated } = renderApiHook(() => useAnswerSwap(G));

    await expect(result.current.mutateAsync({ swapId: 's1', accept: true })).rejects.toMatchObject({
      status: 409,
    });

    await waitFor(() => expect(invalidated()).toEqual(SWAP_KEYS));
  });

  it('refreshes nothing when a task change fails', async () => {
    stubApi(() => ({ status: 409, body: { code: 'TASK_DONE' } }));
    const { result, invalidated } = renderApiHook(() => useReassignTask(G));

    await expect(result.current.mutateAsync({ id: 't1', assigneeId: 'u2' })).rejects.toMatchObject({
      status: 409,
    });

    expect(invalidated()).toEqual([]);
  });
});
