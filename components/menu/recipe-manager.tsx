"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2, Plus, Loader2, ChevronDown } from "lucide-react";
import { getInventoryItems } from "@/lib/data";
import type { InventoryItem } from "@/lib/types";

interface RecipeIngredient {
  id: string;
  inventory_item_id: string;
  quantity: number;
  unit: string;
  inventory_name: string;
}

interface RecipeManagerProps {
  menuItemId: string;
}

export function RecipeManager({ menuItemId }: RecipeManagerProps) {
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);

  // New Ingredient State
  const [selectedInvId, setSelectedInvId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("units");
  const [ingredientSearch, setIngredientSearch] = useState("");

  const foodInventoryItems = inventoryItems.filter((item) =>
    ["ingredient", "beverage"].includes((item.category ?? "ingredient").toLowerCase())
  );

  const filteredInventoryItems = foodInventoryItems.filter((item) => {
    const query = ingredientSearch.trim().toLowerCase();
    if (!query) return true;
    return `${item.name} ${item.unit} ${item.category ?? ""} ${item.sku ?? ""} ${item.supplier ?? ""}`
      .toLowerCase()
      .includes(query);
  });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [recipeRes, invItems] = await Promise.all([
        fetch(`/api/menu/${menuItemId}/recipe`).then((res) => res.json()),
        getInventoryItems(),
      ]);
      setIngredients(recipeRes);
      setInventoryItems(invItems);
    } catch (error) {
      console.error("Failed to load recipe data", error);
    } finally {
      setIsLoading(false);
    }
  }, [menuItemId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddIngredient = async () => {
    if (!selectedInvId || !quantity) return;

    setIsAdding(true);
    try {
      await fetch(`/api/menu/${menuItemId}/recipe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventory_item_id: selectedInvId,
          quantity: parseFloat(quantity),
          unit,
        }),
      });
      await loadData();
      // Reset form
      setSelectedInvId("");
      setQuantity("");
    } catch (error) {
      console.error("Failed to add ingredient", error);
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveIngredient = async (invItemId: string) => {
    if (!confirm("Are you sure?")) return;

    try {
      await fetch(
        `/api/menu/${menuItemId}/recipe?inventoryItemId=${invItemId}`,
        {
          method: "DELETE",
        }
      );
      setIngredients((prev) =>
        prev.filter((i) => i.inventory_item_id !== invItemId)
      );
    } catch (error) {
      console.error("Failed to remove ingredient", error);
    }
  };

  if (isLoading) return <Loader2 className="animate-spin" />;

  return (
    <div className="min-w-0 space-y-3 sm:space-y-4">
      <div className="grid min-w-0 gap-3 rounded-lg border p-3 bg-gray-50 dark:bg-gray-900/50 md:grid-cols-2 lg:grid-cols-4 lg:items-end lg:gap-4 lg:p-4">
        <div className="min-w-0 md:col-span-2 lg:col-span-2">
          <Label htmlFor="ingredient-search">Ingredient</Label>
          <Input
            id="ingredient-search"
            value={ingredientSearch}
            onChange={(event) => setIngredientSearch(event.target.value)}
            placeholder="Search by ingredient name, keyword, SKU..."
            className="mb-2 h-9"
            aria-describedby="ingredient-search-help"
          />
          <p id="ingredient-search-help" className="mb-2 text-xs text-muted-foreground">
            {ingredientSearch.trim()
              ? `${filteredInventoryItems.length} matching food item${filteredInventoryItems.length === 1 ? "" : "s"}`
              : `${foodInventoryItems.length} food items available`}
          </p>
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" className="h-9 w-full justify-between font-normal">
                {selectedInvId
                  ? inventoryItems.find((item) => item.id === selectedInvId)?.name || "Select ingredient..."
                  : "Select ingredient..."}
                <ChevronDown className="ml-2 h-4 w-4 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(26rem,calc(100vw-2rem))] p-2">
              <div className="max-h-72 overflow-y-auto">
                {filteredInventoryItems.length > 0 ? (
                  filteredInventoryItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-orange-50 dark:hover:bg-orange-950/30"
                      onClick={() => {
                        setSelectedInvId(item.id);
                        setUnit(item.unit);
                      }}
                    >
                      <span className="min-w-0 truncate">{item.name}</span>
                      <span className="ml-3 shrink-0 text-xs text-muted-foreground">{item.unit} · {item.sku || item.category}</span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-4 text-center text-sm text-muted-foreground">No matching ingredients found.</p>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div>
          <Label>Quantity</Label>
          <Input
            className="h-9"
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <Button onClick={handleAddIngredient} disabled={isAdding} className="h-9 w-full md:w-auto">
          {isAdding ? (
            <Loader2 className="animate-spin h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Add
        </Button>
      </div>

      <div className="w-full min-w-0 overflow-x-auto rounded-lg">
      <Table className="min-w-[520px] text-xs sm:text-sm">
        <TableHeader>
          <TableRow>
            <TableHead>Ingredient</TableHead>
            <TableHead>Quantity</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ingredients.map((ing) => (
            <TableRow key={ing.id}>
              <TableCell>{ing.inventory_name}</TableCell>
              <TableCell>{ing.quantity}</TableCell>
              <TableCell>{ing.unit}</TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-11 min-w-11"
                  onClick={() => handleRemoveIngredient(ing.inventory_item_id)}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {ingredients.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={4}
                className="text-center text-muted-foreground"
              >
                No ingredients linked to this dish.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      </div>
    </div>
  );
}
