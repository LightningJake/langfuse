import React, { useMemo } from "react";
import { BarChart3 } from "@langfuse/icons";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import { useLineChartTimeSeries } from "@/src/features/widgets/chart-library/useLineChartTimeSeries";
import { useAreaChartTimeSeries } from "@/src/features/widgets/chart-library/useAreaChartTimeSeries";
import { useVerticalBarChartTimeSeries } from "@/src/features/widgets/chart-library/useVerticalBarChartTimeSeries";
import { useTopListChart } from "@/src/features/widgets/chart-library/useTopListChart";
import { useVerticalBarChart } from "@/src/features/widgets/chart-library/useVerticalBarChart";
import { usePieChart } from "@/src/features/widgets/chart-library/usePieChart";
import { useHistogramChart } from "@/src/features/widgets/chart-library/useHistogramChart";
import { usePivotTable } from "@/src/features/widgets/chart-library/usePivotTable";
import { formatMetric } from "@/src/features/widgets/chart-library/utils";
import { VisualizationFrame } from "@/src/components/design-system/charts/internal/VisualizationFrame/VisualizationFrame";
import {
  useLargeDatasetGuard,
  LARGE_DATASET_CONFIRMATION,
} from "@/src/features/widgets/chart-library/useLargeDatasetGuard";
import { isChartDataEmpty } from "@/src/features/widgets/chart-library/isChartDataEmpty";
import type {
  FormatMetricOptions,
  DataPoint,
  ChartProps,
} from "@/src/features/widgets/chart-library/chart-props";
import { getWidgetMissingBucketValue } from "@/src/features/widgets/utils";

import { type AggregationFn } from "../types";
import { isTimeSeriesChartType } from "../vocab";

const RANKED_ROW_LIMIT = 20;

/**
 * Builds the `chart-library` `ChartConfig` (series labels + the `metric` key the
 * bar/pie primitives colour through `--color-metric`) from the rendered series.
 */
function buildChartConfig(data: DataPoint[], metricLabel: string) {
  const config: NonNullable<ChartProps["config"]> = {};
  // Per-series labels first, so a breakdown value that is literally "metric"
  // (e.g. an observation/model named "metric") keeps its own label.
  for (const point of data) {
    if (point.dimension && config[point.dimension] === undefined) {
      config[point.dimension] = {
        label: point.dimension,
        theme: { light: "hsl(var(--chart-1))", dark: "hsl(var(--chart-1))" },
      };
    }
  }
  // Reserved key the bar/pie primitives colour through `--color-metric`; only
  // add it if no real series already claimed the "metric" key above.
  if (config.metric === undefined)
    config.metric = {
      label: metricLabel,
      theme: { light: "hsl(var(--chart-1))", dark: "hsl(var(--chart-1))" },
    };
  return config;
}

/**
 * View-only chart renderer: takes already-aggregated `DataPoint[]` (from the
 * server query, or the mock aggregator in Storybook) plus the resolved metric
 * label/unit and the handful of config fields that affect rendering, and
 * hands them to the shared `chart-library`. Memoized so a parent re-render or
 * an unrelated config change doesn't re-render the chart.
 *
 * Shared between the observations chart view (`EventsChartView`) and the
 * scores chart view (`@/src/features/scores-chart-view`) — the two configs
 * pick metrics/dimensions from entirely different vocabularies, but once a
 * metric is resolved to a label/unit, the actual rendering is identical.
 * Deliberately takes primitives instead of a `ChartViewConfig`/
 * `ScoreChartViewConfig`, so this component has no dependency on either.
 */
export const ChartCanvas = React.memo(function ChartCanvas({
  data,
  chartType,
  breakdown,
  aggregation,
  metricLabel,
  metricUnit,
  emptyMessage,
}: {
  data: DataPoint[];
  chartType: DashboardWidgetChartType;
  /** The config's breakdown dimension key; only ever compared to `"none"`. */
  breakdown: string;
  aggregation: AggregationFn;
  metricLabel: string;
  metricUnit?: string;
  emptyMessage: string;
}) {
  const chartConfig = useMemo(
    () => buildChartConfig(data, metricLabel),
    [data, metricLabel],
  );
  const { shouldWarn, proceed } = useLargeDatasetGuard(data.length, false);

  const metricFormatter = useMemo(
    () => (value: number, options: FormatMetricOptions) =>
      formatMetric(value, { ...options, unit: metricUnit }),
    [metricUnit],
  );
  const active = !shouldWarn && !isChartDataEmpty(data);
  // Match dashboard widgets: only additive metrics fill missing buckets with zero.
  const common = {
    config: chartConfig,
    metricFormatter,
    legendPosition:
      isTimeSeriesChartType(chartType) && breakdown !== "none"
        ? ("below" as const)
        : ("none" as const),
    missingValue: getWidgetMissingBucketValue(aggregation),
  };
  const preparedCharts = {
    LINE_TIME_SERIES: useLineChartTimeSeries({
      ...common,
      data: active && chartType === "LINE_TIME_SERIES" ? data : [],
    }),
    AREA_TIME_SERIES: useAreaChartTimeSeries({
      ...common,
      data: active && chartType === "AREA_TIME_SERIES" ? data : [],
    }),
    BAR_TIME_SERIES: useVerticalBarChartTimeSeries({
      ...common,
      data: active && chartType === "BAR_TIME_SERIES" ? data : [],
    }),
    HORIZONTAL_BAR: useTopListChart({
      ...common,
      data:
        active && chartType === "HORIZONTAL_BAR"
          ? data.slice(0, RANKED_ROW_LIMIT)
          : [],
    }),
    VERTICAL_BAR: useVerticalBarChart({
      ...common,
      data:
        active && chartType === "VERTICAL_BAR"
          ? data.slice(0, RANKED_ROW_LIMIT)
          : [],
    }),
    PIE: usePieChart({
      metricFormatter,
      data:
        active && chartType === "PIE" ? data.slice(0, RANKED_ROW_LIMIT) : [],
    }),
    HISTOGRAM: useHistogramChart({
      ...common,
      data: active && chartType === "HISTOGRAM" ? data : [],
    }),
    PIVOT_TABLE: usePivotTable({
      data: active && chartType === "PIVOT_TABLE" ? data : [],
      config: {
        dimensions: [],
        metrics: ["metric"],
        rowLimit: RANKED_ROW_LIMIT,
      },
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
  const prepared = preparedCharts[chartType];

  if (shouldWarn)
    return (
      <VisualizationFrame
        content={{ ...LARGE_DATASET_CONFIRMATION, onConfirm: proceed }}
      />
    );

  if (isChartDataEmpty(data)) {
    return (
      <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <BarChart3 __rawClassName="h-10 w-10 opacity-40" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  const { visualization } = prepared;
  if (visualization.type === "table" && !visualization.rows.length) {
    return (
      <div
        className="text-muted-foreground flex h-full items-center justify-center text-sm"
        role="alert"
      >
        Unable to process data for pivot table
      </div>
    );
  }
  if (visualization.type === "histogram" && !visualization.data.length) {
    return <VisualizationFrame content={{ type: "empty" }} />;
  }
  return <VisualizationFrame content={prepared.visualization} />;
});
