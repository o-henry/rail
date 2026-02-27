import { useMemo } from "react";
import type { DashboardStockChartData } from "./stockWidgetChartData";
import { useI18n } from "../../i18n";

type StockWidgetChartProps = {
  data: DashboardStockChartData | null;
};

function toChartPoints(values: number[], width: number, height: number, padding: number) {
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = Math.max(1, maxValue - minValue);
  const stepX = (width - padding * 2) / Math.max(1, values.length - 1);
  return values.map((value, index) => {
    const x = padding + stepX * index;
    const y = height - padding - ((value - minValue) / range) * (height - padding * 2);
    return { x, y, value };
  });
}

function buildLinePath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) {
    return "";
  }
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

export default function StockWidgetChart({ data }: StockWidgetChartProps) {
  const { t } = useI18n();
  const chart = useMemo(() => {
    if (!data || data.values.length < 2 || data.labels.length < 2) {
      return null;
    }
    const width = 420;
    const height = 150;
    const points = toChartPoints(data.values, width, height, 14);
    if (points.length < 2) {
      return null;
    }

    const linePath = buildLinePath(points);
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - 14} L ${points[0].x} ${height - 14} Z`;
    const last = data.values[data.values.length - 1];
    const prev = data.values[data.values.length - 2];
    const delta = last - prev;
    const deltaRate = prev > 0 ? (delta / prev) * 100 : 0;

    return {
      width,
      height,
      points,
      linePath,
      areaPath,
      last,
      delta,
      deltaRate,
    };
  }, [data]);

  if (!data || !chart) {
    return <div className="dashboard-stock-chart-empty">{t("dashboard.widget.marketSummary.chart.empty")}</div>;
  }

  const up = chart.delta >= 0;

  return (
    <div className="dashboard-stock-chart-wrap">
      <div className="dashboard-stock-chart-summary">
        <strong>{chart.last.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
        <span className={`dashboard-stock-chart-delta ${up ? "is-up" : "is-down"}`}>
          {up ? "+" : ""}
          {chart.delta.toLocaleString(undefined, { maximumFractionDigits: 2 })} ({up ? "+" : ""}
          {chart.deltaRate.toFixed(2)}%)
        </span>
      </div>
      <svg
        aria-label={t("dashboard.widget.marketSummary.chart.aria")}
        className="dashboard-stock-chart-svg"
        viewBox={`0 0 ${chart.width} ${chart.height}`}
      >
        <defs>
          <linearGradient id="dashboard-stock-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(95,136,215,0.35)" />
            <stop offset="100%" stopColor="rgba(95,136,215,0.02)" />
          </linearGradient>
        </defs>
        <path className="dashboard-stock-chart-area" d={chart.areaPath} fill="url(#dashboard-stock-fill)" />
        <path className="dashboard-stock-chart-line" d={chart.linePath} />
        {chart.points.map((point, index) => (
          <circle
            className={`dashboard-stock-chart-dot${index === chart.points.length - 1 ? " is-last" : ""}`}
            cx={point.x}
            cy={point.y}
            key={`point-${index}`}
            r={index === chart.points.length - 1 ? 3.8 : 2.4}
          />
        ))}
      </svg>
      <div className="dashboard-stock-chart-labels">
        <span>{data.labels[0]}</span>
        <span>{data.labels[data.labels.length - 1]}</span>
      </div>
      <div className="dashboard-stock-chart-source">
        {t("dashboard.widget.marketSummary.chart.source")}
        {data.sourceSummary ? `: ${data.sourceSummary}` : ""}
      </div>
    </div>
  );
}
