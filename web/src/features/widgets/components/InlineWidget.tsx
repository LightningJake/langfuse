/* eslint-disable no-nested-ternary, @repo/component-file-structure */
/* eslint-disable @repo/no-style-props */
import {
  useMemo,
  useState,
  useCallback,
  type ReactNode,
  type ComponentProps,
} from "react";
import { type WidgetChartCard } from "./WidgetChartCard";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import { type OrderByState } from "@langfuse/shared";
import {
  type QueryType,
  type ViewVersion,
  getResultUnit,
} from "@langfuse/shared/query";
import { useScheduledDashboardExecuteQuery } from "@/src/features/dashboard/hooks/DashboardQuerySchedulerProvider";
import { type ChartProps } from "../chart-library/chart-props";
import { formatMetric } from "../chart-library/utils";
import { useLineChartTimeSeries } from "../chart-library/useLineChartTimeSeries";
import { useAreaChartTimeSeries } from "../chart-library/useAreaChartTimeSeries";
import { useVerticalBarChartTimeSeries } from "../chart-library/useVerticalBarChartTimeSeries";
import { useTopListChart } from "../chart-library/useTopListChart";
import { useVerticalBarChart } from "../chart-library/useVerticalBarChart";
import { usePieChart } from "../chart-library/usePieChart";
import { useHistogramChart } from "../chart-library/useHistogramChart";
import { usePivotTable } from "../chart-library/usePivotTable";
import { VisualizationFrame } from "@/src/components/design-system/charts/internal/VisualizationFrame/VisualizationFrame";
import {
  useLargeDatasetGuard,
  LARGE_DATASET_CONFIRMATION,
} from "@/src/features/widgets/chart-library/useLargeDatasetGuard";
import { isChartDataEmpty } from "@/src/features/widgets/chart-library/isChartDataEmpty";
import {
  type FormatMetricOptions,
  type LegendPosition,
} from "@/src/features/widgets/chart-library/chart-props";
import {
  getChartLoadingProgress,
  getChartLoadingStateProps,
} from "@/src/features/widgets/chart-library/chartLoadingStateUtils";
import {
  formatMetricName,
  shouldUseWidgetSSE,
  getWidgetMetricPresentation,
  getWidgetMissingBucketValue,
  type WidgetChartConfig,
} from "@/src/features/widgets/utils";
import { isTimeSeriesChart } from "@/src/features/widgets/chart-library/utils";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import { cn } from "@/src/utils/tailwind";

// ============================================================================
// Types
// ============================================================================

interface WidgetMetricConfig {
  measure: string;
  agg: string;
}

interface WidgetDimensionConfig {
  field: string;
}

/** A widget queries its project, or runs its query through `fetchQuery`. */
type WidgetQuerySource =
  | { projectId: string; fetchQuery?: never }
  | {
      projectId?: never;
      fetchQuery: NonNullable<
        Parameters<typeof useScheduledDashboardExecuteQuery>[1]["fetchQuery"]
      >;
    };

export type WidgetContentProps = WidgetQuerySource & {
  query: QueryType;
  version: ViewVersion;
  chartType: DashboardWidgetChartType;
  chartConfig: WidgetChartConfig;
  metrics: WidgetMetricConfig[];
  dimensions: WidgetDimensionConfig[];
  view: string;
  /**
   * External loading state - when true, shows loading overlay even if query is complete.
   * Useful when parent component needs to load data before the widget can be meaningful.
   */
  isExternalLoading?: boolean;
  /**
   * Unique ID for query scheduling.
   */
  schedulerId: string;
  /**
   * Layout hint for loading state display. Affects spacing and text size.
   */
  layoutHint?: "default" | "compact" | "tight";
  /**
   * Pivot table sort state (only used for PIVOT_TABLE chart type)
   */
  sortState?: OrderByState | null;
  /**
   * Callback when pivot table sort changes
   */
  onSortChange?: (sort: OrderByState | null) => void;
  /**
   * Additional class names for the container
   */
  className?: string;
  /**
   * Optional presentation-only labels for entity_dimension values.
   */
  entityDimensionLabelMap?: Record<string, string>;
  /**
   * Optional presentation-only labels for the first dimension's values, e.g.
   * names for ID breakdowns. Values without a label keep their raw value.
   */
  dimensionLabelMap?: ReadonlyMap<string, string>;
  /**
   * Hide x-axis tick labels on a categorical (entity-name) axis; the full name
   * stays in the hover tooltip. Off by default. Opt in on entity-dimension
   * charts whose long names clutter the axis.
   */
  hideXAxisLabels?: boolean;
  /**
   * Colour each bar of a categorical (entity) axis. Off by default; opt in on
   * entity-dimension bar charts such as the experiments strip. See
   * `prepareCategoryBars`.
   */
  colorBarsByCategory?: boolean;
  legendPosition?: LegendPosition;
  /**
   * Measure bars from zero rather than from a fitted domain. Off by default;
   * see `ChartProps.zeroBaseline`.
   */
  zeroBaseline?: boolean;
  /**
   * Replaces the chart's default "No data" card — for a widget in a band too
   * short for it.
   */
  emptyState?: ReactNode;
  usdPrecision?: FormatMetricOptions["usdPrecision"];
};

