"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UnitSelect } from "@/components/ui/unit-select";
import { getCompatibleRecipeUnits, getInventoryUnitCompatibilityError } from "@/lib/inventory-units";
import {
  ArrowLeft,
  Edit,
  Package,
  Plus,
  Save,
  Search,
  Trash,
  AlertTriangle,
  TrendingDown,
  Sparkles,
  Building2,
  Download,
  Printer,
  Loader2,
  CheckCircle2,
  XCircle,
  Eye,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  exportInventoryData,
} from "@/lib/data";
import type { InventoryItem } from "@/lib/types";
import { getOfflineInventory, setOfflineInventory } from "@/lib/offline-storage";
import { LogoDisplay } from "@/components/logo-display";
import { playNotificationSound } from "@/lib/notifications";
import { RoleGuard } from "@/components/role-guard";
import { useAuth } from "@/components/auth-provider";
import { getInventoryBaseUnit } from "@/lib/inventory-units";
import { canTopUpInventory, canReviewInventoryVariance } from "@/lib/roles";
import { useRealtime } from "@/components/realtime-provider";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character] ?? character));

const INVENTORY_PRINT_ROLES = new Set([
  "admin",
  "generalmanager",
  "manager",
  "restaurantmanager",
  "chef",
  "kitchen",
]);

function getEditorComparable(item: InventoryItem | null) {
  if (!item) return "";
  return JSON.stringify(item);
}

function getUnitSelectionHint(purchaseUnit?: string | null) {
  const unit = (purchaseUnit ?? "").toLowerCase().trim().replace(/\s*\([^)]*\)\s*$/, "");
  if (["kg", "kilogram", "kilograms"].includes(unit)) return "Automatic: g, kg, oz, and lb. Chef units such as Slice require an explicit yield.";
  if (["g", "gram", "grams"].includes(unit)) return "These are compatible weight units. Choose Slice only when you know the chef yield per g.";
  if (["l", "litre", "litres", "liter", "liters"].includes(unit)) return "Automatic: ml, l, fl oz, qt, and gal. Chef units such as Ladle require an explicit yield.";
  if (["ml", "millilitre", "millilitres", "milliliter", "milliliters"].includes(unit)) return "These are compatible liquid units. Choose Ladle only when you know the chef yield per ml.";
  return "Choose a matching count unit, or use Chef yield for a measured chef unit such as Slice.";
}

