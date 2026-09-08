"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function EmergencyRecoveryPage() {
  const [recoverySecret, setRecoverySecret] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/emergency-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recoverySecret, email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Recovery request could not be completed");
      setSuccess(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Recovery request could not be completed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Emergency account recovery</CardTitle>
          <CardDescription>
            This private recovery tool is for authorized administrators only. Your recovery secret is never stored or displayed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-4">
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Password updated</AlertTitle>
                <AlertDescription>You can now sign in with the new password.</AlertDescription>
              </Alert>
              <Link href="/login"><Button className="w-full">Return to login</Button></Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {message && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Recovery failed</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>}
              <div className="space-y-2"><Label htmlFor="recovery-secret">Recovery secret</Label><Input id="recovery-secret" type="password" required value={recoverySecret} onChange={(event) => setRecoverySecret(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="email">Administrator email</Label><Input id="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="password">New password</Label><Input id="password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} /><p className="text-xs text-muted-foreground">Use 12+ characters with uppercase, lowercase, number, and special character.</p></div>
              <div className="space-y-2"><Label htmlFor="confirm-password">Confirm new password</Label><Input id="confirm-password" type="password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></div>
              <Button type="submit" className="w-full" disabled={loading}>{loading ? "Updating password..." : "Update password"}</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
