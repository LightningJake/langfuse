/* eslint-disable @repo/no-style-props */
import { type FilterState, getGenerationLikeTypes } from "@langfuse/shared";
import { type DataCardActions } from "@/src/components/design-system/DataCard/DataCard";
import { compactNumberFormatter, costFormatter } from "@/src/utils/numbers";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useMemo, useState } from "react";
import { barListToDataPoints } from "@/src/features/dashboard/lib/chart-data-adapters";
import { type QueryType, type ViewVersion } from "@langfuse/shared/query";
import { mapLegacyUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import { WidgetChartCard } from "@/src/features/widgets/components/WidgetChartCard";
import { isChartDataEmpty } from "@/src/features/widgets/chart-library/isChartDataEmpty";
import { traceViewQuery } from "@/src/features/dashboard/lib/dashboard-utils";
import { useScheduledDashboardExecuteQuery } from "@/src/features/dashboard/hooks/DashboardQuerySchedulerProvider";
import { cn } from "@/src/utils/tailwind";

// Cap on bars fetched and rendered; matches TracesBarListCard. The top list
// scrolls within the tile when they don't all fit.
const MAX_BARS = 20;

type BarChartDataPoint = {
  name: string;
  value: number;
};

export const UserConsumptionCard = ({
  actions,
  className,
  projectId,
  globalFilterState,
  fromTimestamp,
  toTimestamp,
  isLoading = false,
  metricsVersion,
  schedulerId,
}: {
  actions?: DataCardActions;
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  isLoading?: boolean;
  metricsVersion: ViewVersion;
  schedulerId?: string;
}) => {
  const userCostQuery: QueryType = {
    view: "observations",
    dimensions: [{ field: "userId" }],
    metrics: [
      { measure: "totalCost", aggregation: "sum" },
      { measure: "count", aggregation: "count" },
    ],
    filters: [
      ...mapLegacyUiTableFilterToView("observations", globalFilterState),
      {
        column: "type",
        operator: "any of",
        value: getGenerationLikeTypes(),
        type: "stringOptions",
      },
    ],
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: [{ field: "sum_totalCost", direction: "desc" }],
    chartConfig: {
      type: "HORIZONTAL_BAR",
      row_limit: MAX_BARS,
    },
  };

  const user = useScheduledDashboardExecuteQuery(
    {
      projectId,
      query: userCostQuery,
      version: metricsVersion,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      queryId: `${schedulerId ?? "home:users"}:cost`,
      enabled: !isLoading,
    },
  );

  const isV2 = metricsVersion === "v2";
  const countField = isV2 ? "uniq_traceId" : "count_count";

  const traceViewBase = traceViewQuery({ metricsVersion, globalFilterState });
  const traceMetric = traceViewBase.metrics[0] ?? {
    aggregation: "count",
    measure: "count",
  };
  const traceCountQuery: QueryType = {
    ...traceViewBase,
    dimensions: [{ field: "userId" }],
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: [
      {
        field: `${traceMetric.aggregation}_${traceMetric.measure}`,
        direction: "desc",
      },
    ],
    chartConfig: {
      type: "HORIZONTAL_BAR",
      row_limit: MAX_BARS,
    },
  };

  const traces = useScheduledDashboardExecuteQuery(
    {
      projectId,
      query: traceCountQuery,
      version: metricsVersion,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      queryId: `${schedulerId ?? "home:users"}:traces`,
      enabled: !isLoading,
    },
  );

  const transformedNumberOfTraces: BarChartDataPoint[] = traces.data
    ? traces.data
        .filter((item) => item.userId !== undefined)
        .map((item) => {
          return {
            name: item.userId as string,
            value: item[countField] ? Number(item[countField]) : 0,
          };
        })
    : [];

  const transformedCost: BarChartDataPoint[] = user.data
    ? user.data
        .filter((item) => item.userId !== undefined)
        .map((item) => {
          return {
            name: (item.userId as string | null | undefined) ?? "Unknown",
            value: item.sum_totalCost ? Number(item.sum_totalCost) : 0,
          };
        })
    : [];

  const totalCost = user.data?.reduce(
    (acc, curr) => acc + (Number(curr.sum_totalCost) || 0),
    0,
  );

  const totalTraces = traces.data?.reduce(
    (acc, curr) => acc + (Number(curr[countField]) || 0),
    0,
  );

  const data = [
    {
      tabTitle: "Token cost",
      data: transformedCost,
      totalMetric: costFormatter(totalCost),
      metricDescription: "Total cost",
      chartMetricLabel: "USD",
      chartUnit: "USD",
    },
    {
      tabTitle: "Count of Traces",
      data: transformedNumberOfTraces,
      totalMetric: totalTraces
        ? compactNumberFormatter(totalTraces)
        : compactNumberFormatter(0),
      metricDescription: "Total traces",
      chartMetricLabel: "Traces",
      chartUnit: "traces",
    },
  ] as const;

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
  const item = data[selectedIndex] ?? data[0];
  const chartData = useMemo(() => barListToDataPoints(item.data), [item.data]);

  return (
    <div className={cn(className, "h-full")}>
      <WidgetChartCard
        chartType="HORIZONTAL_BAR"
        actions={actions}
        title="User consumption"
        tabs={tabs}
        content={(() => {
          if (
            isLoading ||
            (selectedIndex === 0 ? user.isPending : traces.isPending)
          )
            return { type: "loading", progress: { type: "spinner" } };
          if (isChartDataEmpty(chartData))
            return {
              type: "empty",
              description:
                "Consumption per user is tracked by passing their ids on traces.",
              href: "https://langfuse.com/docs/observability/features/users",
            };
          return undefined;
        })()}
        metric={{
          value: item.totalMetric,
          description: item.metricDescription,
        }}
        data={chartData}
        rowLimit={MAX_BARS}
        label={item.chartMetricLabel}
        unit={item.chartUnit}
      />
    </div>
  );
};
