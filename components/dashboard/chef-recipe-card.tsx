"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChefHat, CircleAlert, Clock3, ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useRealtime } from "@/components/realtime-provider";

type Recipe = { id: string; name: string; description: string | null; ingredients: Array<{ id: string; name: string; quantity: number; unit: string; available: number; inventoryUnit: string }>; steps: Array<{ id: string; stepNumber: number; instruction: string; durationMinutes: number | null }> };

export function ChefRecipeCard() {
  const { lastEvent } = useRealtime();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/chef/recipes", { cache: "no-store" });
    if (response.ok) setRecipes(await response.json());
  }, []);

  useEffect(() => { void load(); }, [load, lastEvent?.topic === "menu.updated" ? lastEvent.at : null]);

  const active = recipes.find((recipe) => recipe.id === selected) ?? recipes[0];
  const shortages = active?.ingredients.filter((item) => item.available < item.quantity) ?? [];

  return (
    <Card data-dashboard-category="restaurant" className="min-w-0 overflow-hidden rounded-3xl border border-orange-200 bg-white/70 backdrop-blur-sm dark:border-orange-700 dark:bg-gray-800/70 lg:col-span-3">
      <CardHeader className="relative bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-gray-800 dark:text-gray-200"><ChefHat className="size-5 text-orange-600" /> Chef Recipe Book</CardTitle>
            <CardDescription className="text-orange-600 dark:text-orange-400">Live quantities and cooking steps from Menu Management</CardDescription>
          </div>
          <Badge variant="secondary">{recipes.length} dishes</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!active ? <p className="text-sm text-muted-foreground">No available menu recipes yet.</p> : <>
          <div className="flex flex-wrap gap-2">{recipes.map((recipe) => <Button key={recipe.id} size="sm" variant={recipe.id === active.id ? "default" : "outline"} onClick={() => setSelected(recipe.id)}>{recipe.name}</Button>)}</div>
          <div className="flex flex-col gap-3 rounded-2xl border border-border/60 p-3">
            <div><h3 className="font-semibold">{active.name}</h3><p className="text-xs text-muted-foreground">{active.description || "Follow the measured ingredients and steps below."}</p></div>
            {shortages.length > 0 && <div className="flex items-start gap-2 rounded-xl bg-destructive/10 p-2 text-xs text-destructive"><CircleAlert className="mt-0.5 size-4 shrink-0" />Short on: {shortages.map((item) => item.name).join(", ")}</div>}
            <div className="grid gap-2 sm:grid-cols-2">{active.ingredients.map((item) => <div key={item.id} className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{item.name}</span><span className="font-medium">{item.quantity} {item.unit}<span className="text-xs text-muted-foreground"> / {item.available} available</span></span></div>)}</div>
            {active.steps.length > 0 && <div className="flex flex-col gap-2 border-t pt-3"><p className="flex items-center gap-2 text-sm font-medium"><ListChecks className="size-4 text-orange-600" /> Method</p>{active.steps.map((step) => <div key={step.id} className="flex gap-2 text-sm"><Badge variant="outline">{step.stepNumber}</Badge><span>{step.instruction}{step.durationMinutes ? <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="size-3" />{step.durationMinutes} min</span> : null}</span></div>)}</div>}
          </div>
        </>}
      </CardContent>
      <CardFooter><Link href="/menu" className="w-full"><Button variant="outline" className="w-full">Edit recipes in Menu Management</Button></Link></CardFooter>
    </Card>
  );
}
