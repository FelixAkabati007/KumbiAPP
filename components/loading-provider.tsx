"use client";

import * as React from "react";
import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";

interface LoadingContextType {
  isLoading: boolean;
  showLoading: (message?: string) => void;
  hideLoading: () => void;
}

const LoadingContext = React.createContext<LoadingContextType | undefined>(undefined);

/**
 * RouteChangeResetter — isolates useSearchParams() inside its own Suspense
 * boundary so it never suspends the outer provider tree.
 */
function RouteChangeResetter({ onRouteChange }: { onRouteChange: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  React.useEffect(() => {
    onRouteChange();
  }, [pathname, searchParams, onRouteChange]);
  return null;
}

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string | undefined>(undefined);

  const handleRouteChange = React.useCallback(() => {
    setIsLoading(false);
    setMessage(undefined);
  }, []);

  const showLoading = React.useCallback((msg?: string) => {
    setMessage(msg);
    setIsLoading(true);
  }, []);

  const hideLoading = React.useCallback(() => {
    setIsLoading(false);
    setMessage(undefined);
  }, []);

  const value = React.useMemo(
    () => ({ isLoading, showLoading, hideLoading }),
    [isLoading, showLoading, hideLoading],
  );

  return (
    <LoadingContext.Provider value={value}>
      {/* Isolate useSearchParams so it never suspends the main tree */}
      <Suspense fallback={null}>
        <RouteChangeResetter onRouteChange={handleRouteChange} />
      </Suspense>
      {children}
      {isLoading && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200"
          aria-busy="true"
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-4 p-6 rounded-lg">
            <Spinner size="lg" variant="orange" />
            {message && (
              <p className="text-sm font-medium text-muted-foreground animate-pulse">
                {message}
              </p>
            )}
            <span className="sr-only">Loading...</span>
          </div>
        </div>
      )}
    </LoadingContext.Provider>
  );
}

export function useLoading() {
  const context = React.useContext(LoadingContext);
  if (context === undefined) {
    throw new Error("useLoading must be used within a LoadingProvider");
  }
  return context;
}
