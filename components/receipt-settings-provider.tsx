"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

interface ReceiptSettings {
  includeLogo: boolean;
  includeBarcode: boolean;
  includeFooter: boolean;
  paperSize: "58mm" | "80mm";
  fontSize: "small" | "normal" | "large";
  headerText: string;
  includeHeader: boolean;
  businessAddress: string;
  businessPhone: string;
  businessEmail: string;
}

interface ReceiptSettingsContextType {
  settings: ReceiptSettings;
  updateSettings: (newSettings: Partial<ReceiptSettings>) => void;
  saveHeader: () => void;
  deleteHeader: () => void;
  saveBusinessInfo: () => void;
  deleteBusinessInfo: () => void;
}

const ReceiptSettingsContext = createContext<
  ReceiptSettingsContextType | undefined
>(undefined);

export function ReceiptSettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, setSettings] = useState<ReceiptSettings>(() => ({
    includeLogo: true,
    includeBarcode: true,
    includeFooter: true,
    paperSize: "80mm",
    fontSize: "normal",
    headerText: "",
    includeHeader: true,
    businessAddress: "",
    businessPhone: "",
    businessEmail: "",
  }));

  // Load settings from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const savedSettings = localStorage.getItem("receiptSettings");
      if (savedSettings) {
        const parsedSettings = JSON.parse(savedSettings);
        setSettings(parsedSettings);
      }
    } catch (error) {
      console.error("Error loading receipt settings:", error);
    }

    // Also load legacy settings for backward compatibility
    const savedHeader = localStorage.getItem("receiptHeaderText");
    const savedHeaderToggle = localStorage.getItem("receiptHeaderToggle");
    const savedAddress = localStorage.getItem("receiptBusinessAddress");
    const savedPhone = localStorage.getItem("receiptBusinessPhone");
    const savedEmail = localStorage.getItem("receiptBusinessEmail");

    setSettings((prev) => ({
      ...prev,
      headerText: savedHeader || prev.headerText,
      includeHeader:
        savedHeaderToggle === null
          ? prev.includeHeader
          : savedHeaderToggle === "true",
      businessAddress: savedAddress || prev.businessAddress,
      businessPhone: savedPhone || prev.businessPhone,
      businessEmail: savedEmail || prev.businessEmail,
    }));
  }, []);

  const updateSettings = (newSettings: Partial<ReceiptSettings>) => {
    setSettings((prev) => {
      const updatedSettings = { ...prev, ...newSettings };

      // Save to localStorage
      localStorage.setItem("receiptSettings", JSON.stringify(updatedSettings));

      return updatedSettings;
    });
  };

  const saveHeader = () => {
    localStorage.setItem("receiptHeaderText", settings.headerText);
    localStorage.setItem(
      "receiptHeaderToggle",
      settings.includeHeader.toString(),
    );
  };

  const deleteHeader = () => {
    localStorage.removeItem("receiptHeaderText");
    localStorage.removeItem("receiptHeaderToggle");
    setSettings((prev) => ({
      ...prev,
      headerText: "",
      includeHeader: false,
    }));
  };

  const saveBusinessInfo = () => {
    localStorage.setItem(
      "receiptBusinessAddress",
      settings.businessAddress || "",
    );
    localStorage.setItem("receiptBusinessPhone", settings.businessPhone || "");
    localStorage.setItem("receiptBusinessEmail", settings.businessEmail || "");
  };

  const deleteBusinessInfo = () => {
    localStorage.removeItem("receiptBusinessAddress");
    localStorage.removeItem("receiptBusinessPhone");
    localStorage.removeItem("receiptBusinessEmail");
    setSettings((prev) => ({
      ...prev,
      businessAddress: "",
      businessPhone: "",
      businessEmail: "",
    }));
  };

  return (
    <ReceiptSettingsContext.Provider
      value={{
        settings,
        updateSettings,
        saveHeader,
        deleteHeader,
        saveBusinessInfo,
        deleteBusinessInfo,
      }}
    >
      {children}
    </ReceiptSettingsContext.Provider>
  );
}

export function useReceiptSettings() {
  const context = useContext(ReceiptSettingsContext);
  if (context === undefined) {
    throw new Error(
      "useReceiptSettings must be used within a ReceiptSettingsProvider",
    );
  }
  return context;
}
