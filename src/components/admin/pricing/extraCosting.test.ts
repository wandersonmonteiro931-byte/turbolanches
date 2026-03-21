import { describe, expect, it } from "vitest";
import { computeExtraCostPreview, computeFixedExtraCostPerItem } from "./extraCosting";

describe("extraCosting", () => {
  it("calcula rateio por dia e por lanche", () => {
    const preview = computeExtraCostPreview({
      cost_type: "fixed",
      value: 140,
      division_mode: "daily",
      days_duration: 14,
      items_per_day: 50,
    });

    expect(preview.dailyValue).toBe(10);
    expect(preview.perItemValue).toBe(0.2);
  });

  it("mantém custo fixo direto quando não divide por dias", () => {
    expect(
      computeFixedExtraCostPerItem({
        cost_type: "fixed",
        value: 1.5,
        division_mode: "none",
      }),
    ).toBe(1.5);
  });
});