// The published language between modules: what happened, never what to do next.
// Payloads are stored as JSON (event_publications), so they hold ids, ISO strings and plain values.
// Who publishes and who listens: docs/architecture.md, "Events".

export interface DomainEventMap {
  /** users: an account was deleted (NFR-LEG-02) */
  'user.deleted': { userId: string };
  /** groups: someone accepted an invite (SD-2) */
  'group.memberJoined': { groupId: string; userId: string };
  /** groups: a member left or was removed (FR-15); `removedBy` is null when they left */
  'group.memberLeft': { groupId: string; userId: string; removedBy: string | null };
  /** groups: a member will be away; inclusive yyyy-mm-dd dates (FR-15, FR-29) */
  'group.absenceAdded': { groupId: string; userId: string; from: string; to: string };
  /** tasks: an instance got a new assignee, by the algorithm or by hand (SD-1, FR-27–31) */
  'task.assigned': {
    taskId: string;
    groupId: string;
    assigneeId: string | null;
    previousAssigneeId: string | null;
    /** Null when the algorithm decided; nobody is notified about their own action */
    actorId: string | null;
  };
  /** tasks: title, description, due date or difficulty changed */
  'task.changed': { taskId: string; groupId: string };
  /** tasks: marked done or undone (SD-3) */
  'task.completed': { taskId: string; groupId: string; userId: string; done: boolean };
  /** tasks: an instance was deleted */
  'task.deleted': { taskId: string; groupId: string; assigneeId: string | null };
}

export type EventType = keyof DomainEventMap;
