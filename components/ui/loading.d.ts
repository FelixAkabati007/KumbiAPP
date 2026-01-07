declare module "@/components/ui/loading" {
  export interface LoadingProps {
    className?: string;
    variant?: "spinner" | "dots" | "pulse";
    size?: "sm" | "md" | "lg";
  }

  export function LoadingSpinner(props: { className?: string }): JSX.Element;
}
