import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import type { BackendState } from "./lib/backend";
import type { Homework } from "./lib/types";

vi.mock("./lib/api", () => ({
  createHomework: vi.fn(),
  deleteHomework: vi.fn(),
  listHomeworks: vi.fn(),
  submitHomework: vi.fn(),
  unsubmitHomework: vi.fn(),
  updateHomework: vi.fn()
}));

vi.mock("./lib/backend", () => {
  const listeners = new Set<(state: BackendState) => void>();
  const readyState: BackendState = {
    status: "ready",
    apiBaseUrl: "http://127.0.0.1:3017",
    apiToken: "test-token",
    error: ""
  };

  let currentState: BackendState = readyState;

  const cloneState = (): BackendState => ({ ...currentState });
  const notify = () => {
    const nextState = cloneState();
    for (const listener of listeners) {
      listener(nextState);
    }
  };

  return {
    getBackendState: vi.fn(async () => cloneState()),
    waitForBackend: vi.fn(async () => {
      if (currentState.status !== "ready") {
        throw new Error(currentState.error || "backend unavailable");
      }
      return cloneState();
    }),
    retryBackendStart: vi.fn(async () => {
      currentState = readyState;
      notify();
      return cloneState();
    }),
    subscribeBackendState: vi.fn((listener: (state: BackendState) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }),
    __setBackendState(nextState: Partial<BackendState>) {
      currentState = {
        ...currentState,
        ...nextState
      };
      notify();
    },
    __resetBackendState() {
      currentState = readyState;
      listeners.clear();
    }
  };
});

const api = await import("./lib/api");
const backend = await import("./lib/backend");

type MockedBackend = typeof backend & {
  __setBackendState: (state: Partial<BackendState>) => void;
  __resetBackendState: () => void;
};

const mockedBackend = backend as MockedBackend;
const subjectCycle = ["语文", "数学", "英语", "物理", "化学", "生物"] as const;

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

