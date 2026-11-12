import { invoke } from "@tauri-apps/api/core";
import {
  AgentTask,
  Flashcard,
  Note,
  ReviewSchedule,
  RoutingDecision,
} from "./types";
import { TaskRouter } from "./utils/taskRouter";

const fallbackRouter = new TaskRouter();

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

const nowIso = new Date().toISOString();
const twoHoursAgoIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
const twoDaysAgoIso = new Date(
  Date.now() - 2 * 24 * 60 * 60 * 1000
).toISOString();
const todayStr = new Date().toISOString().slice(0, 10);

let fallbackNotes: Note[] = [
  {
    id: 1,
    title: "Spaced Repetition & Memory Systems",
    content:
      "# Spaced Repetition & Memory Systems\n\nWelcome to **Study Hub** — a Notion + Anki hybrid workspace.\n\n## Core Concepts\n\n- **Active Recall**: Testing yourself strengthens memory traces far more effectively than passive re-reading.\n- **SM-2 Algorithm**: Calculates the optimal next review date using interval, ease factor, and recall quality.\n- **FSRS (Free Spaced Repetition Scheduler)**: Models memory stability and retrievability.\n\n> Tip: Add flashcards directly underneath this note and switch to **Study Mode** to review due cards!",
    created_at: twoDaysAgoIso,
    updated_at: twoHoursAgoIso,
  },
  {
    id: 2,
    title: "Rust & Tauri Architecture",
    content:
      "# Rust & Tauri Architecture\n\n## Overview\n\nTauri combines a lightweight **Rust** core with a system webview frontend.\n\n### Key Components\n\n1. **SQLite Persistence**: Manages local notes and flashcards storage safely.\n2. **Tauri IPC Commands**: Exposes strongly-typed backend endpoints to React and TypeScript.\n3. **Task Router**: Statically routes UI and Markdown tasks to the Lightweight pipeline and Rust, SQLite, and Anki tasks to the Reasoning pipeline.",
    created_at: twoDaysAgoIso,
    updated_at: twoDaysAgoIso,
  },
];

let fallbackFlashcards: Flashcard[] = [
  {
    id: 1,
    note_id: 1,
    front:
      "What are the three primary scheduling parameters in the SM-2 flashcard algorithm?",
    back: "Interval (days until next review), Ease Factor (multiplier, default 2.5), and Next Review Date (scheduled review date).",
    interval: 0,
    ease: 2.5,
    repetitions: 0,
    next_review: todayStr,
    created_at: twoDaysAgoIso,
  },
  {
    id: 2,
    note_id: 1,
    front:
      "What happens to a flashcard's interval when rated 'Again' (quality < 3) in SM-2?",
    back: "Repetitions reset to 0, the interval resets to 1 day, and the ease factor is reduced (down to a minimum of 1.3).",
    interval: 0,
    ease: 2.5,
    repetitions: 0,
    next_review: todayStr,
    created_at: twoDaysAgoIso,
  },
  {
    id: 3,
    note_id: 2,
    front: "How does the Multi-Model Task Router classify and route tasks?",
    back: "UI and Markdown rendering tasks go to the Lightweight model pipeline; Rust backend, SQLite persistence, and Anki algorithm logic go to the Reasoning model pipeline.",
    interval: 0,
    ease: 2.5,
    repetitions: 0,
    next_review: todayStr,
    created_at: nowIso,
  },
];

function computeFallbackSm2(
  currentInterval: number,
  currentEase: number,
  currentRepetitions: number,
  quality: number
): ReviewSchedule {
  const q = Math.min(5, Math.max(0, quality));
  const baseEase = currentEase < 1.3 ? 2.5 : currentEase;

  let repetitions = 0;
  let interval = 1;
  let ease = baseEase;

  if (q < 3) {
    ease = Math.max(1.3, baseEase - 0.2);
  } else {
    repetitions = currentRepetitions + 1;
    const updatedEase = Math.max(
      1.3,
      baseEase + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    );
    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = q === 3 ? 3 : q === 5 ? 6 : 4;
    } else {
      const prev = Math.max(1, currentInterval);
      const mult =
        q === 3 ? 1.2 : q === 5 ? updatedEase * 1.3 : updatedEase;
      interval = Math.max(1, Math.round(prev * mult));
    }
    ease = Math.round(updatedEase * 100) / 100;
  }

  const nextDate = new Date(Date.now() + interval * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  return {
    interval,
    ease,
    repetitions,
    next_review: nextDate,
  };
}

export async function fetchNotes(): Promise<Note[]> {
  if (isTauriRuntime()) {
    return invoke<Note[]>("get_notes");
  }
  return [...fallbackNotes];
}

export async function createNote(
  title: string,
  content: string
): Promise<Note> {
  if (isTauriRuntime()) {
    return invoke<Note>("create_note", { title, content });
  }
  const now = new Date().toISOString();
  const created: Note = {
    id: Date.now(),
    title,
    content,
    created_at: now,
    updated_at: now,
  };
  fallbackNotes = [created, ...fallbackNotes];
  return created;
}

