import {
  ArrowRight,
  BookOpen,
  Brain,
  CalendarClock,
  Check,
  ChevronDown,
  ClipboardList,
  Dumbbell,
  Flame,
  Import,
  Layers,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./supabase";

type Tab = "review" | "add" | "dictionary" | "trainer" | "settings";
type Theme = "rainy" | "classic";
type Article = "" | "der" | "die" | "das";
type ReviewGrade = "again" | "hard" | "good" | "easy";

type Card = {
  id: string;
  russian: string;
  german: string;
  article?: Article;
  plural: string;
  grammar: string;
  example: string;
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

type StreakState = {
  count: number;
  lastStudyDate: string;
};

type CloudState = {
  cards: Card[];
  trainerItems: TrainerItem[];
  streak: StreakState;
};

type SyncStatus = "local" | "loading" | "synced" | "saving" | "error";

const CARD_KEY = "deutsch-trainer.cards.v1";
const TRAINER_KEY = "deutsch-trainer.trainer.v1";
const STREAK_KEY = "deutsch-trainer.streak.v1";
const THEME_KEY = "deutsch-trainer.theme.v1";
const REVIEW_INTERVALS = [1, 3, 7, 14, 30];

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

function normalizeAnswer(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("de-DE")
    .replace(/[.,!?;:()"«»„“]/g, "")
    .replace(/\s+/g, " ");
}

function addDaysIso(days: number) {
  const date = startOfDay(new Date());
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function addDaysFromIso(iso: string | undefined, days: number) {
  const date = iso ? startOfDay(new Date(iso)) : startOfDay(new Date());
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("ru", {
    day: "2-digit",
    month: "short",
  }).format(new Date(iso));
}

function isDue(card: Card) {
  return startOfDay(new Date(card.nextReview)).getTime() <= startOfDay(new Date()).getTime();
}

function isTrainerDue(item: TrainerItem) {
  return startOfDay(new Date(item.nextReview ?? today())).getTime() <= startOfDay(new Date()).getTime();
}

function accuracy(correct: number, attempts: number) {
  if (!attempts) return 0;
  return Math.round((correct / attempts) * 100);
}

function strengthLabel(card: Card) {
  const score = accuracy(card.correct, card.attempts);
  if (!card.attempts) return "новое";
  if (card.wrong >= 3 && score < 65) return "проблемное";
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
  const step = completedReviewStep(card);
  const expectedInterval = intervalForCompletedStep(step);
  if (card.intervalDays === expectedInterval) return card;

  return {
    ...card,
    intervalDays: expectedInterval,
    nextReview: addDaysFromIso(card.lastReviewedAt ?? card.createdAt, expectedInterval),
  };
}

function normalizeTrainerSchedule(item: TrainerItem): TrainerItem {
  const step = completedTrainerStep(item);
  const expectedInterval = intervalForCompletedStep(step);
  if ((item.intervalDays ?? 1) === expectedInterval) return item;

  return {
    ...item,
    intervalDays: expectedInterval,
    nextReview: addDaysFromIso(item.lastAnsweredAt ?? item.createdAt, expectedInterval),
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

function updateCardAfterReview(card: Card, grade: ReviewGrade): Card {
  const wasCorrect = grade !== "again";
  const currentStep = completedReviewStep(card);
  const nextStep = wasCorrect ? Math.min(currentStep + 1, REVIEW_INTERVALS.length) : 0;
  const nextInterval = wasCorrect ? REVIEW_INTERVALS[Math.min(currentStep, REVIEW_INTERVALS.length - 1)] : REVIEW_INTERVALS[0];

  return {
    ...card,
    nextReview: addDaysIso(nextInterval),
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
  const nextStep = correct ? Math.min(currentStep + 1, REVIEW_INTERVALS.length) : 0;
  const nextInterval = correct ? REVIEW_INTERVALS[Math.min(currentStep, REVIEW_INTERVALS.length - 1)] : REVIEW_INTERVALS[0];

  return {
    ...item,
    nextReview: addDaysIso(nextInterval),
    intervalDays: nextInterval,
    reviewStep: nextStep,
    attempts: item.attempts + 1,
    correct: item.correct + (correct ? 1 : 0),
    wrong: item.wrong + (correct ? 0 : 1),
    streak: correct ? (item.streak ?? 0) + 1 : 0,
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
  const germanIndex = header?.findIndex((cell) => ["немецкий", "de", "german", "answer"].includes(cell)) ?? -1;
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
  const [theme, setTheme] = usePersistentState<Theme>(THEME_KEY, "rainy");
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(!isSupabaseConfigured);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(isSupabaseConfigured ? "loading" : "local");
  const [syncMessage, setSyncMessage] = useState("");
  const hasLoadedCloud = useRef(false);

  const cloudState = useMemo<CloudState>(() => ({ cards, trainerItems, streak }), [cards, trainerItems, streak]);
  const didNormalizeSchedules = useRef(false);

  useEffect(() => {
    document.body.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (didNormalizeSchedules.current) return;
    didNormalizeSchedules.current = true;

    setCards((current) => current.map(normalizeCardSchedule));
    setTrainerItems((current) => current.map(normalizeTrainerSchedule));
  }, [setCards, setTrainerItems]);

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
        if (remote?.cards || remote?.trainerItems || remote?.streak) {
          setCards((remote.cards ?? []).map(normalizeCardSchedule));
          setTrainerItems((remote.trainerItems ?? []).map(normalizeTrainerSchedule));
          setStreak(remote.streak ?? { count: 0, lastStudyDate: "" });
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
  }, [session, setCards, setTrainerItems, setStreak, cloudState]);

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
      cards
        .filter(isDue)
        .sort((a, b) => new Date(a.nextReview).getTime() - new Date(b.nextReview).getTime()),
    [cards],
  );
  const dueTrainerItems = useMemo(
    () =>
      trainerItems
        .filter(isTrainerDue)
        .sort((a, b) => new Date(a.nextReview ?? today()).getTime() - new Date(b.nextReview ?? today()).getTime()),
    [trainerItems],
  );
  const difficultCards = cards.filter((card) => strengthLabel(card) === "проблемное").length;
  const totalAttempts = cards.reduce((sum, card) => sum + card.attempts, 0);
  const totalCorrect = cards.reduce((sum, card) => sum + card.correct, 0);

  const markStudiedToday = () => {
    const current = today();
    if (streak.lastStudyDate === current) return;

    const yesterday = startOfDay(new Date());
    yesterday.setDate(yesterday.getDate() - 1);
    const continued = streak.lastStudyDate === yesterday.toISOString();
    setStreak({ count: continued ? streak.count + 1 : 1, lastStudyDate: current });
  };

  const addCard = (card: NewCardInput) => {
    const nextCard: Card = {
      ...card,
      id: uid(),
      createdAt: new Date().toISOString(),
      nextReview: today(),
      intervalDays: 1,
      reviewStep: 0,
      attempts: 0,
      correct: 0,
      wrong: 0,
      streak: 0,
    };
    setCards((current) => [nextCard, ...current]);
    setTab("review");
  };

  const reviewCard = (id: string, grade: ReviewGrade) => {
    setCards((current) => current.map((card) => (card.id === id ? updateCardAfterReview(card, grade) : card)));
    markStudiedToday();
  };

  const deleteCard = (id: string) => {
    setCards((current) => current.filter((card) => card.id !== id));
  };

  const importTrainerItems = (items: Array<Pick<TrainerItem, "russian" | "german">>) => {
    const mapped = items.map((item) => ({
      ...item,
      id: uid(),
      attempts: 0,
      correct: 0,
      wrong: 0,
      nextReview: today(),
      intervalDays: 1,
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
    setTrainerItems([]);
  };

  const clearLocalState = () => {
    setCards([]);
    setTrainerItems([]);
    setStreak({ count: 0, lastStudyDate: "" });
  };

  if (isSupabaseConfigured && !authChecked) {
    return (
      <div className="auth-shell">
        <div className="brand auth-brand">
          <div className="brand-mark">D</div>
          <div>
            <p className="eyebrow">личный немецкий</p>
            <h1>Deutsch Trainer</h1>
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
          <div className="brand-mark">D</div>
          <div>
            <p className="eyebrow">личный немецкий</p>
            <h1>Deutsch Trainer</h1>
          </div>
        </div>
        <SyncPanel session={session} syncStatus={syncStatus} syncMessage={syncMessage} onSignedOut={clearLocalState} />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">D</div>
          <div>
            <p className="eyebrow">личный немецкий</p>
            <h1>Deutsch Trainer</h1>
          </div>
        </div>

        <nav className="nav-list" aria-label="Основная навигация">
          <TabButton icon={<Brain />} label="Повторение" active={tab === "review"} onClick={() => setTab("review")} badge={dueCards.length} />
          <TabButton icon={<Plus />} label="Добавить" active={tab === "add"} onClick={() => setTab("add")} />
          <TabButton icon={<BookOpen />} label="Словарь" active={tab === "dictionary"} onClick={() => setTab("dictionary")} />
          <TabButton icon={<Dumbbell />} label="Тренажер" active={tab === "trainer"} onClick={() => setTab("trainer")} badge={dueTrainerItems.length} />
          <TabButton icon={<Settings />} label="Настройки" active={tab === "settings"} onClick={() => setTab("settings")} />
        </nav>

        <SyncPanel session={session} syncStatus={syncStatus} syncMessage={syncMessage} onSignedOut={clearLocalState} />

        <div className="sidebar-stats">
          <StatPill icon={<Flame />} label="Streak" value={`${streak.count} дн.`} />
          <StatPill icon={<Layers />} label="Слов" value={String(cards.length)} />
          <StatPill icon={<ClipboardList />} label="Точность" value={`${accuracy(totalCorrect, totalAttempts)}%`} />
        </div>
      </aside>

      <main className="main-panel">
        <Header
          due={dueCards.length}
          difficult={difficultCards}
          total={cards.length}
          onQuickAdd={() => setTab("add")}
        />

        {tab === "review" && <ReviewView cards={dueCards} allCards={cards} onReview={reviewCard} onAdd={() => setTab("add")} />}
        {tab === "add" && <AddCardView onAdd={addCard} />}
        {tab === "dictionary" && <DictionaryView cards={cards} onDelete={deleteCard} />}
        {tab === "trainer" && (
          <TrainerView
            items={dueTrainerItems}
            totalCount={trainerItems.length}
            onImport={importTrainerItems}
            onAnswer={answerTrainerItem}
          />
        )}
        {tab === "settings" && (
          <SettingsView
            theme={theme}
            onThemeChange={setTheme}
            cardsCount={cards.length}
            trainerCount={trainerItems.length}
            dueCards={dueCards.length}
            dueTrainerItems={dueTrainerItems.length}
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

function Header({ due, difficult, total, onQuickAdd }: { due: number; difficult: number; total: number; onQuickAdd: () => void }) {
  return (
    <section className="top-band">
      <div>
        <p className="eyebrow">Heute</p>
        <h2>Сегодня к повторению {due} карточек</h2>
        <p className="muted">
          В словаре {total} слов, проблемных сейчас {difficult}. Очередь пересчитывается после каждой самопроверки.
        </p>
      </div>
      <button className="primary-button" onClick={onQuickAdd}>
        <Plus size={18} />
        <span>Добавить слово</span>
      </button>
    </section>
  );
}

function ReviewView({
  cards,
  allCards,
  onReview,
  onAdd,
}: {
  cards: Card[];
  allCards: Card[];
  onReview: (id: string, grade: ReviewGrade) => void;
  onAdd: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const card = cards[0];

  if (!card) {
    return (
      <section className="empty-state">
        <Sparkles size={28} />
        <h3>{allCards.length ? "На сегодня все повторено" : "Пока нет карточек"}</h3>
        <p>{allCards.length ? "Можно добавить новые слова или перейти в тренажер предложений." : "Добавь первое немецкое слово, и оно сразу появится в очереди."}</p>
        <button className="primary-button" onClick={onAdd}>
          <Plus size={18} />
          <span>Добавить слово</span>
        </button>
      </section>
    );
  }

  const submitGrade = (grade: ReviewGrade) => {
    onReview(card.id, grade);
    setRevealed(false);
  };

  return (
    <section className="review-layout">
      <div className="review-card">
        <div className="card-meta">
          <span>{strengthLabel(card)}</span>
          <span className="tabular">{accuracy(card.correct, card.attempts)}%</span>
        </div>
        <p className="prompt-label">Переведи на немецкий</p>
        <h3>{card.russian}</h3>
        {card.example && <p className="context-line">{card.example}</p>}

        <button className="reveal-button" onClick={() => setRevealed((value) => !value)}>
          <span>{revealed ? "Скрыть ответ" : "Показать ответ"}</span>
          <ChevronDown className={revealed ? "is-open" : ""} size={18} />
        </button>

        {revealed && (
          <div className="answer-panel">
            <p className="answer-word">
              <GermanTerm value={germanText(card)} />
            </p>
            {card.plural && <p>Plural: {card.plural}</p>}
            {card.grammar && <p>{card.grammar}</p>}
          </div>
        )}
      </div>

      <div className="grade-grid">
        <button className="grade-button again" onClick={() => submitGrade("again")}>
          <X size={18} />
          <span>Не помню</span>
        </button>
        <button className="grade-button hard" onClick={() => submitGrade("hard")}>
          <RotateCcw size={18} />
          <span>Трудно</span>
        </button>
        <button className="grade-button good" onClick={() => submitGrade("good")}>
          <Check size={18} />
          <span>Помню</span>
        </button>
        <button className="grade-button easy" onClick={() => submitGrade("easy")}>
          <ArrowRight size={18} />
          <span>Легко</span>
        </button>
      </div>
    </section>
  );
}

function AddCardView({ onAdd }: { onAdd: (card: NewCardInput) => void }) {
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
        <p className="eyebrow">Neue Karte</p>
        <h3>Добавить карточку</h3>
        <p className="muted">Пиши артикль прямо в начале немецкого поля: `der Tisch`, `die Tasche`, `das Obst`. Приложение подсветит его само.</p>
      </div>

      <form className="card-form" onSubmit={submit}>
        <label>
          <span>Русский</span>
          <input value={form.russian} onChange={(event) => setForm({ ...form, russian: event.target.value })} placeholder="дом" />
        </label>
        <label>
          <span>Немецкий с артиклем, если нужен</span>
          <input value={form.german} onChange={(event) => setForm({ ...form, german: event.target.value })} placeholder="das Haus" />
        </label>
        <label>
          <span>Plural / форма</span>
          <input value={form.plural} onChange={(event) => setForm({ ...form, plural: event.target.value })} placeholder="die Häuser" />
        </label>
        <label>
          <span>Мини-грамматика</span>
          <input value={form.grammar} onChange={(event) => setForm({ ...form, grammar: event.target.value })} placeholder="например: kaufen + Akkusativ" />
        </label>
        <label>
          <span>Пример на немецком</span>
          <textarea value={form.example} onChange={(event) => setForm({ ...form, example: event.target.value })} placeholder="Das Haus ist sehr alt." />
        </label>
        <button className="primary-button" type="submit">
          <Plus size={18} />
          <span>Сохранить карточку</span>
        </button>
      </form>
    </section>
  );
}

function DictionaryView({ cards, onDelete }: { cards: Card[]; onDelete: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const filtered = cards.filter((card) => `${card.russian} ${card.german} ${card.example}`.toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru")));

  return (
    <section className="dictionary-section">
      <div className="section-toolbar">
        <div>
          <p className="eyebrow">Wortschatz</p>
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
        {filtered.map((card) => (
          <div className="word-row" key={card.id}>
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
              <p>{isDue(card) ? `сегодня · попыток ${card.attempts}` : `через ${card.intervalDays} дн. · попыток ${card.attempts}`}</p>
            </div>
            <button className="icon-button" onClick={() => onDelete(card.id)} aria-label={`Удалить ${card.german}`}>
              <X size={18} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function TrainerView({
  items,
  totalCount,
  onImport,
  onAnswer,
}: {
  items: TrainerItem[];
  totalCount: number;
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
          <p className="eyebrow">Satztraining</p>
          <h3>Тренажер предложений</h3>
        </div>
        <button className="secondary-button" onClick={() => setShowImport((value) => !value)}>
          <Import size={18} />
          <span>Импорт</span>
        </button>
      </div>

      {showImport && (
        <div className="import-panel">
          <p className="muted">
            Вставь таблицу с колонками `Русский` и `Немецкий`, строки русский + Tab + немецкий, CSV через `;` или JSON: {`[{"ru":"Я иду домой","de":"Ich gehe nach Hause"}]`}.
          </p>
          <textarea
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            placeholder={"Я покупаю хлеб.\tIch kaufe Brot.\nМы живем в Берлине.;Wir wohnen in Berlin."}
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
          <p>После импорта приложение будет показывать русский вариант, а ты будешь писать немецкий и сравнивать с эталоном.</p>
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
              <span className="tabular">{currentIndex + 1}/{items.length}</span>
              <span className="tabular">{accuracy(current.correct, current.attempts)}%</span>
            </div>
            <p className="prompt-label">Напиши по-немецки</p>
            <h3>{current.russian}</h3>
            <textarea value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Deine Antwort..." />
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
                <p>Сначала напиши вариант, потом сравним его с сохраненным немецким предложением.</p>
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
  theme,
  onThemeChange,
  cardsCount,
  trainerCount,
  dueCards,
  dueTrainerItems,
  onClearTrainer,
}: {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  cardsCount: number;
  trainerCount: number;
  dueCards: number;
  dueTrainerItems: number;
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
          <h4>Тема</h4>
          <div className="theme-switch" role="group" aria-label="Выбор темы">
            <button className={theme === "rainy" ? "is-active" : ""} onClick={() => onThemeChange("rainy")}>
              Rainy London
            </button>
            <button className={theme === "classic" ? "is-active" : ""} onClick={() => onThemeChange("classic")}>
              Classic
            </button>
          </div>
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
