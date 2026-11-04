import {
  DOMParser,
  XMLSerializer,
  type Document as XmlDocument,
  type Element as XmlElement,
} from "@xmldom/xmldom";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { MeterRecord } from "./records";
import { isPeriod } from "./records";
import { parseUsageValue } from "./validation";

const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_REL =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const MAX_EXPANDED_BYTES = 40 * 1024 * 1024;
const serializer = new XMLSerializer();

function xml(bytes: Uint8Array | undefined): XmlDocument {
  if (!bytes) throw new Error("Excelファイルに必要な情報がありません。");
  const text = strFromU8(bytes);
  if (/<!DOCTYPE/i.test(text)) throw new Error("このExcel形式は扱えません。");
  return new DOMParser({
    onError: () => {
      throw new Error("Excelの内部データを読み取れませんでした。");
    },
  }).parseFromString(text, "application/xml");
}
function elements(parent: XmlDocument | XmlElement, tag: string): XmlElement[] {
  return Array.from(parent.getElementsByTagNameNS(MAIN, tag));
}
function cell(doc: XmlDocument, address: string): XmlElement | undefined {
  return elements(doc, "c").find((c) => c.getAttribute("r") === address);
}
function cellValue(
  doc: XmlDocument,
  address: string,
  strings: string[],
): string | number | null {
  const c = cell(doc, address);
  if (!c) return null;
  if (elements(c, "f").length)
    throw new Error(`${address}に数式があります。保存先を確認してください。`);
  const type = c.getAttribute("t");
  const value = elements(c, "v")[0]?.textContent ?? "";
  if (type === "s") {
    const text = strings[Number(value)];
    if (text === undefined)
      throw new Error("Excelの文字列を読み取れませんでした。");
    return text;
  }
  if (type === "inlineStr")
    return elements(c, "t")
      .map((t) => t.textContent)
      .join("");
  if (type === "str") return value;
  if (type === "e" || type === "b")
    throw new Error(`${address}に数値以外の値があります。`);
  if (!value) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric))
    throw new Error(`${address}を数値として読み取れませんでした。`);
  return numeric;
}
function columnIndex(address: string): number {
  return [...address.match(/^[A-Z]+/)![0]].reduce(
    (n, char) => n * 26 + char.charCodeAt(0) - 64,
    0,
  );
}
function ensureCell(doc: XmlDocument, address: string): XmlElement {
  const existing = cell(doc, address);
  if (existing) return existing;
  const rowNumber = Number(address.match(/\d+$/)![0]);
  let row = elements(doc, "row").find(
    (r) => Number(r.getAttribute("r")) === rowNumber,
  );
  if (!row) {
    const data = elements(doc, "sheetData")[0];
    if (!data) throw new Error("Excelの表が見つかりません。");
    row = doc.createElementNS(MAIN, "x:row");
    row.setAttribute("r", String(rowNumber));
    const next = elements(data, "row").find(
      (r) => Number(r.getAttribute("r")) > rowNumber,
    );
    data.insertBefore(row, next ?? null);
  }
  const c = doc.createElementNS(MAIN, "x:c");
  c.setAttribute("r", address);
  const next = elements(row, "c").find(
    (c) => columnIndex(c.getAttribute("r")!) > columnIndex(address),
  );
  row.insertBefore(c, next ?? null);
  return c;
}
function setValue(
  doc: XmlDocument,
  address: string,
  value: number | string,
): void {
  const c = ensureCell(doc, address);
  // Keep style and metadata attributes. Replace only the cell value/type.
  for (const child of Array.from(c.childNodes))
    if (
      child.nodeType === 1 &&
      ["v", "is", "f"].includes(child.localName ?? "")
    )
      c.removeChild(child);
  c.removeAttribute("t");
  if (typeof value === "number") {
    const v = doc.createElementNS(MAIN, "x:v");
    v.appendChild(doc.createTextNode(String(value)));
    c.appendChild(v);
  } else {
    c.setAttribute("t", "inlineStr");
    const inline = doc.createElementNS(MAIN, "x:is");
    const t = doc.createElementNS(MAIN, "x:t");
    t.appendChild(doc.createTextNode(value));
    inline.appendChild(t);
    c.appendChild(inline);
  }
}
function assertUnmerged(doc: XmlDocument, address: string): void {
  const col = columnIndex(address);
  const row = Number(address.match(/\d+$/)![0]);
  for (const merge of elements(doc, "mergeCell")) {
    const [start, end] = (merge.getAttribute("ref") ?? "").split(":");
    if (!start || !end) continue;
    if (
      col >= columnIndex(start) &&
      col <= columnIndex(end) &&
      row >= Number(start.match(/\d+$/)![0]) &&
      row <= Number(end.match(/\d+$/)![0])
    ) {
      throw new Error(
        `${address}は結合セルです。メーター値のセル設定を確認してください。`,
      );
    }
  }
}
function relationshipPath(target: string): string {
  const parts: string[] = [];
  for (const p of (target.startsWith("/")
    ? target.slice(1)
    : `xl/${target}`
  ).split("/")) {
    if (p === "..") parts.pop();
    else if (p && p !== ".") parts.push(p);
  }
  return parts.join("/");
}
function periodFromHeader(value: string | number | null): string | null {
  if (
    value === null ||
    value === "" ||
    (typeof value === "string" && /^\s*年\s*月\s*$/.test(value))
  )
    return null;
  if (typeof value !== "string")
    throw new Error("対象月の見出し（A3）をYYYY年M月形式で設定してください。");
  const match = /^(\d{4})\s*(?:年|[-/])\s*(\d{1,2})\s*月?$/.exec(
    value.normalize("NFKC").trim(),
  );
  if (!match) throw new Error("対象月の見出し（A3）を確認してください。");
  return `${match[1]}-${match[2].padStart(2, "0")}`;
}

