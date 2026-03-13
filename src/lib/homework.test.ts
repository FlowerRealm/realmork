import { withDerivedHomeworkState } from "./homework";
import type { Homework } from "./types";

function buildHomework(overrides: Partial<Homework> = {}): Homework {
  return {
    id: "hw-1",
    subject: "数学",
    content: "测试作业",
    dueAt: "2026-03-12T00:30:00+08:00",
    submitted: false,
    submittedAt: null,
    createdAt: "2026-03-11T08:00:00+08:00",
    updatedAt: "2026-03-11T08:00:00+08:00",
    needsSubmission: false,
    isOverdue: false,
    isToday: false,
    ...overrides
  };
}

describe("withDerivedHomeworkState", () => {
  it("derives today using Beijing calendar days", () => {
    const homework = withDerivedHomeworkState(buildHomework(), new Date("2026-03-11T16:45:00Z"));

    expect(homework.isToday).toBe(true);
    expect(homework.isOverdue).toBe(false);
    expect(homework.needsSubmission).toBe(true);
  });

  it("treats previous Beijing day items as overdue even on non-Beijing runtimes", () => {
    const homework = withDerivedHomeworkState(
      buildHomework({
        dueAt: "2026-03-11T23:30:00+08:00"
      }),
      new Date("2026-03-12T16:00:00Z")
    );

    expect(homework.isToday).toBe(false);
    expect(homework.isOverdue).toBe(true);
    expect(homework.needsSubmission).toBe(true);
  });
});
