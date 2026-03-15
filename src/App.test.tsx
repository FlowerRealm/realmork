import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import type { BackendState } from "./lib/backend";
import type { DailyQuote, Homework } from "./lib/types";

vi.mock("./lib/api", () => ({
  createHomework: vi.fn(),
  deleteHomework: vi.fn(),
  getDailyQuote: vi.fn(),
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
let clientHeightSpy: ReturnType<typeof vi.spyOn> | null = null;

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

function buildDailyQuote(overrides: Partial<DailyQuote> = {}): DailyQuote {
  return {
    text: "学而不思则罔，思而不学则殆。",
    author: "孔子",
    quoteDate: "2026-03-12",
    source: "online",
    ...overrides
  };
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
    createdAt: "2026-03-10T08:00:00+08:00",
    updatedAt: "2026-03-10T08:00:00+08:00",
    needsSubmission: false,
    isOverdue: false,
    isToday: true,
    ...overrides
  };
}

function getHomeworkCard(index = 0): HTMLElement {
  const cards = document.querySelectorAll<HTMLElement>(".homework-card");
  const card = cards.item(index);

  if (!card) {
    throw new Error(`missing homework card at index ${index}`);
  }

  return card;
}

async function openHomeworkMenu(card?: HTMLElement): Promise<HTMLElement> {
  const resolvedCard =
    card ??
    (await waitFor(() => {
      const nextCard = document.querySelector<HTMLElement>(".homework-card");
      expect(nextCard).not.toBeNull();
      return nextCard as HTMLElement;
    }));

  fireEvent.click(within(resolvedCard).getByRole("button", { name: /更多操作/ }));
  return within(resolvedCard).getByRole("menu");
}

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedBackend.__resetBackendState();
    vi.mocked(api.getDailyQuote).mockResolvedValue(buildDailyQuote());
    clientHeightSpy = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("list-items") ? 600 : 0;
    });
  });

  afterEach(() => {
    clientHeightSpy?.mockRestore();
    clientHeightSpy = null;
    vi.useRealTimers();
  });

  it("shows floating date and daily quote in the topbar while keeping main actions", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T09:15:00+08:00"));
    vi.mocked(api.listHomeworks).mockResolvedValue([]);

    render(<App />);
    await flushMicrotasks();

    expect(screen.getByText("3月12日 周四")).toBeInTheDocument();
    expect(screen.getByText("“学而不思则罔，思而不学则殆。”")).toBeInTheDocument();
    expect(screen.getByText("- 孔子")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "今日" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "记录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增作业" })).toBeInTheDocument();
    expect(api.listHomeworks).toHaveBeenCalledWith("records");
  });

  it("keeps the refreshed layout containers for page, summary and modal", async () => {
    vi.mocked(api.listHomeworks).mockResolvedValue([]);
    const user = userEvent.setup();

    const { container } = render(<App />);
    await flushMicrotasks();

    expect(container.querySelector(".page-header")).not.toBeNull();
    expect(container.querySelector(".page-header-inner")).not.toBeNull();
    expect(container.querySelector(".floating-topbar")).not.toBeNull();
    expect(container.querySelector(".dashboard-layout")).not.toBeNull();
    expect(container.querySelector(".list-panel")).not.toBeNull();
    expect(container.querySelector(".summary-panel")).not.toBeNull();
    expect(container.querySelector(".summary-metrics")).not.toBeNull();

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

  it("returns to the starting state while retrying from the blocking error state", async () => {
    const readyState: BackendState = {
      status: "ready",
      apiBaseUrl: "http://127.0.0.1:3017",
      apiToken: "test-token",
      error: ""
    };
    let resolveRetry: ((state: BackendState) => void) | null = null;

    mockedBackend.__setBackendState({
      status: "error",
      apiBaseUrl: "",
      apiToken: "",
      error: "backend start timeout"
    });
    vi.mocked(api.listHomeworks).mockResolvedValue([]);
    vi.mocked(backend.retryBackendStart).mockImplementationOnce(
      () =>
        new Promise<BackendState>((resolve) => {
          resolveRetry = resolve;
          mockedBackend.__setBackendState({
            status: "starting",
            apiBaseUrl: "",
            apiToken: "",
            error: ""
          });
        })
    );
    const user = userEvent.setup();

    render(<App />);
    const listPanel = screen.getByText("今日作业").closest(".list-panel");

    expect(listPanel).not.toBeNull();
    expect(await within(listPanel as HTMLElement).findByText("backend start timeout")).toBeInTheDocument();

    await user.click(within(listPanel as HTMLElement).getByRole("button", { name: "重试连接" }));

    expect(await screen.findByRole("status", { name: "本地服务启动中" })).toBeInTheDocument();
    expect(screen.queryByText("backend start timeout")).not.toBeInTheDocument();

    await act(async () => {
      mockedBackend.__setBackendState(readyState);
      resolveRetry?.(readyState);
      await Promise.resolve();
    });

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
    const listPanel = screen.getByText("今日作业").closest(".list-panel");

    expect(listPanel).not.toBeNull();
    expect(await within(listPanel as HTMLElement).findByText("初始内容")).toBeInTheDocument();

    await act(async () => {
      mockedBackend.__setBackendState({
        status: "error",
        apiBaseUrl: "",
        apiToken: "",
        error: "backend dropped"
      });
      await Promise.resolve();
    });

    expect(within(listPanel as HTMLElement).getByText("backend dropped")).toBeInTheDocument();

    await user.click(within(listPanel as HTMLElement).getByRole("button", { name: "重试连接" }));

    await waitFor(() => {
      expect(vi.mocked(backend.retryBackendStart)).toHaveBeenCalledTimes(1);
      expect(api.listHomeworks).toHaveBeenCalledTimes(2);
      expect(within(listPanel as HTMLElement).getByText("重试后的内容")).toBeInTheDocument();
    });
  });

  it("keeps main actions available while daily quote is still loading", async () => {
    vi.mocked(api.listHomeworks).mockResolvedValue([]);
    vi.mocked(api.getDailyQuote).mockImplementation(
      () =>
        new Promise(() => {
          // Keep the quote request pending to verify the rest of the page still works.
        })
    );

    render(<App />);

    const listPanel = await screen.findByText("今日作业");
    expect(within(listPanel.closest(".list-panel") as HTMLElement).getByText("按截止")).toBeInTheDocument();
    expect(screen.getByLabelText("当前日期与每日一言")).toBeInTheDocument();
    expect(screen.queryByText("“学而不思则罔，思而不学则殆。”")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "今日" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "记录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增作业" })).toBeInTheDocument();
  });

  it("keeps the page usable when daily quote loading fails", async () => {
    vi.mocked(api.listHomeworks).mockResolvedValue([]);
    vi.mocked(api.getDailyQuote).mockRejectedValue(new Error("quote failed"));
    const user = userEvent.setup();

    render(<App />);

    expect(await screen.findByLabelText("当前日期与每日一言")).toBeInTheDocument();
    expect(screen.queryByText("- 孔子")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "新增作业" }));
    expect(screen.getByRole("button", { name: "保存作业" })).toBeInTheDocument();
  });

  it("refreshes the daily quote after midnight without extra records polling", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T23:59:50+08:00"));
    vi.mocked(api.listHomeworks).mockResolvedValue([]);
    vi.mocked(api.getDailyQuote)
      .mockResolvedValueOnce(
        buildDailyQuote({
          text: "学而不思则罔，思而不学则殆。",
          quoteDate: "2026-03-12"
        })
      )
      .mockResolvedValueOnce(
        buildDailyQuote({
          text: "苟日新，日日新，又日新。",
          author: "《礼记》",
          quoteDate: "2026-03-13"
        })
      );

    render(<App />);
    await flushMicrotasks();

    expect(screen.getByText("“学而不思则罔，思而不学则殆。”")).toBeInTheDocument();
    expect(api.getDailyQuote).toHaveBeenCalledTimes(1);
    expect(api.listHomeworks).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-03-13T00:00:01+08:00"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });

    expect(screen.getByText("3月13日 周五")).toBeInTheDocument();
    expect(screen.getByText("“苟日新，日日新，又日新。”")).toBeInTheDocument();
    expect(screen.getByText("- 《礼记》")).toBeInTheDocument();
    expect(api.getDailyQuote).toHaveBeenCalledTimes(2);
    expect(api.listHomeworks).toHaveBeenCalledTimes(1);
  });

  it("retries loading the daily quote on the regular refresh interval after an initial failure", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T09:15:00+08:00"));
    vi.mocked(api.listHomeworks).mockResolvedValue([]);
    vi.mocked(api.getDailyQuote)
      .mockRejectedValueOnce(new Error("quote failed"))
      .mockResolvedValueOnce(
        buildDailyQuote({
          text: "千里之行，始于足下。",
          author: "老子"
        })
      );

    render(<App />);
    await flushMicrotasks();

    expect(api.getDailyQuote).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("“千里之行，始于足下。”")).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(api.getDailyQuote).toHaveBeenCalledTimes(2);
    expect(screen.getByText("“千里之行，始于足下。”")).toBeInTheDocument();
    expect(screen.getByText("- 老子")).toBeInTheDocument();
  });

  it("shows condensed summary info in a compact side panel", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T09:15:00+08:00"));
    const urgentHomework = buildHomework(1, {
      subject: "语文",
      content: "先交作文",
      dueAt: "2026-03-12T09:00:00+08:00",
      needsSubmission: true
    });
    const overdueHomework = buildHomework(2, {
      subject: "物理",
      content: "补交实验",
      dueAt: "2026-03-12T08:30:00+08:00",
      isOverdue: true
    });
    const pendingHomework = buildHomework(3, {
      subject: "数学",
      content: "数学卷",
      dueAt: "2026-03-12T10:00:00+08:00"
    });
    const hiddenPendingHomework = buildHomework(4, {
      subject: "英语",
      content: "英语背诵",
      dueAt: "2026-03-12T11:30:00+08:00"
    });
    const submittedHomework = buildHomework(5, {
      subject: "化学",
      content: "已完成实验",
      dueAt: "2026-03-12T12:30:00+08:00",
      submitted: true,
      submittedAt: "2026-03-12T12:00:00+08:00"
    });

    vi.mocked(api.listHomeworks).mockResolvedValue([
      pendingHomework,
      submittedHomework,
      hiddenPendingHomework,
      urgentHomework,
      overdueHomework
    ]);

    render(<App />);
    const summaryPanel = screen.getByLabelText("作业概览");
    await flushMicrotasks();

    expect(within(summaryPanel).getByLabelText("待提交 4")).toBeInTheDocument();
    expect(within(summaryPanel).getByLabelText("需立即处理 2")).toBeInTheDocument();
    expect(within(summaryPanel).getByText("当前 今日作业")).toBeInTheDocument();
    expect(within(summaryPanel).getByText("按截止")).toBeInTheDocument();
    expect(within(summaryPanel).getByText("待处理")).toBeInTheDocument();
    expect(within(summaryPanel).getByText("补交实验")).toBeInTheDocument();
    expect(within(summaryPanel).getByText("先交作文")).toBeInTheDocument();
    expect(within(summaryPanel).queryByText("数学卷")).not.toBeInTheDocument();
    expect(within(summaryPanel).queryByText("英语背诵")).not.toBeInTheDocument();
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

  it("defaults new homework to today's date while keeping hour and minute unset", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T09:15:00+08:00"));
    vi.mocked(api.listHomeworks).mockResolvedValue([]);

    render(<App />);
    await flushMicrotasks();

    fireEvent.click(screen.getByRole("button", { name: "新增作业" }));

    expect(screen.getByLabelText("提交日期")).toHaveValue("2026-03-12");
    expect(screen.getByLabelText("提交小时")).toHaveValue("");
    expect(screen.getByLabelText("提交分钟")).toHaveValue("");
  });

  it("creates homework after choosing hour and minute manually", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T09:15:00+08:00"));
    vi.mocked(api.listHomeworks).mockResolvedValue([]);
    vi.mocked(api.createHomework).mockResolvedValue(buildHomework(7, {
      subject: "数学",
      content: "完成口算题",
      dueAt: "2026-03-12T18:35:00+08:00"
    }));

    render(<App />);
    await flushMicrotasks();

    fireEvent.click(screen.getByRole("button", { name: "新增作业" }));
    fireEvent.change(screen.getByRole("combobox", { name: "学科" }), { target: { value: "数学" } });
    fireEvent.change(screen.getByRole("textbox", { name: /作业内容/i }), { target: { value: "完成口算题" } });
    fireEvent.change(screen.getByLabelText("提交小时"), { target: { value: "18" } });
    fireEvent.change(screen.getByLabelText("提交分钟"), { target: { value: "35" } });
    fireEvent.click(screen.getByRole("button", { name: "保存作业" }));
    await flushMicrotasks();

    expect(api.createHomework).toHaveBeenCalledWith({
      subject: "数学",
      content: "完成口算题",
      dueAt: "2026-03-12T18:35:00+08:00"
    });
  });

  it("sizes today homework rows from viewport height without hiding extra items", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T09:15:00+08:00"));
    vi.mocked(api.listHomeworks).mockResolvedValue(Array.from({ length: 12 }, (_, index) => buildHomework(index + 1)));

    const { container } = render(<App />);
    await flushMicrotasks();
    const listPanel = container.querySelector(".list-panel");
    const listContent = container.querySelector(".list-items-content");
    const firstCard = container.querySelector(".homework-card");

    expect(listPanel).not.toBeNull();
    expect(listContent).toHaveAttribute("data-list-layout", "row");
    expect((listContent as HTMLElement).style.getPropertyValue("--row-height")).toBe("44px");
    expect((listContent as HTMLElement).style.getPropertyValue("--row-gap")).toBe("6px");
    expect(firstCard).toHaveClass("row-layout");
    expect(firstCard?.querySelector(".item-bottom")).toBeNull();
    expect(within(listPanel as HTMLElement).queryByText("+2")).not.toBeInTheDocument();
    expect(within(listPanel as HTMLElement).getAllByRole("button", { name: /更多操作/ })).toHaveLength(12);
  });

  it("caps row height so a single homework does not grow too much", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T09:15:00+08:00"));
    vi.mocked(api.listHomeworks).mockResolvedValue([buildHomework(1)]);

    const { container } = render(<App />);
    await flushMicrotasks();

    const listContent = container.querySelector(".list-items-content");

    expect(listContent).toHaveAttribute("data-list-layout", "row");
    expect((listContent as HTMLElement).style.getPropertyValue("--row-height")).toBe("96px");
  });

  it("highlights urgent homework across the card and summary item", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T09:15:00+08:00"));
    vi.mocked(api.listHomeworks).mockResolvedValue([buildHomework(1, { dueAt: "2026-03-12T08:00:00+08:00" })]);
    vi.mocked(api.submitHomework).mockResolvedValue(buildHomework(1, { submitted: true, submittedAt: "2026-03-12T09:00:00+08:00" }));
    const user = userEvent.setup();

    const { container } = render(<App />);
    await flushMicrotasks();

    const listPanel = container.querySelector(".list-panel");
    const summaryPanel = container.querySelector(".summary-panel");

    expect(listPanel).not.toBeNull();
    expect(summaryPanel).not.toBeNull();

    const urgentCard = container.querySelector(".homework-card");
    const urgentMenu = await openHomeworkMenu(urgentCard as HTMLElement);
    const urgentBadge = within(urgentMenu).getByText("要交");
    const summaryBadge = within(summaryPanel as HTMLElement).getByText("要交");
    const summaryItem = within(summaryPanel as HTMLElement).getByText("作业内容 1").closest(".summary-item");

    expect(urgentBadge).toHaveClass("status-badge", "attention");
    expect(urgentCard).toHaveClass("homework-card", "attention");
    expect(summaryBadge).toHaveClass("summary-pill", "attention");
    expect(summaryItem).toHaveClass("summary-item", "attention");
    expect(within(urgentMenu).getByRole("menuitem", { name: "提交" })).toBeInTheDocument();
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

    await user.click(await screen.findByRole("button", { name: "记录" }));
    await user.click(within(await openHomeworkMenu()).getByRole("menuitem", { name: "提交" }));

    await waitFor(() => {
      expect(api.submitHomework).toHaveBeenCalledWith(homework.id);
    });
    expect(api.listHomeworks).toHaveBeenCalledTimes(1);

    const doneCard = getHomeworkCard();
    const doneMenu = await openHomeworkMenu(doneCard);
    const doneBadge = within(doneMenu).getByText("已交");

    expect(doneBadge).toHaveClass("status-badge", "done");
    expect(doneCard).toHaveClass("homework-card");
    expect(doneCard).not.toHaveClass("attention");
    expect(within(doneMenu).getByRole("menuitem", { name: "撤回" })).toBeInTheDocument();
  });

  it("shows single-line empty states", async () => {
    vi.mocked(api.listHomeworks).mockResolvedValue([]);
    const user = userEvent.setup();

    render(<App />);

    expect(await screen.findByText("今日无作业")).toBeInTheDocument();
    expect(screen.queryByText("当前没有今日或逾期作业。")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "记录" }));

    expect(screen.getByText("暂无记录")).toBeInTheDocument();
    expect(screen.queryByText("新增一条作业后会自动保存在本机。")).not.toBeInTheDocument();
  });

  it("confirms before deleting homework", async () => {
    const homework = buildHomework(1);
    vi.mocked(api.listHomeworks).mockResolvedValue([homework]);
    vi.mocked(api.deleteHomework).mockResolvedValue(undefined);

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<App />);

    await user.click(within(await openHomeworkMenu()).getByRole("menuitem", { name: "删除" }));

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

    await user.click(within(await openHomeworkMenu()).getByRole("menuitem", { name: "删除" }));

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
    await user.click(within(await openHomeworkMenu()).getByRole("menuitem", { name: "编辑" }));

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
    await user.click(within(await openHomeworkMenu()).getByRole("menuitem", { name: "编辑" }));

    const select = screen.getByRole("combobox", { name: "学科" });
    expect(select).toHaveValue("");
    expect(screen.getByLabelText("提交日期")).toHaveValue("2026-03-12");
    expect(screen.getByLabelText("提交小时")).toHaveValue("13");
    expect(screen.getByLabelText("提交分钟")).toHaveValue("00");

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
