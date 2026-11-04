/// <reference types="google.accounts" />
/// <reference types="google.picker" />
/// <reference types="gapi" />
import { appConfig } from "./config";
import { XLSX_MIME } from "./excel";

let accessToken: string | undefined;
let expiresAt = 0;
let libraries: Promise<void> | undefined;
const SCOPE = "https://www.googleapis.com/auth/drive.file";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timer = window.setTimeout(() => {
      script.remove();
      reject(
        new Error("Googleへの接続が時間切れになりました。再試行してください。"),
      );
    }, 30_000);
    script.src = src;
    script.async = true;
    script.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      reject(new Error("Googleに接続できません。通信を確認してください。"));
    };
    document.head.appendChild(script);
  });
}
async function loadGoogle(): Promise<void> {
  if (!libraries) {
    libraries = Promise.all([
      loadScript("https://accounts.google.com/gsi/client"),
      loadScript("https://apis.google.com/js/api.js"),
    ])
      .then(
        () =>
          new Promise<void>((resolve, reject) => {
            gapi.load("picker", {
              callback: resolve,
              onerror: () =>
                reject(new Error("保存先の選択画面を開けませんでした。")),
              timeout: 30_000,
              ontimeout: () =>
                reject(new Error("Googleへの接続が時間切れになりました。")),
            });
          }),
      )
      .catch((error) => {
        libraries = undefined;
        throw error;
      });
  }
  return libraries;
}
async function tokenForSave(): Promise<string> {
  if (accessToken && expiresAt > Date.now() + 60_000) return accessToken;
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: appConfig.google.clientId,
      scope: SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(
            new Error(
              "Googleへの接続を完了できませんでした。もう一度保存してください。",
            ),
          );
          return;
        }
        accessToken = response.access_token;
        expiresAt = Date.now() + Number(response.expires_in) * 1000;
        resolve(accessToken);
      },
      error_callback: () =>
        reject(
          new Error(
            "Googleの接続画面が閉じられたか、開けませんでした。ポップアップを許可して、もう一度保存してください。",
          ),
        ),
    });
    client.requestAccessToken({ prompt: "" });
  });
}
async function pickWorkbook(token: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
      .setMimeTypes(XLSX_MIME)
      .setIncludeFolders(true);
    const picker = new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(appConfig.google.apiKey)
      .setAppId(appConfig.google.appId)
      .setOrigin(window.location.origin)
      .setLocale("ja")
      .setTitle("月末メーターを保存するExcelを選択")
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED) {
          const id = data.docs?.[0]?.id;
          if (!id) {
            reject(new Error("保存先のExcelを選択してください。"));
            picker.dispose();
            return;
          }
          if (appConfig.excel.fileId && id !== appConfig.excel.fileId) {
            reject(new Error("管理者が指定したExcelを選択してください。"));
            picker.dispose();
            return;
          }
          resolve(id);
          picker.dispose();
        } else if (data.action === google.picker.Action.CANCEL) {
          reject(
            new Error("保存先の選択をキャンセルしました。入力は残っています。"),
          );
          picker.dispose();
        }
      })
      .build();
    picker.setVisible(true);
  });
}
/** Load Google libraries, authorize and select a file only in the explicit Save flow. */
export async function connectionForSave(): Promise<{
  accessToken: string;
  fileId: string;
}> {
  await loadGoogle();
  const token = await tokenForSave();
  // Confirm the workbook every save, preventing an unnoticed carry-over to next month.
  const fileId = await pickWorkbook(token);
  return { accessToken: token, fileId };
}
export async function signOut(): Promise<void> {
  // Local disconnect: no network request or background token revocation.
  accessToken = undefined;
  expiresAt = 0;
}
