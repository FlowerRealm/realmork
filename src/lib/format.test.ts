import {
  formatDateTime,
  formatFullDateTime,
  formatMonthDayWeekday,
  fromLocalInputValue,
  getBeijingDateParts,
  toLocalInputValue
} from "./format";

describe("format", () => {
  it("formats timestamps in Beijing time", () => {
    expect(formatDateTime("2026-03-11T18:30:00Z")).toBe("3/12 02:30");
    expect(formatFullDateTime("2026-03-11T18:30:00Z")).toBe("2026/03/12 02:30");
    expect(formatMonthDayWeekday(new Date("2026-03-11T18:30:00Z"))).toBe("3月12日 周四");
  });

  it("converts datetime-local values using Beijing time semantics", () => {
    expect(toLocalInputValue("2026-03-11T18:30:00Z")).toBe("2026-03-12T02:30");
    expect(fromLocalInputValue("2026-03-12T02:30")).toBe("2026-03-12T02:30:00+08:00");
  });

  it("extracts Beijing date parts independent of runtime timezone", () => {
    expect(getBeijingDateParts("2026-03-11T18:30:00Z")).toEqual({
      year: 2026,
      month: 3,
      day: 12,
      hour: 2,
      minute: 30,
      weekday: undefined
    });
  });
});
