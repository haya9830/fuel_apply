import type { MeterRecord } from "./records";
import { updateMonthlyWorkbook } from "./xlsx";
export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_BYTES = 5 * 1024 * 1024;
export type SaveResult = { savedIds: string[] };
export class DriveError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function request(
  url: string,
  token: string,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, ...init.headers },
    });
    if (response.ok) {
      // Keep the timeout active until the complete response body has arrived.
      const content = await response.arrayBuffer();
      if (content.byteLength > MAX_BYTES)
        throw new Error("このExcelは大きすぎます（上限5MB）。");
      return new Response(response.status === 204 ? null : content, {
        status: response.status,
        headers: response.headers,
      });
    }
    const messages: Record<number, string> = {
      401: "Googleの認証が切れました。もう一度保存してください。",
      403: "Excelへの編集権限を確認してください。",
      404: "Excelが見つかりません。保存先を選び直してください。",
      409: "ほかの編集と競合しています。少し待って再試行してください。",
      412: "保存中にExcelが変更されました。もう一度保存してください。",
      429: "アクセスが集中しています。少し待って再試行してください。",
    };
    throw new DriveError(
      response.status,
      messages[response.status] ??
        `Google Driveへの通信に失敗しました（${response.status}）。`,
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      throw new Error(
        "通信が時間切れになりました。入力を残しています。再試行してください。",
      );
    if (error instanceof TypeError)
      throw new Error(
        "通信できません。接続を確認して、もう一度保存してください。",
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
type Metadata = {
  id: string;
  mimeType: string;
  size: string;
  version: string;
  trashed?: boolean;
  capabilities?: { canEdit?: boolean; canDownload?: boolean };
};

/** All requests are triggered only by Save. Original workbook bytes exist in memory only. */
export async function saveRecords(args: {
  accessToken: string;
  fileId: string;
  records: MeterRecord[];
  period: string;
  overwrite: boolean;
}): Promise<SaveResult> {
  const id = encodeURIComponent(args.fileId);
  const url = `https://www.googleapis.com/drive/v3/files/${id}`;
  const metadataUrl = `${url}?fields=id,mimeType,size,version,trashed,capabilities(canEdit,canDownload)&supportsAllDrives=true`;
  const metadata = (await (
    await request(metadataUrl, args.accessToken)
  ).json()) as Metadata;
  if (metadata.mimeType !== XLSX_MIME)
    throw new Error(
      "保存先はExcel（.xlsx）を選んでください。Googleスプレッドシートへの変換は不要です。",
    );
  if (
    metadata.trashed ||
    !metadata.capabilities?.canEdit ||
    !metadata.capabilities?.canDownload
  )
    throw new Error("このExcelを読み書きする権限がありません。");
  if (
    !metadata.version ||
    !Number.isFinite(Number(metadata.size)) ||
    Number(metadata.size) > MAX_BYTES
  )
    throw new Error("このExcelは扱えません（上限5MB）。");
  const download = await request(
    `${url}?alt=media&supportsAllDrives=true`,
    args.accessToken,
  );
  const bytes = new Uint8Array(await download.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES)
    throw new Error("このExcelは大きすぎます（上限5MB）。");
  const updated = updateMonthlyWorkbook(
    bytes,
    args.records,
    args.period,
    args.overwrite,
  );
  // Best-effort conflict detection. Drive v3 does not document an atomic media CAS.
  // This check is NOT a lock: do not edit the same workbook simultaneously elsewhere.
  const latest = (await (
    await request(metadataUrl, args.accessToken)
  ).json()) as Metadata;
  if (latest.version !== metadata.version)
    throw new Error(
      "保存中にExcelが変更されました。入力を残しています。もう一度保存してください。",
    );
  if (updated.changed) {
    await request(
      `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media&supportsAllDrives=true&fields=id,version`,
      args.accessToken,
      {
        method: "PATCH",
        headers: { "Content-Type": XLSX_MIME },
        body: new Blob([updated.bytes as Uint8Array<ArrayBuffer>], {
          type: XLSX_MIME,
        }),
      },
    );
  }
  return { savedIds: args.records.map((r) => r.machine.id) };
}
