import type { Homework } from "./types";

function sameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function toTimestamp(value: string): number {
  return new Date(value).getTime();
}

export function withDerivedHomeworkState(homework: Homework, now: Date): Homework {
  const dueAt = new Date(homework.dueAt);
  const isToday = sameDay(dueAt, now);
  const isOverdue = !homework.submitted && dueAt.getTime() < now.getTime() && !isToday;

  return {
    ...homework,
    needsSubmission: !homework.submitted && dueAt.getTime() <= now.getTime(),
    isOverdue,
    isToday
  };
}

export function sortTodayHomeworks(items: Homework[]): Homework[] {
  return [...items].sort((left, right) => {
    if (left.isOverdue !== right.isOverdue) {
      return left.isOverdue ? -1 : 1;
    }

    const dueDiff = toTimestamp(left.dueAt) - toTimestamp(right.dueAt);
    if (dueDiff !== 0) {
      return dueDiff;
    }

    if (left.submitted !== right.submitted) {
      return left.submitted ? 1 : -1;
    }

    return toTimestamp(right.createdAt) - toTimestamp(left.createdAt);
  });
}

export function sortRecordHomeworks(items: Homework[]): Homework[] {
  return [...items].sort((left, right) => {
    const dueDiff = toTimestamp(right.dueAt) - toTimestamp(left.dueAt);
    if (dueDiff !== 0) {
      return dueDiff;
    }

    if (left.submitted !== right.submitted) {
      return left.submitted ? 1 : -1;
    }

    return toTimestamp(right.createdAt) - toTimestamp(left.createdAt);
  });
}

export function upsertHomework(items: Homework[], nextHomework: Homework): Homework[] {
  const existingIndex = items.findIndex((item) => item.id === nextHomework.id);
  if (existingIndex === -1) {
    return [...items, nextHomework];
  }

  const nextItems = items.slice();
  nextItems[existingIndex] = nextHomework;
  return nextItems;
}

export function removeHomework(items: Homework[], homeworkID: string): Homework[] {
  return items.filter((item) => item.id !== homeworkID);
}