// ============================================================================
// Components
// ============================================================================

const getXAxisValue = (
  item: Record<string, unknown>,
  entityDimensionLabelMap?: Record<string, string>,
) => {
  const entityDimensionValue = String(item["entity_dimension"]);
  const entityDimensionLabel = entityDimensionLabelMap?.[entityDimensionValue];
  return entityDimensionLabel && entityDimensionLabel.length > 0
    ? entityDimensionLabel
    : entityDimensionValue;
};

/**
 * Shared query preparation for inline charts and connected chart cards.
 *
 * This component handles:
 * - Query execution via useScheduledDashboardExecuteQuery
 * - Data transformation for chart consumption (time_dimension, entity_dimension, dimension, metric)
 * - Chart props for the appropriate chart type
 * - Loading and error states
 *
 * For pivot tables, pass sortState and onSortChange to enable sorting.
 */
export function useWidgetChart({
  projectId,
  fetchQuery,
  query,
  version,
  chartType,
  chartConfig,
  metrics,
  dimensions,
  view,
  // equals widget is pending
  isExternalLoading = false,
  schedulerId,
  sortState,
  onSortChange,
  entityDimensionLabelMap,
  dimensionLabelMap,
  hideXAxisLabels,
  colorBarsByCategory,
  legendPosition,
  zeroBaseline,
  usdPrecision,
}: WidgetQuerySource &
  Pick<
    WidgetContentProps,
    | "query"
    | "version"
    | "chartType"
    | "chartConfig"
    | "metrics"
    | "dimensions"
    | "view"
    | "isExternalLoading"
    | "schedulerId"
    | "sortState"
    | "onSortChange"
    | "entityDimensionLabelMap"
    | "dimensionLabelMap"
    | "hideXAxisLabels"
    | "colorBarsByCategory"
    | "legendPosition"
    | "zeroBaseline"
    | "usdPrecision"
  >) {
  // Transport-only: `version` is a prop here, so an unresolved session can
  // never change WHAT is queried — only whether it streams (SSE) or not.
  const { isV4 } = useReadPath();
  const [retryCount, setRetryCount] = useState(0);

  const handleRetry = useCallback(() => {
    setRetryCount((current) => current + 1);
  }, []);

  // Execute the query
  const queryResult = useScheduledDashboardExecuteQuery(
    {
      projectId: projectId ?? "",
      version,
      query,
    },
    {
      fetchQuery,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      queryId: schedulerId,
      meta: {
        silentHttpCodes: [412, 422],
      },
      refreshKey: retryCount,
      useSSE: shouldUseWidgetSSE({
        isV4Enabled: isV4,
        version,
      }),
      enabled: !isExternalLoading,
    },
  );

  // Transform data for chart consumption
  const transformedData = useMemo(() => {
    if (!queryResult.data) {
      return [];
    }

    const mapped = queryResult.data.map((item: Record<string, unknown>) => {
      if (chartType === "PIVOT_TABLE") {
        // For pivot tables, preserve all raw data fields
        const timeDimension = item["time_dimension"];
        return {
          dimension:
            dimensions.length > 0
              ? (dimensions[0]?.field ?? "dimension")
              : "dimension",
          metric: 0,
          time_dimension:
            typeof timeDimension === "string"
              ? timeDimension
              : String(timeDimension ?? "n/a"),
          ...item,
        };
      }

      // Regular chart processing
      const metric = metrics.slice().shift() ?? {
        measure: "count",
        agg: "count",
      };
      const metricField = `${metric.agg}_${metric.measure}`;
      const metricValue = item[metricField];

      const dimensionField = dimensions.slice().shift()?.field ?? "none";

      // Handle x-axis: prefer entity_dimension, then time_dimension
      let xAxisValue: string | undefined;
      if (item["entity_dimension"] !== undefined) {
        xAxisValue = getXAxisValue(item, entityDimensionLabelMap);
      } else if (item["time_dimension"] !== undefined) {
        xAxisValue = String(item["time_dimension"]);
      }

      const isTimeSeries = isTimeSeriesChart(chartType);
      const dimensionValue = item[dimensionField];

      // A gap-filled empty bucket arrives as a row with no dimension and the
      // metric column's type default: NULL for nullable aggregations
      // (avg/percentiles), 0 for non-nullable ones (count/uniq/sum). Keep it
      // as a pure bucket marker (holds the spot on the x axis) instead of
      // inventing an "n/a" series. The 0 form is only treated as filler for
      // additive metrics, where the marker is lossless (prepareDenseSeries
      // re-derives the honest 0 for any series that exists); a real
      // dimension-less avg/percentile 0 stays a visible data point. (LFE-10694)
      const isFillerMetricValue =
        metricValue == null ||
        (getWidgetMissingBucketValue(metric.agg) === "zero" &&
          Number(metricValue) === 0);
      if (
        isTimeSeries &&
        (dimensionValue === null || dimensionValue === "") &&
        isFillerMetricValue
      ) {
        return {
          time_dimension: xAxisValue,
          dimension: undefined,
          metric: null,
        };
      }

      // A non-time-series chart draws `dimension` on its categorical axis, and
      // on an entity query the ENTITY *is* that category — so hand it over as
      // the dimension rather than the metric's name, which would collapse every
      // entity into one bar. Only when the query has no breakdown of its own:
      // that breakdown is the real series (categorical scores).
      const entityIsCategory =
        !isTimeSeries &&
        item["entity_dimension"] !== undefined &&
        dimensions.length === 0;

      // Handle series dimension (for legend)
      let seriesDimension: string;
      if (entityIsCategory) {
        seriesDimension = xAxisValue ?? "Unknown";
      } else if (dimensionValue !== undefined) {
        const val = dimensionValue;
        // Empty first: "" is a string, so the order matters. (LFE-10694)
        if (val === null || val === undefined || val === "") {
          seriesDimension = "n/a";
        } else if (typeof val === "string") {
          seriesDimension = dimensionLabelMap?.get(val) ?? val;
        } else if (Array.isArray(val)) {
          seriesDimension = val.join(", ");
        } else {
          seriesDimension = String(val);
        }
      } else {
        seriesDimension = formatMetricName(metricField);
      }

      return {
        // time_dimension is used as x-axis for charts (works for both time and entity dimensions)
        time_dimension: xAxisValue,
        dimension: seriesDimension,
        metric: Array.isArray(metricValue)
          ? metricValue
          : // On a time series a missing value stays null — the chart renders
            // it by the metric's missing-bucket semantics instead of a fake 0.
            isTimeSeries && metricValue == null
            ? null
            : Number(metricValue || 0),
      };
    });

    // Entity-dimension charts have no meaningful query-side order (the server
    // falls back to first-metric DESC, which differs per chart). Order the
    // x-axis by the caller's entityDimensionLabelMap insertion order, so the
    // caller decides what left-to-right means (the experiments strip makes it
    // chronological). Entities the map doesn't know sort last.
    if (
      chartType !== "PIVOT_TABLE" &&
      entityDimensionLabelMap &&
      Object.keys(entityDimensionLabelMap).length > 0
    ) {
      const order = new Map<string, number>();
      Object.entries(entityDimensionLabelMap).forEach(([id, name], index) => {
        order.set(id, index);
        order.set(name, index);
      });
      return mapped
        .slice()
        .sort(
          (a, b) =>
            (order.get(a.time_dimension ?? "") ?? Number.MAX_SAFE_INTEGER) -
            (order.get(b.time_dimension ?? "") ?? Number.MAX_SAFE_INTEGER),
        );
    }

    return mapped;
  }, [
    queryResult.data,
    chartType,
    metrics,
    dimensions,
    entityDimensionLabelMap,
    dimensionLabelMap,
  ]);

  // Chart presentation (label and formatter)
  const chartPresentation = useMemo(() => {
    if (chartType === "PIVOT_TABLE" || metrics.length === 0) {
      return undefined;
    }

    const metric = metrics[0];
    return getWidgetMetricPresentation({
      metric,
      view,
      version,
      usdPrecision,
    });
  }, [chartType, metrics, view, version, usdPrecision]);

  // Loading state
  const chartLoadingState = getChartLoadingStateProps({
    isPending: queryResult.isPending,
    isError: queryResult.isError,
    errorMessage: queryResult.error,
  });

  const usesBackendProgress =
    !fetchQuery &&
    shouldUseWidgetSSE({
      isV4Enabled: isV4,
      version,
    });

  const loadingProgress = getChartLoadingProgress({
    isPending: queryResult.isPending,
    progress: queryResult.progress,
    useBackendProgress: usesBackendProgress,
  });

  // Determine row limit
  const effectiveRowLimit = useMemo(() => {
    if (
      chartType === "LINE_TIME_SERIES" ||
      chartType === "BAR_TIME_SERIES" ||
      chartType === "AREA_TIME_SERIES"
    ) {
      return 100;
    }
    return chartConfig.row_limit ?? 100;
  }, [chartType, chartConfig.row_limit]);

  // Build chart config with units
  const fullChartConfig = useMemo<
    NonNullable<ComponentProps<typeof WidgetChartCard>["chartConfig"]>
  >(() => {
    const baseConfig = { ...chartConfig };

    if (chartType === "PIVOT_TABLE") {
      return {
        ...baseConfig,
        dimensions: dimensions.map((dim) => dim.field),
        metrics: metrics.map((m) => `${m.agg}_${m.measure}`),
        units: metrics.map((m) =>
          getResultUnit(view, m.measure, m.agg, version),
        ),
      };
    }

    if (metrics.length > 0) {
      return {
        ...baseConfig,
        unit: getResultUnit(view, metrics[0].measure, metrics[0].agg, version),
      };
    }

    return baseConfig;
  }, [chartConfig, chartType, dimensions, metrics, view, version]);

  return {
    chartProps: {
      chartType,
      data: transformedData,
      config: chartPresentation
        ? { metric: { label: chartPresentation.label } }
        : undefined,
      rowLimit: effectiveRowLimit,
      chartConfig: fullChartConfig,
      sortState: chartType === "PIVOT_TABLE" ? sortState : undefined,
      onSortChange: chartType === "PIVOT_TABLE" ? onSortChange : undefined,
      isLoading: queryResult.isPending || isExternalLoading,
      metricFormatter: chartPresentation?.metricFormatter,
      missingValue: getWidgetMissingBucketValue(metrics[0]?.agg ?? "count"),
      hideXAxisLabels,
      colorBarsByCategory,
      legendPosition,
      zeroBaseline,
    } satisfies ChartProps &
      Pick<
        ComponentProps<typeof WidgetChartCard>,
        "chartType" | "rowLimit" | "chartConfig" | "sortState" | "onSortChange"
      > & {
        isLoading: boolean;
      },
    chartLoadingState,
    loadingProgress,
    onRetry: queryResult.isError ? handleRetry : undefined,
  };
}

