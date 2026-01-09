"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2, Plus, Loader2 } from "lucide-react";
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
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2 items-end border p-4 rounded-lg bg-gray-50 dark:bg-gray-900/50">
        <div className="col-span-2">
          <Label>Ingredient</Label>
          <Select
            value={selectedInvId}
            onValueChange={(val) => {
              setSelectedInvId(val);
              const item = inventoryItems.find((i) => i.id === val);
              if (item) setUnit(item.unit);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select ingredient..." />
            </SelectTrigger>
            <SelectContent>
              {inventoryItems.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name} ({item.unit})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Quantity</Label>
          <Input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <Button onClick={handleAddIngredient} disabled={isAdding}>
          {isAdding ? (
            <Loader2 className="animate-spin h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Add
        </Button>
      </div>

      <Table>
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
  );
}
