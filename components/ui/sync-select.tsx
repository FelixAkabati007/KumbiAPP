
"use client";

import * as React from "react";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface SyncSelectProps {
  value: string;
  onValueChange: (value: string) => Promise<boolean | void>;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function SyncSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select...",
  className,
  disabled,
}: SyncSelectProps) {
  const [optimisticValue, setOptimisticValue] = React.useState(value);
  const [status, setStatus] = React.useState<"idle" | "loading" | "success" | "error">("idle");

  // Sync with external value changes (e.g. from polling)
  React.useEffect(() => {
    if (status === "idle" || status === "success") {
      setOptimisticValue(value);
    }
  }, [value, status]);

  const handleChange = async (newValue: string) => {
    if (newValue === optimisticValue) return;

    const previousValue = optimisticValue;
    setOptimisticValue(newValue);
    setStatus("loading");

    try {
      const result = await onValueChange(newValue);
      
      // If result is boolean false, consider it a failure
      if (typeof result === "boolean" && !result) {
        throw new Error("Update failed");
      }

      setStatus("success");
      
      // Reset success state after a delay
      setTimeout(() => {
        setStatus("idle");
      }, 2000);
      
    } catch (error) {
      console.error("SyncSelect update error:", error);
      setOptimisticValue(previousValue);
      setStatus("error");
      toast.error("Failed to update status");
      
      // Reset error state after a delay
      setTimeout(() => {
        setStatus("idle");
      }, 3000);
    }
  };

  return (
    <div className="relative flex items-center gap-2">
      <Select
        value={optimisticValue}
        onValueChange={handleChange}
        disabled={disabled || status === "loading"}
      >
        <SelectTrigger 
          className={cn(
            "w-32 h-8 rounded-full transition-all duration-200",
            status === "error" && "border-red-500 ring-red-200",
            status === "success" && "border-green-500 ring-green-200",
            className
          )}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      <div className="absolute right-[-24px] flex items-center justify-center w-5 h-5">
        {status === "loading" && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {status === "success" && (
          <Check className="h-4 w-4 text-green-500 animate-in fade-in zoom-in" />
        )}
        {status === "error" && (
          <AlertCircle className="h-4 w-4 text-red-500 animate-in fade-in zoom-in" />
        )}
      </div>
    </div>
  );
}
