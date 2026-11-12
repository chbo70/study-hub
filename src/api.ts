import { invoke } from "@tauri-apps/api/core";
import type {
  AgentTask,
  CardType,
  Deck,
  Flashcard,
  Folder,
  ImportDeckResult,
  Note,
  ReviewSchedule,
  RoutingDecision,
} from "./types";
import { TaskRouter } from "./utils/taskRouter";

const fallbackRouter = new TaskRouter();

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

const nowIso = new Date().toISOString();
const twoHoursAgoIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
const twoDaysAgoIso = new Date(
  Date.now() - 2 * 24 * 60 * 60 * 1000
).toISOString();
const todayStr = new Date().toISOString().slice(0, 10);

let fallbackFolders: Folder[] = [
  {
    id: 1,
    name: "Cognitive Science",
    parent_id: null,
    created_at: twoDaysAgoIso,
    updated_at: twoDaysAgoIso,
  },
  {
    id: 2,
    name: "Memory & Spaced Repetition",
    parent_id: 1,
    created_at: twoDaysAgoIso,
    updated_at: twoHoursAgoIso,
  },
  {
    id: 3,
    name: "Systems Engineering",
    parent_id: null,
    created_at: twoDaysAgoIso,
    updated_at: twoDaysAgoIso,
  },
  {
    id: 4,
    name: "Rust & Tauri Internals",
    parent_id: 3,
    created_at: twoDaysAgoIso,
    updated_at: twoDaysAgoIso,
  },
];

let fallbackNotes: Note[] = [
  {
    id: 1,
    title: "Spaced Repetition & Memory Systems",
    folder_id: 2,
    content:
      "# Spaced Repetition & Memory Systems\n\nWelcome to **Study Hub v3** — featuring nested directories, `studyhub://` local image assets, and automated flashcard generation.\n\n## Core Concepts\n\n- :emerald[**Active Recall**]: Testing yourself strengthens memory traces far more effectively than passive re-reading.\n- :amber[**SM-2 Algorithm**]: Calculates the optimal next review date using interval, ease factor, and recall quality.\n- :sky[**FSRS Scheduler**]: Models memory stability and retrievability over long horizons.\n\n## SM-2 Scheduling\n\nWhen reviewing a card, quality grades below `3` (:rose[Again]) reset repetitions to `0` and schedule the card for `1 day`.\n\n## Flashcard Generation Syntax\n\n**Q:** What is the minimum ease factor allowed in the SM-2 algorithm?\n**A:** The minimum ease factor is `1.30` (130%), preventing cards from entering an unrecoverable interval spiral.\n\n- Cloze example: Synaptic consolidation relies on {{c1::Long-Term Potentiation (LTP)}} in the {{c2::hippocampus}}.\n\n:::note\nUse `:emerald[text]`, `:amber[text]`, `:rose[text]`, `:sky[text]`, `:violet[text]`, or `:color[custom text]{color=\"#2563eb\"}` to highlight key study concepts in color!\n:::",
    created_at: twoDaysAgoIso,
    updated_at: twoHoursAgoIso,
  },
  {
    id: 2,
    title: "Rust & Tauri Architecture",
    folder_id: 4,
    content:
      "# Rust & Tauri Architecture\n\n## Overview\n\nTauri combines a lightweight **Rust** core with a system webview frontend.\n\n## Key Components\n\n1. :emerald[**SQLite Persistence**]: Manages local folders, notes, decks, and flashcards storage safely.\n2. :sky[**Tauri IPC Commands**]: Exposes strongly-typed backend endpoints (`save_image`, `import_deck`, `create_flashcard`, `review_flashcard`) to React and TypeScript.\n3. :violet[**Task Router**]: Statically routes UI and Markdown tasks to the Lightweight pipeline and Rust, SQLite, and Anki tasks to the Reasoning pipeline.\n\n## Local Asset Protocol\n\n**Q:** How does Study Hub v3 securely serve pasted or dropped images in the Markdown preview?\n**A:** Through the `save_image` Rust command saving to `study-hub-data/images` and the custom `studyhub://` URI scheme protocol.",
    created_at: twoDaysAgoIso,
    updated_at: twoDaysAgoIso,
  },
];

