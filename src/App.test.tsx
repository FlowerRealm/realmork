import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import type { Homework } from "./lib/types";

vi.mock("./lib/api", () => ({
  createHomework: vi.fn(),
  deleteHomework: vi.fn(),
  listHomeworks: vi.fn(),
  submitHomework: vi.fn(),
  unsubmitHomework: vi.fn(),
  updateHomework: vi.fn()
}));

const api = await import("./lib/api");
const subjectCycle = ["语文", "数学", "英语", "物理", "化学", "生物"] as const;

function buildHomework(index: number, overrides: Partial<Homework> = {}): Homework {
  const hour = `${(index % 12) + 8}`.padStart(2, "0");
  return {
    id: `hw-${index}`,
    subject: subjectCycle[index % subjectCycle.length],
    content: `作业内容 ${index}`,
    dueAt: `2026-03-11T${hour}:00:00+08:00`,
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
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows floating date topbar while keeping main actions", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T09:15:00+08:00"));
    vi.mocked(api.listHomeworks).mockResolvedValue([]);

    await act(async () => {
      render(<App />);
    });

    expect(screen.getByText("3月12日 周四")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "今日" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "记录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增作业" })).toBeInTheDocument();
  });

  it("keeps glass layout containers for page and modal", async () => {
    vi.mocked(api.listHomeworks).mockResolvedValue([]);
    const user = userEvent.setup();

    const { container } = render(<App />);

    expect(container.querySelector(".page-header")).not.toBeNull();
    expect(container.querySelector(".floating-topbar")).not.toBeNull();
    expect(container.querySelector(".dashboard-layout")).not.toBeNull();
    expect(container.querySelector(".list-panel")).not.toBeNull();
    expect(container.querySelector(".summary-panel")).not.toBeNull();

    await user.click(await screen.findByRole("button", { name: "新增作业" }));

    expect(container.querySelector(".modal-backdrop")).not.toBeNull();
    expect(container.querySelector(".modal-card")).not.toBeNull();
  });

  it("shows summary metrics and caps recent pending items at three", async () => {
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

    vi.mocked(api.listHomeworks).mockImplementation(async (view) => {
      if (view === "today") {
        return [pendingHomework, submittedHomework, hiddenPendingHomework, urgentHomework, overdueHomework];
      }
      return [submittedHomework, urgentHomework, pendingHomework, overdueHomework, hiddenPendingHomework];
    });

    render(<App />);

    const summaryPanel = screen.getByLabelText("作业概览");

    await waitFor(() => {
      expect(within(summaryPanel).getByLabelText("今日总数 5")).toBeInTheDocument();
    });

    expect(within(summaryPanel).getByLabelText("待提交 4")).toBeInTheDocument();
    expect(within(summaryPanel).getByLabelText("需立即处理 2")).toBeInTheDocument();
    expect(within(summaryPanel).getByLabelText("记录总数 5")).toBeInTheDocument();
    expect(within(summaryPanel).getByText("补交实验")).toBeInTheDocument();
    expect(within(summaryPanel).getByText("先交作文")).toBeInTheDocument();
    expect(within(summaryPanel).getByText("数学卷")).toBeInTheDocument();
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

  it("limits today cards to 10 and shows overflow hint", async () => {
    vi.mocked(api.listHomeworks).mockImplementation(async (view) => {
      if (view === "today") {
        return Array.from({ length: 12 }, (_, index) => buildHomework(index + 1));
      }
      return [];
    });

    render(<App />);
    const listPanel = screen.getByText("今日作业").closest(".list-panel");

    await waitFor(() => {
      expect(listPanel).not.toBeNull();
      expect(within(listPanel as HTMLElement).getByText("仅显示最近 10 条，剩余 2 条在记录中")).toBeInTheDocument();
    });
    expect(screen.getAllByRole("button", { name: "提交" })).toHaveLength(10);
  });

  it("switches labels and action for urgent homework", async () => {
    vi.mocked(api.listHomeworks).mockImplementation(async (view) => {
      if (view === "today") {
        return [buildHomework(1, { needsSubmission: true })];
      }
      return [];
    });
    vi.mocked(api.submitHomework).mockResolvedValue(buildHomework(1, { submitted: true, submittedAt: "2026-03-11T09:00:00+08:00" }));

    render(<App />);

    expect(await screen.findByText("需要提交")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交" })).toBeInTheDocument();
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
      submittedAt: "2026-03-11T09:00:00+08:00",
      isToday: false
    });

    vi.mocked(api.listHomeworks).mockImplementation(async (view) => {
      if (view === "records") {
        return [submittedHomework];
      }
      return [];
    });
    vi.mocked(api.updateHomework).mockResolvedValue({
      ...submittedHomework,
      content: "改完之后",
      updatedAt: "2026-03-11T10:00:00+08:00"
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
  });

  it("requires choosing a supported subject when editing legacy homework", async () => {
    const legacyHomework = buildHomework(1, {
      subject: "历史",
      isToday: false
    });

    vi.mocked(api.listHomeworks).mockImplementation(async (view) => {
      if (view === "records") {
        return [legacyHomework];
      }
      return [];
    });
    vi.mocked(api.updateHomework).mockResolvedValue({
      ...legacyHomework,
      subject: "化学",
      updatedAt: "2026-03-11T10:00:00+08:00"
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
});
