"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Bell,
  Moon,
  Sun,
  User,
  Utensils,
  Monitor,
  Volume2,
  VolumeX,
  Database,
  Shield,
  Sparkles,
  QrCode,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTheme } from "next-themes";
import {
  getSettings,
  fetchSettings,
  saveSettings,
  type AppSettings,
  type PrinterConfig,
} from "@/lib/settings";
import { LogoDisplay } from "@/components/logo-display";
import FaviconUploader from "@/components/favicon-uploader";
import Image from "next/image";
import { useAuth } from "@/components/auth-provider";
import { AccountDashboard } from "@/components/user-account/account-dashboard";
import { testCashDrawer, openCashDrawer } from "@/lib/cash-drawer";
import {
  testBarcodeScanner,
  configureBarcodeScanner,
} from "@/lib/barcode-scanner";
import { PrinterSettingsForm } from "@/components/settings/printer-settings-form";

function SettingsPageContent() {
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get("tab");
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [settings, setSettingsState] = useState<AppSettings>({
    theme: "system",
    notifications: {
      orderAlerts: true,
      lowStockAlerts: true,
      paymentAlerts: true,
      soundEnabled: true,
      emailNotifications: false,
    },
    account: {
      restaurantName: "Kumbisaly Heritage Restaurant",
      ownerName: "",
      email: "",
      phone: "",
      address: "Offinso - Abofour, Ashanti, Ghana.",
      logo: "",
    },
    system: {
      autoBackup: true,
      receiptPrinter: "Thermal Printer",
      taxRate: 12.5,
      currency: "GHS",
      language: "en",
      cashDrawer: {
        enabled: false,
        port: "COM1",
        baudRate: 9600,
        autoOpen: true,
        requireConfirmation: false,
        soundEnabled: true,
      },
      barcodeScanner: {
        enabled: false,
        port: "COM2",
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
        autoFocus: true,
        soundEnabled: true,
        vibrationEnabled: false,
        suffix: "\r\n",
        prefix: "",
        timeout: 1000,
      },
      thermalPrinter: {
        enabled: false,
        interfaceType: "tcp",
        port: "COM3",
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
        paperWidth: 58,
        printDensity: 8,
        printSpeed: 10,
        autoCut: true,
        soundEnabled: true,
        includeLogo: true,
        includeBarcode: true,
        includeFooter: true,
        fontSize: "12",
        alignment: "center",
        characterSet: "1252",
      },
      refunds: {
        enabled: true,
        maxManagerRefund: 200,
        requireApproval: true,
        approvalThreshold: 500,
        allowedPaymentMethods: ["cash", "card", "mobile"],
        autoApproveSmallAmounts: true,
        smallAmountThreshold: 50,
        timeLimit: 24,
        partialRefunds: true,
        restockingFee: 0,
      },
    },
    security: {
      requireLogin: false,
      sessionTimeout: 30,
      twoFactorAuth: false,
    },
  });
  const [mounted, setMounted] = useState(false);
  const isAdmin = user?.role === "admin";
  const [activeTab, setActiveTab] = useState<string>(
    tabParam === "account" ? "account" : "appearance"
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  // Load settings on component mount
  useEffect(() => {
    fetchSettings().then(setSettingsState);
  }, []);

  // Handle input changes
  const handleInputChange = (
    section: keyof AppSettings,
    field: string,
    value: string | number | boolean | Record<string, unknown> | PrinterConfig
  ) => {
    setSettingsState((prev) => {
      if (field === "") {
        // For top-level fields like theme
        return {
          ...prev,
          [section]: value,
        };
      }
      const sectionValue =
        typeof prev[section] === "object" && prev[section] !== null
          ? prev[section]
          : {};
      return {
        ...prev,
        [section]: {
          ...sectionValue,
          [field]: value,
        },
      };
    });
  };

  // Handle theme change
  const handleThemeChange = (newTheme: string) => {
    try {
      setTheme(newTheme);
    } catch {}
    if (typeof window !== "undefined") {
      if (newTheme === "dark") {
        document.documentElement.classList.add("dark");
        document.body.classList.add("dark");
      } else if (newTheme === "light") {
        document.documentElement.classList.remove("dark");
        document.body.classList.remove("dark");
      } else {
        const prefersDark = window.matchMedia(
          "(prefers-color-scheme: dark)"
        ).matches;
        document.documentElement.classList.toggle("dark", prefersDark);
        document.body.classList.toggle("dark", prefersDark);
      }
    }
    handleInputChange("theme", "", newTheme);
    toast({
      title: "Theme Updated",
      description:
        newTheme === "system"
          ? "Following system appearance"
          : `Switched to ${newTheme} mode`,
    });
  };

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Check file type
      if (!file.type.startsWith("image/")) {
        toast({
          title: "Invalid File Type",
          description: "Please select an image file (PNG, JPG, GIF, etc.)",
          variant: "destructive",
        });
        return;
      }

      // Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "Please select an image smaller than 5MB",
          variant: "destructive",
        });
        return;
      }

      // Read file as base64
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        handleInputChange("account", "logo", base64 || "");
        toast({
          title: "Logo Uploaded",
          description: "Your logo has been uploaded successfully",
        });
      };
      reader.readAsDataURL(file);
    }
  };

  // Remove logo function (unused) removed to satisfy lint rules

  // Save all settings
  const handleSaveSettings = async () => {
    await saveSettings(settings);

    // Dispatch custom event to update logo across all components
    window.dispatchEvent(new Event("settingsUpdated"));

    toast({
      title: "Settings Saved",
      description: "Your preferences have been saved successfully",
    });
  };

  // Reset to defaults
  const handleResetSettings = () => {
    if (
      confirm("Are you sure you want to reset all settings to default values?")
    ) {
      const defaultSettings = getSettings(true);
      setSettingsState(defaultSettings);
      saveSettings(defaultSettings);

      // Dispatch custom event to update logo across all components
      window.dispatchEvent(new Event("settingsUpdated"));

      toast({
        title: "Settings Reset",
        description: "All settings have been reset to default values",
      });
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-2 sm:gap-4 border-b bg-white/80 dark:bg-gray-900/80 backdrop-blur-md px-2 sm:px-4 md:px-6 border-orange-200 dark:border-orange-700">
        {/* Company Logo */}
        <div className="flex items-center gap-2 sm:gap-3">
          <LogoDisplay size="md" />
          <Link
            href="/"
            className="flex items-center gap-1 sm:gap-2 hover:opacity-80 transition-opacity"
          >
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 text-orange-600 dark:text-orange-400" />
            <Utensils className="h-4 w-4 sm:h-6 sm:w-6 flex-shrink-0 text-orange-600 dark:text-orange-400" />
            <h1 className="text-sm sm:text-lg font-semibold truncate max-w-[120px] sm:max-w-none text-gray-800 dark:text-gray-200">
              Settings
            </h1>
          </Link>
        </div>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Button
            variant="outline"
            onClick={handleResetSettings}
            className="hidden sm:flex bg-white/50 dark:bg-gray-800/50 border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300"
          >
            Reset to Defaults
          </Button>
          <Button
            onClick={handleSaveSettings}
            size="sm"
            className="bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg relative overflow-hidden"
            disabled={!isAdmin}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-orange-400/20 via-amber-400/20 to-yellow-400/20 animate-pulse"></div>
            <Sparkles className="mr-0 sm:mr-2 h-4 w-4 relative z-10" />
            <span className="hidden sm:inline relative z-10">
              Save Settings
            </span>
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col p-2 sm:p-4 md:p-6">
        <div className="mb-4 sm:mb-6">
          <h2 className="font-semibold text-xl sm:text-2xl mb-2 text-gray-800 dark:text-gray-200">
            Application Settings
          </h2>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Customize your POS system preferences and configuration
          </p>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-4"
        >
          <div className="overflow-x-auto">
            <TabsList className="grid w-full grid-cols-5 min-w-[500px] sm:min-w-0 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-full p-1 shadow-lg">
              <TabsTrigger
                value="appearance"
                className="text-xs sm:text-sm rounded-full data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:via-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-white data-[state=active]:shadow-lg"
              >
                Appearance
              </TabsTrigger>
              <TabsTrigger
                value="notifications"
                className="text-xs sm:text-sm rounded-full data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:via-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-white data-[state=active]:shadow-lg"
              >
                Notifications
              </TabsTrigger>
              <TabsTrigger
                value="account"
                className="text-xs sm:text-sm rounded-full data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:via-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-white data-[state=active]:shadow-lg"
              >
                Account
              </TabsTrigger>
              <TabsTrigger
                value="system"
                className="text-xs sm:text-sm rounded-full data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:via-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-white data-[state=active]:shadow-lg"
              >
                System
              </TabsTrigger>
              <TabsTrigger
                value="security"
                className="text-xs sm:text-sm rounded-full data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:via-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-white data-[state=active]:shadow-lg"
              >
                Security
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Appearance Settings */}
          <TabsContent value="appearance" className="space-y-4">
            {mounted && (
              <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
                <CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl text-gray-800 dark:text-gray-200">
                    <div className="p-2 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-full shadow-lg">
                      <Sun className="h-5 w-5 text-white" />
                    </div>
                    Theme & Display
                  </CardTitle>
                  <CardDescription className="text-sm text-gray-600 dark:text-gray-400">
                    Customize the appearance and visual preferences of your
                    application
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 p-6 relative z-10">
                  <div className="space-y-2">
                    <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                      Theme Selection
                    </Label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <Card
                        className={`cursor-pointer transition-all duration-300 rounded-2xl border-2 relative overflow-hidden transform hover:scale-[1.02] active:scale-95 active:shadow-md ${
                          theme === "light"
                            ? "border-orange-500 bg-gradient-to-br from-orange-50 to-amber-100 dark:from-orange-900 dark:to-amber-800 shadow-lg scale-105"
                            : "border-orange-200 dark:border-orange-700 hover:border-orange-400 dark:hover:border-orange-500 bg-white/50 dark:bg-gray-800/50"
                        }`}
                        onClick={() => handleThemeChange("light")}
                      >
                        {theme === "light" && (
                          <div className="absolute inset-0 bg-gradient-to-br from-orange-200/30 via-amber-200/30 to-yellow-200/30 animate-pulse pointer-events-none"></div>
                        )}
                        <CardContent
                          className="flex flex-col items-center p-4 relative z-10"
                          role="button"
                          tabIndex={0}
                          aria-label="Switch to light theme"
                          onClick={() => handleThemeChange("light")}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleThemeChange("light");
                            }
                          }}
                        >
                          <div className="p-3 bg-gradient-to-br from-yellow-400 via-amber-500 to-orange-500 rounded-full mb-2 shadow-lg">
                            <Sun className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
                          </div>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Light
                          </span>
                        </CardContent>
                      </Card>
                      <Card
                        className={`cursor-pointer transition-all duration-300 rounded-2xl border-2 relative overflow-hidden transform hover:scale-[1.02] active:scale-95 active:shadow-md ${
                          theme === "dark"
                            ? "border-orange-500 bg-gradient-to-br from-orange-50 to-amber-100 dark:from-orange-900 dark:to-amber-800 shadow-lg scale-105"
                            : "border-orange-200 dark:border-orange-700 hover:border-orange-400 dark:hover:border-orange-500 bg-white/50 dark:bg-gray-800/50"
                        }`}
                        onClick={() => handleThemeChange("dark")}
                      >
                        {theme === "dark" && (
                          <div className="absolute inset-0 bg-gradient-to-br from-orange-200/30 via-amber-200/30 to-yellow-200/30 animate-pulse pointer-events-none"></div>
                        )}
                        <CardContent
                          className="flex flex-col items-center p-4 relative z-10"
                          role="button"
                          tabIndex={0}
                          aria-label="Switch to dark theme"
                          onClick={() => handleThemeChange("dark")}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleThemeChange("dark");
                            }
                          }}
                        >
                          <div className="p-3 bg-gradient-to-br from-indigo-500 via-purple-500 to-blue-600 rounded-full mb-2 shadow-lg">
                            <Moon className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
                          </div>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Dark
                          </span>
                        </CardContent>
                      </Card>
                      <Card
                        className={`cursor-pointer transition-all duration-300 rounded-2xl border-2 relative overflow-hidden transform hover:scale-[1.02] active:scale-95 active:shadow-md ${
                          theme === "system"
                            ? "border-orange-500 bg-gradient-to-br from-orange-50 to-amber-100 dark:from-orange-900 dark:to-amber-800 shadow-lg scale-105"
                            : "border-orange-200 dark:border-orange-700 hover:border-orange-400 dark:hover:border-orange-500 bg-white/50 dark:bg-gray-800/50"
                        }`}
                        onClick={() => handleThemeChange("system")}
                      >
                        {theme === "system" && (
                          <div className="absolute inset-0 bg-gradient-to-br from-orange-200/30 via-amber-200/30 to-yellow-200/30 animate-pulse pointer-events-none"></div>
                        )}
                        <CardContent
                          className="flex flex-col items-center p-4 relative z-10"
                          role="button"
                          tabIndex={0}
                          aria-label="Switch to system theme"
                          onClick={() => handleThemeChange("system")}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleThemeChange("system");
                            }
                          }}
                        >
                          <div className="p-3 bg-gradient-to-br from-gray-500 via-slate-500 to-gray-600 rounded-full mb-2 shadow-lg">
                            <Monitor className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
                          </div>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            System
                          </span>
                        </CardContent>
                      </Card>
                    </div>
                  </div>

                  <Separator className="bg-orange-200 dark:bg-orange-700" />
                  <div className="space-y-4">
                    <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                      Display Preferences
                    </Label>
                    <div className="grid gap-4">
                      <div className="flex items-center justify-between gap-4 p-4 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-2xl border border-orange-200 dark:border-orange-700 shadow-sm">
                        <div className="min-w-0 flex-1">
                          <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                            Compact Mode
                          </Label>
                          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                            Use smaller spacing and components
                          </p>
                        </div>
                        <Switch
                          checked={settings.system?.compactMode || false}
                          onCheckedChange={(checked) =>
                            handleInputChange("system", "compactMode", checked)
                          }
                          className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-orange-500 data-[state=checked]:via-amber-500 data-[state=checked]:to-yellow-500"
                          disabled={!isAdmin}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-4 p-4 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-2xl border border-orange-200 dark:border-orange-700 shadow-sm">
                        <div className="min-w-0 flex-1">
                          <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                            Show Animations
                          </Label>
                          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                            Enable smooth transitions and animations
                          </p>
                        </div>
                        <Switch
                          checked={settings.system?.animations !== false}
                          onCheckedChange={(checked) =>
                            handleInputChange("system", "animations", checked)
                          }
                          className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-orange-500 data-[state=checked]:via-amber-500 data-[state=checked]:to-yellow-500"
                          disabled={!isAdmin}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Account Settings */}
          <TabsContent value="account" className="space-y-4">
            {/* Modern Account Dashboard */}
            <AccountDashboard />
            <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="flex items-center gap-2 text-lg sm:text-xl text-gray-800 dark:text-gray-200">
                  <div className="p-2 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-full shadow-lg">
                    <User className="h-5 w-5 text-white" />
                  </div>
                  Account Information
                </CardTitle>
                <CardDescription className="text-sm text-gray-600 dark:text-gray-400">
                  Manage your account details and preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 p-6 relative z-10">
                <div className="grid gap-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label
                        htmlFor="restaurantName"
                        className="text-sm sm:text-base text-gray-700 dark:text-gray-300"
                      >
                        Restaurant Name
                      </Label>
                      <Input
                        id="restaurantName"
                        type="text"
                        value={settings.account.restaurantName}
                        onChange={(e) =>
                          handleInputChange(
                            "account",
                            "restaurantName",
                            e.target.value
                          )
                        }
                        className="w-full rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                        disabled={!isAdmin}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label
                        htmlFor="ownerName"
                        className="text-sm sm:text-base text-gray-700 dark:text-gray-300"
                      >
                        Owner Name
                      </Label>
                      <Input
                        id="ownerName"
                        type="text"
                        value={settings.account.ownerName}
                        onChange={(e) =>
                          handleInputChange(
                            "account",
                            "ownerName",
                            e.target.value
                          )
                        }
                        className="w-full rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                        disabled={!isAdmin}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label
                      htmlFor="email"
                      className="text-sm sm:text-base text-gray-700 dark:text-gray-300"
                    >
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={settings.account.email}
                      onChange={(e) =>
                        handleInputChange("account", "email", e.target.value)
                      }
                      className="w-full rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label
                      htmlFor="phone"
                      className="text-sm sm:text-base text-gray-700 dark:text-gray-300"
                    >
                      Phone
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={settings.account.phone}
                      onChange={(e) =>
                        handleInputChange("account", "phone", e.target.value)
                      }
                      className="w-full rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label
                      htmlFor="address"
                      className="text-sm sm:text-base text-gray-700 dark:text-gray-300"
                    >
                      Address
                    </Label>
                    <Input
                      id="address"
                      type="text"
                      value={settings.account.address}
                      onChange={(e) =>
                        handleInputChange("account", "address", e.target.value)
                      }
                      className="w-full rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label
                      htmlFor="logo"
                      className="text-sm sm:text-base text-gray-700 dark:text-gray-300"
                    >
                      Logo
                    </Label>
                    <div className="flex items-center gap-2">
                      {settings.account.logo && (
                        <Image
                          src={settings.account.logo}
                          alt="Logo"
                          width={50}
                          height={50}
                          className="rounded-lg"
                        />
                      )}
                      <Button
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-white/50 dark:bg-gray-800/50 border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300"
                        disabled={!isAdmin}
                      >
                        Upload Logo
                      </Button>
                      {/* Show Save button if logo is changed and not yet saved */}
                      {isAdmin && settings.account.logo && (
                        <Button
                          variant="default"
                          onClick={handleSaveSettings}
                          className="ml-2 bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg"
                        >
                          Save Logo
                        </Button>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                      disabled={!isAdmin}
                      aria-label="Upload restaurant logo"
                      title="Upload restaurant logo"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Favicon Settings */}
            <FaviconUploader
              onFaviconUpdate={() => {
                toast({
                  title: "Favicon Updated",
                  description:
                    "Your website favicon has been successfully updated and is now live.",
                  variant: "default",
                });
              }}
              className="mt-6"
            />
          </TabsContent>

          {/* Notifications Settings */}
          <TabsContent value="notifications" className="space-y-4">
            <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="flex items-center gap-2 text-lg sm:text-xl text-gray-800 dark:text-gray-200">
                  <div className="p-2 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-full shadow-lg">
                    <Bell className="h-5 w-5 text-white" />
                  </div>
                  Notification Preferences
                </CardTitle>
                <CardDescription className="text-sm text-gray-600 dark:text-gray-400">
                  Configure how and when you receive notifications
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 p-6 relative z-10">
                <div className="space-y-4">
                  <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                    Alert Types
                  </Label>
                  <div className="grid gap-4">
                    <div className="flex items-center justify-between gap-4 p-4 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-2xl border border-orange-200 dark:border-orange-700 shadow-sm">
                      <div className="min-w-0 flex-1">
                        <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                          Order Alerts
                        </Label>
                        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                          Get notified when new orders are placed
                        </p>
                      </div>
                      <Switch
                        checked={settings.notifications.orderAlerts}
                        onCheckedChange={(checked) =>
                          handleInputChange(
                            "notifications",
                            "orderAlerts",
                            checked
                          )
                        }
                        className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-orange-500 data-[state=checked]:via-amber-500 data-[state=checked]:to-yellow-500"
                        disabled={!isAdmin}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4 p-4 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-2xl border border-orange-200 dark:border-orange-700 shadow-sm">
                      <div className="min-w-0 flex-1">
                        <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                          Low Stock Alerts
                        </Label>
                        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                          Get notified when inventory is running low
                        </p>
                      </div>
                      <Switch
                        checked={settings.notifications.lowStockAlerts}
                        onCheckedChange={(checked) =>
                          handleInputChange(
                            "notifications",
                            "lowStockAlerts",
                            checked
                          )
                        }
                        className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-orange-500 data-[state=checked]:via-amber-500 data-[state=checked]:to-yellow-500"
                        disabled={!isAdmin}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4 p-4 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-2xl border border-orange-200 dark:border-orange-700 shadow-sm">
                      <div className="min-w-0 flex-1">
                        <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                          Payment Alerts
                        </Label>
                        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                          Get notified about payment confirmations
                        </p>
                      </div>
                      <Switch
                        checked={settings.notifications.paymentAlerts}
                        onCheckedChange={(checked) =>
                          handleInputChange(
                            "notifications",
                            "paymentAlerts",
                            checked
                          )
                        }
                        className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-orange-500 data-[state=checked]:via-amber-500 data-[state=checked]:to-yellow-500"
                        disabled={!isAdmin}
                      />
                    </div>
                  </div>
                </div>

                <Separator className="bg-orange-200 dark:bg-orange-700" />

                <div className="space-y-4">
                  <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                    Sound & Email
                  </Label>
                  <div className="grid gap-4">
                    <div className="flex items-center justify-between gap-4 p-4 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-2xl border border-orange-200 dark:border-orange-700 shadow-sm">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="p-2 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-full shadow-lg">
                          {settings.notifications.soundEnabled ? (
                            <Volume2 className="h-4 w-4 text-white" />
                          ) : (
                            <VolumeX className="h-4 w-4 text-white" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                            Sound Notifications
                          </Label>
                          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                            Play sounds for alerts
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={settings.notifications.soundEnabled}
                        onCheckedChange={(checked) =>
                          handleInputChange(
                            "notifications",
                            "soundEnabled",
                            checked
                          )
                        }
                        className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-orange-500 data-[state=checked]:via-amber-500 data-[state=checked]:to-yellow-500"
                        disabled={!isAdmin}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4 p-4 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-2xl border border-orange-200 dark:border-orange-700 shadow-sm">
                      <div className="min-w-0 flex-1">
                        <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                          Email Notifications
                        </Label>
                        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                          Receive notifications via email
                        </p>
                      </div>
                      <Switch
                        checked={settings.notifications.emailNotifications}
                        onCheckedChange={(checked) =>
                          handleInputChange(
                            "notifications",
                            "emailNotifications",
                            checked
                          )
                        }
                        className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-orange-500 data-[state=checked]:via-amber-500 data-[state=checked]:to-yellow-500"
                        disabled={!isAdmin}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* System Settings */}
          <TabsContent value="system" className="space-y-4">
            <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="flex items-center gap-2 text-lg sm:text-xl text-gray-800 dark:text-gray-200">
                  <div className="p-2 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-full shadow-lg">
                    <Database className="h-5 w-5 text-white" />
                  </div>
                  System Configuration
                </CardTitle>
                <CardDescription className="text-sm text-gray-600 dark:text-gray-400">
                  Configure system-wide settings and preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 p-6 relative z-10">
                <div className="grid gap-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label
                        htmlFor="currency"
                        className="text-sm sm:text-base text-gray-700 dark:text-gray-300"
                      >
                        Currency
                      </Label>
                      <Select
                        value={settings.system.currency}
                        onValueChange={(value) =>
                          handleInputChange("system", "currency", value)
                        }
                      >
                        <SelectTrigger className="w-full rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50">
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl border-orange-200 dark:border-orange-700">
                          <SelectItem value="GHS">Ghana Cedi (₵)</SelectItem>
                          <SelectItem value="USD">US Dollar ($)</SelectItem>
                          <SelectItem value="EUR">Euro (€)</SelectItem>
                          <SelectItem value="GBP">British Pound (£)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label
                        htmlFor="language"
                        className="text-sm sm:text-base text-gray-700 dark:text-gray-300"
                      >
                        Language
                      </Label>
                      <Select
                        value={settings.system.language}
                        onValueChange={(value) =>
                          handleInputChange("system", "language", value)
                        }
                      >
                        <SelectTrigger className="w-full rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50">
                          <SelectValue placeholder="Select language" />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl border-orange-200 dark:border-orange-700">
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="tw">Twi</SelectItem>
                          <SelectItem value="ga">Ga</SelectItem>
                          <SelectItem value="fr">French</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label
                      htmlFor="taxRate"
                      className="text-sm sm:text-base text-gray-700 dark:text-gray-300"
                    >
                      Tax Rate (%)
                    </Label>
                    <Input
                      id="taxRate"
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={settings.system.taxRate}
                      onChange={(e) =>
                        handleInputChange(
                          "system",
                          "taxRate",
                          Number.parseFloat(e.target.value)
                        )
                      }
                      className="w-full rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                      disabled={!isAdmin}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Cash Drawer Configuration */}
            <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="flex items-center gap-2 text-lg sm:text-xl text-gray-800 dark:text-gray-200">
                  <div className="p-2 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-full shadow-lg">
                    <Utensils className="h-5 w-5 text-white" />
                  </div>
                  Cash Drawer Configuration
                </CardTitle>
                <CardDescription className="text-sm text-gray-600 dark:text-gray-400">
                  Configure cash drawer hardware settings and behavior
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 p-6 relative z-10">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4 p-4 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-2xl border border-orange-200 dark:border-orange-700 shadow-sm">
                    <div className="min-w-0 flex-1">
                      <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                        Enable Cash Drawer
                      </Label>
                      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                        Enable cash drawer functionality
                      </p>
                    </div>
                    <Switch
                      checked={settings.system.cashDrawer?.enabled || false}
                      onCheckedChange={(checked) =>
                        handleInputChange("system", "cashDrawer", {
                          ...settings.system.cashDrawer,
                          enabled: checked,
                        })
                      }
                      className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-orange-500 data-[state=checked]:via-amber-500 data-[state=checked]:to-yellow-500"
                      disabled={!isAdmin}
                    />
                  </div>
                </div>

                {settings.system.cashDrawer?.enabled && (
                  <>
                    <Separator className="bg-orange-200 dark:bg-orange-700" />

                    <div className="grid gap-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label
                            htmlFor="cashDrawerPort"
                            className="text-sm sm:text-base text-gray-700 dark:text-gray-300"
                          >
                            Port
                          </Label>
                          <Input
                            id="cashDrawerPort"
                            type="text"
                            value={settings.system.cashDrawer?.port || "COM1"}
                            onChange={(e) =>
                              handleInputChange("system", "cashDrawer", {
                                ...settings.system.cashDrawer,
                                port: e.target.value,
                              })
                            }
                            className="w-full rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                            disabled={!isAdmin}
                            placeholder="COM1"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label
                            htmlFor="cashDrawerBaudRate"
                            className="text-sm sm:text-base text-gray-700 dark:text-gray-300"
                          >
                            Baud Rate
                          </Label>
                          <Select
                            value={String(
                              settings.system.cashDrawer?.baudRate || 9600
                            )}
                            onValueChange={(value) =>
                              handleInputChange("system", "cashDrawer", {
                                ...settings.system.cashDrawer,
                                baudRate: Number.parseInt(value),
                              })
                            }
                          >
                            <SelectTrigger className="w-full rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50">
                              <SelectValue placeholder="Select baud rate" />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl border-orange-200 dark:border-orange-700">
                              <SelectItem value="9600">9600</SelectItem>
                              <SelectItem value="19200">19200</SelectItem>
                              <SelectItem value="38400">38400</SelectItem>
                              <SelectItem value="57600">57600</SelectItem>
                              <SelectItem value="115200">115200</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                          Behavior Settings
                        </Label>
                        <div className="grid gap-4">
                          <div className="flex items-center justify-between gap-4 p-4 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-2xl border border-orange-200 dark:border-orange-700 shadow-sm">
                            <div className="min-w-0 flex-1">
                              <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                                Auto-Open on Cash Payment
                              </Label>
                              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                                Automatically open drawer when cash payment is
                                processed
                              </p>
                            </div>
                            <Switch
                              checked={
                                settings.system.cashDrawer?.autoOpen || false
                              }
                              onCheckedChange={(checked) =>
                                handleInputChange("system", "cashDrawer", {
                                  ...settings.system.cashDrawer,
                                  autoOpen: checked,
                                })
                              }
                              className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-orange-500 data-[state=checked]:via-amber-500 data-[state=checked]:to-yellow-500"
                              disabled={!isAdmin}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-4 p-4 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-2xl border border-orange-200 dark:border-orange-700 shadow-sm">
                            <div className="min-w-0 flex-1">
                              <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                                Require Confirmation
                              </Label>
                              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                                Ask for confirmation before opening drawer
                              </p>
                            </div>
                            <Switch
                              checked={
                                settings.system.cashDrawer
                                  ?.requireConfirmation || false
                              }
                              onCheckedChange={(checked) =>
                                handleInputChange("system", "cashDrawer", {
                                  ...settings.system.cashDrawer,
                                  requireConfirmation: checked,
                                })
                              }
                              className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-orange-500 data-[state=checked]:via-amber-500 data-[state=checked]:to-yellow-500"
                              disabled={!isAdmin}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-4 p-4 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-2xl border border-orange-200 dark:border-orange-700 shadow-sm">
                            <div className="min-w-0 flex-1">
                              <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                                Sound Notification
                              </Label>
                              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                                Play sound when drawer opens
                              </p>
                            </div>
                            <Switch
                              checked={
                                settings.system.cashDrawer?.soundEnabled ||
                                false
                              }
                              onCheckedChange={(checked) =>
                                handleInputChange("system", "cashDrawer", {
                                  ...settings.system.cashDrawer,
                                  soundEnabled: checked,
                                })
                              }
                              className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-orange-500 data-[state=checked]:via-amber-500 data-[state=checked]:to-yellow-500"
                              disabled={!isAdmin}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={async () => {
                            try {
                              const success = await testCashDrawer(
                                settings.system.cashDrawer
                              );
                              if (success) {
                                toast({
                                  title: "Cash Drawer Test Successful",
                                  description:
                                    "Cash drawer is working correctly",
                                });
                              } else {
                                toast({
                                  title: "Cash Drawer Test Failed",
                                  description:
                                    "Please check your configuration",
                                  variant: "destructive",
                                });
                              }
                            } catch {
                              toast({
                                title: "Test Error",
                                description: "Failed to test cash drawer",
                                variant: "destructive",
                              });
                            }
                          }}
                          className="bg-white/50 dark:bg-gray-800/50 border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300 rounded-2xl"
                          disabled={!isAdmin}
                        >
                          Test Connection
                        </Button>
                        <Button
                          variant="outline"
                          onClick={async () => {
                            try {
                              const success = await openCashDrawer(
                                settings.system.cashDrawer
                              );
                              if (success) {
                                toast({
                                  title: "Cash Drawer Opened",
                                  description:
                                    "Cash drawer has been opened successfully",
                                });
                              } else {
                                toast({
                                  title: "Failed to Open",
                                  description: "Could not open cash drawer",
                                  variant: "destructive",
                                });
                              }
                            } catch {
                              toast({
                                title: "Error",
                                description: "Failed to open cash drawer",
                                variant: "destructive",
                              });
                            }
                          }}
                          className="bg-white/50 dark:bg-gray-800/50 border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300 rounded-2xl"
                          disabled={!isAdmin}
                        >
                          Open Drawer
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Thermal Printer Configuration - Primary */}
            <PrinterSettingsForm
              title="Primary Thermal Printer"
              description="Configure the main receipt printer"
              config={
                settings.system.thermalPrinter || {
                  enabled: false,
                  interfaceType: "tcp",
                  port: 9100,
                  baudRate: 9600,
                  dataBits: 8,
                  stopBits: 1,
                  parity: "none",
                  paperWidth: 58,
                  printDensity: 8,
                  printSpeed: 10,
                  autoCut: true,
                  soundEnabled: true,
                  includeLogo: true,
                  includeBarcode: true,
                  includeFooter: true,
                  fontSize: "12",
                  alignment: "center",
                  characterSet: "1252",
                  name: "Primary Printer",
                }
              }
              onChange={(newConfig) =>
                handleInputChange("system", "thermalPrinter", newConfig)
              }
              disabled={!isAdmin}
            />

            {/* Thermal Printer Configuration - Secondary (Kitchen) */}
            <PrinterSettingsForm
              title="Secondary / Kitchen Printer"
              description="Configure an additional printer for kitchen orders"
              config={
                settings.system.secondaryPrinter || {
                  enabled: false,
                  interfaceType: "tcp",
                  port: 9100,
                  baudRate: 9600,
                  dataBits: 8,
                  stopBits: 1,
                  parity: "none",
                  paperWidth: 58,
                  printDensity: 8,
                  printSpeed: 10,
                  autoCut: true,
                  soundEnabled: true,
                  includeLogo: false,
                  includeBarcode: false,
                  includeFooter: false,
                  fontSize: "12",
                  alignment: "center",
                  characterSet: "1252",
                  name: "Kitchen Printer",
                }
              }
              onChange={(newConfig) =>
                handleInputChange("system", "secondaryPrinter", newConfig)
              }
              disabled={!isAdmin}
            />

            {/* Barcode Scanner Configuration */}
            <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="flex items-center gap-2 text-lg sm:text-xl text-gray-800 dark:text-gray-200">
                  <div className="p-2 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-full shadow-lg">
                    <QrCode className="h-5 w-5 text-white" />
                  </div>
                  Barcode Scanner Configuration
                </CardTitle>
                <CardDescription className="text-sm text-gray-600 dark:text-gray-400">
                  Configure barcode scanner hardware and behavior
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 p-6 relative z-10">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4 p-4 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-2xl border border-orange-200 dark:border-orange-700 shadow-sm">
                    <div className="min-w-0 flex-1">
                      <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                        Enable Barcode Scanner
                      </Label>
                      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                        Enable barcode scanner hardware integration
                      </p>
                    </div>
                    <Switch
                      checked={settings.system.barcodeScanner?.enabled || false}
                      onCheckedChange={(checked) =>
                        handleInputChange("system", "barcodeScanner", {
                          ...settings.system.barcodeScanner,
                          enabled: checked,
                        })
                      }
                      className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-orange-500 data-[state=checked]:via-amber-500 data-[state=checked]:to-yellow-500"
                      disabled={!isAdmin}
                    />
                  </div>
                </div>

                {settings.system.barcodeScanner?.enabled && (
                  <>
                    <div className="space-y-4">
                      <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                        Hardware Configuration
                      </Label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label
                            htmlFor="barcodePort"
                            className="text-sm sm:text-base text-gray-700 dark:text-gray-300"
                          >
                            Port
                          </Label>
                          <Input
                            id="barcodePort"
                            value={settings.system.barcodeScanner?.port || ""}
                            onChange={(e) =>
                              handleInputChange("system", "barcodeScanner", {
                                ...settings.system.barcodeScanner,
                                port: e.target.value,
                              })
                            }
                            placeholder="COM2"
                            className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                            disabled={!isAdmin}
                          />
                        </div>

                        <div className="grid gap-2">
                          <Label
                            htmlFor="barcodeBaudRate"
                            className="text-sm sm:text-base text-gray-700 dark:text-gray-300"
                          >
                            Baud Rate
                          </Label>
                          <Select
                            value={String(
                              settings.system.barcodeScanner?.baudRate || 9600
                            )}
                            onValueChange={(value) =>
                              handleInputChange("system", "barcodeScanner", {
                                ...settings.system.barcodeScanner,
                                baudRate: Number.parseInt(value),
                              })
                            }
                          >
                            <SelectTrigger className="w-full rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50">
                              <SelectValue placeholder="Select baud rate" />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl border-orange-200 dark:border-orange-700">
                              <SelectItem value="9600">9600</SelectItem>
                              <SelectItem value="19200">19200</SelectItem>
                              <SelectItem value="38400">38400</SelectItem>
                              <SelectItem value="57600">57600</SelectItem>
                              <SelectItem value="115200">115200</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid gap-2">
                          <Label
                            htmlFor="barcodeDataBits"
                            className="text-sm sm:text-base text-gray-700 dark:text-gray-300"
                          >
                            Data Bits
                          </Label>
                          <Select
                            value={String(
                              settings.system.barcodeScanner?.dataBits || 8
                            )}
                            onValueChange={(value) =>
                              handleInputChange("system", "barcodeScanner", {
                                ...settings.system.barcodeScanner,
                                dataBits: Number.parseInt(value),
                              })
                            }
                          >
                            <SelectTrigger className="w-full rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50">
                              <SelectValue placeholder="Select data bits" />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl border-orange-200 dark:border-orange-700">
                              <SelectItem value="7">7</SelectItem>
                              <SelectItem value="8">8</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid gap-2">
                          <Label
                            htmlFor="barcodeStopBits"
                            className="text-sm sm:text-base text-gray-700 dark:text-gray-300"
                          >
                            Stop Bits
                          </Label>
                          <Select
                            value={String(
                              settings.system.barcodeScanner?.stopBits || 1
                            )}
                            onValueChange={(value) =>
                              handleInputChange("system", "barcodeScanner", {
                                ...settings.system.barcodeScanner,
                                stopBits: Number.parseInt(value),
                              })
                            }
                          >
                            <SelectTrigger className="w-full rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50">
                              <SelectValue placeholder="Select stop bits" />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl border-orange-200 dark:border-orange-700">
                              <SelectItem value="1">1</SelectItem>
                              <SelectItem value="2">2</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid gap-2">
                          <Label
                            htmlFor="barcodeParity"
                            className="text-sm sm:text-base text-gray-700 dark:text-gray-300"
                          >
                            Parity
                          </Label>
                          <Select
                            value={
                              settings.system.barcodeScanner?.parity || "none"
                            }
                            onValueChange={(value) =>
                              handleInputChange("system", "barcodeScanner", {
                                ...settings.system.barcodeScanner,
                                parity: value,
                              })
                            }
                          >
                            <SelectTrigger className="w-full rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50">
                              <SelectValue placeholder="Select parity" />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl border-orange-200 dark:border-orange-700">
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="even">Even</SelectItem>
                              <SelectItem value="odd">Odd</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid gap-2">
                          <Label
                            htmlFor="barcodeTimeout"
                            className="text-sm sm:text-base text-gray-700 dark:text-gray-300"
                          >
                            Timeout (ms)
                          </Label>
                          <Input
                            id="barcodeTimeout"
                            type="number"
                            value={
                              settings.system.barcodeScanner?.timeout || 1000
                            }
                            onChange={(e) =>
                              handleInputChange("system", "barcodeScanner", {
                                ...settings.system.barcodeScanner,
                                timeout: Number.parseInt(e.target.value),
                              })
                            }
                            placeholder="1000"
                            className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                            disabled={!isAdmin}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                        Behavior Settings
                      </Label>
                      <div className="grid gap-4">
                        <div className="flex items-center justify-between gap-4 p-4 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-2xl border border-orange-200 dark:border-orange-700 shadow-sm">
                          <div className="min-w-0 flex-1">
                            <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                              Auto Focus
                            </Label>
                            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                              Automatically focus scanner when activated
                            </p>
                          </div>
                          <Switch
                            checked={
                              settings.system.barcodeScanner?.autoFocus || false
                            }
                            onCheckedChange={(checked) =>
                              handleInputChange("system", "barcodeScanner", {
                                ...settings.system.barcodeScanner,
                                autoFocus: checked,
                              })
                            }
                            className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-orange-500 data-[state=checked]:via-amber-500 data-[state=checked]:to-yellow-500"
                            disabled={!isAdmin}
                          />
                        </div>

                        <div className="flex items-center justify-between gap-4 p-4 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-2xl border border-orange-200 dark:border-orange-700 shadow-sm">
                          <div className="min-w-0 flex-1">
                            <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                              Sound Notification
                            </Label>
                            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                              Play sound when barcode is scanned
                            </p>
                          </div>
                          <Switch
                            checked={
                              settings.system.barcodeScanner?.soundEnabled ||
                              false
                            }
                            onCheckedChange={(checked) =>
                              handleInputChange("system", "barcodeScanner", {
                                ...settings.system.barcodeScanner,
                                soundEnabled: checked,
                              })
                            }
                            className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-orange-500 data-[state=checked]:via-amber-500 data-[state=checked]:to-yellow-500"
                            disabled={!isAdmin}
                          />
                        </div>

                        <div className="flex items-center justify-between gap-4 p-4 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-2xl border border-orange-200 dark:border-orange-700 shadow-sm">
                          <div className="min-w-0 flex-1">
                            <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                              Vibration
                            </Label>
                            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                              Vibrate device when barcode is scanned
                            </p>
                          </div>
                          <Switch
                            checked={
                              settings.system.barcodeScanner
                                ?.vibrationEnabled || false
                            }
                            onCheckedChange={(checked) =>
                              handleInputChange("system", "barcodeScanner", {
                                ...settings.system.barcodeScanner,
                                vibrationEnabled: checked,
                              })
                            }
                            className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-orange-500 data-[state=checked]:via-amber-500 data-[state=checked]:to-yellow-500"
                            disabled={!isAdmin}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                        Data Format
                      </Label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label
                            htmlFor="barcodePrefix"
                            className="text-sm sm:text-base text-gray-700 dark:text-gray-300"
                          >
                            Prefix
                          </Label>
                          <Input
                            id="barcodePrefix"
                            value={settings.system.barcodeScanner?.prefix || ""}
                            onChange={(e) =>
                              handleInputChange("system", "barcodeScanner", {
                                ...settings.system.barcodeScanner,
                                prefix: e.target.value,
                              })
                            }
                            placeholder="Prefix (optional)"
                            className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                            disabled={!isAdmin}
                          />
                        </div>

                        <div className="grid gap-2">
                          <Label
                            htmlFor="barcodeSuffix"
                            className="text-sm sm:text-base text-gray-700 dark:text-gray-300"
                          >
                            Suffix
                          </Label>
                          <Input
                            id="barcodeSuffix"
                            value={settings.system.barcodeScanner?.suffix || ""}
                            onChange={(e) =>
                              handleInputChange("system", "barcodeScanner", {
                                ...settings.system.barcodeScanner,
                                suffix: e.target.value,
                              })
                            }
                            placeholder="Suffix (e.g., \r\n)"
                            className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                            disabled={!isAdmin}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={async () => {
                          try {
                            const success = await testBarcodeScanner(
                              settings.system.barcodeScanner
                            );
                            if (success) {
                              toast({
                                title: "Barcode Scanner Test Successful",
                                description:
                                  "Barcode scanner is working correctly",
                              });
                            } else {
                              toast({
                                title: "Barcode Scanner Test Failed",
                                description: "Please check your configuration",
                                variant: "destructive",
                              });
                            }
                          } catch {
                            toast({
                              title: "Test Error",
                              description: "Failed to test barcode scanner",
                              variant: "destructive",
                            });
                          }
                        }}
                        className="bg-white/50 dark:bg-gray-800/50 border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300 rounded-2xl"
                        disabled={!isAdmin}
                      >
                        Test Connection
                      </Button>
                      <Button
                        variant="outline"
                        onClick={async () => {
                          try {
                            const success = await configureBarcodeScanner(
                              settings.system.barcodeScanner
                            );
                            if (success) {
                              toast({
                                title: "Configuration Successful",
                                description:
                                  "Barcode scanner has been configured",
                              });
                            } else {
                              toast({
                                title: "Configuration Failed",
                                description:
                                  "Failed to configure barcode scanner",
                                variant: "destructive",
                              });
                            }
                          } catch {
                            toast({
                              title: "Configuration Error",
                              description:
                                "Failed to configure barcode scanner",
                              variant: "destructive",
                            });
                          }
                        }}
                        className="bg-white/50 dark:bg-gray-800/50 border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300 rounded-2xl"
                        disabled={!isAdmin}
                      >
                        Configure Scanner
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Settings */}
          <TabsContent value="security" className="space-y-4">
            <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
                <CardTitle className="flex items-center gap-2 text-lg sm:text-xl text-gray-800 dark:text-gray-200">
                  <div className="p-2 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-full shadow-lg">
                    <Shield className="h-5 w-5 text-white" />
                  </div>
                  Security & Privacy
                </CardTitle>
                <CardDescription className="text-sm text-gray-600 dark:text-gray-400">
                  Manage security settings and access controls
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 p-6 relative z-10">
                <div className="space-y-4">
                  <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                    Access Control
                  </Label>
                  <div className="grid gap-4">
                    <div className="flex items-center justify-between gap-4 p-4 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-2xl border border-orange-200 dark:border-orange-700 shadow-sm">
                      <div className="min-w-0 flex-1">
                        <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                          Require Login
                        </Label>
                        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                          Require staff to log in before using the system
                        </p>
                      </div>
                      <Switch
                        checked={settings.security.requireLogin}
                        onCheckedChange={(checked) =>
                          handleInputChange("security", "requireLogin", checked)
                        }
                        className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-orange-500 data-[state=checked]:via-amber-500 data-[state=checked]:to-yellow-500"
                        disabled={!isAdmin}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Mobile Reset Button */}
        <div className="sm:hidden mt-4">
          <Button
            variant="outline"
            onClick={handleResetSettings}
            className="w-full bg-white/50 dark:bg-gray-800/50 border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300 rounded-2xl"
          >
            Reset to Defaults
          </Button>
        </div>
      </main>
    </div>
  );
}

import { RoleGuard } from "@/components/role-guard";

export default function SettingsPage() {
  return (
    <RoleGuard section="system">
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-screen">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
          </div>
        }
      >
        <SettingsPageContent />
      </Suspense>
    </RoleGuard>
  );
}
