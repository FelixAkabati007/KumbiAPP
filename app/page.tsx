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
import { rolePermissions, UserRole, AppSection } from "@/lib/roles";
import { UserNav } from "@/components/user-nav";

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

  return (
    <div
      ref={mainRef}
      className="flex min-h-screen w-full flex-col bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950"
    >
      <header className="sticky top-0 z-40 w-full border-b bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-orange-200 dark:border-orange-700">
        <div className="container flex h-16 items-center space-x-4 sm:justify-between sm:space-x-0 px-4 md:px-6">
          <div className="flex gap-6 md:gap-10">
            <div className="flex items-center space-x-2">
              <LogoDisplay size="sm" />
              <Utensils className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              <span className="inline-block font-bold text-xl text-gray-800 dark:text-gray-200">
                {/* Suppress hydration warnings for text that can differ between SSR default and client-saved settings */}
                {/* Mobile view: KHRMS (max-width: 768px) */}
                <span className="md:hidden">KHRMS</span>
                {/* Desktop view: Full Name */}
                <span className="hidden md:inline" suppressHydrationWarning>
                  {settings.account.restaurantName}
                </span>
              </span>
            </div>
          </div>
          <div className="flex flex-1 items-center justify-end gap-3">
            <div className="flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-full border border-orange-200 dark:border-orange-700">
              <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
                Welcome, {user.name}
              </span>
            </div>
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

      <main className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight text-gray-800 dark:text-gray-200">
            Dashboard
          </h2>
          <div className="flex items-center space-x-2">
            <div className="flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-orange-100 via-amber-100 to-yellow-100 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-full border border-orange-200 dark:border-orange-700">
              <Sparkles className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
                {user && user.role === "admin"
                  ? "Full Access"
                  : user && user.role === "manager"
                    ? "Manager Access"
                    : "Cashier Access"}
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {access.pos && (
            <Card className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl hover:scale-105 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="text-sm font-medium text-gray-800 dark:text-gray-200">
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
            <Card className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl hover:scale-105 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  Kitchen Display
                </CardTitle>
                <ChefHat className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                  Orders
                </div>
                <p className="text-xs text-muted-foreground">
                  Manage kitchen operations
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
            <Card className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl hover:scale-105 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  Order Board
                </CardTitle>
                <Grid3X3 className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                  Live Grid
                </div>
                <p className="text-xs text-muted-foreground">
                  Real-time order tracking
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
            <Card className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl hover:scale-105 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="text-sm font-medium text-gray-800 dark:text-gray-200">
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
            <Card className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl hover:scale-105 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="text-sm font-medium text-gray-800 dark:text-gray-200">
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
          {access.reports && (
            <Card className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl hover:scale-105 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="text-sm font-medium text-gray-800 dark:text-gray-200">
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
            <Card className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl hover:scale-105 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="text-sm font-medium text-gray-800 dark:text-gray-200">
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
            <Card className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl hover:scale-105 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="text-sm font-medium text-gray-800 dark:text-gray-200">
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
            <Card className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl hover:scale-105 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="text-sm font-medium text-gray-800 dark:text-gray-200">
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
            <Card className="hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl hover:scale-105 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="text-sm font-medium text-gray-800 dark:text-gray-200">
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
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <Card className="col-span-4 hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
            <CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
              <CardTitle className="text-gray-800 dark:text-gray-200">
                Welcome to Kumbisaly Heritage Restaurant
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
            <Card className="col-span-3 hover:shadow-xl transition-all duration-300 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl relative overflow-hidden">
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
        </div>
      </main>
    </div>
  );
}

export default function Dashboard() {
  return <DashboardContent />;
}