let fallbackDecks: Deck[] = [
  {
    id: 1,
    name: "Cognitive Science & Memory",
    description:
      "Core spaced repetition algorithms, active recall, and memory consolidation.",
    created_at: twoDaysAgoIso,
    updated_at: twoHoursAgoIso,
  },
  {
    id: 2,
    name: "Rust & Tauri Systems",
    description:
      "Backend architecture, SQLite schema design, and multi-model task routing.",
    created_at: twoDaysAgoIso,
    updated_at: twoDaysAgoIso,
  },
];

let fallbackFlashcards: Flashcard[] = [
  {
    id: 1,
    deck_id: 1,
    note_id: null,
    front:
      "What are the three primary scheduling parameters in the **SM-2** flashcard algorithm?",
    back: "**Interval** (days until next review), **Ease Factor** (multiplier, default `2.5`), and **Next Review Date**.",
    card_type: "default",
    options: [],
    reference_tag: "Spaced Repetition & Memory Systems#Core Concepts",
    interval: 0,
    ease: 2.5,
    repetitions: 0,
    next_review: todayStr,
    created_at: twoDaysAgoIso,
  },
  {
    id: 2,
    deck_id: 1,
    note_id: null,
    front:
      "What happens to a flashcard's interval when rated **Again** (`quality < 3`) in SM-2?",
    back: "Interval resets to 1 day, repetitions reset to 0, and ease factor decreases by 0.20 (minimum 1.3).",
    card_type: "single_choice",
    options: [
      "Interval resets to 1 day and repetitions reset to 0",
      "Interval is multiplied by 1.2x",
      "Interval remains unchanged",
      "Card is archived permanently",
    ],
    reference_tag: "Spaced Repetition & Memory Systems#SM-2 Scheduling",
    interval: 0,
    ease: 2.5,
    repetitions: 0,
    next_review: todayStr,
    created_at: twoDaysAgoIso,
  },
  {
    id: 3,
    deck_id: 2,
    note_id: null,
    front:
      "Which of the following tasks are routed to the **Reasoning Model Pipeline** by `TaskRouter`?",
    back: "Rust backend commands, SQLite persistence/migrations, and Anki SM-2 algorithm calculations.",
    card_type: "multiple_choice",
    options: [
      "Rust backend IPC commands",
      "SQLite persistence & schema migrations",
      "Anki SM-2 scheduling logic",
      "Markdown preview & UI layout rendering",
    ],
    reference_tag: "Rust & Tauri Architecture#Key Components",
    interval: 0,
    ease: 2.5,
    repetitions: 0,
    next_review: todayStr,
    created_at: nowIso,
  },
];

// In-memory cache mapping filename / `studyhub://` URI to data URLs for instant preview & browser fallback
const localImageCache = new Map<string, string>();

