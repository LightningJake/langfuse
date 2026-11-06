/* eslint-disable @repo/no-style-props */
import { type FilterState } from "@langfuse/shared";
import { type DataCardActions } from "@/src/components/design-system/DataCard/DataCard";
import { compactNumberFormatter } from "@/src/utils/numbers";
import {
  type DashboardDateRangeAggregationOption,
  dashboardDateRangeAggregationSettings,
} from "@/src/utils/date-range-utils";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { type QueryType, type ViewVersion } from "@langfuse/shared/query";
import { mapLegacyUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import { WidgetChartCard } from "@/src/features/widgets/components/WidgetChartCard";
import { isChartDataEmpty } from "@/src/features/widgets/chart-library/isChartDataEmpty";
import { timeSeriesToDataPoints } from "@/src/features/dashboard/lib/chart-data-adapters";
import { useScheduledDashboardExecuteQuery } from "@/src/features/dashboard/hooks/DashboardQuerySchedulerProvider";
import { useMemo, useState } from "react";

export const TracesAndObservationsTimeSeriesCard = ({
  actions,
  className,
  projectId,
  globalFilterState,
  fromTimestamp,
  toTimestamp,
  agg,
  isLoading = false,
  metricsVersion,
  schedulerId,
  syncId,
  sync,
}: {
  actions?: DataCardActions;
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  agg: DashboardDateRangeAggregationOption;
  isLoading?: boolean;
  metricsVersion: ViewVersion;
  schedulerId?: string;
  syncId?: string;
  sync?: {
    activeKey: string | undefined;
    onActiveKeyChange: (key: string | undefined) => void;
  };
}) => {
  const isV2 = metricsVersion === "v2";

  const tracesQuery: QueryType = {
    view: "traces",
    dimensions: [],
    metrics: [{ measure: "count", aggregation: "count" }],
    filters: mapLegacyUiTableFilterToView("traces", globalFilterState),
    timeDimension: {
      granularity:
        dashboardDateRangeAggregationSettings[agg].dateTrunc ?? "day",
    },
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  const traces = useScheduledDashboardExecuteQuery(
    {
      projectId,
      query: tracesQuery,
      version: metricsVersion,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      queryId: `${schedulerId ?? "home:traces-time-series"}:traces`,
      enabled: !isLoading && !isV2,
    },
  );

  // Memoized on the raw query result so the reference is stable across the
  // dashboard scheduler's page re-renders — that's what lets the chart's
  // React.memo bail. (LFE-10549)
  const transformedTraces = useMemo(
    () =>
      traces.data
        ? traces.data.map((item) => ({
            ts: new Date(item.time_dimension as any).getTime(),
            values: [{ label: "Traces", value: Number(item.count_count) }],
          }))
        : [],
    [traces.data],
  );

  const total = traces.data?.reduce((acc, item) => {
    return acc + Number(item.count_count);
  }, 0);

  const observationsQuery: QueryType = {
    view: "observations",
    dimensions: [{ field: "level" }],
    metrics: [{ measure: "count", aggregation: "count" }],
    filters: mapLegacyUiTableFilterToView("observations", globalFilterState),
    timeDimension: {
      granularity:
        dashboardDateRangeAggregationSettings[agg].dateTrunc ?? "day",
    },
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  const observations = useScheduledDashboardExecuteQuery(
    {
      projectId,
      query: observationsQuery,
      version: metricsVersion,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      queryId: `${schedulerId ?? "home:traces-time-series"}:observations`,
      enabled: !isLoading,
    },
  );

  const transformedObservations = useMemo(
    () =>
      observations.data
        ? Object.values(
            observations.data.reduce<
              Record<
                number,
                {
                  ts: number;
                  values: { label: string; value: number | undefined }[];
                }
              >
            >((acc, item) => {
              const ts = new Date(item.time_dimension as any).getTime();
              if (!acc[ts]) {
                acc[ts] = {
                  ts,
                  values: [],
                };
              }
              acc[ts].values.push({
                label: item.level as string,
                value: Number(item.count_count),
              });

              return acc;
            }, {}),
          )
        : [],
    [observations.data],
  );

  const totalObservations = observations.data?.reduce((acc, item) => {
    return acc + Number(item.count_count);
  }, 0);

  const data = isV2
    ? [
        {
          tabTitle: "Observations by Level",
          data: transformedObservations,
          totalMetric: totalObservations,
          metricDescription: `Observations tracked`,
          chartMetricLabel: "Observations",
        },
      ]
    : [
        {
          tabTitle: "Traces",
          data: transformedTraces,
          totalMetric: total,
          metricDescription: `Traces tracked`,
          chartMetricLabel: "Traces",
        },
        {
          tabTitle: "Observations by Level",
          data: transformedObservations,
          totalMetric: totalObservations,
          metricDescription: `Observations tracked`,
          chartMetricLabel: "Observations",
        },
      ];

  const [selectedIndex, setSelectedIndex] = useState(0);
  const capture = usePostHogClientCapture();
  const tabs = {
    value: String(selectedIndex < data.length ? selectedIndex : 0),
    options: data.map((item, index) => ({
      value: String(index),
      label: item.tabTitle,
    })),
    onValueChange: (value: string) => {
      const index = Number(value);
      setSelectedIndex(index);
      capture("dashboard:chart_tab_switch", {
        tabLabel: data[index]?.tabTitle,
      });
    },
  };
  const item = data[selectedIndex] ?? data[0]!;
  const chartData = useMemo(
    () => timeSeriesToDataPoints(item.data),
    [item.data],
  );

  return (
    <div className={className}>
      <WidgetChartCard
        chartType="LINE_TIME_SERIES"
        actions={actions}
        title={isV2 ? "Observations by time" : "Traces by time"}
        tabs={tabs}
        content={(() => {
          if (
            isLoading ||
            observations.isPending ||
            (!isV2 && traces.isPending)
          )
            return { type: "loading", progress: { type: "spinner" } };
          if (isChartDataEmpty(chartData))
            return {
              type: "empty",
              description:
                "Traces contain details about LLM applications and can be created using the SDK.",
              href: "https://langfuse.com/docs/observability/overview",
            };
          return undefined;
        })()}
        metric={{
          description: item.metricDescription,
          value: item.totalMetric
            ? compactNumberFormatter(item.totalMetric)
            : compactNumberFormatter(0),
        }}
        data={chartData}
        label={item.chartMetricLabel}
        // Counts are additive: the legend total reconciles with
        // the card headline. (LFE-10498)
        legendSummary="sum"
        syncId={syncId}
        sync={sync}
        // Additive counts: a bucket without data honestly counts 0. (LFE-10694)
        missingValue="zero"
      />
    </div>
  );
};
