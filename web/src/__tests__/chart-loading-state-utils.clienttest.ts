// @vitest-environment node

import { RESOURCE_LIMIT_ERROR_MESSAGE } from "@langfuse/shared";
import {
  getChartLoadingProgress,
  getChartLoadingStateProps,
} from "@/src/features/widgets/chart-library/chartLoadingStateUtils";

describe("getChartLoadingStateProps", () => {
  test("returns spinner-only loading props while query is pending", () => {
    expect(
      getChartLoadingStateProps({
        isPending: true,
        isError: false,
      }),
    ).toEqual({
      isLoading: true,
      showSpinner: true,
      showHintImmediately: false,
      hintText: undefined,
    });
  });

  test("returns immediate resource-limit hint when query failed", () => {
    expect(
      getChartLoadingStateProps({
        isPending: false,
        isError: true,
      }),
    ).toEqual({
      isLoading: true,
      showSpinner: false,
      showHintImmediately: true,
      hintText: RESOURCE_LIMIT_ERROR_MESSAGE,
    });
  });

  test("returns hidden state once query has no pending/error state", () => {
    expect(
      getChartLoadingStateProps({
        isPending: false,
        isError: false,
      }),
    ).toEqual({
      isLoading: false,
      showSpinner: false,
      showHintImmediately: false,
      hintText: undefined,
    });
  });

  test("hides progress UI when backend streaming is not available", () => {
    expect(
      getChartLoadingProgress({
        isPending: true,
        progress: null,
        useBackendProgress: false,
      }),
    ).toEqual({ type: "spinner" });
  });

  test("keeps the loading bar visible while waiting for streamed progress", () => {
    expect(
      getChartLoadingProgress({
        isPending: true,
        progress: null,
        useBackendProgress: true,
      }),
    ).toEqual({ type: "indeterminate" });
  });

  test("adapts backend progress to determinate visualization progress", () => {
    expect(
      getChartLoadingProgress({
        isPending: true,
        useBackendProgress: true,
        progress: {
          percent: 0.5,
          read_rows: 50,
          total_rows_to_read: 100,
          elapsed_ns: 0,
          read_bytes: 0,
        },
      }),
    ).toEqual({
      type: "determinate",
      fraction: 0.5,
      read_rows: 50,
      total_rows_to_read: 100,
    });
  });

  test("hides progress after a query completes", () => {
    expect(
      getChartLoadingProgress({
        isPending: false,
        useBackendProgress: true,
        progress: {
          percent: 1,
          read_rows: 100,
          total_rows_to_read: 100,
          elapsed_ns: 0,
          read_bytes: 0,
        },
      }),
    ).toEqual({ type: "spinner" });
  });
});
