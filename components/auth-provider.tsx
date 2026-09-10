"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

interface AppUser {
  id: string;
  role: string;
  name: string;
  email: string;
  avatar_url?: string;
}

interface AuthContextType {
  user: AppUser | null;
  login: (email: string, password: string) => Promise<boolean>;
  signup: (
    email: string,
    password: string,
    name: string,
    role: string,
    honeypot?: string
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  switchRole: (role: string) => void;
  refreshUser: () => Promise<void>;
  isLoading: boolean;
  authLoading: boolean;
  isDatabaseReady: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDatabaseReady] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error("Auth check failed:", error);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    checkAuth().finally(() => setIsLoading(false));
  }, [checkAuth]);

  // Re-fetches the current user (e.g. after avatar/profile updates) so
  // context consumers stay in sync without requiring a full page reload.
  const refreshUser = useCallback(async (): Promise<void> => {
    await checkAuth();
  }, [checkAuth]);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setUser(data.user);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Login failed:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signup = useCallback(async (
    email: string,
    password: string,
    name: string,
    role: string,
    honeypot?: string
  ): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          name,
          role,
          confirm_email_address: honeypot,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        // Do not set user here; account is created but not verified yet
        return { success: true };
      }
      return { success: false, error: data.error || "Signup failed" };
    } catch (error) {
      console.error("Signup failed:", error);
      return { success: false, error: "Network error during signup" };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const switchRole = useCallback((role: string) => {
    // Role switching is not supported in real auth without admin privileges or re-login
    // For now, we'll just log it or we could implement an impersonation feature later
    console.warn(
      "Switching role is not supported in production mode yet.",
      role
    );
  }, []);

  const value = useMemo(() => ({
    user,
    login,
    signup,
    logout,
    switchRole,
    refreshUser,
    isLoading,
    authLoading: isLoading,
    isDatabaseReady,
  }), [user, login, signup, logout, switchRole, refreshUser, isLoading, isDatabaseReady]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
