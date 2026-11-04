import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { connectionForSave, signOut } from "./src/auth";
import { appConfig, validateAppConfig } from "./src/config";
import { loadDraft, storeDraft } from "./src/draft-storage";
import { DriveError, saveRecords } from "./src/excel";
import {
  createDraft,
  isPeriod,
  type Draft,
  type MeterRecord,
  prepareRecords,
} from "./src/records";
import { formatUsageValue, localToday } from "./src/validation";

const initialDraft = () =>
  createDraft(
    isPeriod(appConfig.excel.period)
      ? appConfig.excel.period
      : localToday().slice(0, 7),
    appConfig.machines,
  );
const configError = validateAppConfig();

export default function App() {
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [review, setReview] = useState<MeterRecord[] | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [draftStatus, setDraftStatus] = useState("下書きを読み込み中…");
  const saveLock = useRef(false);
  const writeQueue = useRef(Promise.resolve());
  const revision = useRef(0);

  useEffect(() => {
    let active = true;
    loadDraft(initialDraft())
      .then((value) => {
        if (active) {
          setDraft(value);
          setReady(true);
        }
      })
      .catch(() => {
        if (active)
          setStorageError(
            "下書きを読み込めませんでした。端末の保存設定をご確認ください。新しく始める場合は下書きをリセットしてください。",
          );
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const currentRevision = ++revision.current;
    setDraftStatus("下書きを保存中…");
    // Serialize native writes so an older write can never replace the latest draft.
    writeQueue.current = writeQueue.current
      .catch(() => {})
      .then(() => storeDraft(draft))
      .then(() => {
        if (currentRevision === revision.current) {
          setDraftStatus("下書きはこの端末に保存済み");
          setStorageError(null);
        }
      })
      .catch(() => {
        if (currentRevision === revision.current) {
          setDraftStatus("下書きを保存できません");
          setStorageError(
            "この端末に下書きを保存できません。画面を閉じると入力が失われる可能性があります。",
          );
        }
      });
  }, [draft, ready]);

  function edit(next: Draft) {
    setDraft(next);
    setReview(null);
    setError(null);
    setMessage(null);
    setOverwrite(false);
  }
  function reviewInput() {
    try {
      setReview(
        prepareRecords(
          draft,
          appConfig.machines,
          isPeriod(appConfig.excel.period)
            ? appConfig.excel.period
            : draft.period,
        ),
      );
      setError(null);
      setMessage(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "入力を確認してください。",
      );
    }
  }
  async function submit() {
    if (saveLock.current || !review || configError) return;
    saveLock.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      // Revalidate before opening sign-in; all cloud traffic starts here.
      const records = prepareRecords(
        draft,
        appConfig.machines,
        appConfig.excel.period || draft.period,
      );
      const connection = await connectionForSave();
      const result = await saveRecords({
        accessToken: connection.accessToken,
        fileId: connection.fileId,
        period: draft.period,
        records,
        overwrite,
      });
      setSavedIds((ids) => [...new Set([...ids, ...result.savedIds])]);
      setDraft((current) => ({
        ...current,
        entries: Object.fromEntries(
          Object.entries(current.entries).map(([id, entry]) => [
            id,
            result.savedIds.includes(id)
              ? { ...entry, selected: false }
              : entry,
          ]),
        ),
      }));
      setReview(null);
      setOverwrite(false);
      if (result.savedIds.length)
        setMessage(
          `${result.savedIds.length}台の月末アワーメーターをExcelに保存しました。`,
        );
    } catch (caught) {
      if (caught instanceof DriveError && caught.status === 401)
        await signOut();
      setError(
        caught instanceof Error
          ? caught.message
          : "保存できませんでした。通信を確認して再試行してください。",
      );
    } finally {
      setBusy(false);
      saveLock.current = false;
    }
  }
  const selected = Object.values(draft.entries).filter(
    (e) => e.selected,
  ).length;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.scroll}
        >
          <View style={s.page}>
            <View style={s.brand}>
              <View style={s.brandMark}>
                <Text style={s.brandLetter}>F</Text>
              </View>
              <Text style={s.brandText}>FUEL APPLY</Text>
              <Text style={s.tag}>月末の記録</Text>
            </View>
            <Text style={s.title}>
              今月のメーターを、{Platform.OS === "web" ? "\n" : ""}
              まとめて記録。
            </Text>
            <Text style={s.subtitle}>
              機械に表示されている累積時間を入力してください。{"\n"}
              保存を押したときだけ、Excelに接続します。
            </Text>
            <View style={s.periodCard}>
              <Text style={s.label}>対象月</Text>
              <TextInput
                accessibilityLabel="対象月"
                editable={ready && !busy}
                style={s.periodInput}
                value={draft.period}
                onChangeText={(period) => edit({ ...draft, period })}
                placeholder="YYYY-MM"
                maxLength={7}
              />
              <Text style={s.hint}>{draftStatus}</Text>
            </View>
            {configError && (
              <View style={s.notice}>
                <Text style={s.noticeTitle}>保存先の準備中</Text>
                <Text style={s.noticeText}>{configError}</Text>
              </View>
            )}
            {storageError && (
              <View style={s.error}>
                <Text style={s.errorText}>{storageError}</Text>
                {!ready && (
                  <Pressable
                    style={s.secondary}
                    onPress={() => {
                      setDraft(initialDraft());
                      setReady(true);
                    }}
                  >
                    <Text>下書きをリセットして始める</Text>
                  </Pressable>
                )}
              </View>
            )}
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>機械のアワーメーター</Text>
              <Text style={s.count}>
                {selected} / {appConfig.machines.length} 台を選択
              </Text>
            </View>
            <Text style={s.hint}>
              記録する機械にチェック。小数もそのまま入力できます。
            </Text>
            <View style={s.cards}>
              {appConfig.machines.map((machine, index) => {
                const entry = draft.entries[machine.id];
                return (
                  <View
                    key={machine.id}
                    style={[s.card, entry?.selected && s.cardSelected]}
                  >
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityLabel={`${machine.name}を記録`}
                      aria-checked={entry?.selected ?? false}
                      aria-disabled={!ready || busy}
                      disabled={!ready || busy}
                      onPress={() =>
                        edit({
                          ...draft,
                          entries: {
                            ...draft.entries,
                            [machine.id]: {
                              ...entry,
                              selected: !entry?.selected,
                            },
                          },
                        })
                      }
                      style={s.cardHeader}
                    >
                      <View
                        style={[s.check, entry?.selected && s.checkSelected]}
                      >
                        <Text style={s.checkText}>
                          {entry?.selected ? "✓" : ""}
                        </Text>
                      </View>
                      <View style={s.flex}>
                        <Text style={s.machineNo}>
                          MACHINE {String(index + 1).padStart(2, "0")}
                        </Text>
                        <Text style={s.machineName}>{machine.name}</Text>
                      </View>
                      {savedIds.includes(machine.id) && (
                        <Text style={s.saved}>保存済み</Text>
                      )}
                    </Pressable>
                    <Text style={s.label}>月末アワーメーター</Text>
                    <View style={s.inputWrap}>
                      <TextInput
                        accessibilityLabel={`${machine.name}の月末アワーメーター`}
                        editable={ready && !busy}
                        style={s.meterInput}
                        keyboardType="decimal-pad"
                        value={entry?.current ?? ""}
                        placeholder="0.0"
                        placeholderTextColor="#98a69f"
                        onChangeText={(current) => {
                          setSavedIds((ids) =>
                            ids.filter((id) => id !== machine.id),
                          );
                          edit({
                            ...draft,
                            entries: {
                              ...draft.entries,
                              [machine.id]: { selected: true, current },
                            },
                          });
                        }}
                      />
                      <Text style={s.unit}>時間</Text>
                    </View>
                  </View>
                );
              })}
            </View>
            {review && (
              <View style={s.review}>
                <Text style={s.sectionTitle}>保存内容の確認</Text>
                <Text style={s.reviewMonth}>
                  {draft.period.replace("-", "年 ")}月 · {review.length}台
                </Text>
                {review.map((r) => (
                  <View key={r.machine.id} style={s.reviewRow}>
                    <Text style={s.reviewName}>{r.machine.name}</Text>
                    <Text style={s.reviewValue}>
                      {formatUsageValue(r.value)} 時間
                    </Text>
                  </View>
                ))}
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityLabel="入力済みの記録を上書き"
                  aria-checked={overwrite}
                  aria-disabled={busy}
                  disabled={busy}
                  style={s.overwrite}
                  onPress={() => setOverwrite((v) => !v)}
                >
                  <View style={[s.check, overwrite && s.checkSelected]}>
                    <Text style={s.checkText}>{overwrite ? "✓" : ""}</Text>
                  </View>
                  <Text style={s.overwriteText}>入力済みの記録を上書き</Text>
                </Pressable>
                <Text style={s.hint}>
                  Googleで接続し、保存先のExcelを選びます。
                </Text>
              </View>
            )}
            {error && (
              <View accessibilityRole="alert" style={s.error}>
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}
            {message && (
              <View accessibilityRole="alert" style={s.success}>
                <Text style={s.successText}>{message}</Text>
              </View>
            )}
            <Pressable
              accessibilityRole="button"
              disabled={
                !ready || busy || (Boolean(review) && Boolean(configError))
              }
              onPress={review ? submit : reviewInput}
              style={[
                s.primary,
                (!ready || busy || (Boolean(review) && Boolean(configError))) &&
                  s.disabled,
              ]}
            >
              {busy ? (
                <View style={s.busy}>
                  <ActivityIndicator color="#fff" />
                  <Text style={s.primaryText}>認証・Excelへの保存中…</Text>
                </View>
              ) : (
                <Text style={s.primaryText}>
                  {review
                    ? `${review.length}台をExcelへ保存`
                    : "入力内容を確認する"}
                </Text>
              )}
            </Pressable>
            {review && !busy && (
              <Pressable
                accessibilityRole="button"
                style={s.secondary}
                onPress={() => setReview(null)}
              >
                <Text style={s.secondaryText}>入力に戻る</Text>
              </Pressable>
            )}
            <Text style={s.footer}>
              日別の稼働時間・給油量は、この画面では変更しません。{"\n"}
              保存中はほかの端末でExcelを編集しないでください。{"\n"}
              下書きはこの端末にのみ保存されます。
            </Text>
            <Pressable
              disabled={busy}
              onPress={async () => {
                await signOut();
                setMessage("この端末のGoogle接続を解除しました。");
              }}
              style={s.disconnect}
            >
              <Text style={s.hint}>Googleの接続を解除</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: "#f4f6f2" },
  scroll: { padding: 20, paddingBottom: 48, alignItems: "center" },
  page: { width: "100%", maxWidth: 760 },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    marginBottom: 30,
  },
  brandMark: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#245c44",
    alignItems: "center",
    justifyContent: "center",
  },
  brandLetter: { color: "#fff", fontSize: 20, fontWeight: "800" },
  brandText: {
    fontSize: 13,
    letterSpacing: 2,
    color: "#245c44",
    fontWeight: "800",
  },
  tag: { marginLeft: "auto", color: "#697a6f", fontSize: 12 },
  title: {
    fontSize: 32,
    lineHeight: 45,
    fontWeight: "800",
    color: "#193c2d",
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 14,
    marginBottom: 24,
    fontSize: 14,
    color: "#5d7164",
    lineHeight: 24,
  },
  periodCard: {
    backgroundColor: "#e8eee6",
    padding: 20,
    borderRadius: 18,
    marginBottom: 20,
  },
  label: { fontSize: 12, fontWeight: "600", color: "#607568", marginBottom: 8 },
  periodInput: {
    fontSize: 25,
    fontWeight: "700",
    color: "#214e38",
    paddingVertical: 5,
    marginBottom: 8,
  },
  hint: { fontSize: 12, color: "#6d7e73", lineHeight: 20 },
  notice: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#fff4d9",
    marginBottom: 20,
  },
  noticeTitle: { color: "#785b20", fontWeight: "700", marginBottom: 6 },
  noticeText: { color: "#785b20", lineHeight: 21, fontSize: 13 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 5,
  },
  sectionTitle: { color: "#234432", fontSize: 18, fontWeight: "700" },
  count: { marginLeft: "auto", fontSize: 12, color: "#65786b" },
  cards: { gap: 12, marginTop: 16, marginBottom: 24 },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dce4da",
    padding: 20,
    borderRadius: 18,
  },
  cardSelected: { borderColor: "#59846b", backgroundColor: "#fdfffc" },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 22,
    minHeight: 44,
  },
  check: {
    width: 23,
    height: 23,
    borderWidth: 1.5,
    borderColor: "#a5b5a9",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  checkSelected: { backgroundColor: "#2d6749", borderColor: "#2d6749" },
  checkText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  machineNo: {
    fontSize: 10,
    letterSpacing: 1.4,
    color: "#7c8d80",
    marginBottom: 4,
  },
  machineName: { fontSize: 17, fontWeight: "700", color: "#234432" },
  saved: { color: "#2d6749", fontSize: 12 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f4f7f1",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dce5d9",
    paddingHorizontal: 14,
  },
  meterInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 29,
    paddingVertical: 13,
    color: "#193c2d",
    fontWeight: "600",
  },
  unit: { color: "#758779", fontSize: 13, paddingLeft: 10 },
  review: {
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#b3c7b6",
    padding: 20,
    marginBottom: 20,
  },
  reviewMonth: {
    fontSize: 13,
    color: "#6d7e73",
    marginTop: 8,
    marginBottom: 12,
  },
  reviewRow: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: "#e9eee6",
  },
  reviewName: { flex: 1, color: "#3f5647" },
  reviewValue: { color: "#234432", fontWeight: "700" },
  overwrite: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    marginTop: 14,
    marginBottom: 8,
  },
  overwriteText: { fontSize: 13, color: "#665f42", flexShrink: 1 },
  error: {
    padding: 16,
    backgroundColor: "#ffede8",
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: { color: "#a43d27", lineHeight: 23, fontSize: 13 },
  success: {
    padding: 16,
    backgroundColor: "#dfefdc",
    borderRadius: 12,
    marginBottom: 16,
  },
  successText: { color: "#285336", lineHeight: 23, fontSize: 14 },
  primary: {
    backgroundColor: "#245c44",
    borderRadius: 14,
    minHeight: 56,
    padding: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.45 },
  busy: { flexDirection: "row", gap: 12, alignItems: "center" },
  secondary: { padding: 16, minHeight: 48, alignItems: "center" },
  secondaryText: { color: "#45634e", fontSize: 14 },
  footer: {
    marginTop: 18,
    fontSize: 11,
    lineHeight: 20,
    textAlign: "center",
    color: "#7a887d",
  },
  disconnect: { marginTop: 20, padding: 8, alignItems: "center" },
});