function buildHomework(index: number, overrides: Partial<Homework> = {}): Homework {
  const hour = `${(index % 6) + 12}`.padStart(2, "0");
  return {
    id: `hw-${index}`,
    subject: subjectCycle[index % subjectCycle.length],
    content: `作业内容 ${index}`,
    dueAt: `2026-03-12T${hour}:00:00+08:00`,
    submitted: false,
    submittedAt: null,
    createdAt: `2026-03-10T08:00:00+08:00`,
    updatedAt: `2026-03-10T08:00:00+08:00`,
    needsSubmission: false,
    isOverdue: false,
    isToday: true,
    ...overrides
  };
}

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedBackend.__resetBackendState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows floating date topbar while keeping main actions", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T09:15:00+08:00"));
    vi.mocked(api.listHomeworks).mockResolvedValue([]);

    render(<App />);
    await flushMicrotasks();

    expect(screen.getByText("3月12日 周四")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "今日" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "记录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增作业" })).toBeInTheDocument();
    expect(api.listHomeworks).toHaveBeenCalledWith("records");
  });

  it("keeps glass layout containers for page and modal", async () => {
    vi.mocked(api.listHomeworks).mockResolvedValue([]);
    const user = userEvent.setup();

    const { container } = render(<App />);

    expect(container.querySelector(".floating-topbar")).not.toBeNull();
    expect(container.querySelector(".list-panel")).not.toBeNull();

    await user.click(await screen.findByRole("button", { name: "新增作业" }));

    expect(container.querySelector(".modal-backdrop")).not.toBeNull();
    expect(container.querySelector(".modal-card")).not.toBeNull();
  });

  it("shows backend loading state before records can load", async () => {
    mockedBackend.__setBackendState({
      status: "starting",
      apiBaseUrl: "",
      apiToken: "",
      error: ""
    });
    vi.mocked(api.listHomeworks).mockResolvedValue([]);

    render(<App />);
    await flushMicrotasks();

    expect(screen.getByRole("status", { name: "本地服务启动中" })).toBeInTheDocument();
    expect(api.listHomeworks).not.toHaveBeenCalled();

    await act(async () => {
      mockedBackend.__setBackendState({
        status: "ready",
        apiBaseUrl: "http://127.0.0.1:3017",
        apiToken: "test-token",
        error: ""
      });
      await Promise.resolve();
    });

    expect(api.listHomeworks).toHaveBeenCalledWith("records");
  });

  it("does not miss a ready event between initial snapshot and subscription", async () => {
    const readyState: BackendState = {
      status: "ready",
      apiBaseUrl: "http://127.0.0.1:3017",
      apiToken: "test-token",
      error: ""
    };

    mockedBackend.__setBackendState({
      status: "starting",
      apiBaseUrl: "",
      apiToken: "",
      error: ""
    });
    vi.mocked(api.listHomeworks).mockResolvedValue([]);
    vi.mocked(backend.getBackendState).mockImplementationOnce(async () => {
      mockedBackend.__setBackendState(readyState);
      return {
        status: "starting",
        apiBaseUrl: "",
        apiToken: "",
        error: ""
      };
    });

    render(<App />);

    await waitFor(() => {
      expect(api.listHomeworks).toHaveBeenCalledWith("records");
    });
  });

  it("retries backend startup from the blocking error state", async () => {
    mockedBackend.__setBackendState({
      status: "error",
      apiBaseUrl: "",
      apiToken: "",
      error: "backend start timeout"
    });
    vi.mocked(api.listHomeworks).mockResolvedValue([]);
    const user = userEvent.setup();

    render(<App />);

    expect(await screen.findByText("backend start timeout")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重试连接" }));

    await waitFor(() => {
      expect(vi.mocked(backend.retryBackendStart)).toHaveBeenCalledTimes(1);
      expect(api.listHomeworks).toHaveBeenCalledWith("records");
    });
  });

  it("refreshes records after retrying a dropped backend with cached data", async () => {
    const initialHomework = buildHomework(1, { content: "初始内容" });
    const refreshedHomework = buildHomework(2, { content: "重试后的内容" });
    vi.mocked(api.listHomeworks).mockResolvedValueOnce([initialHomework]).mockResolvedValueOnce([refreshedHomework]);
    const user = userEvent.setup();

    render(<App />);

    expect(await screen.findByText("初始内容")).toBeInTheDocument();

    await act(async () => {
      mockedBackend.__setBackendState({
        status: "error",
        apiBaseUrl: "",
        apiToken: "",
        error: "backend dropped"
      });
      await Promise.resolve();
    });

    expect(screen.getByText("backend dropped")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重试连接" }));

    await waitFor(() => {
      expect(vi.mocked(backend.retryBackendStart)).toHaveBeenCalledTimes(1);
      expect(api.listHomeworks).toHaveBeenCalledTimes(2);
      expect(screen.getByText("重试后的内容")).toBeInTheDocument();
    });
  });

  it("limits homework subjects to supported choices in the modal", async () => {
    vi.mocked(api.listHomeworks).mockResolvedValue([]);
    const user = userEvent.setup();

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "新增作业" }));

    const select = screen.getByRole("combobox", { name: "学科" });
    const options = within(select)
      .getAllByRole("option")
      .map((option) => option.textContent);

    expect(options).toEqual(["请选择学科", "语文", "数学", "英语", "物理", "化学", "生物"]);
  });

  it("limits today cards to 10 and shows overflow hint", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T09:15:00+08:00"));
    vi.mocked(api.listHomeworks).mockResolvedValue(Array.from({ length: 12 }, (_, index) => buildHomework(index + 1)));

    render(<App />);
    await flushMicrotasks();

    expect(screen.getByText("仅显示最近 10 条，剩余 2 条在记录中")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "提交" })).toHaveLength(10);
  });

  it("switches labels and action for urgent homework", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T09:15:00+08:00"));
    vi.mocked(api.listHomeworks).mockResolvedValue([buildHomework(1, { dueAt: "2026-03-12T08:00:00+08:00" })]);
    vi.mocked(api.submitHomework).mockResolvedValue(buildHomework(1, { submitted: true, submittedAt: "2026-03-12T09:00:00+08:00" }));

    render(<App />);
    await flushMicrotasks();

    expect(screen.getByText("需要提交")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交" })).toBeInTheDocument();
  });

  it("updates submitted state without reloading the full records list", async () => {
    const homework = buildHomework(1);
    vi.mocked(api.listHomeworks).mockResolvedValue([homework]);
    vi.mocked(api.submitHomework).mockResolvedValue({
      ...homework,
      submitted: true,
      submittedAt: "2026-03-12T10:00:00+08:00"
    });
    const user = userEvent.setup();

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "提交" }));

    await waitFor(() => {
      expect(api.submitHomework).toHaveBeenCalledWith(homework.id);
    });
    expect(api.listHomeworks).toHaveBeenCalledTimes(1);
    expect(screen.getByText("已提交")).toBeInTheDocument();
  });

  it("confirms before deleting homework", async () => {
    const homework = buildHomework(1);
    vi.mocked(api.listHomeworks).mockResolvedValue([homework]);
    vi.mocked(api.deleteHomework).mockResolvedValue(undefined);

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "删除" }));

    expect(confirmSpy).toHaveBeenCalledWith(`确认删除“${homework.subject}”作业？删除后无法恢复。`);
    await waitFor(() => {
      expect(api.deleteHomework).toHaveBeenCalledWith(homework.id);
    });
    expect(api.listHomeworks).toHaveBeenCalledTimes(1);

    confirmSpy.mockRestore();
  });

  it("does not delete homework when confirmation is cancelled", async () => {
    vi.mocked(api.listHomeworks).mockResolvedValue([buildHomework(1)]);
    vi.mocked(api.deleteHomework).mockResolvedValue(undefined);

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "删除" }));

    expect(api.deleteHomework).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("keeps submitted state after editing a submitted homework", async () => {
    const submittedHomework = buildHomework(1, {
      submitted: true,
      submittedAt: "2026-03-12T09:00:00+08:00"
    });

    vi.mocked(api.listHomeworks).mockResolvedValue([submittedHomework]);
    vi.mocked(api.updateHomework).mockResolvedValue({
      ...submittedHomework,
      content: "改完之后",
      updatedAt: "2026-03-12T10:00:00+08:00"
    });

    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "记录" }));
    await user.click(await screen.findByRole("button", { name: "编辑" }));

    const textbox = screen.getByRole("textbox", { name: /作业内容/i });
    await user.clear(textbox);
    await user.type(textbox, "改完之后");
    await user.click(screen.getByRole("button", { name: "保存作业" }));

    await waitFor(() => {
      expect(api.updateHomework).toHaveBeenCalled();
    });
    expect(api.listHomeworks).toHaveBeenCalledTimes(1);
  });

  it("requires choosing a supported subject when editing legacy homework", async () => {
    const legacyHomework = buildHomework(1, {
      subject: "历史"
    });

    vi.mocked(api.listHomeworks).mockResolvedValue([legacyHomework]);
    vi.mocked(api.updateHomework).mockResolvedValue({
      ...legacyHomework,
      subject: "化学",
      updatedAt: "2026-03-12T10:00:00+08:00"
    });

    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "记录" }));
    await user.click(await screen.findByRole("button", { name: "编辑" }));

    const select = screen.getByRole("combobox", { name: "学科" });
    expect(select).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "保存作业" }));

    expect(await screen.findByText("请把学科、内容和提交时间填完整。")).toBeInTheDocument();
    expect(api.updateHomework).not.toHaveBeenCalled();

    await user.selectOptions(select, "化学");
    await user.click(screen.getByRole("button", { name: "保存作业" }));

    await waitFor(() => {
      expect(api.updateHomework).toHaveBeenCalledWith(
        legacyHomework.id,
        expect.objectContaining({
          subject: "化学"
        })
      );
    });
  });

  it("refreshes records when the window regains focus after one minute", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T09:15:00+08:00"));
    vi.mocked(api.listHomeworks).mockResolvedValue([buildHomework(1)]);

    render(<App />);
    await flushMicrotasks();

    expect(api.listHomeworks).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(61_000);
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });

    expect(api.listHomeworks).toHaveBeenCalledTimes(2);
  });
});