// Pre-seed a sample diagram image in cache so `![diagram](studyhub://images/sample-architecture.svg)` works out of the box
const SAMPLE_SVG_DATA_URL =
  "data:image/svg+xml;base64," +
  btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="140" viewBox="0 0 520 140">
      <rect width="520" height="140" rx="14" fill="#1c1917"/>
      <rect x="20" y="28" width="140" height="84" rx="10" fill="#065f46" stroke="#10b981" stroke-width="1.5"/>
      <text x="90" y="65" fill="#ecfdf5" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">Markdown Editor</text>
      <text x="90" y="85" fill="#a7f3d0" font-family="monospace" font-size="10" text-anchor="middle">Paste / Drop Image</text>
      <path d="M168 70 L202 70" stroke="#78716c" stroke-width="2" stroke-dasharray="4 3"/>
      <rect x="210" y="28" width="130" height="84" rx="10" fill="#1e3a8a" stroke="#38bdf8" stroke-width="1.5"/>
      <text x="275" y="65" fill="#f0f9ff" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">save_image (Rust)</text>
      <text x="275" y="85" fill="#bae6fd" font-family="monospace" font-size="10" text-anchor="middle">study-hub-data/images</text>
      <path d="M348 70 L374 70" stroke="#78716c" stroke-width="2" stroke-dasharray="4 3"/>
      <rect x="380" y="28" width="120" height="84" rx="10" fill="#581c87" stroke="#c084fc" stroke-width="1.5"/>
      <text x="440" y="65" fill="#faf5ff" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">studyhub://</text>
      <text x="440" y="85" fill="#e9d5ff" font-family="monospace" font-size="10" text-anchor="middle">Custom Protocol</text>
    </svg>`
  );
localImageCache.set("sample-architecture.svg", SAMPLE_SVG_DATA_URL);
localImageCache.set(
  "studyhub://images/sample-architecture.svg",
  SAMPLE_SVG_DATA_URL
);

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

// ============================================================================
// Phase 1: Folders API (Nested Directories)
// ============================================================================

export async function fetchFolders(): Promise<Folder[]> {
  if (isTauriRuntime()) {
    return invoke<Folder[]>("get_folders");
  }
  return [...fallbackFolders];
}

export async function createFolder(
  name: string,
  parentId: number | null = null
): Promise<Folder> {
  const cleanedName = name.trim() || "Untitled Folder";
  if (isTauriRuntime()) {
    return invoke<Folder>("create_folder", {
      name: cleanedName,
      parentId,
    });
  }
  const now = new Date().toISOString();
  const created: Folder = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    name: cleanedName,
    parent_id: parentId,
    created_at: now,
    updated_at: now,
  };
  fallbackFolders = [...fallbackFolders, created];
  return created;
}

export async function updateFolder(
  id: number,
  name: string,
  parentId: number | null = null
): Promise<Folder> {
  const cleanedName = name.trim() || "Untitled Folder";
  if (isTauriRuntime()) {
    return invoke<Folder>("update_folder", {
      id,
      name: cleanedName,
      parentId,
    });
  }
  const now = new Date().toISOString();
  let updated: Folder | undefined;
  fallbackFolders = fallbackFolders.map((f) => {
    if (f.id === id) {
      updated = {
        ...f,
        name: cleanedName,
        parent_id: parentId === id ? null : parentId,
        updated_at: now,
      };
      return updated;
    }
    return f;
  });
  return (
    updated ?? {
      id,
      name: cleanedName,
      parent_id: parentId,
      created_at: now,
      updated_at: now,
    }
  );
}

export async function deleteFolder(id: number): Promise<void> {
  if (isTauriRuntime()) {
    return invoke<void>("delete_folder", { id });
  }
  // Collect descendant folder IDs for cascade
  const toRemove = new Set<number>([id]);
  let added = true;
  while (added) {
    added = false;
    for (const f of fallbackFolders) {
      if (f.parent_id !== null && toRemove.has(f.parent_id) && !toRemove.has(f.id)) {
        toRemove.add(f.id);
        added = true;
      }
    }
  }
  fallbackFolders = fallbackFolders.filter((f) => !toRemove.has(f.id));
  fallbackNotes = fallbackNotes.map((n) =>
    n.folder_id !== null && toRemove.has(n.folder_id)
      ? { ...n, folder_id: null }
      : n
  );
}

export async function moveNoteToFolder(
  noteId: number,
  folderId: number | null
): Promise<Note> {
  if (isTauriRuntime()) {
    return invoke<Note>("move_note_to_folder", {
      id: noteId,
      folderId,
    });
  }
  const now = new Date().toISOString();
  let updatedNote: Note | undefined;
  fallbackNotes = fallbackNotes.map((n) => {
    if (n.id === noteId) {
      updatedNote = { ...n, folder_id: folderId, updated_at: now };
      return updatedNote;
    }
    return n;
  });
  if (!updatedNote) {
    throw new Error(`Note ${noteId} not found`);
  }
  return updatedNote;
}

// ============================================================================
// Notes API
// ============================================================================

export async function fetchNotes(): Promise<Note[]> {
  if (isTauriRuntime()) {
    return invoke<Note[]>("get_notes");
  }
  return [...fallbackNotes];
}

export async function createNote(
  title: string,
  content: string,
  folderId: number | null = null
): Promise<Note> {
  if (isTauriRuntime()) {
    return invoke<Note>("create_note", {
      title,
      content,
      folderId,
    });
  }
  const now = new Date().toISOString();
  const created: Note = {
    id: Date.now(),
    title,
    content,
    folder_id: folderId,
    created_at: now,
    updated_at: now,
  };
  fallbackNotes = [created, ...fallbackNotes];
  return created;
}

export async function updateNote(
  id: number,
  title: string,
  content: string,
  folderId?: number | null
): Promise<Note> {
  if (isTauriRuntime()) {
    return invoke<Note>("update_note", {
      id,
      title,
      content,
      folderId: folderId ?? null,
    });
  }
  const now = new Date().toISOString();
  let updatedNote: Note | undefined;
  fallbackNotes = fallbackNotes.map((n) => {
    if (n.id === id) {
      updatedNote = {
        ...n,
        title,
        content,
        folder_id: folderId !== undefined ? folderId : n.folder_id,
        updated_at: now,
      };
      return updatedNote;
    }
    return n;
  });
  return (
    updatedNote ?? {
      id,
      title,
      content,
      folder_id: folderId ?? null,
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
}

// ============================================================================
// Phase 2: Local Image & Media Support (`save_image` & `studyhub://` Protocol)
// ============================================================================

