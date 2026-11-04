/** This release is distributed as a PWA. Native Expo builds need their own Google OAuth client. */
export async function connectionForSave(): Promise<{
  accessToken: string;
  fileId: string;
}> {
  throw new Error("このリリースはスマートフォンのブラウザから開いてください。");
}
export async function signOut(): Promise<void> {}