/**
 * Patch the original OOXML package, without converting to Google Sheets.
 * Only selected month-end meters and an empty month heading are changed.
 * Other ZIP entries (styles, images, printing settings, etc.) remain byte-identical.
 */
export function updateMonthlyWorkbook(
  input: Uint8Array,
  records: MeterRecord[],
  period: string,
  overwrite: boolean,
): { bytes: Uint8Array; changed: boolean } {
  if (!isPeriod(period) || !records.length)
    throw new Error("対象月と機械の記録が必要です。");
  let expanded = 0;
  const files = unzipSync(input, {
    filter: (entry) => {
      expanded += entry.originalSize;
      if (expanded > MAX_EXPANDED_BYTES)
        throw new Error("Excelファイルが大きすぎます。");
      return true;
    },
  });
  if (
    Object.keys(files).some((name) => /vbaProject|_xmlsignatures/i.test(name))
  )
    throw new Error("マクロ付き・署名付きのExcelは扱えません。");
  const workbook = xml(files["xl/workbook.xml"]);
  const rels = xml(files["xl/_rels/workbook.xml.rels"]);
  const strings = files["xl/sharedStrings.xml"]
    ? elements(xml(files["xl/sharedStrings.xml"]), "si").map((si) =>
        elements(si, "t")
          .map((t) => t.textContent)
          .join(""),
      )
    : [];
  const docs = new Map<string, XmlDocument>();
  const changedPaths = new Set<string>();
  const targets = new Set<string>();
  for (const record of records) {
    if (!Number.isFinite(record.value) || record.value < 0)
      throw new Error("メーター値が正しくありません。");
    const sheet = elements(workbook, "sheet").find(
      (s) => s.getAttribute("name") === record.machine.worksheetName,
    );
    if (!sheet)
      throw new Error(`${record.machine.name}: 対象シートが見つかりません。`);
    const id = sheet.getAttributeNS(REL, "id");
    const relationship = Array.from(
      rels.getElementsByTagNameNS(PACKAGE_REL, "Relationship"),
    ).find((r) => r.getAttribute("Id") === id);
    const target = relationship?.getAttribute("Target");
    if (!target || relationship?.getAttribute("TargetMode") === "External")
      throw new Error("Excelのシート参照を読み取れません。");
    const path = relationshipPath(target);
    const doc = docs.get(path) ?? xml(files[path]);
    docs.set(path, doc);
    const header = periodFromHeader(cellValue(doc, "A3", strings));
    if (header && header !== period)
      throw new Error(
        `${record.machine.name}: Excelは${header}の帳票です。対象月を確認してください。`,
      );
    if (!header) {
      setValue(
        doc,
        "A3",
        `${period.slice(0, 4)}年${Number(period.slice(5))}月`,
      );
      changedPaths.add(path);
    }
    const { previousMeterCell, currentMeterCell } = record.machine;
    for (const address of [previousMeterCell, currentMeterCell]) {
      if (!/^[A-Z]{1,3}[1-9]\d*$/.test(address))
        throw new Error("セル設定が正しくありません。");
      assertUnmerged(doc, address);
    }
    const key = `${path}:${currentMeterCell}`;
    if (targets.has(key)) throw new Error("保存先セルが重複しています。");
    targets.add(key);
    const previous = cellValue(doc, previousMeterCell, strings);
    if (previous !== null && previous !== "") {
      const parsed =
        typeof previous === "number" ? previous : parseUsageValue(previous);
      if (parsed === null || parsed < 0)
        throw new Error(
          `${record.machine.name}: 前月末メーターが数値ではありません。`,
        );
      if (record.value < parsed)
        throw new Error(
          `${record.machine.name}: 前月末の${parsed}時間を下回っています。`,
        );
    }
    const current = cellValue(doc, currentMeterCell, strings);
    if (current !== null && current !== "") {
      const parsed =
        typeof current === "number" ? current : parseUsageValue(current);
      if (parsed === record.value) continue; // Recovery after a completed upload with a lost response.
      if (!overwrite)
        throw new Error(
          `${record.machine.name}: 月末欄は入力済みです。修正する場合は「入力済みの記録を上書き」を選択してください。`,
        );
    }
    setValue(doc, currentMeterCell, record.value);
    changedPaths.add(path);
  }
  for (const path of changedPaths)
    files[path] = strToU8(serializer.serializeToString(docs.get(path)!));
  return {
    bytes: changedPaths.size ? zipSync(files, { level: 6 }) : input,
    changed: changedPaths.size > 0,
  };
}
