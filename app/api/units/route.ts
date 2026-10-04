import { NextResponse } from "next/server";

const UNIT_CATEGORIES = [
  {
    category: "Procurement Units (Buying)",
    units: [
      { value: "cs", label: "Case (CS)" },
      { value: "bx", label: "Box (BX)" },
      { value: "pk", label: "Pack (PK)" },
      { value: "bg", label: "Bag (BG)" },
      { value: "flat", label: "Flat" },
      { value: "crate", label: "Crate" },
      { value: "tub", label: "Tub / Pail" },
      { value: "drum", label: "Drum" },
      { value: "bbl", label: "BBL (Barrel)" },
      { value: "sleeve", label: "Split / Sleeve" },
      { value: "carton", label: "Carton" },
      { value: "sack", label: "Sack" },
      { value: "bottle", label: "Bottle" },
      { value: "tin", label: "Tin" },
      { value: "tray", label: "Tray" },
    ],
  },
  {
    category: "Inventory & Storage Units (Counting)",
    units: [
      { value: "ea", label: "Each (EA)" },
      { value: "ct", label: "Count (CT)" },
      { value: "dz", label: "Dozen (DZ)" },
      { value: "lb", label: "Pound (LB / #)" },
      { value: "oz", label: "Ounce (OZ)" },
      { value: "kg", label: "Kilogram (KG)" },
      { value: "g", label: "Gram (G)" },
      { value: "gal", label: "Gallon (GAL)" },
      { value: "qt", label: "Quart (QT)" },
      { value: "l", label: "Liter (L)" },
      { value: "btl", label: "Bottle (BTL)" },
      { value: "can", label: "Can (#10, #5, etc.)" },
      { value: "item", label: "Item" },
      { value: "piece", label: "Piece" },
      { value: "unit", label: "Unit" },
      { value: "bulb", label: "Bulb" },
      { value: "clove", label: "Clove" },
      { value: "knob", label: "Knob" },
      { value: "bunch", label: "Bunch" },
      { value: "head", label: "Head" },
      { value: "leaf", label: "Leaf" },
      { value: "root", label: "Root" },
    ],
  },
  {
    category: "Portion & Recipe Units (Usage)",
    units: [
      { value: "fl_oz", label: "Fluid Ounce (FL OZ)" },
      { value: "ml", label: "Milliliter (ML)" },
      { value: "scoop", label: "Scoop / Disher Number" },
      { value: "ladle", label: "Ladle (OZ)" },
      { value: "slice", label: "Slice" },
      { value: "pc", label: "Piece (PC)" },
      { value: "tsp", label: "Teaspoon (tsp)" },
      { value: "tbsp", label: "Tablespoon (tbsp)" },
      { value: "c", label: "Cup (C)" },
      { value: "pinch", label: "Pinch / Dash" },
    ],
  },
  {
    category: "Operational Management Units",
    units: [{ value: "yield_percent", label: "Yield Percentage (%)" }],
  },
];

const UNIT_DESCRIPTIONS: Record<string, string> = {
  g: "Canonical weight unit for solid ingredients.",
  kg: "Purchase or storage weight; recipes can use kg or g.",
  ml: "Canonical liquid volume unit.",
  l: "Purchase or storage volume; recipes can use L or ml.",
  ea: "One countable item; use for bowls, packs, containers, and whole produce.",
  unit: "Canonical countable stock unit; one physical item.",
  piece: "One physical piece; stored as the canonical unit.",
  pack: "Purchase packaging only; configure pieces per pack separately.",
  box: "Purchase packaging only; configure pieces per box separately.",
  bag: "Purchase packaging only; configure pieces per bag separately.",
  bottle: "Purchase packaging; use ml for liquid recipe quantities when known.",
  tsp: "Recipe portion unit; use for small measured ingredients.",
  tbsp: "Recipe portion unit; use for measured ingredients.",
  c: "Recipe cup measure; use for measured ingredients.",
};

export async function GET() {
  return NextResponse.json(UNIT_CATEGORIES.map((category) => ({
    ...category,
    units: category.units.map((unit) => ({
      ...unit,
      description: UNIT_DESCRIPTIONS[unit.value] ?? "Supported restaurant measurement unit.",
    })),
  })));
}
