import { NextResponse } from "next/server";

export interface ApiUnitEntry {
  value: string;
  label: string;
  aliases: string[];
  description?: string;
}

const UNIT_CATEGORIES: Array<{
  category: string;
  units: Array<{ value: string; label: string; aliases: string[] }>;
}> = [
  {
    category: "Procurement Units (Buying)",
    units: [
      { value: "cs", label: "Case (CS)", aliases: ["case", "cases", "cs"] },
      { value: "bx", label: "Box (BX)", aliases: ["box", "boxes", "bx"] },
      { value: "pk", label: "Pack (PK)", aliases: ["pack", "packs", "pk", "packet", "packets"] },
      { value: "bg", label: "Bag (BG)", aliases: ["bag", "bags", "bg"] },
      { value: "carton", label: "Carton", aliases: ["carton", "cartons", "ctn"] },
      { value: "crate", label: "Crate", aliases: ["crate", "crates"] },
      { value: "sack", label: "Sack", aliases: ["sack", "sacks"] },
      { value: "tray", label: "Tray", aliases: ["tray", "trays"] },
      { value: "bottle", label: "Bottle", aliases: ["bottle", "bottles", "btl"] },
      { value: "tin", label: "Tin", aliases: ["tin", "tins"] },
      { value: "tub", label: "Tub / Pail", aliases: ["tub", "tubs", "pail", "pails", "bucket", "buckets"] },
      { value: "jar", label: "Jar", aliases: ["jar", "jars"] },
      { value: "sachet", label: "Sachet", aliases: ["sachet", "sachets", "pouch", "pouches"] },
      { value: "roll", label: "Roll", aliases: ["roll", "rolls"] },
      { value: "pallet", label: "Pallet", aliases: ["pallet", "pallets"] },
      { value: "flat", label: "Flat", aliases: ["flat", "flats"] },
      { value: "drum", label: "Drum", aliases: ["drum", "drums", "keg", "kegs"] },
      { value: "bbl", label: "BBL (Barrel)", aliases: ["bbl", "barrel", "barrels"] },
      { value: "sleeve", label: "Split / Sleeve", aliases: ["sleeve", "sleeves", "split", "splits"] },
    ],
  },
  {
    category: "Inventory & Storage Units (Counting)",
    units: [
      { value: "unit", label: "Unit", aliases: ["unit", "units", "single"] },
      { value: "ea", label: "Each (EA)", aliases: ["each", "ea", "single"] },
      { value: "piece", label: "Piece", aliases: ["piece", "pieces", "pc", "pcs"] },
      { value: "pcs", label: "Pieces (PCS)", aliases: ["pcs", "pieces", "piece", "pc"] },
      { value: "ct", label: "Count (CT)", aliases: ["count", "counts", "ct"] },
      { value: "dz", label: "Dozen (DZ)", aliases: ["dozen", "dozens", "dz", "12"] },
      { value: "kg", label: "Kilogram (KG)", aliases: ["kg", "kilo", "kilos", "kilogram", "kilograms", "kilogramme", "kilogrammes"] },
      { value: "g", label: "Gram (G)", aliases: ["g", "gm", "gram", "grams", "gramme", "grammes"] },
      { value: "mg", label: "Milligram (MG)", aliases: ["mg", "milligram", "milligrams", "milligramme", "milligrammes"] },
      { value: "lb", label: "Pound (LB / #)", aliases: ["lb", "lbs", "pound", "pounds", "#"] },
      { value: "oz", label: "Ounce (OZ)", aliases: ["oz", "ounce", "ounces"] },
      { value: "l", label: "Liter / Litre (L)", aliases: ["l", "liter", "liters", "litre", "litres", "ltr"] },
      { value: "gal", label: "Gallon (GAL)", aliases: ["gal", "gallon", "gallons"] },
      { value: "qt", label: "Quart (QT)", aliases: ["qt", "quart", "quarts"] },
      { value: "pt", label: "Pint (PT)", aliases: ["pt", "pint", "pints"] },
      { value: "btl", label: "Bottle (BTL)", aliases: ["btl", "bottle", "bottles"] },
      { value: "can", label: "Can (#10, #5, etc.)", aliases: ["can", "cans", "tinned"] },
      { value: "bowl", label: "Bowl / Container", aliases: ["bowl", "bowls", "container", "containers", "takeaway"] },
      { value: "item", label: "Item", aliases: ["item", "items"] },
      { value: "bulb", label: "Bulb", aliases: ["bulb", "bulbs", "garlic bulb"] },
      { value: "clove", label: "Clove", aliases: ["clove", "cloves"] },
      { value: "knob", label: "Knob", aliases: ["knob", "knobs", "ginger knob"] },
      { value: "bunch", label: "Bunch", aliases: ["bunch", "bunches", "bundle", "bundles"] },
      { value: "head", label: "Head", aliases: ["head", "heads", "lettuce", "cabbage"] },
      { value: "leaf", label: "Leaf", aliases: ["leaf", "leaves", "bay leaf"] },
      { value: "root", label: "Root", aliases: ["root", "roots", "tuber", "tubers"] },
    ],
  },
  {
    category: "Portion & Recipe Units (Usage)",
    units: [
      { value: "ml", label: "Milliliter / Millilitre (ML)", aliases: ["ml", "milliliter", "milliliters", "millilitre", "millilitres"] },
      { value: "cl", label: "Centiliter / Centilitre (CL)", aliases: ["cl", "centiliter", "centiliters", "centilitre", "centilitres"] },
      { value: "fl_oz", label: "Fluid Ounce (fl_oz)", aliases: ["fl_oz", "fl oz", "floz", "fluid ounce", "fluid ounces"] },
      { value: "shot", label: "Shot / Tot (1.5 oz / 44 ml)", aliases: ["shot", "shots", "tot", "tots", "jigger", "pour", "44ml"] },
      { value: "tsp", label: "Teaspoon (tsp)", aliases: ["tsp", "teaspoon", "teaspoons"] },
      { value: "tbsp", label: "Tablespoon (tbsp)", aliases: ["tbsp", "tablespoon", "tablespoons", "tbs"] },
      { value: "c", label: "Cup (C)", aliases: ["c", "cup", "cups"] },
      { value: "scoop", label: "Scoop / Disher Number", aliases: ["scoop", "scoops", "disher"] },
      { value: "ladle", label: "Ladle (OZ)", aliases: ["ladle", "ladles"] },
      { value: "slice", label: "Slice", aliases: ["slice", "slices"] },
      { value: "portion", label: "Portion", aliases: ["portion", "portions"] },
      { value: "serving", label: "Serving", aliases: ["serving", "servings", "plate", "plates"] },
      { value: "pc", label: "Piece (PC)", aliases: ["pc", "pcs", "piece", "pieces"] },
      { value: "pinch", label: "Pinch / Dash", aliases: ["pinch", "pinches", "dash", "dashes"] },
    ],
  },
  {
    category: "Operational Management Units",
    units: [
      { value: "yield_percent", label: "Yield Percentage (%)", aliases: ["yield", "percent", "percentage", "%", "yield_percent"] },
    ],
  },
];

