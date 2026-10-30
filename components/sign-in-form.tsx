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
import { ChevronDown, ChevronUp, Eye, EyeOff, Lock, Mail, ShieldCheck, Users } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useLoading } from "@/components/loading-provider";
import { DEFAULT_ROLE_ACCOUNTS, type DefaultAccountSpec } from "@/lib/default-accounts";
import { getRoleDisplayName } from "@/lib/roles";
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
  const [showQuickAccess, setShowQuickAccess] = useState(false);
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
      const result = await login(data.email, data.password);

      if (result.success) {
        // Replace the login document so the new auth cookie is read by middleware and server components.
        window.location.replace("/");
      } else {
        setError(result.error || "Invalid email or password. Please try again.");
      }
    } catch (err) {
      console.error("Sign in error:", err);
      setError("Sign in is temporarily unavailable. Please try again.");
    } finally {
      hideLoading();
    }
  };

  const handleQuickRoleSelect = async (acct: DefaultAccountSpec) => {
    form.setValue("email", acct.email, { shouldValidate: true });
    form.setValue("password", acct.defaultPassword, { shouldValidate: true });
    await onSubmit({ email: acct.email, password: acct.defaultPassword });
  };

  return (
    <AuthShell
      title="Sign into Sales Terminal"
      description={
        <>
          Enter your credentials to access the sales terminal
          {!isDatabaseReady && (
            <span className="mt-2 block text-xs text-amber-600 dark:text-amber-400">
              Connecting to database. Please wait...
            </span>
          )}
        </>
      }
      footer={
        <div className="space-y-1 text-center text-sm text-gray-600 dark:text-gray-400">
          <p>
            Need an account?{" "}
            <Link
              href="/sign-up"
              className="font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400 hover:underline"
            >
              Create an account
            </Link>
          </p>
        </div>
      }
    >
      {error && (
        <Alert className="border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 rounded-2xl">
          <AlertDescription className="text-red-700 dark:text-red-300 text-sm">
            {error}
          </AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form
          noValidate
          autoComplete="on"
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
                      autoComplete="email"
                      inputMode="email"
                      className="min-h-11 rounded-2xl border-orange-200 bg-white/50 pl-10 dark:border-orange-700 dark:bg-gray-800/50 focus:border-orange-500 dark:focus:border-orange-400"
                      disabled={isLoading || form.formState.isSubmitting}
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
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      className="min-h-11 rounded-2xl border-orange-200 bg-white/50 pl-10 pr-10 dark:border-orange-700 dark:bg-gray-800/50 focus:border-orange-500 dark:focus:border-orange-400"
                      disabled={isLoading || form.formState.isSubmitting || !isDatabaseReady}
                      {...field}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full min-w-11 px-3 py-2 hover:bg-transparent"
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
            <Link
              href="/forgot-password"
              className="text-xs font-normal text-orange-600 hover:underline dark:text-orange-400"
            >
              Forgot password?
            </Link>
          </div>

          <Button
            type="submit"
            className="min-h-12 w-full rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 px-4 py-3 text-base font-medium text-white shadow-lg transition-colors duration-150 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 sm:min-h-14 sm:text-lg"
            disabled={isLoading || form.formState.isSubmitting || !isDatabaseReady}
          >
            {isLoading ? <AuthSpinner label="Signing in..." /> : "Sign In"}
          </Button>
        </form>
      </Form>

      {/* Quick Role Sign-In Panel for Admin & All Staff Roles */}
      <div className="mt-4 rounded-2xl border border-orange-200/80 bg-orange-50/60 p-3 dark:border-orange-800/60 dark:bg-orange-950/25">
        <button
          type="button"
          onClick={() => setShowQuickAccess((prev) => !prev)}
          className="flex w-full items-center justify-between text-left text-xs font-semibold text-orange-800 dark:text-orange-300"
        >
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
            Quick Role Sign-In (Admin &amp; All Department Accounts)
          </span>
          {showQuickAccess ? (
            <ChevronUp className="h-4 w-4 text-orange-600" />
          ) : (
            <ChevronDown className="h-4 w-4 text-orange-600" />
          )}
        </button>

        {showQuickAccess && (
          <div className="mt-3 space-y-2">
            <p className="text-[11px] text-gray-600 dark:text-gray-400">
              Click any role below to sign in immediately or use its credentials directly:
            </p>
            <div className="grid max-h-60 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
              {DEFAULT_ROLE_ACCOUNTS.map((acct) => (
                <button
                  key={acct.role}
                  type="button"
                  disabled={isLoading}
                  onClick={() => void handleQuickRoleSelect(acct)}
                  className="flex flex-col items-start rounded-xl border border-orange-200/90 bg-white px-2.5 py-2 text-left transition hover:border-orange-400 hover:bg-orange-50/80 disabled:opacity-50 dark:border-orange-800/70 dark:bg-gray-900 dark:hover:bg-orange-950/50"
                >
                  <span className="flex items-center gap-1 text-xs font-bold text-gray-900 dark:text-gray-100">
                    {acct.role === "admin" && (
                      <ShieldCheck className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                    )}
                    {getRoleDisplayName(acct.role)}
                  </span>
                  <span className="w-full truncate font-mono text-[10px] text-gray-500 dark:text-gray-400">
                    {acct.email}
                  </span>
                  <span className="font-mono text-[10px] text-orange-700 dark:text-orange-300">
                    Pwd: {acct.defaultPassword}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </AuthShell>
  );
}
