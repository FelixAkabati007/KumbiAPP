import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

const recipeSchema = z.object({
  title: z.string(), shortDescription: z.string(), customerDescription: z.string(), chefPreparationNotes: z.string(),
  menuInformation: z.object({ menuName: z.string(), category: z.string(), preparationTime: z.string(), cookingTime: z.string(), totalTime: z.string(), difficulty: z.string(), portionSize: z.string(), estimatedCalories: z.number() }),
  availableIngredients: z.array(z.string()),
  missingIngredients: z.array(z.object({ name: z.string(), quantityNeeded: z.string(), suggestedLocalSupplier: z.string(), alternativeIngredient: z.string() })),
  ingredients: z.array(z.object({ name: z.string(), quantity: z.string(), available: z.boolean(), estimatedCostGhs: z.number() })),
  preparationProcess: z.array(z.object({ stepNo: z.number(), action: z.string(), duration: z.string(), temperature: z.string(), visualIndicator: z.string() })),
  cookingScience: z.string(), chefSecrets: z.array(z.string()), ghanaianAuthenticityNotes: z.string(), platingInstructions: z.string(), foodPhotographyPrompt: z.string(), foodImages: z.array(z.object({ title: z.string(), url: z.string() })),
  costEstimation: z.object({ totalFoodCostGhs: z.number(), suggestedSellingPriceGhs: z.number(), profitMarginPercent: z.number(), breakdown: z.array(z.object({ ingredient: z.string(), costGhs: z.number() })) }),
  qualityControlChecklist: z.array(z.string()),
  menuManagementJson: z.object({ menuName: z.string(), category: z.string(), description: z.string(), price: z.string(), portion: z.string(), preparationTime: z.string(), cookingTime: z.string(), difficulty: z.string(), imageUrls: z.array(z.string()) }),
  chefExecutionJson: z.object({ recipeName: z.string(), ingredients: z.array(z.object({ name: z.string(), quantity: z.string(), available: z.boolean() })), steps: z.array(z.object({ stepNo: z.number(), instruction: z.string(), duration: z.string() })), chefNotes: z.array(z.string()) }),
});

export async function POST(request: Request) {
  const { error } = await requirePermission("menu");
  if (error) return error;
  try {
    const body = await request.json();
    const menuItemId = typeof body.menuItemId === "string" ? body.menuItemId : "";
    if (!menuItemId) return NextResponse.json({ error: "Select a menu item." }, { status: 400 });
    const menuResult = await query("SELECT id, name, description, category, price FROM menu_items WHERE id = $1 AND is_available = true", [menuItemId]);
    if (!menuResult.rows[0]) return NextResponse.json({ error: "Menu item not found." }, { status: 404 });
    const inventoryResult = await query("SELECT name, quantity, unit, category, cost_per_unit FROM inventory ORDER BY name ASC");
    const item = menuResult.rows[0];
    const inventory = inventoryResult.rows.map((row) => ({ name: row.name, quantity: row.quantity, unit: row.unit, category: row.category, costPerUnit: row.cost_per_unit }));
    const result = await generateText({
      model: "openai/o4-mini",
      maxOutputTokens: 7000,
      temperature: 0.4,
      output: Output.object({ schema: recipeSchema, name: "ghanaian_restaurant_recipe" }),
      instructions: "You are the executive chef and Ghanaian culinary consultant for Kumbisaly Hotel and Restaurant. Return only the requested structured object. Be realistic for one commercial-kitchen serving, use GHS costs, never invent available inventory, and use public food image URLs only as visual references.",
      prompt: JSON.stringify({ menuItem: item, availableInventory: inventory, cuisine: "Ghanaian", portion: "1 Person", requirements: "Create one complete restaurant-quality recipe with inventory analysis, exact quantities, cooking science, chef secrets, authenticity notes, plating, food photography prompt, five sample image URLs, menu JSON, chef execution JSON, costing, and quality checklist." }),
    });
    return NextResponse.json(result.output);
  } catch (error) {
    console.error("Recipe engine failed", error);
    return NextResponse.json({ error: "Unable to generate the recipe. Please try again." }, { status: 500 });
  }
}
