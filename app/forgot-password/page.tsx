"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";
import { AuthShell, AuthSpinner } from "@/components/auth-shell";
import { forgotPasswordSchema } from "@/lib/validations/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please enter a valid email address");
      return;
    }
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      setSuccess(true);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unexpected error occurred");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Reset password" description="Enter your email address and we&apos;ll send reset instructions if an account exists." footer={<Link href="/login" className="flex items-center justify-center text-sm text-orange-600 hover:underline dark:text-orange-400"><ArrowLeft className="mr-2 h-4 w-4" />Back to login</Link>}>
        <div className="space-y-4">
          {success ? (
            <Alert className="border-green-500 bg-green-50 text-green-900 dark:bg-green-900/20 dark:text-green-300">
              <CheckCircle2 className="h-4 w-4" color="currentColor" />
              <AlertTitle>Check your email</AlertTitle>
              <AlertDescription>
                If an account exists for this email, we&apos;ll send reset instructions shortly.
              </AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-gray-700 dark:text-gray-300">Email address</label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <AuthSpinner label="Sending link..." /> : "Send reset link"}
              </Button>
            </form>
          )}
          {success && <Button type="button" variant="outline" className="w-full" onClick={() => { setSuccess(false); setError(""); }}>Use a different email</Button>}
        </div>
    </AuthShell>
  );
}
