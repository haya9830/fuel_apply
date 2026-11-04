import { describe, expect, it } from "vitest";
import { formatUsageValue, parseUsageValue, localToday } from "./validation";
describe("meter numbers", () => {
  it("accepts zero, decimals and full-width Japanese input", () => {
    expect(parseUsageValue("0")).toBe(0);
    expect(parseUsageValue("１２３４．５")).toBe(1234.5);
    expect(parseUsageValue("7,5")).toBe(7.5);
  });
  it("rejects blanks, negatives, infinity and programming number syntax", () => {
    for (const value of [
      "",
      " ",
      "-1",
      "abc",
      "Infinity",
      "0x10",
      "1e3",
      "1,234.5",
    ])
      expect(parseUsageValue(value)).toBeNull();
  });
  it("formats values for review without changing precision", () => {
    expect(formatUsageValue(1234.5)).toBe("1,234.5");
  });
  it("uses the device calendar date instead of UTC", () => {
    const date = new Date(2026, 10, 4, 0, 15);
    expect(localToday(date)).toBe("2026-11-04");
  });
});
