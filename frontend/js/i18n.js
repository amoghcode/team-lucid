export const languages = {
  en: "English", hi: "हिन्दी", as: "অসমীয়া", bn: "বাংলা", mni: "ꯃꯤꯇꯩ ꯂꯣꯟ"
};

const en = {
  appName: "SmritiAI", tagline: "Familiar moments. Gentle support.", demo: "Try the guided demo",
  login: "Sign in", register: "Create family account", email: "Email address", password: "Password",
  patientName: "Patient's name", pin: "Caregiver PIN", welcome: "Good to see you", today: "Today",
  wellness: "Cognitive wellness", notDiagnosis: "Engagement guidance only — not a diagnosis or medical advice.",
  dailyTasks: "Today's routine", medicine: "Take medicine", water: "Drink water", exercise: "Gentle exercise", activity: "Daily activity",
  mood: "How are you feeling?", streak: "day streak", games: "Games", reminders: "Reminders", companion: "Companion",
  voice: "Voice help", emergency: "Emergency help", emergencyNote: "This alerts your caregiver in the demo. It does not contact emergency services.",
  caregiver: "Caregiver view", home: "Home", back: "Back", sync: "Sync", online: "Online", offline: "Offline — changes are safe",
  play: "Play", easy: "Easy", medium: "Medium", hard: "Hard", score: "Score", accuracy: "Accuracy", done: "Done",
  memoryMatch: "Memory Match", objectRecall: "Object Recall", routineRecall: "Routine Recall", pattern: "Pattern Paths",
  familyGame: "Family Faces", emotion: "Sequence Memory", addReminder: "Add reminder", addFamily: "Add family member",
  name: "Full name", relationship: "Relationship", photo: "Photo", save: "Save", cancel: "Cancel", delete: "Delete", edit: "Edit",
  complete: "Complete", snooze: "Snooze 10 min", medication: "Medication", hydration: "Hydration", appointment: "Appointment",
  time: "Time", category: "Category", title: "Reminder", noReminders: "No reminders yet.", familyMemories: "Family memories",
  analytics: "Progress & insights", adherence: "Reminder adherence", activityLabel: "Activity", alerts: "Care alerts",
  report: "Download PDF report", achievements: "Achievements", signOut: "Sign out", unlock: "Caregiver access",
  enterPin: "Enter the 4–8 digit caregiver PIN", incorrectPin: "That PIN did not match.", who: "Who is this?",
  relationshipQ: "How are they related to you?", next: "Next", start: "Start game", remember: "Take a moment to remember these.",
  chooseMissing: "What comes next?", arrange: "Tap the activities in the right order.", supportive: "I am here with you.",
  companionPrompt: "Tell me what is on your mind", send: "Send", story: "Hear a story", install: "Install app", later: "Later",
  familyEmpty: "Add at least one family member to play.", demoMode: "Demo mode", resetDemo: "Reset demo", close: "Close"
};

