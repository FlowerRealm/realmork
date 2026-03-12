import type { Homework } from "../lib/types";
import { formatDateTime, formatFullDateTime } from "../lib/format";

type HomeworkCardProps = {
  homework: Homework;
  fullDate?: boolean;
  onEdit: (homework: Homework) => void;
  onDelete: (homework: Homework) => Promise<void>;
  onToggleSubmitted: (homework: Homework) => Promise<void>;
};

export function HomeworkCard({ homework, fullDate = false, onEdit, onDelete, onToggleSubmitted }: HomeworkCardProps) {
  const statusLabel = homework.needsSubmission
    ? "需要提交"
    : homework.submitted
      ? "已提交"
      : homework.isToday
        ? "今日待办"
        : "未提交";

  const statusClass = homework.needsSubmission ? "status-badge urgent" : homework.submitted ? "status-badge done" : "status-badge";
  const dueLabel = fullDate ? formatFullDateTime(homework.dueAt) : formatDateTime(homework.dueAt);

  return (
    <article className="homework-card">
      <div className="item-top">
        <span className="subject">{homework.subject}</span>
        <span className={statusClass}>{statusLabel}</span>
      </div>
      <div className="content">{homework.content}</div>
      <div className="item-bottom">
        <span className="deadline">截止 {dueLabel}</span>
        <div className="actions">
          <button className="ghost-button compact" type="button" onClick={() => onEdit(homework)}>
            编辑
          </button>
          <button className="ghost-button compact danger-button" type="button" onClick={() => void onDelete(homework)}>
            删除
          </button>
          <button className="primary-button compact" type="button" onClick={() => void onToggleSubmitted(homework)}>
            {homework.submitted ? "撤回" : "提交"}
          </button>
        </div>
      </div>
    </article>
  );
}
