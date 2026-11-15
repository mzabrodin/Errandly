// The same limits as LIMITS in backend/src/common/domain.ts; the server checks them again
export const LIMITS = {
  userName: 60,
  groupName: 50,
  taskTitle: 100,
  taskDescription: 2000,
  difficultyMin: 1,
  difficultyMax: 5,
} as const;