export const dictionaries = {
  en,
  hi: { ...en, tagline: "परिचित पल। स्नेहपूर्ण सहारा।", demo: "निर्देशित डेमो आज़माएँ", login: "साइन इन", register: "परिवार खाता बनाएँ", welcome: "आपको देखकर अच्छा लगा", today: "आज", dailyTasks: "आज की दिनचर्या", mood: "आप कैसा महसूस कर रहे हैं?", games: "खेल", reminders: "याद दिलाना", companion: "साथी", voice: "आवाज़ सहायता", emergency: "आपात सहायता", caregiver: "देखभालकर्ता", home: "होम", back: "वापस", play: "खेलें", save: "सहेजें", cancel: "रद्द करें", analytics: "प्रगति और जानकारी", report: "PDF रिपोर्ट डाउनलोड करें", achievements: "उपलब्धियाँ", notDiagnosis: "केवल सहभागिता मार्गदर्शन — यह निदान या चिकित्सकीय सलाह नहीं है।" },
  as: { ...en, tagline: "চিনাকি মুহূৰ্ত। কোমল সহায়।", demo: "নিৰ্দেশিত ডেমো চাওক", login: "ছাইন ইন", register: "পৰিয়ালৰ একাউণ্ট খোলক", welcome: "আপোনাক দেখি ভাল লাগিল", today: "আজি", dailyTasks: "আজিৰ দৈনন্দিন কাম", mood: "আপুনি কেনে অনুভৱ কৰিছে?", games: "খেল", reminders: "সোঁৱৰাই দিয়া", companion: "সহচৰ", voice: "কণ্ঠ সহায়", emergency: "জৰুৰী সহায়", caregiver: "যত্ন লওঁতাৰ দিশ", home: "মুখ্যপৃষ্ঠা", back: "পিছলৈ", play: "খেলক", save: "সংৰক্ষণ", cancel: "বাতিল", analytics: "অগ্ৰগতি আৰু তথ্য", report: "PDF প্ৰতিবেদন লওক", achievements: "অৰ্জন", notDiagnosis: "কেৱল অংশগ্ৰহণৰ সহায় — ৰোগ নিৰ্ণয় বা চিকিৎসা পৰামৰ্শ নহয়।" },
  bn: { ...en, tagline: "পরিচিত মুহূর্ত। কোমল সহায়তা।", demo: "নির্দেশিত ডেমো দেখুন", login: "সাইন ইন", register: "পারিবারিক অ্যাকাউন্ট তৈরি করুন", welcome: "আপনাকে দেখে ভালো লাগছে", today: "আজ", dailyTasks: "আজকের রুটিন", mood: "আপনি কেমন অনুভব করছেন?", games: "খেলা", reminders: "স্মরণিকা", companion: "সঙ্গী", voice: "ভয়েস সহায়তা", emergency: "জরুরি সাহায্য", caregiver: "পরিচর্যাকারীর দৃশ্য", home: "হোম", back: "ফিরে যান", play: "খেলুন", save: "সংরক্ষণ", cancel: "বাতিল", analytics: "অগ্রগতি ও তথ্য", report: "PDF রিপোর্ট ডাউনলোড", achievements: "অর্জন", notDiagnosis: "শুধু অংশগ্রহণ নির্দেশনা — রোগ নির্ণয় বা চিকিৎসা পরামর্শ নয়।" },
  mni: { ...en, tagline: "ꯁꯛꯈꯪꯂꯕ ꯃꯇꯝꯁꯤꯡ꯫ ꯂꯤꯟꯁꯤꯡꯕ ꯃꯇꯦꯡ꯫", demo: "ꯗꯦꯃꯣ ꯌꯦꯡꯕ", login: "ꯁꯥꯏꯟ ꯏꯟ", register: "ꯏꯃꯨꯡꯒꯤ ꯑꯦꯀꯥꯎꯟꯠ ꯁꯦꯝꯕ", welcome: "ꯅꯪꯕꯨ ꯎꯕꯗ ꯍꯔꯥꯎꯏ", today: "ꯉꯁꯤ", games: "ꯁꯥꯟꯅꯕ", reminders: "ꯅꯤꯡꯁꯤꯡꯍꯟꯕ", companion: "ꯃꯔꯨꯞ", voice: "ꯈꯣꯟꯖꯦꯜ ꯃꯇꯦꯡ", emergency: "ꯑꯊꯨꯕ ꯃꯇꯦꯡ", caregiver: "ꯌꯦꯡꯁꯤꯟꯕ", home: "ꯌꯨꯝ", back: "ꯍꯟꯕ", play: "ꯁꯥꯟꯅꯕ", save: "ꯊꯝꯕ", cancel: "ꯀꯛꯊꯠꯄ", analytics: "ꯈꯨꯝꯃꯥꯡ ꯑꯃꯁꯨꯡ ꯋꯥꯔꯣꯜ", achievements: "ꯃꯥꯏꯄꯥꯛꯄ", notDiagnosis: "ꯁꯔꯨꯛ ꯌꯥꯕꯒꯤ ꯃꯇꯦꯡꯈꯛꯇꯃꯛ — ꯂꯥꯌꯣꯡ ꯈꯪꯗꯣꯛꯄ ꯅꯠꯇ꯭ꯔꯒ ꯂꯥꯏꯀꯨꯝ ꯄꯥꯎꯇꯥꯛ ꯅꯠꯇꯦ꯫" }
};

export function getLanguage() { return localStorage.getItem("smritiai_language") || "en"; }
export function setLanguage(code) { localStorage.setItem("smritiai_language", code); document.documentElement.lang = code; }
export function t(key) { return dictionaries[getLanguage()]?.[key] || en[key] || key; }
export function locale() { return ({ en: "en-IN", hi: "hi-IN", as: "as-IN", bn: "bn-IN", mni: "mni-Mtei-IN" })[getLanguage()]; }
