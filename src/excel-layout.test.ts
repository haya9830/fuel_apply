import { readFileSync } from "node:fs";
import { strFromU8, unzipSync, zipSync, strToU8 } from "fflate";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { updateMonthlyWorkbook } from "./xlsx";
import type { MachineConfig } from "./config";
const machines = JSON.parse(readFileSync("app.json", "utf8")).expo.extra
  .machines as MachineConfig[];
export const template = readFileSync(
  "outputs/0952_04免税証・免税軽油使用状況明細書_機械12台対応.xlsx",
);
const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const parse = (bytes: Uint8Array) =>
  new DOMParser().parseFromString(strFromU8(bytes), "application/xml");
const serializer = new XMLSerializer();
const withValue = (address: string, value: string, formula = false) => {
  const files = unzipSync(template);
  const doc = parse(files["xl/worksheets/sheet1.xml"]);
  const c = Array.from(doc.getElementsByTagNameNS(MAIN, "c")).find(
    (c) => c.getAttribute("r") === address,
  )!;
  for (const node of Array.from(c.childNodes)) c.removeChild(node);
  c.removeAttribute("t");
  const v = doc.createElementNS(MAIN, formula ? "x:f" : "x:v");
  v.textContent = value;
  c.appendChild(v);
  files["xl/worksheets/sheet1.xml"] = strToU8(
    serializer.serializeToString(doc),
  );
  return zipSync(files);
};
const records = machines.map((machine, i) => ({
  machine,
  value: 1000 + i + 0.5,
}));
describe("real 12-machine Excel template", () => {
  it("updates every month-end meter while preserving every other cell, merge and ZIP part", () => {
    const before = unzipSync(template);
    const after = unzipSync(
      updateMonthlyWorkbook(template, records, "2026-11", false).bytes,
    );
    expect(machines).toHaveLength(12);
    for (const name of Object.keys(before)) {
      if (!/^xl\/worksheets\/sheet[12]\.xml$/.test(name)) {
        expect(after[name]).toEqual(before[name]);
        continue;
      }
      const first = name.endsWith("sheet1.xml");
      const relevant = records.slice(first ? 0 : 6, first ? 6 : 12);
      const excluded = [
        "A3",
        ...relevant.map((r) => r.machine.currentMeterCell),
      ];
      const originalDoc = parse(before[name]);
      const resultDoc = parse(after[name]);
      for (const c of Array.from(
        originalDoc.getElementsByTagNameNS(MAIN, "c"),
      )) {
        const address = c.getAttribute("r");
        if (excluded.includes(address!)) continue;
        const updated = Array.from(
          resultDoc.getElementsByTagNameNS(MAIN, "c"),
        ).find((c) => c.getAttribute("r") === address)!;
        expect(serializer.serializeToString(updated)).toBe(
          serializer.serializeToString(c),
        );
      }
      relevant.forEach((r, index) => {
        expect(r.machine.currentMeterCell).toBe(
          `${["J", "M", "P", "S", "V", "Y"][index]}42`,
        );
        const c = Array.from(resultDoc.getElementsByTagNameNS(MAIN, "c")).find(
          (c) => c.getAttribute("r") === r.machine.currentMeterCell,
        )!;
        expect(c.getElementsByTagNameNS(MAIN, "v")[0].textContent).toBe(
          String(r.value),
        );
      });
      expect(
        Array.from(resultDoc.getElementsByTagNameNS(MAIN, "mergeCell")).map(
          (m) => m.getAttribute("ref"),
        ),
      ).toEqual(
        Array.from(originalDoc.getElementsByTagNameNS(MAIN, "mergeCell")).map(
          (m) => m.getAttribute("ref"),
        ),
      );
    }
  });
  it("refuses a different month, then treats retrying identical values as unchanged", () => {
    const updated = updateMonthlyWorkbook(template, records, "2026-11", false);
    expect(() =>
      updateMonthlyWorkbook(updated.bytes, records, "2026-12", true),
    ).toThrow("2026-11");
    expect(
      updateMonthlyWorkbook(updated.bytes, records, "2026-11", false).changed,
    ).toBe(false);
  });
  it("blocks decreasing meters and formulas even with overwrite enabled", () => {
    expect(() =>
      updateMonthlyWorkbook(
        withValue("J7", "2000"),
        [records[0]],
        "2026-11",
        true,
      ),
    ).toThrow("下回って");
    expect(() =>
      updateMonthlyWorkbook(
        withValue("J42", "SUM(A1:A3)", true),
        [records[0]],
        "2026-11",
        true,
      ),
    ).toThrow("数式");
  });
  it("requires explicit overwrite for an occupied month-end cell", () => {
    const source = withValue("J42", "999");
    expect(() =>
      updateMonthlyWorkbook(source, [records[0]], "2026-11", false),
    ).toThrow("入力済み");
    expect(
      updateMonthlyWorkbook(source, [records[0]], "2026-11", true).changed,
    ).toBe(true);
  });
  it("supports zero and refuses a cell inside a merged label", () => {
    expect(
      updateMonthlyWorkbook(
        template,
        [{ ...records[0], value: 0 }],
        "2026-11",
        false,
      ).changed,
    ).toBe(true);
    expect(() =>
      updateMonthlyWorkbook(
        template,
        [
          {
            ...records[0],
            machine: { ...machines[0], currentMeterCell: "I42" },
          },
        ],
        "2026-11",
        true,
      ),
    ).toThrow("結合セル");
  });
});
