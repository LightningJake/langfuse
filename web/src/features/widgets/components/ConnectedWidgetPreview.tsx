import { useMemo, type ComponentProps } from "react";
import { type WidgetChartCard } from "./WidgetChartCard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { AlertCircle } from "@langfuse/icons";
import { api } from "@/src/utils/api";
import { getResultUnit } from "@langfuse/shared/query";
import { type FormatMetricOptions } from "../chart-library/chart-props";
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
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import { isTimeSeriesChart } from "@/src/features/widgets/chart-library/utils";
import {
  getChartLoadingProgress,
  getChartLoadingStateProps,
} from "@/src/features/widgets/chart-library/chartLoadingStateUtils";
import {
  formatMetricName,
  getWidgetMetricPresentation,
  getWidgetMissingBucketValue,
} from "@/src/features/widgets/utils";
import { type WidgetFormState } from "./WidgetForm";

type ConnectedWidgetPreviewProps = Pick<
  WidgetFormState,
  | "projectId"
  | "query"
  | "viewVersion"
  | "queryValidation"
  | "chartType"
  | "values"
  | "selectedAggregation"
  | "selectedDimension"
  | "selectedMeasure"
  | "selectedView"
  | "effectiveSort"
  | "previewSortState"
  | "pivotDimensionFields"
  | "displayName"
  | "displayDescription"
>;

