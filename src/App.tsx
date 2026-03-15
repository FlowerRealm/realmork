import { startTransition, useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties } from "react";
import "./styles.css";
import { createHomework, deleteHomework, getDailyQuote, listHomeworks, submitHomework, unsubmitHomework, updateHomework } from "./lib/api";
import { getBackendState, retryBackendStart, subscribeBackendState, type BackendState } from "./lib/backend";
import { formatDateTime, millisecondsUntilNextBeijingMidnight } from "./lib/format";
import {
  HOMEWORK_ROW_GAP_PX,
  HOMEWORK_ROW_HEIGHT_MAX_PX,
  getHomeworkRowHeight,
  getHomeworkTone,
  removeHomework,
  sortRecordHomeworks,
  sortTodayHomeworks,
  upsertHomework,
  withDerivedHomeworkState
} from "./lib/homework";
import type { DailyQuote, Homework, HomeworkPayload, ViewMode } from "./lib/types";
import { FloatingTopbar } from "./components/FloatingTopbar";
import { HomeworkCard } from "./components/HomeworkCard";
import { HomeworkModal } from "./components/HomeworkModal";

const SUMMARY_ITEM_LIMIT = 2;
const FOCUS_REFRESH_THRESHOLD = 60_000;
const REFRESH_INTERVAL_MS = 30_000;
const initialBackendState: BackendState = {
  status: "starting",
  apiBaseUrl: "",
  apiToken: "",
  error: ""
};

