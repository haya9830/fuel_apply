import Constants from "expo-constants";
export type MachineConfig = {
  id: string;
  name: string;
  worksheetName: string;
  previousMeterCell: string;
  currentMeterCell: string;
};
type AppExtra = {
  google?: { clientId?: string; apiKey?: string; appId?: string };
  excel?: { fileId?: string; period?: string };
  machines?: MachineConfig[];
};
const extra = (Constants.expoConfig?.extra ?? {}) as AppExtra;
export const appConfig = {
  google: {
    clientId: extra.google?.clientId ?? "",
    apiKey: extra.google?.apiKey ?? "",
    appId: extra.google?.appId ?? "",
  },
  excel: {
    fileId: extra.excel?.fileId ?? "",
    period: extra.excel?.period ?? "",
  },
  machines: extra.machines ?? [],
};
export const isPlaceholder = (value: string): boolean =>
  !value.trim() || value.startsWith("YOUR_");
const columnNumber = (column: string): number =>
  [...column].reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0);
export function validateMachineConfig(machine: MachineConfig): string | null {
  if (
    !machine.id.trim() ||
    !machine.name.trim() ||
    !machine.worksheetName.trim()
  )
    return "機械のid・name・worksheetNameが必要です。";
  for (const cell of [machine.previousMeterCell, machine.currentMeterCell]) {
    const match = /^([A-Z]{1,3})([1-9]\d*)$/.exec(cell);
    if (!match || columnNumber(match[1]) > 16384 || Number(match[2]) > 1048576)
      return `${machine.name}のセル設定が正しくありません。`;
  }
  if (machine.previousMeterCell === machine.currentMeterCell)
    return `${machine.name}の前月末・月末セルが同一です。`;
  return null;
}
export function validateAppConfig(): string | null {
  if (Object.values(appConfig.google).some(isPlaceholder))
    return "管理者によるGoogle Driveの接続設定が必要です。入力画面はお試しいただけます。";
  if (
    appConfig.excel.period &&
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(appConfig.excel.period)
  )
    return "Excelの対象月の設定を確認してください。";
  if (!appConfig.machines.length) return "機械を1台以上設定してください。";
  const ids = new Set<string>();
  const targets = new Set<string>();
  for (const machine of appConfig.machines) {
    const error = validateMachineConfig(machine);
    if (error) return error;
    if (ids.has(machine.id)) return "機械IDが重複しています。";
    ids.add(machine.id);
    for (const cell of [machine.previousMeterCell, machine.currentMeterCell]) {
      const key = `${machine.worksheetName}:${cell}`;
      if (targets.has(key)) return "機械の保存先セルが重複しています。";
      targets.add(key);
    }
  }
  return null;
}
