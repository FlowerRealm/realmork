import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import { createHomework, deleteHomework, listHomeworks, submitHomework, unsubmitHomework, updateHomework } from "./lib/api";
import type { Homework, HomeworkPayload, ViewMode } from "./lib/types";
import { formatMonthDayWeekday } from "./lib/format";
import { HomeworkCard } from "./components/HomeworkCard";
import { HomeworkModal } from "./components/HomeworkModal";

const TODAY_CAPACITY = 10;

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>("today");
  const [todayHomeworks, setTodayHomeworks] = useState<Homework[]>([]);
  const [recordHomeworks, setRecordHomeworks] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHomework, setEditingHomework] = useState<Homework | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [today, records] = await Promise.all([listHomeworks("today"), listHomeworks("records")]);
      setTodayHomeworks(today);
      setRecordHomeworks(records);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadAll();
    }, 30000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);

  const visibleTodayHomeworks = useMemo(() => todayHomeworks.slice(0, TODAY_CAPACITY), [todayHomeworks]);
  const hiddenCount = Math.max(todayHomeworks.length - visibleTodayHomeworks.length, 0);
  const isTodayView = viewMode === "today";
  const currentItems = isTodayView ? visibleTodayHomeworks : recordHomeworks;
  const listTitle = isTodayView ? "今日作业" : "全部记录";
  const listMeta = isTodayView ? (hiddenCount > 0 ? `仅显示最近 10 条，剩余 ${hiddenCount} 条在记录中` : "按截止时间从近到远") : "按截止时间倒序";
  const topbarDate = formatMonthDayWeekday(currentTime);

  async function handleSave(payload: HomeworkPayload, existingId?: string) {
    if (existingId) {
      await updateHomework(existingId, payload);
    } else {
      await createHomework(payload);
    }
    await loadAll();
  }

  async function handleToggleSubmitted(homework: Homework) {
    if (homework.submitted) {
      await unsubmitHomework(homework.id);
    } else {
      await submitHomework(homework.id);
    }
    await loadAll();
  }

  async function handleDelete(homework: Homework) {
    const confirmed = window.confirm(`确认删除“${homework.subject}”作业？删除后无法恢复。`);
    if (!confirmed) {
      return;
    }

    setError("");
    try {
      await deleteHomework(homework.id);
      await loadAll();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除失败");
    }
  }

  function openCreateModal() {
    setEditingHomework(null);
    setModalOpen(true);
  }

  function openEditModal(homework: Homework) {
    setEditingHomework(homework);
    setModalOpen(true);
  }

  return (
    <div className="shell">
      <main className="workspace-frame">
        <header className="floating-topbar" aria-label="当前日期">
          <time className="topbar-date" dateTime={currentTime.toISOString()}>
            {topbarDate}
          </time>
        </header>

        <section className="list-panel">
          <header className="column-toolbar">
            <div className="view-switch">
              <button
                className={viewMode === "today" ? "switch-button active" : "switch-button"}
                type="button"
                onClick={() => setViewMode("today")}
              >
                今日
              </button>
              <button
                className={viewMode === "records" ? "switch-button active" : "switch-button"}
                type="button"
                onClick={() => setViewMode("records")}
              >
                记录
              </button>
            </div>
            <button className="primary-button" type="button" onClick={openCreateModal}>
              新增作业
            </button>
          </header>

          <div className="list-head">
            <span>{listTitle}</span>
            <span>{listMeta}</span>
          </div>

          {error ? (
            <div className="panel-state error">
              <p>{error}</p>
              <button className="ghost-button compact" type="button" onClick={() => void loadAll()}>
                重新加载
              </button>
            </div>
          ) : loading ? (
            <div className="panel-state">正在加载作业...</div>
          ) : (
            <div className={`list-items ${isTodayView ? "today-items" : "records-items"}`}>
              {currentItems.length === 0 ? (
                <article className="empty-card">
                  <h3>{isTodayView ? "今天没有待办" : "还没有记录"}</h3>
                  <p>{isTodayView ? "当前没有今日或逾期作业。" : "新增一条作业后会自动保存在本机。"}</p>
                </article>
              ) : (
                currentItems.map((homework) => (
                  <HomeworkCard
                    key={homework.id}
                    homework={homework}
                    fullDate={!isTodayView}
                    onEdit={openEditModal}
                    onDelete={handleDelete}
                    onToggleSubmitted={handleToggleSubmitted}
                  />
                ))
              )}
            </div>
          )}
        </section>

        <HomeworkModal
          open={modalOpen}
          initialValue={editingHomework}
          onClose={() => setModalOpen(false)}
          onSubmit={handleSave}
        />
      </main>
    </div>
  );
}