export function WidgetContent(props: WidgetContentProps) {
  const { chartProps, chartLoadingState, loadingProgress, onRetry } =
    useWidgetChart(props);
  const { isLoading, ...chart } = chartProps;
  const { shouldWarn, proceed } = useLargeDatasetGuard(
    chart.data.length,
    false,
  );
  const showEmpty =
    (isTimeSeriesChart(chart.chartType) ||
      chart.chartType === "NUMBER" ||
      chart.chartType === "HISTOGRAM" ||
      chart.chartType === "PIVOT_TABLE" ||
      props.emptyState !== undefined) &&
    (chart.chartType === "NUMBER" || !isLoading) &&
    isChartDataEmpty(chart.data);

  const metricFormatter = useMemo(
    () =>
      chart.metricFormatter ??
      ((value: number, options: FormatMetricOptions) =>
        formatMetric(value, { ...options, unit: chart.chartConfig.unit })),
    [chart.metricFormatter, chart.chartConfig.unit],
  );
  const config = useMemo(() => {
    if (!chart.config) return undefined;
    return {
      metric: {
        ...chart.config.metric,
        theme: { light: "hsl(var(--chart-1))", dark: "hsl(var(--chart-1))" },
      },
    };
  }, [chart.config]);
  const active = !props.isExternalLoading && !shouldWarn && !showEmpty;
  const common = { ...chart, config, metricFormatter };
  const preparedCharts = {
    LINE_TIME_SERIES: useLineChartTimeSeries({
      ...common,
      data: active && chart.chartType === "LINE_TIME_SERIES" ? chart.data : [],
      showDataPointDots: chart.chartConfig.show_data_point_dots ?? false,
    }),
    AREA_TIME_SERIES: useAreaChartTimeSeries({
      ...common,
      data: active && chart.chartType === "AREA_TIME_SERIES" ? chart.data : [],
    }),
    BAR_TIME_SERIES: useVerticalBarChartTimeSeries({
      ...common,
      data: active && chart.chartType === "BAR_TIME_SERIES" ? chart.data : [],
    }),
    HORIZONTAL_BAR: useTopListChart({
      ...common,
      data:
        active && chart.chartType === "HORIZONTAL_BAR"
          ? chart.data.slice(0, chart.rowLimit)
          : [],
    }),
    VERTICAL_BAR: useVerticalBarChart({
      ...common,
      data:
        active && chart.chartType === "VERTICAL_BAR"
          ? chart.data.slice(0, chart.rowLimit)
          : [],
    }),
    PIE: usePieChart({
      metricFormatter,
      data:
        active && chart.chartType === "PIE"
          ? chart.data.slice(0, chart.rowLimit)
          : [],
    }),
    HISTOGRAM: useHistogramChart({
      ...common,
      data: active && chart.chartType === "HISTOGRAM" ? chart.data : [],
    }),
    PIVOT_TABLE: usePivotTable({
      data: active && chart.chartType === "PIVOT_TABLE" ? chart.data : [],
      config: {
        dimensions: chart.chartConfig.dimensions ?? [],
        metrics: chart.chartConfig.metrics ?? ["metric"],
        units: chart.chartConfig.units,
        rowLimit: chart.chartConfig.row_limit ?? chart.rowLimit,
        defaultSort: chart.chartConfig.defaultSort,
      },
      sortState: chart.sortState,
      onSortChange:
        active && chart.chartType === "PIVOT_TABLE"
          ? chart.onSortChange
          : undefined,
    }),
    NUMBER: {
      visualization: {
        type: "number" as const,
        value: chart.data.reduce(
          (sum, point) =>
            sum + (typeof point.metric === "number" ? point.metric : 0),
          0,
        ),
        valueFormatter: metricFormatter,
      },
    },
  };
  const prepared = preparedCharts[chart.chartType];
  const content = (() => {
    const { visualization } = prepared;
    if (visualization.type === "table" && !visualization.rows.length) {
      if (isLoading) return <div className="h-full" aria-hidden="true" />;
      return (
        <div
          className="text-muted-foreground flex h-full items-center justify-center text-sm"
          role="alert"
        >
          Unable to process data for pivot table
        </div>
      );
    }
    if (visualization.type === "histogram" && !visualization.data.length)
      return (
        <div className="text-muted-foreground flex h-full items-center justify-center">
          No data available
        </div>
      );
    return (
      <VisualizationFrame {...prepared} content={prepared.visualization} />
    );
  })();

  if (props.isExternalLoading) {
    return (
      <div className="bg-background flex items-center justify-center rounded-lg border p-4">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className={cn("relative min-h-0 flex-1", props.className)}>
      {shouldWarn && (
        <VisualizationFrame
          content={{ ...LARGE_DATASET_CONFIRMATION, onConfirm: proceed }}
        />
      )}
      {!shouldWarn &&
        showEmpty &&
        (props.emptyState ?? (
          <VisualizationFrame
            content={
              isLoading
                ? { type: "loading", progress: { type: "spinner" } }
                : { type: "empty" }
            }
          />
        ))}
      {!shouldWarn && !showEmpty && content}
      {chartLoadingState.isLoading && (
        <div className="bg-background/80 absolute inset-0 z-20 backdrop-blur-xs">
          <VisualizationFrame
            content={
              chartLoadingState.showSpinner
                ? {
                    type: "loading",
                    showHintImmediately: chartLoadingState.showHintImmediately,
                    hintText: chartLoadingState.hintText,
                    progress: loadingProgress,
                    layout: props.layoutHint ?? "default",
                  }
                : {
                    type: "error",
                    message:
                      chartLoadingState.hintText ?? "Unable to load chart data",
                    onRetry,
                    layout: props.layoutHint ?? "default",
                  }
            }
          />
        </div>
      )}
    </div>
  );
}
