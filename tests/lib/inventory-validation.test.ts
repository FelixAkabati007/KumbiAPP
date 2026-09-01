import { describe, expect, it } from "vitest"
import { isInventoryUnit, validateInventoryNumber } from "@/lib/inventory-validation"

describe("inventory validation", () => {
  it("accepts zero and decimal quantities", () => {
    expect(validateInventoryNumber(0, "quantity")).toBeNull()
    expect(validateInventoryNumber("2.5", "quantity")).toBeNull()
  })
  it("rejects invalid numeric values", () => {
    expect(validateInventoryNumber(-1, "quantity")).toContain("non-negative")
    expect(validateInventoryNumber("nope", "quantity")).toContain("non-negative")
  })
  it("accepts supported units only", () => {
    expect(isInventoryUnit("kg")).toBe(true)
    expect(isInventoryUnit("unknown")).toBe(false)
  })
})
