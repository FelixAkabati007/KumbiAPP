"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Loader2, AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { getInventoryUnitDimension } from "@/lib/inventory-units";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface Unit {
  value: string;
  label: string;
  description?: string;
  aliases?: string[];
}

export type UnitDimension = "mass" | "volume" | "count" | "unknown";

export interface UnitCategory {
  category: string;
  units: Unit[];
}

interface UnitSelectProps {
  value?: string | string[];
  onChange: (value: string | string[]) => void;
  multi?: boolean;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  error?: string;
  excludeValues?: string[];
  compatibleDimension?: UnitDimension;
  helperText?: string;
}

const EMPTY_EXCLUDE_VALUES: string[] = [];

// Culinary yield & portion units can be paired with mass, volume, or count inventory items
// via chef yield / culinary conversions (mirrors getCompatibleRecipeUnits in lib/inventory-units.ts).
const UNIVERSAL_RECIPE_PORTION_UNITS = new Set([
  "slice",
  "ladle",
  "scoop",
  "pinch",
  "tsp",
  "tbsp",
  "c",
  "portion",
  "serving",
]);

let cachedCategories: UnitCategory[] | null = null;
let inFlightFetch: Promise<UnitCategory[]> | null = null;

export function resetUnitSelectCache() {
  cachedCategories = null;
  inFlightFetch = null;
}

function unitDimension(value: string): UnitDimension {
  return getInventoryUnitDimension(value);
}

export function isUnitCompatibleWithDimension(
  unitValue: string,
  compatibleDimension?: UnitDimension
): boolean {
  if (!compatibleDimension || compatibleDimension === "unknown") return true;
  if (UNIVERSAL_RECIPE_PORTION_UNITS.has(unitValue.toLowerCase())) return true;
  const dim = unitDimension(unitValue);
  if (dim === "unknown") return true;
  return dim === compatibleDimension;
}

function normalizeSearchToken(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/millilitres?/g, "milliliter")
    .replace(/centilitres?/g, "centiliter")
    .replace(/litres?/g, "liter")
    .replace(/kilogrammes?/g, "kilogram")
    .replace(/milligrammes?/g, "milligram")
    .replace(/grammes?/g, "gram")
    .replace(/[()/_#,.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (word === "lbs") return "lb";
      if (word === "pcs") return "pc";
      if (word === "leaves") return "leaf";
      if (word.length > 4 && word.endsWith("ches")) return word.slice(0, -2);
      if (word.length > 4 && word.endsWith("xes")) return word.slice(0, -2);
      if (word.length > 4 && word.endsWith("ses")) return word.slice(0, -2);
      if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) {
        return word.slice(0, -1);
      }
      return word;
    })
    .join(" ");
}

/**
 * Deterministic, plural- & spelling-tolerant unit search scorer for cmdk.
 * Returns score in [0, 1] (0 = hidden, >0 = shown and ranked).
 */
export function scoreUnitSearchMatch(
  itemValue: string,
  search: string,
  keywords?: string[]
): number {
  const rawQuery = search.trim().toLowerCase();
  if (!rawQuery) return 1;

  const normalizedQuery = normalizeSearchToken(rawQuery);
  if (!normalizedQuery) return 1;

  const fullTextRaw = `${itemValue} ${(keywords ?? []).join(" ")}`.toLowerCase();
  const normalizedHaystack = normalizeSearchToken(fullTextRaw);
  const haystackWords = normalizedHaystack.split(" ").filter(Boolean);

  // 1. Exact token match on unit code or normalized alias (highest priority)
  if (haystackWords.includes(normalizedQuery) || haystackWords.includes(rawQuery)) {
    return 1;
  }

  // 2. Prefix match on any word (e.g. "kilo" -> "kilogram", "lit" -> "liter", "tab" -> "tablespoon")
  if (haystackWords.some((word) => word.startsWith(normalizedQuery) || word.startsWith(rawQuery))) {
    return 0.92;
  }

  // 3. Contiguous phrase match across normalized text (e.g. "fluid ounce", "fl oz")
  if (normalizedHaystack.includes(normalizedQuery) || fullTextRaw.includes(rawQuery)) {
    return 0.85;
  }

  // 4. Multi-word token match (every query word matches at least one word in haystack)
  const queryWords = normalizedQuery.split(" ").filter(Boolean);
  if (
    queryWords.length > 1 &&
    queryWords.every((qw) =>
      haystackWords.some((hw) => hw.includes(qw) || qw.includes(hw))
    )
  ) {
    return 0.75;
  }

  return 0;
}

const LOCALIZATION: Record<string, Record<string, string>> = {
  en: {
    selectUnit: "Select unit...",
    searchUnit: "Search unit (e.g. kg, litre, bottle, pcs, shot)...",
    noUnitFound: "No unit found.",
    loading: "Loading units...",
    error: "Failed to load units.",
    retry: "Retry",
  },
};