export async function updateNote(
  id: number,
  title: string,
  content: string
): Promise<Note> {
  if (isTauriRuntime()) {
    return invoke<Note>("update_note", { id, title, content });
  }
  const now = new Date().toISOString();
  let updatedNote: Note | undefined;
  fallbackNotes = fallbackNotes.map((n) => {
    if (n.id === id) {
      updatedNote = { ...n, title, content, updated_at: now };
      return updatedNote;
    }
    return n;
  });
  return (
    updatedNote ?? {
      id,
      title,
      content,
      created_at: now,
      updated_at: now,
    }
  );
}

export async function deleteNote(id: number): Promise<void> {
  if (isTauriRuntime()) {
    return invoke<void>("delete_note", { id });
  }
  fallbackNotes = fallbackNotes.filter((n) => n.id !== id);
  fallbackFlashcards = fallbackFlashcards.filter((c) => c.note_id !== id);
}

export async function fetchFlashcards(noteId?: number): Promise<Flashcard[]> {
  if (isTauriRuntime()) {
    return invoke<Flashcard[]>("get_flashcards", {
      noteId: noteId ?? null,
    });
  }
  if (noteId !== undefined) {
    return fallbackFlashcards.filter((c) => c.note_id === noteId);
  }
  return [...fallbackFlashcards];
}

export async function fetchDueFlashcards(): Promise<Flashcard[]> {
  if (isTauriRuntime()) {
    return invoke<Flashcard[]>("get_due_flashcards");
  }
  const today = new Date().toISOString().slice(0, 10);
  return fallbackFlashcards.filter((c) => c.next_review.slice(0, 10) <= today);
}

export async function createFlashcard(
  noteId: number,
  front: string,
  back: string
): Promise<Flashcard> {
  if (isTauriRuntime()) {
    return invoke<Flashcard>("create_flashcard", {
      noteId,
      front,
      back,
    });
  }
  const created: Flashcard = {
    id: Date.now(),
    note_id: noteId,
    front,
    back,
    interval: 0,
    ease: 2.5,
    repetitions: 0,
    next_review: new Date().toISOString().slice(0, 10),
    created_at: new Date().toISOString(),
  };
  fallbackFlashcards = [...fallbackFlashcards, created];
  return created;
}

export async function deleteFlashcard(id: number): Promise<void> {
  if (isTauriRuntime()) {
    return invoke<void>("delete_flashcard", { id });
  }
  fallbackFlashcards = fallbackFlashcards.filter((c) => c.id !== id);
}

export async function calculateNextReview(params: {
  flashcardId?: number;
  interval?: number;
  ease?: number;
  repetitions?: number;
  quality: number;
}): Promise<ReviewSchedule> {
  if (isTauriRuntime()) {
    return invoke<ReviewSchedule>("calculate_next_review", {
      flashcardId: params.flashcardId ?? null,
      interval: params.interval ?? null,
      ease: params.ease ?? null,
      repetitions: params.repetitions ?? null,
      quality: params.quality,
    });
  }
  const schedule = computeFallbackSm2(
    params.interval ?? 0,
    params.ease ?? 2.5,
    params.repetitions ?? 0,
    params.quality
  );
  if (params.flashcardId !== undefined) {
    fallbackFlashcards = fallbackFlashcards.map((c) =>
      c.id === params.flashcardId
        ? {
            ...c,
            interval: schedule.interval,
            ease: schedule.ease,
            repetitions: schedule.repetitions,
            next_review: schedule.next_review,
          }
        : c
    );
  }
  return schedule;
}

export async function reviewFlashcard(
  id: number,
  quality: number
): Promise<Flashcard> {
  if (isTauriRuntime()) {
    return invoke<Flashcard>("review_flashcard", { id, quality });
  }
  const card = fallbackFlashcards.find((c) => c.id === id);
  const schedule = computeFallbackSm2(
    card?.interval ?? 0,
    card?.ease ?? 2.5,
    card?.repetitions ?? 0,
    quality
  );
  let updatedCard: Flashcard | undefined;
  fallbackFlashcards = fallbackFlashcards.map((c) => {
    if (c.id === id) {
      updatedCard = {
        ...c,
        interval: schedule.interval,
        ease: schedule.ease,
        repetitions: schedule.repetitions,
        next_review: schedule.next_review,
      };
      return updatedCard;
    }
    return c;
  });
  return updatedCard!;
}

export async function routeAgentTasks(
  tasks: AgentTask[]
): Promise<RoutingDecision[]> {
  if (isTauriRuntime()) {
    return invoke<RoutingDecision[]>("route_agent_tasks", { tasks });
  }
  return fallbackRouter.routeBatch(tasks);
}
