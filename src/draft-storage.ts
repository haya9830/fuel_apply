import AsyncStorage from "@react-native-async-storage/async-storage";
import { type Draft, restoreDraft } from "./records";
const KEY = "fuel-apply.monthly-draft.v2";
export async function loadDraft(fallback: Draft): Promise<Draft> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? restoreDraft(raw, fallback) : fallback;
}
export async function storeDraft(draft: Draft): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(draft));
}
