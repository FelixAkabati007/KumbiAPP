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
import { useRealtime } from "@/components/realtime-provider";
import { getRecipeDeductionQuantity } from "@/lib/inventory-units";
import type { InventoryCostStatus } from "@/lib/inventory-cost";

interface RecipeIngredient {
  id: string;
  inventory_item_id: string;
  quantity: number;
  unit: string;
  inventory_name: string;
  inventory_category?: string | null;
  inventory_quantity?: number | string | null;
  inventory_unit?: string | null;
  inventory_recipe_unit?: string | null;
  inventory_conversion_ratio?: number | string | null;
  inventory_density?: number | string | null;
  inventory_cost_price?: number | string | null;
  cost_status?: InventoryCostStatus;
  line_cost?: number | null;
  cost_reason?: string | null;
  stock_status: "stocked" | "out_of_stock";
}

interface RecipeManagerProps {
  menuItemId: string;
  menuItemPrice?: number;
}

function getIngredientCost(ing: RecipeIngredient): number | null {
  if (ing.line_cost !== undefined) return ing.line_cost;
  const costPerInventoryUnit = Number(ing.inventory_cost_price ?? 0);
  if (!Number.isFinite(costPerInventoryUnit) || costPerInventoryUnit <= 0) return null;
  const density = ing.inventory_density !== null && ing.inventory_density !== undefined ? Number(ing.inventory_density) : null;
  const requiredInInventoryUnit = getRecipeDeductionQuantity(
    Number(ing.quantity),
    ing.unit,
    ing.inventory_unit,
    ing.inventory_conversion_ratio !== null && ing.inventory_conversion_ratio !== undefined ? Number(ing.inventory_conversion_ratio) : null,
    density
  );
  if (requiredInInventoryUnit === null) return null;
  return requiredInInventoryUnit * costPerInventoryUnit;
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

export function RecipeManager({ menuItemId, menuItemPrice }: RecipeManagerProps) {
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);

  // New Ingredient State
  const [selectedInvId, setSelectedInvId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [supplySearch, setSupplySearch] = useState("");
  const [selectedSupplyId, setSelectedSupplyId] = useState("");
  const [supplyQuantity, setSupplyQuantity] = useState("");
  const [supplyUnit, setSupplyUnit] = useState("");
  const [steps, setSteps] = useState<Array<{ instruction: string; duration_minutes: string }>>([]);
  const [isSavingSteps, setIsSavingSteps] = useState(false);
  const { lastEvent } = useRealtime();

  const foodInventoryItems = inventoryItems.filter((item) => ["ingredient", "beverage"].includes((item.category ?? "ingredient").toLowerCase()));
  const supplyInventoryItems = inventoryItems.filter((item) => ["supply", "packaging", "disposable", "equipment", "non-food"].includes((item.category ?? "").toLowerCase()));
  const filteredSupplyItems = supplyInventoryItems.filter((item) => `${item.name} ${item.unit} ${item.category ?? ""} ${item.sku ?? ""}`.toLowerCase().includes(supplySearch.trim().toLowerCase()));

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

  useEffect(() => {
    if (lastEvent?.topic === "inventory.updated") void loadData();
  }, [lastEvent, loadData]);

  const handleAddIngredient = async () => {
    const parsedQuantity = parseRecipeQuantity(quantity);
    if (!selectedInvId || !quantity.trim() || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      window.alert("Enter a valid quantity, such as 1.5 or 1 1/2.");
      return;
    }

    setIsAdding(true);
    try {
      const response = await fetch(`/api/menu/${menuItemId}/recipe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventory_item_id: selectedInvId,
          quantity: parsedQuantity,
          unit,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || "Failed to save recipe ingredient");
      }
      await loadData();
      setSelectedInvId("");
      setIngredientSearch("");
      setQuantity("");
      setUnit("");
    } catch (error) {
      console.error("Failed to add ingredient", error);
      window.alert(error instanceof Error ? error.message : "Failed to save recipe ingredient");
    } finally {
      setIsAdding(false);
    }
  };

  const handleAddSupply = async () => {
    const normalizedSearch = supplySearch.trim().toLowerCase();
    const resolvedSupply = selectedSupplyId
      ? inventoryItems.find((item) => item.id === selectedSupplyId)
      : supplyInventoryItems.find((item) => item.name.trim().toLowerCase() === normalizedSearch || item.sku?.trim().toLowerCase() === normalizedSearch);
    const resolvedSupplyId = resolvedSupply?.id ?? selectedSupplyId;
    const resolvedUnit = resolvedSupply?.recipeUnit || supplyUnit || resolvedSupply?.unit || "unit";
    const parsedQuantity = parseRecipeQuantity(supplyQuantity || "1");
if (!resolvedSupplyId || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0 || !resolvedUnit) {
  window.alert("Select a supply with a configured Inventory recipe unit and enter a valid quantity.");
      return;
    }
    setIsAdding(true);
    try {
      const response = await fetch(`/api/menu/${menuItemId}/recipe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inventory_item_id: resolvedSupplyId, quantity: parsedQuantity, unit: resolvedUnit }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Failed to save supply");
      await loadData();
      setSelectedSupplyId(""); setSupplySearch(""); setSupplyQuantity(""); setSupplyUnit("");
    } catch (error) { window.alert(error instanceof Error ? error.message : "Failed to save supply"); } finally { setIsAdding(false); }
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

  const costedIngredientCount = ingredients.filter((ing) => getIngredientCost(ing) !== null).length;
  const totalPlateCost = ingredients.reduce((sum, ing) => sum + (getIngredientCost(ing) ?? 0), 0);
  const hasUnpricedIngredients = costedIngredientCount < ingredients.length;
  const margin = typeof menuItemPrice === "number" && menuItemPrice > 0 ? menuItemPrice - totalPlateCost : null;
  const marginPercent = margin !== null && menuItemPrice ? (margin / menuItemPrice) * 100 : null;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {ingredients.length > 0 && (
        <Card>
          <CardHeader className="gap-1 pb-3">
            <CardTitle className="text-base">Plate cost</CardTitle>
            <CardDescription>Calculated live from recipe quantities and current inventory cost prices.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <p className="text-xs text-muted-foreground">Cost per plate</p>
                <p className="text-2xl font-semibold tabular-nums">₵{totalPlateCost.toFixed(2)}</p>
              </div>
              {typeof menuItemPrice === "number" && menuItemPrice > 0 && (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground">Menu price</p>
                    <p className="text-2xl font-semibold tabular-nums">₵{menuItemPrice.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Margin</p>
                    <p className={`text-2xl font-semibold tabular-nums ${margin !== null && margin < 0 ? "text-destructive" : ""}`}>
                      ₵{margin?.toFixed(2)} {marginPercent !== null && `(${marginPercent.toFixed(0)}%)`}
                    </p>
                  </div>
                </>
              )}
            </div>
            {hasUnpricedIngredients && (
              <p className="mt-3 text-xs text-muted-foreground">
                {ingredients.length - costedIngredientCount} of {ingredients.length} ingredients have no cost price set in Inventory yet, so this total is a partial estimate.
              </p>
            )}
          </CardContent>
        </Card>
      )}
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
          <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:p-4 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(8rem,1fr)_minmax(12rem,1fr)_auto] xl:items-end">
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
            <Table className="min-w-[34rem]">

              <TableHeader><TableRow><TableHead>Ingredient</TableHead><TableHead className="w-32">Quantity</TableHead><TableHead className="w-32">Unit</TableHead><TableHead className="w-28">Cost</TableHead><TableHead className="w-32">Stock</TableHead><TableHead className="w-20 text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {ingredients.map((ing) => { const cost = getIngredientCost(ing); return <TableRow key={ing.id}><TableCell className="font-medium">{ing.inventory_name}</TableCell><TableCell>{ing.quantity}</TableCell><TableCell>{ing.unit}</TableCell><TableCell className="tabular-nums">{cost !== null ? `₵${cost.toFixed(2)}` : <span className="text-xs text-muted-foreground" title={ing.cost_reason ?? undefined}>{ing.cost_status === "unit_conversion_missing" ? "Unit conversion needed" : ing.cost_status === "missing_cost" ? "Cost not configured" : "Invalid inventory setup"}</span>}</TableCell><TableCell><Badge title={`Inventory: ${ing.inventory_quantity ?? 0} ${ing.inventory_unit ?? "units"}`} className={ing.stock_status === "stocked" ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300"}>{ing.stock_status === "stocked" ? "Stocked" : "Out of stock"}</Badge></TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" aria-label={`Remove ${ing.inventory_name}`} onClick={() => handleRemoveIngredient(ing.inventory_item_id)}><Trash2 className="size-4 text-destructive" /></Button></TableCell></TableRow>; })}
                {ingredients.length === 0 && <TableRow><TableCell colSpan={6} className="h-20 text-center text-muted-foreground">No ingredients linked to this dish yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-1 pb-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><CardTitle className="text-base">Meal supplies</CardTitle><CardDescription>Add take-away containers, disposable bowls, napkins, or other supplies consumed with this meal.</CardDescription></div><Badge variant="secondary">{ingredients.filter((item) => supplyInventoryItems.some((supply) => supply.id === item.inventory_item_id)).length} supplies</Badge></div></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:p-4 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(8rem,1fr)_minmax(12rem,1fr)_auto] xl:items-end">
            <div className="min-w-0"><Label htmlFor="supply-search">Supply</Label><div className="relative mt-1"><Input id="supply-search" value={selectedSupplyId ? inventoryItems.find((item) => item.id === selectedSupplyId)?.name || supplySearch : supplySearch} onChange={(event) => { setSelectedSupplyId(""); setSupplySearch(event.target.value); }} placeholder="Search bowls, containers, napkins..." />{supplySearch.trim() && !selectedSupplyId && <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">{filteredSupplyItems.length ? filteredSupplyItems.map((item) => <button key={item.id} type="button" className="flex w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-accent" onMouseDown={(event) => event.preventDefault()} onClick={() => { setSelectedSupplyId(item.id); setSupplySearch(""); setSupplyUnit(item.unit); }}><span className="truncate">{item.name}</span></button>) : <p className="px-3 py-3 text-center text-sm text-muted-foreground">No matching supplies found.</p>}</div>}</div><p className="mt-1 text-xs text-muted-foreground">{supplyInventoryItems.length} supplies available</p></div>
            <div><Label htmlFor="supply-quantity">Quantity</Label><Input id="supply-quantity" className="mt-1" value={supplyQuantity} onChange={(event) => setSupplyQuantity(event.target.value)} placeholder="1" /></div>
            <div><Label htmlFor="supply-unit">Unit</Label><UnitSelect value={supplyUnit} onChange={(value) => setSupplyUnit(typeof value === "string" ? value : value[0] || "")} placeholder="Select unit" className="mt-1" /></div>
            <Button onClick={handleAddSupply} disabled={isAdding || !selectedSupplyId}><Plus className="size-4" data-icon="inline-start" />Add supply</Button>
          </div>
          <div className="overflow-x-auto rounded-md border"><Table className="min-w-[34rem]"><TableHeader><TableRow><TableHead>Supply</TableHead><TableHead>Quantity</TableHead><TableHead>Unit</TableHead><TableHead>Stock</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{ingredients.filter((item) => supplyInventoryItems.some((supply) => supply.id === item.inventory_item_id)).map((item) => <TableRow key={item.id}><TableCell className="font-medium">{item.inventory_name}</TableCell><TableCell>{item.quantity}</TableCell><TableCell>{item.unit}</TableCell><TableCell><Badge className={item.stock_status === "stocked" ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300"}>{item.stock_status === "stocked" ? "Stocked" : "Out of stock"}</Badge></TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" aria-label={`Remove ${item.inventory_name}`} onClick={() => handleRemoveIngredient(item.inventory_item_id)}><Trash2 className="size-4 text-destructive" /></Button></TableCell></TableRow>)}{ingredients.filter((item) => supplyInventoryItems.some((supply) => supply.id === item.inventory_item_id)).length === 0 && <TableRow><TableCell colSpan={5} className="h-16 text-center text-muted-foreground">No supplies linked to this meal yet.</TableCell></TableRow>}</TableBody></Table></div>
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
