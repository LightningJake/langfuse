/* eslint-disable no-nested-ternary */
import { useEffect, useState, type ComponentProps } from "react";
import { SLOW_QUERY_HINT_TEXT, truncate } from "@langfuse/shared";
import { Tooltip } from "../../../Tooltip/Tooltip";
import { ExpandToggle } from "../../../ExpandToggle/ExpandToggle";
import { useFitRowCount } from "./useFitRowCount";
import { cn } from "@/src/utils/tailwind";
import { LineChart } from "../../LineChart/LineChart";
import { AreaChart } from "../../AreaChart/AreaChart";
import { BarChart } from "../../BarChart/BarChart";
import { HorizontalBarChart } from "../../HorizontalBarChart/HorizontalBarChart";
import { StackedBarChart } from "../../StackedBarChart/StackedBarChart";
import { GroupedBarChart } from "../../GroupedBarChart/GroupedBarChart";
import { PieChart } from "../../PieChart/PieChart";
import { HistogramChart } from "../../HistogramChart/HistogramChart";
import { ValueChart } from "../../ValueChart/ValueChart";
import { assertUnreachable } from "@/src/utils/types";
import { AlertCircle } from "@langfuse/icons";
import { Button } from "../../../Button/Button";
import { Spinner } from "../../../Spinner/Spinner";

export type Visualization =
  | ({ type: "loading" } & Pick<
      ComponentProps<typeof ChartLoadingState>,
      | "progress"
      | "hintText"
      | "hintDelayMs"
      | "showHintImmediately"
      | "spinnerLabel"
      | "layout"
    >)
  | { type: "empty"; message?: string; description?: string; href?: string }
  | ({ type: "error"; message: string } & Pick<
      ComponentProps<typeof ChartLoadingState>,
      "onRetry" | "layout"
    >)
  | {
      type: "confirmation";
      title: string;
      description: string;
      actionLabel: string;
      onConfirm: () => void;
    }
  | ({ type: "line" } & SeriesOverflowProps & ComponentProps<typeof LineChart>)
  | ({ type: "area" } & SeriesOverflowProps & ComponentProps<typeof AreaChart>)
  | ({ type: "bar" } & ComponentProps<typeof BarChart>)
  | ({ type: "horizontal-bar" } & ComponentProps<typeof HorizontalBarChart>)
  | ({ type: "stacked-bar" } & SeriesOverflowProps &
      ComponentProps<typeof StackedBarChart>)
  | ({ type: "grouped-bar" } & SeriesOverflowProps &
      ComponentProps<typeof GroupedBarChart>)
  | ({ type: "pie" } & ComponentProps<typeof PieChart>)
  | ({ type: "histogram" } & ComponentProps<typeof HistogramChart>)
  | ({ type: "number" } & ComponentProps<typeof ValueChart>)
  | ({ type: "table" } & DataTableProps);

type SeriesOverflowProps = {
  seriesOverflow?: { visibleCount: number; totalCount: number };
};

