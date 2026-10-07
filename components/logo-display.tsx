"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { useSettings } from "@/components/settings-provider";

interface LogoDisplayProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  fallbackSrc?: string;
  loadSettings?: boolean;
}

export function LogoDisplay({
  size = "md",
  className = "",
  fallbackSrc = "/logo.jpg",
  loadSettings = true,
}: LogoDisplayProps) {
  const { settings } = useSettings();
  const currentLogo = settings.account.logo?.trim() || fallbackSrc;
  const [logo, setLogo] = useState<string>(currentLogo);
  const [isValidImage, setIsValidImage] = useState(true);

  const validateLogo = useCallback(async (source: string) => {
    await new Promise<void>((resolve) => {
      const image = new window.Image();
      const finish = () => resolve();
      image.onload = finish;
      image.onerror = finish;
      image.src = source;
    });
    setLogo(source);
    setIsValidImage(true);
  }, []);

  useEffect(() => {
    if (!loadSettings) {
      setLogo(fallbackSrc);
      return;
    }
    void validateLogo(currentLogo);
    document.querySelectorAll('link[rel*="icon"]').forEach((link) => {
      (link as HTMLLinkElement).href = `/favicon.ico?v=${encodeURIComponent(currentLogo.slice(0, 32))}`;
    });
  }, [currentLogo, fallbackSrc, loadSettings, validateLogo]);

  const sizeClasses = {
    sm: "h-6 w-6 sm:h-8 sm:w-8",
    md: "h-8 w-8 sm:h-10 sm:w-10",
    lg: "h-12 w-12 sm:h-16 sm:w-16",
  };

  const iconSizes = {
    sm: "h-2 w-2 sm:h-3 sm:w-3",
    md: "h-3 w-3 sm:h-4 sm:w-4",
    lg: "h-6 w-6 sm:h-8 sm:w-8",
  };

  return (
    <div
      className={`pointer-events-none relative isolate ${sizeClasses[size]} overflow-hidden bg-gradient-to-br from-orange-100 to-amber-200 dark:from-orange-800 dark:to-amber-900 rounded-full border-2 border-orange-300 dark:border-orange-600 flex items-center justify-center flex-shrink-0 shadow-lg ${className}`}
    >
      {isValidImage ? (
        <Image
          src={logo || "/logo.svg"}
          alt="Company Logo"
          width={size === "sm" ? 32 : size === "md" ? 40 : 64}
          height={size === "sm" ? 32 : size === "md" ? 40 : 64}
          className="pointer-events-none h-full w-full object-contain rounded-full"
          sizes={size === "sm" ? "32px" : size === "md" ? "40px" : "64px"}
          onError={() => setIsValidImage(false)}
          onLoad={(e) => {
            const img = e.currentTarget;
            if (!img.naturalWidth) setIsValidImage(false);
          }}
        />
      ) : (
        <ImageIcon
          className={`${iconSizes[size]} text-orange-600 dark:text-orange-400`}
        />
      )}
    </div>
  );
}