function InventoryContent() {
  const { toast } = useToast();
  const { user } = useAuth();
  const canMutateExistingInventory = user?.role === "admin";
  const canTopUpStock = canTopUpInventory(user?.role);
  const normalizedRole = (user?.role ?? "").toLowerCase().replace(/[ _-]/g, "");
  const canPrintInventory = INVENTORY_PRINT_ROLES.has(normalizedRole);
  const [isPrintingInventory, setIsPrintingInventory] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [originalEditingItem, setOriginalEditingItem] = useState<InventoryItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [editorErrors, setEditorErrors] = useState<Record<string, string>>({});
  const [isNewItem, setIsNewItem] = useState(false);
  const [varianceItem, setVarianceItem] = useState<InventoryItem | null>(null);
  const [varianceReason, setVarianceReason] = useState("expired");
  const [varianceQuantity, setVarianceQuantity] = useState("");
  const [varianceExplanation, setVarianceExplanation] = useState("");
  const [varianceEvidence, setVarianceEvidence] = useState<File | null>(null);
  const [isSubmittingVariance, setIsSubmittingVariance] = useState(false);
  const canReviewVariance = canReviewInventoryVariance(user?.role);
  const [pendingVariances, setPendingVariances] = useState<Array<{
    id: string;
    inventory_item_id: string;
    item_name: string;
    item_sku: string;
    item_unit: string;
    current_stock: string | number;
    reported_by_name: string;
    reported_by_role: string;
    reason: string;
    quantity: string | number;
    explanation: string;
    evidence_pathname: string | null;
    status: "pending" | "approved" | "rejected";
    created_at: string;
    reviewed_by_name?: string | null;
    reviewer_notes?: string | null;
    reviewed_at?: string | null;
  }>>([]);
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [selectedVariance, setSelectedVariance] = useState<{
    id: string;
    inventory_item_id: string;
    item_name: string;
    item_sku: string;
    item_unit: string;
    current_stock: string | number;
    reported_by_name: string;
    reported_by_role: string;
    reason: string;
    quantity: string | number;
    explanation: string;
    evidence_pathname: string | null;
    status: "pending" | "approved" | "rejected";
    created_at: string;
    reviewed_by_name?: string | null;
    reviewer_notes?: string | null;
    reviewed_at?: string | null;
  } | null>(null);
  const [varianceReviewNotes, setVarianceReviewNotes] = useState("");
  const [isProcessingVarianceAction, setIsProcessingVarianceAction] = useState(false);
  const [topUpItem, setTopUpItem] = useState<InventoryItem | null>(null);
  const [topUpQuantity, setTopUpQuantity] = useState("");
  const [topUpReason, setTopUpReason] = useState("");
  const [topUpPurchasePackagingPrice, setTopUpPurchasePackagingPrice] = useState("");
  const [isSubmittingTopUp, setIsSubmittingTopUp] = useState(false);
  const [topUpHistoryItem, setTopUpHistoryItem] = useState<InventoryItem | null>(null);
  const [topUpHistory, setTopUpHistory] = useState<Array<{ id: string; quantity_before: string | number; quantity_added: string | number; quantity_after: string | number; performed_at: string; performed_by?: string | null; performed_by_name?: string | null; performed_by_role?: string | null; reason?: string | null; correlation_id?: string | null; idempotency_key?: string | null; purchase_packaging_price_before?: string | number | null; purchase_packaging_price_after?: string | number | null }>>([]);
  const [isLoadingTopUpHistory, setIsLoadingTopUpHistory] = useState(false);
  const summary = useMemo(() => {
    const categories: Record<string, number> = {};
    for (const item of items) categories[item.category] = (categories[item.category] ?? 0) + 1;
    return {
      totalItems: items.length,
      lowStockItems: items.filter((item) => Number.parseFloat(item.quantity) <= Number.parseFloat(item.reorderLevel)).length,
      totalValue: items.reduce((total, item) => total + Number.parseFloat(item.cost || "0"), 0),
      categories,
    };
  }, [items]);
  const [hotelActivityCount, setHotelActivityCount] = useState(0);
  const [restockLogs, setRestockLogs] = useState<Array<{ id: string; details: { actor?: { email?: string; role?: string }; item?: { name?: string; category?: string }; quantityBefore?: number; quantityAdded?: number; quantityAfter?: number; unit?: string; supplier?: string; staffId?: string; staffRole?: string; reason?: string | null; correlationId?: string; idempotencyKey?: string }; created_at: string }>>([]);
  const [nameSuggestions, setNameSuggestions] = useState<InventoryItem[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [inventoryLoadError, setInventoryLoadError] = useState<string | null>(null);
  const [isLoadingInventory, setIsLoadingInventory] = useState(true);

  useEffect(() => {
    fetch("/api/inventory/restocks")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!data?.logs) return;
        setRestockLogs(data.logs.map((event: { id: string; inventory_item_id: string; quantity_before: number; quantity_added: number; quantity_after: number; user_id?: string; staff_name?: string; staff_role?: string; created_at: string; name?: string; category?: string; unit?: string; supplier?: string; reason?: string | null; correlation_id?: string; idempotency_key?: string; }) => ({
          id: event.id,
          created_at: event.created_at,
          details: {
            actor: { email: event.staff_name, role: event.staff_role },
            item: { name: event.name, category: event.category },
            quantityBefore: event.quantity_before,
            quantityAdded: event.quantity_added,
            quantityAfter: event.quantity_after,
            unit: event.unit,
            supplier: event.supplier,
            staffId: event.user_id,
            staffRole: event.staff_role,
            reason: event.reason,
            correlationId: event.correlation_id,
            idempotencyKey: event.idempotency_key,
          },
        })));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const query = editingItem?.name.trim() ?? "";
    if (!isDialogOpen || !isNewItem || query.length < 2) {
      setNameSuggestions([]);
      setIsLoadingSuggestions(false);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsLoadingSuggestions(true);
      try {
        const response = await fetch(`/api/inventory/suggestions?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const data = response.ok ? await response.json() : { suggestions: [] };
        setNameSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setNameSuggestions([]);
      } finally {
        setIsLoadingSuggestions(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [editingItem?.name, isDialogOpen, isNewItem]);

  const loadInventory = useCallback(async () => {
    setIsLoadingInventory(true);
    setInventoryLoadError(null);
    try {
      const response = await fetch("/api/inventory", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error(payload?.error || "Inventory could not be loaded.");
      }
      setItems(payload);
      setOfflineInventory(payload);
    } catch (error) {
      const cached = getOfflineInventory<InventoryItem>();
      if (Array.isArray(cached) && cached.length > 0) {
        setItems(cached);
        setInventoryLoadError(null);
      } else {
        setInventoryLoadError(error instanceof Error ? error.message : "Inventory could not be loaded.");
      }
    } finally {
      setIsLoadingInventory(false);
    }
  }, []);

  // Load inventory items on component mount
  useEffect(() => {
    void loadInventory();
    fetch("/api/hotel-activity?limit=100")
      .then((response) => response.ok ? response.json() : [])
      .then((events) => setHotelActivityCount(Array.isArray(events) ? events.length : 0))
      .catch(() => setHotelActivityCount(0));
  }, []);

  const loadPendingVariances = useCallback(async () => {
    if (!canReviewVariance) return;
    try {
      const res = await fetch("/api/inventory/variance?status=pending");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        setPendingVariances(data);
      }
    } catch {
      // offline or silent fail
    }
  }, [canReviewVariance]);

  useEffect(() => {
    if (canReviewVariance) {
      void loadPendingVariances();
    }
  }, [canReviewVariance, loadPendingVariances]);

  const { lastEvent } = useRealtime();
  useEffect(() => {
    if (lastEvent?.topic === "inventory.updated" || lastEvent?.topic === "notifications.updated") {
      void loadInventory();
      if (canReviewVariance) {
        void loadPendingVariances();
      }
    }
  }, [lastEvent, loadInventory, canReviewVariance, loadPendingVariances]);

  const handleVarianceAction = async (action: "approve" | "reject") => {
    if (!selectedVariance) return;
    setIsProcessingVarianceAction(true);
    try {
      const response = await fetch(`/api/inventory/variance/${selectedVariance.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, notes: varianceReviewNotes.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Failed to ${action} variance`);
      toast({
        title: action === "approve" ? "Stock Issue Approved" : "Stock Issue Rejected",
        description: action === "approve"
          ? `Approved write-off of ${selectedVariance.quantity} ${selectedVariance.item_unit} for ${selectedVariance.item_name}.`
          : `Rejected stock issue report for ${selectedVariance.item_name}.`,
      });
      setSelectedVariance(null);
      setVarianceReviewNotes("");
      setIsReviewDialogOpen(false);
      await loadInventory();
      await loadPendingVariances();
    } catch (error) {
      toast({
        title: "Action failed",
        description: error instanceof Error ? error.message : "Unable to process request",
        variant: "destructive",
      });
    } finally {
      setIsProcessingVarianceAction(false);
    }
  };

  const getStockGroupLabel = (category: string | undefined, name: string | undefined) => {
    const value = `${category ?? ""} ${name ?? ""}`.toLowerCase();
    if (/(beverage|drink|beer|wine|spirit|juice|soda|coffee|tea|ice|syrup|mixer)/.test(value)) return "3. Beverage Stock (Bar & Restaurant)";
    if (/(supply|disposable|napkin|menu|soap|sanit|foil|parchment|cling|container|dish|cleaner)/.test(value)) return "4. Restaurant Non-Food & Operations";
    return "2. Restaurant Food Stock";
  };
  const getStockGroup = (item: InventoryItem) => getStockGroupLabel(item.category, item.name);

  const isLowStock = (item: InventoryItem) => {
    return Number.parseFloat(item.quantity) <= Number.parseFloat(item.reorderLevel);
  };

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return items.filter((item) => {
      const matchesQuery = !query || [item.name, item.sku, item.category].some((value) =>
        value.toLowerCase().includes(query)
      );
      const quantity = Number.parseFloat(item.quantity);
      const matchesTab = activeTab === "all"
        || (activeTab === "low_stock" && isLowStock(item))
        || (activeTab === "active" && quantity > 0)
        || (activeTab === "inactive" && quantity <= 0)
        || (activeTab !== "low_stock" && activeTab !== "active" && activeTab !== "inactive" && item.category === activeTab);

      return matchesQuery && matchesTab;
    });
  }, [activeTab, items, searchQuery]);

  const groupedInventoryItems = useMemo(
    () => [...filteredItems].sort((a, b) => getStockGroup(a).localeCompare(getStockGroup(b)) || a.name.localeCompare(b.name)),
    [filteredItems]
  );

  const selectedCategory = ["ingredient", "beverage", "supply"].includes(activeTab) ? activeTab : null;
  const selectedCategoryItems = selectedCategory ? filteredItems : [];
  const selectedCategoryLabel = selectedCategory === "ingredient" ? "Ingredients" : selectedCategory === "beverage" ? "Beverages" : "Supplies";

  const handlePrintInventory = () => {
    if (!canPrintInventory || isPrintingInventory) return;

    const printWindow = window.open("", "inventory-print", "width=480,height=760");
    if (!printWindow) {
      toast({ title: "Print dialog blocked", description: "Allow pop-ups for KumbiAPP and try again.", variant: "destructive" });
      return;
    }

    const lowStockItems = items.filter(isLowStock);
    const restockedItems = restockLogs
      .filter((log) => Number(log.details.quantityAdded ?? 0) > 0)
      .slice(0, 20);
    const restockedNames = new Set(restockedItems.map((log) => log.details.item?.name?.toLowerCase()));
    const lines = [
      ...lowStockItems
        .filter((item) => !restockedNames.has(item.name.toLowerCase()))
        .map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>RESTOCK</td><td>${Number(item.quantity) || 0} ${escapeHtml(item.unit || "units")}</td></tr>`),
      ...restockedItems.map((log) => `<tr><td>${escapeHtml(log.details.item?.name || "Inventory item")}</td><td>RESTOCKED +${Number(log.details.quantityAdded) || 0}</td><td>${Number(log.details.quantityAfter) || 0} ${escapeHtml(log.details.unit || "units")}</td></tr>`),
    ].join("");
    const generatedAt = new Date().toLocaleString();

    printWindow.document.open();
    printWindow.document.write(`<!doctype html><html><head><title>Inventory Restock List</title><style>
      @page { size: 80mm auto; margin: 4mm; }
      * { box-sizing: border-box; } body { margin: 0; color: #111; font: 12px/1.4 Arial, sans-serif; }
      h1 { margin: 0 0 4px; font-size: 16px; text-align: center; } p { margin: 2px 0 10px; text-align: center; }
      table { width: 100%; border-collapse: collapse; } th, td { padding: 4px 0; text-align: left; vertical-align: top; border-bottom: 1px dashed #777; }
      th { font-size: 10px; text-transform: uppercase; } th:last-child, td:last-child { text-align: right; }
      .empty { padding: 18px 0; text-align: center; } .footer { margin-top: 10px; text-align: center; font-size: 10px; }
    </style></head><body><h1>Inventory Restock List</h1><p>${escapeHtml(generatedAt)}</p>${lines ? `<table><thead><tr><th>Item</th><th>Status</th><th>Units left</th></tr></thead><tbody>${lines}</tbody></table>` : '<div class="empty">No low-stock or recently restocked items.</div>'}<div class="footer">Kumbisaly Heritage Hotel And Restaurant</div></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => {
      printWindow.print();
      printWindow.addEventListener("afterprint", () => printWindow.close(), { once: true });
    }, 150);
    toast({ title: "Print dialog ready", description: `${lowStockItems.length + restockedItems.length} inventory records prepared.` });
  };

  const handleAddItem = () => {
  const draft: InventoryItem = {
    id: "",
      name: "",
      sku: "",
      category: "ingredient",
      quantity: "0",
      unit: "kg",
      containerUnit: "crate",
      quantityPerContainer: "1",
      containerCount: "0",
      costPerContainer: "0",
      costPerItem: "0",
      reorderLevel: "5",
      cost: "0",
      supplier: "",
      baseUnit: getInventoryBaseUnit("kg") || undefined,
      recipeUnit: "g",
      conversionRatio: "1000",
      chefYieldPerStockUnit: "",
      conversionType: "standard",
      densityGPerMl: "",
      lastUpdated: new Date().toISOString(),
    };
    setEditingItem(draft);
    setOriginalEditingItem(draft);
    setEditorErrors({});
    setIsNewItem(true);
    setIsDialogOpen(true);
  };

  const handleEditItem = (item: InventoryItem) => {
    try {
      if (!item || !item.id) {
        throw new Error("Invalid item data");
      }

      // Create a clean copy with defaults to ensure data integrity
      const itemToEdit: InventoryItem = {
        id: item.id,
        name: item.name || "",
        sku: item.sku || "",
        category: item.category || "ingredient",
        quantity: item.quantity?.toString() || "0",
        unit: item.unit || "units",
        containerUnit: item.containerUnit || "",
        quantityPerContainer: item.quantityPerContainer?.toString() || "1",
        containerCount: item.containerCount?.toString() || "0",
        costPerContainer: item.costPerContainer?.toString() || "0",
        costPerItem: item.costPerItem?.toString() || "0",
        reorderLevel: item.reorderLevel?.toString() || "0",
        cost: item.cost?.toString() || "0",
        supplier: item.supplier || "",
        baseUnit: item.baseUnit || getInventoryBaseUnit(item.unit) || undefined,
        recipeUnit: item.recipeUnit || getInventoryBaseUnit(item.unit) || item.unit,
        conversionRatio: item.conversionRatio?.toString() || "1",
        chefYieldPerStockUnit: item.chefYieldPerStockUnit?.toString() || "",
        conversionType: item.conversionType || "standard",
        densityGPerMl: item.densityGPerMl?.toString() || "",
        lastUpdated: item.lastUpdated || new Date().toISOString(),
      };

      setEditingItem(itemToEdit);
      setOriginalEditingItem(itemToEdit);
      setEditorErrors({});
      setIsNewItem(false);
      setIsDialogOpen(true);
    } catch (error) {
      console.error("Failed to prepare item for editing:", error);
      toast({
        title: "Error",
        description: "Failed to load item details. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (confirm("Are you sure you want to delete this item?")) {
      const success = await deleteInventoryItem(id);
      if (success) {
        setItems(items.filter((item) => item.id !== id));
        toast({
          title: "Item Deleted",
          description: "Inventory item has been removed",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to delete item",
          variant: "destructive",
        });
      }
    }
  };

  // Maps a save failure to a clear reason plus a concrete next step, since
  // the API returns a specific cause (validation, auth, not found, server).
  const describeSaveError = (error: unknown): { reason: string; solution: string } => {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Could not reach the server")) {
      return {
        reason: "The request never reached the server.",
        solution: "Check your internet connection and try saving again.",
      };
    }
    if (/^Unauthorized$/i.test(message)) {
      return {
        reason: "Your session has expired.",
        solution: "Sign in again, then retry saving this item.",
      };
    }
    if (/^Forbidden/i.test(message)) {
      return {
        reason: "Your account role does not have permission to change inventory.",
        solution: "Ask an admin to make this change, or request access.",
      };
    }
    if (/not found/i.test(message)) {
      return {
        reason: "This item no longer exists — it may have been deleted elsewhere.",
        solution: "Close this dialog and refresh the inventory list.",
      };
    }
    if (/status 5\d\d/.test(message) || /Failed to (upsert|update) inventory/i.test(message)) {
      return {
        reason: "The server ran into an unexpected problem saving this item.",
        solution: "Wait a moment and try again. If it keeps happening, contact support.",
      };
    }
    // Validation errors (invalid unit, non-numeric field, missing name, etc.)
    // already come through as a specific, human-readable message from the API.
    return {
      reason: message,
      solution: "Correct the highlighted value and try saving again.",
    };
  };

  const handleEditorOpenChange = (open: boolean) => {
    if (!open && !isSavingItem && getEditorComparable(editingItem) !== getEditorComparable(originalEditingItem)) {
      if (!window.confirm("Discard your unsaved inventory changes?")) return;
    }
    setIsDialogOpen(open);
    if (!open) {
      setEditingItem(null);
      setOriginalEditingItem(null);
      setEditorErrors({});
    }
  };

  const handleSaveItem = async () => {
    if (!editingItem) return;
    const nextErrors: Record<string, string> = {};
    const quantity = Number(editingItem.quantity);
    const cost = Number(editingItem.cost);
    const reorderLevel = Number(editingItem.reorderLevel);
    const quantityPerContainer = Number(editingItem.quantityPerContainer || 0);
    const containerCount = Number(editingItem.containerCount || 0);
    const costPerContainer = Number(editingItem.costPerContainer || 0);
    const conversionRatio = Number(editingItem.conversionRatio || 0);
    const chefYieldPerStockUnit = editingItem.chefYieldPerStockUnit === "" ? null : Number(editingItem.chefYieldPerStockUnit || 0);
    if (!editingItem.name.trim()) nextErrors.name = "Name is required.";
    if (!editingItem.sku.trim()) nextErrors.sku = "SKU is required.";
    if (!Number.isFinite(quantity) || quantity < 0) nextErrors.quantity = "Enter a quantity of 0 or greater.";
    if (!Number.isFinite(cost) || cost < 0) nextErrors.cost = "Enter a cost of 0 or greater.";
    if (!Number.isFinite(reorderLevel) || reorderLevel < 0) nextErrors.reorderLevel = "Enter a reorder level of 0 or greater.";
    if (editingItem.containerUnit && (!Number.isFinite(quantityPerContainer) || quantityPerContainer <= 0)) nextErrors.quantityPerContainer = "Items per container must be greater than zero.";
    if (!Number.isFinite(containerCount) || containerCount < 0) nextErrors.containerCount = "Container count must be 0 or greater.";
    if (!Number.isFinite(costPerContainer) || costPerContainer < 0) nextErrors.costPerContainer = "Cost per container must be 0 or greater.";
    const stockUnit = editingItem.containerUnit || editingItem.unit;
    const hasChefYield = editingItem.chefYieldPerStockUnit !== "" && Boolean(editingItem.recipeUnit);
    if (!hasChefYield && (!Number.isFinite(conversionRatio) || conversionRatio <= 0)) nextErrors.conversionRatio = "Conversion ratio must be greater than zero.";
    if (hasChefYield && (!Number.isFinite(chefYieldPerStockUnit) || Number(chefYieldPerStockUnit) <= 0)) nextErrors.chefYieldPerStockUnit = "Chef yield must be greater than zero.";
    const compatibilityError = getInventoryUnitCompatibilityError(editingItem.recipeUnit, stockUnit, editingItem.densityGPerMl ? Number(editingItem.densityGPerMl) : null);
    if (compatibilityError && !hasChefYield) nextErrors.conversionRatio = compatibilityError;
    setEditorErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      toast({ title: "Check the highlighted fields", description: "Correct the inventory details before saving.", variant: "destructive" });
      return;
    }


    setIsSavingItem(true);
    try {
      if (isNewItem) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, ...newItemData } = editingItem;
        const itemToCreate = {
          ...newItemData,
          name: editingItem.name.trim(),
          sku: editingItem.sku.trim(),
          quantity: quantity.toString(),
          cost: cost.toString(),
          reorderLevel: reorderLevel.toString(),
          lastUpdated: new Date().toISOString(),
        };
        const savedItem = await createInventoryItem(itemToCreate);
        setItems([...items, savedItem]);
        toast({
          title: "Item Added",
          description: `${savedItem.name} has been added to inventory`,
        });
        setIsDialogOpen(false);
      } else {
        const updatedItem = {
          ...editingItem,
          lastUpdated: new Date().toISOString(),
        };
        const savedItem = await updateInventoryItem(updatedItem);
        setItems(
          items.map((item) =>
            item.id === editingItem.id ? savedItem : item
          )
        );
        toast({
          title: "Item Updated",
          description: `${editingItem.name} has been updated`,
        });
        setIsDialogOpen(false);
      }
    } catch (error) {
      console.error("Failed to save inventory item:", error);
      const { reason, solution } = describeSaveError(error);
      toast({
        title: "Unable to save item",
        description: `${reason} ${solution}`,
        variant: "destructive",
      });
    } finally {
      setIsSavingItem(false);
    }
  };

  const handleSubmitVariance = async () => {
    if (!varianceItem || !varianceQuantity || !varianceExplanation.trim() || !varianceEvidence) {
      toast({ title: "Evidence required", description: "Select a quantity, reason, explanation, and photo.", variant: "destructive" });
      return;
    }
    setIsSubmittingVariance(true);
    try {
      const form = new FormData();
      form.append("inventoryItemId", varianceItem.id);
      form.append("quantity", varianceQuantity);
      form.append("reason", varianceReason);
      form.append("explanation", varianceExplanation.trim());
      form.append("evidence", varianceEvidence);
      const response = await fetch("/api/inventory/variance", { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to submit report");
      toast({ title: "Variance submitted", description: "A manager must review the stock issue before any adjustment is applied." });
      setVarianceItem(null);
      setVarianceQuantity("");
      setVarianceExplanation("");
      setVarianceEvidence(null);
      if (canReviewVariance) {
        void loadPendingVariances();
      }
    } catch (error) {
      toast({ title: "Submission failed", description: error instanceof Error ? error.message : "Unable to submit report", variant: "destructive" });
    } finally {
      setIsSubmittingVariance(false);
    }
  };

  const handleExport = () => {
    try {
      if (exportInventoryData) {
        exportInventoryData();
        return;
      }

      // Fallback export if helper not available
      const csvContent = [
        [
          "Name",
          "SKU",
          "Category",
          "Quantity",
          "Unit",
          "Reorder Level",
          "Cost",
          "Supplier",
          "Last Updated",
        ],
        ...items.map((item) => [
          item.name,
          item.sku,
          item.category,
          item.quantity,
          item.unit,
          item.reorderLevel,
          item.cost,
          item.supplier || "",
          item.lastUpdated
            ? new Date(item.lastUpdated).toLocaleDateString()
            : "",
        ]),
      ]
        .map((row) => row.join(","))
        .join("\n");

      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `inventory-export-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Export Successful",
        description: "Inventory data has been exported",
      });
    } catch {
      toast({
        title: "Export Failed",
        description: "Failed to export inventory data",
        variant: "destructive",
      });
    }
  };

  const handleExportRestockHistory = () => {
    if (restockLogs.length === 0) {
      toast({ title: "No restock history", description: "There are no restock records to download." });
      return;
    }

    const rows = restockLogs.map((log) => ({
      Item: log.details.item?.name || "Inventory item",
      Category: log.details.item?.category || "Inventory",
      "Quantity Before": log.details.quantityBefore ?? 0,
      "Quantity Added": log.details.quantityAdded ?? 0,
      "Quantity After": log.details.quantityAfter ?? 0,
      Unit: log.details.unit || "units",
      Supplier: log.details.supplier || "",
      "Recorded At": new Date(log.created_at).toLocaleString(),
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet["!cols"] = [
      { wch: 28 }, { wch: 16 }, { wch: 18 }, { wch: 16 },
      { wch: 17 }, { wch: 12 }, { wch: 24 }, { wch: 24 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Restock History");
    XLSX.writeFile(workbook, `restock-history-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast({ title: "Excel download started", description: `${rows.length} restock records exported.` });
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "ingredient":
        return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-700";
      case "beverage":
        return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-700";
      case "supply":
        return "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-700";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-700";
    }
  };

  const openTopUpHistory = async (item: InventoryItem) => {
    setTopUpHistoryItem(item);
    setIsLoadingTopUpHistory(true);
    try {
      const response = await fetch(`/api/inventory/${item.id}/top-up?limit=100`);
      if (!response.ok) throw new Error("Unable to load top-up history");
      setTopUpHistory(await response.json());
    } catch (error) {
      setTopUpHistory([]);
      toast({ title: "History unavailable", description: error instanceof Error ? error.message : "Unable to load top-up history.", variant: "destructive" });
    } finally { setIsLoadingTopUpHistory(false); }
  };

  const handleTopUp = async () => {
    if (!topUpItem) return;
    const quantity = Number(topUpQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast({ title: "Invalid quantity", description: "Enter a positive top-up quantity.", variant: "destructive" });
      return;
    }
    setIsSubmittingTopUp(true);
    try {
      const response = await fetch(`/api/inventory/${topUpItem.id}/top-up`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ quantityAdded: quantity, reason: topUpReason, purchasePackagingPrice: topUpPurchasePackagingPrice === "" ? undefined : Number(topUpPurchasePackagingPrice) }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to top up stock");
      const updated = result.item;
      setItems((current) => current.map((item) => item.id === topUpItem.id ? { ...item, quantity: String(updated.quantity), lastUpdated: new Date().toISOString() } : item));
      toast({ title: "Stock topped up", description: `${topUpItem.name} is now at ${updated.quantity} ${topUpItem.unit}.` });
      setTopUpItem(null); setTopUpQuantity(""); setTopUpReason(""); setTopUpPurchasePackagingPrice("");
    } catch (error) {
      toast({ title: "Top-up failed", description: error instanceof Error ? error.message : "Unable to top up stock.", variant: "destructive" });
    } finally { setIsSubmittingTopUp(false); }
  };

  const lowStockCount = items.filter(isLowStock).length;

  return (
    <div className="flex min-h-screen w-full flex-col bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950">
      <header className="sticky top-0 z-10 border-b border-orange-200 bg-white px-3 py-2 dark:border-orange-700 dark:bg-gray-900 sm:px-4 md:px-6">
        <div className="flex min-h-10 min-w-0 flex-wrap items-center gap-2 sm:gap-3">
          <Link
            href="/"
            aria-label="Back to dashboard"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-orange-600 outline-none transition-colors hover:bg-orange-50 focus-visible:ring-2 focus-visible:ring-orange-500 dark:text-orange-400 dark:hover:bg-orange-950/40"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <LogoDisplay size="sm" />
            <Package className="h-6 w-6 shrink-0 text-orange-600 dark:text-orange-400" />
            <h1 className="min-w-0 truncate text-base font-semibold text-gray-800 dark:text-gray-200 sm:text-lg">
              Inventory Management
            </h1>
          </div>
        </div>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          {lowStockCount > 0 && (
            <Badge
              variant="destructive"
              className="rounded-full animate-pulse bg-red-500 hover:bg-red-600 text-white"
            >
              <AlertTriangle className="mr-1 h-3 w-3" />
              {lowStockCount} Low Stock
            </Badge>
          )}
          {canPrintInventory && (
            <Button
              variant="outline"
              onClick={handlePrintInventory}
              disabled={isPrintingInventory}
              className="rounded-2xl border-blue-200 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-700 dark:text-blue-300 disabled:opacity-50"
              title="Print low-stock and recent restocked items to thermal printer"
            >
              {isPrintingInventory ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Printer className="mr-2 h-4 w-4" />
              )}
              {isPrintingInventory ? "Printing..." : "Print"}
            </Button>
          )}
          {canReviewVariance && (
            <Button
              variant={pendingVariances.length > 0 ? "default" : "outline"}
              onClick={() => {
                setSelectedVariance(null);
                setVarianceReviewNotes("");
                setIsReviewDialogOpen(true);
              }}
              className={`rounded-2xl relative ${
                pendingVariances.length > 0
                  ? "bg-rose-600 hover:bg-rose-700 text-white shadow-md animate-pulse"
                  : "border-rose-200 dark:border-rose-700 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-700 dark:text-rose-300"
              }`}
              title="Review stock issues submitted by staff"
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              <span>Stock Issues</span>
              {pendingVariances.length > 0 && (
                <Badge className="ml-2 bg-white text-rose-700 font-bold px-1.5 py-0.5 rounded-full text-xs">
                  {pendingVariances.length}
                </Badge>
              )}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleExport}
            className="rounded-2xl border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300"
          >
            <Save className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button
            onClick={handleAddItem}
            className="relative min-h-11 rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 text-white shadow-lg transition-colors hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600"
          >
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-orange-400/20 via-amber-400/20 to-yellow-400/20 sm:block"></div>
            <Plus className="mr-2 h-4 w-4 relative z-10" />
            <span className="relative z-10">Add Item</span>
          </Button>
        </div>
      </header>

      <main className="flex min-w-0 flex-1 flex-col overflow-x-hidden bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 p-3 dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950 sm:p-4 md:p-6">
          {inventoryLoadError && (
            <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <span>Inventory could not be loaded: {inventoryLoadError}</span>
              <Button size="sm" variant="outline" onClick={() => void loadInventory()} disabled={isLoadingInventory}>
                {isLoadingInventory ? "Retrying…" : "Retry"}
              </Button>
            </div>
          )}
          {isLoadingInventory && !inventoryLoadError && (
            <div role="status" className="mb-4 rounded-2xl border border-orange-200 bg-background px-4 py-3 text-sm text-muted-foreground">Loading inventory…</div>
          )}
        {selectedCategory && (
          <Card className="mb-6 border-orange-200 bg-orange-50/70 shadow-sm dark:border-orange-800 dark:bg-orange-950/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-orange-900 dark:text-orange-100">Select {selectedCategoryLabel}</CardTitle>
              <p className="text-sm text-muted-foreground">Search and select from every {selectedCategory} currently in inventory.</p>
            </CardHeader>
            <CardContent>
              <div className="max-h-56 overflow-y-auto rounded-xl border border-orange-200 bg-background/70 p-2 dark:border-orange-800">
                {selectedCategoryItems.length > 0 ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{selectedCategoryItems.map((item) => <button key={item.id} type="button" onClick={() => handleEditItem(item)} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-transparent bg-background px-3 py-2 text-left transition-colors hover:border-orange-300 hover:bg-orange-50 dark:hover:border-orange-700 dark:hover:bg-orange-950/30"><span className="min-w-0 truncate font-medium">{item.name}</span><span className="shrink-0 text-xs text-muted-foreground">{item.quantity} {item.unit}</span></button>)}</div> : <p className="p-4 text-center text-sm text-muted-foreground">No {selectedCategory} match your search.</p>}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="mb-5 grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-5">
          <Card className="bg-white/70 dark:bg-gray-800/70 border border-orange-200 dark:border-orange-700 rounded-2xl shadow-md relative overflow-hidden sm:rounded-3xl sm:backdrop-blur-sm">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-100/20 via-cyan-100/20 to-teal-100/20 dark:from-blue-900/20 dark:via-cyan-900/20 dark:to-teal-900/20"></div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Total Items
              </CardTitle>
              <Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                {summary.totalItems}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white/70 dark:bg-gray-800/70 border border-orange-200 dark:border-orange-700 rounded-2xl shadow-md relative overflow-hidden sm:rounded-3xl sm:backdrop-blur-sm">
            <div className="absolute inset-0 bg-gradient-to-br from-red-100/20 via-pink-100/20 to-rose-100/20 dark:from-red-900/20 dark:via-pink-900/20 dark:to-rose-900/20"></div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Low Stock
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-2xl font-bold text-red-700 dark:text-red-300">
                {summary.lowStockItems}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white/70 dark:bg-gray-800/70 border border-orange-200 dark:border-orange-700 rounded-2xl shadow-md relative overflow-hidden sm:rounded-3xl sm:backdrop-blur-sm">
            <div className="absolute inset-0 bg-gradient-to-br from-green-100/20 via-emerald-100/20 to-lime-100/20 dark:from-green-900/20 dark:via-emerald-900/20 dark:to-lime-900/20"></div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Total Value
              </CardTitle>
              <TrendingDown className="h-4 w-4 text-green-600 dark:text-green-400" />
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                ₵{summary.totalValue.toFixed(2)}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white/70 dark:bg-gray-800/70 border border-orange-200 dark:border-orange-700 rounded-2xl shadow-md relative overflow-hidden sm:rounded-3xl sm:backdrop-blur-sm">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-100/20 via-violet-100/20 to-indigo-100/20 dark:from-purple-900/20 dark:via-violet-900/20 dark:to-indigo-900/20"></div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Categories
              </CardTitle>
              <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                {Object.keys(summary.categories).length}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white/70 dark:bg-gray-800/70 border border-orange-200 dark:border-orange-700 rounded-2xl shadow-md relative overflow-hidden sm:rounded-3xl sm:backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Hotel Activity</CardTitle>
              <Building2 className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">{hotelActivityCount}</div>
              <p className="text-xs text-orange-600 dark:text-orange-400">Events tracked</p>
            </CardContent>
          </Card>
        </div>

        <Card className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-orange-200 bg-white/70 shadow-md dark:border-orange-700 dark:bg-gray-800/70 sm:rounded-3xl sm:backdrop-blur-sm">
          <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
          <CardHeader className="relative z-10">
            <CardTitle className="text-gray-800 dark:text-gray-200">
              Inventory Items
            </CardTitle>
            <p className="text-sm text-muted-foreground">Search, filter, and manage current stock.</p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search inventory items..."
                  aria-label="Search inventory items"
                  className="min-h-11 rounded-2xl border-orange-200 bg-white/50 pl-8 dark:border-orange-700 dark:bg-gray-800/50"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={activeTab} onValueChange={setActiveTab}>
                <SelectTrigger className="w-full rounded-2xl border-orange-200 bg-white/50 dark:border-orange-700 dark:bg-gray-800/50 sm:w-48">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-orange-200 dark:border-orange-700">
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="low_stock">Low Stock Only ({summary.lowStockItems})</SelectItem>
                  <SelectItem value="active">Active Stock</SelectItem>
                  <SelectItem value="inactive">Inactive (Out of Stock)</SelectItem>
                  <SelectItem value="ingredient">Ingredients</SelectItem>
                  <SelectItem value="beverage">Beverages</SelectItem>
                  <SelectItem value="supply">Supplies</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant={activeTab === "low_stock" ? "default" : "outline"}
                onClick={() => setActiveTab((prev) => (prev === "low_stock" ? "all" : "low_stock"))}
                className={`min-h-11 rounded-2xl ${
                  activeTab === "low_stock"
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/30"
                }`}
              >
                <AlertTriangle className="mr-1.5 h-4 w-4" />
                Low Stock ({summary.lowStockItems})
              </Button>
            </div>
          </CardHeader>
          <CardContent className="relative z-10 p-0">
            <ScrollArea className="h-[min(62vh,42rem)] min-h-[20rem] sm:h-[calc(100vh-400px)]">
              <div className="p-3 pt-0 sm:p-6 sm:pt-0">
                <div className="space-y-2">
                  {groupedInventoryItems.map((item, index) => {
                    const stockGroup = getStockGroup(item);
                    const previousGroup = index > 0 ? getStockGroup(groupedInventoryItems[index - 1]) : null;
                    return (
                      <div key={item.id}>
                        {stockGroup !== previousGroup && (
                          <div className="mt-5 border-b border-orange-200 pb-2 text-sm font-bold text-orange-800 first:mt-0 dark:border-orange-800 dark:text-orange-300">
                            {stockGroup}
                          </div>
                        )}
                    <div
                      key={`${item.id}-row`}
                      className={`grid min-w-0 grid-cols-1 gap-2 rounded-xl border bg-white/50 p-2 transition-colors hover:bg-orange-50 dark:bg-gray-800/50 dark:hover:bg-orange-900/10 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3 sm:p-3 ${
                        isLowStock(item)
                          ? "border-red-400 dark:border-red-600 animate-pulse"
                          : "border-orange-100 dark:border-orange-800"
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                        <div
                          className={`shrink-0 rounded-lg p-2 ${getCategoryColor(
                            item.category
                          )}`}
                        >
                          <Package className="h-4 w-4" />
                        </div>
                        <div>
  <h3 className="flex min-w-0 items-center gap-2 truncate text-sm font-semibold text-gray-800 dark:text-gray-200 sm:text-base">
  {item.conversionRuleMissing && <span className="size-2 shrink-0 rounded-full bg-destructive" title="Conversion rule required before stock can be migrated" aria-label="Conversion rule required" />}
  <span className="truncate">{item.name}</span>
  </h3>
                          <div className="flex min-w-0 flex-wrap gap-x-1.5 gap-y-0 text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
                            <span className="font-mono">{item.sku}</span>
                            <span>•</span>
                            <span className="capitalize">{item.category}</span>
                            {item.supplier && (
                              <>
                                <span>•</span>
                                <span>{item.supplier}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:shrink-0 sm:justify-end sm:gap-4">
                        <div className="text-left sm:text-right">
                          <div
                            className={`flex items-center justify-end gap-1 text-sm font-bold sm:text-base ${
                              isLowStock(item)
                                ? "text-red-600 dark:text-red-400"
                                : "text-gray-800 dark:text-gray-200"
                            }`}
                          >
                            {isLowStock(item) && (
                              <AlertTriangle
                                className="h-4 w-4"
                                aria-label="Low stock"
                              />
                            )}
                            <span>{item.quantity} {item.unit}</span>
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            ₵{Number.parseFloat(item.cost).toFixed(2)}
                          </div>
                        </div>
  <Button variant="ghost" size="icon" title="Report stock issue" aria-label={`Report stock issue for ${item.name}`} onClick={() => setVarianceItem(item)} className="h-8 w-8 justify-self-end text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/20 sm:justify-self-auto">
  <AlertTriangle className="h-4 w-4" />
  </Button>
  {canTopUpStock && <Button variant="ghost" size="icon" title="Top up stock" aria-label={`Top up ${item.name}`} onClick={() => setTopUpItem(item)} className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"><Plus className="h-4 w-4" /></Button>}
  <Button variant="ghost" size="icon" title="View top-up history" aria-label={`View top-up history for ${item.name}`} onClick={() => openTopUpHistory(item)} className="h-8 w-8 text-slate-600 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><TrendingDown className="h-4 w-4 rotate-180" /></Button>
  {canMutateExistingInventory && <div className="flex gap-2">
  <Button
  variant="ghost"
  size="icon"
  title={`Edit ${item.name}`}
  aria-label={`Edit ${item.name}`}
  onClick={() => handleEditItem(item)}
                            className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={`Delete ${item.name}`}
                            aria-label={`Delete ${item.name}`}
                            onClick={() => handleDeleteItem(item.id)}
                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                          >
                            <Trash className="h-4 w-4" />
  </Button>
  </div>}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {groupedInventoryItems.length === 0 && (
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                      <Package className="h-12 w-12 mx-auto mb-4 opacity-20" />
                      <p>No inventory items found</p>
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {restockLogs.length > 0 && (
          <Card className="mt-6 border-orange-200 bg-white/70 shadow-xl dark:border-orange-700 dark:bg-gray-800/70">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-lg">
                <span>Restock History</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Authorized staff only</Badge>
                  <Button type="button" variant="outline" size="sm" onClick={handleExportRestockHistory} className="border-orange-200 text-orange-700 dark:border-orange-700 dark:text-orange-300">
                    <Download className="mr-2 h-4 w-4" /> Excel
                  </Button>
                </div>
              </CardTitle>
              <p className="text-sm text-muted-foreground">Quantity snapshots recorded whenever stock increases.</p>
            </CardHeader>
            <CardContent>
              <div className="max-h-72 overflow-y-auto rounded-xl border border-orange-100 dark:border-orange-800">
                <div className="divide-y divide-orange-100 dark:divide-orange-800">
                  {restockLogs.map((log) => (
                    <div key={log.id} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{log.details.item?.name || "Inventory item"}</p>
                        <p className="text-xs text-muted-foreground">{getStockGroupLabel(log.details.item?.category, log.details.item?.name)} · {log.details.item?.category || "Inventory"} · {log.details.supplier || "No supplier recorded"} · Added by {log.details.actor?.email || "Recorded account"}</p>
                      </div>
                      <p className="text-muted-foreground">{log.details.quantityBefore ?? 0} → {log.details.quantityAfter ?? 0} {log.details.unit || "units"}</p>
                      <time className="text-xs text-muted-foreground" dateTime={log.created_at}>{new Date(log.created_at).toLocaleString()}</time>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Dialog open={Boolean(varianceItem)} onOpenChange={(open) => !open && setVarianceItem(null)}>
          <DialogContent className="max-w-lg rounded-3xl">
            <DialogHeader><DialogTitle>Report Stock Issue</DialogTitle><DialogDescription>{varianceItem?.name} will remain unchanged until a manager reviews this report.</DialogDescription></DialogHeader>
            <div className="grid gap-4 py-3">
              <div className="grid gap-2"><Label>Issue type</Label><Select value={varianceReason} onValueChange={setVarianceReason}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="expired">Expired</SelectItem><SelectItem value="empty_or_short_delivery">Empty or short delivery</SelectItem><SelectItem value="damaged">Damaged</SelectItem><SelectItem value="spoiled">Spoiled</SelectItem><SelectItem value="missing">Missing</SelectItem><SelectItem value="wastage">Production wastage</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select></div>
              <div className="grid gap-2"><Label htmlFor="variance-quantity">Affected quantity</Label><Input id="variance-quantity" type="number" min="0.01" step="0.01" value={varianceQuantity} onChange={(event) => setVarianceQuantity(event.target.value)} /></div>
              <div className="grid gap-2"><Label htmlFor="variance-explanation">Explanation</Label><Textarea id="variance-explanation" value={varianceExplanation} onChange={(event) => setVarianceExplanation(event.target.value)} placeholder="Explain what happened and where the item is physically located." /></div>
              <div className="grid gap-2"><Label htmlFor="variance-evidence">Photo evidence</Label><Input id="variance-evidence" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setVarianceEvidence(event.target.files?.[0] ?? null)} /><p className="text-xs text-muted-foreground">Required. Maximum 5MB. Evidence is stored privately for management review.</p></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setVarianceItem(null)}>Cancel</Button><Button onClick={handleSubmitVariance} disabled={isSubmittingVariance}>{isSubmittingVariance ? "Submitting..." : "Submit for review"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Manager Stock Issues Review Dialog */}
        <Dialog
          open={isReviewDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              setIsReviewDialogOpen(false);
              setSelectedVariance(null);
              setVarianceReviewNotes("");
            }
          }}
        >
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col rounded-3xl border-rose-200 dark:border-rose-900 overflow-hidden">
            <DialogHeader className="shrink-0 border-b pb-3">
              <DialogTitle className="text-lg font-bold text-rose-950 dark:text-rose-100 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-rose-600" />
                Pending Stock Issue Reports ({pendingVariances.length})
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Authorized managers review reported damages, expiry, and discrepancies to approve stock write-offs or reject.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto p-1 space-y-4">
              {pendingVariances.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <Package className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-base font-semibold text-muted-foreground">No pending stock issue reports</p>
                  <p className="text-xs text-muted-foreground/80 mt-1">
                    When staff report damaged, expired, or missing stock, reports will appear here for manager action.
                  </p>
                </div>
              ) : selectedVariance ? (
                <div className="space-y-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedVariance(null);
                      setVarianceReviewNotes("");
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground mb-1 -ml-2"
                  >
                    <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                    Back to all reports
                  </Button>

                  <div className="rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-base text-foreground">{selectedVariance.item_name}</h4>
                        <p className="text-xs text-muted-foreground">SKU: {selectedVariance.item_sku || "N/A"}</p>
                      </div>
                      <Badge variant="outline" className="capitalize border-rose-300 text-rose-700 dark:text-rose-300 font-semibold">
                        {selectedVariance.reason.replace(/_/g, " ")}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2 text-xs border-t border-rose-200/60 dark:border-rose-900/60">
                      <div>
                        <span className="text-muted-foreground">Current in Stock:</span>
                        <p className="font-semibold text-sm">{selectedVariance.current_stock} {selectedVariance.item_unit}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Reported Write-Off:</span>
                        <p className="font-semibold text-sm text-rose-600 dark:text-rose-400">
                          - {selectedVariance.quantity} {selectedVariance.item_unit}
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 text-xs border-t border-rose-200/60 dark:border-rose-900/60">
                      <span className="text-muted-foreground">Reported By:</span>
                      <p className="font-medium text-foreground">
                        {selectedVariance.reported_by_name} ({selectedVariance.reported_by_role})
                        <span className="text-muted-foreground font-normal ml-2">
                          {new Date(selectedVariance.created_at).toLocaleString()}
                        </span>
                      </p>
                    </div>

                    <div className="pt-2 text-xs border-t border-rose-200/60 dark:border-rose-900/60">
                      <span className="text-muted-foreground">Staff Explanation:</span>
                      <p className="mt-1 p-2.5 rounded-xl bg-background border text-xs text-foreground whitespace-pre-wrap">
                        {selectedVariance.explanation}
                      </p>
                    </div>

                    {selectedVariance.evidence_pathname && (
                      <div className="pt-2 text-xs border-t border-rose-200/60 dark:border-rose-900/60">
                        <span className="text-muted-foreground">Photo Evidence:</span>
                        <div className="mt-2 rounded-xl overflow-hidden border bg-background max-h-60 flex items-center justify-center">
                          <img
                            src={`/api/inventory/variance/evidence?pathname=${encodeURIComponent(selectedVariance.evidence_pathname)}`}
                            alt="Stock issue evidence"
                            className="max-h-60 w-auto object-contain"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 pt-2">
                    <Label htmlFor="review-notes" className="text-xs font-semibold">
                      Manager Review Notes (optional for approval, recommended for rejection):
                    </Label>
                    <Textarea
                      id="review-notes"
                      placeholder="Add an explanation or action details for staff records..."
                      value={varianceReviewNotes}
                      onChange={(e) => setVarianceReviewNotes(e.target.value)}
                      className="text-xs min-h-[60px]"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleVarianceAction("reject")}
                      disabled={isProcessingVarianceAction}
                      className="border-rose-300 text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    >
                      {isProcessingVarianceAction ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
                      Reject Report
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleVarianceAction("approve")}
                      disabled={isProcessingVarianceAction}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {isProcessingVarianceAction ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                      Approve & Write Off {selectedVariance.quantity} {selectedVariance.item_unit}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingVariances.map((variance) => (
                    <div
                      key={variance.id}
                      className="rounded-2xl border p-3 hover:border-rose-400 dark:hover:border-rose-700 transition-colors bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm truncate">{variance.item_name}</span>
                          <Badge variant="outline" className="text-[10px] uppercase font-semibold border-rose-300 text-rose-700">
                            {variance.reason.replace(/_/g, " ")}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            -{variance.quantity} {variance.item_unit}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {variance.explanation}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          By <span className="font-medium text-foreground">{variance.reported_by_name}</span> ({variance.reported_by_role}) · {new Date(variance.created_at).toLocaleDateString()} {new Date(variance.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedVariance(variance);
                            setVarianceReviewNotes("");
                          }}
                          className="rounded-xl border-rose-200 text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950 text-xs"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          Review & Act
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter className="shrink-0 border-t pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsReviewDialogOpen(false);
                  setSelectedVariance(null);
                  setVarianceReviewNotes("");
                }}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={handleEditorOpenChange}>
          <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-2xl flex-col overflow-hidden rounded-3xl border border-orange-200 bg-white/95 p-4 backdrop-blur-md dark:border-orange-700 dark:bg-gray-800/95 sm:max-h-[90dvh] sm:w-[calc(100vw-2rem)] sm:p-6">
            <DialogHeader>
              <DialogTitle className="text-orange-800 dark:text-orange-200">
                {isNewItem ? "Add Inventory Item" : "Edit Inventory Item"}
              </DialogTitle>
              <DialogDescription className="text-orange-600 dark:text-orange-400">
                {isNewItem
                  ? "Add a new item to your inventory."
                  : "Update the inventory item details."}
              </DialogDescription>
            </DialogHeader>

            {editingItem && (
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label
                    htmlFor="name"
                    className="text-orange-700 dark:text-orange-300"
                  >
                    Name <span aria-hidden="true">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="name"
                      required
                      aria-required="true"
                      aria-invalid={Boolean(editorErrors.name)}
                      aria-describedby={editorErrors.name ? "name-error" : undefined}
                      autoComplete="off"
                      value={editingItem.name}
                      onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                      className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400"
                    />
                    {editorErrors.name && <p id="name-error" className="text-xs text-destructive">{editorErrors.name}</p>}
                    {(isLoadingSuggestions || nameSuggestions.length > 0) && (
                      <div className="absolute z-20 mt-2 max-h-56 w-full overflow-y-auto rounded-xl border border-orange-200 bg-background p-1 shadow-lg">
                        {isLoadingSuggestions && <p className="px-3 py-2 text-sm text-muted-foreground">Searching inventory history...</p>}
                        {nameSuggestions.map((suggestion) => (
                          <button
                            key={`${suggestion.sku}-${suggestion.name}`}
                            type="button"
                            className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                            onClick={() => {
                              setEditingItem({ ...editingItem, ...suggestion, id: editingItem.id, quantity: editingItem.quantity });
                              setNameSuggestions([]);
                            }}
                          >
                            <span className="min-w-0 truncate font-medium">{suggestion.name}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">{suggestion.sku || "No SKU"} · {suggestion.category}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label
                      htmlFor="sku"
                      className="text-orange-700 dark:text-orange-300"
                    >
                      SKU
                    </Label>
                    <Input
                      id="sku"
                      required
                      aria-required="true"
                      aria-invalid={Boolean(editorErrors.sku)}
                      aria-describedby={editorErrors.sku ? "sku-error" : undefined}
                      value={editingItem.sku}
                      onChange={(e) =>
                        setEditingItem({ ...editingItem, sku: e.target.value })
                      }
                      className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400"
                    />
                    {editorErrors.sku && <p id="sku-error" className="text-xs text-destructive">{editorErrors.sku}</p>}
                  </div>
                  <div className="grid gap-2">
                    <Label
                      htmlFor="category"
                      className="text-orange-700 dark:text-orange-300"
                    >
                      Category
                    </Label>
                    <Select
                      value={editingItem.category}
                      onValueChange={(value) =>
                        setEditingItem({
                          ...editingItem,
                          category: value as
                            | "ingredient"
                            | "beverage"
                            | "supply",
                        })
                      }
                    >
                      <SelectTrigger className="rounded-2xl border-orange-200 dark:border-orange-700 bg-white/50 dark:bg-gray-800/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ingredient">Ingredient</SelectItem>
                        <SelectItem value="beverage">Beverage</SelectItem>
                        <SelectItem value="supply">Supply</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                  <div className="flex items-end text-sm text-muted-foreground">
                    Packaging cost is calculated from Cost per container.
                  </div>
                <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-3 dark:border-orange-700 dark:bg-orange-950/20">
                  <p className="mb-3 text-sm font-medium text-orange-800 dark:text-orange-200">Purchase packaging</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label htmlFor="containerUnit" className="text-orange-700 dark:text-orange-300">Container unit</Label>
                      <UnitSelect value={editingItem.containerUnit || ""} onChange={(value) => setEditingItem({ ...editingItem, containerUnit: String(value) })} placeholder="Crate, box, bag..." />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="quantityPerContainer" className="text-orange-700 dark:text-orange-300">Items per container</Label><p className="text-xs text-muted-foreground">Packaging only; does not change current stock.</p>
                      <Input id="quantityPerContainer" type="number" min="0" step="0.01" aria-invalid={Boolean(editorErrors.quantityPerContainer)} aria-describedby={editorErrors.quantityPerContainer ? "quantity-per-container-error" : undefined} value={editingItem.quantityPerContainer || ""} onChange={(e) => { const per = e.target.value; const count = Number(editingItem.containerCount || 0); const perItem = Number(editingItem.costPerContainer || 0) / Math.max(Number(per || 0), 1); const totalCost = Number(editingItem.costPerContainer || 0) * count; setEditingItem({ ...editingItem, quantityPerContainer: per, costPerItem: perItem.toFixed(2), cost: totalCost.toFixed(2) }); }} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="containerCount" className="text-orange-700 dark:text-orange-300">Container count</Label>
                      <Input id="containerCount" type="number" min="0" step="0.01" aria-invalid={Boolean(editorErrors.containerCount)} aria-describedby={editorErrors.containerCount ? "container-count-error" : undefined} value={editingItem.containerCount || ""} onChange={(e) => { const count = e.target.value; const perContainer = Number(editingItem.quantityPerContainer || 0); const perItem = Number(editingItem.costPerContainer || 0) / Math.max(perContainer, 1); const totalCost = Number(editingItem.costPerContainer || 0) * Number(count || 0); setEditingItem({ ...editingItem, containerCount: count, costPerItem: perItem.toFixed(2), cost: totalCost.toFixed(2) }); }} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="costPerContainer" className="text-orange-700 dark:text-orange-300">Cost per container (₵)</Label>
                      <Input id="costPerContainer" type="number" min="0" step="0.01" aria-invalid={Boolean(editorErrors.costPerContainer)} aria-describedby={editorErrors.costPerContainer ? "cost-per-container-error" : undefined} value={editingItem.costPerContainer || ""} onChange={(e) => { const costPerContainer = e.target.value; const perItem = Number(costPerContainer || 0) / Math.max(Number(editingItem.quantityPerContainer || 0), 1); const count = Number(editingItem.containerCount || 0); setEditingItem({ ...editingItem, costPerContainer, costPerItem: perItem.toFixed(2), cost: String(Number((perItem * Number(editingItem.quantityPerContainer || 0) * count).toFixed(2)) || 0) }); }} />
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">Total items: <strong>{editingItem.quantity || "0"} {editingItem.containerUnit || editingItem.unit || "units"}</strong> · Cost per item: <strong>₵{editingItem.costPerItem || "0"}</strong></p>
                  <p className="mt-2 rounded-xl border border-orange-200/80 bg-white/60 px-3 py-2 text-xs leading-relaxed text-orange-900 dark:border-orange-700/70 dark:bg-orange-950/20 dark:text-orange-100"><strong>Unit tip:</strong> {getUnitSelectionHint(editingItem.containerUnit || editingItem.unit)} Purchase unit is how stock arrives; choose a chef unit below based on how the item is measured in recipes.</p>
                </div>
                <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-3 dark:border-orange-700 dark:bg-orange-950/20">
                  <p className="mb-1 text-sm font-medium text-orange-800 dark:text-orange-200">How chefs use this item</p>
                  <p className="mb-3 text-xs text-muted-foreground">Stock stays in the purchase unit. Recipes and supplies use the chef-friendly unit below.</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="grid gap-2">
                      <Label htmlFor="recipeUnit" className="text-orange-700 dark:text-orange-300">Used in recipes as</Label>
                      <UnitSelect value={editingItem.recipeUnit || ""} onChange={(value) => setEditingItem({ ...editingItem, recipeUnit: String(value) })} placeholder="Grams, pieces..." />
                      <div className="rounded-xl border border-orange-200/80 bg-white/60 px-3 py-2 text-xs leading-relaxed text-orange-900 dark:border-orange-700/70 dark:bg-orange-950/20 dark:text-orange-100" aria-live="polite">
                        <p><strong>Suggested units:</strong> automatic conversions; units marked * require Chef yield.</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {getCompatibleRecipeUnits(editingItem.containerUnit || editingItem.unit).map((suggestion) => (
                            <button key={suggestion.value} type="button" className={`rounded-full border px-2.5 py-1 transition-colors ${editingItem.recipeUnit === suggestion.value ? "border-orange-600 bg-orange-100 font-semibold dark:border-orange-300 dark:bg-orange-900/50" : "border-orange-200 bg-background hover:border-orange-500 dark:border-orange-700"}`} onClick={() => setEditingItem({ ...editingItem, recipeUnit: suggestion.value })} aria-pressed={editingItem.recipeUnit === suggestion.value}>{suggestion.label}{suggestion.kind === "yield" ? "*" : ""}</button>
                          ))}
                        </div>
                        <p className="mt-2">{getUnitSelectionHint(editingItem.containerUnit || editingItem.unit)} Cross-family choices require a Chef yield.</p>
                      </div>
                      <p className="text-xs leading-relaxed text-muted-foreground">{editingItem.recipeUnit ? `Chef selected ${editingItem.recipeUnit}. Enter how many ${editingItem.recipeUnit} one ${editingItem.containerUnit || editingItem.unit || "purchase unit"} provides.` : "The suggestions update immediately when Purchase Packaging changes."}</p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="conversionRatio" className="text-orange-700 dark:text-orange-300">Base units per stock unit <span aria-hidden="true">*</span></Label>
                      <Input id="conversionRatio" type="number" min="0.000001" step="0.01" aria-invalid={Boolean(editorErrors.conversionRatio)} aria-describedby={editorErrors.conversionRatio ? "conversion-ratio-error" : undefined} value={editingItem.conversionRatio || "1"} onChange={(e) => setEditingItem({ ...editingItem, conversionRatio: e.target.value })} />
                      {editorErrors.conversionRatio && <p id="conversion-ratio-error" className="text-xs text-destructive">{editorErrors.conversionRatio}</p>}
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="chefYieldPerStockUnit" className="text-orange-700 dark:text-orange-300">Chef yield per stock unit</Label>
                      <Input id="chefYieldPerStockUnit" type="number" min="0.000001" step="0.01" placeholder="e.g. 20 slices per kg" aria-invalid={Boolean(editorErrors.chefYieldPerStockUnit)} aria-describedby="chef-yield-help" value={editingItem.chefYieldPerStockUnit || ""} onChange={(e) => setEditingItem({ ...editingItem, chefYieldPerStockUnit: e.target.value })} />
                      <p id="chef-yield-help" className="text-xs leading-relaxed text-muted-foreground">Use only when the recipe unit is not directly compatible with the purchase unit. Example: purchase <strong>{editingItem.containerUnit || editingItem.unit || "kg"}</strong> → recipe <strong>{editingItem.recipeUnit || "slice"}</strong>: enter the number of recipe units supplied by one purchase unit.</p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="conversionType" className="text-orange-700 dark:text-orange-300">Conversion setup</Label>
                      <Select value={editingItem.conversionType || "standard"} onValueChange={(value) => setEditingItem({ ...editingItem, conversionType: value as "standard" | "pack" })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="standard">Automatic</SelectItem><SelectItem value="pack">Pack / container</SelectItem></SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Example: stock unit <strong>{editingItem.containerUnit || editingItem.unit || "unit"}</strong>, recipe unit <strong>{editingItem.recipeUnit || "unit"}</strong>, ratio <strong>{editingItem.chefYieldPerStockUnit || editingItem.conversionRatio || "1"}</strong>. One {editingItem.containerUnit || editingItem.unit || "unit"} supplies that many {editingItem.recipeUnit || "recipe units"}.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label
                      htmlFor="reorderLevel"
                      aria-label="Reorder level"
                      className="text-orange-700 dark:text-orange-300"
                    >
                      Reorder Level
                    </Label>
                    <Input
                      id="reorderLevel"
                      type="number"
                      aria-invalid={Boolean(editorErrors.reorderLevel)}
                      aria-describedby={editorErrors.reorderLevel ? "reorder-level-error" : undefined}
                      value={editingItem.reorderLevel}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          reorderLevel: e.target.value,
                        })
                      }
                      className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400"
                    />
                    {editorErrors.reorderLevel && <p id="reorder-level-error" className="text-xs text-destructive">{editorErrors.reorderLevel}</p>}
                  </div>
                  <div className="grid gap-2">
                    <Label
                      htmlFor="cost"
                      className="text-orange-700 dark:text-orange-300"
                    >
                      Total packaging cost (₵)
                    </Label>
                    <Input
                      id="cost"
                      type="number"
                      value={editingItem.cost}
                      readOnly
                      aria-readonly="true"
                      className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400"
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label
                    htmlFor="supplier"
                    className="text-orange-700 dark:text-orange-300"
                  >
                    Supplier (Optional)
                  </Label>
                  <Input
                    id="supplier"
                    value={editingItem.supplier}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        supplier: e.target.value,
                      })
                    }
                    className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400"
                  />
                </div>
              </div>

              </div>
            )}

            <DialogFooter className="flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() => handleEditorOpenChange(false)}
                disabled={isSavingItem}
                className="w-full rounded-2xl border-orange-200 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-orange-900/20 sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveItem}
                disabled={isSavingItem}
                aria-busy={isSavingItem}
                className="w-full rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 text-white shadow-lg hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 sm:w-auto"
              >
                <Save className="mr-2 h-4 w-4" />
                {isSavingItem ? "Saving..." : isNewItem ? "Add Item" : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(topUpHistoryItem)} onOpenChange={(open) => { if (!open) { setTopUpHistoryItem(null); setTopUpHistory([]); } }}>
          <DialogContent className="max-w-3xl rounded-3xl">
            <DialogHeader><DialogTitle>Top-up history</DialogTitle><DialogDescription>Immutable stock replenishment records for {topUpHistoryItem?.name ?? "this item"}. Timestamps are shown in UTC.</DialogDescription></DialogHeader>
            <div className="max-h-[55vh] overflow-y-auto rounded-2xl border">
              {isLoadingTopUpHistory ? <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading history...</div> : topUpHistory.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No top-ups recorded yet.</p> : <div className="divide-y">{topUpHistory.map((entry) => <div key={entry.id} className="grid gap-2 p-4 text-sm sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="font-medium">{entry.quantity_before} + {entry.quantity_added} = {entry.quantity_after} {topUpHistoryItem?.unit}</p><p className="text-muted-foreground">{entry.reason || "Manual stock top-up"}</p><p className="text-xs text-muted-foreground">Staff ID: {entry.performed_by || "Unavailable"} · Role: {entry.performed_by_role || "Unavailable"}</p><p className="text-xs text-muted-foreground">Price: {entry.purchase_packaging_price_before ?? "—"} → {entry.purchase_packaging_price_after ?? "—"}</p><p className="break-all text-xs text-muted-foreground">Correlation: {entry.correlation_id || "Unavailable"} · Idempotency: {entry.idempotency_key || "Unavailable"}</p></div><div className="text-left text-xs text-muted-foreground sm:text-right"><p>{new Date(entry.performed_at).toISOString().replace("T", " ").replace(".000Z", " UTC")}</p><p>{entry.performed_by_name || "Authenticated user"}</p></div></div>)}</div>}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(topUpItem)} onOpenChange={(open) => { if (!open && !isSubmittingTopUp) { setTopUpItem(null); setTopUpQuantity(""); setTopUpReason(""); setTopUpPurchasePackagingPrice(""); } }}>
          <DialogContent className="max-w-md rounded-3xl border-emerald-200 dark:border-emerald-800">
            <DialogHeader><DialogTitle>Top up stock</DialogTitle><DialogDescription>Add quantity to {topUpItem?.name ?? "this item"}. The update and immutable audit record are saved atomically.</DialogDescription></DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="rounded-2xl bg-emerald-50 p-4 text-sm dark:bg-emerald-950/30"><span className="text-muted-foreground">Current balance</span><p className="text-xl font-semibold">{topUpItem?.quantity ?? "0"} {topUpItem?.unit ?? "units"}</p></div>
              <div className="grid gap-2"><Label htmlFor="top-up-quantity">Quantity to add</Label><Input id="top-up-quantity" type="number" min="0.001" step="any" value={topUpQuantity} onChange={(event) => setTopUpQuantity(event.target.value)} placeholder="Enter a positive quantity" autoFocus /></div>
              <div className="grid gap-2"><Label htmlFor="top-up-reason">Reason (optional)</Label><Input id="top-up-reason" value={topUpReason} onChange={(event) => setTopUpReason(event.target.value)} placeholder="Purchase, delivery, adjustment..." maxLength={500} /></div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-800 dark:bg-emerald-950/20"><p className="mb-2 text-sm font-medium">Purchase Packaging</p><Label htmlFor="top-up-packaging-price">Change Price (₵)</Label><Input id="top-up-packaging-price" type="number" min="0" step="0.01" value={topUpPurchasePackagingPrice} onChange={(event) => setTopUpPurchasePackagingPrice(event.target.value)} placeholder="Leave blank to keep current price" /><p className="mt-2 text-xs text-muted-foreground">Only the purchase packaging price is changed here. Explain a market increase in the reason field.</p></div>
              <p className="text-sm text-muted-foreground">New balance: <strong>{topUpQuantity && Number(topUpQuantity) > 0 ? (Number(topUpItem?.quantity ?? 0) + Number(topUpQuantity)).toLocaleString() : topUpItem?.quantity ?? "0"} {topUpItem?.unit ?? "units"}</strong></p>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setTopUpItem(null)} disabled={isSubmittingTopUp}>Cancel</Button><Button onClick={handleTopUp} disabled={isSubmittingTopUp || !topUpQuantity}>Top up stock</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

export default function InventoryPage() {
  return (
    <RoleGuard section="inventory">
      <InventoryContent />
    </RoleGuard>
  );
}
