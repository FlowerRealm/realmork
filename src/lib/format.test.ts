import {
  formatDateTime,
  formatFullDateTime,
  formatMonthDayWeekday,
  fromLocalInputValue,
  getBeijingDateParts,
  millisecondsUntilNextBeijingMidnight,
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

  it("calculates the next Beijing midnight independent of runtime timezone", () => {
    expect(millisecondsUntilNextBeijingMidnight(new Date("2026-03-11T18:30:00Z"))).toBe(77_400_000);
    expect(millisecondsUntilNextBeijingMidnight(new Date("2026-03-12T16:00:00Z"))).toBe(86_400_000);
  });
});
