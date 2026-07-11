import type { MachineConfig } from "./config";

type GraphError = {
  error?: { message?: string };
};

function graphRangeUrl(workbookId: string, worksheetName: string, cellAddress: string): string {
  const itemId = encodeURIComponent(workbookId);
  const sheet = encodeURIComponent(worksheetName);
  const address = encodeURIComponent(cellAddress);
  return `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/workbook/worksheets('${sheet}')/range(address='${address}')`;
}

export function getMachineUsageCells(machine: MachineConfig, date: string): {
  hoursCell: string;
  minutesCell: string;
  fuelCell: string;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const day = match ? Number(match[3]) : NaN;
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error("日付はYYYY-MM-DD形式で指定してください。");
  }

  // The form has day 1 on row 10, day 2 on row 11, ..., day 31 on row 40.
  const row = day + 9;
  return {
    hoursCell: `${machine.hoursColumn}${row}`,
    minutesCell: `${machine.minutesColumn}${row}`,
    fuelCell: `${machine.fuelColumn}${row}`,
  };
}

async function updateRange(
  accessToken: string,
  workbookId: string,
  worksheetName: string,
  cellAddress: string,
  value: string | number,
): Promise<void> {
  const response = await fetch(graphRangeUrl(workbookId, worksheetName, cellAddress), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [[value]] }),
  });

  if (response.ok) return;

  let message = `Excelの更新に失敗しました（${response.status}）。`;
  try {
    const error = (await response.json()) as GraphError;
    if (error.error?.message) message += ` ${error.error.message}`;
  } catch {
    // Keep the status-based message when Graph returns a non-JSON error.
  }
  throw new Error(message);
}

async function readRange(
  accessToken: string,
  workbookId: string,
  worksheetName: string,
  cellAddress: string,
): Promise<unknown> {
  const response = await fetch(graphRangeUrl(workbookId, worksheetName, cellAddress), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Excelの読み込みに失敗しました（${response.status}）。`);
  }

  const result = (await response.json()) as { values?: unknown[][] };
  return result.values?.[0]?.[0] ?? null;
}

export async function readMachineUsage(args: {
  accessToken: string;
  workbookId: string;
  machine: MachineConfig;
  date: string;
}): Promise<{ hours: unknown; minutes: unknown; fuel: unknown }> {
  const cells = getMachineUsageCells(args.machine, args.date);
  const [hours, minutes, fuel] = await Promise.all([
    readRange(args.accessToken, args.workbookId, args.machine.worksheetName, cells.hoursCell),
    readRange(args.accessToken, args.workbookId, args.machine.worksheetName, cells.minutesCell),
    readRange(args.accessToken, args.workbookId, args.machine.worksheetName, cells.fuelCell),
  ]);
  return { hours, minutes, fuel };
}

export async function updateMachineUsage(args: {
  accessToken: string;
  workbookId: string;
  machine: MachineConfig;
  hours: number;
  minutes: number;
  fuel: number;
  date: string;
}): Promise<void> {
  const cells = getMachineUsageCells(args.machine, args.date);
  await Promise.all([
    updateRange(args.accessToken, args.workbookId, args.machine.worksheetName, cells.hoursCell, args.hours),
    updateRange(args.accessToken, args.workbookId, args.machine.worksheetName, cells.minutesCell, args.minutes),
    updateRange(args.accessToken, args.workbookId, args.machine.worksheetName, cells.fuelCell, args.fuel),
  ]);
}
