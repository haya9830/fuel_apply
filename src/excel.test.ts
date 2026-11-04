import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveRecords, XLSX_MIME } from "./excel";
const bytes = readFileSync(
  "outputs/0952_04免税証・免税軽油使用状況明細書_機械12台対応.xlsx",
);
const machine = JSON.parse(readFileSync("app.json", "utf8")).expo.extra
  .machines[0];
const args = {
  accessToken: "test",
  fileId: "test-file",
  records: [{ machine, value: 120.5 }],
  period: "2026-11",
  overwrite: false,
};
const metadata = (version = "1", mimeType = XLSX_MIME) =>
  new Response(
    JSON.stringify({
      id: "test-file",
      mimeType,
      size: String(bytes.length),
      version,
      capabilities: { canEdit: true, canDownload: true },
    }),
  );
afterEach(() => vi.unstubAllGlobals());
describe("Google Drive save", () => {
  it("downloads and uploads only on Save, and replaces the selected file once", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(metadata())
      .mockResolvedValueOnce(new Response(bytes))
      .mockResolvedValueOnce(metadata())
      .mockResolvedValueOnce(new Response("{}"));
    vi.stubGlobal("fetch", fetcher);
    expect(await saveRecords(args)).toEqual({ savedIds: [machine.id] });
    expect(fetcher.mock.calls.map((c) => c[1].method ?? "GET")).toEqual([
      "GET",
      "GET",
      "GET",
      "PATCH",
    ]);
    expect(fetcher.mock.calls[3][0]).toContain(
      "upload/drive/v3/files/test-file?uploadType=media",
    );
    expect(fetcher.mock.calls[3][1].body).toBeInstanceOf(Blob);
    expect(fetcher.mock.calls.every((c) => c[1].cache === "no-store")).toBe(
      true,
    );
  });
  it("refuses native Google Sheets to avoid unrequested file conversion", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        metadata("1", "application/vnd.google-apps.spreadsheet"),
      );
    vi.stubGlobal("fetch", fetcher);
    await expect(saveRecords(args)).rejects.toThrow(".xlsx");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not upload when the version changed during download", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(metadata())
      .mockResolvedValueOnce(new Response(bytes))
      .mockResolvedValueOnce(metadata("2"));
    vi.stubGlobal("fetch", fetcher);
    await expect(saveRecords(args)).rejects.toThrow("変更されました");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("keeps failures recoverable without returning saved IDs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
    await expect(saveRecords(args)).rejects.toThrow("通信できません");
  });
  it("rejects a failed upload instead of reporting success", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(metadata())
        .mockResolvedValueOnce(new Response(bytes))
        .mockResolvedValueOnce(metadata())
        .mockResolvedValueOnce(new Response("", { status: 403 })),
    );
    await expect(saveRecords(args)).rejects.toThrow("編集権限");
  });
});
