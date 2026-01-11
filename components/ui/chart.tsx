"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import type {
  ResponsiveContainerProps,
  TooltipProps as RechartsTooltipProps,
  LegendProps,
} from "recharts";

import { cn } from "@/lib/utils";

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { light: "", dark: ".dark" } as const;

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode;
    icon?: React.ComponentType;
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  );
};

type ChartContextProps = {
  config: ChartConfig;
};

// Type guards for payload validation
function isValidPayload(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === "object" && payload !== null;
}

function hasPayloadProperty(
  payload: Record<string, unknown>,
  key: string,
): boolean {
  return key in payload && payload[key] !== undefined && payload[key] !== null;
}

// Type-safe payload extraction
function extractPayloadValue(
  payload: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);

  if (!context) {
    console.error("[Chart] useChart must be used within a <ChartContainer />");
    throw new Error("useChart must be used within a <ChartContainer />");
  }

  return context;
}

const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    config: ChartConfig;
    children: ResponsiveContainerProps["children"];
  }
>(({ id, className, children, config, ...props }, ref) => {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        ref={ref}
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-polar-grid_]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_]:stroke-border [&_.recharts-sector]:stroke-transparent [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
});
ChartContainer.displayName = "ChartContainer";

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(
    ([, cfg]) => cfg.theme || cfg.color,
  );

  if (!colorConfig.length) {
    return null;
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(
            ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, itemConfig]) => {
    const color =
      itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ||
      itemConfig.color;
    return color ? `  --color-${key}: ${color};` : null;
  })
  .join("\n")}
}
`,
          )
          .join("\n"),
      }}
    />
  );
};

const ResponsiveContainer = dynamic(
  async () => {
    console.log("[Chart] Loading ResponsiveContainer dynamically");
    const mod = await import("recharts");
    return mod.ResponsiveContainer;
  },
  { ssr: false },
);

// Improved type safety for ChartTooltip
type RechartsTooltipComponent = React.ComponentType<
  RechartsTooltipProps<number, string>
>;

const ChartTooltip = dynamic(
  async (): Promise<RechartsTooltipComponent> => {
    console.log("[Chart] Loading Tooltip dynamically");
    const mod = await import("recharts");
    return mod.Tooltip as RechartsTooltipComponent;
  },
  { ssr: false },
);

const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  RechartsTooltipProps<number, string> &
    React.ComponentProps<"div"> & {
      hideLabel?: boolean;
      hideIndicator?: boolean;
      indicator?: "line" | "dot" | "dashed";
      nameKey?: string;
      labelKey?: string;
    }
>(
  (
    {
      active,
      payload,
      className,
      indicator = "dot",
      hideLabel = false,
      hideIndicator = false,
      label,
      labelFormatter,
      formatter,
      color,
      nameKey,
      labelKey,
    },
    ref,
  ) => {
    const { config } = useChart();

    console.log("[Chart] ChartTooltipContent render:", {
      active,
      payloadLength: payload?.length,
      label,
      hideLabel,
      hideIndicator,
    });

    const tooltipLabel = React.useMemo(() => {
      if (hideLabel || !payload?.length) {
        console.log("[Chart] No tooltip label - hideLabel or empty payload");
        return null;
      }

      const [item] = payload;
      if (!item || !isValidPayload(item)) {
        console.warn("[Chart] Invalid payload item:", item);
        return null;
      }

      const key = labelKey || item.dataKey || item.name;
      if (!key || typeof key !== "string") {
        console.warn("[Chart] Invalid key for tooltip label:", key);
        return null;
      }

      const itemConfig = getPayloadConfigFromPayload(config, item, key);

      const labelValue =
        labelFormatter && typeof label === "string"
          ? labelFormatter(label, payload)
          : !labelKey && typeof label === "string"
            ? config[label as keyof typeof config]?.label || label
            : itemConfig?.label;

      console.log("[Chart] Tooltip label computed:", labelValue);
      return labelValue;
    }, [hideLabel, payload, label, labelFormatter, labelKey, config]);

    if (!active || !payload?.length) {
      console.log("[Chart] Tooltip not active or no payload");
      return null;
    }

    const nestLabel = payload.length === 1 && indicator !== "dot";

    console.log("[Chart] Rendering tooltip content with nestLabel:", nestLabel);

    return (
      <div
        ref={ref}
        className={cn(
          "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
          className,
        )}
      >
        {!nestLabel ? tooltipLabel : null}
        <div className="grid gap-1.5">
          {payload.map((item, index) => {
            if (!isValidPayload(item)) {
              console.warn("[Chart] Skipping invalid payload item:", item);
              return null;
            }

            const key = `${nameKey || item.dataKey || item.name || "value"}`;
            const itemConfig = getPayloadConfigFromPayload(config, item, key);

            // Safely access payload properties
            const payloadFill =
              isValidPayload(item.payload) &&
              typeof item.payload.fill === "string"
                ? item.payload.fill
                : undefined;
            const indicatorColor =
              color ||
              payloadFill ||
              (typeof item.color === "string" ? item.color : undefined);

            console.log("[Chart] Rendering payload item:", {
              key,
              value: item.value,
              indicatorColor,
              itemConfig: !!itemConfig,
            });

            return (
              <div
                key={
                  typeof item.dataKey === "string"
                    ? item.dataKey
                    : typeof item.name === "string"
                      ? item.name
                      : `item-${index}`
                }
                className={cn(
                  "flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground",
                  indicator === "dot" && "items-center",
                )}
              >
                {formatter &&
                item?.value !== undefined &&
                typeof item.name === "string" ? (
                  formatter(
                    typeof item.value === "number" ? item.value : 0,
                    item.name,
                    item,
                    index,
                    payload,
                  )
                ) : (
                  <>
                    {itemConfig?.icon ? (
                      <itemConfig.icon />
                    ) : (
                      !hideIndicator && (
                        <div
                          className={cn(
                            "shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg]",
                            {
                              "h-2.5 w-2.5": indicator === "dot",
                              "w-1": indicator === "line",
                              "w-0 border-[1.5px] border-dashed bg-transparent":
                                indicator === "dashed",
                              "my-0.5": nestLabel && indicator === "dashed",
                            },
                          )}
                          style={
                            {
                              "--color-bg": indicatorColor,
                              "--color-border": indicatorColor,
                            } as React.CSSProperties
                          }
                        />
                      )
                    )}
                    <div
                      className={cn(
                        "flex flex-1 justify-between leading-none",
                        nestLabel ? "items-end" : "items-center",
                      )}
                    >
                      <div className="grid gap-1.5">
                        {nestLabel ? tooltipLabel : null}
                        <span className="text-muted-foreground">
                          {typeof itemConfig?.label === "string"
                            ? itemConfig.label
                            : typeof item.name === "string"
                              ? item.name
                              : "Unknown"}
                        </span>
                      </div>
                      {item.value !== undefined && item.value !== null && (
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {typeof item.value === "string" ||
                          typeof item.value === "number"
                            ? String(item.value)
                            : "N/A"}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);
ChartTooltipContent.displayName = "ChartTooltip";

// Improved type safety for ChartLegend
type RechartsLegendComponent = React.ComponentType<LegendProps>;

const ChartLegend = dynamic(
  async (): Promise<RechartsLegendComponent> => {
    console.log("[Chart] Loading Legend dynamically");
    const mod = await import("recharts");
    return mod.Legend as RechartsLegendComponent;
  },
  { ssr: false },
);

const ChartLegendContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> &
    Pick<LegendProps, "payload" | "verticalAlign"> & {
      hideIcon?: boolean;
      nameKey?: string;
    }
>(
  (
    { className, hideIcon = false, payload, verticalAlign = "bottom", nameKey },
    ref,
  ) => {
    const { config } = useChart();

    console.log("[Chart] ChartLegendContent render:", {
      payloadLength: payload?.length,
      hideIcon,
      verticalAlign,
    });

    if (!payload?.length) {
      console.log("[Chart] No legend payload");
      return null;
    }

    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center justify-center gap-4",
          verticalAlign === "top" ? "pb-3" : "pt-3",
          className,
        )}
      >
        {payload.map((item, index) => {
          if (!isValidPayload(item)) {
            console.warn("[Chart] Skipping invalid legend item:", item);
            return null;
          }

          const key = `${nameKey || item.dataKey || "value"}`;
          const itemConfig = getPayloadConfigFromPayload(config, item, key);

          console.log("[Chart] Rendering legend item:", {
            key,
            dataKey: item.dataKey,
            value: item.value,
            itemConfig: !!itemConfig,
          });

          return (
            <div
              key={item.dataKey ?? item.value ?? index}
              className={cn(
                "flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground",
              )}
            >
              {itemConfig?.icon && !hideIcon ? (
                <itemConfig.icon />
              ) : (
                <div
                  className="h-2 w-2 shrink-0 rounded-[2px]"
                  style={{
                    backgroundColor: item.color,
                  }}
                />
              )}
              {itemConfig?.label}
            </div>
          );
        })}
      </div>
    );
  },
);
ChartLegendContent.displayName = "ChartLegend";

// Improved type safety for payload configuration extraction
function getPayloadConfigFromPayload(
  config: ChartConfig,
  payload: unknown,
  key: string,
) {
  console.log("[Chart] Getting payload config:", { payload, key });

  if (!isValidPayload(payload)) {
    console.warn("[Chart] Invalid payload for config extraction:", payload);
    return undefined;
  }

  const payloadPayload =
    hasPayloadProperty(payload, "payload") && isValidPayload(payload.payload)
      ? payload.payload
      : undefined;

  let configLabelKey: string = key;

  // Type-safe property access
  const directValue = extractPayloadValue(payload, key);
  if (directValue) {
    configLabelKey = directValue;
    console.log("[Chart] Using direct payload value:", configLabelKey);
  } else if (payloadPayload) {
    const nestedValue = extractPayloadValue(payloadPayload, key);
    if (nestedValue) {
      configLabelKey = nestedValue;
      console.log("[Chart] Using nested payload value:", configLabelKey);
    }
  }

  const result =
    configLabelKey in config
      ? config[configLabelKey]
      : config[key as keyof typeof config];

  console.log("[Chart] Payload config result:", {
    configLabelKey,
    hasConfig: !!result,
  });
  return result;
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
};