export function UnitSelect({
  value,
  onChange,
  multi = false,
  className,
  disabled = false,
  placeholder,
  error: externalError,
  excludeValues = EMPTY_EXCLUDE_VALUES,
  compatibleDimension,
  helperText,
}: UnitSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [categories, setCategories] = React.useState<UnitCategory[]>(
    cachedCategories ?? []
  );
  const [loading, setLoading] = React.useState(!cachedCategories);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [locale] = React.useState("en");
  const viewportRef = React.useRef<HTMLDivElement | null>(null);

  const t = LOCALIZATION[locale];

  const fetchUnits = React.useCallback(async () => {
    if (cachedCategories) {
      setCategories(cachedCategories);
      setLoading(false);
      return;
    }

    setLoading(true);
    setFetchError(null);
    try {
      if (!inFlightFetch) {
        inFlightFetch = fetch("/api/v1/inventory/units")
          .then((response) => {
            if (!response.ok) throw new Error("Failed to fetch units");
            return response.json();
          })
          .then((data: UnitCategory[]) => {
            cachedCategories = data;
            return data;
          })
          .finally(() => {
            inFlightFetch = null;
          });
      }
      const data = await inFlightFetch;
      setCategories(data);
    } catch (err) {
      setFetchError(t.error);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [t.error]);

  React.useEffect(() => {
    fetchUnits();
  }, [fetchUnits]);

  const visibleCategories = React.useMemo(
    () =>
      categories
        .filter((category) => category.category !== "Operational Management Units")
        .map((category) => ({
          ...category,
          units: category.units.filter(
            (unit) =>
              !excludeValues.includes(unit.value) &&
              isUnitCompatibleWithDimension(unit.value, compatibleDimension)
          ),
        }))
        .filter((category) => category.units.length > 0),
    [categories, excludeValues, compatibleDimension]
  );

  const allAllCategoriesUnits = React.useMemo(
    () => categories.flatMap((c) => c.units),
    [categories]
  );

  const handleSelect = (currentValue: string) => {
    if (multi) {
      const currentValues = Array.isArray(value) ? value : value ? [value] : [];
      const newValues = currentValues.includes(currentValue)
        ? currentValues.filter((v) => v !== currentValue)
        : [...currentValues, currentValue];
      onChange(newValues);
    } else {
      onChange(currentValue === value ? "" : currentValue);
      setOpen(false);
    }
  };

  const isSelected = (unitValue: string) => {
    if (multi) {
      return Array.isArray(value) && value.includes(unitValue);
    }
    return value === unitValue;
  };

  const getDisplayValue = () => {
    if (loading) return t.loading;
    if (fetchError) return t.error;

    if (!value || (Array.isArray(value) && value.length === 0)) {
      return placeholder || t.selectUnit;
    }

    if (multi && Array.isArray(value)) {
      if (value.length === 1) {
        return allAllCategoriesUnits.find((u) => u.value === value[0])?.label || value[0];
      }
      return `${value.length} selected`;
    }

    if (typeof value === "string") {
      return allAllCategoriesUnits.find((u) => u.value === value)?.label || value;
    }

    return placeholder || t.selectUnit;
  };

  return (
    <div className="grid gap-1">
      {/* modal={true} registers PopoverContent as an active scroll-unlocked shard inside Radix Dialog's RemoveScroll */}
      <Popover modal={true} open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            data-testid="unit-select-trigger"
            className={cn(
              "w-full justify-between text-left font-normal",
              !value && "text-muted-foreground",
              externalError && "border-red-500",
              className
            )}
            disabled={disabled || loading}
          >
            <span className="truncate">{getDisplayValue()}</span>
            {loading ? (
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
            ) : (
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[min(22rem,calc(100vw-2rem))] max-h-[calc(100vh-1rem)] overflow-hidden p-0 z-[100]"
          onWheel={(e) => {
            // Prevent outer Dialog RemoveScroll from intercepting mouse wheel or two-finger trackpad scroll
            e.stopPropagation();
          }}
          onTouchMove={(e) => {
            e.stopPropagation();
          }}
        >
          <Command
            data-testid="unit-select-command"
            className="w-full overflow-hidden"
            filter={scoreUnitSearchMatch}
          >
            <CommandInput placeholder={t.searchUnit} />
            <div
              ref={viewportRef}
              data-testid="unit-select-scroll-viewport"
              className="unit-selector-scroll-viewport h-64 max-h-64 w-full overflow-x-hidden overflow-y-auto overscroll-contain touch-pan-y"
              onWheel={(e) => {
                e.stopPropagation();
              }}
              onTouchMove={(e) => {
                e.stopPropagation();
              }}
            >
              <CommandList
                data-testid="unit-select-list"
                className="!h-auto !max-h-none w-full overflow-visible"
              >
                {loading && (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin mb-2" />
                    {t.loading}
                  </div>
                )}

                {fetchError && (
                  <div className="py-6 text-center text-sm text-red-500">
                    <AlertCircle className="mx-auto h-4 w-4 mb-2" />
                    <p className="mb-2">{fetchError}</p>
                    <Button variant="ghost" size="sm" onClick={fetchUnits}>
                      {t.retry}
                    </Button>
                  </div>
                )}

                {!loading && !fetchError && (
                  <>
                    <CommandEmpty>{t.noUnitFound}</CommandEmpty>
                    {visibleCategories.map((category) => (
                      <CommandGroup key={category.category} heading={category.category}>
                        {category.units.map((unit) => (
                          <CommandItem
                            key={`${category.category}-${unit.value}`}
                            value={`${unit.label} ${unit.value}`}
                            keywords={[
                              ...(unit.aliases ?? []),
                              unit.description ?? "",
                              category.category,
                            ]}
                            onSelect={() => handleSelect(unit.value)}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4 shrink-0",
                                isSelected(unit.value) ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <span className="flex min-w-0 flex-col">
                              <span>{unit.label}</span>
                              {unit.description && (
                                <span className="text-xs text-muted-foreground">
                                  {unit.description}
                                </span>
                              )}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ))}
                  </>
                )}
              </CommandList>
            </div>
          </Command>
        </PopoverContent>
      </Popover>
      {externalError && <p className="text-sm text-red-500">{externalError}</p>}
      {!externalError && helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
}
