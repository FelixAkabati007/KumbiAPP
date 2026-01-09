"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Edit,
  Trash2,
  Search,
  UtensilsCrossed,
  ImageIcon,
  Loader2,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import {
  getMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
} from "@/lib/data";
import type { MenuItem } from "@/lib/types";
import { RoleGuard } from "@/components/role-guard";
import { useToast } from "@/components/ui/use-toast";

// Hosts allowed for next/image optimization. Keep this list explicit and small.
const allowedImageHosts = new Set([
  "scontent.facc5-2.fna.fbcdn.net",
  "images.unsplash.com",
  // Add any other trusted hosts here if you want Next to optimize them
]);

// Type guards
const isValidMenuItem = (item: unknown): item is MenuItem => {
  if (!item || typeof item !== "object") return false;
  const it = item as Record<string, unknown>;
  return (
    typeof it.id === "string" &&
    typeof it.name === "string" &&
    typeof it.description === "string" &&
    typeof it.price === "number" &&
    typeof it.inStock === "boolean" &&
    ["ghanaian", "continental", "beverages", "desserts", "sides"].includes(
      String(it.category)
    )
  );
};

const isValidCategory = (
  category: string
): category is MenuItem["category"] => {
  return ["ghanaian", "continental", "beverages", "desserts", "sides"].includes(
    category
  );
};

// Helper function to create empty menu item
const createEmptyMenuItem = (): MenuItem => {
  // low-priority diagnostic
  // eslint-disable-next-line no-console
  console.debug("🆕 [MenuPage] Creating empty menu item");
  return {
    id: "",
    name: "",
    description: "",
    price: 0,
    category: "ghanaian",
    inStock: true,
    barcode: "",
    image: "",
  };
};

