import { useEffect, useId, useRef, useState } from "react";
import { formatDateTime, formatFullDateTime } from "../lib/format";
import { getHomeworkTone } from "../lib/homework";
import type { Homework } from "../lib/types";

type HomeworkCardProps = {
  homework: Homework;
  fullDate?: boolean;
  onEdit: (homework: Homework) => void;
  onDelete: (homework: Homework) => Promise<void>;
  onToggleSubmitted: (homework: Homework) => Promise<void>;
};

export function HomeworkCard({ homework, fullDate = false, onEdit, onDelete, onToggleSubmitted }: HomeworkCardProps) {
  const tone = getHomeworkTone(homework);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const statusLabel = homework.needsSubmission
    ? "要交"
    : homework.submitted
      ? "已交"
      : homework.isToday
        ? "待办"
        : "未交";

  const cardClass = tone === "attention" ? "homework-card row-layout attention" : "homework-card row-layout";
  const statusClass = tone === "attention" ? "status-badge attention" : tone === "done" ? "status-badge done" : "status-badge";
  const dueLabel = fullDate ? formatFullDateTime(homework.dueAt) : formatDateTime(homework.dueAt);
  const menuClass = menuOpen ? "action-menu open" : "action-menu";
  const triggerClass = menuOpen ? "icon-button action-trigger open" : "icon-button action-trigger";

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  function handleMenuAction(action: () => Promise<void> | void) {
    setMenuOpen(false);
    void action();
  }

  return (
    <article className={cardClass}>
      <div className="card-main">
        <span className="subject">{homework.subject}</span>
        <div className="content">{homework.content}</div>
      </div>
      <div className="card-side">
        <time className="deadline" dateTime={homework.dueAt}>
          {dueLabel}
        </time>
        <div ref={menuRef} className={menuClass}>
          <button
            className={triggerClass}
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={`${homework.subject} 更多操作`}
            onClick={() => setMenuOpen((current) => !current)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M10.1 2.8h3.8l.6 2.3c.5.2 1 .4 1.5.8l2.2-.9 1.9 3.3-1.7 1.6c.1.3.1.7.1 1.1s0 .8-.1 1.1l1.7 1.6-1.9 3.3-2.2-.9c-.5.3-1 .6-1.5.8l-.6 2.3h-3.8l-.6-2.3c-.5-.2-1-.4-1.5-.8l-2.2.9-1.9-3.3 1.7-1.6c-.1-.3-.1-.7-.1-1.1s0-.8.1-1.1L4 8.3 5.9 5l2.2.9c.5-.3 1-.6 1.5-.8zm1.9 6a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4z"
                fill="currentColor"
              />
            </svg>
          </button>

          {menuOpen ? (
            <div id={menuId} className="action-menu-panel" role="menu" aria-label={`${homework.subject} 作业操作`}>
              <div className="menu-status-row">
                <span className="menu-status-label">状态</span>
                <span className={statusClass}>{statusLabel}</span>
              </div>
              <div className="menu-actions">
                <button
                  className="primary-button compact menu-action"
                  type="button"
                  role="menuitem"
                  onClick={() => handleMenuAction(() => onToggleSubmitted(homework))}
                >
                  {homework.submitted ? "撤回" : "提交"}
                </button>
                <button
                  className="ghost-button compact menu-action"
                  type="button"
                  role="menuitem"
                  onClick={() => handleMenuAction(() => onEdit(homework))}
                >
                  编辑
                </button>
                <button
                  className="ghost-button compact danger-button menu-action"
                  type="button"
                  role="menuitem"
                  onClick={() => handleMenuAction(() => onDelete(homework))}
                >
                  删除
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