const UNIT_DESCRIPTIONS: Record<string, string> = {
  mg: "Fine weight unit (0.001 g) for spices, extracts, and additives.",
  g: "Canonical weight unit for solid ingredients.",
  kg: "Purchase or storage weight; recipes can use kg or g.",
  ml: "Canonical liquid volume unit.",
  l: "Purchase or storage volume; recipes can use L or ml.",
  pt: "Standard liquid pint (473 ml).",
  ea: "One countable item; use for bowls, packs, containers, and whole produce.",
  unit: "Canonical countable stock unit; one physical item.",
  piece: "One physical piece; stored as the canonical unit.",
  pcs: "Countable physical pieces.",
  pack: "Purchase packaging; configure pieces per pack separately.",
  pk: "Purchase packaging pack; configure units per pack separately.",
  box: "Purchase packaging; configure pieces per box separately.",
  bx: "Purchase packaging box; configure units per box separately.",
  bag: "Purchase packaging; configure units per bag separately.",
  bg: "Purchase packaging bag; configure units per bag separately.",
  bottle: "Purchase packaging; use ml for liquid recipe quantities when known.",
  cl: "Centiliter (10 ml) commonly used in beverage and bar recipes.",
  shot: "Standard bar shot / miniature mug (1.5 fl oz / 44.4 ml) for alcohol pours and cocktails.",
  tsp: "Recipe portion unit; use for small measured ingredients.",
  tbsp: "Recipe portion unit; use for measured ingredients.",
  c: "Recipe cup measure; use for measured ingredients.",
  portion: "Measured single serving or prep portion.",
  serving: "Single customer meal or beverage serving.",
};

export async function GET() {
  return NextResponse.json(
    UNIT_CATEGORIES.map((category) => ({
      ...category,
      units: category.units.map((unit) => ({
        ...unit,
        description: UNIT_DESCRIPTIONS[unit.value] ?? "Supported restaurant measurement unit.",
      })),
    }))
  );
}
