import { describe, expect, it } from "vitest";

import { formatUsageValue, parseUsageValue } from "./validation";

describe("parseUsageValue", () => {
  it("accepts positive numbers and Japanese decimal punctuation", () => {
    expect(parseUsageValue("7.5")).toBe(7.5);
    expect(parseUsageValue("7,5")).toBe(7.5);
    expect(parseUsageValue("0")).toBe(0);
  });

  it("rejects blank, negative, and non-numeric input", () => {
    expect(parseUsageValue(" ")).toBeNull();
    expect(parseUsageValue("-1")).toBeNull();
    expect(parseUsageValue("abc")).toBeNull();
  });
});

describe("formatUsageValue", () => {
  it("formats a value for the Japanese UI", () => {
    expect(formatUsageValue(1234.5)).toBe("1,234.5");
  });
});
