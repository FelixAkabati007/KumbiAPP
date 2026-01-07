"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { hasPermission, AppSection, UserRole } from "@/lib/roles";
import { LoadingSpinner } from "@/components/ui/spinner";

export function RoleGuard({
  children,
  section,
}: {
  children: React.ReactNode;
  section: AppSection;
}) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      router.push("/login");
      return;
    }

    if (hasPermission(user.role as UserRole, section)) {
      setIsAuthorized(true);
    } else {
      router.push("/unauthorized");
    }
    setChecking(false);
  }, [user, isLoading, section, router]);

  if (isLoading || checking) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner className="h-8 w-8" />
      </div>
    );
  }

  if (!isAuthorized) {
    return null; // Will redirect
  }

  return <>{children}</>;
}
