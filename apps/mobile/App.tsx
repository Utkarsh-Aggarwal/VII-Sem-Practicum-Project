import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, SafeAreaView, StatusBar, StyleSheet, View } from "react-native";
import { clearSession, getSession, Session, setLanguagePreference } from "./src/api";
import { getStoredLang, Lang, storeLang } from "./src/i18n";
import { SetupScreen } from "./src/screens/SetupScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { ChatScreen } from "./src/screens/ChatScreen";
import { CaregiverScreen } from "./src/screens/CaregiverScreen";

// One app, two sides: the patient side (Saathi, reminders, help) and the caretaker side (status,
// alerts, conversation summaries). The side and language are chosen on first launch.
export default function App() {
  const [session, setSessionState] = useState<Session | null | undefined>(undefined);
  const [lang, setLangState] = useState<Lang>("en");
  const [chatOpen, setChatOpen] = useState(false);

  const check = useCallback(async () => {
    setSessionState(await getSession());
  }, []);

  useEffect(() => {
    getStoredLang().then((l) => l && setLangState(l));
    check();
  }, [check]);

  const changeLang = useCallback(
    async (next: Lang) => {
      setLangState(next);
      await storeLang(next);
      // Patients' language also drives the companion and spoken reminders on the server.
      if (session?.role === "senior") setLanguagePreference(next).catch(() => {});
    },
    [session]
  );

  const handleSwitchProfile = useCallback(async () => {
    await clearSession();
    setChatOpen(false);
    setSessionState(null);
  }, []);

  let screen: React.ReactNode;
  if (session === undefined) {
    screen = (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  } else if (!session) {
    screen = <SetupScreen lang={lang} onLang={changeLang} onDone={check} />;
  } else if (session.role === "caregiver") {
    screen = <CaregiverScreen name={session.caregiver.name} lang={lang} onSignOut={handleSwitchProfile} />;
  } else if (chatOpen) {
    screen = <ChatScreen lang={lang} onBack={() => setChatOpen(false)} />;
  } else {
    screen = (
      <HomeScreen lang={lang} onChangeLang={changeLang} onSwitchProfile={handleSwitchProfile} onOpenChat={() => setChatOpen(true)} />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      {screen}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