export function ConnectedWidgetPreview(props: ConnectedWidgetPreviewProps) {
  const {
    viewVersion,
    queryValidation,
    chartType,
    values,
    selectedAggregation,
    selectedMeasure,
    selectedView,
    effectiveSort,
    previewSortState,
    pivotDimensionFields,
    displayName,
    displayDescription,
  } = props;
  const {
    queryResult,
    chartLoadingState,
    loadingProgress,
    transformedData,
    chartPresentation,
  } = useWidgetPreviewData(props);

  const { shouldWarn, proceed } = useLargeDatasetGuard(
    transformedData.length,
    false,
  );
  const showEmpty =
    (isTimeSeriesChart(chartType) ||
      chartType === "NUMBER" ||
      chartType === "HISTOGRAM" ||
      chartType === "PIVOT_TABLE") &&
    (chartType === "NUMBER" || !queryResult.isPending) &&
    isChartDataEmpty(transformedData);

  const chartConfig: NonNullable<
    ComponentProps<typeof WidgetChartCard>["chartConfig"]
  > = (() => {
    if (chartType === "PIVOT_TABLE") {
      return {
        type: chartType,
        dimensions: pivotDimensionFields,
        row_limit: values.chart.rowLimit,
        metrics: values.metrics.map(
          (metric) => `${metric.aggregation}_${metric.measure}`,
        ),
        units: values.metrics.map((metric) =>
          getResultUnit(
            selectedView,
            metric.measure,
            metric.aggregation,
            viewVersion,
          ),
        ),
        defaultSort: effectiveSort ?? undefined,
      };
    }
    if (chartType === "HISTOGRAM") {
      return {
        type: chartType,
        bins: values.chart.bins,
        unit: getResultUnit(
          selectedView,
          selectedMeasure,
          selectedAggregation,
          viewVersion,
        ),
      };
    }
    return {
      type: chartType,
      row_limit: values.chart.rowLimit,
      unit: getResultUnit(
        selectedView,
        selectedMeasure,
        selectedAggregation,
        viewVersion,
      ),
    };
  })();

  const metricFormatter = useMemo(
    () =>
      chartPresentation?.metricFormatter ??
      ((value: number, options: FormatMetricOptions) =>
        formatMetric(value, { ...options, unit: chartConfig.unit })),
    [chartPresentation?.metricFormatter, chartConfig.unit],
  );
  const config = useMemo(() => {
    if (!chartPresentation) return undefined;
    return {
      metric: {
        label: chartPresentation.label,
        theme: { light: "hsl(var(--chart-1))", dark: "hsl(var(--chart-1))" },
      },
    };
  }, [chartPresentation]);
  const active =
    queryValidation.valid &&
    Boolean(queryResult.data || chartLoadingState.isLoading) &&
    !shouldWarn &&
    !showEmpty;
  const common = {
    config,
    metricFormatter,
    missingValue: getWidgetMissingBucketValue(selectedAggregation),
  };
  const preparedCharts = {
    LINE_TIME_SERIES: useLineChartTimeSeries({
      ...common,
      data: active && chartType === "LINE_TIME_SERIES" ? transformedData : [],
      showDataPointDots: chartConfig.show_data_point_dots ?? false,
    }),
    AREA_TIME_SERIES: useAreaChartTimeSeries({
      ...common,
      data: active && chartType === "AREA_TIME_SERIES" ? transformedData : [],
    }),
    BAR_TIME_SERIES: useVerticalBarChartTimeSeries({
      ...common,
      data: active && chartType === "BAR_TIME_SERIES" ? transformedData : [],
    }),
    HORIZONTAL_BAR: useTopListChart({
      ...common,
      data:
        active && chartType === "HORIZONTAL_BAR"
          ? transformedData.slice(0, values.chart.rowLimit)
          : [],
    }),
    VERTICAL_BAR: useVerticalBarChart({
      ...common,
      data:
        active && chartType === "VERTICAL_BAR"
          ? transformedData.slice(0, values.chart.rowLimit)
          : [],
    }),
    PIE: usePieChart({
      metricFormatter,
      data:
        active && chartType === "PIE"
          ? transformedData.slice(0, values.chart.rowLimit)
          : [],
    }),
    HISTOGRAM: useHistogramChart({
      ...common,
      data: active && chartType === "HISTOGRAM" ? transformedData : [],
    }),
    PIVOT_TABLE: usePivotTable({
      data: active && chartType === "PIVOT_TABLE" ? transformedData : [],
      config: {
        dimensions: chartConfig.dimensions ?? [],
        metrics: chartConfig.metrics ?? ["metric"],
        units: chartConfig.units,
        rowLimit: chartConfig.row_limit ?? values.chart.rowLimit,
        defaultSort: chartConfig.defaultSort,
      },
      sortState: chartType === "PIVOT_TABLE" ? previewSortState : undefined,
    }),
    NUMBER: {
      visualization: {
        type: "number" as const,
        value: transformedData.reduce(
          (sum, point) =>
            sum + (typeof point.metric === "number" ? point.metric : 0),
          0,
        ),
        valueFormatter: metricFormatter,
      },
    },
  };
  const prepared = preparedCharts[chartType];
  const content = (() => {
    const { visualization } = prepared;
    if (visualization.type === "table" && !visualization.rows.length) {
      if (queryResult.isPending)
        return <div className="h-full" aria-hidden="true" />;
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
    return <VisualizationFrame content={prepared.visualization} />;
  })();

  return (
    <div className="w-2/3">
      <Card className="flex aspect-video flex-col">
        <CardHeader>
          <CardTitle className="truncate" title={displayName}>
            {displayName}
          </CardTitle>
          <CardDescription className="truncate" title={displayDescription}>
            {displayDescription}
          </CardDescription>
        </CardHeader>
        {!queryValidation.valid && (
          <CardContent>
            <div className="flex h-[300px] items-center justify-center">
              <div className="w-full max-w-sm">
                <Alert variant="destructive" icon={AlertCircle}>
                  <Alert.Title>Invalid query</Alert.Title>
                  <Alert.Description>
                    {queryValidation.reason}
                  </Alert.Description>
                </Alert>
              </div>
            </div>
          </CardContent>
        )}
        {queryValidation.valid &&
          (queryResult.data || chartLoadingState.isLoading) && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="relative min-h-0 flex-1">
                {shouldWarn && (
                  <VisualizationFrame
                    content={{
                      ...LARGE_DATASET_CONFIRMATION,
                      onConfirm: proceed,
                    }}
                  />
                )}
                {!shouldWarn && showEmpty && (
                  <VisualizationFrame
                    content={
                      queryResult.isPending
                        ? { type: "loading", progress: { type: "spinner" } }
                        : { type: "empty" }
                    }
                  />
                )}
                {!shouldWarn && !showEmpty && content}
                {chartLoadingState.isLoading && (
                  <div className="bg-background/80 absolute inset-0 z-20 backdrop-blur-xs">
                    <VisualizationFrame
                      content={
                        chartLoadingState.showSpinner
                          ? {
                              type: "loading",
                              showHintImmediately:
                                chartLoadingState.showHintImmediately,
                              hintText: chartLoadingState.hintText,
                              progress: loadingProgress,
                            }
                          : {
                              type: "error",
                              message:
                                chartLoadingState.hintText ??
                                "Unable to load chart data",
                            }
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        {queryValidation.valid &&
          !queryResult.data &&
          !chartLoadingState.isLoading && (
            <CardContent>
              <div className="flex h-[300px] items-center justify-center">
                <p className="text-muted-foreground">
                  Waiting for Input / Loading...
                </p>
              </div>
            </CardContent>
          )}
      </Card>
    </div>
  );
}

function useWidgetPreviewData({
  projectId,
  query,
  viewVersion,
  queryValidation,
  chartType,
  values,
  selectedAggregation,
  selectedDimension,
  selectedMeasure,
  selectedView,
}: ConnectedWidgetPreviewProps) {
  const queryResult = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query,
      version: viewVersion,
    },
    {
      trpc: { context: { skipBatch: true } },
      meta: { silentHttpCodes: [412, 422] },
      enabled: queryValidation.valid,
    },
  );

  const chartLoadingState = getChartLoadingStateProps({
    isPending: queryResult.isPending,
    isError: queryResult.isError,
  });
  const loadingProgress = getChartLoadingProgress({
    isPending: queryResult.isPending,
    progress: null,
    useBackendProgress: false,
  });

  const transformedData: DataPoint[] = useMemo(
    () =>
      queryResult.data?.map((item) => {
        const timeDimension =
          typeof item["time_dimension"] === "string"
            ? item["time_dimension"]
            : undefined;
        if (chartType === "PIVOT_TABLE") {
          return {
            ...item,
            dimension:
              values.dimensions.length > 0
                ? values.dimensions[0].field
                : "dimension",
            metric: 0,
            time_dimension: timeDimension,
          };
        }
        const metricField = `${selectedAggregation}_${selectedMeasure}`;
        const metric = item[metricField];
        const dimensionField = selectedDimension;
        const dimensionValue = item[dimensionField];
        const isTimeSeries = isTimeSeriesChart(chartType);

        const isFillerMetricValue =
          metric == null ||
          (getWidgetMissingBucketValue(selectedAggregation) === "zero" &&
            Number(metric) === 0);
        if (
          isTimeSeries &&
          dimensionField !== "none" &&
          (dimensionValue === null || dimensionValue === "") &&
          isFillerMetricValue
        ) {
          return {
            dimension: undefined,
            metric: null,
            time_dimension: timeDimension,
          };
        }

        return {
          dimension:
            dimensionValue !== undefined && dimensionField !== "none"
              ? (() => {
                  const val = dimensionValue;
                  if (val === null || val === undefined || val === "")
                    return "n/a";
                  if (typeof val === "string") return val;
                  if (Array.isArray(val)) return val.join(", ");
                  return String(val);
                })()
              : formatMetricName(metricField),
          metric: (() => {
            if (Array.isArray(metric)) {
              return metric.map((bucket: unknown) =>
                Array.isArray(bucket) ? bucket.map(Number) : [],
              );
            }
            if (isTimeSeries && metric == null) return null;
            return Number(metric || 0);
          })(),
          time_dimension: timeDimension,
        };
      }) ?? [],
    [
      queryResult.data,
      selectedAggregation,
      selectedDimension,
      selectedMeasure,
      chartType,
      values.dimensions,
    ],
  );

  const chartPresentation = useMemo(() => {
    if (chartType === "PIVOT_TABLE") return undefined;
    return getWidgetMetricPresentation({
      metric: { measure: selectedMeasure, agg: selectedAggregation },
      view: selectedView,
      version: viewVersion,
    });
  }, [
    selectedAggregation,
    chartType,
    selectedMeasure,
    selectedView,
    viewVersion,
  ]);

  return {
    queryResult,
    chartLoadingState,
    loadingProgress,
    transformedData,
    chartPresentation,
  };
}
