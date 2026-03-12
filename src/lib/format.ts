export function formatDateTime(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function formatFullDateTime(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function formatMonthDayWeekday(value: Date): string {
  const weekday = new Intl.DateTimeFormat("zh-CN", {
    weekday: "short"
  }).format(value);

  return `${value.getMonth() + 1}月${value.getDate()}日 ${weekday}`;
}

export function toLocalInputValue(value: string): string {
  const date = new Date(value);
  const pad = (input: number) => `${input}`.padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalInputValue(value: string): string {
  const date = new Date(value);
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = `${Math.floor(absoluteOffset / 60)}`.padStart(2, "0");
  const offsetRemainder = `${absoluteOffset % 60}`.padStart(2, "0");
  const pad = (input: number) => `${input}`.padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00${sign}${offsetHours}:${offsetRemainder}`;
}
