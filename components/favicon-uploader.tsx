"use client";

import React, { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  ImageIcon,
  CheckCircle,
  AlertCircle,
  X,
  Globe,
  Loader2,
} from "lucide-react";
import Image from "next/image";

interface FaviconUploaderProps {
  onFaviconUpdate?: (faviconUrl: string) => void;
  className?: string;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

interface ProcessingState {
  isProcessing: boolean;
  progress: number;
  currentStep: string;
}

const SUPPORTED_FORMATS = ["image/x-icon", "image/png", "image/svg+xml"];
const MIN_DIMENSIONS = 16;
const MAX_DIMENSIONS = 512;
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

export default function FaviconUploader({
  onFaviconUpdate,
  className,
}: FaviconUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [processing, setProcessing] = useState<ProcessingState>({
    isProcessing: false,
    progress: 0,
    currentStep: "",
  });
  const [currentFavicon, setCurrentFavicon] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Validate uploaded image
  const validateImage = useCallback(
    async (file: File): Promise<ValidationResult> => {
      const errors: string[] = [];
      const warnings: string[] = [];

      // Check file type
      if (!SUPPORTED_FORMATS.includes(file.type)) {
        errors.push(
          `Unsupported format: ${file.type}. Supported formats: ICO, PNG, SVG`,
        );
      }

      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        errors.push(
          `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum: 2MB`,
        );
      }

      // For non-SVG images, check dimensions
      if (file.type !== "image/svg+xml") {
        try {
          const dimensions = await getImageDimensions(file);

          if (dimensions.width !== dimensions.height) {
            warnings.push(
              "Image is not square. It will be cropped to square aspect ratio.",
            );
          }

          if (
            dimensions.width < MIN_DIMENSIONS ||
            dimensions.height < MIN_DIMENSIONS
          ) {
            errors.push(
              `Image too small: ${dimensions.width}x${dimensions.height}. Minimum: ${MIN_DIMENSIONS}x${MIN_DIMENSIONS}`,
            );
          }

          if (
            dimensions.width > MAX_DIMENSIONS ||
            dimensions.height > MAX_DIMENSIONS
          ) {
            warnings.push(
              `Large image: ${dimensions.width}x${dimensions.height}. Will be resized for optimal performance.`,
            );
          }
        } catch (error) {
          console.warn("Could not read image dimensions", error);
          errors.push("Could not read image dimensions");
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
      };
    },
    [],
  );

  // Get image dimensions
  const getImageDimensions = (
    file: File,
  ): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = URL.createObjectURL(file);
    });
  };

  // Handle file selection
  const handleFileSelect = useCallback(
    async (file: File) => {
      setSelectedFile(file);

      // Create preview URL
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);

      // Validate the file
      const validationResult = await validateImage(file);
      setValidation(validationResult);

      if (validationResult.warnings.length > 0) {
        toast({
          title: "Image Warnings",
          description: validationResult.warnings.join(". "),
          variant: "default",
        });
      }

      if (!validationResult.isValid) {
        toast({
          title: "Invalid Image",
          description: validationResult.errors.join(". "),
          variant: "destructive",
        });
      }
    },
    [validateImage, toast],
  );

  // Handle drag events
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  // Handle drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileSelect(e.dataTransfer.files[0]);
      }
    },
    [handleFileSelect],
  );

  // Handle file input change
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        handleFileSelect(e.target.files[0]);
      }
    },
    [handleFileSelect],
  );

  // Upload and process favicon via API
  const uploadFavicon = useCallback(
    async (file: File) => {
      const formData = new FormData();
      formData.append("favicon", file);

      const response = await fetch("/api/favicon", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Upload failed");
      }

      const result = await response.json();

      if (result.warnings && result.warnings.length > 0) {
        toast({
          title: "Processing Warnings",
          description: result.warnings.join(". "),
          variant: "default",
        });
      }

      return result.urls;
    },
    [toast],
  );

  // Update favicon links in HTML head
  const updateFaviconLinks = useCallback(
    async (urls: { [key: string]: string }) => {
      // Remove existing favicon links
      const existingLinks = document.querySelectorAll('link[rel*="icon"]');
      existingLinks.forEach((link) => link.remove());

      // Add new favicon links
      const head = document.head;

      // ICO favicon (legacy support)
      const icoLink = document.createElement("link");
      icoLink.rel = "shortcut icon";
      icoLink.type = "image/x-icon";
      icoLink.href = urls.ico;
      head.appendChild(icoLink);

      // PNG favicons for different sizes
      const pngSizes = [
        { size: "16x16", url: urls.png16 },
        { size: "32x32", url: urls.png32 },
        { size: "64x64", url: urls.png64 },
        { size: "128x128", url: urls.png128 },
        { size: "256x256", url: urls.png256 },
      ];

      pngSizes.forEach(({ size, url }) => {
        const link = document.createElement("link");
        link.rel = "icon";
        link.type = "image/png";
        link.sizes = size;
        link.href = url;
        head.appendChild(link);
      });

      // Apple touch icon
      const appleLink = document.createElement("link");
      appleLink.rel = "apple-touch-icon";
      appleLink.sizes = "256x256";
      appleLink.href = urls.png256;
      head.appendChild(appleLink);
    },
    [],
  );

  // Process and save favicon
  const processFavicon = useCallback(async () => {
    if (!selectedFile || !validation?.isValid) return;

    setProcessing({
      isProcessing: true,
      progress: 0,
      currentStep: "Preparing image...",
    });

    try {
      setProcessing((prev) => ({
        ...prev,
        progress: 33,
        currentStep: "Uploading and processing image...",
      }));
      const faviconUrls = await uploadFavicon(selectedFile);
      setProcessing((prev) => ({
        ...prev,
        progress: 66,
        currentStep: "Updating page metadata...",
      }));
      await updateFaviconLinks(faviconUrls);
      setProcessing((prev) => ({
        ...prev,
        progress: 100,
        currentStep: "Complete!",
      }));
      setCurrentFavicon(faviconUrls.ico);
      onFaviconUpdate?.(faviconUrls.ico);
      toast({
        title: "Favicon Updated",
        description:
          "Your new favicon has been successfully uploaded and applied.",
        variant: "default",
      });
      setTimeout(() => {
        setSelectedFile(null);
        setPreviewUrl(null);
        setValidation(null);
        setProcessing({ isProcessing: false, progress: 0, currentStep: "" });
      }, 2000);
    } catch (error) {
      console.error("Favicon processing error:", error);
      toast({
        title: "Upload Failed",
        description:
          error instanceof Error ? error.message : "Failed to process favicon",
        variant: "destructive",
      });
      setProcessing({ isProcessing: false, progress: 0, currentStep: "" });
    }
  }, [
    selectedFile,
    validation,
    onFaviconUpdate,
    toast,
    uploadFavicon,
    updateFaviconLinks,
  ]);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setValidation(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  return (
    <Card
      className={`bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden ${className}`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>

      <CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
        <CardTitle className="flex items-center gap-2 text-lg text-gray-800 dark:text-gray-200">
          <div className="p-2 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-full shadow-lg">
            <Globe className="h-5 w-5 text-white" />
          </div>
          Website Favicon
        </CardTitle>
      </CardHeader>

      <CardContent className="p-6 space-y-6 relative z-10">
        {/* Current Favicon Display */}
        {currentFavicon && (
          <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700">
            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                Current Favicon Active
              </p>
              <p className="text-xs text-green-600 dark:text-green-400">
                Your favicon is live and visible in browser tabs
              </p>
            </div>
            <div className="w-8 h-8 bg-white rounded border">
              <Image
                src={currentFavicon}
                alt="Current favicon"
                width={32}
                height={32}
                className="w-full h-full object-cover rounded"
              />
            </div>
          </div>
        )}

        {/* Upload Area */}
        <div
          className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ${
            dragActive
              ? "border-orange-400 bg-orange-50 dark:bg-orange-900/20"
              : "border-orange-200 dark:border-orange-700 hover:border-orange-300 dark:hover:border-orange-600"
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            id="faviconFileInput"
            ref={fileInputRef}
            type="file"
            accept=".ico,.png,.svg,image/x-icon,image/png,image/svg+xml"
            onChange={handleInputChange}
            className="hidden"
            aria-label="Upload favicon file"
            title="Upload favicon file"
          />

          {previewUrl ? (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="relative w-16 h-16 bg-white rounded-lg border shadow-sm">
                  <Image
                    src={previewUrl}
                    alt="Favicon preview"
                    width={64}
                    height={64}
                    className="w-full h-full object-cover rounded-lg"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={clearSelection}
                    className="absolute -top-2 -right-2 h-6 w-6 bg-red-500 hover:bg-red-600 text-white rounded-full"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div className="text-sm text-gray-600 dark:text-gray-400">
                <p className="font-medium">{selectedFile?.name}</p>
                <p>
                  {selectedFile && (selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>

              {/* Validation Results */}
              {validation && (
                <div className="space-y-2">
                  {validation.errors.map((error, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400"
                    >
                      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span>{error}</span>
                    </div>
                  ))}
                  {validation.warnings.map((warning, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400"
                    >
                      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="p-4 bg-orange-100 dark:bg-orange-900/30 rounded-full">
                  <Upload className="h-8 w-8 text-orange-600 dark:text-orange-400" />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-lg font-medium text-gray-800 dark:text-gray-200">
                  Upload Favicon
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Drag and drop your favicon file here, or click to browse
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500">
                  Supports ICO, PNG, SVG • Max 2MB • Minimum 16x16px
                </p>
              </div>

              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="border-orange-200 dark:border-orange-700 bg-white/50 dark:bg-gray-800/50 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300"
              >
                <ImageIcon className="h-4 w-4 mr-2" />
                Choose File
              </Button>
            </div>
          )}
        </div>

        {/* Processing Progress */}
        {processing.isProcessing && (
          <div className="space-y-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                {processing.currentStep}
              </span>
            </div>
            <Progress value={processing.progress} className="h-2" />
            <p className="text-xs text-blue-600 dark:text-blue-400">
              {processing.progress}% complete
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={processFavicon}
            disabled={
              !selectedFile || !validation?.isValid || processing.isProcessing
            }
            className="flex-1 bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg disabled:opacity-50"
          >
            {processing.isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Globe className="h-4 w-4 mr-2" />
                Apply Favicon
              </>
            )}
          </Button>

          {selectedFile && (
            <Button
              variant="outline"
              onClick={clearSelection}
              disabled={processing.isProcessing}
              className="border-orange-200 dark:border-orange-700 bg-white/50 dark:bg-gray-800/50 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300"
            >
              <X className="h-4 w-4 mr-2" />
              Clear
            </Button>
          )}
        </div>

        {/* Format Information */}
        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
          <p className="font-medium">Supported formats:</p>
          <ul className="list-disc list-inside space-y-0.5 ml-2">
            <li>ICO files (recommended for legacy browser support)</li>
            <li>PNG files (modern browsers, high quality)</li>
            <li>SVG files (scalable vector graphics)</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
