import { describe, expect, it } from "vitest";
import { convertMeasurementQuantity } from "./measurement";

describe("convertMeasurementQuantity", () => {
  it("converte kg para g", () => {
    expect(convertMeasurementQuantity(0.25, "kg", "g")).toBe(250);
  });

  it("converte g para kg", () => {
    expect(convertMeasurementQuantity(150, "g", "kg")).toBe(0.15);
  });

  it("mantém o valor quando a unidade já é a mesma", () => {
    expect(convertMeasurementQuantity(120, "g", "g")).toBe(120);
  });
});