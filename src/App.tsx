import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import { createHomework, deleteHomework, getDailyQuote, listHomeworks, submitHomework, unsubmitHomework, updateHomework } from "./lib/api";
import type { DailyQuote, Homework, HomeworkPayload, ViewMode } from "./lib/types";
import { formatDateTime } from "./lib/format";
import { HomeworkCard } from "./components/HomeworkCard";
import { FloatingTopbar } from "./components/FloatingTopbar";
import { HomeworkModal } from "./components/HomeworkModal";

const TODAY_CAPACITY = 10;
const SUMMARY_ITEM_LIMIT = 3;
const REFRESH_INTERVAL_MS = 30_000;

function getHomeworkFocusLabel(homework: Homework) {
  if (homework.needsSubmission) {
    return "要交";
  }

  if (homework.isOverdue) {
    return "逾期";
  }

  return "待办";
}

function millisecondsUntilNextMidnight(now: Date): number {
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  return Math.max(nextMidnight.getTime() - now.getTime(), 1000);
}

function millisecondsUntilNextMinute(now: Date): number {
  const nextMinute = new Date(now);
  nextMinute.setSeconds(60, 0);
  return Math.max(nextMinute.getTime() - now.getTime(), 250);
}

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>("today");
  const [todayHomeworks, setTodayHomeworks] = useState<Homework[]>([]);
  const [recordHomeworks, setRecordHomeworks] = useState<Homework[]>([]);
  const [dailyQuote, setDailyQuote] = useState<DailyQuote | null>(null);
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
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;

    function scheduleClockTick() {
      const delay = millisecondsUntilNextMinute(new Date());
      timer = window.setTimeout(() => {
        setCurrentTime(new Date());
        if (!cancelled) {
          scheduleClockTick();
        }
      }, delay);
    }

    scheduleClockTick();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let midnightTimer = 0;
    let retryTimer = 0;
    let loadingQuote = false;

    function clearRetryTimer() {
      if (retryTimer !== 0) {
        window.clearTimeout(retryTimer);
        retryTimer = 0;
      }
    }

    async function loadQuote() {
      try {
        const nextQuote = await getDailyQuote();
        if (!cancelled) {
          setDailyQuote(nextQuote);
        }
        return true;
      } catch {
        if (!cancelled) {
          setDailyQuote(null);
        }
        return false;
      }
    }

    function scheduleRetry() {
      clearRetryTimer();
      retryTimer = window.setTimeout(() => {
        void loadQuoteWithRetry();
      }, REFRESH_INTERVAL_MS);
    }

    async function loadQuoteWithRetry() {
      if (loadingQuote) {
        return;
      }

      loadingQuote = true;
      clearRetryTimer();

      const loaded = await loadQuote();
      loadingQuote = false;

      if (!cancelled && !loaded) {
        scheduleRetry();
      }
    }

    function scheduleNextRefresh() {
      const delay = millisecondsUntilNextMidnight(new Date());
      midnightTimer = window.setTimeout(() => {
        void loadQuoteWithRetry().finally(() => {
          if (!cancelled) {
            scheduleNextRefresh();
          }
        });
      }, delay);
    }

    void loadQuoteWithRetry();
    scheduleNextRefresh();

    return () => {
      cancelled = true;
      clearRetryTimer();
      window.clearTimeout(midnightTimer);
    };
  }, []);

  const visibleTodayHomeworks = useMemo(() => todayHomeworks.slice(0, TODAY_CAPACITY), [todayHomeworks]);
  const hiddenCount = Math.max(todayHomeworks.length - visibleTodayHomeworks.length, 0);
  const isTodayView = viewMode === "today";
  const currentItems = isTodayView ? visibleTodayHomeworks : recordHomeworks;
  const listTitle = isTodayView ? "今日作业" : "全部记录";
  const listMeta = isTodayView ? (hiddenCount > 0 ? `仅显示最近 10 条，剩余 ${hiddenCount} 条在记录中` : "按截止时间从近到远") : "按截止时间倒序";
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
          <FloatingTopbar currentTime={currentTime} dailyQuote={dailyQuote} />
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
