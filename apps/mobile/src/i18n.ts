import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Speech from "expo-speech";

// App language, chosen on the first screen. For patients it is also sent to the server so the
// companion, spoken reminders and hub use it too.

const STRINGS = {
  en: {
    // onboarding
    chooseLanguage: "Choose your language",
    chooseLanguageHint: "You can talk to the app in this language.",
    whoAreYou: "Who is using this phone?",
    patient: "Patient",
    patientHint: "I get reminders and talk to Saathi",
    caretaker: "Caretaker",
    caretakerHint: "I look after a family member",
    pairingCode: "Pairing code",
    pairingHint: "Your family can see this 6-digit code on their dashboard.",
    email: "Email",
    password: "Password",
    serverAddress: "Server address",
    connect: "Connect",
    next: "Next",
    couldntConnect: "Couldn't connect",
    // patient home
    morning: "Good morning",
    afternoon: "Good afternoon",
    evening: "Good evening",
    talkCaption: "Hold the button and talk to me",
    youSaid: "You said",
    feeling: "How are you feeling today?",
    great: "Great",
    okay: "Okay",
    notGreat: "Not great",
    thanksMood: "Thanks for letting us know! 💛",
    checkins: "Today's reminders",
    none: "No reminders scheduled for today. Enjoy your day!",
    yes: "Yes ✓",
    notYet: "Not yet",
    done: "Done ✓",
    missed: "Missed — did you take it now?",
    willRemind: "Okay — I'll remind you again soon.",
    tookItNow: "Yes, done now",
    dueNow: "It's time!",
    openChat: "💬  Chat with Saathi",
    help: "🆘  I need help",
    helpConfirmTitle: "Call for help?",
    helpConfirmBody: "This will alert your family right away.",
    helpYes: "Yes, alert them",
    cancel: "Cancel",
    quickQuestions: "A few quick questions",
    switch: "Switch profile / server",
    language: "भाषा: हिंदी में बदलें",
    voiceOn: "🔊 Read aloud: on",
    voiceOff: "🔈 Read aloud: off",
    noPopups: "Pop-up reminders need the full app build. While this app is open, I'll tell you when it's time.",
    // talking
    holdToTalk: "Hold to talk",
    listening: "Listening… let go when done",
    thinking: "Thinking…",
    speaking: "Speaking… tap to stop",
    tooShort: "Hold the button while you speak.",
    micDenied: "Please allow the microphone in Settings to talk.",
    // chat
    chatTitle: "Chat with Saathi",
    chatPlaceholder: "Type a message…",
    send: "Send",
    back: "‹ Back",
    chatEmpty: "Type a message, or hold the mic button and speak.",
    // caretaker
    hi: "Hi",
    familyToday: "Here's how your family is doing today.",
    noFamily: "Add a parent on the web dashboard to get started.",
    doneStat: "Done",
    pendingStat: "Pending",
    missedStat: "Missed",
    onIt: "I'm on it",
    lastTalk: "Last conversation",
    noTalk: "No conversations yet.",
    signOut: "Sign out / change server",
  },
  hi: {
    chooseLanguage: "अपनी भाषा चुनिए",
    chooseLanguageHint: "आप इसी भाषा में ऐप से बात कर सकेंगे।",
    whoAreYou: "यह फ़ोन कौन इस्तेमाल कर रहा है?",
    patient: "मरीज़ / बुज़ुर्ग",
    patientHint: "मुझे याद दिलाया जाए और मैं साथी से बात करूँ",
    caretaker: "देखभाल करने वाले",
    caretakerHint: "मैं परिवार के किसी सदस्य की देखभाल करता/करती हूँ",
    pairingCode: "पेयरिंग कोड",
    pairingHint: "यह 6 अंकों का कोड आपके परिवार के डैशबोर्ड पर है।",
    email: "ईमेल",
    password: "पासवर्ड",
    serverAddress: "सर्वर का पता",
    connect: "जोड़ें",
    next: "आगे",
    couldntConnect: "कनेक्ट नहीं हो पाया",
    morning: "सुप्रभात",
    afternoon: "नमस्ते",
    evening: "शुभ संध्या",
    talkCaption: "बटन दबाकर रखिए और मुझसे बात कीजिए",
    youSaid: "आपने कहा",
    feeling: "आज आप कैसा महसूस कर रहे हैं?",
    great: "बहुत अच्छा",
    okay: "ठीक",
    notGreat: "अच्छा नहीं",
    thanksMood: "बताने के लिए धन्यवाद! 💛",
    checkins: "आज के रिमाइंडर",
    none: "आज कोई रिमाइंडर नहीं है। दिन का आनंद लीजिए!",
    yes: "हाँ ✓",
    notYet: "अभी नहीं",
    done: "हो गया ✓",
    missed: "छूट गया — क्या अब ले लिया?",
    willRemind: "ठीक है — मैं थोड़ी देर में फिर याद दिलाऊँगी।",
    tookItNow: "हाँ, अब कर लिया",
    dueNow: "समय हो गया!",
    openChat: "💬  साथी से चैट करें",
    help: "🆘  मुझे मदद चाहिए",
    helpConfirmTitle: "मदद बुलाएँ?",
    helpConfirmBody: "इससे आपके परिवार को तुरंत सूचना मिलेगी।",
    helpYes: "हाँ, बताइए",
    cancel: "रद्द करें",
    quickQuestions: "कुछ छोटे सवाल",
    switch: "प्रोफ़ाइल / सर्वर बदलें",
    language: "Language: switch to English",
    voiceOn: "🔊 पढ़कर सुनाएँ: चालू",
    voiceOff: "🔈 पढ़कर सुनाएँ: बंद",
    noPopups: "पॉप-अप रिमाइंडर पूरे ऐप में आते हैं। जब तक यह ऐप खुला है, समय होने पर मैं बोलकर बताऊँगी।",
    holdToTalk: "दबाकर बोलिए",
    listening: "सुन रही हूँ… बोलने के बाद छोड़िए",
    thinking: "सोच रही हूँ…",
    speaking: "बोल रही हूँ… रोकने के लिए दबाइए",
    tooShort: "बोलते समय बटन दबाकर रखिए।",
    micDenied: "बात करने के लिए सेटिंग्स में माइक्रोफ़ोन की अनुमति दीजिए।",
    chatTitle: "साथी से चैट",
    chatPlaceholder: "संदेश लिखिए…",
    send: "भेजें",
    back: "‹ वापस",
    chatEmpty: "संदेश लिखिए, या माइक का बटन दबाकर बोलिए।",
    hi: "नमस्ते",
    familyToday: "आज आपका परिवार कैसा है, यहाँ देखिए।",
    noFamily: "शुरू करने के लिए वेब डैशबोर्ड पर माता-पिता को जोड़िए।",
    doneStat: "हो गया",
    pendingStat: "बाकी",
    missedStat: "छूटा",
    onIt: "मैं देख रहा/रही हूँ",
    lastTalk: "पिछली बातचीत",
    noTalk: "अभी कोई बातचीत नहीं।",
    signOut: "साइन आउट / सर्वर बदलें",
  },
} as const;

export type Lang = keyof typeof STRINGS;
export type StringKey = keyof (typeof STRINGS)["en"];

const LANG_KEY = "carecircle:lang";

export const asLang = (l?: string | null): Lang => (l === "hi" ? "hi" : "en");

export async function getStoredLang(): Promise<Lang | null> {
  const v = await AsyncStorage.getItem(LANG_KEY);
  return v ? asLang(v) : null;
}

export async function storeLang(lang: Lang) {
  await AsyncStorage.setItem(LANG_KEY, lang);
}

export function t(lang: Lang, key: StringKey) {
  return STRINGS[lang][key];
}

// On-device speech, used when the server has no ElevenLabs audio for a sentence.
export function say(text: string, lang: Lang, onDone?: () => void) {
  Speech.stop();
  Speech.speak(text.replace(/[^\p{L}\p{N}\p{P}\s]/gu, ""), {
    language: /[ऀ-ॿ]/.test(text) || lang === "hi" ? "hi-IN" : "en-IN",
    rate: 0.9,
    onDone,
    onStopped: onDone,
  });
}
