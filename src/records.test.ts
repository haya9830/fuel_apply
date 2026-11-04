import { describe, expect, it } from "vitest";
import { createDraft, prepareRecords, restoreDraft } from "./records";
const machine = {
  id: "m1",
  name: "機械1",
  worksheetName: "入力",
  previousMeterCell: "J7",
  currentMeterCell: "J42",
};
const draft = () => {
  const d = createDraft("2026-11", [machine]);
  d.entries.m1 = { selected: true, current: "１２３４．５" };
  return d;
};
describe("monthly form", () => {
  it("accepts a cumulative decimal meter and returns an absolute monthly value", () => {
    expect(prepareRecords(draft(), [machine], "2026-11")).toEqual([
      { machine, value: 1234.5 },
    ]);
  });
  it("distinguishes zero from a missing meter", () => {
    const d = draft();
    d.entries.m1.current = "0";
    expect(prepareRecords(d, [machine], "2026-11")[0].value).toBe(0);
    d.entries.m1.current = "";
    expect(() => prepareRecords(d, [machine], "2026-11")).toThrow("機械1");
  });
  it("prevents writing a different month to the same workbook", () => {
    expect(() => prepareRecords(draft(), [machine], "2026-10")).toThrow(
      "対象月",
    );
  });
  it("requires a selected machine and rejects malformed months", () => {
    const d = createDraft("2026-13", [machine]);
    expect(() => prepareRecords(d, [machine], "2026-13")).toThrow("対象月");
    d.period = "2026-11";
    expect(() => prepareRecords(d, [machine], "2026-11")).toThrow("1台以上");
  });
  it("restores only configured machines and validates storage data", () => {
    const d = draft();
    expect(
      restoreDraft(JSON.stringify(d), createDraft("2026-12", [machine])),
    ).toEqual(d);
    expect(() =>
      restoreDraft(
        '{"version":2,"period":"2026-11","entries":{"m1":{"selected":true}}}',
        d,
      ),
    ).toThrow();
    expect(() => restoreDraft('{"version":1}', d)).toThrow();
  });
});
