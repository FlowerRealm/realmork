import type { ViewMode } from "./types";

const todayUnsubmittedMessages = [
  "🎉 今日未交作业清零，快去狂欢吧！",
  "🎯 只剩 1 份未交作业，给它个华丽的谢幕！",
  "👯 还有 2 份未交作业在讲悄悄话，快去拆散它们！",
  "🥉 还剩 3 份未交作业，离颁奖典礼（睡觉）只差临门一脚！",
  "🍀 还有 4 份未交作业，四叶草今天不保佑拖延。",
  "🖐️ 还有 5 份未交作业，先别击掌，先把它们交掉。",
  "🎸 还有 6 份未交作业在蹦迪，先把音响掐了。",
  "🌈 七色光照在大地上，也照在你这 7 份未交作业上。",
  "♾️ 还有 8 份未交作业，旋转 90 度就是无穷无尽的痛苦！",
  "⏳ 还有 9 份未交作业，希望交完它们也能归于平静。",
  "🔟 还有 10 份未交作业，十全十美是不可能了。",
  "🕯️ 还有 11 份未交作业，像 11 根蜡烛照亮你的黑眼圈。",
  "🕛 还有 12 份未交作业，钟声敲响前你最好先动手。",
  "👻 还有 13 份未交作业，这不是玄学，是报应。",
  "💕 还有 14 份未交作业，它们对你可真是深情。",
  "🌙 还有 15 份未交作业，今晚直接化身赶工狼人。",
  "🌧️ 还有 16 份未交作业，花季过去了，雨季到了。",
  "🚲 还有 17 份未交作业，单车能骑，这堆东西可推不动。",
  "🪪 还有 18 份未交作业，成年了，也该面对现实了。",
  "🔥 还有 19 份未交作业，离地狱就差一层楼。",
  "💣 还有 20 份未交作业，你这是在搞作业批发市场。"
] as const;

type HomeworkListHeadlineOptions = {
  hasLoadedRecords: boolean;
  viewMode: ViewMode;
  todayUnsubmittedCount: number;
  totalRecordCount: number;
};

export function getTodayHomeworkHeadline(unsubmittedCount: number): string {
  return todayUnsubmittedMessages[unsubmittedCount] ?? `😱 还有 ${unsubmittedCount} 份未交作业大军压境，救护车在路上了！`;
}

export function getRecordHomeworkHeadline(totalCount: number): string {
  return `📚 已封印 ${totalCount} 个历史遗迹`;
}

export function getHomeworkListHeadline({
  hasLoadedRecords,
  viewMode,
  todayUnsubmittedCount,
  totalRecordCount
}: HomeworkListHeadlineOptions): string {
  if (!hasLoadedRecords) {
    return viewMode === "today" ? "今日作业" : "全部记录";
  }

  return viewMode === "today"
    ? getTodayHomeworkHeadline(todayUnsubmittedCount)
    : getRecordHomeworkHeadline(totalRecordCount);
}
