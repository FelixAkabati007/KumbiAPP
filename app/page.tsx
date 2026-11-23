"use client";

import Link, { useLinkStatus } from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ArrowRight,
  BarChart3,
  ChefHat,
  CreditCard,
  Grid3X3,
  Loader2,
  LogOut,
  Monitor,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Sparkles,
  Utensils,
  Maximize2,
  Minimize2,
  DoorOpen,
  Home,
  Briefcase,
  CheckSquare,
  Wrench,
  Clock3,
  CalendarDays,
  SplitSquareHorizontal,
  ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogoDisplay } from "@/components/logo-display";
import { useAuth } from "@/components/auth-provider";
import { SignInForm } from "@/components/sign-in-form";
import { useSettings } from "@/components/settings-provider";
import { useToast } from "@/hooks/use-toast";
import { useReceiptStats } from "@/hooks/use-receipt-stats";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import {
  rolePermissions,
  roleDashboardConfig,
  UserRole,
  AppSection,
  getRoleDisplayName,
} from "@/lib/roles";
import { UserNav } from "@/components/user-nav";
import { NotificationBell } from "@/components/notification-bell";
import { GlobalSearch } from "@/components/global-search";
import { AnnouncementCard } from "@/components/announcement-card";
import { Switch } from "@/components/ui/switch";
import { useFeatureToggles } from "@/hooks/use-feature-toggles";
import { AppUpdateMenu } from "@/components/app-update-menu";
import { OfflineSyncIndicator } from "@/components/offline-sync-indicator";

const ChefRecipeCard = dynamic(
  () =>
    import("@/components/dashboard/chef-recipe-card").then(
      (mod) => mod.ChefRecipeCard,
    ),
  { ssr: false },
);

const DASHBOARD_CATEGORIES = [
  ["all", "All Categories"],
  ["hotel", "Hotel"],
  ["restaurant", "Restaurant"],
  ["finance", "Finance"],
  ["technical", "Technical Operations"],
  ["administration", "Administration"],
  ["events", "Event Organization"],
] as const;

const CATEGORY_META: Record<
  (typeof DASHBOARD_CATEGORIES)[number][0],
  {
    title: string;
    description: string;
    icon: typeof Grid3X3;
  }
> = {
  all: {
    title: "All Operational Workspaces",
    description:
      "Complete operational visibility across hospitality, food & beverage, finance, technical operations, and administration.",
    icon: Grid3X3,
  },
  hotel: {
    title: "Hospitality & Hotel Operations",
    description:
      "Manage guest reservations, room inventory status, housekeeping tasks, and front desk check-in/out.",
    icon: Home,
  },
  restaurant: {
    title: "Food Service & Restaurant Operations",
    description:
      "Capture point-of-sale orders, monitor kitchen production, track live grid orders, manage menus, and audit inventory stock.",
    icon: Utensils,
  },
  finance: {
    title: "Financial Operations & Auditing",
    description:
      "Canonical financial ledger, sales analytics, customer refund processing, payment methods, and transaction receipts.",
    icon: CreditCard,
  },
  technical: {
    title: "Technical & Facilities Operations",
    description:
      "Coordinate hotel and restaurant technical maintenance, issue resolution, and facilities upkeep.",
    icon: Wrench,
  },
  administration: {
    title: "Administration & System Governance",
    description:
      "System health monitoring, hardware status, audited configuration access, and system-wide controls.",
    icon: Monitor,
  },
  events: {
    title: "Event Organization & Banqueting",
    description:
      "Plan events, coordinate venues, manage guests, assign delivery teams, and generate quotations.",
    icon: CalendarDays,
  },
};

const CATEGORY_SECTION_MAP: Record<
  (typeof DASHBOARD_CATEGORIES)[number][0],
  AppSection[]
> = {
  all: [],
  hotel: [
    "rooms",
    "reservations",
    "checkIn",
    "checkOut",
    "housekeeping",
    "guestFolio",
  ],
  restaurant: ["pos", "kitchen", "orderBoard", "menu", "inventory"],
  finance: ["finance", "payments", "refunds", "reports", "receipt"],
  technical: ["operations", "maintenance"],
  administration: ["system"],
  events: ["events"],
};

import { PropertyClock } from "@/components/property-clock";

const DashboardAccraClock = PropertyClock;


