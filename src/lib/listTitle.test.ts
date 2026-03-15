import { getHomeworkListHeadline, getRecordHomeworkHeadline, getTodayHomeworkHeadline } from "./listTitle";

describe("listTitle", () => {
  it("uses unsubmitted homework counts in today headlines", () => {
    expect(getTodayHomeworkHeadline(4)).toContain("4 份未交作业");
    expect(getTodayHomeworkHeadline(5)).toContain("5 份未交作业");
  });

  it("falls back to a generic unsubmitted headline for large counts", () => {
    expect(getTodayHomeworkHeadline(32)).toContain("32 份未交作业");
  });

  it("uses total record counts in record headlines", () => {
    expect(getRecordHomeworkHeadline(7)).toBe("📚 已封印 7 个历史遗迹");
  });

  it("keeps neutral titles before the first load finishes", () => {
    expect(
      getHomeworkListHeadline({
        hasLoadedRecords: false,
        viewMode: "today",
        todayUnsubmittedCount: 3,
        totalRecordCount: 8
      })
    ).toBe("今日作业");

    expect(
      getHomeworkListHeadline({
        hasLoadedRecords: false,
        viewMode: "records",
        todayUnsubmittedCount: 3,
        totalRecordCount: 8
      })
    ).toBe("全部记录");
  });
});
