import { RESOURCE_LIMIT_ERROR_MESSAGE } from "@langfuse/shared";
import { type QueryProgress } from "@/src/hooks/useSSEDashboardQuery";
import { type Visualization } from "@/src/components/design-system/charts/internal/VisualizationFrame/VisualizationFrame";

type ChartQueryState = {
  isPending: boolean;
  isError: boolean;
  errorMessage?: string | null;
};

type ChartLoadingProps = {
  isLoading: boolean;
  showSpinner: boolean;
  showHintImmediately: boolean;
  hintText?: string;
};

export function getChartLoadingStateProps({
  isPending,
  isError,
  errorMessage,
}: ChartQueryState): ChartLoadingProps {
  return {
    isLoading: isPending || isError,
    showSpinner: isPending,
    showHintImmediately: isError,
    hintText: isError
      ? (errorMessage ?? RESOURCE_LIMIT_ERROR_MESSAGE)
      : undefined,
  };
}

export function getChartLoadingProgress({
  isPending,
  progress,
  useBackendProgress,
}: {
  isPending: boolean;
  progress: QueryProgress | null;
  useBackendProgress: boolean;
}): Extract<Visualization, { type: "loading" }>["progress"] {
  if (!isPending || !useBackendProgress) {
    return { type: "spinner" };
  }

  if (!progress) return { type: "indeterminate" };
  return {
    type: "determinate",
    fraction: progress.percent,
    read_rows: progress.read_rows,
    total_rows_to_read: progress.total_rows_to_read,
  };
}
