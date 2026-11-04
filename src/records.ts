import type { MachineConfig } from "./config";
import { parseUsageValue } from "./validation";

export type MachineEntry = { selected: boolean; current: string };
export type Draft = {
  version: 2;
  period: string;
  entries: Record<string, MachineEntry>;
};
export type MeterRecord = { machine: MachineConfig; value: number };
export const isPeriod = (value: string): boolean =>
  /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

export function createDraft(period: string, machines: MachineConfig[]): Draft {
  return {
    version: 2,
    period,
    entries: Object.fromEntries(
      machines.map((m) => [m.id, { selected: false, current: "" }]),
    ),
  };
}

/** Restore local data defensively; never send an unchecked draft to Excel. */
export function restoreDraft(raw: string, fallback: Draft): Draft {
  const parsed = JSON.parse(raw) as Draft;
  if (parsed?.version !== 2 || !isPeriod(parsed.period) || !parsed.entries)
    throw new Error("下書きの形式が正しくありません。");
  const entries = { ...fallback.entries };
  for (const id of Object.keys(entries)) {
    const entry = parsed.entries[id];
    if (!entry) continue;
    if (
      typeof entry.selected !== "boolean" ||
      typeof entry.current !== "string"
    )
      throw new Error("下書きの機械データが正しくありません。");
    entries[id] = { selected: entry.selected, current: entry.current };
  }
  return { version: 2, period: parsed.period, entries };
}

/** Validate every selected machine before authentication or any cloud request. */
export function prepareRecords(
  draft: Draft,
  machines: MachineConfig[],
  period: string,
): MeterRecord[] {
  if (!isPeriod(draft.period))
    throw new Error("対象月をYYYY-MM形式で入力してください。");
  if (draft.period !== period)
    throw new Error(
      `このExcelの対象月は${period}です。対象月を確認してください。`,
    );
  const records: MeterRecord[] = [];
  for (const machine of machines) {
    const entry = draft.entries[machine.id];
    if (!entry?.selected) continue;
    const value = parseUsageValue(entry.current);
    if (value === null || value > Number.MAX_SAFE_INTEGER)
      throw new Error(
        `${machine.name}: 月末メーターに0以上の数値を入力してください。`,
      );
    records.push({ machine, value });
  }
  if (!records.length)
    throw new Error("記録する機械を1台以上選択してください。");
  return records;
}
