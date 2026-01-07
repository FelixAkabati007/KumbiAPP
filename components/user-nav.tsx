"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Settings, User as UserIcon, LogOut } from "lucide-react";
import { useAuth } from "@/components/auth-provider";

function getInitials(nameOrEmail?: string | null) {
  if (!nameOrEmail) return "UA";
  const str = nameOrEmail.split("@")[0];
  const parts = str.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return (str[0] ?? "U").toUpperCase();
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function UserNav() {
  const { user, logout } = useAuth();
  const [avatarSrc, setAvatarSrc] = useState<string>("");

  const storageKey = useMemo(
    () => (user?.id ? `user_avatar_${user.id}` : "user_avatar_anonymous"),
    [user?.id],
  );

  useEffect(() => {
    function updateAvatar(e?: Event) {
      if (e instanceof CustomEvent && e.detail?.src !== undefined) {
         setAvatarSrc(e.detail.src);
      }
    }
    // No initial load from localStorage
    window.addEventListener("avatarUpdated", updateAvatar as EventListener);
    return () => {
      window.removeEventListener(
        "avatarUpdated",
        updateAvatar as EventListener,
      );
    };
  }, [storageKey]);

  const initials = getInitials(user?.name || user?.email || user?.id);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="rounded-full p-0 h-10 w-10 focus:ring-2 focus:ring-ring focus:ring-offset-2"
          aria-label="Open user menu"
        >
          <Avatar className="h-10 w-10">
            {avatarSrc ? (
              <AvatarImage src={avatarSrc} alt="User avatar" />
            ) : (
              <AvatarFallback aria-label="User avatar fallback">
                {initials}
              </AvatarFallback>
            )}
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex items-center gap-2">
          <UserIcon className="h-4 w-4" aria-hidden="true" />
          <span className="truncate">
            {user?.name || user?.email || user?.id || "Guest"}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings?tab=account" aria-label="Open Settings">
            <span className="flex items-center gap-2">
              <Settings className="h-4 w-4" aria-hidden="true" />
              Settings
            </span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => logout?.()} aria-label="Sign out">
          <span className="flex items-center gap-2">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default UserNav;
