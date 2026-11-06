import { type ComponentProps, useMemo } from "react";
import { useLargeDatasetGuard } from "../chart-library/useLargeDatasetGuard";
import { isChartDataEmpty } from "@/src/features/widgets/chart-library/isChartDataEmpty";
import { DataCard } from "@/src/components/design-system/DataCard/DataCard";
import {
  type ChartProps,
  type FormatMetricOptions,
} from "../chart-library/chart-props";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import { type OrderByState } from "@langfuse/shared";
import { type WidgetChartConfig } from "../utils";
import { formatMetric } from "../chart-library/utils";
import { useLineChartTimeSeries } from "../chart-library/useLineChartTimeSeries";
import { useAreaChartTimeSeries } from "../chart-library/useAreaChartTimeSeries";
import { useVerticalBarChartTimeSeries } from "../chart-library/useVerticalBarChartTimeSeries";
import { useTopListChart } from "../chart-library/useTopListChart";
import { useVerticalBarChart } from "../chart-library/useVerticalBarChart";
import { usePieChart } from "../chart-library/usePieChart";
import { useHistogramChart } from "../chart-library/useHistogramChart";
import { usePivotTable } from "../chart-library/usePivotTable";

const EMPTY_DATA: ChartProps["data"] = [];

type WidgetChartCardProps = Pick<
  ComponentProps<typeof DataCard>,
  "title" | "description" | "badge" | "controls" | "tabs" | "actions"
> &
  Pick<
    ChartProps,
    | "config"
    | "legendPosition"
    | "legendSummary"
    | "legendInteraction"
    | "maxVisibleSeries"
    | "syncId"
    | "sync"
    | "metricFormatter"
    | "thresholds"
    | "missingValue"
    | "hideXAxisLabels"
    | "compactYAxis"
    | "colorBarsByCategory"
    | "zeroBaseline"
  > & {
    chartConfig?: WidgetChartConfig & {
      dimensions?: string[];
      metrics?: string[];
      units?: (string | undefined)[];
      unit?: string;
    };
    sortState?: OrderByState | null;
    onSortChange?: (sortState: OrderByState | null) => void;
    rowLimit?: number;
    overrideWarning?: boolean;
    label?: string;
    unit?: string;
    metric?: { value: string | number; description?: string };
  } & (
    | {
        chartType: DashboardWidgetChartType;
        data: ChartProps["data"];
        content?: Extract<
          ComponentProps<typeof DataCard>["content"],
          { type: "loading" | "empty" | "error" | "confirmation" }
        >;
      }
    | {
        chartType?: never;
        data?: never;
        content: Extract<
          ComponentProps<typeof DataCard>["content"],
          { type: "loading" | "empty" | "error" | "confirmation" }
        >;
      }
  );

