import {
  ArrowRight,
  BookOpen,
  Brain,
  CalendarClock,
  Check,
  ChevronDown,
  ClipboardList,
  Dumbbell,
  FileText,
  Flame,
  Import,
  Layers,
  Menu,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./supabase";

type Tab = "review" | "reader" | "add" | "dictionary" | "trainer" | "settings";
type Theme = "sekta" | "viper";
type StudyLanguage = "german" | "english";
type Article = "" | "der" | "die" | "das";
type ReviewGrade = "again" | "hard" | "good" | "easy";

type Card = {
  id: string;
  language?: StudyLanguage;
  russian: string;
  german: string;
  article?: Article;
  plural: string;
  grammar: string;
  example: string;
  association?: string;
  createdAt: string;
  nextReview: string;
  intervalDays: number;
  ease?: number;
  reviewStep?: number;
  attempts: number;
  correct: number;
  wrong: number;
  streak: number;
  lastReviewedAt?: string;
};

type NewCardInput = Omit<
  Card,
  "id" | "createdAt" | "nextReview" | "intervalDays" | "ease" | "reviewStep" | "attempts" | "correct" | "wrong" | "streak"
>;

type TrainerItem = {
  id: string;
  language?: StudyLanguage;
  russian: string;
  german: string;
  nextReview?: string;
  intervalDays?: number;
  reviewStep?: number;
  attempts: number;
  correct: number;
  wrong: number;
  streak?: number;
  createdAt: string;
  lastAnsweredAt?: string;
};

type ReaderBook = {
  id: string;
  language?: StudyLanguage;
  title: string;
  text: string;
  position: number;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
};

type StreakState = {
  count: number;
  lastStudyDate: string;
};

type UserProfile = {
  language: StudyLanguage;
  theme: Theme;
  onboarded: boolean;
};

type CloudState = {
  cards: Card[];
  trainerItems: TrainerItem[];
  streak: StreakState;
  readerText?: string;
  readerBooks?: ReaderBook[];
  profile?: UserProfile;
};

type SyncStatus = "local" | "loading" | "synced" | "saving" | "error";

const CARD_KEY = "deutsch-trainer.cards.v1";
const TRAINER_KEY = "deutsch-trainer.trainer.v1";
const STREAK_KEY = "deutsch-trainer.streak.v1";
const READER_KEY = "deutsch-trainer.reader.v1";
const READER_BOOKS_KEY = "deutsch-trainer.readerBooks.v1";
const PROFILE_KEY = "deutsch-trainer.profile.v1";
const REVIEW_INTERVALS = [1 / 24, 3 / 24, 12 / 24, 1, 3, 7, 14, 30];
const LEARNING_PHASE_STEPS = 4;
const TRAINER_BATCH_SIZE = 10;
const TRAINER_MASTERY_STREAK = 3;
const DICTIONARY_PAGE_SIZE = 80;

const LANGUAGE_COPY: Record<
  StudyLanguage,
  {
    brandMark: string;
    eyebrow: string;
    title: string;
    languageName: string;
    vibeName: string;
    todayLabel: string;
    reviewPrompt: string;
    emptyCardHint: string;
    addEyebrow: string;
    addHint: string;
    targetLabel: string;
    targetPlaceholder: string;
    formLabel: string;
    formPlaceholder: string;
    formExtraLabel: string;
    formExtraPlaceholder: string;
    exampleLabel: string;
    examplePlaceholder: string;
    dictionaryEyebrow: string;
    trainerEyebrow: string;
    trainerTitle: string;
    trainerImportHint: string;
    trainerImportPlaceholder: string;
    trainerEmptyHint: string;
    trainerPrompt: string;
    trainerAnswerPlaceholder: string;
    trainerHiddenHint: string;
  }
> = {
  german: {
    brandMark: "D",
    eyebrow: "немецкий · london rain",
    title: "London Rain",
    languageName: "Немецкий",
    vibeName: "London Rain",
    todayLabel: "Heute",
    reviewPrompt: "Переведи на немецкий",
    emptyCardHint: "Добавь первое немецкое слово, и оно сразу появится в очереди.",
    addEyebrow: "Neue Karte",
    addHint:
      "Пиши артикль прямо в начале поля: `der Tisch`, `die Tasche`, `das Obst`. Приложение подсветит его само.",
    targetLabel: "Немецкий с артиклем, если нужен",
    targetPlaceholder: "das Haus",
    formLabel: "Plural / форма",
    formPlaceholder: "die Häuser",
    formExtraLabel: "Мини-грамматика",
    formExtraPlaceholder: "например: kaufen + Akkusativ",
    exampleLabel: "Пример на немецком",
    examplePlaceholder: "Das Haus ist sehr alt.",
    dictionaryEyebrow: "Wortschatz",
    trainerEyebrow: "Satztraining",
    trainerTitle: "Тренажер предложений",
    trainerImportHint:
      "Вставь таблицу с колонками `Русский` и `Немецкий`, строки русский + Tab + немецкий, CSV через `;` или JSON: [{\"ru\":\"Я иду домой\",\"de\":\"Ich gehe nach Hause\"}].",
    trainerImportPlaceholder: "Я покупаю хлеб.\tIch kaufe Brot.\nМы живем в Берлине.;Wir wohnen in Berlin.",
    trainerEmptyHint:
      "После импорта приложение будет показывать русский вариант, а ты будешь писать немецкий и сравнивать с эталоном.",
    trainerPrompt: "Напиши по-немецки",
    trainerAnswerPlaceholder: "Deine Antwort...",
    trainerHiddenHint: "Сначала напиши вариант, потом сравним его с сохраненным немецким предложением.",
  },
  english: {
    brandMark: "V",
    eyebrow: "viperr english · b1 / b2 / c1",
    title: "VIPERR",
    languageName: "Английский",
    vibeName: "Kai Angel / Y2K glam",
    todayLabel: "VIPERR / TODAY",
    reviewPrompt: "Переведи на английский",
    emptyCardHint: "Добавь первое английское слово или выражение, и оно сразу появится в очереди.",
    addEyebrow: "New Drop",
    addHint:
      "Добавляй английские слова, фразы и устойчивые выражения. В поле формы можно писать уровень, часть речи или вариант произношения.",
    targetLabel: "Английский",
    targetPlaceholder: "to figure out",
    formLabel: "Форма / уровень",
    formPlaceholder: "B2 · phrasal verb",
    formExtraLabel: "Мини-грамматика",
    formExtraPlaceholder: "например: used to + V, Present Perfect",
    exampleLabel: "Пример на английском",
    examplePlaceholder: "I need to figure out what happened.",
    dictionaryEyebrow: "Glossy Lexicon",
    trainerEyebrow: "Sentence Lab",
    trainerTitle: "Тренажер предложений",
    trainerImportHint:
      "Вставь таблицу с колонками `Русский` и `Английский`, строки русский + Tab + английский, CSV через `;` или JSON: [{\"ru\":\"Я иду домой\",\"de\":\"I am going home\"}].",
    trainerImportPlaceholder: "Я не уверена.\tI'm not sure.\nОна уже ушла.;She has already left.",
    trainerEmptyHint:
      "После импорта приложение будет показывать русский вариант, а ты будешь писать английский и сравнивать с эталоном.",
    trainerPrompt: "Напиши по-английски",
    trainerAnswerPlaceholder: "Your answer...",
    trainerHiddenHint: "Сначала напиши вариант, потом сравним его с сохраненным английским предложением.",
  },
};

type LearningCopy = (typeof LANGUAGE_COPY)[StudyLanguage];

const THEME_OPTIONS: Record<Theme, { label: string; hint: string; mark: string }> = {
  sekta: { label: "London Rain", hint: "дождь, стекло, спокойный тёмный Лондон", mark: "L" },
  viper: { label: "Viper", hint: "леопард, Y2K, розовый глянец", mark: "V" },
};

const LANGUAGE_OPTIONS: Record<StudyLanguage, { label: string; hint: string }> = {
  german: { label: "Немецкий", hint: "артикли, примеры и немецкие подсказки" },
  english: { label: "Английский", hint: "B1-C1, английские фразы и тексты" },
};

const DEFAULT_PROFILE: UserProfile = {
  language: "german",
  theme: "sekta",
  onboarded: false,
};

const AUTH_BRAND = {
  brandMark: "L",
  eyebrow: "personal language trainer",
  title: "Language Trainer",
};

const today = () => startOfDay(new Date()).toISOString();

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function uid() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeProfile(profile?: Partial<UserProfile>): UserProfile {
  const language = profile?.language === "english" ? "english" : "german";
  const theme = profile?.theme === "viper" ? "viper" : "sekta";
  return {
    language,
    theme,
    onboarded: Boolean(profile?.onboarded),
  };
}

function existingUserProfile(profile?: Partial<UserProfile>): UserProfile {
  return {
    ...normalizeProfile(profile),
    onboarded: true,
  };
}

function withLanguage<T extends { language?: StudyLanguage }>(item: T, language: StudyLanguage): T {
  return item.language ? item : { ...item, language };
}

function normalizeAnswer(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("de-DE")
    .replace(/[.,!?;:()"«»„“]/g, "")
    .replace(/\s+/g, " ");
}

function addIntervalIso(days: number) {
  const date = new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  return date.toISOString();
}

function addIntervalFromIso(iso: string | undefined, days: number) {
  const date = iso ? new Date(iso) : new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  return date.toISOString();
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("ru", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatInterval(days: number) {
  const hours = Math.round(days * 24);
  if (hours < 24) return `${hours} ч.`;
  return `${Math.round(days)} дн.`;
}

function isDue(card: Card) {
  return new Date(card.nextReview).getTime() <= Date.now();
}

function isTrainerDue(item: TrainerItem) {
  return new Date(item.nextReview ?? today()).getTime() <= Date.now();
}

function accuracy(correct: number, attempts: number) {
  if (!attempts) return 0;
  return Math.round((correct / attempts) * 100);
}

function strengthLabel(card: Card) {
  const score = accuracy(card.correct, card.attempts);
  if (!card.attempts) return "новое";
  if (card.wrong >= 3 && score < 65) return "проблемное";
  if (completedReviewStep(card) <= LEARNING_PHASE_STEPS) return "закрепление";
  if (score >= 90 && card.intervalDays >= 14) return "выучено";
  if (score >= 75) return "знакомое";
  return "учится";
}

function stepFromInterval(intervalDays: number) {
  const index = REVIEW_INTERVALS.findIndex((interval) => interval >= intervalDays);
  return index === -1 ? REVIEW_INTERVALS.length - 1 : index;
}

function completedReviewStep(card: Card) {
  return card.reviewStep ?? stepFromInterval(card.intervalDays || 1);
}

function completedTrainerStep(item: TrainerItem) {
  return item.reviewStep ?? stepFromInterval(item.intervalDays || 1);
}

function intervalForCompletedStep(step: number) {
  return REVIEW_INTERVALS[Math.max(0, Math.min(step - 1, REVIEW_INTERVALS.length - 1))];
}

function normalizeCardSchedule(card: Card): Card {
  if (!card.attempts) {
    return { ...card, intervalDays: REVIEW_INTERVALS[0] };
  }
  const step = completedReviewStep(card);
  const expectedInterval = intervalForCompletedStep(step);
  if (card.intervalDays === expectedInterval) return card;

  return {
    ...card,
    intervalDays: expectedInterval,
    nextReview: addIntervalFromIso(card.lastReviewedAt ?? card.createdAt, expectedInterval),
  };
}

function normalizeTrainerSchedule(item: TrainerItem): TrainerItem {
  if (!item.attempts) {
    return { ...item, intervalDays: REVIEW_INTERVALS[0] };
  }
  const step = completedTrainerStep(item);
  const expectedInterval = intervalForCompletedStep(step);
  if ((item.intervalDays ?? 1) === expectedInterval) return item;

  return {
    ...item,
    intervalDays: expectedInterval,
    nextReview: addIntervalFromIso(item.lastAnsweredAt ?? item.createdAt, expectedInterval),
  };
}

function germanText(card: Card) {
  if (/^(der|die|das)\s+/i.test(card.german.trim())) {
    return card.german.trim();
  }
  return card.article ? `${card.article} ${card.german}` : card.german;
}

function leadingArticle(value: string): Article {
  const match = value.trim().match(/^(der|die|das)\b/i);
  return match ? (match[1].toLocaleLowerCase("de-DE") as Article) : "";
}

function GermanTerm({ value, className = "" }: { value: string; className?: string }) {
  const trimmed = value.trim();
  const article = leadingArticle(trimmed);
  if (!article) {
    return <span className={className}>{trimmed}</span>;
  }

  const rest = trimmed.replace(/^(der|die|das)\b/i, "").trimStart();
  return (
    <span className={`german-term ${className}`}>
      <span className={`article-token ${article}`}>{article}</span>
      {rest && <span>{rest}</span>}
    </span>
  );
}

function tokenizeText(text: string) {
  return text.match(/[\p{L}\p{M}]+(?:[-'][\p{L}\p{M}]+)*|[^\p{L}\p{M}]+/gu) ?? [];
}

function isWordToken(token: string) {
  return /[\p{L}\p{M}]/u.test(token);
}

function cleanReaderWord(word: string) {
  return word.replace(/^[^\p{L}\p{M}]+|[^\p{L}\p{M}]+$/gu, "");
}

function sentenceContext(text: string, word: string, startIndex: number) {
  const before = text.slice(0, startIndex);
  const after = text.slice(startIndex + word.length);
  const sentenceStart = Math.max(before.lastIndexOf("."), before.lastIndexOf("!"), before.lastIndexOf("?"), before.lastIndexOf("\n"));
  const afterStops = [after.indexOf("."), after.indexOf("!"), after.indexOf("?"), after.indexOf("\n")].filter((index) => index >= 0);
  const sentenceEnd = afterStops.length ? Math.min(...afterStops) : after.length;
  return text.slice(sentenceStart + 1, startIndex + word.length + sentenceEnd + (afterStops.length ? 1 : 0)).trim();
}

function titleFromText(text: string) {
  const firstLine = text.split(/\n+/).find((line) => line.trim())?.trim() ?? "";
  const cleaned = firstLine.replace(/\s+/g, " ");
  if (!cleaned) return "Новый текст";
  return cleaned.length > 42 ? `${cleaned.slice(0, 42).trim()}...` : cleaned;
}

function clampBookPosition(book: ReaderBook) {
  return Math.max(0, Math.min(book.position, Math.max(book.text.length - 1, 0)));
}

function readingProgress(book: ReaderBook) {
  if (book.completedAt) return 100;
  if (!book.text.trim()) return 0;
  return Math.min(100, Math.round((clampBookPosition(book) / book.text.length) * 100));
}

async function lookupGermanArticle(word: string): Promise<Article> {
  const title = word.charAt(0).toLocaleUpperCase("de-DE") + word.slice(1);
  const params = new URLSearchParams({
    action: "query",
    prop: "revisions",
    titles: title,
    rvprop: "content",
    rvslots: "main",
    format: "json",
    origin: "*",
  });

  try {
    const response = await fetch(`https://de.wiktionary.org/w/api.php?${params.toString()}`);
    if (!response.ok) return "";
    const payload = await response.json() as {
      query?: { pages?: Record<string, { revisions?: Array<{ slots?: { main?: { "*": string } } }> }> };
    };
    const page = Object.values(payload.query?.pages ?? {})[0];
    const content = page?.revisions?.[0]?.slots?.main?.["*"] ?? "";
    const genus = content.match(/\|\s*Genus\s*=\s*([mfn])/i)?.[1]?.toLocaleLowerCase("de-DE");
    if (genus === "m") return "der";
    if (genus === "f") return "die";
    if (genus === "n") return "das";
    return "";
  } catch {
    return "";
  }
}

async function lookupEnglishHint(word: string) {
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLocaleLowerCase("en"))}`);
    if (!response.ok) return "";
    const payload = await response.json() as Array<{
      meanings?: Array<{ partOfSpeech?: string; definitions?: Array<{ definition?: string }> }>;
    }>;
    const meaning = payload[0]?.meanings?.[0];
    const definition = meaning?.definitions?.[0]?.definition;
    return definition ? `${meaning.partOfSpeech ?? "word"}: ${definition}` : "";
  } catch {
    return "";
  }
}

async function translateReaderWord(word: string, from: "de" | "en", to: "ru" | "de" | "en") {
  if (from === to) return word;
  const params = new URLSearchParams({
    q: word,
    langpair: `${from}|${to}`,
  });

  try {
    const response = await fetch(`https://api.mymemory.translated.net/get?${params.toString()}`);
    if (response.ok) {
      const payload = await response.json() as {
        responseData?: { translatedText?: string };
        matches?: Array<{ translation?: string; match?: number }>;
      };
      const direct = payload.responseData?.translatedText?.trim();
      const bestMatch = payload.matches
        ?.filter((match) => match.translation?.trim())
        .sort((first, second) => (second.match ?? 0) - (first.match ?? 0))[0]?.translation?.trim();
      const translated = direct && direct.toLocaleLowerCase() !== word.toLocaleLowerCase() ? direct : bestMatch ?? "";
      if (translated && !translated.includes("MYMEMORY WARNING")) return translated.replace(/&#9633;\s*/g, "").trim();
    }
  } catch {
    // Fallback below.
  }

  const fallbackParams = new URLSearchParams({
    client: "gtx",
    sl: from,
    tl: to,
    dt: "t",
    q: word,
  });

  try {
    const response = await fetch(`https://translate.googleapis.com/translate_a/single?${fallbackParams.toString()}`);
    if (!response.ok) return "";
    const payload = await response.json() as unknown;
    if (!Array.isArray(payload) || !Array.isArray(payload[0])) return "";
    return payload[0].map((part) => Array.isArray(part) ? part[0] : "").join("").trim();
  } catch {
    return "";
  }
}

function updateCardAfterReview(card: Card, grade: ReviewGrade): Card {
  const wasCorrect = grade !== "again";
  const currentStep = completedReviewStep(card);
  const nextStep = wasCorrect ? Math.min(currentStep + 1, REVIEW_INTERVALS.length) : 0;
  const nextInterval = wasCorrect ? REVIEW_INTERVALS[Math.min(currentStep, REVIEW_INTERVALS.length - 1)] : REVIEW_INTERVALS[0];

  return {
    ...card,
    nextReview: addIntervalIso(nextInterval),
    intervalDays: nextInterval,
    reviewStep: nextStep,
    attempts: card.attempts + 1,
    correct: card.correct + (wasCorrect ? 1 : 0),
    wrong: card.wrong + (wasCorrect ? 0 : 1),
    streak: wasCorrect ? card.streak + 1 : 0,
    lastReviewedAt: new Date().toISOString(),
  };
}

function updateTrainerAfterAnswer(item: TrainerItem, correct: boolean): TrainerItem {
  const currentStep = completedTrainerStep(item);
  const nextStreak = correct ? (item.streak ?? 0) + 1 : 0;
  const isMasteredForToday = correct && nextStreak >= TRAINER_MASTERY_STREAK;
  const nextStep = isMasteredForToday ? Math.min(currentStep + 1, REVIEW_INTERVALS.length) : currentStep;
  const nextInterval = isMasteredForToday ? REVIEW_INTERVALS[Math.min(currentStep, REVIEW_INTERVALS.length - 1)] : item.intervalDays ?? 1;

  return {
    ...item,
    nextReview: isMasteredForToday ? addIntervalIso(nextInterval) : today(),
    intervalDays: nextInterval,
    reviewStep: nextStep,
    attempts: item.attempts + 1,
    correct: item.correct + (correct ? 1 : 0),
    wrong: item.wrong + (correct ? 0 : 1),
    streak: isMasteredForToday ? 0 : nextStreak,
    lastAnsweredAt: new Date().toISOString(),
  };
}

function parseTrainerImport(text: string): Array<Pick<TrainerItem, "russian" | "german">> {
  const trimmed = text.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => {
          if (typeof item !== "object" || item === null) return null;
          const record = item as Record<string, unknown>;
          const russian = String(record.russian ?? record.ru ?? record.prompt ?? "").trim();
          const german = String(record.german ?? record.de ?? record.answer ?? "").trim();
          return russian && german ? { russian, german } : null;
        })
        .filter(Boolean) as Array<Pick<TrainerItem, "russian" | "german">>;
    }
  } catch {
    // TSV/CSV import continues below.
  }

  const lines = trimmed.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const separator = lines[0]?.includes("\t") ? "\t" : lines[0]?.includes(";") ? ";" : ",";
  const rows = lines.map((line) => line.split(separator).map((part) => part.trim()));
  const header = rows[0]?.map((cell) => cell.toLocaleLowerCase("ru"));
  const russianIndex = header?.findIndex((cell) => ["русский", "ru", "russian", "prompt"].includes(cell)) ?? -1;
  const germanIndex = header?.findIndex((cell) => ["немецкий", "английский", "de", "en", "german", "english", "answer"].includes(cell)) ?? -1;
  const hasHeader = russianIndex >= 0 && germanIndex >= 0;

  return rows
    .slice(hasHeader ? 1 : 0)
    .map((row) => {
      const russian = hasHeader ? row[russianIndex] : row[0];
      const german = hasHeader ? row[germanIndex] : row[1];
      return russian && german ? { russian, german } : null;
    })
    .filter(Boolean) as Array<Pick<TrainerItem, "russian" | "german">>;
}

function usePersistentState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => readStorage(key, fallback));

  const setPersistentValue = (next: T | ((current: T) => T)) => {
    setValue((current) => {
      const resolved = typeof next === "function" ? (next as (current: T) => T)(current) : next;
      writeStorage(key, resolved);
      return resolved;
    });
  };

  return [value, setPersistentValue] as const;
}

export function App() {
  const [tab, setTab] = useState<Tab>("review");
  const [cards, setCards] = usePersistentState<Card[]>(CARD_KEY, []);
  const [trainerItems, setTrainerItems] = usePersistentState<TrainerItem[]>(TRAINER_KEY, []);
  const [streak, setStreak] = usePersistentState<StreakState>(STREAK_KEY, { count: 0, lastStudyDate: "" });
  const [readerText, setReaderText] = usePersistentState(READER_KEY, "");
  const [readerBooks, setReaderBooks] = usePersistentState<ReaderBook[]>(READER_BOOKS_KEY, []);
  const [profile, setProfile] = usePersistentState<UserProfile>(PROFILE_KEY, DEFAULT_PROFILE);
  const [activeBookId, setActiveBookId] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(!isSupabaseConfigured);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(isSupabaseConfigured ? "loading" : "local");
  const [syncMessage, setSyncMessage] = useState("");
  const [lastReviewedCard, setLastReviewedCard] = useState<Card | null>(null);
  const hasLoadedCloud = useRef(false);

  const didNormalizeSchedules = useRef(false);
  const normalizedProfile = normalizeProfile(profile);
  const activeLanguage = normalizedProfile.language;
  const theme = normalizedProfile.theme;
  const themeCopy = LANGUAGE_COPY[normalizedProfile.language];
  const cloudState = useMemo<CloudState>(() => ({ cards, trainerItems, streak, readerBooks, profile: normalizedProfile }), [cards, trainerItems, streak, readerBooks, normalizedProfile]);
  const activeCards = useMemo(() => cards.filter((card) => (card.language ?? activeLanguage) === activeLanguage), [cards, activeLanguage]);
  const activeTrainerPool = useMemo(() => trainerItems.filter((item) => (item.language ?? activeLanguage) === activeLanguage), [trainerItems, activeLanguage]);
  const activeReaderBooks = useMemo(() => readerBooks.filter((book) => (book.language ?? activeLanguage) === activeLanguage), [readerBooks, activeLanguage]);

  useEffect(() => {
    document.body.dataset.theme = isSupabaseConfigured && !session ? "auth" : theme;
  }, [session, theme]);

  useEffect(() => {
    if (didNormalizeSchedules.current) return;
    didNormalizeSchedules.current = true;

    setCards((current) => current.map((card) => withLanguage(normalizeCardSchedule(card), activeLanguage)));
    setTrainerItems((current) => current.map((item) => withLanguage(normalizeTrainerSchedule(item), activeLanguage)));
    setReaderBooks((current) => current.map((book) => withLanguage(book, activeLanguage)));
  }, [setCards, setTrainerItems, setReaderBooks, activeLanguage]);

  useEffect(() => {
    if (readerBooks.length || !readerText.trim()) return;
    const now = new Date().toISOString();
    const migrated: ReaderBook = {
      id: uid(),
      language: activeLanguage,
      title: titleFromText(readerText),
      text: readerText,
      position: 0,
      createdAt: now,
      updatedAt: now,
    };
    setReaderBooks([migrated]);
    setActiveBookId(migrated.id);
    setReaderText("");
  }, [readerBooks.length, readerText, setReaderBooks, setReaderText, activeLanguage]);

  useEffect(() => {
    if (!activeReaderBooks.length) {
      setActiveBookId("");
      return;
    }
    if (!activeBookId || !activeReaderBooks.some((book) => book.id === activeBookId)) {
      setActiveBookId(activeReaderBooks[0].id);
    }
  }, [activeBookId, activeReaderBooks]);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSyncStatus(data.session ? "loading" : "local");
      setAuthChecked(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      hasLoadedCloud.current = false;
      setSession(nextSession);
      setSyncStatus(nextSession ? "loading" : "local");
      setAuthChecked(true);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session || hasLoadedCloud.current) return;
    const client = supabase;

    let cancelled = false;
    setSyncStatus("loading");

    client
      .from("language_app_state")
      .select("data")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setSyncStatus("error");
          setSyncMessage(error.message);
          return;
        }

        const dataRecord = data as { data?: Partial<CloudState> } | null;
        const remote = dataRecord?.data;
        if (remote?.cards || remote?.trainerItems || remote?.streak || remote?.readerBooks || remote?.readerText || remote?.profile) {
          const remoteProfile = remote.profile ? normalizeProfile(remote.profile) : existingUserProfile();
          setCards((remote.cards ?? []).map((card) => withLanguage(normalizeCardSchedule(card), remoteProfile.language)));
          setTrainerItems((remote.trainerItems ?? []).map((item) => withLanguage(normalizeTrainerSchedule(item), remoteProfile.language)));
          setStreak(remote.streak ?? { count: 0, lastStudyDate: "" });
          setProfile(remoteProfile);
          if (remote.readerBooks?.length) {
            const booksWithLanguage = remote.readerBooks.map((book) => withLanguage(book, remoteProfile.language));
            setReaderBooks(booksWithLanguage);
            setActiveBookId(booksWithLanguage.find((book) => book.language === remoteProfile.language)?.id ?? booksWithLanguage[0].id);
            setReaderText("");
          } else {
            setReaderBooks([]);
            setReaderText(remote.readerText ?? "");
          }
        } else {
          await client.from("language_app_state").upsert({
            user_id: session.user.id,
            data: cloudState,
            updated_at: new Date().toISOString(),
          });
        }

        hasLoadedCloud.current = true;
        setSyncStatus("synced");
        setSyncMessage("");
      });

    return () => {
      cancelled = true;
    };
  }, [session, setCards, setTrainerItems, setStreak, setReaderBooks, setReaderText, cloudState]);

  useEffect(() => {
    if (!supabase || !session || !hasLoadedCloud.current) return;
    const client = supabase;

    setSyncStatus("saving");
    const timeout = window.setTimeout(async () => {
      const { error } = await client.from("language_app_state").upsert({
        user_id: session.user.id,
        data: cloudState,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        setSyncStatus("error");
        setSyncMessage(error.message);
      } else {
        setSyncStatus("synced");
        setSyncMessage("");
      }
    }, 650);

    return () => window.clearTimeout(timeout);
  }, [cloudState, session]);

  const dueCards = useMemo(
    () =>
      activeCards
        .filter(isDue)
        .sort((a, b) => new Date(a.nextReview).getTime() - new Date(b.nextReview).getTime()),
    [activeCards],
  );
  const dueTrainerItems = useMemo(
    () =>
      activeTrainerPool
        .filter(isTrainerDue)
        .sort((a, b) => new Date(a.nextReview ?? today()).getTime() - new Date(b.nextReview ?? today()).getTime()),
    [activeTrainerPool],
  );
  const activeTrainerItems = useMemo(() => dueTrainerItems.slice(0, TRAINER_BATCH_SIZE), [dueTrainerItems]);
  const difficultCards = activeCards.filter((card) => strengthLabel(card) === "проблемное").length;
  const totalAttempts = activeCards.reduce((sum, card) => sum + card.attempts, 0);
  const totalCorrect = activeCards.reduce((sum, card) => sum + card.correct, 0);
  const trainerAttempts = activeTrainerPool.reduce((sum, item) => sum + item.attempts, 0);
  const trainerCorrect = activeTrainerPool.reduce((sum, item) => sum + item.correct, 0);

  const markStudiedToday = () => {
    const current = today();
    if (streak.lastStudyDate === current) return;

    const yesterday = startOfDay(new Date());
    yesterday.setDate(yesterday.getDate() - 1);
    const continued = streak.lastStudyDate === yesterday.toISOString();
    setStreak({ count: continued ? streak.count + 1 : 1, lastStudyDate: current });
  };

  const addCard = (card: NewCardInput, nextTab: Tab = "review") => {
    const nextCard: Card = {
      ...card,
      id: uid(),
      language: activeLanguage,
      createdAt: new Date().toISOString(),
      nextReview: today(),
      intervalDays: REVIEW_INTERVALS[0],
      reviewStep: 0,
      attempts: 0,
      correct: 0,
      wrong: 0,
      streak: 0,
    };
    setCards((current) => [nextCard, ...current]);
    setTab(nextTab);
  };

  const reviewCard = (id: string, grade: ReviewGrade) => {
    const previous = cards.find((card) => card.id === id) ?? null;
    if (previous) setLastReviewedCard(previous);
    setCards((current) => current.map((card) => (card.id === id ? updateCardAfterReview(card, grade) : card)));
    markStudiedToday();
  };

  const undoLastReview = () => {
    if (!lastReviewedCard) return;
    setCards((current) => current.map((card) => (card.id === lastReviewedCard.id ? lastReviewedCard : card)));
    setLastReviewedCard(null);
  };

  const updateCard = (id: string, patch: Partial<Pick<Card, "russian" | "german" | "plural" | "grammar" | "example" | "association">>) => {
    setCards((current) => current.map((card) => (card.id === id ? { ...card, ...patch } : card)));
  };

  const deleteCard = (id: string) => {
    setCards((current) => current.filter((card) => card.id !== id));
  };

  const importTrainerItems = (items: Array<Pick<TrainerItem, "russian" | "german">>) => {
    const mapped = items.map((item) => ({
      ...item,
      id: uid(),
      language: activeLanguage,
      attempts: 0,
      correct: 0,
      wrong: 0,
      nextReview: today(),
      intervalDays: REVIEW_INTERVALS[0],
      reviewStep: 0,
      streak: 0,
      createdAt: new Date().toISOString(),
    }));
    setTrainerItems((current) => [...mapped, ...current]);
  };

  const answerTrainerItem = (id: string, correct: boolean) => {
    setTrainerItems((current) =>
      current.map((item) => (item.id === id ? updateTrainerAfterAnswer(item, correct) : item)),
    );
    markStudiedToday();
  };

  const clearTrainerItems = () => {
    setTrainerItems((current) => current.filter((item) => (item.language ?? activeLanguage) !== activeLanguage));
  };

  const createReaderBook = (text: string, title?: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    const book: ReaderBook = {
      id: uid(),
      language: activeLanguage,
      title: title?.trim() || titleFromText(trimmed),
      text: trimmed,
      position: 0,
      createdAt: now,
      updatedAt: now,
    };
    setReaderBooks((current) => [book, ...current]);
    setActiveBookId(book.id);
  };

  const updateReaderBook = (id: string, patch: Partial<Pick<ReaderBook, "title" | "text" | "position" | "completedAt">>) => {
    setReaderBooks((current) =>
      current.map((book) =>
        book.id === id
          ? {
              ...book,
              ...patch,
              title: patch.title ?? book.title,
              text: patch.text ?? book.text,
              position: Math.max(0, Math.min(patch.position ?? book.position, Math.max((patch.text ?? book.text).length - 1, 0))),
              updatedAt: new Date().toISOString(),
            }
          : book,
      ),
    );
  };

  const deleteReaderBook = (id: string) => {
    setReaderBooks((current) => current.filter((book) => book.id !== id));
  };

  const clearLocalState = () => {
    setCards([]);
    setTrainerItems([]);
    setStreak({ count: 0, lastStudyDate: "" });
    setReaderText("");
    setReaderBooks([]);
    setProfile(DEFAULT_PROFILE);
    setActiveBookId("");
  };

  const updateProfile = (patch: Partial<UserProfile>) => {
    setProfile((current) => normalizeProfile({ ...current, ...patch }));
  };

  if (isSupabaseConfigured && !authChecked) {
    return (
      <div className="auth-shell">
        <div className="brand auth-brand">
          <div className="brand-mark">{AUTH_BRAND.brandMark}</div>
          <div>
            <p className="eyebrow">{AUTH_BRAND.eyebrow}</p>
            <h1>{AUTH_BRAND.title}</h1>
          </div>
        </div>
        <div className="auth-card">
          <strong>Проверяю вход</strong>
          <p className="muted">Секунду, достаю сессию.</p>
        </div>
      </div>
    );
  }

  if (isSupabaseConfigured && !session) {
    return (
      <div className="auth-shell">
        <div className="brand auth-brand">
          <div className="brand-mark">{AUTH_BRAND.brandMark}</div>
          <div>
            <p className="eyebrow">{AUTH_BRAND.eyebrow}</p>
            <h1>{AUTH_BRAND.title}</h1>
          </div>
        </div>
        <SyncPanel session={session} syncStatus={syncStatus} syncMessage={syncMessage} onSignedOut={clearLocalState} />
      </div>
    );
  }

  if (!normalizedProfile.onboarded && (!isSupabaseConfigured || !session || hasLoadedCloud.current)) {
    return (
      <ProfileSetup
        profile={normalizedProfile}
        onSave={(nextProfile) => updateProfile({ ...nextProfile, onboarded: true })}
      />
    );
  }

  return (
    <div className={`app-shell ${tab === "review" ? "is-review-app" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">{THEME_OPTIONS[theme].mark}</div>
          <div>
            <p className="eyebrow">{THEME_OPTIONS[theme].label}</p>
            <h1>Language Trainer</h1>
          </div>
        </div>

        <nav className="nav-list" aria-label="Основная навигация">
          <TabButton icon={<Brain />} label="Повторение" active={tab === "review"} onClick={() => setTab("review")} badge={dueCards.length} />
          <TabButton icon={<FileText />} label="Чтение" active={tab === "reader"} onClick={() => setTab("reader")} />
          <TabButton icon={<Plus />} label="Добавить" active={tab === "add"} onClick={() => setTab("add")} />
          <TabButton icon={<BookOpen />} label="Словарь" active={tab === "dictionary"} onClick={() => setTab("dictionary")} />
          <TabButton icon={<Dumbbell />} label="Тренажер" active={tab === "trainer"} onClick={() => setTab("trainer")} badge={activeTrainerItems.length} />
          <TabButton icon={<Settings />} label="Настройки" active={tab === "settings"} onClick={() => setTab("settings")} />
        </nav>

        <div className="sidebar-sync">
          <SyncPanel session={session} syncStatus={syncStatus} syncMessage={syncMessage} onSignedOut={clearLocalState} />
        </div>

        <div className="sidebar-stats">
          <StatPill icon={<Flame />} label="Streak" value={`${streak.count} дн.`} />
          <StatPill icon={<Layers />} label="Слов" value={String(activeCards.length)} />
          <StatPill icon={<ClipboardList />} label="Точность" value={`${accuracy(totalCorrect, totalAttempts)}%`} />
        </div>
      </aside>

      <main className={`main-panel ${tab === "review" ? "is-review-mode" : ""} ${tab === "reader" ? "is-reader-mode" : ""}`}>
        {tab === "review" && (
          <Header
            due={dueCards.length}
            difficult={difficultCards}
            total={activeCards.length}
            themeCopy={themeCopy}
            profile={normalizedProfile}
            onQuickAdd={() => setTab("add")}
          />
        )}

        {tab === "review" && <ReviewView themeCopy={themeCopy} cards={dueCards} allCards={activeCards} onReview={reviewCard} onUndo={undoLastReview} canUndo={Boolean(lastReviewedCard)} onAdd={() => setTab("add")} />}
        {tab === "reader" && (
          <ReaderView
            theme={theme}
            themeCopy={themeCopy}
            language={normalizedProfile.language}
            books={activeReaderBooks}
            activeBookId={activeBookId}
            onSelectBook={setActiveBookId}
            onCreateBook={createReaderBook}
            onUpdateBook={updateReaderBook}
            onDeleteBook={deleteReaderBook}
            onAdd={(card) => addCard(card, "reader")}
          />
        )}
        {tab === "add" && <AddCardView themeCopy={themeCopy} onAdd={addCard} />}
        {tab === "dictionary" && <DictionaryView themeCopy={themeCopy} cards={activeCards} onUpdate={updateCard} onDelete={deleteCard} />}
        {tab === "trainer" && (
          <TrainerView
            themeCopy={themeCopy}
            items={activeTrainerItems}
            totalCount={activeTrainerPool.length}
            dueCount={dueTrainerItems.length}
            correctCount={trainerCorrect}
            attemptsCount={trainerAttempts}
            onImport={importTrainerItems}
            onAnswer={answerTrainerItem}
          />
        )}
        {tab === "settings" && (
          <SettingsView
            themeCopy={themeCopy}
            profile={normalizedProfile}
            onProfileChange={updateProfile}
            email={session?.user.email ?? ""}
            cardsCount={activeCards.length}
            trainerCount={activeTrainerPool.length}
            dueCards={dueCards.length}
            dueTrainerItems={dueTrainerItems.length}
            session={session}
            syncStatus={syncStatus}
            syncMessage={syncMessage}
            onSignedOut={clearLocalState}
            onClearTrainer={clearTrainerItems}
          />
        )}
      </main>
    </div>
  );
}

function SyncPanel({
  session,
  syncStatus,
  syncMessage,
  onSignedOut,
}: {
  session: Session | null;
  syncStatus: SyncStatus;
  syncMessage: string;
  onSignedOut: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const signInWithPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || !email.trim() || !password) return;
    setBusy(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (signInError) {
      setError(signInError.message);
    }
  };

  const signUpWithPassword = async () => {
    if (!supabase || !email.trim() || password.length < 6) return;
    setBusy(true);
    setError("");
    const { error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    setBusy(false);
    if (signUpError) {
      setError(signUpError.message);
    } else {
      setSent(true);
    }
  };

  const sendMagicLink = async () => {
    if (!supabase || !email.trim()) return;
    setBusy(true);
    setError("");
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    setBusy(false);
    if (otpError) {
      setError(otpError.message);
    } else {
      setSent(true);
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    onSignedOut();
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="sync-panel">
        <strong>Локальный режим</strong>
        <p>Добавь Supabase-ключи, чтобы включить синхронизацию.</p>
      </div>
    );
  }

  if (session) {
    return (
      <div className="sync-panel">
        <div className="sync-row">
          <strong>{syncStatus === "saving" ? "Сохраняю" : syncStatus === "loading" ? "Загружаю" : syncStatus === "error" ? "Ошибка" : "Синхронизировано"}</strong>
          <span className={`sync-dot ${syncStatus}`} />
        </div>
        <p>{session.user.email}</p>
        {syncMessage && <p className="sync-error">{syncMessage}</p>}
        <button className="text-button" onClick={signOut}>Выйти</button>
      </div>
    );
  }

  return (
    <form className="sync-panel auth-form" onSubmit={signInWithPassword}>
      <strong>Аккаунт</strong>
      <p>{sent ? "Если Supabase просит подтверждение, проверь почту." : "Войди или создай аккаунт. Каждый пользователь видит только свои карточки."}</p>
      <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email" type="email" />
      <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="пароль" type="password" minLength={6} />
      {error && <p className="sync-error">{error}</p>}
      <div className="auth-actions">
        <button className="primary-button" type="submit" disabled={busy || !email.trim() || !password}>
          {busy ? "Вхожу" : "Войти"}
        </button>
        <button className="secondary-button" type="button" onClick={signUpWithPassword} disabled={busy || !email.trim() || password.length < 6}>
          Создать
        </button>
      </div>
      <button className="text-button" type="button" onClick={sendMagicLink} disabled={busy || !email.trim()}>
        Отправить magic link
      </button>
    </form>
  );
}

function TabButton({
  icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button className={`nav-button ${active ? "is-active" : ""}`} onClick={onClick}>
      <span className="nav-icon">{icon}</span>
      <span>{label}</span>
      {typeof badge === "number" && badge > 0 && <span className="nav-badge tabular">{badge}</span>}
    </button>
  );
}

function StatPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="stat-pill">
      <span className="stat-icon">{icon}</span>
      <span>{label}</span>
      <strong className="tabular">{value}</strong>
    </div>
  );
}

function ProfileSetup({ profile, onSave }: { profile: UserProfile; onSave: (profile: UserProfile) => void }) {
  const [draft, setDraft] = useState<UserProfile>(profile);

  return (
    <div className="auth-shell setup-shell">
      <div className="brand auth-brand">
        <div className="brand-mark">{AUTH_BRAND.brandMark}</div>
        <div>
          <p className="eyebrow">{AUTH_BRAND.eyebrow}</p>
          <h1>{AUTH_BRAND.title}</h1>
        </div>
      </div>

      <div className="auth-card setup-card">
        <div>
          <p className="eyebrow">Первый запуск</p>
          <h2>Выбери язык и атмосферу</h2>
          <p className="muted">Это можно поменять позже в настройках. Аккаунт и карточки останутся твоими.</p>
        </div>

        <div className="choice-group">
          <span>Язык обучения</span>
          <div className="choice-grid">
            {(Object.keys(LANGUAGE_OPTIONS) as StudyLanguage[]).map((language) => (
              <button
                className={draft.language === language ? "is-active" : ""}
                key={language}
                onClick={() => setDraft((current) => ({ ...current, language }))}
              >
                <strong>{LANGUAGE_OPTIONS[language].label}</strong>
                <small>{LANGUAGE_OPTIONS[language].hint}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="choice-group">
          <span>Тема</span>
          <div className="choice-grid">
            {(Object.keys(THEME_OPTIONS) as Theme[]).map((theme) => (
              <button
                className={draft.theme === theme ? "is-active" : ""}
                key={theme}
                onClick={() => setDraft((current) => ({ ...current, theme }))}
              >
                <strong>{THEME_OPTIONS[theme].label}</strong>
                <small>{THEME_OPTIONS[theme].hint}</small>
              </button>
            ))}
          </div>
        </div>

        <button className="primary-button" onClick={() => onSave(draft)}>
          <Check size={18} />
          <span>Продолжить</span>
        </button>
      </div>
    </div>
  );
}

function Header({
  due,
  difficult,
  total,
  themeCopy,
  profile,
  onQuickAdd,
}: {
  due: number;
  difficult: number;
  total: number;
  themeCopy: LearningCopy;
  profile: UserProfile;
  onQuickAdd: () => void;
}) {
  return (
    <section className="top-band">
      <div>
        <div className="top-meta">
          <p className="eyebrow">{themeCopy.todayLabel}</p>
          <span className="language-badge">{LANGUAGE_OPTIONS[profile.language].label}</span>
        </div>
        <h2>Сегодня к повторению {due} карточек</h2>
        <p className="muted">
          В словаре {total} слов, проблемных сейчас {difficult}. Очередь пересчитывается после каждой самопроверки.
        </p>
      </div>
      <button className="primary-button quick-add-button" onClick={onQuickAdd} aria-label="Добавить слово">
        <Plus size={18} />
        <span className="quick-add-label">Добавить слово</span>
      </button>
    </section>
  );
}

function ReviewView({
  themeCopy,
  cards,
  allCards,
  onReview,
  onUndo,
  canUndo,
  onAdd,
}: {
  themeCopy: LearningCopy;
  cards: Card[];
  allCards: Card[];
  onReview: (id: string, grade: ReviewGrade) => void;
  onUndo: () => void;
  canUndo: boolean;
  onAdd: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [swipeStart, setSwipeStart] = useState<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeFeedback, setSwipeFeedback] = useState<"known" | "again" | null>(null);
  const didDrag = useRef(false);
  const [articleAnswer, setArticleAnswer] = useState<Article>("");
  const card = cards[0];
  const swipeThreshold = 92;
  const nextKnownInterval = card ? REVIEW_INTERVALS[Math.min(completedReviewStep(card), REVIEW_INTERVALS.length - 1)] : REVIEW_INTERVALS[0];
  const expectedArticle = card ? leadingArticle(germanText(card)) : "";
  const targetWithoutArticle = card ? germanText(card).replace(/^(der|die|das)\b/i, "").trimStart() : "";
  const needsArticleCheck = Boolean(card && expectedArticle && completedReviewStep(card) > LEARNING_PHASE_STEPS);
  const articlePassed = !needsArticleCheck || articleAnswer === expectedArticle;

  useEffect(() => {
    setRevealed(false);
    setSwipeStart(null);
    setSwipeOffset(0);
    setSwipeFeedback(null);
    didDrag.current = false;
    setArticleAnswer("");
  }, [card?.id]);

  if (!card) {
    return (
      <section className="empty-state">
        <Sparkles size={28} />
        <h3>{allCards.length ? "На сегодня все повторено" : "Пока нет карточек"}</h3>
        <p>{allCards.length ? "Можно добавить новые слова или перейти в тренажер предложений." : themeCopy.emptyCardHint}</p>
        <button className="primary-button" onClick={onAdd}>
          <Plus size={18} />
          <span>Добавить слово</span>
        </button>
      </section>
    );
  }

  const submitGrade = (grade: ReviewGrade) => {
    if (grade !== "again" && !articlePassed) {
      setRevealed(true);
      return;
    }
    onReview(card.id, grade);
    setRevealed(false);
    setSwipeStart(null);
    setSwipeOffset(0);
    setSwipeFeedback(null);
    setArticleAnswer("");
  };

  const submitSwipe = (grade: ReviewGrade, feedback: "known" | "again") => {
    setSwipeFeedback(feedback);
    window.setTimeout(() => submitGrade(grade), 140);
  };

  const beginSwipe = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    setSwipeStart(event.clientX);
    setSwipeOffset(0);
    setSwipeFeedback(null);
    didDrag.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveSwipe = (event: React.PointerEvent<HTMLDivElement>) => {
    if (swipeStart === null) return;
    event.preventDefault();
    const nextOffset = event.clientX - swipeStart;
    const cappedOffset = Math.max(-170, Math.min(170, nextOffset));
    if (Math.abs(cappedOffset) > 8) didDrag.current = true;
    setSwipeOffset(cappedOffset);
    if (cappedOffset > swipeThreshold * 0.55) setSwipeFeedback("known");
    else if (cappedOffset < -swipeThreshold * 0.55) setSwipeFeedback("again");
    else setSwipeFeedback(null);
  };

  const endSwipe = () => {
    if (swipeOffset > swipeThreshold) {
      if (!articlePassed) {
        setRevealed(true);
        setSwipeStart(null);
        setSwipeOffset(0);
        setSwipeFeedback(null);
        return;
      }
      submitSwipe("good", "known");
      return;
    }
    if (swipeOffset < -swipeThreshold) {
      submitSwipe("again", "again");
      return;
    }
    setSwipeStart(null);
    setSwipeOffset(0);
    setSwipeFeedback(null);
  };

  const flipCard = () => {
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }
    if (Math.abs(swipeOffset) > 12) return;
    setRevealed((value) => !value);
  };

  return (
    <section className="review-layout">
      <div
        className={`review-card swipe-card flip-card ${revealed ? "is-flipped" : ""} ${swipeStart !== null ? "is-dragging" : ""} ${swipeFeedback ? `swipe-${swipeFeedback}` : ""}`}
        onPointerDown={beginSwipe}
        onPointerMove={moveSwipe}
        onPointerUp={endSwipe}
        onPointerCancel={endSwipe}
        onClick={flipCard}
        style={{
          transform: `translateX(${swipeOffset}px) rotate(${swipeOffset / 28}deg)`,
        }}
      >
        <div className="flip-inner">
          <div className="card-face card-front">
            <div className="swipe-feedback">
              {swipeFeedback === "known" ? (
                <>
                  <Check size={18} />
                  <span>Знаю · через {formatInterval(nextKnownInterval)}</span>
                </>
              ) : swipeFeedback === "again" ? (
                <>
                  <X size={18} />
                  <span>Не знаю · через {formatInterval(REVIEW_INTERVALS[0])}</span>
                </>
              ) : (
                <span>{needsArticleCheck ? "Нажми и проверь артикль" : "Нажми, чтобы перевернуть"}</span>
              )}
            </div>
            <div className="card-meta">
              <span>{strengthLabel(card)}</span>
              <span className="tabular">{accuracy(card.correct, card.attempts)}%</span>
            </div>
            <p className="prompt-label">{themeCopy.reviewPrompt}</p>
            <h3>{card.russian}</h3>
          </div>

          <div className="card-face card-back">
            <div className="card-meta">
              <span>{needsArticleCheck ? "строгая проверка" : "ответ"}</span>
              <span className="tabular">{accuracy(card.correct, card.attempts)}%</span>
            </div>
            <div className="answer-panel">
              <p className="answer-word answer-hero">
                <GermanTerm value={germanText(card)} />
              </p>
              <p className="answer-translation">{card.russian}</p>
              <div className="answer-details">
                {card.plural && (
                  <div>
                    <span>Plural</span>
                    <strong>{card.plural}</strong>
                  </div>
                )}
                {card.grammar && (
                  <div>
                    <span>Грамматика</span>
                    <strong>{card.grammar}</strong>
                  </div>
                )}
                {card.example && (
                  <div>
                    <span>Пример</span>
                    <strong>{card.example}</strong>
                  </div>
                )}
                {card.association && (
                  <div>
                    <span>Ассоциация</span>
                    <strong>{card.association}</strong>
                  </div>
                )}
              </div>
            </div>

            {needsArticleCheck && (
              <div className="article-check" onClick={(event) => event.stopPropagation()}>
                <p className="prompt-label">Артикль для {targetWithoutArticle}</p>
                <div className="article-options">
                  {(["der", "die", "das"] as Article[]).map((article) => (
                    <button
                      className={`article-choice ${articleAnswer === article ? "is-selected" : ""} ${articleAnswer && expectedArticle === article ? "is-correct" : ""}`}
                      key={article}
                      onClick={() => setArticleAnswer(article)}
                    >
                      {article}
                    </button>
                  ))}
                </div>
                {articleAnswer && (
                  <p className={`article-result ${articlePassed ? "ok" : "diff"}`}>
                    {articlePassed ? "Верно, можно свайпать вправо" : `Нужен артикль ${expectedArticle}`}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grade-grid">
        <button className="grade-button again" onClick={() => submitGrade("again")}>
          <X size={18} />
          <span>Не знаю</span>
        </button>
        <button className="grade-button good" onClick={() => submitGrade("good")} disabled={!articlePassed}>
          <Check size={18} />
          <span>Знаю</span>
        </button>
      </div>
      <button className="review-undo-button" onClick={onUndo} disabled={!canUndo} aria-label="Вернуть предыдущую карточку">
        <ArrowRight className="is-back" size={18} />
        <span>Назад</span>
      </button>
    </section>
  );
}

function ReaderView({
  theme,
  themeCopy,
  language,
  books,
  activeBookId,
  onSelectBook,
  onCreateBook,
  onUpdateBook,
  onDeleteBook,
  onAdd,
}: {
  theme: Theme;
  themeCopy: LearningCopy;
  language: StudyLanguage;
  books: ReaderBook[];
  activeBookId: string;
  onSelectBook: (id: string) => void;
  onCreateBook: (text: string, title?: string) => void;
  onUpdateBook: (id: string, patch: Partial<Pick<ReaderBook, "title" | "text" | "position" | "completedAt">>) => void;
  onDeleteBook: (id: string) => void;
  onAdd: (card: NewCardInput) => void;
}) {
  const [selected, setSelected] = useState<{
    word: string;
    context: string;
    offset: number;
    anchor: { x: number; y: number; placement: "above" | "below" };
  } | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [showNewBook, setShowNewBook] = useState(!books.length);
  const [showLibrary, setShowLibrary] = useState(!books.length);
  const [targetWord, setTargetWord] = useState("");
  const [translation, setTranslation] = useState("");
  const [lookupTranslations, setLookupTranslations] = useState<{ russian?: string; german?: string; english?: string }>({});
  const [grammar, setGrammar] = useState("");
  const [lookupStatus, setLookupStatus] = useState<"idle" | "loading" | "done">("idle");
  const [saved, setSaved] = useState("");
  const readerTextRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const activeBook = books.find((book) => book.id === activeBookId) ?? books[0];
  const text = activeBook?.text ?? "";
  const page = useMemo(() => ({ end: text.length, start: 0, text }), [text]);
  const tokens = useMemo(() => tokenizeText(page.text), [page.text]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;

    setTargetWord(selected.word);
    setTranslation("");
    setLookupTranslations({});
    setGrammar("");
    setSaved("");
    setLookupStatus("loading");

    if (language === "german") {
      Promise.all([
        lookupGermanArticle(selected.word),
        translateReaderWord(selected.word, "de", "ru"),
        translateReaderWord(selected.word, "de", "en"),
      ]).then(([article, russianHint, englishHint]) => {
        if (cancelled) return;
        setTargetWord(article ? `${article} ${selected.word}` : selected.word);
        setTranslation(russianHint);
        setLookupTranslations({ russian: russianHint, german: article ? `${article} ${selected.word}` : selected.word, english: englishHint });
        setGrammar([
          article ? `Артикль найден автоматически: ${article}` : "",
          englishHint ? `Английский: ${englishHint}` : "",
        ].filter(Boolean).join("\n"));
        setLookupStatus("done");
      });
    } else {
      Promise.all([
        lookupEnglishHint(selected.word),
        translateReaderWord(selected.word, "en", "ru"),
        translateReaderWord(selected.word, "en", "de"),
      ]).then(([hint, russianHint, germanHint]) => {
        if (cancelled) return;
        setTranslation(russianHint);
        setLookupTranslations({ russian: russianHint, english: selected.word, german: germanHint });
        setGrammar([
          germanHint ? `Немецкий: ${germanHint}` : "",
          hint,
        ].filter(Boolean).join("\n"));
        setLookupStatus("done");
      });
    }

    return () => {
      cancelled = true;
    };
  }, [selected, language]);

  useEffect(() => {
    setSelected(null);
    setSaved("");
    window.requestAnimationFrame(() => {
      const reader = readerTextRef.current;
      if (!reader || !activeBook?.text.length) return;
      const maxScroll = Math.max(reader.scrollHeight - reader.clientHeight, 0);
      const safePosition = clampBookPosition(activeBook);
      reader.scrollTop = maxScroll ? (safePosition / Math.max(activeBook.text.length - 1, 1)) * maxScroll : 0;
    });
  }, [activeBookId, activeBook?.text.length]);

  useEffect(() => () => {
    if (scrollFrameRef.current) window.cancelAnimationFrame(scrollFrameRef.current);
  }, []);

  useEffect(() => {
    if (!books.length) {
      setShowNewBook(true);
      setShowLibrary(true);
    }
  }, [books.length]);

  const selectWord = (word: string, tokenStart: number, event: React.MouseEvent<HTMLButtonElement>) => {
    let cleaned = cleanReaderWord(word);
    let selectedStart = tokenStart;
    if (language === "german" && /^(der|die|das)$/i.test(cleaned)) {
      const afterArticle = text.slice(tokenStart + word.length);
      const nextWord = afterArticle.match(/^[^\p{L}\p{M}]*([\p{L}\p{M}]+)/u);
      if (nextWord?.[1]) {
        cleaned = cleanReaderWord(nextWord[1]);
        selectedStart = tokenStart + word.length + (nextWord.index ?? 0) + nextWord[0].indexOf(nextWord[1]);
      }
    }
    if (!cleaned) return;
    if (activeBook) {
      onUpdateBook(activeBook.id, { position: selectedStart });
    }
    const wordRect = event.currentTarget.getBoundingClientRect();
    const isArticleTap = language === "german" && /^(der|die|das)$/i.test(cleanReaderWord(word));
    const shouldOpenBelow = wordRect.top < 300;
    setSelected({
      word: cleaned,
      context: sentenceContext(text, cleaned, selectedStart),
      offset: selectedStart,
      anchor: {
        x: wordRect.left + wordRect.width / 2,
        y: shouldOpenBelow || isArticleTap ? wordRect.bottom : wordRect.top,
        placement: shouldOpenBelow || isArticleTap ? "below" : "above",
      },
    });
    const syncAnchorToWord = () => {
      const anchoredWord = document.querySelector<HTMLElement>(`[data-reader-offset="${selectedStart}"]`);
      const currentRect = anchoredWord?.getBoundingClientRect();
      if (!currentRect) return;
      const openBelow = currentRect.top < 300;
      setSelected((current) => current?.offset === selectedStart ? {
        ...current,
        anchor: {
          x: currentRect.left + currentRect.width / 2,
          y: openBelow ? currentRect.bottom : currentRect.top,
          placement: openBelow ? "below" : "above",
        },
      } : current);
    };
    window.requestAnimationFrame(syncAnchorToWord);
    window.setTimeout(syncAnchorToWord, 120);
  };

  const uploadText = (file: File | undefined) => {
    if (!file) return;
    file.text().then((content) => {
      setDraftText(content);
      setDraftTitle(file.name.replace(/\.[^.]+$/, ""));
      setShowNewBook(true);
    });
  };

  const createBook = () => {
    if (!draftText.trim()) return;
    onCreateBook(draftText, draftTitle);
    setDraftText("");
    setDraftTitle("");
    setShowNewBook(false);
    setShowLibrary(false);
  };

  const saveCard = () => {
    if (!selected || !targetWord.trim() || !translation.trim()) return;
    onAdd({
      russian: translation.trim(),
      german: targetWord.trim(),
      plural: "",
      grammar: grammar.trim(),
      example: selected.context,
      lastReviewedAt: undefined,
    });
    setSaved("");
    setSelected(null);
    setTargetWord("");
    setTranslation("");
    setLookupTranslations({});
    setGrammar("");
    setLookupStatus("idle");
  };

  const jumpToSaved = () => {
    if (!activeBook) return;
    const reader = readerTextRef.current;
    if (!reader) return;
    const maxScroll = Math.max(reader.scrollHeight - reader.clientHeight, 0);
    const safePosition = clampBookPosition(activeBook);
    reader.scrollTo({
      top: maxScroll ? (safePosition / Math.max(activeBook.text.length - 1, 1)) * maxScroll : 0,
      behavior: "smooth",
    });
  };

  const handleReaderScroll = () => {
    if (!activeBook || !activeBook.text.length || scrollFrameRef.current) return;
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const reader = readerTextRef.current;
      if (!reader) return;
      const maxScroll = Math.max(reader.scrollHeight - reader.clientHeight, 0);
      const nextPosition = maxScroll
        ? Math.round((reader.scrollTop / maxScroll) * Math.max(activeBook.text.length - 1, 0))
        : 0;
      if (Math.abs(nextPosition - clampBookPosition(activeBook)) > 80) {
        onUpdateBook(activeBook.id, { position: nextPosition });
      }
    });
  };

  let cursor = page.start;

  return (
    <section className="reader-section">
      <div className="section-toolbar">
        <div>
          <p className="eyebrow">{language === "german" ? "Lesezimmer" : "Reading Room"}</p>
          <h3>{activeBook?.title ?? "Чтение"}</h3>
        </div>
        <button className="secondary-button reader-menu-button" onClick={() => setShowLibrary((value) => !value)}>
          <Menu size={18} />
          <span>Книги</span>
        </button>
      </div>

      <div className="reader-layout">
        <div className={`book-shelf ${showLibrary ? "is-open" : ""}`}>
          <div className="book-shelf-head">
            <div>
              <p className="eyebrow">мини-книжки</p>
              <h4>Библиотека</h4>
            </div>
            <div className="book-shelf-actions">
              <label className="secondary-button file-button">
                <Import size={18} />
                <span>TXT</span>
                <input type="file" accept=".txt,text/plain" onChange={(event) => uploadText(event.target.files?.[0])} />
              </label>
              <button className="secondary-button" onClick={() => setShowNewBook((value) => !value)}>
                <Plus size={18} />
                <span>Новая</span>
              </button>
            </div>
          </div>

          {showNewBook && (
            <div className="new-book-panel">
              <label>
                <span>Название</span>
                <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="например: Fanfic B1-B2" />
              </label>
              <label>
                <span>Текст</span>
                <textarea
                  value={draftText}
                  onChange={(event) => setDraftText(event.target.value)}
                  placeholder={language === "german" ? "Вставь немецкий текст..." : "Вставь английский текст B1-B2..."}
                />
              </label>
              <button className="primary-button" onClick={createBook} disabled={!draftText.trim()}>
                <BookOpen size={18} />
                <span>Сохранить книжку</span>
              </button>
            </div>
          )}

          <div className="book-list">
            {books.map((book) => (
              <button
                className={`book-item ${book.id === activeBook?.id ? "is-active" : ""} ${book.completedAt ? "is-complete" : ""}`}
                key={book.id}
                onClick={() => {
                  onSelectBook(book.id);
                  setShowLibrary(false);
                }}
              >
                <span>{book.title}</span>
                <strong className="tabular">{book.completedAt ? "завершена" : `${readingProgress(book)}%`}</strong>
              </button>
            ))}
          </div>
        </div>

        {selected && (
          <div
            className={`reader-lookup is-${selected.anchor.placement}`}
            style={{
              "--lookup-x": `${selected.anchor.x}px`,
              "--lookup-y": `${selected.anchor.y}px`,
            } as React.CSSProperties}
          >
            <div className="lookup-head">
              <div>
                <p className="eyebrow">{lookupStatus === "loading" ? "ищу подсказку" : "карточка из текста"}</p>
                <h4>{selected.word}</h4>
              </div>
              <button className="icon-button lookup-close-button" onClick={() => setSelected(null)} aria-label="Закрыть карточку">
                <X size={18} />
              </button>
            </div>
            <div className="reader-form-grid">
              <label>
                <span>{themeCopy.targetLabel}</span>
                <input value={targetWord} onChange={(event) => setTargetWord(event.target.value)} />
              </label>
              <label>
                <span>Перевод на русский</span>
                <input value={translation} onChange={(event) => setTranslation(event.target.value)} placeholder="впиши перевод перед сохранением" />
              </label>
            </div>
            {(lookupTranslations.russian || lookupTranslations.german || lookupTranslations.english) && (
              <div className="lookup-translation-grid" aria-label="Автоперевод">
                {lookupTranslations.russian && (
                  <div>
                    <span>RU</span>
                    <strong>{lookupTranslations.russian}</strong>
                  </div>
                )}
                {lookupTranslations.german && (
                  <div>
                    <span>DE</span>
                    <strong>{lookupTranslations.german}</strong>
                  </div>
                )}
                {lookupTranslations.english && (
                  <div>
                    <span>EN</span>
                    <strong>{lookupTranslations.english}</strong>
                  </div>
                )}
              </div>
            )}
            <label className="lookup-context-field">
              <span>Контекст</span>
              <textarea value={selected.context} readOnly />
            </label>
            <label className="lookup-grammar-field">
              <span>Подсказка / грамматика</span>
              <textarea value={grammar} onChange={(event) => setGrammar(event.target.value)} placeholder={language === "german" ? "Артикль подтянется автоматически, если Wiktionary его отдаст" : "Здесь может появиться английская подсказка из бесплатного словаря"} />
            </label>
            <div className="trainer-actions">
              <button className="primary-button" onClick={saveCard} disabled={!targetWord.trim() || !translation.trim()}>
                <Plus size={18} />
                <span>Добавить карточку</span>
              </button>
              {saved && <span className="save-note">{saved}</span>}
            </div>
          </div>
        )}

        {activeBook && (
          <div className="book-toolbar">
            <label>
              <span>Название</span>
              <input value={activeBook.title} onChange={(event) => onUpdateBook(activeBook.id, { title: event.target.value })} />
            </label>
            <div className="book-actions">
              <span className="reader-progress-pill tabular">{readingProgress(activeBook)}%</span>
              <button className="secondary-button" onClick={jumpToSaved}>
                <ArrowRight size={18} />
                <span>К месту</span>
              </button>
              <button
                className="secondary-button"
                onClick={() =>
                  onUpdateBook(activeBook.id, {
                    completedAt: activeBook.completedAt ? undefined : new Date().toISOString(),
                    position: activeBook.completedAt ? activeBook.position : Math.max(activeBook.text.length - 1, 0),
                  })
                }
              >
                <Sparkles size={18} />
                <span>{activeBook.completedAt ? "Вернуть" : "Завершить"}</span>
              </button>
              <button className="danger-button book-delete-button" onClick={() => window.confirm("Удалить эту мини-книжку?") && onDeleteBook(activeBook.id)}>
                <X size={18} />
                <span>Удалить книгу</span>
              </button>
            </div>
          </div>
        )}

        <div className="reader-text" aria-label="Текст для чтения" ref={readerTextRef} onScroll={handleReaderScroll}>
          {!activeBook ? (
            <div className="empty-state compact">
              <FileText size={28} />
              <h3>Добавь первую мини-книжку</h3>
              <p>Текст сохранится в библиотеке, и ты сможешь вернуться к месту, где остановилась.</p>
            </div>
          ) : (
            tokens.map((token, index) => {
              const tokenStart = cursor;
              cursor += token.length;
              if (!isWordToken(token)) return <span key={`${token}-${index}`}>{token}</span>;
              return (
                <button className="reader-word" key={`${token}-${index}`} data-reader-offset={tokenStart} onClick={(event) => selectWord(token, tokenStart, event)}>
                  {token}
                </button>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}

function AddCardView({ themeCopy, onAdd }: { themeCopy: LearningCopy; onAdd: (card: NewCardInput) => void }) {
  const [form, setForm] = useState({
    russian: "",
    german: "",
    plural: "",
    grammar: "",
    example: "",
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.russian.trim() || !form.german.trim()) return;
    onAdd({
      russian: form.russian.trim(),
      german: form.german.trim(),
      plural: form.plural.trim(),
      grammar: form.grammar.trim(),
      example: form.example.trim(),
      lastReviewedAt: undefined,
    });
    setForm({ russian: "", german: "", plural: "", grammar: "", example: "" });
  };

  return (
    <section className="form-section">
      <div className="section-heading">
        <p className="eyebrow">{themeCopy.addEyebrow}</p>
        <h3>Добавить карточку</h3>
        <p className="muted">{themeCopy.addHint}</p>
      </div>

      <form className="card-form" onSubmit={submit}>
        <label>
          <span>Русский</span>
          <input value={form.russian} onChange={(event) => setForm({ ...form, russian: event.target.value })} placeholder="дом" />
        </label>
        <label>
          <span>{themeCopy.targetLabel}</span>
          <input value={form.german} onChange={(event) => setForm({ ...form, german: event.target.value })} placeholder={themeCopy.targetPlaceholder} />
        </label>
        <label>
          <span>{themeCopy.formLabel}</span>
          <input value={form.plural} onChange={(event) => setForm({ ...form, plural: event.target.value })} placeholder={themeCopy.formPlaceholder} />
        </label>
        <label>
          <span>{themeCopy.formExtraLabel}</span>
          <input value={form.grammar} onChange={(event) => setForm({ ...form, grammar: event.target.value })} placeholder={themeCopy.formExtraPlaceholder} />
        </label>
        <label>
          <span>{themeCopy.exampleLabel}</span>
          <textarea value={form.example} onChange={(event) => setForm({ ...form, example: event.target.value })} placeholder={themeCopy.examplePlaceholder} />
        </label>
        <button className="primary-button" type="submit">
          <Plus size={18} />
          <span>Сохранить карточку</span>
        </button>
      </form>
    </section>
  );
}

function DictionaryView({
  themeCopy,
  cards,
  onUpdate,
  onDelete,
}: {
  themeCopy: LearningCopy;
  cards: Card[];
  onUpdate: (id: string, patch: Partial<Pick<Card, "russian" | "german" | "plural" | "grammar" | "example" | "association">>) => void;
  onDelete: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(DICTIONARY_PAGE_SIZE);
  const [editingId, setEditingId] = useState("");
  const [draft, setDraft] = useState<Pick<Card, "russian" | "german" | "plural" | "grammar" | "example" | "association">>({
    russian: "",
    german: "",
    plural: "",
    grammar: "",
    example: "",
    association: "",
  });
  const filtered = useMemo(
    () => cards.filter((card) => `${card.russian} ${card.german} ${card.example}`.toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru"))),
    [cards, query],
  );
  const visibleCards = filtered.slice(0, visibleCount);

  useEffect(() => {
    setVisibleCount(DICTIONARY_PAGE_SIZE);
  }, [query, cards.length]);

  const startEdit = (card: Card) => {
    setEditingId(card.id);
    setDraft({
      russian: card.russian,
      german: card.german,
      plural: card.plural,
      grammar: card.grammar,
      example: card.example,
      association: card.association ?? "",
    });
  };

  const saveEdit = () => {
    if (!editingId || !draft.russian.trim() || !draft.german.trim()) return;
    onUpdate(editingId, {
      russian: draft.russian.trim(),
      german: draft.german.trim(),
      plural: draft.plural.trim(),
      grammar: draft.grammar.trim(),
      example: draft.example.trim(),
      association: draft.association?.trim() ?? "",
    });
    setEditingId("");
  };

  return (
    <section className="dictionary-section">
      <div className="section-toolbar">
        <div>
          <p className="eyebrow">{themeCopy.dictionaryEyebrow}</p>
          <h3>Словарь</h3>
        </div>
        <label className="search-box">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти слово" />
        </label>
      </div>

      <div className="word-table">
        <div className="table-head">
          <span>Слово</span>
          <span>Прогресс</span>
          <span>Следующий раз</span>
          <span></span>
        </div>
        {visibleCards.map((card) => {
          const isEditing = editingId === card.id;
          return (
            <div className={`word-row ${isEditing ? "is-editing" : ""}`} key={card.id}>
              {isEditing ? (
                <div className="dictionary-edit-form">
                  <label>
                    <span>Русский</span>
                    <input value={draft.russian} onChange={(event) => setDraft({ ...draft, russian: event.target.value })} />
                  </label>
                  <label>
                    <span>{themeCopy.targetLabel}</span>
                    <input value={draft.german} onChange={(event) => setDraft({ ...draft, german: event.target.value })} />
                  </label>
                  <label>
                    <span>{themeCopy.formLabel}</span>
                    <input value={draft.plural} onChange={(event) => setDraft({ ...draft, plural: event.target.value })} />
                  </label>
                  <label>
                    <span>{themeCopy.formExtraLabel}</span>
                    <input value={draft.grammar} onChange={(event) => setDraft({ ...draft, grammar: event.target.value })} />
                  </label>
                  <label>
                    <span>{themeCopy.exampleLabel}</span>
                    <textarea value={draft.example} onChange={(event) => setDraft({ ...draft, example: event.target.value })} />
                  </label>
                  <label>
                    <span>Ассоциация</span>
                    <textarea value={draft.association ?? ""} onChange={(event) => setDraft({ ...draft, association: event.target.value })} />
                  </label>
                  <div className="dictionary-edit-actions">
                    <button className="primary-button" onClick={saveEdit} disabled={!draft.russian.trim() || !draft.german.trim()}>
                      <Check size={18} />
                      <span>Сохранить</span>
                    </button>
                    <button className="secondary-button" onClick={() => setEditingId("")}>
                      <X size={18} />
                      <span>Отменить</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <strong><GermanTerm value={germanText(card)} /></strong>
                    <p>{card.russian}</p>
                  </div>
                  <div>
                    <span className={`status ${strengthLabel(card)}`}>{strengthLabel(card)}</span>
                    <p className="tabular">{card.correct}/{card.attempts} · {accuracy(card.correct, card.attempts)}%</p>
                  </div>
                  <div>
                    <p className="next-review">{formatDate(card.nextReview)}</p>
                    <p>{isDue(card) ? `сейчас · попыток ${card.attempts}` : `через ${formatInterval(card.intervalDays)} · попыток ${card.attempts}`}</p>
                  </div>
                  <div className="word-actions">
                    <button className="icon-button" onClick={() => startEdit(card)} aria-label={`Редактировать ${card.german}`}>
                      <Pencil size={18} />
                    </button>
                    <button className="icon-button" onClick={() => onDelete(card.id)} aria-label={`Удалить ${card.german}`}>
                      <X size={18} />
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
        {visibleCards.length < filtered.length && (
          <button className="secondary-button dictionary-more" onClick={() => setVisibleCount((count) => count + DICTIONARY_PAGE_SIZE)}>
            <span>Показать ещё {Math.min(DICTIONARY_PAGE_SIZE, filtered.length - visibleCards.length)}</span>
          </button>
        )}
      </div>
    </section>
  );
}

function TrainerView({
  themeCopy,
  items,
  totalCount,
  dueCount,
  correctCount,
  attemptsCount,
  onImport,
  onAnswer,
}: {
  themeCopy: LearningCopy;
  items: TrainerItem[];
  totalCount: number;
  dueCount: number;
  correctCount: number;
  attemptsCount: number;
  onImport: (items: Array<Pick<TrainerItem, "russian" | "german">>) => void;
  onAnswer: (id: string, correct: boolean) => void;
}) {
  const [importText, setImportText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [checked, setChecked] = useState(false);
  const [showImport, setShowImport] = useState(items.length === 0);

  const current = items[currentIndex % Math.max(items.length, 1)];
  const parsedCount = parseTrainerImport(importText).length;
  const isMatch = current ? normalizeAnswer(answer) === normalizeAnswer(current.german) : false;
  const trainerAccuracy = accuracy(correctCount, attemptsCount);
  const completionPercent = totalCount ? Math.round(((totalCount - dueCount) / totalCount) * 100) : 0;

  useEffect(() => {
    if (currentIndex >= items.length) {
      setCurrentIndex(0);
      setAnswer("");
      setChecked(false);
    }
  }, [currentIndex, items.length]);

  const submitImport = () => {
    const parsed = parseTrainerImport(importText);
    if (!parsed.length) return;
    onImport(parsed);
    setImportText("");
    setShowImport(false);
  };

  const next = () => {
    setAnswer("");
    setChecked(false);
    setCurrentIndex((index) => (items.length ? (index + 1) % items.length : 0));
  };

  return (
    <section className="trainer-section">
      <div className="section-toolbar">
        <div>
          <p className="eyebrow">{themeCopy.trainerEyebrow}</p>
          <h3>{themeCopy.trainerTitle}</h3>
        </div>
        <button className="secondary-button trainer-import-toggle" onClick={() => setShowImport((value) => !value)} aria-label="Импорт предложений">
          <Import size={18} />
          <span>Импорт</span>
        </button>
      </div>

      <div className="trainer-stats-strip">
        <StatPill icon={<ClipboardList />} label="Правильно" value={`${trainerAccuracy}%`} />
        <StatPill icon={<Check />} label="Выполнено" value={`${completionPercent}%`} />
      </div>

      {showImport && (
        <div className="import-panel">
          <p className="muted">
            {themeCopy.trainerImportHint}
          </p>
          <textarea
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            placeholder={themeCopy.trainerImportPlaceholder}
          />
          <button className="primary-button" onClick={submitImport} disabled={!parsedCount}>
            <Import size={18} />
            <span>Загрузить {parsedCount ? `${parsedCount} шт.` : ""}</span>
          </button>
        </div>
      )}

      {!totalCount ? (
        <div className="empty-state compact">
          <Dumbbell size={28} />
          <h3>Загрузи первые предложения</h3>
          <p>{themeCopy.trainerEmptyHint}</p>
        </div>
      ) : !items.length ? (
        <div className="empty-state compact">
          <Sparkles size={28} />
          <h3>На сегодня все предложения повторены</h3>
          <p>Новые предложения появятся в тренажере по интервальному расписанию.</p>
        </div>
      ) : (
        <div className="trainer-grid">
          <div className="trainer-card">
            <div className="card-meta">
              <span className="tabular">{accuracy(current.correct, current.attempts)}%</span>
              <span className="tabular">серия {(current.streak ?? 0)}/{TRAINER_MASTERY_STREAK}</span>
            </div>
            <p className="prompt-label">{themeCopy.trainerPrompt}</p>
            <h3>{current.russian}</h3>
            <textarea value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder={themeCopy.trainerAnswerPlaceholder} />
            <div className="trainer-actions">
              <button className="primary-button" onClick={() => setChecked(true)} disabled={!answer.trim()}>
                <Check size={18} />
                <span>Проверить</span>
              </button>
              <button className="secondary-button" onClick={next}>
                <ArrowRight size={18} />
                <span>Дальше</span>
              </button>
            </div>
          </div>

          <div className="trainer-result">
            {!checked ? (
              <>
                <CalendarClock size={22} />
                <h4>Пока скрыто</h4>
                <p>{themeCopy.trainerHiddenHint}</p>
              </>
            ) : (
              <>
                <span className={`match-indicator ${isMatch ? "ok" : "diff"}`}>{isMatch ? "Совпало" : "Есть отличия"}</span>
                <div className="compare-block">
                  <p>Твой ответ</p>
                  <strong>{answer}</strong>
                </div>
                <div className="compare-block">
                  <p>Эталон</p>
                  <strong>{current.german}</strong>
                </div>
                <div className="trainer-actions">
                  <button className="grade-button good" onClick={() => { onAnswer(current.id, true); next(); }}>
                    <Check size={18} />
                    <span>Засчитать</span>
                  </button>
                  <button className="grade-button again" onClick={() => { onAnswer(current.id, false); next(); }}>
                    <X size={18} />
                    <span>Ошибка</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function SettingsView({
  themeCopy,
  profile,
  onProfileChange,
  email,
  cardsCount,
  trainerCount,
  dueCards,
  dueTrainerItems,
  session,
  syncStatus,
  syncMessage,
  onSignedOut,
  onClearTrainer,
}: {
  themeCopy: LearningCopy;
  profile: UserProfile;
  onProfileChange: (patch: Partial<UserProfile>) => void;
  email: string;
  cardsCount: number;
  trainerCount: number;
  dueCards: number;
  dueTrainerItems: number;
  session: Session | null;
  syncStatus: SyncStatus;
  syncMessage: string;
  onSignedOut: () => void;
  onClearTrainer: () => void;
}) {
  const clearTrainer = () => {
    const confirmed = window.confirm("Удалить все предложения из тренажера? Карточки слов останутся на месте.");
    if (confirmed) onClearTrainer();
  };

  return (
    <section className="settings-section">
      <div className="section-heading">
        <p className="eyebrow">Preferences</p>
        <h3>Настройки</h3>
        <p className="muted">Здесь живут редкие действия и внешний вид, чтобы тренировка оставалась спокойной.</p>
      </div>

      <div className="settings-grid">
        <div className="settings-card">
          <h4>Профиль</h4>
          <div className="profile-card">
            <span className="profile-mark">{THEME_OPTIONS[profile.theme].mark}</span>
            <div>
              <strong>{LANGUAGE_OPTIONS[profile.language].label}</strong>
              <p>{THEME_OPTIONS[profile.theme].label} · {email}</p>
            </div>
          </div>
        </div>

        <div className="settings-card">
          <h4>Язык обучения</h4>
          <div className="theme-switch">
            {(Object.keys(LANGUAGE_OPTIONS) as StudyLanguage[]).map((language) => (
              <button
                className={profile.language === language ? "is-active" : ""}
                key={language}
                onClick={() => onProfileChange({ language, onboarded: true })}
              >
                {LANGUAGE_OPTIONS[language].label}
              </button>
            ))}
          </div>
          <p className="muted">{LANGUAGE_OPTIONS[profile.language].hint}</p>
        </div>

        <div className="settings-card">
          <h4>Тема оформления</h4>
          <div className="theme-switch">
            {(Object.keys(THEME_OPTIONS) as Theme[]).map((theme) => (
              <button
                className={profile.theme === theme ? "is-active" : ""}
                key={theme}
                onClick={() => onProfileChange({ theme, onboarded: true })}
              >
                {THEME_OPTIONS[theme].label}
              </button>
            ))}
          </div>
          <p className="muted">{THEME_OPTIONS[profile.theme].hint}</p>
        </div>

        <div className="settings-card">
          <h4>Синхронизация</h4>
          <SyncPanel session={session} syncStatus={syncStatus} syncMessage={syncMessage} onSignedOut={onSignedOut} />
        </div>

        <div className="settings-card">
          <h4>Данные</h4>
          <div className="settings-stats">
            <StatPill icon={<Layers />} label="Карточки" value={`${cardsCount}`} />
            <StatPill icon={<Dumbbell />} label="Предложения" value={`${trainerCount}`} />
            <StatPill icon={<Brain />} label="Сегодня" value={`${dueCards + dueTrainerItems}`} />
          </div>
        </div>

        <div className="settings-card danger-zone">
          <h4>Опасная зона</h4>
          <p className="muted">Очистка тренажера удалит импортированные предложения и их статистику. Слова в словаре не удалятся.</p>
          <button className="danger-button" onClick={clearTrainer} disabled={!trainerCount}>
            <X size={18} />
            <span>Очистить тренажер</span>
          </button>
        </div>
      </div>
    </section>
  );
}