function LoadingState({ label }: { label: string }) {
  return (
    <div className="panel-state loading-state" role="status" aria-label={label} aria-live="polite" aria-busy="true">
      <div className="warm-loader" aria-hidden="true">
        <span className="warm-loader-aura warm-loader-aura-primary"></span>
        <span className="warm-loader-aura warm-loader-aura-secondary"></span>
        <div className="warm-loader-stack">
          <span className="warm-loader-sheet warm-loader-sheet-back"></span>
          <span className="warm-loader-sheet warm-loader-sheet-middle"></span>
          <div className="warm-loader-sheet warm-loader-sheet-front">
            <span className="warm-loader-seal"></span>
            <span className="warm-loader-line warm-loader-line-title"></span>
            <span className="warm-loader-line warm-loader-line-meta"></span>
            <span className="warm-loader-progress">
              <span className="warm-loader-progress-bar"></span>
            </span>
          </div>
        </div>
      </div>
      <p className="loading-caption">{label}</p>
    </div>
  );
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

type RefreshRecordsOptions = {
  blocking?: boolean;
  backendState?: BackendState;
};

type BackendStateSource = "snapshot" | "subscription";

function resolveBackendState(current: BackendState, next: BackendState, source: BackendStateSource): BackendState {
  if (source === "snapshot" && next.status === "starting" && current.status !== "starting") {
    return current;
  }

  return next;
}

function getHomeworkFocusLabel(homework: Homework): string {
  if (homework.needsSubmission) {
    return "要交";
  }

  if (homework.isOverdue) {
    return "逾期";
  }

  return "待办";
}

function millisecondsUntilNextMinute(now: Date): number {
  const nextMinute = new Date(now);
  nextMinute.setSeconds(60, 0);
  return Math.max(nextMinute.getTime() - now.getTime(), 250);
}

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>("today");
  const [records, setRecords] = useState<Homework[]>([]);
  const [backendState, setBackendState] = useState<BackendState>(initialBackendState);
  const [dailyQuote, setDailyQuote] = useState<DailyQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHomework, setEditingHomework] = useState<Homework | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [rowHeight, setRowHeight] = useState(HOMEWORK_ROW_HEIGHT_MAX_PX);
  const listViewportRef = useRef<HTMLDivElement | null>(null);

  const hasLoadedRecords = lastSyncedAt !== null;

  const applyRecordsMutation = useEffectEvent((updater: (items: Homework[]) => Homework[]) => {
    startTransition(() => {
      setRecords((current) => updater(current));
      setLastSyncedAt(Date.now());
    });
  });

  const refreshRecords = useEffectEvent(async (options?: RefreshRecordsOptions) => {
    const resolvedBackendState = options?.backendState ?? backendState;
    if (resolvedBackendState.status !== "ready") {
      return;
    }

    const blocking = options?.blocking ?? !hasLoadedRecords;
    if (blocking) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setError("");

    try {
      const nextRecords = await listHomeworks("records");
      startTransition(() => {
        setRecords(nextRecords);
        setLastSyncedAt(Date.now());
      });
    } catch (loadError) {
      setError(toErrorMessage(loadError, "加载失败"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  });

  const refreshOnFocus = useEffectEvent(() => {
    if (backendState.status !== "ready" || !hasLoadedRecords || loading || refreshing || lastSyncedAt === null) {
      return;
    }

    if (Date.now() - lastSyncedAt < FOCUS_REFRESH_THRESHOLD) {
      return;
    }

    void refreshRecords({ blocking: false });
  });

  useEffect(() => {
    let subscribed = true;

    function applyBackendState(nextState: BackendState, source: BackendStateSource) {
      if (!subscribed) {
        return;
      }

      setBackendState((current) => resolveBackendState(current, nextState, source));
      if (nextState.status === "error") {
        setLoading(false);
        setRefreshing(false);
      }
    }

    const unsubscribe = subscribeBackendState((state) => {
      applyBackendState(state, "subscription");
    });

    void getBackendState()
      .then((state) => {
        applyBackendState(state, "snapshot");
      })
      .catch((backendError) => {
        if (!subscribed) {
          return;
        }

        setBackendState({
          ...initialBackendState,
          status: "error",
          error: toErrorMessage(backendError, "本地服务不可用")
        });
        setLoading(false);
      });

    return () => {
      subscribed = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (backendState.status !== "ready" || hasLoadedRecords) {
      return;
    }

    void refreshRecords({ blocking: true });
  }, [backendState.status, hasLoadedRecords]);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;

    function scheduleClockTick() {
      timer = window.setTimeout(() => {
        startTransition(() => {
          setCurrentTime(new Date());
        });
        if (!cancelled) {
          scheduleClockTick();
        }
      }, millisecondsUntilNextMinute(new Date()));
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
      midnightTimer = window.setTimeout(() => {
        void loadQuoteWithRetry().finally(() => {
          if (!cancelled) {
            scheduleNextRefresh();
          }
        });
      }, millisecondsUntilNextBeijingMidnight(new Date()));
    }

    void loadQuoteWithRetry();
    scheduleNextRefresh();

    return () => {
      cancelled = true;
      clearRetryTimer();
      window.clearTimeout(midnightTimer);
    };
  }, []);

  useEffect(() => {
    const handleFocus = () => {
      refreshOnFocus();
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  const decoratedRecords = useMemo(
    () => records.map((homework) => withDerivedHomeworkState(homework, currentTime)),
    [records, currentTime]
  );

  const sortedRecordHomeworks = useMemo(() => sortRecordHomeworks(decoratedRecords), [decoratedRecords]);
  const sortedTodayHomeworks = useMemo(
    () => sortTodayHomeworks(decoratedRecords.filter((homework) => homework.isToday || homework.isOverdue)),
    [decoratedRecords]
  );

  const isTodayView = viewMode === "today";
  const currentItems = isTodayView ? sortedTodayHomeworks : sortedRecordHomeworks;
  const listTitle = isTodayView ? "今日作业" : "全部记录";
  const listMetaBase = isTodayView ? "按截止" : "最新在前";
  const listMeta = refreshing ? "同步中" : listMetaBase;
  const todayPendingCount = sortedTodayHomeworks.filter((homework) => !homework.submitted).length;
  const attentionCount = sortedTodayHomeworks.filter(
    (homework) => !homework.submitted && (homework.needsSubmission || homework.isOverdue)
  ).length;
  const summaryStats = [
    { label: "待交", ariaLabel: "待提交", value: todayPendingCount },
    { label: "紧急", ariaLabel: "需立即处理", value: attentionCount, tone: attentionCount > 0 ? "attention" : "default" }
  ];
  const recentPendingHomeworks = useMemo(
    () => sortedTodayHomeworks.filter((homework) => !homework.submitted).slice(0, SUMMARY_ITEM_LIMIT),
    [sortedTodayHomeworks]
  );
  const summaryMeta = `当前 ${listTitle}`;

  const bannerMessage =
    backendState.status === "error" && hasLoadedRecords
      ? backendState.error
      : error && hasLoadedRecords
        ? error
        : "";
  const blockingLabel = backendState.status === "starting" ? "本地服务启动中" : "作业数据加载中";
  const blockingErrorMessage = backendState.status === "error" ? backendState.error : error;
  const listContentStyle = useMemo(
    () =>
      ({
        "--row-height": `${rowHeight}px`,
        "--row-gap": `${HOMEWORK_ROW_GAP_PX}px`
      }) as CSSProperties,
    [rowHeight]
  );

  useEffect(() => {
    const viewport = listViewportRef.current;
    if (!viewport) {
      setRowHeight(HOMEWORK_ROW_HEIGHT_MAX_PX);
      return;
    }

    let frame = 0;
    const updateRowHeight = () => {
      frame = 0;
      const nextRowHeight = getHomeworkRowHeight(
        viewport.clientHeight,
        currentItems.length,
        HOMEWORK_ROW_HEIGHT_MAX_PX,
        HOMEWORK_ROW_GAP_PX
      );
      setRowHeight((current) => (current === nextRowHeight ? current : nextRowHeight));
    };

    updateRowHeight();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }

      frame = window.requestAnimationFrame(updateRowHeight);
    });

    observer.observe(viewport);

    return () => {
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }

      observer.disconnect();
    };
  }, [currentItems.length, bannerMessage, blockingErrorMessage, hasLoadedRecords]);

  async function handleSave(payload: HomeworkPayload, existingId?: string) {
    setError("");

    try {
      const savedHomework = existingId ? await updateHomework(existingId, payload) : await createHomework(payload);
      applyRecordsMutation((current) => upsertHomework(current, savedHomework));
    } catch (saveError) {
      const message = toErrorMessage(saveError, "保存失败");
      setError(message);
      throw new Error(message);
    }
  }

  async function handleToggleSubmitted(homework: Homework) {
    setError("");

    try {
      const updatedHomework = homework.submitted ? await unsubmitHomework(homework.id) : await submitHomework(homework.id);
      applyRecordsMutation((current) => upsertHomework(current, updatedHomework));
    } catch (submitError) {
      setError(toErrorMessage(submitError, "操作失败"));
    }
  }

  async function handleDelete(homework: Homework) {
    const confirmed = window.confirm(`确认删除“${homework.subject}”作业？删除后无法恢复。`);
    if (!confirmed) {
      return;
    }

    setError("");
    try {
      await deleteHomework(homework.id);
      applyRecordsMutation((current) => removeHomework(current, homework.id));
    } catch (deleteError) {
      setError(toErrorMessage(deleteError, "删除失败"));
    }
  }

  async function handleRetryConnection() {
    setError("");
    if (!hasLoadedRecords) {
      setLoading(true);
    }

    try {
      const nextBackendState = await retryBackendStart();
      setBackendState(nextBackendState);
      await refreshRecords({
        blocking: !hasLoadedRecords,
        backendState: nextBackendState
      });
    } catch (retryError) {
      setError(toErrorMessage(retryError, "重试失败"));
      setLoading(false);
      setRefreshing(false);
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

            {bannerMessage ? (
              <div className="sync-banner error" role="status">
                <p>{bannerMessage}</p>
                <button
                  className="ghost-button compact"
                  type="button"
                  onClick={() => {
                    if (backendState.status === "error") {
                      void handleRetryConnection();
                      return;
                    }

                    void refreshRecords({ blocking: false });
                  }}
                >
                  {backendState.status === "error" ? "重试连接" : "重新加载"}
                </button>
              </div>
            ) : null}

            {!hasLoadedRecords && blockingErrorMessage ? (
              <div className="panel-state error">
                <p>{blockingErrorMessage}</p>
                <button
                  className="ghost-button compact"
                  type="button"
                  onClick={() => {
                    if (backendState.status === "error") {
                      void handleRetryConnection();
                      return;
                    }

                    void refreshRecords({ blocking: true });
                  }}
                >
                  {backendState.status === "error" ? "重试连接" : "重新加载"}
                </button>
              </div>
            ) : !hasLoadedRecords ? (
              <LoadingState label={blockingLabel} />
            ) : (
              <div ref={listViewportRef} className="list-items">
                {currentItems.length === 0 ? (
                  <article className="empty-card">
                    <h3>{isTodayView ? "今日无作业" : "暂无记录"}</h3>
                  </article>
                ) : (
                  <div
                    className={`list-items-content ${isTodayView ? "today-items" : "records-items"}`}
                    data-list-layout="row"
                    style={listContentStyle}
                  >
                    {currentItems.map((homework) => (
                      <HomeworkCard
                        key={homework.id}
                        homework={homework}
                        fullDate={!isTodayView}
                        onEdit={openEditModal}
                        onDelete={handleDelete}
                        onToggleSubmitted={handleToggleSubmitted}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <aside className="summary-panel" aria-label="作业概览">
            <div className="summary-intro">
              <h2 className="summary-title">概览</h2>
              <p className="summary-note">
                <span>{summaryMeta}</span>
                <span>{listMeta}</span>
              </p>
            </div>

            {!hasLoadedRecords && blockingErrorMessage ? (
              <div className="summary-state error">
                <p>{blockingErrorMessage}</p>
                <button className="ghost-button compact" type="button" onClick={() => void handleRetryConnection()}>
                  重试连接
                </button>
              </div>
            ) : !hasLoadedRecords ? (
              <div className="summary-state">
                <p>{blockingLabel}</p>
              </div>
            ) : (
              <>
                <div className="summary-metrics">
                  {summaryStats.map((stat) => (
                    <article
                      key={stat.label}
                      className={stat.tone === "attention" ? "summary-stat attention" : "summary-stat"}
                      aria-label={`${stat.ariaLabel} ${stat.value}`}
                    >
                      <span className="summary-stat-label">{stat.label}</span>
                      <strong className="summary-stat-value">{stat.value}</strong>
                    </article>
                  ))}
                </div>

                <section className="summary-section" aria-label="最近待处理">
                  <div className="summary-section-head">
                    <span>待处理</span>
                    <span>{recentPendingHomeworks.length} 条</span>
                  </div>

                  {recentPendingHomeworks.length === 0 ? (
                    <div className="summary-empty">
                      <p>今天没有待处理项。</p>
                    </div>
                  ) : (
                    <div className="summary-list">
                      {recentPendingHomeworks.map((homework) => {
                        const tone = getHomeworkTone(homework);

                        return (
                          <article key={homework.id} className={tone === "attention" ? "summary-item attention" : "summary-item"}>
                            <div className="summary-item-top">
                              <span className="summary-item-subject">{homework.subject}</span>
                              <span className={tone === "attention" ? "summary-pill attention" : "summary-pill"}>
                                {getHomeworkFocusLabel(homework)}
                              </span>
                            </div>
                            <p className="summary-item-content">{homework.content}</p>
                            <time className="summary-item-date" dateTime={homework.dueAt}>
                              截止 {formatDateTime(homework.dueAt)}
                            </time>
                          </article>
                        );
                      })}
                    </div>
                  )}
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