function MenuContent() {
  console.debug("🚀 [MenuPage] Component initializing");

  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<MenuItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem>(
    createEmptyMenuItem()
  );
  const [isNewItem, setIsNewItem] = useState(false);
  const [formErrors, setFormErrors] = useState<{
    name?: string;
    description?: string;
    price?: string;
    category?: string;
  }>({});

  // Loading and error states
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  console.debug("👤 [MenuPage] Current user:", {
    id: user?.id ?? null,
    role: user?.role ?? null,
    authLoading: Boolean(authLoading),
  });

  // Load menu items from storage on mount
  useEffect(() => {
    const loadItems = async () => {
      console.debug("📥 [MenuPage] Loading menu items from storage");
      setIsLoading(true);
      setError(null);

      try {
        const loadedItems = await getMenuItems();

        // Validate loaded items
        const validItems = loadedItems.filter((item) => {
          const isValid = isValidMenuItem(item);
          if (!isValid) {
            console.warn(
              "⚠️ [MenuPage] Invalid item found and filtered out:",
              item
            );
          }
          return isValid;
        });

        // eslint-disable-next-line no-console
        console.debug("✅ [MenuPage] Loaded items:", {
          total: loadedItems.length,
          valid: validItems.length,
          categoryCount: new Set(validItems.map((item) => item.category)).size,
        });

        setItems(validItems);
      } catch (error) {
        console.error("❌ [MenuPage] Error loading menu items:", error);
        setError(
          "Failed to load menu items. Please refresh the page to try again."
        );
        setItems([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadItems();
  }, []); // Empty dependency array - only run on mount

  // Memoize filtered items computation
  const memoizedFilteredItems = useMemo(() => {
    // eslint-disable-next-line no-console
    console.debug("🔍 [MenuPage] Filtering items", {
      searchTerm: searchTerm || null,
      selectedCategory: selectedCategory || null,
      totalItems: items.length,
    });

    let filtered = items;

    // Apply category filter
    if (selectedCategory !== "all") {
      filtered = filtered.filter((item) => item.category === selectedCategory);
    }

    // Apply search filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(
        (item) =>
          item.name.toLowerCase().includes(searchLower) ||
          item.description.toLowerCase().includes(searchLower) ||
          item.barcode?.toLowerCase().includes(searchLower)
      );
    }

    console.debug("✅ [MenuPage] Filtered items:", {
      filteredCount: filtered.length,
      originalCount: items.length,
    });

    return filtered;
  }, [items, searchTerm, selectedCategory]);

  // Update filteredItems when memoized value changes
  useEffect(() => {
    setFilteredItems(memoizedFilteredItems);
  }, [memoizedFilteredItems]);

  // Memoized dialog/form handlers and utility callbacks
  // These must be declared unconditionally (before any early returns)
  const handleAddItem = useCallback(() => {
    console.debug("➕ [MenuPage] Adding new item");
    const newItem = createEmptyMenuItem();
    setEditingItem(newItem);
    setIsNewItem(true);
    setFormErrors({});
    setIsDialogOpen(true);
    console.debug("✅ [MenuPage] New item dialog opened");
  }, []);

  const handleEditItem = useCallback((item: MenuItem) => {
    console.debug("✏️ [MenuPage] Editing item:", {
      id: item.id,
      name: item.name,
      category: item.category,
    });

    if (!isValidMenuItem(item)) {
      console.error("❌ [MenuPage] Cannot edit invalid item");
      alert("Cannot edit this item - invalid data format.");
      return;
    }

    setEditingItem({ ...item });
    setIsNewItem(false);
    setFormErrors({});
    setIsDialogOpen(true);
    console.debug("✅ [MenuPage] Edit dialog opened");
  }, []);

  const validateForm = useCallback((): boolean => {
    const errors: typeof formErrors = {};

    if (!editingItem.name.trim()) {
      errors.name = "Name is required";
    } else if (editingItem.name.trim().length < 2) {
      errors.name = "Name must be at least 2 characters";
    }

    if (!editingItem.description.trim()) {
      errors.description = "Description is required";
    } else if (editingItem.description.trim().length < 5) {
      errors.description = "Description must be at least 5 characters";
    }

    if (editingItem.price <= 0) {
      errors.price = "Price must be greater than 0";
    } else if (editingItem.price > 10000) {
      errors.price = "Price cannot exceed ₵10,000";
    }

    if (!isValidCategory(editingItem.category)) {
      errors.category = "Please select a valid category";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [editingItem]);

  const handleSaveItem = useCallback(async () => {
    console.debug("💾 [MenuPage] Saving item", {
      isNewItem,
      itemId: editingItem.id || null,
      itemName: editingItem.name || null,
    });

    if (isSaving) {
      console.debug("⏳ [MenuPage] Save already in progress, ignoring");
      return;
    }

    try {
      if (!validateForm()) {
        console.error("❌ [MenuPage] Form validation failed");
        return;
      }

      setIsSaving(true);

      if (isNewItem) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, ...itemData } = editingItem;
        console.debug("🆕 [MenuPage] Creating new item");
        const savedItem = await createMenuItem(itemData);
        if (savedItem) {
          setItems((prevItems) => [...prevItems, savedItem]);
          console.debug("✅ [MenuPage] New item added", savedItem.id);
        }
      } else {
        console.debug("📝 [MenuPage] Updating existing item", editingItem.id);
        const success = await updateMenuItem(editingItem);
        if (success) {
          setItems((prevItems) =>
            prevItems.map((item) =>
              item.id === editingItem.id ? editingItem : item
            )
          );
          console.debug("✅ [MenuPage] Item updated");
        }
      }

      setIsDialogOpen(false);
      setEditingItem(createEmptyMenuItem());
      setFormErrors({});
      console.debug("✅ [MenuPage] Save operation completed");
    } catch (err) {
      console.error("❌ [MenuPage] Error saving item:", err);
      alert("Error saving item. Please check your input and try again.");
    } finally {
      setIsSaving(false);
    }
  }, [editingItem, isNewItem, validateForm, isSaving]);

  const handleDeleteItem = useCallback(
    async (id: string) => {
      console.debug("🗑️ [MenuPage] Deleting item with ID", id);
      try {
        const itemToDelete = items.find((item) => item.id === id);

        if (!itemToDelete) {
          console.warn("⚠️ [MenuPage] Item not found for deletion", id);
          return;
        }

        if (
          confirm(
            `Are you sure you want to delete "${itemToDelete.name}"? This action cannot be undone.`
          )
        ) {
          const success = await deleteMenuItem(id);
          if (success) {
            setItems((prevItems) => prevItems.filter((item) => item.id !== id));
            console.debug("✅ [MenuPage] Item deleted", {
              id: itemToDelete.id,
              name: itemToDelete.name,
            });
            toast({
              title: "Item Deleted",
              description: `"${itemToDelete.name}" has been removed from the menu.`,
            });
          } else {
            toast({
              title: "Error",
              description: "Failed to delete item",
              variant: "destructive",
            });
          }
        }
      } catch (error) {
        console.error("❌ [MenuPage] Error deleting item:", error);
        toast({
          title: "Error",
          description: "Failed to delete item. Please try again.",
          variant: "destructive",
        });
      }
    },
    [items, toast]
  );

  const handleSearchChange = useCallback((value: string) => {
    console.debug("🔍 [MenuPage] Search term changed", value);
    setSearchTerm(value);
  }, []);

  const handleCategoryChange = useCallback((value: string) => {
    console.debug("🏷️ [MenuPage] Category filter changed", value);
    setSelectedCategory(value);
  }, []);

  const getCategoryBadgeColor = useCallback(
    (category: MenuItem["category"]) => {
      const colors = {
        ghanaian: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
        continental:
          "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
        beverages:
          "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
        desserts:
          "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
        sides:
          "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
      } as const;
      return (
        colors[category] ||
        "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300"
      );
    },
    []
  );

  const handleDialogClose = useCallback(() => {
    if (isSaving) {
      console.debug("⏳ [MenuPage] Cannot close dialog while saving");
      return;
    }
    setIsDialogOpen(false);
  }, [isSaving]);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setEditingItem((prev) => ({ ...prev, name: e.target.value }));
    },
    []
  );

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setEditingItem((prev) => ({ ...prev, description: e.target.value }));
    },
    []
  );

  const handlePriceChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      const numericValue = value === "" ? 0 : Number.parseFloat(value);

      if (isNaN(numericValue)) {
        console.warn("⚠️ [MenuPage] Invalid price input:", value);
        return;
      }

      setEditingItem((prev) => ({ ...prev, price: numericValue }));
    },
    []
  );

  const handleCategorySelectChange = useCallback((value: string) => {
    if (!isValidCategory(value)) {
      console.error("❌ [MenuPage] Invalid category selected", value);
      return;
    }

    setEditingItem((prev) => ({
      ...prev,
      category: value as MenuItem["category"],
    }));
  }, []);

  const handleBarcodeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setEditingItem((prev) => ({ ...prev, barcode: e.target.value }));
    },
    []
  );

  const handleStockChange = useCallback((value: string) => {
    setEditingItem((prev) => ({ ...prev, inStock: value === "true" }));
  }, []);

  const handleImageChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setEditingItem((prev) => ({ ...prev, image: e.target.value }));
    },
    []
  );

  // Check user permissions - wait for auth to complete first
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="mx-auto h-12 w-12 text-primary animate-spin mb-4" />
          <h2 className="text-xl font-semibold mb-2">Authenticating</h2>
          <p className="text-muted-foreground">
            Please wait while we verify your credentials...
          </p>
        </div>
      </div>
    );
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="mx-auto h-12 w-12 text-primary animate-spin mb-4" />
          <h2 className="text-xl font-semibold mb-2">Loading Menu</h2>
          <p className="text-muted-foreground">
            Please wait while we load your menu items...
          </p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Error Loading Menu</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={() => window.location.reload()}>Refresh Page</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950">
      {/* Header */}
      <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-white/80 dark:bg-gray-900/80 backdrop-blur-md px-4 md:px-6 border-orange-200 dark:border-orange-700">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/")}
          className="h-10 w-10 p-0"
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="h-5 w-5 text-orange-600 dark:text-orange-400" />
        </Button>
        <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-200 ml-2">
          Menu Management
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <Button
            onClick={handleAddItem}
            className="rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg relative overflow-hidden flex items-center gap-2"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-orange-400/20 via-amber-400/20 to-yellow-400/20 animate-pulse"></div>
            <Plus className="h-4 w-4 relative z-10" />
            <span className="relative z-10">Add Menu Item</span>
          </Button>
        </div>
      </header>

      {/* Filters */}
      <main className="flex flex-1 flex-col p-4 md:p-6">
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search menu items..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Select value={selectedCategory} onValueChange={handleCategoryChange}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="ghanaian">Ghanaian</SelectItem>
              <SelectItem value="continental">Continental</SelectItem>
              <SelectItem value="beverages">Beverages</SelectItem>
              <SelectItem value="desserts">Desserts</SelectItem>
              <SelectItem value="sides">Sides</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Menu Items Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
          {filteredItems.map((item) => (
            <Card
              key={item.id}
              className="overflow-hidden bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 relative"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <div className="relative">
                {item.image ? (
                  (() => {
                    try {
                      const url = new URL(item.image);
                      const host = url.hostname;

                      if (allowedImageHosts.has(host)) {
                        return (
                          <div className="w-full h-48 relative">
                            <Image
                              src={item.image}
                              alt={item.name}
                              fill
                              sizes="(max-width: 768px) 100vw, 33vw"
                              className="object-cover"
                              onLoad={(e) => {
                                const imgEl =
                                  e.currentTarget as HTMLImageElement;
                                if (!imgEl.naturalWidth)
                                  imgEl.style.display = "none";
                              }}
                            />
                          </div>
                        );
                      }
                    } catch {
                      // If URL parsing fails, fall back to unoptimized Image below
                    }

                    // Fallback for non-whitelisted hosts: use next/image with `unoptimized` to avoid domain validation
                    return (
                      <div className="w-full h-48 relative">
                        <Image
                          src={item.image}
                          alt={item.name}
                          fill
                          unoptimized
                          sizes="(max-width: 768px) 100vw, 33vw"
                          className="object-cover"
                          onLoad={(e) => {
                            const imgEl = e.currentTarget as HTMLImageElement;
                            if (!imgEl.naturalWidth)
                              imgEl.style.display = "none";
                          }}
                        />
                      </div>
                    );
                  })()
                ) : (
                  <div className="w-full h-48 bg-muted flex items-center justify-center">
                    <ImageIcon className="h-12 w-12 text-muted-foreground" />
                  </div>
                )}
                {item.inStock && (
                  <Badge className="absolute top-2 right-2 bg-green-500 hover:bg-green-600 text-white rounded-full animate-pulse">
                    In Stock
                  </Badge>
                )}
              </div>
              <CardContent className="p-4 relative z-10">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-lg">{item.name}</h3>
                  <div className="flex gap-1">
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-8 w-8 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-full shadow-lg hover:bg-white dark:hover:bg-gray-800"
                      onClick={() => handleEditItem(item)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon"
                      className="h-8 w-8 bg-red-500/80 hover:bg-red-600/80 backdrop-blur-sm rounded-full shadow-lg"
                      onClick={() => handleDeleteItem(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-muted-foreground text-sm mb-3">
                  {item.description}
                </p>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                    ₵{item.price.toFixed(2)}
                  </span>
                  <Badge
                    variant="secondary"
                    className={getCategoryBadgeColor(item.category)}
                  >
                    {item.category}
                  </Badge>
                </div>
                {item.barcode && (
                  <p className="text-xs text-muted-foreground">
                    Barcode: {item.barcode}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Empty State */}
        {filteredItems.length === 0 && (
          <div className="text-center py-12">
            <div className="mx-auto w-24 h-24 bg-gradient-to-br from-orange-100 via-amber-100 to-yellow-100 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-full flex items-center justify-center mb-4">
              <UtensilsCrossed className="h-12 w-12 text-orange-600 dark:text-orange-400" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No menu items found</h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm || selectedCategory !== "all"
                ? "Try adjusting your search or filter criteria"
                : "Get started by adding your first menu item"}
            </p>
            {!searchTerm && selectedCategory === "all" && (
              <Button
                onClick={handleAddItem}
                className="rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg flex items-center gap-2 mx-auto"
              >
                <Plus className="h-4 w-4" />
                Add Menu Item
              </Button>
            )}
          </div>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>
                {isNewItem ? "Add New Menu Item" : "Edit Menu Item"}
              </DialogTitle>
              <DialogDescription>
                {isNewItem
                  ? "Fill in the details for the new menu item."
                  : "Update the menu item details below."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={editingItem.name}
                  onChange={handleNameChange}
                  placeholder="Enter item name"
                  className={formErrors.name ? "border-red-500" : ""}
                />
                {formErrors.name && (
                  <p className="text-sm text-red-500">{formErrors.name}</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={editingItem.description}
                  onChange={handleDescriptionChange}
                  placeholder="Enter item description"
                  className={formErrors.description ? "border-red-500" : ""}
                />
                {formErrors.description && (
                  <p className="text-sm text-red-500">
                    {formErrors.description}
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="price">Price (₵)</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editingItem.price}
                  onChange={handlePriceChange}
                  placeholder="0.00"
                  className={formErrors.price ? "border-red-500" : ""}
                />
                {formErrors.price && (
                  <p className="text-sm text-red-500">{formErrors.price}</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={editingItem.category}
                  onValueChange={handleCategorySelectChange}
                >
                  <SelectTrigger
                    className={formErrors.category ? "border-red-500" : ""}
                  >
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ghanaian">Ghanaian</SelectItem>
                    <SelectItem value="continental">Continental</SelectItem>
                    <SelectItem value="beverages">Beverages</SelectItem>
                    <SelectItem value="desserts">Desserts</SelectItem>
                    <SelectItem value="sides">Sides</SelectItem>
                  </SelectContent>
                </Select>
                {formErrors.category && (
                  <p className="text-sm text-red-500">{formErrors.category}</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="barcode">Barcode (Optional)</Label>
                <Input
                  id="barcode"
                  value={editingItem.barcode || ""}
                  onChange={handleBarcodeChange}
                  placeholder="Enter barcode"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="inStock">Stock Status</Label>
                <Select
                  value={editingItem.inStock.toString()}
                  onValueChange={handleStockChange}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">In Stock</SelectItem>
                    <SelectItem value="false">Out of Stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="image">Image URL (Optional)</Label>
                <Input
                  id="image"
                  value={editingItem.image || ""}
                  onChange={handleImageChange}
                  placeholder="https://example.com/image.jpg"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleDialogClose}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveItem}
                disabled={isSaving}
                className="flex items-center gap-2"
              >
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSaving
                  ? "Saving..."
                  : isNewItem
                    ? "Add Item"
                    : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

export default function MenuPage() {
  return (
    <RoleGuard section="menu">
      <MenuContent />
    </RoleGuard>
  );
}
