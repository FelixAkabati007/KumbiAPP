"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Upload, ImageIcon, X } from "lucide-react";
import NextImage from "next/image";
import { useAuth } from "@/components/auth-provider";

interface AvatarManagerProps {
  onAvatarChange?: (src: string) => void;
}

const PREDEFINED_AVATARS: string[] = [
  "/placeholder-user.jpg",
  "/placeholder-user.jpg",
  "/placeholder-user.jpg",
  "/placeholder-user.jpg",
  "/placeholder-user.jpg",
];

export function AvatarManager({ onAvatarChange }: AvatarManagerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [zoom, setZoom] = useState<number>(1.2);
  const [src, setSrc] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const objectUrlRef = useRef<string | null>(null);

  const storageKey = useMemo(
    () => (user?.id ? `user_avatar_${user.id}` : "user_avatar_anonymous"),
    [user?.id],
  );

  useEffect(() => {
    try {
      const existing = localStorage.getItem(storageKey) || "";
      if (existing) setSrc(existing);
    } catch (err) {
      console.warn("Failed to read avatar from localStorage", err);
    }
  }, [storageKey]);

  // Revoke blob URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (objectUrlRef.current && objectUrlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Max size is 5MB",
        variant: "destructive",
      });
      return;
    }
    // Revoke any previous object URL before creating a new one to avoid leaks
    if (objectUrlRef.current && objectUrlRef.current.startsWith("blob:")) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setPreviewUrl(url);
  };

  const pickPredefined = (url: string) => {
    setPreviewUrl(url);
    setZoom(1.0);
  };

  const cropAndSave = async () => {
    if (!previewUrl) {
      toast({
        title: "No image selected",
        description: "Upload or choose an avatar first.",
        variant: "destructive",
      });
      return;
    }
    try {
      const img = new window.Image();
      img.width = 256;
      img.height = 256;
      const url = previewUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Image load failed"));
        img.src = url;
      });

      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context unavailable");

      const scaledW = img.width * zoom;
      const scaledH = img.height * zoom;
      const offsetX = (scaledW - size) / 2;
      const offsetY = (scaledH - size) / 2;

      ctx.imageSmoothingQuality = "high";
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, -offsetX, -offsetY, scaledW, scaledH);

      const dataUrl = canvas.toDataURL("image/png");
      try {
        localStorage.setItem(storageKey, dataUrl);
        // Dispatch event so all components update instantly
        window.dispatchEvent(
          new CustomEvent("avatarUpdated", { detail: { src: dataUrl } }),
        );
      } catch (err) {
        console.warn("Failed to save avatar to localStorage", err);
      }
      // Revoke previous blob URL if present
      if (objectUrlRef.current && objectUrlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setSrc(dataUrl);
      onAvatarChange?.(dataUrl);
      toast({ title: "Avatar updated" });
    } catch (err) {
      console.error("Failed to crop/save avatar", err);
      toast({
        title: "Error",
        description: "Could not save avatar.",
        variant: "destructive",
      });
    }
  };

  const resetAvatar = () => {
    try {
      localStorage.removeItem(storageKey);
      window.dispatchEvent(
        new CustomEvent("avatarUpdated", { detail: { src: "" } }),
      );
    } catch (err) {
      console.warn("Failed to remove avatar from localStorage", err);
    }
    if (objectUrlRef.current && objectUrlRef.current.startsWith("blob:")) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setSrc("");
    setPreviewUrl("");
    onAvatarChange?.("");
    toast({ title: "Avatar reset" });
  };

  return (
    <Card
      aria-label="Avatar settings"
      role="region"
      className="bg-white/70 dark:bg-gray-800/70 border border-orange-200 dark:border-orange-700 shadow-xl relative overflow-hidden backdrop-blur-sm max-w-sm w-full px-4 py-4"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20 pointer-events-none"></div>
      <CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
        <CardTitle className="flex items-center gap-2 text-gray-800 dark:text-gray-200">
          <span className="p-2 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-full shadow-lg">
            <ImageIcon className="h-5 w-5 text-white" aria-hidden="true" />
          </span>
          Avatar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 relative z-10">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 border-2 border-orange-300 dark:border-orange-700 shadow-md">
            {src ? (
              <AvatarImage src={src} alt="Profile avatar" />
            ) : (
              <AvatarFallback
                aria-label="No avatar"
                className="bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300"
              >
                {(user?.name || user?.email || user?.id || "User")
                  .slice(0, 2)
                  .toUpperCase()}
              </AvatarFallback>
            )}
          </Avatar>
          <div className="flex flex-col items-center gap-2 w-full">
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="border-orange-200 dark:border-orange-700 bg-white/50 dark:bg-gray-800/50 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300 w-full mt-3"
            >
              <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
              Upload
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={resetAvatar}
              className="text-orange-700 dark:text-orange-300 w-full mt-1"
            >
              <X className="mr-2 h-4 w-4" aria-hidden="true" />
              Reset
            </Button>
            <Input
              type="file"
              ref={fileInputRef}
              onChange={handleFile}
              accept="image/*"
              className="hidden"
              aria-label="Upload new avatar"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label
            htmlFor="avatar-zoom"
            className="text-orange-700 dark:text-orange-300"
          >
            Crop zoom
          </Label>
          <Slider
            id="avatar-zoom"
            value={[zoom]}
            min={1.0}
            max={3.0}
            step={0.05}
            onValueChange={(v) => setZoom(v[0])}
            aria-valuemin={1.0}
            aria-valuemax={3.0}
            aria-valuenow={zoom}
            className="[&_.range-thumb]:bg-gradient-to-r [&_.range-thumb]:from-orange-500 [&_.range-thumb]:via-amber-500 [&_.range-thumb]:to-yellow-500"
          />
        </div>

        <div className="grid grid-cols-5 gap-2" aria-label="Predefined avatars">
          {PREDEFINED_AVATARS.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={() => pickPredefined(a)}
              className="rounded-md border border-orange-200 dark:border-orange-700 bg-orange-50 dark:bg-orange-900 p-1 hover:bg-orange-100 dark:hover:bg-orange-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
              aria-label={`Choose avatar ${i + 1}`}
            >
              <NextImage
                src={a}
                alt="Predefined avatar"
                width={48}
                height={48}
                className="h-12 w-12 rounded-md object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={cropAndSave}
            disabled={!previewUrl}
            className="bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg"
          >
            Save avatar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default AvatarManager;
