"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { Button } from "@/components/ui/button";
import { AuthShell, AuthSpinner } from "@/components/auth-shell";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
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
      }
    } catch (err) {
      console.error("Sign in error:", err);
      setError("Sign in is temporarily unavailable. Please try again.");
    } finally {
      hideLoading();
    }
  };

  return (
    <AuthShell title="Sign into Sales Terminal" description={<>Enter your credentials to access the sales terminal{!isDatabaseReady && <span className="mt-2 block text-xs text-amber-600 dark:text-amber-400">Connecting to database. Please wait...</span>}</>} footer={<p className="text-center text-sm text-gray-600 dark:text-gray-400">Need an account? Contact your administrator to have one created for you.</p>}>
            {error && (
              <Alert className="border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 rounded-2xl">
                <AlertDescription className="text-red-700 dark:text-red-300 text-sm">
                  {error}
                </AlertDescription>
              </Alert>
            )}

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
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
                            aria-label={showPassword ? "Hide password" : "Show password"}
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

                <div className="flex justify-end">
                  <Link href="/forgot-password" className="text-xs font-normal text-orange-600 hover:underline dark:text-orange-400">Forgot password?</Link>
                </div>

                <Button
                  type="submit"
                  className="w-full rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 py-5 text-base font-medium text-white shadow-lg transition-all duration-300 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 sm:py-6 sm:text-lg"
                  disabled={isLoading || !isDatabaseReady}
                >
                  {isLoading ? (
                    <AuthSpinner label="Signing in..." />
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>
            </Form>
    </AuthShell>
  );
}
