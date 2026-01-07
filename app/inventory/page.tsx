"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  saveInventoryItems,
  exportInventoryData,
} from "@/lib/data";
import type { InventoryItem } from "@/lib/types";
import { LogoDisplay } from "@/components/logo-display";
import { playNotificationSound } from "@/lib/notifications";
import { RoleGuard } from "@/components/role-guard";

function InventoryContent() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<InventoryItem[]>([]);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isNewItem, setIsNewItem] = useState(false);
  const [summary, setSummary] = useState({
    totalItems: 0,
    lowStockItems: 0,
    totalValue: 0,
    categories: {} as { [key: string]: number },
  });

  // Load inventory items on component mount
  useEffect(() => {
    const loadedItems = getInventoryItems ? getInventoryItems() : [];
    setItems(loadedItems);
    setSummary({
      totalItems: loadedItems.length,
      lowStockItems: loadedItems.filter(
        (item: InventoryItem) =>
          Number.parseFloat(item.quantity) <=
          Number.parseFloat(item.reorderLevel)
      ).length,
      totalValue: loadedItems.reduce(
        (total: number, item: InventoryItem) =>
          total + Number.parseFloat(item.cost),
        0
      ),
      categories: loadedItems.reduce(
        (categories: { [key: string]: number }, item: InventoryItem) => {
          categories[item.category] = (categories[item.category] || 0) + 1;
          return categories;
        },
        {} as { [key: string]: number }
      ),
    });
  }, []);

  // Save items to localStorage whenever items change
  useEffect(() => {
    if (items.length > 0) {
      if (saveInventoryItems) {
        saveInventoryItems(items);
      }
      setSummary({
        totalItems: items.length,
        lowStockItems: items.filter(
          (item: InventoryItem) =>
            Number.parseFloat(item.quantity) <=
            Number.parseFloat(item.reorderLevel)
        ).length,
        totalValue: items.reduce(
          (total: number, item: InventoryItem) =>
            total + Number.parseFloat(item.cost),
          0
        ),
        categories: items.reduce(
          (categories: { [key: string]: number }, item: InventoryItem) => {
            categories[item.category] = (categories[item.category] || 0) + 1;
            return categories;
          },
          {} as { [key: string]: number }
        ),
      });
    }
  }, [items]);

  // Filter items based on search query and active tab
  useEffect(() => {
    let filtered = items;

    if (searchQuery) {
      filtered = filtered.filter(
        (item) =>
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.category.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (activeTab !== "all") {
      filtered = filtered.filter((item) => item.category === activeTab);
    }

    setFilteredItems(filtered);
  }, [searchQuery, activeTab, items]);

  const handleAddItem = () => {
    setEditingItem({
      id: "",
      name: "",
      sku: "",
      category: "ingredient",
      quantity: "0",
      unit: "kg",
      reorderLevel: "5",
      cost: "0",
      supplier: "",
      lastUpdated: new Date().toISOString(),
    });
    setIsNewItem(true);
    setIsDialogOpen(true);
  };

  const handleEditItem = (item: InventoryItem) => {
    setEditingItem({ ...item });
    setIsNewItem(false);
    setIsDialogOpen(true);
  };

  const handleDeleteItem = (id: string) => {
    if (confirm("Are you sure you want to delete this item?")) {
      setItems(items.filter((item) => item.id !== id));
      toast({
        title: "Item Deleted",
        description: "Inventory item has been removed",
      });
    }
  };

  const handleSaveItem = () => {
    if (!editingItem) return;

    if (
      !editingItem.name ||
      !editingItem.sku ||
      !editingItem.quantity ||
      !editingItem.cost
    ) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    if (isNewItem) {
      const newItem = {
        ...editingItem,
        id: Math.random().toString(36).substring(2, 9),
        lastUpdated: new Date().toISOString(),
      };
      setItems([...items, newItem]);
      toast({
        title: "Item Added",
        description: `${newItem.name} has been added to inventory`,
      });
    } else {
      setItems(
        items.map((item) =>
          item.id === editingItem.id
            ? { ...editingItem, lastUpdated: new Date().toISOString() }
            : item
        )
      );
      toast({
        title: "Item Updated",
        description: `${editingItem.name} has been updated`,
      });
    }
    setIsDialogOpen(false);
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

  const isLowStock = (item: InventoryItem) => {
    return (
      Number.parseFloat(item.quantity) <= Number.parseFloat(item.reorderLevel)
    );
  };

  const lowStockCount = items.filter(isLowStock).length;

  useEffect(() => {
    if (lowStockCount > 0) {
      playNotificationSound();
    }
  }, [lowStockCount]);

  return (
    <div className="flex min-h-screen w-full flex-col bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-white/80 dark:bg-gray-900/80 backdrop-blur-md px-4 md:px-6 border-orange-200 dark:border-orange-700">
        <Link
          href="/"
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <ArrowLeft className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          <LogoDisplay size="sm" />
          <Package className="h-6 w-6 text-orange-600 dark:text-orange-400" />
          <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Inventory Management
          </h1>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          {lowStockCount > 0 && (
            <Badge
              variant="destructive"
              className="rounded-full animate-pulse bg-red-500 hover:bg-red-600 text-white"
            >
              <AlertTriangle className="mr-1 h-3 w-3" />
              {lowStockCount} Low Stock
            </Badge>
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
            className="rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-orange-400/20 via-amber-400/20 to-yellow-400/20 animate-pulse"></div>
            <Plus className="mr-2 h-4 w-4 relative z-10" />
            <span className="relative z-10">Add Item</span>
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col p-4 md:p-6">
        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search inventory items..."
              className="pl-8 rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className="w-48 rounded-2xl border-orange-200 dark:border-orange-700 bg-white/50 dark:bg-gray-800/50">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-orange-200 dark:border-orange-700">
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="ingredient">Ingredients</SelectItem>
              <SelectItem value="beverage">Beverages</SelectItem>
              <SelectItem value="supply">Supplies</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
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
          <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
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
          <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
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
          <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
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
        </div>

        <Card className="flex-1 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
          <CardHeader className="relative z-10">
            <CardTitle className="text-gray-800 dark:text-gray-200">
              Inventory Items
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 relative z-10">
            <ScrollArea className="h-[calc(100vh-400px)]">
              <div className="p-6 pt-0">
                <div className="space-y-4">
                  {filteredItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-4 bg-white/50 dark:bg-gray-800/50 rounded-2xl border border-orange-100 dark:border-orange-800 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`p-3 rounded-xl ${getCategoryColor(
                            item.category
                          )}`}
                        >
                          <Package className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-800 dark:text-gray-200">
                            {item.name}
                          </h3>
                          <div className="flex gap-2 text-sm text-gray-500 dark:text-gray-400">
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

                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div
                            className={`font-bold ${
                              isLowStock(item)
                                ? "text-red-600 dark:text-red-400"
                                : "text-gray-800 dark:text-gray-200"
                            }`}
                          >
                            {item.quantity} {item.unit}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            ₵{Number.parseFloat(item.cost).toFixed(2)}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditItem(item)}
                            className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteItem(item.id)}
                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                          >
                            <Trash className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {filteredItems.length === 0 && (
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

        {/* Add/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[425px] bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border border-orange-200 dark:border-orange-700 rounded-3xl">
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
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label
                    htmlFor="name"
                    className="text-orange-700 dark:text-orange-300"
                  >
                    Name
                  </Label>
                  <Input
                    id="name"
                    value={editingItem.name}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, name: e.target.value })
                    }
                    className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label
                      htmlFor="sku"
                      className="text-orange-700 dark:text-orange-300"
                    >
                      SKU
                    </Label>
                    <Input
                      id="sku"
                      value={editingItem.sku}
                      onChange={(e) =>
                        setEditingItem({ ...editingItem, sku: e.target.value })
                      }
                      className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400"
                    />
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
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label
                      htmlFor="quantity"
                      className="text-orange-700 dark:text-orange-300"
                    >
                      Quantity
                    </Label>
                    <Input
                      id="quantity"
                      type="number"
                      value={editingItem.quantity}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          quantity: e.target.value,
                        })
                      }
                      className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label
                      htmlFor="unit"
                      className="text-orange-700 dark:text-orange-300"
                    >
                      Unit
                    </Label>
                    <Input
                      id="unit"
                      value={editingItem.unit}
                      onChange={(e) =>
                        setEditingItem({ ...editingItem, unit: e.target.value })
                      }
                      className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label
                      htmlFor="reorderLevel"
                      className="text-orange-700 dark:text-orange-300"
                    >
                      Reorder Level
                    </Label>
                    <Input
                      id="reorderLevel"
                      type="number"
                      value={editingItem.reorderLevel}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          reorderLevel: e.target.value,
                        })
                      }
                      className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label
                      htmlFor="cost"
                      className="text-orange-700 dark:text-orange-300"
                    >
                      Cost (₵)
                    </Label>
                    <Input
                      id="cost"
                      type="number"
                      value={editingItem.cost}
                      onChange={(e) =>
                        setEditingItem({ ...editingItem, cost: e.target.value })
                      }
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
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                className="rounded-2xl border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveItem}
                className="rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg"
              >
                <Save className="mr-2 h-4 w-4" />
                {isNewItem ? "Add Item" : "Save Changes"}
              </Button>
            </DialogFooter>
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