export function extractFilenameFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || `img_${Date.now()}.png`;
}

export function toStudyHubMarkdownUri(savedFilePath: string): string {
  if (
    savedFilePath.startsWith("studyhub://") ||
    savedFilePath.startsWith("asset://")
  ) {
    return savedFilePath;
  }
  const filename = extractFilenameFromPath(savedFilePath);
  return `studyhub://images/${filename}`;
}

/**
 * Calls the Tauri Rust command `save_image` with a base64 buffer or file path,
 * saves it to `study-hub-data/images`, and returns the persistent local file path.
 */
export async function saveImage(
  payload: string,
  filename?: string
): Promise<{ localPath: string; markdownUri: string }> {
  const trimmed = payload.trim();
  if (!trimmed) {
    throw new Error("Image payload cannot be empty.");
  }

  let savedLocalPath: string;

  if (isTauriRuntime()) {
    savedLocalPath = await invoke<string>("save_image", {
      payload: trimmed,
      filename: filename ?? null,
    });
  } else {
    const ext =
      filename?.split(".").pop()?.toLowerCase() ||
      (trimmed.startsWith("data:image/jpeg")
        ? "jpg"
        : trimmed.startsWith("data:image/gif")
          ? "gif"
          : trimmed.startsWith("data:image/webp")
            ? "webp"
            : trimmed.startsWith("data:image/svg")
              ? "svg"
              : "png");
    const safeStem = (filename || "clipboard")
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 32);
    const generatedName = `img_${Date.now()}_${safeStem}.${ext}`;
    savedLocalPath = `study-hub-data/images/${generatedName}`;
  }

  const fname = extractFilenameFromPath(savedLocalPath);
  const markdownUri = `studyhub://images/${fname}`;

  // Cache data URL in memory so live preview is instantaneous
  if (trimmed.startsWith("data:image/")) {
    localImageCache.set(fname, trimmed);
    localImageCache.set(markdownUri, trimmed);
    localImageCache.set(savedLocalPath, trimmed);
  }

  return {
    localPath: savedLocalPath,
    markdownUri,
  };
}

/**
 * Resolves a `studyhub://` or `asset://` image URI for display in `<MarkdownPreview>`.
 * Uses the Tauri custom protocol directly when in Tauri runtime, or falls back to
 * `read_local_image` / in-memory cache so images render reliably on every platform.
 */
export async function resolveStudyHubImageDataUrl(
  uriOrPath: string
): Promise<string | null> {
  const trimmed = uriOrPath.trim();
  if (localImageCache.has(trimmed)) {
    return localImageCache.get(trimmed)!;
  }
  const fname = extractFilenameFromPath(trimmed);
  if (localImageCache.has(fname)) {
    return localImageCache.get(fname)!;
  }
  if (isTauriRuntime()) {
    try {
      const dataUrl = await invoke<string>("read_local_image", {
        pathOrUri: trimmed,
      });
      localImageCache.set(trimmed, dataUrl);
      localImageCache.set(fname, dataUrl);
      return dataUrl;
    } catch {
      return null;
    }
  }
  return null;
}

export function getCachedStudyHubImage(uriOrPath: string): string | null {
  const trimmed = uriOrPath.trim();
  if (localImageCache.has(trimmed)) {
    return localImageCache.get(trimmed)!;
  }
  const fname = extractFilenameFromPath(trimmed);
  return localImageCache.get(fname) ?? null;
}

// ============================================================================
// Decks & Flashcards API
// ============================================================================

export async function fetchDecks(): Promise<Deck[]> {
  if (isTauriRuntime()) {
    return invoke<Deck[]>("get_decks");
  }
  return [...fallbackDecks];
}

export async function createDeck(
  name: string,
  description = ""
): Promise<Deck> {
  const cleanedName = name.trim() || "Untitled Deck";
  const cleanedDesc = description.trim();
  if (isTauriRuntime()) {
    return invoke<Deck>("create_deck", {
      name: cleanedName,
      description: cleanedDesc,
    });
  }
  const now = new Date().toISOString();
  const created: Deck = {
    id: Date.now(),
    name: cleanedName,
    description: cleanedDesc,
    created_at: now,
    updated_at: now,
  };
  fallbackDecks = [...fallbackDecks, created];
  return created;
}

