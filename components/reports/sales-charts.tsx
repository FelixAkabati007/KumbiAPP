"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { SalesData } from "@/lib/types";

interface SalesChartsProps {
  data: SalesData[];
}

export default function SalesCharts({ data }: SalesChartsProps) {
  // 1. Revenue by Category
  const categoryData = useMemo(() => {
    const categories: Record<string, number> = {};
    data.forEach((order) => {
      order.items.forEach((item) => {
        const cat = item.category || "other";
        categories[cat] = (categories[cat] || 0) + item.price * item.quantity;
      });
    });

    return Object.entries(categories).map(([name, value]) => ({
      name,
      value,
    }));
  }, [data]);

  // 2. Revenue by Payment Method
  const paymentData = useMemo(() => {
    const methods: Record<string, number> = {};
    data.forEach((order) => {
      const method = order.paymentMethod || "unknown";
      methods[method] = (methods[method] || 0) + order.total;
    });
    return Object.entries(methods).map(([name, value]) => ({
      name,
      value,
    }));
  }, [data]);

  // 3. Revenue Over Time (Daily)
  const timelineData = useMemo(() => {
    const timeline: Record<string, number> = {};
    data.forEach((order) => {
      const date = new Date(order.date).toLocaleDateString();
      timeline[date] = (timeline[date] || 0) + order.total;
    });
    return Object.entries(timeline)
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [data]);

  const categoryConfig = {
    revenue: {
      label: "Revenue",
      color: "hsl(var(--chart-1))",
    },
  } satisfies ChartConfig;

  const paymentConfig = {
    revenue: {
      label: "Revenue",
      color: "hsl(var(--chart-2))",
    },
  } satisfies ChartConfig;

  const timelineConfig = {
    total: {
      label: "Total Revenue",
      color: "hsl(var(--chart-3))",
    },
  } satisfies ChartConfig;

  if (data.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        No data available for charts
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-6">
      {/* Category Bar Chart */}
      <Card className="col-span-1 lg:col-span-1">
        <CardHeader>
          <CardTitle>Revenue by Category</CardTitle>
          <CardDescription>
            Breakdown of sales across categories
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={categoryConfig}>
            <BarChart data={categoryData}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="name"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                tickFormatter={(value) => value.slice(0, 3)}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
              />
              <Bar dataKey="value" fill="var(--color-revenue)" radius={8} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Payment Method Pie Chart */}
      <Card className="col-span-1 lg:col-span-1">
        <CardHeader>
          <CardTitle>Payment Methods</CardTitle>
          <CardDescription>Distribution of payment types</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={paymentConfig}>
            <PieChart>
              <Pie
                data={paymentData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                fill="var(--color-revenue)"
              >
                {paymentData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={`hsl(var(--chart-${(index % 5) + 1}))`}
                  />
                ))}
              </Pie>
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
            </PieChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Timeline Line Chart */}
      <Card className="col-span-1 lg:col-span-1 md:col-span-2">
        <CardHeader>
          <CardTitle>Revenue Trend</CardTitle>
          <CardDescription>Daily revenue performance</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={timelineConfig}>
            <LineChart
              data={timelineData}
              margin={{
                top: 5,
                right: 10,
                left: 10,
                bottom: 0,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  });
                }}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
              />
              <Line
                type="natural"
                strokeWidth={2}
                dataKey="total"
                stroke="var(--color-total)"
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