export function WidgetChartCard(props: WidgetChartCardProps) {
  const {
    chartType,
    title,
    description,
    badge,
    controls,
    tabs,
    actions,
    content,
    metric,
    data = EMPTY_DATA,
    label,
    unit,
    config,
    chartConfig,
    rowLimit = 100,
    overrideWarning = false,
    ...chart
  } = props;
  const { shouldWarn, proceed } = useLargeDatasetGuard(
    data.length,
    overrideWarning,
  );
  const resolvedConfig = useMemo(() => {
    const source = config ?? (label ? { metric: { label } } : undefined);
    if (!source) return undefined;
    return Object.fromEntries(
      Object.entries(source).map(([key, value]) => {
        if (value.theme || value.color) return [key, value];
        return [
          key,
          {
            ...value,
            theme: {
              light: "hsl(var(--chart-1))",
              dark: "hsl(var(--chart-1))",
            },
          },
        ];
      }),
    ) as NonNullable<ChartProps["config"]>;
  }, [config, label]);
  const resolvedChartConfig = useMemo(
    () => ({
      ...chartConfig,
      type: chartType,
      unit: unit ?? chartConfig?.unit,
    }),
    [chartConfig, chartType, unit],
  );
  const displayContent =
    content ??
    (isChartDataEmpty(data) ? { type: "empty" as const } : undefined);
  const metricFormatter = useMemo(
    () =>
      chart.metricFormatter ??
      ((value: number, options: FormatMetricOptions) =>
        formatMetric(value, { ...options, unit: resolvedChartConfig.unit })),
    [chart.metricFormatter, resolvedChartConfig.unit],
  );
  const active = !displayContent && !shouldWarn;
  const common = { ...chart, config: resolvedConfig, metricFormatter };
  const preparedCharts = {
    LINE_TIME_SERIES: useLineChartTimeSeries({
      ...common,
      data: active && chartType === "LINE_TIME_SERIES" ? data : EMPTY_DATA,
      showDataPointDots: resolvedChartConfig.show_data_point_dots ?? false,
    }),
    AREA_TIME_SERIES: useAreaChartTimeSeries({
      ...common,
      data: active && chartType === "AREA_TIME_SERIES" ? data : EMPTY_DATA,
    }),
    BAR_TIME_SERIES: useVerticalBarChartTimeSeries({
      ...common,
      data: active && chartType === "BAR_TIME_SERIES" ? data : EMPTY_DATA,
    }),
    HORIZONTAL_BAR: useTopListChart({
      ...common,
      data:
        active && chartType === "HORIZONTAL_BAR"
          ? data.slice(0, rowLimit)
          : EMPTY_DATA,
    }),
    VERTICAL_BAR: useVerticalBarChart({
      ...common,
      data:
        active && chartType === "VERTICAL_BAR"
          ? data.slice(0, rowLimit)
          : EMPTY_DATA,
    }),
    PIE: usePieChart({
      metricFormatter,
      data:
        active && chartType === "PIE" ? data.slice(0, rowLimit) : EMPTY_DATA,
    }),
    HISTOGRAM: useHistogramChart({
      ...common,
      data: active && chartType === "HISTOGRAM" ? data : EMPTY_DATA,
    }),
    PIVOT_TABLE: usePivotTable({
      data: active && chartType === "PIVOT_TABLE" ? data : EMPTY_DATA,
      config: {
        dimensions: resolvedChartConfig.dimensions ?? [],
        metrics: resolvedChartConfig.metrics ?? ["metric"],
        units: resolvedChartConfig.units,
        rowLimit: resolvedChartConfig.row_limit ?? rowLimit,
        defaultSort: resolvedChartConfig.defaultSort,
      },
      sortState: chart.sortState,
      onSortChange:
        active && chartType === "PIVOT_TABLE" ? chart.onSortChange : undefined,
    }),
    NUMBER: {
      visualization: {
        type: "number" as const,
        value: data.reduce(
          (sum, point) =>
            sum + (typeof point.metric === "number" ? point.metric : 0),
          0,
        ),
        valueFormatter: metricFormatter,
      },
    },
  };
  const card = {
    title,
    description,
    badge,
    controls,
    tabs,
    actions,
    metric,
  };
  if (props.chartType === undefined)
    return <DataCard {...card} content={props.content} />;
  if (displayContent) return <DataCard {...card} content={displayContent} />;
  if (shouldWarn) {
    return (
      <DataCard
        {...card}
        content={{
          type: "confirmation",
          title: "Large Dataset Warning",
          description:
            "This chart has more than 2,000 unique data points. Rendering it may be slow or may crash your browser. Try to reduce the number of dimensions by adding more selective filters or choosing a coarser breakdown dimension.",
          actionLabel: "I understand, proceed to render the chart",
          onConfirm: proceed,
        }}
      />
    );
  }
  const prepared = preparedCharts[props.chartType];
  if (
    (prepared.visualization.type === "histogram" &&
      !prepared.visualization.data.length) ||
    (prepared.visualization.type === "table" &&
      !prepared.visualization.rows.length)
  ) {
    return <DataCard {...card} content={{ type: "empty" }} />;
  }
  return <DataCard {...card} {...prepared} content={prepared.visualization} />;
}
