import Constants from "expo-constants";

export type MachineConfig = {
  id: string;
  name: string;
  worksheetName: string;
  hoursColumn: string;
  minutesColumn: string;
  fuelColumn: string;
};

type AppExtra = {
  auth?: { clientId?: string };
  excel?: { workbookId?: string; worksheetName?: string };
  machines?: MachineConfig[];
};

const extra = (Constants.expoConfig?.extra ?? {}) as AppExtra;

export const appConfig = {
  auth: {
    clientId: extra.auth?.clientId ?? "",
  },
  excel: {
    workbookId: extra.excel?.workbookId ?? "",
    worksheetName: extra.excel?.worksheetName ?? "入力",
  },
  machines: extra.machines ?? [],
};

export function isPlaceholder(value: string): boolean {
  return value.length === 0 || value.startsWith("YOUR_");
}

export function validateMachineConfig(machine: MachineConfig): string | null {
  if (!machine.id.trim() || !machine.name.trim() || !machine.worksheetName.trim()) {
    return "機械のidとnameは必須です。";
  }
  for (const [label, column] of [
    ["hoursColumn", machine.hoursColumn],
    ["minutesColumn", machine.minutesColumn],
    ["fuelColumn", machine.fuelColumn],
  ] as const) {
    if (!/^[A-Z]{1,3}$/.test(column)) {
      return `${machine.name}の${label}は列記号（例: H）で指定してください。`;
    }
  }
  return null;
}

export function validateAppConfig(): string | null {
  if (isPlaceholder(appConfig.auth.clientId)) {
    return "app.jsonのauth.clientIdを設定してください。";
  }
  if (isPlaceholder(appConfig.excel.workbookId)) {
    return "app.jsonのexcel.workbookIdを設定してください。";
  }
  if (!appConfig.excel.worksheetName.trim()) {
    return "app.jsonのexcel.worksheetNameを設定してください。";
  }
  if (appConfig.machines.length === 0) {
    return "app.jsonに機械設定を1件以上追加してください。";
  }
  for (const machine of appConfig.machines) {
    const error = validateMachineConfig(machine);
    if (error) return error;
  }
  return null;
}
