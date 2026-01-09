"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function VerifyEmailPage() {
  const params = useSearchParams();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const token = params.get("token") || "";
  const email = params.get("email") || "";

  useEffect(() => {
    const verify = async () => {
      if (!token || !email) {
        setStatus("error");
        setMessage("Missing verification token or email.");
        return;
      }
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, email }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setStatus("success");
          setMessage("Email verified! Redirecting...");
          setTimeout(() => {
            window.location.href = "/";
          }, 1500);
        } else {
          setStatus("error");
          setMessage(data.error || "Verification failed.");
        }
      } catch {
        setStatus("error");
        setMessage("Network error during verification.");
      }
    };
    verify();
  }, [token, email]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-2xl font-semibold">Verify Email</h1>
        {status === "idle" && <p>Verifying your email, please wait...</p>}
        {status !== "idle" && (
          <Alert variant={status === "success" ? "default" : "destructive"}>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        {status === "error" && (
          <Button onClick={() => (window.location.href = "/")}>Go Home</Button>
        )}
      </div>
    </div>
  );
}
