"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { getCurrentLogo } from "@/lib/settings";

interface LogoDisplayProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function LogoDisplay({ size = "md", className = "" }: LogoDisplayProps) {
  const [logo, setLogo] = useState<string>("");
  const [isValidImage, setIsValidImage] = useState(true);

  useEffect(() => {
    const currentLogo = getCurrentLogo();
    setLogo(currentLogo);

    // Listen for storage changes to update logo across tabs
    const handleStorageChange = () => {
      const updatedLogo = getCurrentLogo();
      setLogo(updatedLogo);
    };

    window.addEventListener("storage", handleStorageChange);

    // Also listen for custom events when settings are saved
    window.addEventListener("settingsUpdated", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("settingsUpdated", handleStorageChange);
    };
  }, []);

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
      className={`relative ${sizeClasses[size]} bg-gradient-to-br from-orange-100 to-amber-200 dark:from-orange-800 dark:to-amber-900 rounded-full border-2 border-orange-300 dark:border-orange-600 flex items-center justify-center flex-shrink-0 shadow-lg ${className}`}
    >
      {isValidImage ? (
        <Image
          src={logo || "/logo.svg"}
          alt="Company Logo"
          fill
          className="object-cover rounded-full"
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
