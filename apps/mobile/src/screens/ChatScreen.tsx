import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ChatMessage, endConversation, errorMessage, fetchChat, sendChat, VoiceReply } from "../api";
import { Lang, t } from "../i18n";
import { useVoiceTalk } from "../useVoiceTalk";
import { SaathiAvatar } from "../components/SaathiAvatar";

// The chatbot: type to Saathi (replies are read aloud), or hold the mic to speak.
export function ChatScreen({ lang, onBack }: { lang: Lang; onBack: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const scroll = useRef<ScrollViewInstance>(null);

  const append = useCallback(
    (role: ChatMessage["role"], content: string) =>
      setMessages((m) => [...m, { id: `${role}-${Date.now()}-${m.length}`, role, content, createdAt: new Date().toISOString() }]),
    []
  );

  const onTurn = useCallback(
    (turn: VoiceReply) => {
      if (turn.transcript) append("user", turn.transcript);
      append("assistant", turn.reply);
    },
    [append]
  );
  const voice = useVoiceTalk(lang, onTurn);

  useEffect(() => {
    fetchChat()
      .then(setMessages)
      .catch(() => {})
      .finally(() => setLoading(false));
    // Leaving the chat lets the server summarise the conversation for the family right away.
    return () => {
      endConversation().catch(() => {});
    };
  }, []);

  async function sendTyped() {
    const body = text.trim();
    if (!body || voice.phase === "thinking") return;
    setText("");
    append("user", body);
    voice.setPhase("thinking");
    try {
      const { reply } = await sendChat(body);
      append("assistant", reply);
      await voice.speak(reply, null);
    } catch (e) {
      voice.setPhase("idle");
      append("assistant", errorMessage(e, "Sorry, I couldn't hear you just now."));
    }
  }

  const phase = voice.phase;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={{ padding: 8, width: 80 }}>
          <Text style={styles.back}>{t(lang, "back")}</Text>
        </TouchableOpacity>
        <View style={{ alignItems: "center" }}>
          <SaathiAvatar phase={phase} size={44} />
        </View>
        <Text style={[styles.title, { width: 80, textAlign: "right" }]} numberOfLines={1}>
          Saathi
        </Text>
      </View>

      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
      >
        {loading && <ActivityIndicator color="#4f46e5" />}
        {!loading && messages.length === 0 && <Text style={styles.empty}>{t(lang, "chatEmpty")}</Text>}
        {messages.map((m) => (
          <TouchableOpacity
            key={m.id}
            activeOpacity={0.8}
            onPress={() => m.role === "assistant" && voice.speak(m.content, null)}
            style={[styles.bubble, m.role === "user" ? styles.mine : styles.theirs]}
          >
            <Text style={[styles.bubbleText, m.role === "user" && { color: "#fff" }]}>{m.content}</Text>
          </TouchableOpacity>
        ))}
        {phase === "thinking" && <ActivityIndicator color="#4f46e5" style={{ alignSelf: "flex-start", margin: 8 }} />}
      </ScrollView>

      <View style={styles.inputRow}>
        <Pressable
          onPressIn={voice.start}
          onPressOut={voice.stop}
          onPress={() => phase === "speaking" && voice.stopSpeaking()}
          disabled={phase === "thinking"}
          accessibilityLabel={t(lang, "holdToTalk")}
          style={[styles.micButton, phase === "listening" && { backgroundColor: "#e11d48" }, phase === "speaking" && { backgroundColor: "#059669" }]}
        >
          <Text style={{ fontSize: 24 }}>{phase === "speaking" ? "🔊" : "🎙️"}</Text>
        </Pressable>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={phase === "listening" ? t(lang, "listening") : t(lang, "chatPlaceholder")}
          multiline
        />
        <TouchableOpacity style={[styles.sendButton, !text.trim() && { opacity: 0.5 }]} onPress={sendTyped} disabled={!text.trim() || phase === "thinking"}>
          <Text style={styles.sendText}>{t(lang, "send")}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 44,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  back: { fontSize: 18, color: "#4f46e5", fontWeight: "600" },
  title: { fontSize: 18, fontWeight: "700", color: "#1e293b" },
  empty: { fontSize: 18, color: "#64748b", textAlign: "center", marginTop: 40, lineHeight: 26, paddingHorizontal: 12 },
  bubble: { maxWidth: "85%", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12 },
  mine: { alignSelf: "flex-end", backgroundColor: "#4f46e5" },
  theirs: { alignSelf: "flex-start", backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0" },
  bubbleText: { fontSize: 19, lineHeight: 26, color: "#1e293b" },
  inputRow: { flexDirection: "row", gap: 10, padding: 12, paddingBottom: 28, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#e2e8f0", alignItems: "flex-end" },
  micButton: { width: 54, height: 54, borderRadius: 27, backgroundColor: "#4f46e5", alignItems: "center", justifyContent: "center" },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    maxHeight: 120,
  },
  sendButton: { backgroundColor: "#4f46e5", borderRadius: 14, paddingHorizontal: 18, height: 54, justifyContent: "center" },
  sendText: { color: "#fff", fontSize: 18, fontWeight: "700" },
});
