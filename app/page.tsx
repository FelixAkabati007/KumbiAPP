"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  BarChart3,
  ChefHat,
  CreditCard,
  Grid3X3,
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
} from "lucide-react";
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
import { useCallback, useEffect, useRef, useState } from "react";
import { rolePermissions, roleDashboardConfig, UserRole, AppSection, getRoleDisplayName } from "@/lib/roles";
import { UserNav } from "@/components/user-nav";
import { Switch } from "@/components/ui/switch";
import { useFeatureToggles } from "@/hooks/use-feature-toggles";

function DashboardContent() {
  const { user, logout } = useAuth();
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
  const dashboardCategories = [
  ["all", "All Categories"],
  ["hotel", "Hotel"],
  ["restaurant", "Restaurant"],
  ["finance", "Finance"],
  ["technical", "Technical Operations"],
  ["administration", "Administration"],
  ["events", "Event Organization"],
] as const;
const [activeDashboardCategory, setActiveDashboardCategory] = useState<(typeof dashboardCategories)[number][0]>("all");

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

  // Load receipt stats from Neon
  const { stats: receiptStats } = useReceiptStats();

  // Kitchen Display / Order Board admin enable-disable toggles
  const { toggles, canManage, updating, setToggle } = useFeatureToggles();

  const handleFeatureToggle = useCallback(
    async (key: "kitchen_display" | "order_board", nextEnabled: boolean) => {
      const label = key === "kitchen_display" ? "Kitchen Display" : "Order Board";
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
    [setToggle, toast]
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

  if (!user) {
    return <SignInForm />;
  }

  const access: Record<AppSection, boolean> =
    rolePermissions[user.role as UserRole] ||
    ({} as Record<AppSection, boolean>);
  const roleDashboard = roleDashboardConfig[user.role as UserRole] || roleDashboardConfig.staff;
  const isHousekeeping = user.role === "housekeeping";
  const categorySectionMap: Record<(typeof dashboardCategories)[number][0], AppSection[]> = {
    all: [],
    hotel: ["rooms", "reservations", "checkIn", "checkOut", "housekeeping", "guestFolio"],
    restaurant: ["pos", "kitchen", "orderBoard", "menu", "inventory"],
    finance: ["finance", "payments", "refunds", "reports", "receipt"],
    technical: ["operations", "maintenance"],
    administration: ["system"],
  events: ["events"],
  };
  const availableDashboardCategories = dashboardCategories.filter(([category]) =>
    category === "all" ||
    (roleDashboard.categories.includes(category) && categorySectionMap[category].some((section) => access[section])),
  );
  const canSwitchDashboardCategories = availableDashboardCategories.length > 1;

  return (
    <div
      ref={mainRef}
      className="flex min-h-screen w-full flex-col bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950"
    >
      <header className="sticky top-0 z-40 w-full min-w-0 border-b border-orange-200 bg-gradient-to-r from-orange-50/95 via-amber-50/95 to-yellow-50/95 backdrop-blur-md dark:border-orange-700 dark:from-orange-950/95 dark:via-amber-950/95 dark:to-yellow-950/95">
        <div className="container mx-auto flex min-h-16 w-full min-w-0 flex-wrap items-center gap-2 px-3 py-2 sm:justify-between sm:px-4 md:px-6 lg:gap-4">
          <div className="flex min-w-0 flex-1 basis-full gap-3 sm:basis-auto md:gap-6 lg:gap-10">
            <div className="flex min-w-0 items-center gap-2">
              <LogoDisplay size="sm" />
              <Utensils className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              <span className="inline-block min-w-0 truncate font-bold text-base text-gray-800 dark:text-gray-200 sm:text-lg lg:text-xl">
                {/* Suppress hydration warnings for text that can differ between SSR default and client-saved settings */}
                {/* Mobile view: KHRMS (max-width: 768px) */}
                <span className="md:hidden">KHRMS</span>
                {/* Desktop view: Full Name */}
                <span className="hidden lg:inline" suppressHydrationWarning>
                  {settings.account.restaurantName}
                </span>
              </span>
            </div>
          </div>
<div className="flex min-w-0 basis-full flex-wrap items-center justify-start gap-2 sm:basis-auto sm:justify-end sm:gap-3">
  <div className="hidden items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 dark:border-orange-700 dark:bg-orange-900/30 sm:flex">
  <span className="max-w-40 truncate text-sm font-medium text-orange-700 dark:text-orange-300">
  Welcome, {user.name}
  </span>
  </div>
            <Link href="/split-workspace" prefetch={false}>
              <Button
                variant="outline"
                size="sm"
                aria-label="Open split POS and Kitchen workspace"
                className="gap-2 rounded-2xl border-orange-300 bg-orange-100/80 text-orange-700 shadow-sm hover:bg-orange-200 dark:border-orange-700 dark:bg-orange-900/30 dark:text-orange-300 dark:hover:bg-orange-900/50"
              >
                <SplitSquareHorizontal className="h-4 w-4" />
                <span className="hidden xl:inline">Split workspace</span>
              </Button>
            </Link>
            <Link href="/settings" prefetch={false}>
              <Button
                variant="outline"
                size="sm"
                className="border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300 rounded-2xl bg-transparent"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </Link>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLogout}
                    className="border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300 rounded-2xl bg-transparent relative group"
                  >
                    <LogOut className="h-4 w-4" />
                    <span className="absolute -top-1 -right-1 text-xs bg-orange-500 text-white rounded-full w-3 h-3 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      L
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Sign Out (Ctrl+Shift+L)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button
              variant="outline"
              size="sm"
              aria-label={isFullscreen ? "Minimize" : "Maximize"}
              onClick={handleToggleFullscreen}
              className="border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300 rounded-2xl bg-transparent"
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
            {/* User avatar menu */}
            <UserNav />
            {/* Reset Dashboard button REMOVED per user request */}
          </div>
        </div>
      </header>

      <main className="flex-1 space-y-5 p-3 pt-4 sm:p-4 md:p-8 md:pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-orange-700 dark:text-orange-300">{roleDashboard.summary}</p>
            <h2 className="responsive-heading mt-1 font-bold tracking-tight text-gray-800 dark:text-gray-200">Dashboard</h2>
            <p className="important-description mt-3 max-w-2xl text-sm">{roleDashboard.focus}</p>
          </div>
          <div className="flex min-w-0 flex-col items-stretch gap-2 sm:items-end">
            {canSwitchDashboardCategories && (
              <div className="safe-scroll-x flex w-full max-w-full gap-2 pb-1 sm:w-auto sm:flex-wrap sm:overflow-visible sm:pb-0" role="group" aria-label="Dashboard container category">
                {availableDashboardCategories.map(([category, label]) => (
                  <Button key={category} type="button" size="sm" variant={activeDashboardCategory === category ? "default" : "outline"} onClick={() => setActiveDashboardCategory(category)} className="shrink-0 whitespace-nowrap rounded-2xl border-orange-200 text-xs dark:border-orange-700">
                    {label}
                  </Button>
                ))}
              </div>
            )}
            <Link href={roleDashboard.primaryHref} className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700">{roleDashboard.primaryAction}</Link>
            <div className="flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-orange-100 via-amber-100 to-yellow-100 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-full border border-orange-200 dark:border-orange-700">
              <Sparkles className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
{getRoleDisplayName(user.role)} Access
              </span>
            </div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{roleDashboard.visibilityNote}</p>

        <style>{`[data-dashboard-category-filter]:not([data-dashboard-category-filter="all"]) [data-dashboard-category]:not([data-dashboard-category="all"]) { display: none; } [data-dashboard-category-filter="events"] [data-dashboard-category="events"] { display: block !important; } [data-dashboard-category-filter="hotel"] [data-dashboard-category="hotel"], [data-dashboard-category-filter="restaurant"] [data-dashboard-category="restaurant"], [data-dashboard-category-filter="finance"] [data-dashboard-category="finance"], [data-dashboard-category-filter="technical"] [data-dashboard-category="technical"], [data-dashboard-category-filter="administration"] [data-dashboard-category="administration"] { display: block; }`}</style>
        <div data-dashboard-category-filter={activeDashboardCategory} className="dashboard-category-grid responsive-grid">
          <Card data-dashboard-category="all" className="relative overflow-hidden rounded-3xl border border-orange-200 bg-white/70 shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-xl dark:border-orange-700 dark:bg-gray-800/70 md:hover:scale-105">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20" />
            <CardHeader className="relative z-10 flex flex-row items-center justify-between rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 pb-2 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10">
              <CardTitle className="text-sm font-medium text-gray-800 dark:text-gray-200">Staff Attendance Register</CardTitle>
              <Clock3 className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </CardHeader>
            <CardContent className="relative z-10">
              <p className="text-sm leading-6 text-muted-foreground"><strong className="font-bold text-foreground">Attendance:</strong> Check in, check out, and view the status of today&apos;s attendance record.</p>
              <Link href={user.role === "staff" ? "/staff/attendance" : "/attendance"} className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2">{user.role === "staff" ? "Open staff attendance" : "Open attendance register"}</Link>
            </CardContent>
          </Card>
          {access.events && (
            <Card data-dashboard-category="events" className="relative overflow-hidden rounded-3xl border border-orange-200 bg-white/70 shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-xl dark:border-orange-700 dark:bg-gray-800/70 md:hover:scale-105">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20" />
              <CardHeader className="relative z-10 flex flex-row items-center justify-between rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 pb-2 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10">
                <CardTitle className="text-sm font-medium text-gray-800 dark:text-gray-200">Event Organization</CardTitle>
                <CalendarDays className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </CardHeader>
              <CardContent className="relative z-10">
                <p className="text-sm leading-6 text-muted-foreground"><strong className="font-bold text-foreground">Events:</strong> Plan events, coordinate venues, manage guests, and assign delivery teams.</p>
                <Link href="/events" className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2">Open Event Organization</Link>
              </CardContent>
            </Card>
          )}
          {access.pos && (
            <Card data-dashboard-category="restaurant" className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="min-w-0 text-pretty text-sm font-medium text-gray-800 dark:text-gray-200">
                  POS Terminal
                </CardTitle>
                <ShoppingCart className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                  Sales
                </div>
                <p className="text-xs text-muted-foreground">
                  Process orders and payments
                </p>
              </CardContent>
              <CardFooter className="relative z-10">
                <Link href="/pos" className="w-full">
                  <Button className="w-full rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg">
                    Open POS
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          )}
          {access.kitchen && (
            <Card data-dashboard-category="restaurant" className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="min-w-0 text-pretty text-sm font-medium text-gray-800 dark:text-gray-200">
                  Kitchen Display
                </CardTitle>
                <div className="flex items-center gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Switch
                            checked={toggles.kitchen_display}
                            disabled={!canManage || updating === "kitchen_display"}
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
                <p className="text-xs text-muted-foreground">
                  {toggles.kitchen_display
                    ? "Manage kitchen operations"
                    : "Disabled by administrator"}
                </p>
              </CardContent>
              <CardFooter className="relative z-10">
                <Link href="/kitchen" className="w-full">
                  <Button className="w-full rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg">
                    View Kitchen
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          )}
          {access.orderBoard && (
            <Card data-dashboard-category="restaurant" className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="min-w-0 text-pretty text-sm font-medium text-gray-800 dark:text-gray-200">
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
                <p className="text-xs text-muted-foreground">
                  {toggles.order_board
                    ? "Real-time order tracking"
                    : "Disabled by administrator"}
                </p>
              </CardContent>
              <CardFooter className="relative z-10">
                <Link href="/order-display?mode=grid" className="w-full">
                  <Button className="w-full rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg">
                    View Orders
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          )}
          {access.menu && (
            <Card data-dashboard-category="restaurant" className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="min-w-0 text-pretty text-sm font-medium text-gray-800 dark:text-gray-200">
                  Menu Management
                </CardTitle>
                <Utensils className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                  Menu
                </div>
                <p className="text-xs text-muted-foreground">
                  Manage menu items and pricing
                </p>
              </CardContent>
              <CardFooter className="relative z-10">
                <Link href="/menu" className="w-full">
                  <Button className="w-full rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg">
                    Manage Menu
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          )}
          {access.inventory && (
            <Card data-dashboard-category="restaurant" className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="min-w-0 text-pretty text-sm font-medium text-gray-800 dark:text-gray-200">
                  Inventory
                </CardTitle>
                <Package className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                  Stock
                </div>
                <p className="text-xs text-muted-foreground">
                  Track inventory and supplies
                </p>
              </CardContent>
              <CardFooter className="relative z-10">
                <Link href="/inventory" className="w-full">
                  <Button className="w-full rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg">
                    View Inventory
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          )}
          {access.operations && (
    <Card data-dashboard-category="technical" className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20" />
      <CardHeader className="relative z-10 flex flex-row items-center justify-between rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 pb-2 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10">
        <CardTitle className="min-w-0 text-pretty text-sm font-medium text-gray-800 dark:text-gray-200">Technical Operations</CardTitle>
        <Wrench className="h-4 w-4 text-orange-600 dark:text-orange-400" aria-hidden="true" />
      </CardHeader>
      <CardContent className="relative z-10">
        <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">Maintenance</p>
        <p className="text-xs text-muted-foreground">Coordinate hotel and restaurant technical issues</p>
      </CardContent>
      <CardFooter className="relative z-10">
        <Link href="/operations" className="w-full"><Button className="w-full rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 text-white shadow-lg hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600">Open Operations</Button></Link>
      </CardFooter>
    </Card>
  )}
  {access.finance && (
            <Card data-dashboard-category="finance" className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20" />
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="min-w-0 text-pretty text-sm font-medium text-gray-800 dark:text-gray-200">Finance Desk</CardTitle>
                <CreditCard className="h-4 w-4 text-orange-600 dark:text-orange-400" aria-hidden="true" />
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">Finance</div>
                <p className="text-xs text-muted-foreground">Reconcile payments and review transaction activity.</p>
              </CardContent>
              <CardFooter className="relative z-10">
                <Link href="/finance" className="w-full">
                  <Button className="w-full rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg">Open Finance</Button>
                </Link>
              </CardFooter>
            </Card>
          )}
          {access.reports && (
            <Card data-dashboard-category="finance" className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="min-w-0 text-pretty text-sm font-medium text-gray-800 dark:text-gray-200">
                  Reports
                </CardTitle>
                <BarChart3 className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                  Analytics
                </div>
                <p className="text-xs text-muted-foreground">
                  Sales reports and analytics
                </p>
              </CardContent>
              <CardFooter className="relative z-10">
                <Link href="/reports" className="w-full">
                  <Button className="w-full rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg">
                    View Reports
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          )}
          {access.refunds && (
            <Card data-dashboard-category="finance" className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="min-w-0 text-pretty text-sm font-medium text-gray-800 dark:text-gray-200">
                  Refund Management
                </CardTitle>
                <Receipt className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                  Refunds
                </div>
                <p className="text-xs text-muted-foreground">
                  Manage and request customer refunds
                </p>
              </CardContent>
              <CardFooter className="relative z-10">
                <Link href="/refunds" className="w-full">
                  <Button className="w-full rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg">
                    Manage Refunds
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          )}
          {access.payments && (
            <Card data-dashboard-category="finance" className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="min-w-0 text-pretty text-sm font-medium text-gray-800 dark:text-gray-200">
                  Payments
                </CardTitle>
                <CreditCard className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                  Transactions
                </div>
                <p className="text-xs text-muted-foreground">
                  Payment history and methods
                </p>
              </CardContent>
              <CardFooter className="relative z-10">
                <Link href="/payments" className="w-full">
                  <Button className="w-full rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg">
                    View Payments
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          )}
          {access.receipt && (
            <Card data-dashboard-category="finance" className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="min-w-0 text-pretty text-sm font-medium text-gray-800 dark:text-gray-200">
                  Receipt Preview
                </CardTitle>
                <Receipt className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                  Receipts
                </div>
                <div className="my-2 grid grid-cols-2 gap-2 text-xs text-gray-700 dark:text-gray-300">
                  {receiptStats ? (
                    <>
                      <div>
                        Today:{" "}
                        <span className="font-semibold">
                          {receiptStats.today}
                        </span>
                      </div>
                      <div>
                        This Week:{" "}
                        <span className="font-semibold">
                          {receiptStats.week}
                        </span>
                      </div>
                      <div>
                        This Month:{" "}
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
                    </>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  View and print receipts
                </p>
              </CardContent>
              <CardFooter className="relative z-10">
                <Link href="/receipt" className="w-full">
                  <Button className="w-full rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg">
                    View Receipts
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          )}
          {access.system && (
            <Card data-dashboard-category="administration" className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="min-w-0 text-pretty text-sm font-medium text-gray-800 dark:text-gray-200">
                  System Monitoring
                </CardTitle>
                <Monitor className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                  Monitor
                </div>
                <p className="text-xs text-muted-foreground">
                  Hardware status and system health
                </p>
              </CardContent>
              <CardFooter className="relative z-10">
                <Link href="/system" className="w-full">
                  <Button className="w-full rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg">
                    View System
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          )}
          {access.reservations && (
            <Card data-dashboard-category="hotel" className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="min-w-0 text-pretty text-sm font-medium text-gray-800 dark:text-gray-200">
                  Reservations
                </CardTitle>
                <Briefcase className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                  Bookings
                </div>
                <p className="text-xs text-muted-foreground">
                  Manage guest reservations and bookings
                </p>
              </CardContent>
              <CardFooter className="relative z-10">
                <Link href="/hotels/reservations" className="w-full">
                  <Button className="w-full rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg cursor-pointer">
                    Manage Reservations
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          )}
          {access.rooms && !isHousekeeping && (
            <Card data-dashboard-category="hotel" className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="min-w-0 text-pretty text-sm font-medium text-gray-800 dark:text-gray-200">
                  Rooms
                </CardTitle>
                <Home className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                  Rooms
                </div>
                <p className="text-xs text-muted-foreground">
                  Track room status and availability
                </p>
              </CardContent>
              <CardFooter className="relative z-10">
                <Link href="/hotels/rooms" className="w-full">
                  <Button className="w-full rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg cursor-pointer">
                    View Rooms
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          )}
          {(access.housekeeping || isHousekeeping) && (
            <Card data-dashboard-category="hotel" className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="min-w-0 text-pretty text-sm font-medium text-gray-800 dark:text-gray-200">
                  Housekeeping
                </CardTitle>
                <CheckSquare className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                  Tasks
                </div>
                <p className="text-xs text-muted-foreground">
                  Room cleaning and maintenance tasks
                </p>
              </CardContent>
              <CardFooter className="relative z-10">
                <Link href="/hotels/housekeeping" className="w-full">
                  <Button className="w-full rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg cursor-pointer">
                    View Tasks
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          )}
          {access.checkIn && (
            <Card data-dashboard-category="hotel" className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl md:hover:scale-105 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="min-w-0 text-pretty text-sm font-medium text-gray-800 dark:text-gray-200">
                  Check-In/Out
                </CardTitle>
                <DoorOpen className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                  Front Desk
                </div>
                <p className="text-xs text-muted-foreground">
                  Guest check-in and check-out management
                </p>
              </CardContent>
              <CardFooter className="relative z-10">
                <Link href="/hotels/check-in" className="w-full">
                  <Button className="w-full rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg cursor-pointer">
                    Process Check-In
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          )}
        </div>

        {!isHousekeeping && <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-7">
          <Card className="min-w-0 md:col-span-2 lg:col-span-4 hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
            <CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
              <CardTitle className="text-gray-800 dark:text-gray-200">
                Welcome to {settings.account.restaurantName || "your business"}
              </CardTitle>
              <CardDescription className="text-orange-600 dark:text-orange-400">
                Your complete restaurant management solution
              </CardDescription>
            </CardHeader>
            <CardContent className="pl-2 relative z-10">
              <div className="space-y-4 p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-r from-orange-100 via-amber-100 to-yellow-100 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-full">
                    <ShoppingCart className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                      Point of Sale System
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Process orders and manage transactions
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-r from-orange-100 via-amber-100 to-yellow-100 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-full">
                    <ChefHat className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                      Kitchen Management
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Real-time order tracking and preparation
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-r from-orange-100 via-amber-100 to-yellow-100 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-full">
                    <BarChart3 className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                      Analytics & Reports
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Comprehensive business insights
                    </p>
                  </div>
                </div>
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
                  Frequently used features
                </CardDescription>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="space-y-2">
                  <Link href="/pos">
                    <Button
                      variant="ghost"
                      className="w-full justify-start rounded-2xl hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300"
                    >
                      <ShoppingCart className="mr-2 h-4 w-4" />
                      New Sale
                    </Button>
                  </Link>
                  <Link href="/kitchen">
                    <Button
                      variant="ghost"
                      className="w-full justify-start rounded-2xl hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300"
                    >
                      <ChefHat className="mr-2 h-4 w-4" />
                      Kitchen Orders
                    </Button>
                  </Link>
                  <Link href="/menu">
                    <Button
                      variant="ghost"
                      className="w-full justify-start rounded-2xl hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300"
                    >
                      <Utensils className="mr-2 h-4 w-4" />
                      Edit Menu
                    </Button>
                  </Link>
                  <Link href="/reports">
                    <Button
                      variant="ghost"
                      className="w-full justify-start rounded-2xl hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300"
                    >
                      <BarChart3 className="mr-2 h-4 w-4" />
                      View Reports
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}

  </div>}
  </main>
    </div>
  );
}

export default function Dashboard() {
  return <DashboardContent />;
}
