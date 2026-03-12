import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import { createHomework, deleteHomework, listHomeworks, submitHomework, unsubmitHomework, updateHomework } from "./lib/api";
import type { Homework, HomeworkPayload, ViewMode } from "./lib/types";
import { formatDateTime, formatMonthDayWeekday } from "./lib/format";
import { HomeworkCard } from "./components/HomeworkCard";
import { HomeworkModal } from "./components/HomeworkModal";

const TODAY_CAPACITY = 10;
const SUMMARY_ITEM_LIMIT = 3;

function getHomeworkFocusLabel(homework: Homework) {
  if (homework.needsSubmission) {
    return "要交";
  }

  if (homework.isOverdue) {
    return "逾期";
  }

  return "待办";
}

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
  const todayPendingCount = todayHomeworks.filter((homework) => !homework.submitted).length;
  const attentionCount = todayHomeworks.filter((homework) => !homework.submitted && (homework.needsSubmission || homework.isOverdue)).length;
  const summaryCards = [
    { label: "今日总数", value: todayHomeworks.length },
    { label: "待提交", value: todayPendingCount },
    { label: "需立即处理", value: attentionCount },
    { label: "记录总数", value: recordHomeworks.length }
  ];
  const recentPendingHomeworks = useMemo(
    () =>
      [...todayHomeworks]
        .filter((homework) => !homework.submitted)
        .sort((left, right) => new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime())
        .slice(0, SUMMARY_ITEM_LIMIT),
    [todayHomeworks]
  );
  const overviewCopy = loading
    ? "正在整理今天的作业状态。"
    : error
      ? "暂时拿不到最新数据，稍后重新加载。"
      : todayPendingCount > 0
        ? `今天还有 ${todayPendingCount} 项待提交，先处理最近截止的。`
        : "今天的待办已经清空，可以安心回看记录。";

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
      <div className="page-header">
        <div className="page-header-inner">
          <header className="floating-topbar" aria-label="当前日期">
            <time className="topbar-date" dateTime={currentTime.toISOString()}>
              {topbarDate}
            </time>
          </header>
        </div>
      </div>

      <main className="workspace-frame">
        <div className="dashboard-layout">
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

          <aside className="summary-panel" aria-label="作业概览">
            <div className="summary-intro">
              <span className="summary-kicker">overview</span>
              <h2 className="summary-title">作业概览</h2>
              <p className="summary-copy">{overviewCopy}</p>
            </div>

            {error ? (
              <div className="summary-state error">
                <p>{error}</p>
                <button className="ghost-button compact" type="button" onClick={() => void loadAll()}>
                  重新加载
                </button>
              </div>
            ) : loading ? (
              <div className="summary-state">正在整理概览...</div>
            ) : (
              <>
                <div className="summary-grid">
                  {summaryCards.map((card) => (
                    <article key={card.label} className="summary-card" aria-label={`${card.label} ${card.value}`}>
                      <span className="summary-card-label">{card.label}</span>
                      <strong className="summary-card-value">{card.value}</strong>
                    </article>
                  ))}
                </div>

                <section className="summary-section">
                  <div className="summary-section-head">
                    <span>最近待处理</span>
                    <span>最多 {SUMMARY_ITEM_LIMIT} 条</span>
                  </div>

                  {recentPendingHomeworks.length === 0 ? (
                    <div className="summary-empty">
                      <p>今天没有待处理项。</p>
                      <span>可以切到记录里回看已经完成的内容。</span>
                    </div>
                  ) : (
                    <div className="summary-list">
                      {recentPendingHomeworks.map((homework) => (
                        <article key={homework.id} className="summary-item">
                          <div className="summary-item-top">
                            <span className="summary-item-subject">{homework.subject}</span>
                            <span
                              className={homework.needsSubmission || homework.isOverdue ? "summary-pill urgent" : "summary-pill"}
                            >
                              {getHomeworkFocusLabel(homework)}
                            </span>
                          </div>
                          <p className="summary-item-content">{homework.content}</p>
                          <time className="summary-item-date" dateTime={homework.dueAt}>
                            截止 {formatDateTime(homework.dueAt)}
                          </time>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <section className="summary-section">
                  <div className="summary-section-head">
                    <span>{isTodayView ? "当前聚焦今日清单" : "当前聚焦历史记录"}</span>
                    <span>{listTitle}</span>
                  </div>
                  <p className="summary-copy">{listMeta}</p>
                </section>
              </>
            )}
          </aside>
        </div>

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
