import type { CSSProperties } from "react";
import type { CalendarDayStat } from "@flowmemo/shared";
import { cn } from "../lib/cn";

type CalendarHeatmapProps = {
  stats: CalendarDayStat[];
  weeks?: number;
};

const MONTH_FORMATTER = new Intl.DateTimeFormat("zh-CN", { month: "short" });

/**
 * 格式化本地日期为 yyyy-mm-dd。
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 生成最近若干周的连续热力图格子，并补齐到本周周末。
 */
function getRecentCells(weeks: number): Date[] {
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOffset = (end.getDay() + 6) % 7;
  end.setDate(end.getDate() + (6 - endOffset));
  const start = new Date(end);
  start.setDate(end.getDate() - weeks * 7 + 1);
  const cells: Date[] = [];

  for (let index = 0; index < weeks * 7; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    cells.push(date);
  }

  return cells;
}

/**
 * 获取热力图中本地今天的零点，避免渲染中重复创建时间导致边界漂移。
 */
function getTodayStart(): Date {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

/**
 * 获取月份标签在固定列数网格内的显示范围。
 */
function getMonthLabelStyle(column: number, weeks: number): CSSProperties {
  const start = Math.min(column + 1, weeks);
  const end = Math.min(start + 3, weeks + 1);

  return { gridColumn: `${start} / ${end}` };
}

/**
 * 根据 memo 数量返回热力颜色。
 */
function heatClass(count: number): string {
  if (count <= 0) return "activity-cell-empty";
  if (count === 1) return "activity-cell-low";
  if (count <= 4) return "activity-cell-medium";
  if (count <= 9) return "activity-cell-high";
  return "activity-cell-peak";
}

/**
 * 左侧记录热力图，只展示最近记录密度。
 */
export function CalendarHeatmap({ stats, weeks = 18 }: CalendarHeatmapProps) {
  const today = getTodayStart();
  const cells = getRecentCells(weeks);
  const statMap = new Map(stats.map((day) => [day.date, day.count]));
  const gridStyle = {
    gridTemplateColumns: `repeat(${weeks}, 12px)`
  };
  const monthLabels = cells.reduce<Array<{ label: string; column: number }>>((labels, date, index) => {
    if (date.getDate() > 7) {
      return labels;
    }
    const label = MONTH_FORMATTER.format(date);
    const column = Math.floor(index / 7);
    const last = labels.at(-1);
    if (last?.label === label) {
      return labels;
    }
    return [...labels, { label, column }];
  }, []);

  return (
    <section className="activity-panel" aria-label="最近记录热力图">
      <div className="activity-grid" style={gridStyle}>
        {cells.map((date) => {
          const dateKey = formatDate(date);
          const count = statMap.get(dateKey) ?? 0;
          return (
            <div
              key={dateKey}
              title={`${date.getMonth() + 1}月${date.getDate()}日，记录 ${count} 条`}
              className={cn(
                "activity-cell",
                date > today ? "activity-cell-future" : heatClass(count)
              )}
            />
          );
        })}
      </div>
      <div className="activity-months" style={gridStyle}>
        {monthLabels.map((month) => (
          <span
            key={`${month.label}-${month.column}`}
            style={getMonthLabelStyle(month.column, weeks)}
          >
            {month.label}
          </span>
        ))}
      </div>
    </section>
  );
}
