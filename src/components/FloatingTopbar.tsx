import { formatMonthDayWeekday } from "../lib/format";
import type { DailyQuote } from "../lib/types";

type FloatingTopbarProps = {
  currentTime: Date;
  dailyQuote: DailyQuote | null;
};

export function FloatingTopbar({ currentTime, dailyQuote }: FloatingTopbarProps) {
  const topbarDate = formatMonthDayWeekday(currentTime);

  return (
    <header className="floating-topbar" aria-label="当前日期与每日一言">
      <div className="topbar-line">
        <time className="topbar-date" dateTime={currentTime.toISOString()}>
          {topbarDate}
        </time>
        {dailyQuote ? (
          <p className="topbar-quote-line">
            <span className="topbar-quote-divider">/</span>
            <span className="topbar-quote">“{dailyQuote.text}”</span>
            <span className="topbar-quote-author">— {dailyQuote.author}</span>
          </p>
        ) : null}
      </div>
    </header>
  );
}
