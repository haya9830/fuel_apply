import { type Draft, restoreDraft } from "./records";
const KEY = "fuel-apply.monthly-draft.v2";
export async function loadDraft(fallback: Draft): Promise<Draft> {
  const raw = localStorage.getItem(KEY);
  return raw ? restoreDraft(raw, fallback) : fallback;
}
export async function storeDraft(draft: Draft): Promise<void> {
  localStorage.setItem(KEY, JSON.stringify(draft));
}