export async function updateDeck(
  id: number,
  name: string,
  description = ""
): Promise<Deck> {
  const cleanedName = name.trim() || "Untitled Deck";
  const cleanedDesc = description.trim();
  if (isTauriRuntime()) {
    return invoke<Deck>("update_deck", {
      id,
      name: cleanedName,
      description: cleanedDesc,
    });
  }
  const now = new Date().toISOString();
  let updated: Deck | undefined;
  fallbackDecks = fallbackDecks.map((d) => {
    if (d.id === id) {
      updated = {
        ...d,
        name: cleanedName,
        description: cleanedDesc,
        updated_at: now,
      };
      return updated;
    }
    return d;
  });
  return (
    updated ?? {
      id,
      name: cleanedName,
      description: cleanedDesc,
      created_at: now,
      updated_at: now,
    }
  );
}

export async function deleteDeck(id: number): Promise<void> {
  if (isTauriRuntime()) {
    return invoke<void>("delete_deck", { id });
  }
  fallbackDecks = fallbackDecks.filter((d) => d.id !== id);
  fallbackFlashcards = fallbackFlashcards.filter((c) => c.deck_id !== id);
}

export async function fetchFlashcards(deckId?: number): Promise<Flashcard[]> {
  if (isTauriRuntime()) {
    return invoke<Flashcard[]>("get_flashcards", {
      deckId: deckId ?? null,
    });
  }
  if (deckId !== undefined) {
    return fallbackFlashcards.filter((c) => c.deck_id === deckId);
  }
  return [...fallbackFlashcards];
}

export async function fetchDueFlashcards(deckId?: number): Promise<Flashcard[]> {
  if (isTauriRuntime()) {
    return invoke<Flashcard[]>("get_due_flashcards", {
      deckId: deckId ?? null,
    });
  }
  const today = new Date().toISOString().slice(0, 10);
  return fallbackFlashcards.filter(
    (c) =>
      c.next_review.slice(0, 10) <= today &&
      (deckId === undefined || c.deck_id === deckId)
  );
}

export interface CreateFlashcardInput {
  deckId?: number;
  front: string;
  back: string;
  cardType?: CardType;
  options?: string[];
  referenceTag?: string | null;
}

export async function createFlashcard(
  input: CreateFlashcardInput
): Promise<Flashcard> {
  const cardType = input.cardType ?? "default";
  const options = input.options ?? [];
  const referenceTag = input.referenceTag?.trim() || null;

  if (isTauriRuntime()) {
    return invoke<Flashcard>("create_flashcard", {
      deckId: input.deckId ?? null,
      front: input.front,
      back: input.back,
      cardType,
      options,
      referenceTag,
    });
  }

  const resolvedDeckId = input.deckId ?? fallbackDecks[0]?.id ?? 1;
  const created: Flashcard = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    deck_id: resolvedDeckId,
    note_id: null,
    front: input.front,
    back: input.back,
    card_type: cardType,
    options,
    reference_tag: referenceTag,
    interval: 0,
    ease: 2.5,
    repetitions: 0,
    next_review: new Date().toISOString().slice(0, 10),
    created_at: new Date().toISOString(),
  };
  fallbackFlashcards = [...fallbackFlashcards, created];
  return created;
}

export interface UpdateFlashcardInput {
  id: number;
  deckId?: number;
  front: string;
  back: string;
  cardType?: CardType;
  options?: string[];
  referenceTag?: string | null;
}

export async function updateFlashcard(
  input: UpdateFlashcardInput
): Promise<Flashcard> {
  const referenceTag =
    input.referenceTag !== undefined
      ? input.referenceTag?.trim() ?? ""
      : undefined;

  if (isTauriRuntime()) {
    return invoke<Flashcard>("update_flashcard", {
      id: input.id,
      deckId: input.deckId ?? null,
      front: input.front,
      back: input.back,
      cardType: input.cardType ?? null,
      options: input.options ?? null,
      referenceTag: referenceTag ?? null,
    });
  }

  let updatedCard: Flashcard | undefined;
  fallbackFlashcards = fallbackFlashcards.map((c) => {
    if (c.id === input.id) {
      updatedCard = {
        ...c,
        deck_id: input.deckId ?? c.deck_id,
        front: input.front.trim(),
        back: input.back.trim(),
        card_type: input.cardType ?? c.card_type,
        options: input.options ?? c.options,
        reference_tag:
          input.referenceTag !== undefined
            ? input.referenceTag?.trim() || null
            : c.reference_tag,
      };
      return updatedCard;
    }
    return c;
  });

  if (!updatedCard) {
    throw new Error(`Flashcard ${input.id} not found`);
  }
  return updatedCard;
}