function CategoryGroupHeader({
  title,
  count,
  icon: Icon,
  description,
  onFocus,
}: {
  title: string;
  count: number;
  icon: typeof Grid3X3;
  description: string;
  onFocus?: () => void;
}) {
  return (
    <div className="col-span-full flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-orange-200/60 dark:border-orange-800/40 pb-2 pt-4 first:pt-0">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">
              {title}
            </h3>
            <span className="rounded-full bg-orange-100/70 dark:bg-orange-950/40 px-2 py-0.5 text-[11px] font-semibold text-orange-800 dark:text-orange-200">
              {count} {count === 1 ? "workspace" : "workspaces"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {description}
          </p>
        </div>
      </div>
      {onFocus && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onFocus}
          className="text-xs text-orange-600 dark:text-orange-400 hover:text-orange-700 hover:bg-orange-100/50 dark:hover:bg-orange-950/40 rounded-xl h-7 self-start sm:self-auto px-2"
        >
          <span>Focus group</span>
          <ArrowRight className="ml-1 h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

// Defined at module scope: declaring it inside DashboardContent (which re-renders every
// second for the clock) gave it a new identity each render, remounting every launcher
// anchor mid-click so navigation never fired.
function LaunchPendingIndicator({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span className="inline-flex items-center justify-center gap-2" aria-live="polite">
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      <span>{children}</span>
      {pending && <span className="sr-only">Loading</span>}
    </span>
  );
}

function DashboardLaunchButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      prefetch
      className="enterprise-interactive inline-flex min-h-10 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 dashboard-launcher-action"
    >
      <LaunchPendingIndicator>{children}</LaunchPendingIndicator>
    </Link>
  );
}

function DashboardContent() {
  const { user, logout } = useAuth();
  const searchParams = useSearchParams();
  const { settings } = useSettings();
  const { toast } = useToast();

  const handleLogout = useCallback(() => {
    if (confirm("Are you sure you want to sign out?")) {
      logout();
      toast({
        title: "Signed Out",
        description: "You have been successfully signed out",
      });
    }
  }, [logout, toast]);

  // Keyboard shortcut for logout (Ctrl+Shift+L)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key === "L") {
        event.preventDefault();
        handleLogout();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleLogout]);

  const mainRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const requestedCategory = searchParams.get("category") as (typeof DASHBOARD_CATEGORIES)[number][0] | null;
  const [activeDashboardCategory, setActiveDashboardCategory] =
    useState<(typeof DASHBOARD_CATEGORIES)[number][0]>(requestedCategory || "all");

  useEffect(() => {
    if (requestedCategory && DASHBOARD_CATEGORIES.some(([category]) => category === requestedCategory)) {
      setActiveDashboardCategory(requestedCategory);
    }
  }, [requestedCategory]);

  const [attendanceRecord, setAttendanceRecord] = useState<{
    verification_status?: string;
    lifecycleStatus?: string;
    check_in_at?: string | null;
    check_out_at?: string | null;
  } | null>(null);
  const [attendanceLoaded, setAttendanceLoaded] = useState(false);

  // Fullscreen helpers (vendor-prefixed support without `any`)
  type FullscreenElement = HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
  };
  type FullscreenDocument = Document & {
    webkitExitFullscreen?: () => Promise<void> | void;
    msExitFullscreen?: () => Promise<void> | void;
  };
  const requestFullscreen = useCallback((el: FullscreenElement) => {
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else if (el.msRequestFullscreen) el.msRequestFullscreen();
  }, []);
  const exitFullscreen = useCallback((doc: FullscreenDocument) => {
    if (doc.exitFullscreen) doc.exitFullscreen();
    else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
    else if (doc.msExitFullscreen) doc.msExitFullscreen();
  }, []);

  // Fullscreen toggle handler
  const handleToggleFullscreen = () => {
    const elem = document.documentElement as FullscreenElement;
    if (!isFullscreen) {
      requestFullscreen(elem);
      setIsFullscreen(true);
    } else {
      exitFullscreen(document as FullscreenDocument);
      setIsFullscreen(false);
    }
  };

  // Listen for fullscreen change
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void fetch("/api/v2/attendance", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { record?: typeof attendanceRecord } | null) => {
        if (!cancelled) {
          setAttendanceRecord(data?.record ?? null);
          setAttendanceLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setAttendanceLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Load receipt stats from Neon
  const { stats: receiptStats } = useReceiptStats();

  // Kitchen Display / Order Board admin enable-disable toggles
  const { toggles, canManage, updating, setToggle } = useFeatureToggles();

  const handleFeatureToggle = useCallback(
    async (key: "kitchen_display" | "order_board", nextEnabled: boolean) => {
      const label =
        key === "kitchen_display" ? "Kitchen Display" : "Order Board";
      const ok = await setToggle(key, nextEnabled);
      if (ok) {
        toast({
          title: nextEnabled ? `${label} Enabled` : `${label} Disabled`,
          description: nextEnabled
            ? `${label} is now visible and usable across the app.`
            : `${label} has been disabled for all staff until re-enabled.`,
        });
      } else {
        toast({
          title: "Error",
          description: `Failed to update ${label} status.`,
          variant: "destructive",
        });
      }
    },
    [setToggle, toast],
  );

  // Double-click/double-tap handler
  useEffect(() => {
    if (typeof window === "undefined") return;

    const main = mainRef.current;
    if (!main) return;
    let lastTap = 0;
    const handleDouble = () => {
      if (document.fullscreenElement) {
        exitFullscreen(document as FullscreenDocument);
      }
    };
    const handleTouch = () => {
      const now = Date.now();
      if (now - lastTap < 400) {
        handleDouble();
      }
      lastTap = now;
    };
    main.addEventListener("dblclick", handleDouble);
    main.addEventListener("touchend", handleTouch);
    return () => {
      main.removeEventListener("dblclick", handleDouble);
      main.removeEventListener("touchend", handleTouch);
    };
  }, [exitFullscreen]);

  const userRole = (user?.role as UserRole) || "staff";
  const access: Record<AppSection, boolean> = user
    ? rolePermissions[userRole] || ({} as Record<AppSection, boolean>)
    : ({} as Record<AppSection, boolean>);
  const roleDashboard =
    roleDashboardConfig[userRole] || roleDashboardConfig.staff;
  const isHousekeeping = userRole === "housekeeping";
  const attendanceExemptRoles = [
    "admin",
    "manager",
    "hotelManager",
    "restaurantManager",
    "operationsManager",
    "finance",
  ];
  const isAttendanceExempt = user ? attendanceExemptRoles.includes(user.role) : false;
  const requiresAttendanceApproval = !isAttendanceExempt;
  const attendanceStatus = String(attendanceRecord?.verification_status ?? "").toLowerCase();
  const attendanceApproved =
    isAttendanceExempt ||
    ["verified", "approved", "approved_late"].includes(attendanceStatus);
  const dashboardAccess: Record<AppSection, boolean> =
    requiresAttendanceApproval && !attendanceApproved
      ? (Object.fromEntries(
          Object.keys(access).map((section) => [
            section,
            section === "attendance",
          ]),
        ) as Record<AppSection, boolean>)
      : access;
  const attendanceRestricted =
    attendanceLoaded &&
    requiresAttendanceApproval &&
    !attendanceApproved;

  const categoryCounts = useMemo(() => {
    const counts: Record<(typeof DASHBOARD_CATEGORIES)[number][0], number> = {
      all: 0,
      hotel: [
        dashboardAccess.reservations,
        dashboardAccess.rooms && !isHousekeeping,
        dashboardAccess.housekeeping || isHousekeeping,
        dashboardAccess.checkIn,
      ].filter(Boolean).length,
      restaurant: [
        dashboardAccess.pos,
        dashboardAccess.kitchen,
        dashboardAccess.orderBoard,
        dashboardAccess.menu,
        dashboardAccess.inventory,
      ].filter(Boolean).length,
      finance: [
        dashboardAccess.finance,
        dashboardAccess.reports,
        dashboardAccess.refunds,
        dashboardAccess.payments,
        dashboardAccess.receipt,
      ].filter(Boolean).length,
      technical: [dashboardAccess.operations].filter(Boolean).length,
      administration: [dashboardAccess.system].filter(Boolean).length,
      events: [dashboardAccess.events].filter(Boolean).length,
    };
    counts.all =
      counts.hotel +
      counts.restaurant +
      counts.finance +
      counts.technical +
      counts.administration +
      counts.events +
      2;
    return counts;
  }, [dashboardAccess, isHousekeeping]);

  const availableDashboardCategories = useMemo(
    () =>
      DASHBOARD_CATEGORIES.filter(
        ([category]) =>
          category === "all" ||
          (!attendanceRestricted &&
            roleDashboard.categories.includes(category) &&
            CATEGORY_SECTION_MAP[category].some(
              (section) => dashboardAccess[section],
            )),
      ),
    [attendanceRestricted, roleDashboard.categories, dashboardAccess],
  );
  const canSwitchDashboardCategories = availableDashboardCategories.length > 1;

  const selectDashboardCategory = (
    category: (typeof DASHBOARD_CATEGORIES)[number][0],
  ) => {
    setActiveDashboardCategory(category);
    const url = new URL(window.location.href);
    if (category === "all") url.searchParams.delete("category");
    else url.searchParams.set("category", category);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  };

  const operationalModules = useMemo(
    () =>
      [
        dashboardAccess.pos && {
          title: "Point of Sale System",
          description: "Capture orders, payments, and service hand-offs",
          href: "/pos",
          icon: (
            <ShoppingCart className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          ),
        },
        dashboardAccess.kitchen && {
          title: "Kitchen Management",
          description: "Track preparation status and keep service moving",
          href: "/kitchen",
          icon: (
            <ChefHat className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          ),
        },
        dashboardAccess.reports && {
          title: "Analytics & Reports",
          description: "Reconcile sales, payments, and operating performance",
          href: "/reports",
          icon: (
            <BarChart3 className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          ),
        },
        dashboardAccess.menu && {
          title: "Menu Management",
          description: "Manage menu items, pricing, and recipe availability",
          href: "/menu",
          icon: (
            <Utensils className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          ),
        },
        dashboardAccess.inventory && {
          title: "Inventory",
          description: "Track live stock levels and supplies",
          href: "/inventory",
          icon: (
            <Package className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          ),
        },
        dashboardAccess.reservations && {
          title: "Reservations",
          description: "Manage guest bookings and room availability",
          href: "/hotels/reservations",
          icon: (
            <Briefcase className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          ),
        },
        dashboardAccess.finance && {
          title: "Finance Desk",
          description: "Reconcile payments, waivers, and transaction activity",
          href: "/finance",
          icon: (
            <CreditCard className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          ),
        },
      ].filter(Boolean) as Array<{
        title: string;
        description: string;
        href: string;
        icon: ReactNode;
      }>,
    [dashboardAccess],
  );

  if (!user) {
    return <SignInForm />;
  }

  return (
    <div
      ref={mainRef}
      className="flex h-screen max-h-screen w-full flex-col overflow-hidden bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950"
    >
      <header className="shrink-0 sticky top-0 z-50 w-full min-w-0 border-b border-orange-200/80 bg-gradient-to-r from-orange-50/95 via-amber-50/95 to-yellow-50/95 backdrop-blur-md shadow-sm dark:border-orange-700/80 dark:from-orange-950/95 dark:via-amber-950/95 dark:to-yellow-950/95">
        <div className="w-full max-w-[1920px] mx-auto flex h-14 sm:h-16 xl:h-[4.25rem] min-w-0 items-center justify-between gap-2 sm:gap-3 md:gap-4 px-2 sm:px-4 md:px-6 2xl:px-8">
          {/* Left Cluster: Brand Identity + Split Workspaces + Quick Workstations */}
          <div className="flex min-w-0 items-center gap-2 sm:gap-3 lg:gap-3.5">
            <Link
              href="/"
              className="flex shrink-0 items-center gap-1.5 sm:gap-2.5 hover:opacity-90 transition-opacity"
            >
              <LogoDisplay size="sm" />
              <Utensils className="h-5 w-5 sm:h-6 sm:w-6 text-orange-600 dark:text-orange-400 shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="inline-block min-w-0 truncate font-bold text-sm sm:text-base lg:text-lg text-gray-800 dark:text-gray-200 leading-tight">
                  {/* Suppress hydration warnings for text that can differ between SSR default and client-saved settings */}
                  <span className="sm:hidden">KHRMS</span>
                  <span
                    className="hidden min-w-0 truncate sm:inline max-w-[10rem] md:max-w-[14rem] lg:max-w-[18rem] xl:max-w-[24rem]"
                    suppressHydrationWarning
                  >
                    {settings.account.restaurantName}
                  </span>
                </span>
                <span className="hidden xl:inline-block text-[10px] text-orange-600/80 dark:text-orange-400/80 font-medium tracking-wide">
                  Hospitality &amp; Restaurant ERP
                </span>
              </div>
            </Link>
          </div>

          {/* Right Cluster: Search + Utilities + User Identity & Avatar */}
          <nav
            aria-label="Dashboard actions"
            className="flex shrink-0 items-center gap-1.5 sm:gap-2 md:gap-2.5"
          >
            {/* Global Search: Icon on mobile, proportional input on larger screens */}
            <div className="shrink-0 w-9 sm:w-32 md:w-40 lg:w-48 xl:w-60 2xl:w-72">
              <GlobalSearch role={user?.role} />
            </div>

            {/* Offline Sync Status */}
            <OfflineSyncIndicator />

            {/* App updates - visible on lg+ */}
            <div className="hidden lg:inline-flex">
              <AppUpdateMenu />
            </div>

            {/* Settings shortcut button - visible on md+ (always in UserNav on smaller screens) */}
            <Link className="hidden md:inline-flex shrink-0" href="/settings">
              <Button
                variant="outline"
                size="sm"
                aria-label="Settings"
                title="Settings"
                className="h-9 w-9 xl:h-10 xl:w-10 p-0 rounded-xl border-orange-200 bg-orange-50/50 text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:bg-orange-900/20 dark:text-orange-300 dark:hover:bg-orange-900/40"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </Link>

            {/* Fullscreen toggle on xl+ */}
            <Button
              variant="outline"
              size="sm"
              aria-label={isFullscreen ? "Minimize" : "Maximize"}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              onClick={handleToggleFullscreen}
              className="hidden xl:inline-flex h-9 w-9 xl:h-10 xl:w-10 p-0 rounded-xl border-orange-200 bg-orange-50/50 text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:bg-orange-900/20 dark:text-orange-300 dark:hover:bg-orange-900/40"
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>

            {/* Notification Bell (always visible) */}
            <div
              className="flex h-9 w-9 xl:h-10 xl:w-10 shrink-0 items-center justify-center rounded-xl border border-orange-200 bg-background/90 shadow-sm dark:border-orange-700"
              title="Notifications"
            >
              <NotificationBell />
            </div>

            {/* User Profile Info + Avatar dropdown (always visible) */}
            <div className="flex shrink-0 items-center gap-2 pl-0.5 sm:pl-1">
              <div className="hidden xl:flex flex-col items-end text-right min-w-0">
                <span className="truncate text-xs font-semibold leading-tight text-gray-800 dark:text-gray-200 max-w-[8rem] 2xl:max-w-[12rem]">
                  {user.name}
                </span>
                <span className="truncate text-[10px] font-medium text-orange-600 dark:text-orange-400">
                  {getRoleDisplayName(user.role)}
                </span>
              </div>
              <UserNav />
            </div>
          </nav>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto space-y-5 p-3 pt-4 sm:p-4 md:p-8 md:pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-orange-700 dark:text-orange-300">
              {roleDashboard.summary}
            </p>
            <h2 className="responsive-heading mt-1 font-bold tracking-tight text-gray-800 dark:text-gray-200">
              Dashboard
            </h2>
            <p className="important-description mt-3 max-w-2xl text-sm">
              {roleDashboard.focus}
            </p>
          </div>
          <div className="flex min-w-0 flex-col items-stretch gap-2.5 sm:items-end">
            <div className="flex flex-wrap items-center justify-start sm:justify-end gap-2">
              {/* Split Workspaces Dropdown */}
              {Boolean(
                (dashboardAccess.pos && dashboardAccess.kitchen) ||
                  (dashboardAccess.reservations && dashboardAccess.checkIn) ||
                  (dashboardAccess.menu && dashboardAccess.inventory),
              ) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="default"
                      size="sm"
                      aria-label="Split Workspaces"
                      className="h-10 shrink-0 gap-1.5 rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 text-white font-semibold shadow-md border-0 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 px-3.5 text-xs sm:text-sm transition-all focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <SplitSquareHorizontal className="h-4 w-4 shrink-0 text-white" />
                      <span>Split Views</span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-90 shrink-0 text-white" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-64 rounded-2xl p-1.5 shadow-xl border-orange-200 dark:border-orange-800"
                  >
                    <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2 py-1.5">
                      Split Screen Workspaces
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {dashboardAccess.pos && dashboardAccess.kitchen && (
                      <DropdownMenuItem asChild className="rounded-xl cursor-pointer py-2">
                        <Link href="/split-workspace" className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300">
                            <Utensils className="h-4 w-4" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-xs text-foreground">POS + Kitchen</span>
                            <span className="text-[10px] text-muted-foreground truncate">Live ordering &amp; ticket display</span>
                          </div>
                        </Link>
                      </DropdownMenuItem>
                    )}
                    {dashboardAccess.reservations && dashboardAccess.checkIn && (
                      <DropdownMenuItem asChild className="rounded-xl cursor-pointer py-2">
                        <Link href="/hotel-split-workspace" className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                            <DoorOpen className="h-4 w-4" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-xs text-foreground">Hotel Desk</span>
                            <span className="text-[10px] text-muted-foreground truncate">Reservations &amp; check-in desk</span>
                          </div>
                        </Link>
                      </DropdownMenuItem>
                    )}
                    {dashboardAccess.menu && dashboardAccess.inventory && (
                      <DropdownMenuItem asChild className="rounded-xl cursor-pointer py-2">
                        <Link href="/menu-inventory-split-workspace" className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                            <Package className="h-4 w-4" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-xs text-foreground">Menu + Inventory</span>
                            <span className="text-[10px] text-muted-foreground truncate">Stock availability &amp; menu items</span>
                          </div>
                        </Link>
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {!attendanceRestricted && (
                <Link
                  href={roleDashboard.primaryHref}
                  className="dashboard-primary-action inline-flex min-h-10 items-center justify-center rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all"
                >
                  {roleDashboard.primaryAction}
                </Link>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-start sm:justify-end gap-2">
              <DashboardAccraClock />
              <div className="flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-orange-100 via-amber-100 to-yellow-100 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-full border border-orange-200 dark:border-orange-700">
                <Sparkles className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
                  {getRoleDisplayName(user.role)} Access
                </span>
              </div>
            </div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {roleDashboard.visibilityNote}
        </p>

        {!attendanceRestricted && canSwitchDashboardCategories && (
          <div
            className="w-full flex items-center justify-between gap-2 py-1.5 px-2.5 sm:px-3.5 rounded-2xl sm:rounded-full bg-amber-50/70 dark:bg-amber-950/20 border border-orange-200/70 dark:border-orange-800/40 shadow-sm backdrop-blur-sm"
            role="group"
            aria-label="Dashboard category filter"
          >
            <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto scrollbar-none safe-scroll-x max-w-full flex-nowrap w-full py-2 px-1">
              {availableDashboardCategories.map(([category, label]) => {
                const count = categoryCounts[category];
                const isActive = activeDashboardCategory === category;
                const IconComponent = CATEGORY_META[category]?.icon ?? Grid3X3;
                return (
                  <Button
                    key={category}
                    type="button"
                    size="sm"
                    variant="default"
                    onClick={() => selectDashboardCategory(category)}
                    className={
                      isActive
                        ? "shrink-0 whitespace-nowrap rounded-xl sm:rounded-full bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 text-white font-bold shadow-md border-transparent hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-xs px-2.5 sm:px-3 py-1.5 h-auto transition-all ring-2 ring-red-500 dark:ring-red-400 ring-offset-2 ring-offset-amber-50 dark:ring-offset-gray-900 scale-[1.02]"
                        : "shrink-0 whitespace-nowrap rounded-xl sm:rounded-full bg-gradient-to-r from-orange-500/90 via-amber-500/90 to-yellow-500/90 text-white font-semibold shadow-sm border-transparent hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 hover:ring-2 hover:ring-red-500/80 dark:hover:ring-red-400/80 hover:ring-offset-2 hover:ring-offset-amber-50 dark:hover:ring-offset-gray-900 hover:scale-[1.02] text-xs px-2.5 sm:px-3 py-1.5 h-auto transition-all opacity-95 hover:opacity-100"
                    }
                  >
                    <IconComponent className="mr-1.5 h-3.5 w-3.5 shrink-0 text-white" />
                    <span>{label}</span>
                    <span
                      className="ml-1.5 rounded-full bg-white/25 px-1.5 py-0.2 text-[10px] font-bold text-white tabular-nums"
                    >
                      {count}
                    </span>
                  </Button>
                );
              })}
            </div>
            {activeDashboardCategory !== "all" && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => selectDashboardCategory("all")}
                className="text-xs text-orange-600 dark:text-orange-400 hover:text-orange-700 hover:bg-orange-100/50 dark:hover:bg-orange-950/40 rounded-full shrink-0 px-2.5 py-1 hidden md:flex items-center"
              >
                <Grid3X3 className="mr-1.5 h-3.5 w-3.5" />
                <span>Show All ({categoryCounts.all})</span>
              </Button>
            )}
          </div>
        )}

        {!attendanceRestricted && activeDashboardCategory !== "all" && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-950/30 dark:via-amber-950/30 dark:to-yellow-950/30 border border-orange-200/80 dark:border-orange-800/50">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm mt-0.5 sm:mt-0">
                {(() => {
                  const Icon = CATEGORY_META[activeDashboardCategory]?.icon ?? Grid3X3;
                  return <Icon className="h-5 w-5" />;
                })()}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">
                    {CATEGORY_META[activeDashboardCategory]?.title}
                  </h3>
                  <Badge variant="outline" className="border-orange-300 dark:border-orange-700 bg-orange-100/60 dark:bg-orange-950/50 text-orange-800 dark:text-orange-200 text-xs">
                    {categoryCounts[activeDashboardCategory]} {categoryCounts[activeDashboardCategory] === 1 ? "Workspace" : "Workspaces"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {CATEGORY_META[activeDashboardCategory]?.description}
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => selectDashboardCategory("all")}
              className="shrink-0 rounded-2xl border-orange-200 dark:border-orange-700 text-xs text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/40"
            >
              <Grid3X3 className="mr-1.5 h-3.5 w-3.5" />
              View All Categories
            </Button>
          </div>
        )}

        <div className="dashboard-category-grid responsive-grid">
          {/* Operational Notices & Register */}
          {(activeDashboardCategory === "all" || attendanceRestricted) && (
            <>
              {activeDashboardCategory === "all" && !attendanceRestricted && (
                <CategoryGroupHeader
                  title="Operational Notices & Attendance"
                  count={2}
                  icon={Clock3}
                  description="Daily shift attendance register and property announcements"
                />
              )}
              <div data-dashboard-category="all" className="min-w-0">
                <AnnouncementCard />
              </div>
              <Card
                data-dashboard-category="all"
                data-attendance-card="true"
                className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden dashboard-launcher-card"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20" />
                <CardHeader className="relative z-10 flex flex-row items-center justify-between rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 pb-2 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10">
                  <CardTitle className="text-base font-medium text-gray-800 dark:text-gray-200">
                    Staff Attendance Register
                  </CardTitle>
                  <Clock3 className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                </CardHeader>
                <CardContent className="relative z-10">
                  <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                    Attendance
                  </div>
                  <p className="text-base leading-6 text-muted-foreground">
                    Check in before your scheduled start, check out at or after your
                    scheduled end, and wait for a manager approval before opening
                    other workspaces.
                  </p>
                  <DashboardLaunchButton
                    href={user.role === "staff" ? "/staff/attendance" : "/attendance"}
                  >
                    {user.role === "staff"
                      ? "Open staff attendance"
                      : "Open attendance register"}
                  </DashboardLaunchButton>
                </CardContent>
              </Card>
            </>
          )}

          {!attendanceRestricted && (
            <>
              {/* Hotel Operations */}
              {(activeDashboardCategory === "all" || activeDashboardCategory === "hotel") && categoryCounts.hotel > 0 && (
                <>
                  {activeDashboardCategory === "all" && (
                    <CategoryGroupHeader
                      title="Hospitality & Hotel Operations"
                      count={categoryCounts.hotel}
                      icon={Home}
                      description="Manage guest reservations, room availability, housekeeping tasks, and front desk check-in/out"
                      onFocus={() => selectDashboardCategory("hotel")}
                    />
                  )}
                  {dashboardAccess.reservations && (
                    <Card
                      data-dashboard-category="hotel"
                      className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden dashboard-launcher-card"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
                      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                        <CardTitle className="min-w-0 text-pretty text-base font-medium text-gray-800 dark:text-gray-200">
                          Reservations
                        </CardTitle>
                        <Briefcase className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                      </CardHeader>
                      <CardContent className="relative z-10">
                        <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                          Bookings
                        </div>
                        <p className="text-base leading-6 text-muted-foreground">
                          Manage guest reservations and bookings
                        </p>
                      </CardContent>
                      <CardFooter className="relative z-10">
                        <DashboardLaunchButton href="/hotels/reservations">
                          Manage Reservations
                        </DashboardLaunchButton>
                      </CardFooter>
                    </Card>
                  )}
                  {dashboardAccess.rooms && !isHousekeeping && (
                    <Card
                      data-dashboard-category="hotel"
                      className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden dashboard-launcher-card"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
                      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                        <CardTitle className="min-w-0 text-pretty text-base font-medium text-gray-800 dark:text-gray-200">
                          Rooms
                        </CardTitle>
                        <Home className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                      </CardHeader>
                      <CardContent className="relative z-10">
                        <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                          Rooms
                        </div>
                        <p className="text-base leading-6 text-muted-foreground">
                          Track room status and availability
                        </p>
                      </CardContent>
                      <CardFooter className="relative z-10">
                        <DashboardLaunchButton href="/hotels/rooms">
                          View Rooms
                        </DashboardLaunchButton>
                      </CardFooter>
                    </Card>
                  )}
                  {(dashboardAccess.housekeeping || isHousekeeping) && (
                    <Card
                      data-dashboard-category="hotel"
                      className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden dashboard-launcher-card"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
                      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                        <CardTitle className="min-w-0 text-pretty text-base font-medium text-gray-800 dark:text-gray-200">
                          Housekeeping
                        </CardTitle>
                        <CheckSquare className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                      </CardHeader>
                      <CardContent className="relative z-10">
                        <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                          Tasks
                        </div>
                        <p className="text-base leading-6 text-muted-foreground">
                          Room cleaning and maintenance tasks
                        </p>
                      </CardContent>
                      <CardFooter className="relative z-10">
                        <DashboardLaunchButton href="/hotels/housekeeping">
                          View Tasks
                        </DashboardLaunchButton>
                      </CardFooter>
                    </Card>
                  )}
                  {dashboardAccess.checkIn && (
                    <Card
                      data-dashboard-category="hotel"
                      className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden dashboard-launcher-card"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
                      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                        <CardTitle className="min-w-0 text-pretty text-base font-medium text-gray-800 dark:text-gray-200">
                          Check-In/Out
                        </CardTitle>
                        <DoorOpen className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                      </CardHeader>
                      <CardContent className="relative z-10">
                        <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                          Front Desk
                        </div>
                        <p className="text-base leading-6 text-muted-foreground">
                          Guest check-in and check-out management
                        </p>
                      </CardContent>
                      <CardFooter className="relative z-10">
                        <DashboardLaunchButton href="/hotels/check-in">
                          Process Check-In
                        </DashboardLaunchButton>
                      </CardFooter>
                    </Card>
                  )}
                </>
              )}

              {/* Restaurant Operations */}
              {(activeDashboardCategory === "all" || activeDashboardCategory === "restaurant") && categoryCounts.restaurant > 0 && (
                <>
                  {activeDashboardCategory === "all" && (
                    <CategoryGroupHeader
                      title="Food Service & Restaurant Operations"
                      count={categoryCounts.restaurant}
                      icon={Utensils}
                      description="Point of sale, kitchen display orders, menu management, and stock inventory"
                      onFocus={() => selectDashboardCategory("restaurant")}
                    />
                  )}
                  {dashboardAccess.pos && (
                    <Card
                      data-dashboard-category="restaurant"
                      className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden dashboard-launcher-card"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
                      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                        <CardTitle className="min-w-0 text-pretty text-base font-medium text-gray-800 dark:text-gray-200">
                          POS Terminal
                        </CardTitle>
                        <ShoppingCart className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                      </CardHeader>
                      <CardContent className="relative z-10">
                        <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                          Sales
                        </div>
                        <p className="text-base leading-6 text-muted-foreground">
                          Process orders and payments
                        </p>
                      </CardContent>
                      <CardFooter className="relative z-10">
                        <DashboardLaunchButton href="/pos">Open POS</DashboardLaunchButton>
                      </CardFooter>
                    </Card>
                  )}
                  {dashboardAccess.kitchen && (
                    <Card
                      data-dashboard-category="restaurant"
                      className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden dashboard-launcher-card"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
                      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                        <CardTitle className="min-w-0 text-pretty text-base font-medium text-gray-800 dark:text-gray-200">
                          Kitchen Display
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Switch
                                    checked={toggles.kitchen_display}
                                    disabled={
                                      !canManage || updating === "kitchen_display"
                                    }
                                    onCheckedChange={(checked) =>
                                      handleFeatureToggle("kitchen_display", checked)
                                    }
                                    aria-label="Toggle Kitchen Display"
                                  />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {canManage
                                  ? toggles.kitchen_display
                                    ? "Disable Kitchen Display for all staff"
                                    : "Enable Kitchen Display for all staff"
                                  : "Only admins or managers can change this"}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <ChefHat className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                        </div>
                      </CardHeader>
                      <CardContent className="relative z-10">
                        <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                          Orders
                        </div>
                        <p className="text-base leading-6 text-muted-foreground">
                          {toggles.kitchen_display
                            ? "Manage kitchen operations"
                            : "Disabled by administrator"}
                        </p>
                      </CardContent>
                      <CardFooter className="relative z-10">
                        <DashboardLaunchButton href="/kitchen">View Kitchen</DashboardLaunchButton>
                      </CardFooter>
                    </Card>
                  )}
                  {dashboardAccess.orderBoard && (
                    <Card
                      data-dashboard-category="restaurant"
                      className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden dashboard-launcher-card"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
                      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                        <CardTitle className="min-w-0 text-pretty text-base font-medium text-gray-800 dark:text-gray-200">
                          Order Board
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Switch
                                    checked={toggles.order_board}
                                    disabled={!canManage || updating === "order_board"}
                                    onCheckedChange={(checked) =>
                                      handleFeatureToggle("order_board", checked)
                                    }
                                    aria-label="Toggle Order Board"
                                  />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {canManage
                                  ? toggles.order_board
                                    ? "Disable Order Board for all staff"
                                    : "Enable Order Board for all staff"
                                  : "Only admins or managers can change this"}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <Grid3X3 className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                        </div>
                      </CardHeader>
                      <CardContent className="relative z-10">
                        <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                          Live Grid
                        </div>
                        <p className="text-base leading-6 text-muted-foreground">
                          {toggles.order_board
                            ? "Real-time order tracking"
                            : "Disabled by administrator"}
                        </p>
                      </CardContent>
                      <CardFooter className="relative z-10">
                        <DashboardLaunchButton href="/order-display?mode=grid">View Orders</DashboardLaunchButton>
                      </CardFooter>
                    </Card>
                  )}
                  {dashboardAccess.menu && (
                    <Card
                      data-dashboard-category="restaurant"
                      className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden dashboard-launcher-card"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
                      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                        <CardTitle className="min-w-0 text-pretty text-base font-medium text-gray-800 dark:text-gray-200">
                          Menu Management
                        </CardTitle>
                        <Utensils className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                      </CardHeader>
                      <CardContent className="relative z-10">
                        <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                          Menu
                        </div>
                        <p className="text-base leading-6 text-muted-foreground">
                          Manage menu items and pricing
                        </p>
                      </CardContent>
                      <CardFooter className="relative z-10">
                        <DashboardLaunchButton href="/menu">Manage Menu</DashboardLaunchButton>
                      </CardFooter>
                    </Card>
                  )}
                  {dashboardAccess.inventory && (
                    <Card
                      data-dashboard-category="restaurant"
                      className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden dashboard-launcher-card"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
                      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                        <CardTitle className="min-w-0 text-pretty text-base font-medium text-gray-800 dark:text-gray-200">
                          Inventory
                        </CardTitle>
                        <Package className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                      </CardHeader>
                      <CardContent className="relative z-10">
                        <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                          Stock
                        </div>
                        <p className="text-base leading-6 text-muted-foreground">
                          Track inventory and supplies
                        </p>
                      </CardContent>
                      <CardFooter className="relative z-10">
                        <DashboardLaunchButton href="/inventory">View Inventory</DashboardLaunchButton>
                      </CardFooter>
                    </Card>
                  )}
                </>
              )}

              {/* Finance Operations */}
              {(activeDashboardCategory === "all" || activeDashboardCategory === "finance") && categoryCounts.finance > 0 && (
                <>
                  {activeDashboardCategory === "all" && (
                    <CategoryGroupHeader
                      title="Financial Operations & Auditing"
                      count={categoryCounts.finance}
                      icon={CreditCard}
                      description="Canonical financial ledger, sales analytics, customer refunds, payments, and receipts"
                      onFocus={() => selectDashboardCategory("finance")}
                    />
                  )}
                  {dashboardAccess.finance && (
                    <Card
                      data-dashboard-category="finance"
                      className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden dashboard-launcher-card"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20" />
                      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                        <CardTitle className="min-w-0 text-pretty text-base font-medium text-gray-800 dark:text-gray-200">
                          Finance Desk
                        </CardTitle>
                        <CreditCard
                          className="h-4 w-4 text-orange-600 dark:text-orange-400"
                          aria-hidden="true"
                        />
                      </CardHeader>
                      <CardContent className="relative z-10">
                        <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                          Finance
                        </div>
                        <p className="text-base leading-6 text-muted-foreground">
                          Canonical ledger view for posted sales, refunds, expenses, and
                          exceptions.
                        </p>
                        <p className="mt-2 text-xs font-medium text-muted-foreground">
                          Source of truth: canonical financial ledger
                        </p>
                      </CardContent>
                      <CardFooter className="relative z-10">
                        <DashboardLaunchButton href="/finance">Open Finance</DashboardLaunchButton>
                      </CardFooter>
                    </Card>
                  )}
                  {dashboardAccess.reports && (
                    <Card
                      data-dashboard-category="finance"
                      className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden dashboard-launcher-card"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
                      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                        <CardTitle className="min-w-0 text-pretty text-base font-medium text-gray-800 dark:text-gray-200">
                          Reports
                        </CardTitle>
                        <BarChart3 className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                      </CardHeader>
                      <CardContent className="relative z-10">
                        <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                          Analytics
                        </div>
                        <p className="text-base leading-6 text-muted-foreground">
                          Sales reports and analytics
                        </p>
                      </CardContent>
                      <CardFooter className="relative z-10">
                        <DashboardLaunchButton href="/reports">View Reports</DashboardLaunchButton>
                      </CardFooter>
                    </Card>
                  )}
                  {dashboardAccess.refunds && (
                    <Card
                      data-dashboard-category="finance"
                      className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden dashboard-launcher-card"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
                      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                        <CardTitle className="min-w-0 text-pretty text-base font-medium text-gray-800 dark:text-gray-200">
                          Refund Management
                        </CardTitle>
                        <Receipt className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                      </CardHeader>
                      <CardContent className="relative z-10">
                        <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                          Refunds
                        </div>
                        <p className="text-base leading-6 text-muted-foreground">
                          Manage and request customer refunds
                        </p>
                      </CardContent>
                      <CardFooter className="relative z-10">
                        <DashboardLaunchButton href="/refunds">Manage Refunds</DashboardLaunchButton>
                      </CardFooter>
                    </Card>
                  )}
                  {dashboardAccess.payments && (
                    <Card
                      data-dashboard-category="finance"
                      className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden dashboard-launcher-card"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
                      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                        <CardTitle className="min-w-0 text-pretty text-base font-medium text-gray-800 dark:text-gray-200">
                          Payments
                        </CardTitle>
                        <CreditCard className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                      </CardHeader>
                      <CardContent className="relative z-10">
                        <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                          Transactions
                        </div>
                        <p className="text-base leading-6 text-muted-foreground">
                          Payment history and methods
                        </p>
                      </CardContent>
                      <CardFooter className="relative z-10">
                        <DashboardLaunchButton href="/payments">View Payments</DashboardLaunchButton>
                      </CardFooter>
                    </Card>
                  )}
                  {dashboardAccess.receipt && (
                    <Card
                      data-dashboard-category="finance"
                      className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden dashboard-launcher-card"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
                      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                        <CardTitle className="min-w-0 text-pretty text-base font-medium text-gray-800 dark:text-gray-200">
                          Receipt Preview
                        </CardTitle>
                        <Receipt className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                      </CardHeader>
                      <CardContent className="relative z-10">
                        <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                          Receipts
                        </div>
                        {receiptStats ? (
                          <div className="my-2 grid grid-cols-2 gap-2 text-xs text-foreground">
                            <div>
                              Today:{" "}
                              <span className="font-semibold">
                                {receiptStats.today}
                              </span>
                            </div>
                            <div>
                              This week:{" "}
                              <span className="font-semibold">{receiptStats.week}</span>
                            </div>
                            <div>
                              This month:{" "}
                              <span className="font-semibold">
                                {receiptStats.month}
                              </span>
                            </div>
                            <div>
                              Total:{" "}
                              <span className="font-semibold">
                                {receiptStats.total}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <p className="my-2 text-xs text-muted-foreground">
                            Receipt activity is loading from the canonical receipt
                            register.
                          </p>
                        )}
                        <p className="text-base leading-6 text-muted-foreground">
                          Search and print only persisted transaction receipts.
                        </p>
                      </CardContent>
                      <CardFooter className="relative z-10">
                        <DashboardLaunchButton href="/receipt">View Receipts</DashboardLaunchButton>
                      </CardFooter>
                    </Card>
                  )}
                </>
              )}

              {/* Event Organization */}
              {(activeDashboardCategory === "all" || activeDashboardCategory === "events") && categoryCounts.events > 0 && (
                <>
                  {activeDashboardCategory === "all" && (
                    <CategoryGroupHeader
                      title="Event Organization & Banqueting"
                      count={categoryCounts.events}
                      icon={CalendarDays}
                      description="Plan events, coordinate venue spaces, oversee guest lists, and prepare quotations"
                      onFocus={() => selectDashboardCategory("events")}
                    />
                  )}
                  {dashboardAccess.events && (
                    <Card
                      data-dashboard-category="events"
                      className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden dashboard-launcher-card"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20" />
                      <CardHeader className="relative z-10 flex flex-row items-center justify-between rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 pb-2 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10">
                        <CardTitle className="text-base font-medium text-gray-800 dark:text-gray-200">
                          Event Organization
                        </CardTitle>
                        <CalendarDays className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                      </CardHeader>
                      <CardContent className="relative z-10">
                        <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                          Events
                        </div>
                        <p className="text-base leading-6 text-muted-foreground">
                          Plan events, coordinate venues, manage guests, assign delivery
                          teams, and prepare quotations through the Pricing desk.
                        </p>
                        <DashboardLaunchButton href="/events">
                          Open Event Organization
                        </DashboardLaunchButton>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}

              {/* Technical Operations */}
              {(activeDashboardCategory === "all" || activeDashboardCategory === "technical") && categoryCounts.technical > 0 && (
                <>
                  {activeDashboardCategory === "all" && (
                    <CategoryGroupHeader
                      title="Technical Operations & Maintenance"
                      count={categoryCounts.technical}
                      icon={Wrench}
                      description="Coordinate property maintenance, facility repairs, and technical tickets"
                      onFocus={() => selectDashboardCategory("technical")}
                    />
                  )}
                  {dashboardAccess.operations && (
                    <Card
                      data-dashboard-category="technical"
                      className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden dashboard-launcher-card"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20" />
                      <CardHeader className="relative z-10 flex flex-row items-center justify-between rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 pb-2 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10">
                        <CardTitle className="min-w-0 text-pretty text-base font-medium text-gray-800 dark:text-gray-200">
                          Technical Operations
                        </CardTitle>
                        <Wrench
                          className="h-4 w-4 text-orange-600 dark:text-orange-400"
                          aria-hidden="true"
                        />
                      </CardHeader>
                      <CardContent className="relative z-10">
                        <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                          Maintenance
                        </p>
                        <p className="text-base leading-6 text-muted-foreground">
                          Coordinate hotel and restaurant technical issues
                        </p>
                      </CardContent>
                      <CardFooter className="relative z-10">
                        <DashboardLaunchButton href="/operations">Open Operations</DashboardLaunchButton>
                      </CardFooter>
                    </Card>
                  )}
                </>
              )}

              {/* Administration & Governance */}
              {(activeDashboardCategory === "all" || activeDashboardCategory === "administration") && categoryCounts.administration > 0 && (
                <>
                  {activeDashboardCategory === "all" && (
                    <CategoryGroupHeader
                      title="Administration & System Governance"
                      count={categoryCounts.administration}
                      icon={Monitor}
                      description="Inspect system health, hardware metrics, audit trails, and security controls"
                      onFocus={() => selectDashboardCategory("administration")}
                    />
                  )}
                  {dashboardAccess.system && (
                    <Card
                      data-dashboard-category="administration"
                      className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden dashboard-launcher-card"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
                      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                        <CardTitle className="min-w-0 text-pretty text-base font-medium text-gray-800 dark:text-gray-200">
                          System Monitoring
                        </CardTitle>
                        <Monitor className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                      </CardHeader>
                      <CardContent className="relative z-10">
                        <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                          Monitor
                        </div>
                        <p className="text-base leading-6 text-muted-foreground">
                          Hardware status and system health
                        </p>
                      </CardContent>
                      <CardFooter className="relative z-10">
                        <DashboardLaunchButton href="/system">View System</DashboardLaunchButton>
                      </CardFooter>
                    </Card>
                  )}
                </>
              )}

              {/* Empty state if filtered category has 0 cards */}
              {activeDashboardCategory !== "all" && categoryCounts[activeDashboardCategory] === 0 && (
                <div className="col-span-full py-12 px-4 rounded-3xl border border-dashed border-orange-300 dark:border-orange-800 bg-white/50 dark:bg-gray-800/50 text-center">
                  <p className="text-base font-medium text-gray-700 dark:text-gray-300">
                    No accessible workspaces found in this category for your current role.
                  </p>
                  <Button
                    variant="link"
                    onClick={() => selectDashboardCategory("all")}
                    className="text-orange-600 dark:text-orange-400 mt-2 text-sm font-semibold"
                  >
                    Return to all categories
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        {!isHousekeeping && user.role === "kitchen" && (
          <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-7 mb-4">
            <ChefRecipeCard />
          </div>
        )}

        {!isHousekeeping && (
          <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="min-w-0 md:col-span-2 lg:col-span-4 hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="text-gray-800 dark:text-gray-200">
                  Welcome to{" "}
                  {settings.account.restaurantName || "your business"}
                </CardTitle>
                <CardDescription className="text-orange-600 dark:text-orange-400">
                  A single operating view for service, kitchen flow, and
                  business performance
                </CardDescription>
              </CardHeader>
              <CardContent className="pl-2 relative z-10">
                <div className="space-y-4 p-4">
                  {operationalModules.map((module) => (
                    <div key={module.title} className="flex items-center gap-3">
                      <div className="rounded-full bg-gradient-to-r from-orange-100 via-amber-100 to-yellow-100 p-2 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30">
                        {module.icon}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                          {module.title}
                        </p>
                        <p className="text-base leading-6 text-muted-foreground">
                          {module.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            {user.role !== "staff" && (
              <Card className="min-w-0 md:col-span-2 lg:col-span-3 hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
                <CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                  <CardTitle className="text-gray-800 dark:text-gray-200">
                    Quick Actions
                  </CardTitle>
                  <CardDescription className="text-orange-600 dark:text-orange-400">
                    Shortcuts mapped directly to the operational cards on this
                    dashboard
                  </CardDescription>
                </CardHeader>
                <CardContent className="relative z-10">
                  <div className="space-y-2">
                    {operationalModules.map((module) => (
                      <Link
                        key={module.title}
                        href={module.href}
                        className="block"
                      >
                        <Button
                          variant="ghost"
                          className="w-full justify-start rounded-2xl text-orange-700 hover:bg-orange-50 dark:text-orange-300 dark:hover:bg-orange-900/20"
                        >
                          {module.icon}
                          <span className="ml-2">{module.title}</span>
                        </Button>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function Dashboard() {
  return <DashboardContent />;
}
