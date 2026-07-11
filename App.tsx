import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";

import { getAccessToken, getRedirectUri, signIn, signOut } from "./src/auth";
import { appConfig, MachineConfig, validateAppConfig } from "./src/config";
import { getMachineUsageCells, readMachineUsage, updateMachineUsage } from "./src/excel";
import { parseUsageValue } from "./src/validation";

const today = new Date().toISOString().slice(0, 10);

export default function App() {
  const configError = useMemo(() => validateAppConfig(), []);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [selectedMachineId, setSelectedMachineId] = useState<string>(
    appConfig.machines[0]?.id ?? "",
  );
  const [hoursInput, setHoursInput] = useState("");
  const [minutesInput, setMinutesInput] = useState("");
  const [fuelInput, setFuelInput] = useState("");
  const [recordDate, setRecordDate] = useState(today);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(configError);
  const [busy, setBusy] = useState(false);
  const [currentRecord, setCurrentRecord] = useState<{
    hours: unknown;
    minutes: unknown;
    fuel: unknown;
  } | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(false);

  const selectedMachine = appConfig.machines.find(
    (machine) => machine.id === selectedMachineId,
  );
  const inputCells = useMemo(() => {
    if (!selectedMachine) return null;
    try {
      return getMachineUsageCells(selectedMachine, recordDate);
    } catch {
      return null;
    }
  }, [recordDate, selectedMachine]);

  useEffect(() => {
    if (configError) return;
    getAccessToken(appConfig.auth.clientId)
      .then(setAccessToken)
      .catch(() => setAccessToken(null));
  }, [configError]);

  useEffect(() => {
    if (!accessToken || !selectedMachine) {
      setCurrentRecord(null);
      return;
    }

    let cancelled = false;
    setLoadingRecord(true);
    readMachineUsage({
      accessToken,
      workbookId: appConfig.excel.workbookId,
      machine: selectedMachine,
      date: recordDate,
    })
      .then((record) => {
        if (!cancelled) setCurrentRecord(record);
      })
      .catch(() => {
        if (!cancelled) setCurrentRecord(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingRecord(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, selectedMachineId]);

  const handleSignIn = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const token = await signIn(appConfig.auth.clientId);
      setAccessToken(token);
      setMessage("Microsoftアカウントに接続しました。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "サインインに失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedMachine) {
      setError("機械を選択してください。");
      return;
    }
    const hours = parseUsageValue(hoursInput);
    const minutes = parseUsageValue(minutesInput || "0");
    const fuel = parseUsageValue(fuelInput);
    if (hours === null || minutes === null || fuel === null) {
      setError("稼働時間（時・分）と給油量に0以上の数値を入力してください。");
      return;
    }
    if (minutes > 59 || !Number.isInteger(minutes)) {
      setError("分は0〜59の整数で入力してください。");
      return;
    }
    if (!recordDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      setError("日付はYYYY-MM-DD形式で入力してください。");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const token = await getAccessToken(appConfig.auth.clientId);
      if (!token) {
        setAccessToken(null);
        throw new Error("先にMicrosoftアカウントへサインインしてください。");
      }

      await updateMachineUsage({
        accessToken: token,
        workbookId: appConfig.excel.workbookId,
        machine: selectedMachine,
        hours,
        minutes,
        fuel,
        date: recordDate,
      });
      setAccessToken(token);
      setCurrentRecord({ hours, minutes, fuel });
      setHoursInput("");
      setMinutesInput("");
      setFuelInput("");
      setMessage(
        `${selectedMachine.name}の${recordDate}の使用状況をExcelへ保存しました。`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Excelへの保存に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setAccessToken(null);
    setMessage("サインアウトしました。");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <FlatList
          contentContainerStyle={styles.content}
          data={appConfig.machines}
          keyExtractor={(machine) => machine.id}
          ListHeaderComponent={
            <View>
              <Text style={styles.eyebrow}>FUEL APPLY</Text>
              <Text style={styles.title}>機械使用状況</Text>
              <Text style={styles.subtitle}>
                機械を選んで、今日の使用量をExcelへ記録します。
              </Text>

              <View style={styles.connectionCard}>
                <View>
                  <Text style={styles.cardLabel}>Excel接続</Text>
                  <Text style={styles.cardValue}>
                    {accessToken ? "接続済み" : "未接続"}
                  </Text>
                </View>
                {accessToken ? (
                  <Pressable style={styles.secondaryButton} onPress={handleSignOut}>
                    <Text style={styles.secondaryButtonText}>サインアウト</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={[styles.primaryButton, configError && styles.disabledButton]}
                    onPress={handleSignIn}
                    disabled={busy || Boolean(configError)}
                  >
                    <Text style={styles.primaryButtonText}>Microsoftに接続</Text>
                  </Pressable>
                )}
              </View>

              {configError && (
                <View style={styles.warningBox}>
                  <Text style={styles.warningTitle}>初期設定が必要です</Text>
                  <Text style={styles.warningText}>{configError}</Text>
                  <Text style={styles.helperText}>リダイレクトURI: {getRedirectUri()}</Text>
                </View>
              )}

              {error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}
              {message && (
                <View style={styles.successBox}>
                  <Text style={styles.successText}>{message}</Text>
                </View>
              )}

              <Text style={styles.sectionTitle}>機械を選択</Text>
            </View>
          }
          renderItem={({ item }: { item: MachineConfig }) => (
            <Pressable
              style={[styles.machineCard, selectedMachineId === item.id && styles.selectedMachineCard]}
              onPress={() => {
                setSelectedMachineId(item.id);
                setError(null);
                setMessage(null);
              }}
            >
              <View>
                <Text style={styles.machineName}>{item.name}</Text>
              <Text style={styles.machineMeta}>
                  {item.worksheetName} / 稼働時間・給油量
                </Text>
              </View>
              <View style={[styles.radio, selectedMachineId === item.id && styles.radioSelected]}>
                {selectedMachineId === item.id && <View style={styles.radioDot} />}
              </View>
            </Pressable>
          )}
          ListFooterComponent={
            <View style={styles.formCard}>
              <Text style={styles.sectionTitle}>使用量を入力</Text>
              <Text style={styles.selectedLabel}>
                選択中: {selectedMachine?.name ?? "未選択"}
              </Text>
              <View style={styles.currentRecordBox}>
                <Text style={styles.currentRecordLabel}>Excelの現在値</Text>
                {loadingRecord ? (
                  <ActivityIndicator color="#2563eb" size="small" />
                ) : currentRecord ? (
                  <Text style={styles.currentRecordValue}>
                    {currentRecord.hours === null && currentRecord.minutes === null && currentRecord.fuel === null
                      ? "未入力"
                      : `稼働 ${String(currentRecord.hours ?? 0)}時間 ${String(currentRecord.minutes ?? 0)}分 / 給油 ${String(currentRecord.fuel ?? 0)}ℓ`}
                  </Text>
                ) : (
                  <Text style={styles.currentRecordHint}>
                    接続後にExcelの値を読み込みます
                  </Text>
                )}
              </View>
              <Text style={styles.inputLabel}>記録日</Text>
              <TextInput
                value={recordDate}
                onChangeText={setRecordDate}
                style={styles.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
              />
              <View style={styles.inputRow}>
                <View style={styles.inputColumn}>
                  <Text style={styles.inputLabel}>稼働時間（時）</Text>
                  <TextInput
                    value={hoursInput}
                    onChangeText={setHoursInput}
                    style={styles.numberInput}
                    placeholder="例: 7"
                    placeholderTextColor="#9ca3af"
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.inputColumn}>
                  <Text style={styles.inputLabel}>稼働時間（分）</Text>
                  <TextInput
                    value={minutesInput}
                    onChangeText={setMinutesInput}
                    style={styles.numberInput}
                    placeholder="例: 30"
                    placeholderTextColor="#9ca3af"
                    keyboardType="number-pad"
                  />
                </View>
              </View>
              <Text style={styles.inputLabel}>給油量（ℓ）</Text>
              <TextInput
                value={fuelInput}
                onChangeText={setFuelInput}
                style={styles.usageInput}
                placeholder="例: 120.5"
                placeholderTextColor="#9ca3af"
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
              <Pressable
                style={[styles.saveButton, (busy || !selectedMachine) && styles.disabledButton]}
                onPress={handleSubmit}
                disabled={busy || !selectedMachine}
              >
                {busy ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.saveButtonText}>Excelへ保存する</Text>
                )}
              </Pressable>
              <Text style={styles.footerNote}>
                保存先: {selectedMachine && inputCells
                  ? `${selectedMachine.worksheetName} / ${inputCells.hoursCell}, ${inputCells.minutesCell}, ${inputCells.fuelCell}`
                  : "-"}
              </Text>
            </View>
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f6f7fb" },
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 44 },
  eyebrow: { color: "#2563eb", fontSize: 12, fontWeight: "800", letterSpacing: 2 },
  title: { color: "#111827", fontSize: 30, fontWeight: "800", marginTop: 6 },
  subtitle: { color: "#6b7280", fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 20 },
  connectionCard: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e5e7eb",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
    padding: 16,
  },
  cardLabel: { color: "#6b7280", fontSize: 12, fontWeight: "700" },
  cardValue: { color: "#111827", fontSize: 16, fontWeight: "700", marginTop: 4 },
  primaryButton: { backgroundColor: "#2563eb", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11 },
  primaryButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  secondaryButton: { borderColor: "#d1d5db", borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  secondaryButtonText: { color: "#374151", fontSize: 13, fontWeight: "700" },
  disabledButton: { opacity: 0.5 },
  warningBox: { backgroundColor: "#fffbeb", borderColor: "#fcd34d", borderRadius: 14, borderWidth: 1, marginBottom: 14, padding: 14 },
  warningTitle: { color: "#92400e", fontSize: 14, fontWeight: "800" },
  warningText: { color: "#92400e", fontSize: 13, lineHeight: 19, marginTop: 5 },
  helperText: { color: "#a16207", fontSize: 11, marginTop: 8 },
  errorBox: { backgroundColor: "#fef2f2", borderColor: "#fecaca", borderRadius: 14, borderWidth: 1, marginBottom: 14, padding: 14 },
  errorText: { color: "#b91c1c", fontSize: 13, lineHeight: 19 },
  successBox: { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0", borderRadius: 14, borderWidth: 1, marginBottom: 14, padding: 14 },
  successText: { color: "#047857", fontSize: 13, lineHeight: 19 },
  sectionTitle: { color: "#111827", fontSize: 18, fontWeight: "800", marginBottom: 10, marginTop: 8 },
  machineCard: { alignItems: "center", backgroundColor: "#ffffff", borderColor: "#e5e7eb", borderRadius: 16, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", marginBottom: 10, padding: 16 },
  selectedMachineCard: { backgroundColor: "#eff6ff", borderColor: "#60a5fa" },
  machineName: { color: "#111827", fontSize: 16, fontWeight: "800" },
  machineMeta: { color: "#6b7280", fontSize: 12, marginTop: 5 },
  radio: { alignItems: "center", borderColor: "#9ca3af", borderRadius: 12, borderWidth: 2, height: 22, justifyContent: "center", width: 22 },
  radioSelected: { borderColor: "#2563eb" },
  radioDot: { backgroundColor: "#2563eb", borderRadius: 6, height: 10, width: 10 },
  formCard: { backgroundColor: "#ffffff", borderColor: "#e5e7eb", borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 18 },
  selectedLabel: { color: "#2563eb", fontSize: 13, fontWeight: "700", marginBottom: 17 },
  currentRecordBox: { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0", borderRadius: 12, borderWidth: 1, marginBottom: 12, padding: 12 },
  currentRecordLabel: { color: "#166534", fontSize: 11, fontWeight: "800" },
  currentRecordValue: { color: "#166534", fontSize: 15, fontWeight: "800", marginTop: 4 },
  currentRecordHint: { color: "#4d7c0f", fontSize: 12, marginTop: 4 },
  inputLabel: { color: "#374151", fontSize: 13, fontWeight: "700", marginBottom: 7, marginTop: 8 },
  input: { backgroundColor: "#f9fafb", borderColor: "#d1d5db", borderRadius: 11, borderWidth: 1, color: "#111827", fontSize: 16, paddingHorizontal: 14, paddingVertical: 12 },
  inputRow: { flexDirection: "row", gap: 10 },
  inputColumn: { flex: 1 },
  numberInput: { backgroundColor: "#f9fafb", borderColor: "#d1d5db", borderRadius: 11, borderWidth: 1, color: "#111827", fontSize: 18, paddingHorizontal: 12, paddingVertical: 12 },
  usageInput: { backgroundColor: "#f9fafb", borderColor: "#2563eb", borderRadius: 11, borderWidth: 2, color: "#111827", fontSize: 24, paddingHorizontal: 14, paddingVertical: 12 },
  saveButton: { alignItems: "center", backgroundColor: "#111827", borderRadius: 12, justifyContent: "center", marginTop: 20, minHeight: 52 },
  saveButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  footerNote: { color: "#9ca3af", fontSize: 11, marginTop: 12, textAlign: "center" },
});
