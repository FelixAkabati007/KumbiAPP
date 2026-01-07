"use client";

import React, { createContext, useContext, useMemo } from "react";
import { useSettings } from "@/components/settings-provider";

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
  const { settings: appSettings, updateSettings: updateAppSettings } =
    useSettings();

  const settings: ReceiptSettings = useMemo(() => {
    const printer = appSettings.system.thermalPrinter;
    const account = appSettings.account;

    // Map font size string to enum
    let fontSize: "small" | "normal" | "large" = "normal";
    if (printer.fontSize === "9") fontSize = "small";
    else if (printer.fontSize === "16") fontSize = "large";

    return {
      includeLogo: printer.includeLogo,
      includeBarcode: printer.includeBarcode,
      includeFooter: printer.includeFooter,
      paperSize: printer.paperWidth === 80 ? "80mm" : "58mm",
      fontSize: fontSize,
      headerText: account.restaurantName,
      includeHeader: true, // Default to true as it's not explicitly in AppSettings
      businessAddress: account.address,
      businessPhone: account.phone,
      businessEmail: account.email,
    };
  }, [appSettings]);

  const updateSettings = (newSettings: Partial<ReceiptSettings>) => {
    // Map back to AppSettings
    const newPrinterConfig = { ...appSettings.system.thermalPrinter };
    const newAccountConfig = { ...appSettings.account };

    if (newSettings.includeLogo !== undefined)
      newPrinterConfig.includeLogo = newSettings.includeLogo;
    if (newSettings.includeBarcode !== undefined)
      newPrinterConfig.includeBarcode = newSettings.includeBarcode;
    if (newSettings.includeFooter !== undefined)
      newPrinterConfig.includeFooter = newSettings.includeFooter;
    if (newSettings.paperSize !== undefined)
      newPrinterConfig.paperWidth = newSettings.paperSize === "80mm" ? 80 : 58;
    if (newSettings.fontSize !== undefined) {
      if (newSettings.fontSize === "small") newPrinterConfig.fontSize = "9";
      else if (newSettings.fontSize === "large")
        newPrinterConfig.fontSize = "16";
      else newPrinterConfig.fontSize = "12";
    }

    if (newSettings.headerText !== undefined)
      newAccountConfig.restaurantName = newSettings.headerText;
    if (newSettings.businessAddress !== undefined)
      newAccountConfig.address = newSettings.businessAddress;
    if (newSettings.businessPhone !== undefined)
      newAccountConfig.phone = newSettings.businessPhone;
    if (newSettings.businessEmail !== undefined)
      newAccountConfig.email = newSettings.businessEmail;

    updateAppSettings({
      system: {
        ...appSettings.system,
        thermalPrinter: newPrinterConfig,
      },
      account: newAccountConfig,
    });
  };

  const saveHeader = () => {
    // No-op, auto-saved via updateSettings
  };

  const deleteHeader = () => {
    updateSettings({ headerText: "", includeHeader: false });
  };

  const saveBusinessInfo = () => {
    // No-op, auto-saved via updateSettings
  };

  const deleteBusinessInfo = () => {
    updateSettings({
      businessAddress: "",
      businessPhone: "",
      businessEmail: "",
    });
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
      "useReceiptSettings must be used within a ReceiptSettingsProvider"
    );
  }
  return context;
}
