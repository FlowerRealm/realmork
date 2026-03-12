export const supportedSubjects = ["语文", "数学", "英语", "物理", "化学", "生物"] as const;

export type SupportedSubject = (typeof supportedSubjects)[number];

export type Homework = {
  id: string;
  subject: string;
  content: string;
  dueAt: string;
  submitted: boolean;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  needsSubmission: boolean;
  isOverdue: boolean;
  isToday: boolean;
};

export type HomeworkPayload = {
  subject: SupportedSubject;
  content: string;
  dueAt: string;
};

export type ViewMode = "today" | "records";

export function isSupportedSubject(subject: string): subject is SupportedSubject {
  return supportedSubjects.some((item) => item === subject);
}
