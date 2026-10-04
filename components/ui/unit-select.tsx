"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Loader2, AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";
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

// The unit list is static reference data (rarely, if ever, changes), so cache
// it at the module level once fetched. This avoids re-fetching (and briefly
// showing a "Loading units..." state) every time the Add/Edit Item dialog is
// reopened within the same session.
let cachedCategories: UnitCategory[] | null = null;
let inFlightFetch: Promise<UnitCategory[]> | null = null;

export function resetUnitSelectCache() {
  cachedCategories = null;
  inFlightFetch = null;
}

const MASS_UNITS = new Set(["g", "kg", "oz", "lb"]);
const VOLUME_UNITS = new Set(["ml", "l", "fl_oz", "qt", "gal"]);
const COUNT_UNITS = new Set(["unit", "ea", "ct", "pc", "pcs", "piece", "pack", "box", "bag", "bottle", "can", "tray", "sack", "crate", "carton", "cs", "pk", "bx", "bg"]);
function unitDimension(value: string): UnitDimension {
  if (MASS_UNITS.has(value)) return "mass";
  if (VOLUME_UNITS.has(value)) return "volume";
  if (COUNT_UNITS.has(value)) return "count";
  return "unknown";
}

const LOCALIZATION: Record<string, Record<string, string>> = {
  en: {
    selectUnit: "Select unit...",
    searchUnit: "Search unit...",
    noUnitFound: "No unit found.",
    loading: "Loading units...",
    error: "Failed to load units.",
    retry: "Retry",
  },
  // Add other languages here
};

/**
 * UnitSelect Component
 *
 * A dropdown component for selecting measurement units, organized by categories.
 * Supports single and multi-select modes, search, and localization.
 *
 * @param value - The currently selected value(s). String for single, string[] for multi.
 * @param onChange - Callback when selection changes. Returns string or string[].
 * @param multi - Enable multiple selection mode. Defaults to false.
 * @param className - Additional CSS classes.
 * @param disabled - Disable the component.
 * @param placeholder - Placeholder text when no value is selected.
 * @param error - Error message to display (styles the border red).
 */
export function UnitSelect({
  value,
  onChange,
  multi = false,
  className,
  disabled = false,
  placeholder,
  error: externalError,
  excludeValues = [],
  compatibleDimension,
  helperText,
}: UnitSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [categories, setCategories] = React.useState<UnitCategory[]>(
    cachedCategories ?? []
  );
  const [loading, setLoading] = React.useState(!cachedCategories);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [locale] = React.useState("en"); // Default locale

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
        inFlightFetch = fetch("/api/units")
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
    () => categories
      .filter((category) => category.category !== "Operational Management Units")
      .map((category) => ({
        ...category,
        units: category.units.filter((unit) => !excludeValues.includes(unit.value) && (!compatibleDimension || unitDimension(unit.value) === compatibleDimension)),
      }))
      .filter((category) => category.units.length > 0),
    [categories, excludeValues]
  );

  const allUnits = React.useMemo(
    () => visibleCategories.flatMap((c) => c.units),
    [visibleCategories]
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
        return allUnits.find((u) => u.value === value[0])?.label || value[0];
      }
      return `${value.length} selected`;
    }

    if (typeof value === "string") {
      return allUnits.find((u) => u.value === value)?.label || value;
    }

    return placeholder || t.selectUnit;
  };

  return (
    <div className="grid gap-1">
      <Popover open={open} onOpenChange={setOpen}>
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
        <PopoverContent className="w-[200px] p-0">
          <Command>
            <CommandInput placeholder={t.searchUnit} />
            <CommandList>
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
                          key={unit.value}
                          value={`${category.category} ${unit.label} ${unit.value}`}
                          onSelect={() => handleSelect(unit.value)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              isSelected(unit.value) ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <span className="flex min-w-0 flex-col">
                            <span>{unit.label}</span>
                            {unit.description && <span className="text-xs text-muted-foreground">{unit.description}</span>}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ))}
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {externalError && <p className="text-sm text-red-500">{externalError}</p>}
      {!externalError && helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
    </div>
  );
}
