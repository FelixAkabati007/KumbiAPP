"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signupSchema, type SignupInput } from "@/lib/validations/auth";
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
import {
  Eye,
  EyeOff,
  Lock,
  User,
  Utensils,
  Mail,
  Crown,
  CheckCircle,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { LogoDisplay } from "@/components/logo-display";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

export function SignUpForm() {
  const { signup, isLoading, isDatabaseReady } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const form = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
      name: "",
      role: "staff",
    },
  });

  const onSubmit = async (data: SignupInput) => {
    setError("");
    setSuccess("");

    if (!isDatabaseReady) {
      setError("Database is not ready. Please try again in a moment.");
      return;
    }

    try {
      const result = await signup(
        data.email,
        data.password,
        data.name,
        data.role,
        data.username
      );

      if (result.success) {
        setSuccess(
          isDatabaseReady
            ? "Account created successfully! Please check your email for verification."
            : "Account created successfully! You can now sign in."
        );
        setTimeout(() => {
          window.location.href = "/login";
        }, 2000);
      } else {
        setError(result.error || "Failed to create account");
      }
    } catch (err) {
      console.error("Sign up error:", err);
      setError("An error occurred during sign up. Please try again.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950 p-4">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <LogoDisplay size="lg" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2">
              <Utensils className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                Kumbisaly Heritage Restaurant
              </h1>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Create New Account
              {!isDatabaseReady && (
                <span className="block text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Connecting to Neon database...
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Sign Up Card */}
        <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>

          <CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10 text-center">
            <CardTitle className="flex items-center justify-center gap-2 text-xl text-gray-800 dark:text-gray-200">
              <div className="p-2 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-full shadow-lg">
                <Crown className="h-5 w-5 text-white" />
              </div>
              Join the Team
            </CardTitle>
            <CardDescription className="text-sm text-gray-600 dark:text-gray-400">
              Fill in your details to get started
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

            {success && (
              <Alert className="border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/20 rounded-2xl">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertDescription className="text-green-700 dark:text-green-300 text-sm ml-2">
                  {success}
                </AlertDescription>
              </Alert>
            )}

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Full Name
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                              placeholder="John Doe"
                              className="pl-10 rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                              disabled={isLoading}
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage className="text-xs text-red-600 dark:text-red-400" />
                      </FormItem>
                    )}
                  />

                  {/* Honeypot Field (Hidden) */}
                  <FormField
                    control={form.control}
                    name="confirm_email_address"
                    render={({ field }) => (
                      <FormItem className="hidden">
                        <FormLabel>Confirm Email</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            tabIndex={-1}
                            autoComplete="off"
                            placeholder="Please leave this blank"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Username
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Crown className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                              placeholder="johndoe"
                              className="pl-10 rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                              disabled={isLoading}
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage className="text-xs text-red-600 dark:text-red-400" />
                      </FormItem>
                    )}
                  />
                </div>

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
                            placeholder="name@example.com"
                            type="email"
                            className="pl-10 rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                            disabled={isLoading}
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage className="text-xs text-red-600 dark:text-red-400" />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 md:grid-cols-2">
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
                              placeholder="••••••••"
                              className="pl-10 pr-10 rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                              disabled={isLoading}
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
                                {showPassword
                                  ? "Hide password"
                                  : "Show password"}
                              </span>
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage className="text-xs text-red-600 dark:text-red-400" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Confirm Password
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                              type={showConfirmPassword ? "text" : "password"}
                              placeholder="••••••••"
                              className="pl-10 pr-10 rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                              disabled={isLoading}
                              {...field}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                              onClick={() =>
                                setShowConfirmPassword(!showConfirmPassword)
                              }
                              disabled={isLoading}
                            >
                              {showConfirmPassword ? (
                                <EyeOff className="h-4 w-4 text-gray-400" />
                              ) : (
                                <Eye className="h-4 w-4 text-gray-400" />
                              )}
                              <span className="sr-only">
                                {showConfirmPassword
                                  ? "Hide password"
                                  : "Show password"}
                              </span>
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage className="text-xs text-red-600 dark:text-red-400" />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Role
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled={isLoading}
                      >
                        <FormControl>
                          <SelectTrigger className="rounded-2xl border-orange-200 dark:border-orange-700 focus:ring-orange-500 dark:focus:ring-orange-400 bg-white/50 dark:bg-gray-800/50">
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="staff">Staff</SelectItem>
                          <SelectItem value="kitchen">Kitchen Staff</SelectItem>
                          <SelectItem value="cashier">Cashier</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
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
                      Creating account...
                    </span>
                  ) : (
                    "Create Account"
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <div className="text-center text-sm text-gray-600 dark:text-gray-400">
          <p>
            Already have an account?{" "}
            <Button
              variant="link"
              className="p-0 h-auto font-semibold text-orange-600 dark:text-orange-400 hover:underline"
              onClick={() => (window.location.href = "/login")}
            >
              Sign in
            </Button>
          </p>
        </div>
      </div>
    </div>
  );
}
