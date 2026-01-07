"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import {
  initializeIntegrationService,
  getSystemStatus,
  subscribeToSystemStatus,
  subscribeToSystemEvents,
  type SystemStatus,
  type IntegrationEvent,
} from "@/lib/integration-service";
import { useToast } from "@/hooks/use-toast";

interface IntegrationContextType {
  isInitialized: boolean;
  systemStatus: SystemStatus | null;
  events: IntegrationEvent[];
  initialize: () => Promise<boolean>;
  refreshStatus: () => void;
}

const IntegrationContext = createContext<IntegrationContextType | undefined>(
  undefined,
);

export function IntegrationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [events, setEvents] = useState<IntegrationEvent[]>([]);
  const { toast } = useToast();

  const initialize = useCallback(async (): Promise<boolean> => {
    try {
      const success = await initializeIntegrationService();
      setIsInitialized(success);

      if (success) {
        toast({
          title: "System Initialized",
          description: "All hardware services are ready",
        });
      } else {
        toast({
          title: "Initialization Warning",
          description: "Some hardware services failed to initialize",
          variant: "destructive",
        });
      }

      return success;
    } catch (error) {
      console.error("Failed to initialize integration service:", error);
      toast({
        title: "Initialization Error",
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
      return false;
    }
  }, [toast]);

  const refreshStatus = () => {
    setSystemStatus(getSystemStatus());
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Initialize on mount
    initialize();

    // Subscribe to status changes
    const unsubscribeStatus = subscribeToSystemStatus((status) => {
      setSystemStatus(status);
    });

    // Subscribe to events
    const unsubscribeEvents = subscribeToSystemEvents((event) => {
      setEvents((prev) => [event, ...prev.slice(0, 99)]); // Keep last 100 events
    });

    // Get initial status
    setSystemStatus(getSystemStatus());

    return () => {
      unsubscribeStatus();
      unsubscribeEvents();
    };
  }, [initialize]);

  const value: IntegrationContextType = {
    isInitialized,
    systemStatus,
    events,
    initialize,
    refreshStatus,
  };

  return (
    <IntegrationContext.Provider value={value}>
      {children}
    </IntegrationContext.Provider>
  );
}

export function useIntegration() {
  const context = useContext(IntegrationContext);
  if (context === undefined) {
    throw new Error(
      "useIntegration must be used within an IntegrationProvider",
    );
  }
  return context;
}