export function VisualizationFrame({ content }: { content: Visualization }) {
  const seriesOverflow =
    content.type === "line" ||
    content.type === "area" ||
    content.type === "stacked-bar" ||
    content.type === "grouped-bar"
      ? content.seriesOverflow
      : undefined;
  const renderedContent = (() => {
    if (content.type === "confirmation")
      return (
        <div className="flex size-full flex-col items-center justify-center gap-4 p-6 text-center">
          <AlertCircle size="lg" aria-hidden />
          <h3 className="text-lg font-bold">{content.title}</h3>
          <p className="text-muted-foreground text-sm">{content.description}</p>
          <Button
            variant="outline"
            text={content.actionLabel}
            onClick={content.onConfirm}
          />
        </div>
      );
    if (content.type === "loading") return <ChartLoadingState {...content} />;
    if (content.type === "error")
      return (
        <ChartLoadingState
          showSpinner={false}
          progress={{ type: "spinner" }}
          showHintImmediately
          hintText={content.message}
          onRetry={content.onRetry}
          layout={content.layout}
        />
      );
    if (content.type === "empty")
      return (
        <div
          className="text-muted-foreground flex size-full flex-col items-center justify-center gap-2 rounded-md border border-dashed p-4 text-center"
          role="status"
        >
          <p>{content.message ?? "No data"}</p>
          {content.description && (
            <p className="text-sm">{content.description}</p>
          )}
          {content.href && (
            <a
              href={content.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm underline underline-offset-2"
            >
              Read docs
            </a>
          )}
        </div>
      );
    if (content.type === "line") return <LineChart {...content} />;
    if (content.type === "area") return <AreaChart {...content} />;
    if (content.type === "bar") return <BarChart {...content} />;
    if (content.type === "horizontal-bar")
      return <HorizontalBarChart {...content} />;
    if (content.type === "stacked-bar") return <StackedBarChart {...content} />;
    if (content.type === "grouped-bar") return <GroupedBarChart {...content} />;
    if (content.type === "pie") return <PieChart {...content} />;
    if (content.type === "histogram") return <HistogramChart {...content} />;
    if (content.type === "number") return <ValueChart {...content} />;
    if (content.type === "table") return <DataTable {...content} />;
    return assertUnreachable(content);
  })();
  return (
    <div className="flex size-full min-w-0 flex-col">
      {seriesOverflow &&
        seriesOverflow.totalCount > seriesOverflow.visibleCount && (
          <p className="text-muted-foreground shrink-0 pb-1 text-right text-xs">
            Showing top {seriesOverflow.visibleCount} of{" "}
            {seriesOverflow.totalCount} series
          </p>
        )}
      <div className="flex min-h-0 flex-1 flex-col">{renderedContent}</div>
    </div>
  );
}

const DEFAULT_HINT_DELAY_MS = 2000;
const PROGRESS_REVEAL_DELAY_MS = 1000;

function formatRows(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function QueryProgressBar({
  progress,
  layout = "default",
}: {
  progress: Extract<
    ChartLoadingStateProps["progress"],
    { type: "indeterminate" | "determinate" }
  >;
  layout?: "default" | "compact" | "tight";
}) {
  const hasProgress = progress.type === "determinate";
  const percent = hasProgress
    ? Math.max(0, Math.min(progress.fraction * 100, 100))
    : 0;
  const compactLayout = layout !== "default";
  return (
    <div className="w-full min-w-0">
      <div
        role="progressbar"
        aria-label="Query progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={hasProgress ? Math.round(percent) : undefined}
        className={cn(
          "bg-muted/80 overflow-hidden rounded-full",
          compactLayout ? "h-1.5" : "h-2",
        )}
      >
        {hasProgress ? (
          <div
            className="bg-primary/60 h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${percent}%` }}
          />
        ) : null}
      </div>
      {layout !== "tight" ? (
        <p
          className={cn(
            "text-muted-foreground mt-2 tabular-nums",
            compactLayout ? "text-[11px] leading-4" : "text-xs",
          )}
        >
          {hasProgress
            ? `Reading ${formatRows(progress.read_rows)} / ~${formatRows(progress.total_rows_to_read)} rows`
            : "Reading query progress..."}
        </p>
      ) : null}
    </div>
  );
}

type ChartLoadingStateProps = {
  spinnerLabel?: string;
  hintText?: string;
  hintDelayMs?: number;
  showSpinner?: boolean;
  showHintImmediately?: boolean;
  progress:
    | { type: "spinner" }
    | { type: "indeterminate" }
    | {
        type: "determinate";
        /** Completion fraction between 0 and 1. */
        fraction: number;
        read_rows: number;
        total_rows_to_read: number;
      };
  layout?: "default" | "compact" | "tight";
  onRetry?: () => void;
};

function ChartLoadingState(props: ChartLoadingStateProps) {
  return (
    <ChartLoadingStateContent
      key={`${props.showSpinner !== false}-${props.progress.type !== "spinner"}`}
      {...props}
    />
  );
}

function ChartLoadingStateContent({
  spinnerLabel = "Loading chart data",
  hintText = SLOW_QUERY_HINT_TEXT,
  hintDelayMs = DEFAULT_HINT_DELAY_MS,
  showSpinner = true,
  showHintImmediately = false,
  progress,
  layout = "default",
  onRetry,
}: ChartLoadingStateProps) {
  const [showHint, setShowHint] = useState(false);
  const [showProgressPhase, setShowProgressPhase] = useState(false);
  const shouldShowProgress = progress.type !== "spinner";
  const isPendingProgressState = showSpinner && shouldShowProgress;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setShowHint(true), hintDelayMs);
    return () => window.clearTimeout(timeoutId);
  }, [hintDelayMs]);

  useEffect(() => {
    if (!isPendingProgressState) return;
    const timeoutId = window.setTimeout(
      () => setShowProgressPhase(true),
      PROGRESS_REVEAL_DELAY_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [isPendingProgressState]);

  const shouldShowHint = showHintImmediately || showHint;
  const isCompact = layout !== "default";
  const isTight = layout === "tight";
  const isLegacySpinnerOnlyState = showSpinner && !shouldShowProgress;
  const isTightProgressState = isTight && shouldShowProgress;
  const shouldRenderHint = shouldShowHint && !isTightProgressState;
  const shouldRenderRetry = Boolean(onRetry) && shouldShowHint && !showSpinner;

  if (
    isLegacySpinnerOnlyState ||
    (isPendingProgressState && !showProgressPhase)
  ) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label={spinnerLabel}
        className="text-muted-foreground flex h-full w-full items-center justify-center"
      >
        <div className="flex h-4 w-4 items-center justify-center">
          <Spinner size="sm" />
        </div>
      </div>
    );
  }

  const statusTitle = (() => {
    if (isPendingProgressState || shouldShowProgress) return "Running query";
    if (showSpinner) return "Loading widget";
    return "Query needs attention";
  })();

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={spinnerLabel}
      className="text-muted-foreground flex h-full min-h-0 w-full flex-col overflow-hidden"
    >
      <div
        className={cn(
          "m-auto w-full",
          isTightProgressState
            ? "max-w-[12rem] px-3 py-2"
            : "max-w-sm px-4 py-4",
        )}
      >
        <div
          className={cn(
            "flex flex-col",
            isTightProgressState ? "gap-2" : isCompact ? "gap-3" : "gap-4",
          )}
        >
          {!isTightProgressState ? (
            <p
              className={cn(
                "text-foreground font-bold",
                shouldShowProgress ? "text-left" : "text-center",
                isTight ? "text-xs" : "text-sm",
              )}
            >
              {statusTitle}
            </p>
          ) : null}
          {shouldShowProgress ? (
            <QueryProgressBar progress={progress} layout={layout} />
          ) : showSpinner ? (
            <div className="flex h-4 w-4 items-center justify-center self-center">
              <Spinner size="sm" />
            </div>
          ) : null}
          {isTightProgressState ? null : (
            <p
              className={cn(
                "text-muted-foreground",
                shouldShowProgress ? "text-left" : "text-center",
                shouldRenderHint ? "animate-in fade-in-0 duration-300" : "",
                isTight
                  ? "line-clamp-3 min-h-12 text-[11px] leading-4"
                  : isCompact
                    ? "line-clamp-4 min-h-8 text-xs leading-4"
                    : "line-clamp-3 min-h-10 text-xs leading-5",
              )}
            >
              {shouldRenderHint ? (
                hintText
              ) : (
                <span aria-hidden="true">&nbsp;</span>
              )}
            </p>
          )}
          {shouldRenderRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="border-input bg-background hover:bg-accent w-fit self-center rounded-md border px-3 py-2 text-sm font-bold"
            >
              Retry
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;
// Match the rendered cell padding and header height when fitting collapsed rows.
const TABLE_ROW_HEIGHT = 33;
const TABLE_HEADER_HEIGHT = 45;

export type DataTableProps = {
  columns: {
    id: string;
    label: string;
    align?: "left" | "right";
    sort?: "asc" | "desc";
    onSort?: () => void;
  }[];
  rows: {
    id: string;
    emphasis?: "normal" | "subtotal" | "total";
    cells: {
      columnId: string;
      value: string | number;
      title?: string;
      prefix?: string;
      detail?: string;
      truncateAt?: number;
      indent?: number;
    }[];
  }[];
  /** Row limits; the collapsed view may show fewer rows to fit its container. */
  collapse?: { collapsed: number; expanded: number };
};

function DataTable({ columns, rows, collapse }: DataTableProps) {
  const [isExpanded, setExpanded] = useState(false);
  const { containerRef, rowCount } = useFitRowCount({
    rowHeightPx: TABLE_ROW_HEIGHT,
    reservedPx: TABLE_HEADER_HEIGHT,
    min: 1,
    fallback: collapse?.collapsed ?? rows.length,
  });
  const expandedCount = collapse
    ? Math.min(rows.length, Math.max(1, collapse.expanded))
    : rows.length;
  const collapsedCount = collapse
    ? Math.min(rowCount, Math.max(1, collapse.collapsed), expandedCount)
    : rows.length;
  const visibleRows = rows.slice(
    0,
    (() => {
      if (!collapse) return undefined;
      if (isExpanded) return expandedCount;
      return collapsedCount;
    })(),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={containerRef}
        className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden"
      >
        {/* Keep the vertical fade off the horizontal scrollbar. */}
        <div className="scroll-fade-b h-full w-max min-w-full overflow-x-hidden overflow-y-auto">
          <table className="divide-border animate-in animate-out min-w-full divide-y">
            <thead className="bg-background sticky top-0 z-10">
              <tr>
                {columns.map((column) => {
                  const label = (
                    <>
                      {column.label}
                      {column.sort && (
                        <span className="ml-1">
                          {column.sort === "desc" ? "▼" : "▲"}
                        </span>
                      )}
                    </>
                  );
                  return (
                    <th
                      key={column.id}
                      scope="col"
                      aria-sort={
                        column.sort ? ARIA_SORT[column.sort] : undefined
                      }
                      className={cn(
                        "text-primary py-3.5 pr-3 pl-4 text-xs font-bold whitespace-nowrap sm:pl-0",
                        column.align === "right" ? "text-right" : "text-left",
                      )}
                    >
                      {column.onSort ? (
                        <button type="button" onClick={column.onSort}>
                          {label}
                        </button>
                      ) : (
                        label
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-accent divide-y">
              {visibleRows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    row.emphasis === "subtotal" && "bg-muted/30 font-bold",
                    row.emphasis === "total" && "bg-muted/50 font-bold",
                  )}
                >
                  {columns.map((column) => {
                    const cell = row.cells.find(
                      (cell) => cell.columnId === column.id,
                    );
                    if (!cell) return <td key={column.id} />;
                    const text =
                      cell.truncateAt === undefined
                        ? cell.value
                        : truncate(String(cell.value), cell.truncateAt);
                    const content = (
                      <span className="inline-flex items-center gap-2">
                        {cell.prefix && (
                          <span className="text-muted-foreground text-[10px] font-bold tracking-wide uppercase">
                            {cell.prefix}
                          </span>
                        )}
                        <span>{text}</span>
                      </span>
                    );
                    return (
                      <td
                        key={column.id}
                        title={cell.title}
                        className={cn(
                          "text-muted-foreground py-2 pr-2 pl-3 text-xs whitespace-nowrap sm:pl-0",
                          column.align === "right"
                            ? "text-right tabular-nums"
                            : "text-left",
                          cell.indent === 1 && "pl-6 sm:pl-6",
                          cell.indent !== undefined &&
                            cell.indent >= 2 &&
                            "pl-10 sm:pl-10",
                        )}
                      >
                        {cell.detail ? (
                          <Tooltip label={cell.detail}>
                            {({ getTriggerProps }) => (
                              <span tabIndex={0} {...getTriggerProps()}>
                                {content}
                              </span>
                            )}
                          </Tooltip>
                        ) : (
                          content
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {collapse && expandedCount > collapsedCount && (
        <div className="mt-2 flex justify-center">
          <ExpandToggle
            variant="icon"
            expanded={isExpanded}
            onExpandedChange={setExpanded}
            label={
              rows.length > expandedCount
                ? `Show top ${expandedCount}`
                : "Show all"
            }
            expandedLabel="See less"
          />
        </div>
      )}
    </div>
  );
}
