import { describe, expect, it } from "vitest";

import { getMachineUsageCells } from "./excel";

describe("getMachineUsageCells", () => {
  it("maps the first day to row 10 and preserves the three input columns", () => {
    expect(
      getMachineUsageCells(
        {
          id: "machine-1",
          name: "機械1",
          worksheetName: "軽油第12号様式(2)",
          hoursColumn: "H",
          minutesColumn: "I",
          fuelColumn: "J",
        },
        "2026-07-01",
      ),
    ).toEqual({ hoursCell: "H10", minutesCell: "I10", fuelCell: "J10" });
  });

  it("maps day 31 to row 40", () => {
    expect(
      getMachineUsageCells(
        {
          id: "machine-7",
          name: "機械7",
          worksheetName: "軽油第12号様式(2) 2枚目",
          hoursColumn: "H",
          minutesColumn: "I",
          fuelColumn: "J",
        },
        "2026-07-31",
      ).fuelCell,
    ).toBe("J40");
  });
});
