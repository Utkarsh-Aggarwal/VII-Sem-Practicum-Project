import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { caregiverLogin, errorMessage, getServerUrl, pairWithCode, setLanguagePreference, setServerUrl } from "../api";
import { Lang, t } from "../i18n";

type Role = "patient" | "caretaker";
type Step = "language" | "role" | "details";

// Onboarding: 1) language  2) patient or caretaker  3) pairing code / login.
export function SetupScreen({ lang, onLang, onDone }: { lang: Lang; onLang: (l: Lang) => void; onDone: () => void }) {
  const [step, setStep] = useState<Step>("language");
  const [role, setRole] = useState<Role>("patient");
  const [serverUrl, setServerUrlInput] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getServerUrl().then(setServerUrlInput);
  }, []);

  async function handleConnect() {
    setLoading(true);
    try {
      await setServerUrl(serverUrl);
      if (role === "patient") {
        await pairWithCode(code.trim());
        // The companion and spoken reminders should use the language chosen here.
        await setLanguagePreference(lang).catch(() => {});
      } else {
        await caregiverLogin(email.trim(), password);
      }
      onDone();
    } catch (e) {
      Alert.alert(t(lang, "couldntConnect"), errorMessage(e, "Please check the details and try again."));
    } finally {
      setLoading(false);
    }
  }

  const ready = serverUrl.length > 0 && (role === "patient" ? /^\d{6}$/.test(code.trim()) : email && password);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 24, paddingTop: 72 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>CareCircle</Text>

        {step === "language" && (
          <>
            <Text style={styles.title}>{t(lang, "chooseLanguage")}</Text>
            <Text style={styles.subtitle}>{t(lang, "chooseLanguageHint")}</Text>
            {(
              [
                ["en", "English", "Talk in English"],
                ["hi", "हिंदी", "हिंदी में बात करें"],
              ] as const
            ).map(([value, label, hint]) => (
              <TouchableOpacity
                key={value}
                style={[styles.bigChoice, lang === value && styles.choiceActive]}
                onPress={() => onLang(value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: lang === value }}
              >
                <Text style={[styles.bigChoiceText, lang === value && styles.choiceTextActive]}>{label}</Text>
                <Text style={styles.choiceHint}>{hint}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.bigButton} onPress={() => setStep("role")}>
              <Text style={styles.bigButtonText}>{t(lang, "next")} →</Text>
            </TouchableOpacity>
          </>
        )}

        {step === "role" && (
          <>
            <Text style={styles.title}>{t(lang, "whoAreYou")}</Text>
            {(
              [
                ["patient", "👵", t(lang, "patient"), t(lang, "patientHint")],
                ["caretaker", "👨‍👩‍👧", t(lang, "caretaker"), t(lang, "caretakerHint")],
              ] as const
            ).map(([value, emoji, label, hint]) => (
              <TouchableOpacity
                key={value}
                style={[styles.bigChoice, role === value && styles.choiceActive, { marginTop: 16 }]}
                onPress={() => {
                  setRole(value);
                  setStep("details");
                }}
              >
                <Text style={styles.choiceEmoji}>{emoji}</Text>
                <Text style={[styles.bigChoiceText, role === value && styles.choiceTextActive]}>{label}</Text>
                <Text style={styles.choiceHint}>{hint}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setStep("language")} style={styles.backLink}>
              <Text style={styles.backText}>{t(lang, "back")}</Text>
            </TouchableOpacity>
          </>
        )}

        {step === "details" && (
          <>
            <Text style={styles.title}>{role === "patient" ? t(lang, "patient") : t(lang, "caretaker")}</Text>
            <View style={{ height: 16 }} />
            {role === "patient" ? (
              <>
                <Text style={styles.label}>{t(lang, "pairingCode")}</Text>
                <Text style={styles.hint}>{t(lang, "pairingHint")}</Text>
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  value={code}
                  onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  keyboardType="number-pad"
                  maxLength={6}
                />
              </>
            ) : (
              <>
                <Text style={styles.label}>{t(lang, "email")}</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  placeholder="you@example.com"
                />
                <Text style={styles.label}>{t(lang, "password")}</Text>
                <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />
              </>
            )}

            <Text style={styles.label}>{t(lang, "serverAddress")}</Text>
            <TextInput
              style={styles.input}
              value={serverUrl}
              onChangeText={setServerUrlInput}
              placeholder="http://192.168.1.20:3000"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TouchableOpacity style={[styles.bigButton, !ready && { opacity: 0.5 }]} onPress={handleConnect} disabled={loading || !ready}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.bigButtonText}>{t(lang, "connect")}</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setStep("role")} style={styles.backLink}>
              <Text style={styles.backText}>{t(lang, "back")}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  brand: { fontSize: 16, fontWeight: "800", color: "#4f46e5", marginBottom: 12 },
  title: { fontSize: 30, fontWeight: "700", color: "#1e293b" },
  subtitle: { fontSize: 18, color: "#64748b", marginTop: 8, marginBottom: 20 },
  bigChoice: {
    borderWidth: 2,
    borderColor: "#e2e8f0",
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 20,
    marginBottom: 14,
    alignItems: "center",
  },
  choiceActive: { borderColor: "#4f46e5", backgroundColor: "#eef2ff" },
  bigChoiceText: { fontSize: 28, fontWeight: "800", color: "#334155" },
  choiceTextActive: { color: "#3730a3" },
  choiceHint: { fontSize: 16, color: "#64748b", marginTop: 4, textAlign: "center" },
  choiceEmoji: { fontSize: 40, marginBottom: 4 },
  label: { fontSize: 16, fontWeight: "600", color: "#334155", marginBottom: 8 },
  hint: { fontSize: 14, color: "#64748b", marginTop: -4, marginBottom: 8 },
  input: {
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    marginBottom: 20,
  },
  codeInput: { fontSize: 32, letterSpacing: 12, textAlign: "center", fontWeight: "700" },
  bigButton: { backgroundColor: "#4f46e5", borderRadius: 14, paddingVertical: 18, alignItems: "center", marginTop: 8 },
  bigButtonText: { color: "#fff", fontSize: 20, fontWeight: "700" },
  backLink: { marginTop: 18, alignItems: "center" },
  backText: { color: "#64748b", fontSize: 16, fontWeight: "600" },
});
