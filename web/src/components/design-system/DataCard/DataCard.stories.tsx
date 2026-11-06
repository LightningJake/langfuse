import { expect, fn } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { DataCard } from "./DataCard";

const meta = preview.meta({
  component: DataCard,
  args: {
    title: "Traces",
    metric: { value: "434.15K", description: "Total traces tracked" },
    content: {
      type: "line",
      data: [
        { x: new Date("2026-11-01"), values: { traces: 12 } },
        { x: new Date("2026-11-02"), values: { traces: 24 } },
      ],
      series: [{ id: "traces", label: "Traces", color: "hsl(var(--chart-1))" }],
      xAxis: { type: "time" },
      seriesOverflow: { visibleCount: 1, totalCount: 12 },
    },
  },
  decorators: [
    (Story) => (
      <div className="h-96 max-w-2xl">
        <Story />
      </div>
    ),
  ],
});

export const Ready = meta.story({
  name: "(Test) Ready",
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Traces" })).toBeVisible();
    await expect(canvas.getByText("434.15K")).toBeVisible();
    await expect(canvas.getByText("Showing top 1 of 12 series")).toBeVisible();
  },
});

export const Narrow = meta.story({
  name: "(Test) Narrow",
  render: (args) => (
    <div className="h-96 w-60">
      <DataCard {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    const metric = canvas.getByText("434.15K").getBoundingClientRect();
    const label = canvas
      .getByText("Total traces tracked")
      .getBoundingClientRect();
    await expect(label.top).toBeGreaterThanOrEqual(metric.bottom - 1);
    await expect(Math.abs(label.left - metric.left)).toBeLessThan(2);
  },
});

export const Loading = meta.story({
  name: "(Test) Loading",
  args: { content: { type: "loading", progress: { type: "spinner" } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Traces" })).toBeVisible();
    await expect(canvas.queryByText("434.15K")).not.toBeInTheDocument();
  },
});

export const WithoutMetric = meta.story({ args: { metric: undefined } });

export const Table = meta.story({
  name: "(Test) Table",
  args: {
    title: "Model costs",
    metric: {
      value: "$20.00",
      description: "Total cost",
      documentation: {
        description: "Cost across all models.",
        href: "https://langfuse.com/docs/model-usage-and-cost",
      },
    },
    content: {
      type: "table",
      columns: [
        { id: "model", label: "Model" },
        {
          id: "cost",
          label: "USD",
          align: "right",
          sort: "desc",
          onSort: fn(),
        },
      ],
      rows: [
        {
          id: "provider",
          cells: [
            { columnId: "model", value: "OpenAI" },
            { columnId: "cost", value: "" },
          ],
        },
        ...Array.from({ length: 20 }, (_, index) => ({
          id: String(index),
          cells: [
            { columnId: "model", value: `Model ${index + 1}`, indent: 1 },
            { columnId: "cost", value: "$1.00" },
          ],
        })),
        {
          id: "total",
          emphasis: "total",
          cells: [
            { columnId: "model", value: "Grand total" },
            { columnId: "cost", value: "$20.00" },
          ],
        },
      ],
      collapse: { collapsed: 5, expanded: 22 },
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("table")).toBeVisible();
    await expect(canvas.getByText("Total cost")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Metric documentation" }),
    ).toHaveAttribute("href", "https://langfuse.com/docs/model-usage-and-cost");
  },
});
