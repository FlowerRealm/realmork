import { startTransition, useEffect, useEffectEvent, useMemo, useState } from "react";
import "./styles.css";
import { createHomework, deleteHomework, listHomeworks, submitHomework, unsubmitHomework, updateHomework } from "./lib/api";
import { getBackendState, retryBackendStart, subscribeBackendState, type BackendState } from "./lib/backend";
import { formatMonthDayWeekday } from "./lib/format";
import { removeHomework, sortRecordHomeworks, sortTodayHomeworks, upsertHomework, withDerivedHomeworkState } from "./lib/homework";
import type { Homework, HomeworkPayload, ViewMode } from "./lib/types";
import { HomeworkCard } from "./components/HomeworkCard";
import { HomeworkModal } from "./components/HomeworkModal";

const TODAY_CAPACITY = 10;
const FOCUS_REFRESH_THRESHOLD = 60_000;
const initialBackendState: BackendState = {
  status: "starting",
  apiBaseUrl: "",
  apiToken: "",
  error: ""
};

function LoadingState({ label }: { label: string }) {
  return (
    <div className="panel-state loading-state" role="status" aria-label={label} aria-live="polite" aria-busy="true">
      <div className="loading-mark" aria-hidden="true">
        <span className="loading-glow loading-glow-a"></span>
        <span className="loading-glow loading-glow-b"></span>
        <span className="loading-orbit loading-orbit-a"></span>
        <span className="loading-orbit loading-orbit-b"></span>
        <span className="loading-core"></span>
      </div>
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

function resolveBackendState(current: BackendState, next: BackendState): BackendState {
  if (next.status === "starting" && current.status !== "starting") {
    return current;
  }

  return next;
}

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>("today");
  const [records, setRecords] = useState<Homework[]>([]);
  const [backendState, setBackendState] = useState<BackendState>(initialBackendState);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHomework, setEditingHomework] = useState<Homework | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

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

    function applyBackendState(nextState: BackendState) {
      if (!subscribed) {
        return;
      }

      setBackendState((current) => resolveBackendState(current, nextState));
      if (nextState.status === "error") {
        setLoading(false);
        setRefreshing(false);
      }
    }

    const unsubscribe = subscribeBackendState((state) => {
      applyBackendState(state);
    });

    void getBackendState()
      .then((state) => {
        applyBackendState(state);
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
    const intervalID = window.setInterval(() => {
      startTransition(() => {
        setCurrentTime(new Date());
      });
    }, 60_000);

    return () => window.clearInterval(intervalID);
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

  const visibleTodayHomeworks = useMemo(
    () => sortedTodayHomeworks.slice(0, TODAY_CAPACITY),
    [sortedTodayHomeworks]
  );

  const hiddenCount = Math.max(sortedTodayHomeworks.length - visibleTodayHomeworks.length, 0);
  const isTodayView = viewMode === "today";
  const currentItems = isTodayView ? visibleTodayHomeworks : sortedRecordHomeworks;
  const listTitle = isTodayView ? "今日作业" : "全部记录";
  const listMetaBase = isTodayView
    ? hiddenCount > 0
      ? `仅显示最近 10 条，剩余 ${hiddenCount} 条在记录中`
      : "按截止时间从近到远"
    : "按截止时间倒序";
  const listMeta = refreshing ? `${listMetaBase} · 同步中...` : listMetaBase;
  const topbarDate = formatMonthDayWeekday(currentTime);

  const bannerMessage =
    backendState.status === "error" && hasLoadedRecords
      ? backendState.error
      : error && hasLoadedRecords
        ? error
        : "";
  const blockingLabel = backendState.status === "starting" ? "本地服务启动中" : "作业数据加载中";

  async function handleSave(payload: HomeworkPayload, existingId?: string) {
    setError("");

    const savedHomework = existingId ? await updateHomework(existingId, payload) : await createHomework(payload);
    applyRecordsMutation((current) => upsertHomework(current, savedHomework));
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

          {!hasLoadedRecords && (backendState.status === "error" || error) ? (
            <div className="panel-state error">
              <p>{backendState.status === "error" ? backendState.error : error}</p>
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
