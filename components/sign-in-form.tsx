"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, EyeOff, Lock, Mail, Utensils } from "lucide-react";
import { LogoDisplay } from "@/components/logo-display";
import { useAuth } from "@/components/auth-provider";
import { useLoading } from "@/components/loading-provider";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

export function SignInForm() {
  const { login, isDatabaseReady } = useAuth();
  const { showLoading, hideLoading, isLoading } = useLoading();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginInput) => {
    setError("");
    showLoading("Signing in...");

    try {
      const success = await login(data.email, data.password);

      if (success) {
        // Use window.location.href to force a full reload and ensure cookies are sent
        // This prevents the "loading forever" issue by bypassing client-side router caching
        window.location.href = "/";
      } else {
        setError("Invalid email or password. Please try again.");
        hideLoading();
      }
    } catch (err) {
      console.error("Sign in error:", err);
      setError("An error occurred during sign in. Please try again.");
      hideLoading();
    } finally {
      hideLoading();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950 p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <LogoDisplay size="lg" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2">
              <Utensils className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                <span className="md:hidden">KHRMS</span>
                <span className="hidden md:inline">
                  Kumbisaly Heritage Restaurant
                </span>
              </h1>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Point of Sale System
            </p>
          </div>
        </div>

        {/* Sign In Card */}
        <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>

          <CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10 text-center">
            <CardTitle className="flex items-center justify-center gap-2 text-xl text-gray-800 dark:text-gray-200">
              <div className="p-2 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-full shadow-lg">
                <Lock className="h-5 w-5 text-white" />
              </div>
              Sign In to POS
            </CardTitle>
            <CardDescription className="text-sm text-gray-600 dark:text-gray-400">
              Enter your credentials to access the sales terminal
              {!isDatabaseReady && (
                <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  Connecting to Neon database...
                </div>
              )}
            </CardDescription>
          </CardHeader>

          <CardContent className="p-6 relative z-10 space-y-6">
            {error && (
              <Alert className="border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 rounded-2xl">
                <AlertDescription className="text-red-700 dark:text-red-300 text-sm">
                  {error}
                </AlertDescription>
              </Alert>
            )}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Email Address
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <Input
                            placeholder="Enter your email address"
                            type="email"
                            className="pl-10 rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                            disabled={isLoading || !isDatabaseReady}
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage className="text-xs text-red-600 dark:text-red-400" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Password
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter your password"
                            className="pl-10 pr-10 rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                            disabled={isLoading || !isDatabaseReady}
                            {...field}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() => setShowPassword(!showPassword)}
                            disabled={isLoading}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4 text-gray-400" />
                            ) : (
                              <Eye className="h-4 w-4 text-gray-400" />
                            )}
                            <span className="sr-only">
                              {showPassword ? "Hide password" : "Show password"}
                            </span>
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage className="text-xs text-red-600 dark:text-red-400" />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-lg transition-all duration-300 transform hover:scale-[1.02] rounded-2xl py-6 text-lg font-medium"
                  disabled={isLoading || !isDatabaseReady}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Signing in...
                    </span>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <div className="text-center text-sm text-gray-600 dark:text-gray-400">
          <p>
            Don&apos;t have an account?{" "}
            <Button
              variant="link"
              className="p-0 h-auto font-semibold text-orange-600 dark:text-orange-400 hover:underline"
              onClick={() => (window.location.href = "/sign-up")}
            >
              Create Account
            </Button>
          </p>
        </div>
      </div>
    </div>
  );
}