export async function deleteFlashcard(id: number): Promise<void> {
  if (isTauriRuntime()) {
    return invoke<void>("delete_flashcard", { id });
  }
  fallbackFlashcards = fallbackFlashcards.filter((c) => c.id !== id);
}

function normalizeCardType(raw?: string): CardType {
  const norm = (raw ?? "default").trim().toLowerCase().replace(/-/g, "_");
  if (norm === "single_choice" || norm === "single") return "single_choice";
  if (norm === "multiple_choice" || norm === "multiple")
    return "multiple_choice";
  return "default";
}

function parseFallbackCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field.trim());
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim());
      field = "";
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some((c) => c.length > 0)) rows.push(row);
  }
  return rows;
}

export async function importDeck(params: {
  payload: string;
  deckName?: string;
  deckDescription?: string;
  format?: "json" | "csv";
}): Promise<ImportDeckResult> {
  if (isTauriRuntime()) {
    return invoke<ImportDeckResult>("import_deck", {
      payload: params.payload,
      deckName: params.deckName ?? null,
      deckDescription: params.deckDescription ?? null,
      format: params.format ?? null,
    });
  }

  const trimmed = params.payload.trim();
  const isJson =
    params.format === "json" ||
    (!params.format && (trimmed.startsWith("{") || trimmed.startsWith("[")));

  let deckName = params.deckName?.trim() || "";
  let deckDescription = params.deckDescription?.trim() || "";
  const cardsToCreate: Array<{
    front: string;
    back: string;
    cardType: CardType;
    options: string[];
    referenceTag?: string | null;
  }> = [];

  if (isJson) {
    const parsed = JSON.parse(trimmed);
    const rawCards = Array.isArray(parsed)
      ? parsed
      : parsed.cards ?? parsed.flashcards ?? [];
    if (!deckName && !Array.isArray(parsed)) {
      deckName = parsed.name || parsed.deck_name || parsed.title || "";
    }
    if (!deckDescription && !Array.isArray(parsed)) {
      deckDescription = parsed.description || "";
    }
    for (const item of rawCards) {
      if (!item?.front || !item?.back) continue;
      const opts = Array.isArray(item.options)
        ? item.options.map(String)
        : typeof item.options === "string" && item.options.trim()
          ? item.options.split(/[|;,]/).map((s: string) => s.trim())
          : [];
      cardsToCreate.push({
        front: String(item.front).trim(),
        back: String(item.back).trim(),
        cardType: normalizeCardType(item.card_type),
        options: opts,
        referenceTag: item.reference_tag
          ? String(item.reference_tag).trim()
          : null,
      });
    }
  } else {
    const rows = parseFallbackCsv(trimmed);
    if (rows.length > 0) {
      const firstLower = rows[0].map((c) => c.toLowerCase());
      const hasHeader = firstLower.some((c) =>
        ["front", "question", "prompt", "back", "answer"].includes(c)
      );
      const startIdx = hasHeader ? 1 : 0;
      for (let i = startIdx; i < rows.length; i++) {
        const r = rows[i];
        if (!r[0] || !r[1]) continue;
        const rawOpts = r[3] || "";
        const opts = rawOpts.startsWith("[")
          ? JSON.parse(rawOpts)
          : rawOpts
            ? rawOpts
                .split(/[|;]/)
                .map((s) => s.trim())
                .filter(Boolean)
            : [];
        cardsToCreate.push({
          front: r[0],
          back: r[1],
          cardType: normalizeCardType(r[2]),
          options: opts,
          referenceTag: r[4] || null,
        });
      }
    }
  }

  const deck = await createDeck(
    deckName || "Imported Study Deck",
    deckDescription || `Imported ${cardsToCreate.length} flashcards.`
  );
  const createdCards: Flashcard[] = [];
  for (const c of cardsToCreate) {
    const card = await createFlashcard({
      deckId: deck.id,
      front: c.front,
      back: c.back,
      cardType: c.cardType,
      options: c.options,
      referenceTag: c.referenceTag,
    });
    createdCards.push(card);
  }

  return {
    deck,
    flashcards: createdCards,
    imported_count: createdCards.length,
  };
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
