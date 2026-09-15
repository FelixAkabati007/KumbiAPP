"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { UnitSelect } from "@/components/ui/unit-select";
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

function parseRecipeQuantity(value: string) {
  const normalized = value.trim().replace(/\u2044/g, "/");
  if (!normalized) return Number.NaN;

  const mixed = normalized.match(/^(\d+(?:\.\d+)?)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const denominator = Number(mixed[3]);
    return denominator > 0 ? Number(mixed[1]) + Number(mixed[2]) / denominator : Number.NaN;
  }

  const fraction = normalized.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    return denominator > 0 ? Number(fraction[1]) / denominator : Number.NaN;
  }

  return Number(normalized);
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
  const [steps, setSteps] = useState<Array<{ instruction: string; duration_minutes: string }>>([]);
  const [isSavingSteps, setIsSavingSteps] = useState(false);

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
      const [recipeRes, invItems, recipeSteps] = await Promise.all([
        fetch(`/api/menu/${menuItemId}/recipe`).then((res) => res.json()),
        getInventoryItems(),
        fetch(`/api/menu/${menuItemId}/recipe-steps`).then((res) => res.json()),
      ]);
      setIngredients(recipeRes);
      setSteps(Array.isArray(recipeSteps) ? recipeSteps.map((step: { instruction: string; duration_minutes?: number | null }) => ({ instruction: step.instruction, duration_minutes: step.duration_minutes?.toString() ?? "" })) : []);
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
    const parsedQuantity = parseRecipeQuantity(quantity);
    if (!selectedInvId || !quantity.trim() || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      window.alert("Enter a valid quantity, such as 1.5 or 1 1/2.");
      return;
    }

    setIsAdding(true);
    try {
      await fetch(`/api/menu/${menuItemId}/recipe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventory_item_id: selectedInvId,
          quantity: parsedQuantity,
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

  if (isLoading) return <div className="flex items-center justify-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading recipe" /></div>;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card>
        <CardHeader className="gap-1 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Recipe ingredients</CardTitle>
              <CardDescription>Build the ingredient list used by the kitchen for one serving.</CardDescription>
            </div>
            <Badge variant="secondary">{ingredients.length} {ingredients.length === 1 ? "ingredient" : "ingredients"}</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 rounded-lg border bg-muted/20 p-4 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(8rem,1fr)_minmax(12rem,1fr)_auto] xl:items-end">
            <div className="min-w-0">
              <Label htmlFor="ingredient-search">Ingredient</Label>
              <div className="relative mt-1">
                <Input
                  id="ingredient-search"
                  value={selectedInvId ? inventoryItems.find((item) => item.id === selectedInvId)?.name || ingredientSearch : ingredientSearch}
                  onChange={(event) => { setSelectedInvId(""); setIngredientSearch(event.target.value); }}
                  onFocus={() => selectedInvId && setIngredientSearch("")}
                  placeholder="Search ingredients..."
                  aria-describedby="ingredient-search-help"
                />
                {ingredientSearch.trim() && !selectedInvId && (
                  <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
                    {filteredInventoryItems.length > 0 ? filteredInventoryItems.map((item) => (
                      <button key={item.id} type="button" className="flex w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground" onMouseDown={(event) => event.preventDefault()} onClick={() => { setSelectedInvId(item.id); setIngredientSearch(""); setUnit(item.unit); }}>
                        <span className="truncate">{item.name}</span>
                      </button>
                    )) : <p className="px-3 py-3 text-center text-sm text-muted-foreground">No matching ingredients found.</p>}
                  </div>
                )}
              </div>
              <p id="ingredient-search-help" className="mt-1 text-xs text-muted-foreground">{selectedInvId ? "Ingredient selected" : `${foodInventoryItems.length} food items available`}</p>
            </div>
            <div>
              <Label htmlFor="recipe-quantity">Quantity</Label>
              <Input id="recipe-quantity" className="mt-1" type="text" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="1.5 or 1 1/2" aria-describedby="recipe-quantity-help" />
              <p id="recipe-quantity-help" className="mt-1 text-xs text-muted-foreground">Decimal or fraction</p>
            </div>
            <div>
              <Label htmlFor="recipe-unit">Unit</Label>
              <UnitSelect value={unit} onChange={(value) => setUnit(typeof value === "string" ? value : value[0] || "")} placeholder="Select unit" className="mt-1" />
              <p className="mt-1 text-xs text-muted-foreground">Cooking measurement</p>
            </div>
            <Button onClick={handleAddIngredient} disabled={isAdding || !unit || !selectedInvId} className="w-full xl:w-auto">
              {isAdding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" data-icon="inline-start" />} Add ingredient
            </Button>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader><TableRow><TableHead>Ingredient</TableHead><TableHead className="w-32">Quantity</TableHead><TableHead className="w-32">Unit</TableHead><TableHead className="w-20 text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {ingredients.map((ing) => <TableRow key={ing.id}><TableCell className="font-medium">{ing.inventory_name}</TableCell><TableCell>{ing.quantity}</TableCell><TableCell>{ing.unit}</TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" aria-label={`Remove ${ing.inventory_name}`} onClick={() => handleRemoveIngredient(ing.inventory_item_id)}><Trash2 className="size-4 text-destructive" /></Button></TableCell></TableRow>)}
                {ingredients.length === 0 && <TableRow><TableCell colSpan={4} className="h-20 text-center text-muted-foreground">No ingredients linked to this dish yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-1 pb-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><CardTitle className="text-base">Cooking method</CardTitle><CardDescription>Add ordered preparation steps for the Chef dashboard.</CardDescription></div><Button type="button" variant="outline" size="sm" onClick={() => setSteps((current) => [...current, { instruction: "", duration_minutes: "" }])}><Plus className="size-4" data-icon="inline-start" />Add step</Button></div></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {steps.length === 0 && <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No cooking steps added yet. Add the first step to document the preparation method.</div>}
          {steps.map((step, index) => <div key={index} className="grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-[auto_minmax(0,1fr)_8rem_auto] md:items-center"><Badge variant="outline" className="size-8 justify-center rounded-full p-0">{index + 1}</Badge><div><Label htmlFor={`recipe-step-${index}`} className="sr-only">Step {index + 1} instruction</Label><Input id={`recipe-step-${index}`} value={step.instruction} placeholder="Describe this cooking step" onChange={(event) => setSteps((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, instruction: event.target.value } : item))} /></div><div><Label htmlFor={`recipe-duration-${index}`} className="sr-only">Step {index + 1} duration in minutes</Label><Input id={`recipe-duration-${index}`} type="number" min="0" placeholder="Minutes" value={step.duration_minutes} onChange={(event) => setSteps((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, duration_minutes: event.target.value } : item))} /></div><Button type="button" variant="ghost" size="icon" aria-label={`Remove step ${index + 1}`} onClick={() => setSteps((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="size-4 text-destructive" /></Button></div>)}
          <div className="flex justify-end border-t pt-3"><Button type="button" disabled={isSavingSteps} onClick={async () => { setIsSavingSteps(true); try { await fetch(`/api/menu/${menuItemId}/recipe-steps`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ steps }) }); } finally { setIsSavingSteps(false); } }}>{isSavingSteps ? <Loader2 className="size-4 animate-spin" /> : null}{isSavingSteps ? "Saving..." : "Save cooking method"}</Button></div>
        </CardContent>
      </Card>
    </div>
  );
}
