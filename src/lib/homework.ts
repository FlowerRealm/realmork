import { getBeijingDateParts } from "./format";
import type { Homework } from "./types";

export type HomeworkTone = "default" | "attention" | "done";
export const HOMEWORK_ROW_GAP_PX = 6;
export const HOMEWORK_ROW_HEIGHT_MAX_PX = 96;

function sameDay(left: Date, right: Date): boolean {
  const leftParts = getBeijingDateParts(left);
  const rightParts = getBeijingDateParts(right);

  return leftParts.year === rightParts.year && leftParts.month === rightParts.month && leftParts.day === rightParts.day;
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

export function getHomeworkTone(homework: Pick<Homework, "needsSubmission" | "submitted">): HomeworkTone {
  if (homework.needsSubmission) {
    return "attention";
  }

  if (homework.submitted) {
    return "done";
  }

  return "default";
}

export function getHomeworkRowHeight(
  viewportHeight: number,
  itemCount: number,
  maxRowHeightPx = HOMEWORK_ROW_HEIGHT_MAX_PX,
  rowGapPx = HOMEWORK_ROW_GAP_PX
): number {
  if (viewportHeight <= 0 || itemCount <= 0) {
    return maxRowHeightPx;
  }

  const gapBudget = rowGapPx * Math.max(itemCount - 1, 0);
  const availableHeight = viewportHeight - gapBudget;
  return Math.min(Math.max(Math.floor(availableHeight / itemCount), 1), maxRowHeightPx);
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
