const BEIJING_TIME_ZONE = "Asia/Shanghai";
const BEIJING_OFFSET = "+08:00";
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday?: string;
};

const compactDateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: BEIJING_TIME_ZONE,
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

const fullDateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: BEIJING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit"
});

const weekdayFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: BEIJING_TIME_ZONE,
  weekday: "short"
});

const beijingPartsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BEIJING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});

function pad(value: number): string {
  return `${value}`.padStart(2, "0");
}

function toDateParts(value: Date | string, includeWeekday = false): DateParts {
  const date = value instanceof Date ? value : new Date(value);
  const parts = beijingPartsFormatter.formatToParts(date);
  const mapped = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  ) as Record<string, string>;

  return {
    year: Number.parseInt(mapped.year, 10),
    month: Number.parseInt(mapped.month, 10),
    day: Number.parseInt(mapped.day, 10),
    hour: Number.parseInt(mapped.hour, 10),
    minute: Number.parseInt(mapped.minute, 10),
    weekday: includeWeekday ? weekdayFormatter.format(date) : undefined
  };
}

export function getBeijingDateParts(value: Date | string): DateParts {
  return toDateParts(value);
}

export function millisecondsUntilNextBeijingMidnight(value: Date): number {
  const parts = toDateParts(value);
  let nextMidnight = Date.UTC(parts.year, parts.month - 1, parts.day, 16, 0, 0, 0);

  if (nextMidnight <= value.getTime()) {
    nextMidnight += DAY_IN_MILLISECONDS;
  }

  return Math.max(nextMidnight - value.getTime(), 1000);
}

export function formatDateTime(value: string): string {
  return compactDateTimeFormatter.format(new Date(value));
}

export function formatFullDateTime(value: string): string {
  return fullDateTimeFormatter.format(new Date(value));
}

export function formatMonthDayWeekday(value: Date): string {
  const parts = toDateParts(value, true);
  return `${parts.month}月${parts.day}日 ${parts.weekday}`;
}

function formatDateInputValue(parts: Pick<DateParts, "year" | "month" | "day">): string {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export type DueAtFormValue = {
  date: string;
  hour: string;
  minute: string;
};

export function toDateInputValue(value: Date | string): string {
  const parts = toDateParts(value);
  return formatDateInputValue(parts);
}

export function toDueAtFormValue(value: string): DueAtFormValue {
  const parts = toDateParts(value);
  return {
    date: formatDateInputValue(parts),
    hour: pad(parts.hour),
    minute: pad(parts.minute)
  };
}

export function fromDueAtFormValue(value: DueAtFormValue): string {
  return `${value.date}T${value.hour}:${value.minute}:00${BEIJING_OFFSET}`;
}
