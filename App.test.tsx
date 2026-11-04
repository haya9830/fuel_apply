// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { connectionForSave } from "./src/auth";
import { loadDraft, storeDraft } from "./src/draft-storage";
import { saveRecords } from "./src/excel";
import type { Draft } from "./src/records";
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("./src/config", () => ({
  appConfig: {
    google: { clientId: "test", apiKey: "test", appId: "test" },
    excel: { period: "2026-11" },
    machines: [
      {
        id: "m1",
        name: "機械A",
        worksheetName: "入力",
        previousMeterCell: "J7",
        currentMeterCell: "J42",
      },
      {
        id: "m2",
        name: "機械B",
        worksheetName: "入力",
        previousMeterCell: "M7",
        currentMeterCell: "M42",
      },
    ],
  },
  validateAppConfig: () => null,
}));
vi.mock("./src/auth", () => ({ connectionForSave: vi.fn(), signOut: vi.fn() }));
vi.mock("./src/draft-storage", () => ({
  loadDraft: vi.fn((draft: Draft) => Promise.resolve(draft)),
  storeDraft: vi.fn(() => Promise.resolve()),
}));
vi.mock("./src/excel", () => ({
  saveRecords: vi.fn(),
  DriveError: class extends Error {},
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
async function fillForm() {
  render(<App />);
  await waitFor(() =>
    expect(
      (screen.getByLabelText("機械Aの月末アワーメーター") as HTMLInputElement)
        .readOnly,
    ).toBe(false),
  );
  fireEvent.change(screen.getByLabelText("機械Aの月末アワーメーター"), {
    target: { value: "1234.5" },
  });
  fireEvent.change(screen.getByLabelText("機械Bの月末アワーメーター"), {
    target: { value: "2345.6" },
  });
  fireEvent.click(screen.getByRole("button", { name: "入力内容を確認する" }));
}
describe("save-triggered communication", () => {
  it("uses only local drafts while opening, typing, selecting and reviewing", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await fillForm();
    expect(screen.getByText("保存内容の確認")).toBeTruthy();
    expect(connectionForSave).not.toHaveBeenCalled();
    expect(saveRecords).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    await waitFor(() => expect(storeDraft).toHaveBeenCalled());
  });
  it("sends multiple machines in one explicit save and deselects only after success", async () => {
    vi.mocked(connectionForSave).mockResolvedValue({
      accessToken: "test",
      fileId: "test",
    });
    vi.mocked(saveRecords).mockResolvedValue({ savedIds: ["m1", "m2"] });
    await fillForm();
    fireEvent.click(screen.getByRole("button", { name: "2台をExcelへ保存" }));
    await waitFor(() =>
      expect(
        screen.getByText("2台の月末アワーメーターをExcelに保存しました。"),
      ).toBeTruthy(),
    );
    expect(saveRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        period: "2026-11",
        records: [
          expect.objectContaining({ value: 1234.5 }),
          expect.objectContaining({ value: 2345.6 }),
        ],
      }),
    );
    expect(
      screen
        .getByRole("checkbox", { name: "機械Aを記録" })
        .getAttribute("aria-checked"),
    ).toBe("false");
  });
  it("keeps all values and selections when upload fails", async () => {
    vi.mocked(connectionForSave).mockResolvedValue({
      accessToken: "test",
      fileId: "test",
    });
    vi.mocked(saveRecords).mockRejectedValue(new Error("通信できません"));
    await fillForm();
    fireEvent.click(screen.getByRole("button", { name: "2台をExcelへ保存" }));
    await waitFor(() =>
      expect(screen.getByText("通信できません")).toBeTruthy(),
    );
    expect(
      (screen.getByLabelText("機械Aの月末アワーメーター") as HTMLInputElement)
        .value,
    ).toBe("1234.5");
    expect(
      screen
        .getByRole("checkbox", { name: "機械Aを記録" })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });
  it("restores a draft before enabling input", async () => {
    vi.mocked(loadDraft).mockImplementationOnce(async (draft) => ({
      ...draft,
      entries: { ...draft.entries, m1: { selected: true, current: "456.7" } },
    }));
    render(<App />);
    await waitFor(() =>
      expect(
        (screen.getByLabelText("機械Aの月末アワーメーター") as HTMLInputElement)
          .value,
      ).toBe("456.7"),
    );
    expect(connectionForSave).not.toHaveBeenCalled();
  });
});
