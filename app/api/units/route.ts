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

export async function GET() {
  // Simulate network delay for loading state demonstration
  await new Promise((resolve) => setTimeout(resolve, 500));

  return NextResponse.json(UNIT_CATEGORIES);
}
