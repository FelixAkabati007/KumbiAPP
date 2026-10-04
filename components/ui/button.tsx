import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "enterprise-interactive inline-flex min-w-0 max-w-full items-center justify-center gap-2 whitespace-normal break-words rounded-full text-sm font-semibold ring-offset-background transition-[transform,box-shadow,background-position] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-[hsl(var(--button-gradient-start))] to-[hsl(var(--button-gradient-end))] text-primary-foreground shadow-[0_6px_14px_-5px_hsl(var(--button-shadow)/0.7)] hover:-translate-y-0.5 hover:shadow-[0_9px_18px_-6px_hsl(var(--button-shadow)/0.8)]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        brand:
          "bg-gradient-to-r from-[hsl(var(--button-gradient-start))] to-[hsl(var(--button-gradient-end))] text-brand-primary-foreground shadow-[0_6px_14px_-5px_hsl(var(--button-shadow)/0.7)] hover:-translate-y-0.5 hover:shadow-[0_9px_18px_-6px_hsl(var(--button-shadow)/0.8)]",
        brandSecondary:
          "bg-brand-secondary text-brand-secondary-foreground hover:bg-brand-secondary/90",
        brandTertiary:
          "bg-brand-tertiary text-brand-tertiary-foreground hover:bg-brand-tertiary/90",
        info: "bg-[hsl(var(--status-info))] text-[hsl(var(--brand-primary-foreground))] hover:bg-[hsl(var(--status-info))/0.9]",
        highlight:
          "bg-highlight text-highlight-foreground hover:bg-highlight/90",
        neutral: "bg-neutral text-neutral-foreground hover:bg-neutral/80",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-full px-4",
        lg: "h-12 rounded-full px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
