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
}

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
}: UnitSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [categories, setCategories] = React.useState<UnitCategory[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [locale] = React.useState("en"); // Default locale

  const t = LOCALIZATION[locale];

  const fetchUnits = React.useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const response = await fetch("/api/units");
      if (!response.ok) {
        throw new Error("Failed to fetch units");
      }
      const data = await response.json();
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

  const allUnits = React.useMemo(
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
                  {categories.map((category) => (
                    <CommandGroup
                      key={category.category}
                      heading={category.category}
                    >
                      {category.units.map((unit) => (
                        <CommandItem
                          key={unit.value}
                          value={unit.label} // Search by label
                          onSelect={() => handleSelect(unit.value)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              isSelected(unit.value)
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          {unit.label}
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
    </div>
  );
}
