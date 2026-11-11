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

export async function fetchNotes(): Promise<Note[]> {
  if (isTauriRuntime()) {
    return invoke<Note[]>("get_notes");
  }
  return [];
}

export async function createNote(
  title: string,
  content: string
): Promise<Note> {
  return invoke<Note>("create_note", { title, content });
}

export async function updateNote(
  id: number,
  title: string,
  content: string
): Promise<Note> {
  return invoke<Note>("update_note", { id, title, content });
}

export async function deleteNote(id: number): Promise<void> {
  return invoke<void>("delete_note", { id });
}

export async function fetchFlashcards(noteId?: number): Promise<Flashcard[]> {
  return invoke<Flashcard[]>("get_flashcards", {
    noteId: noteId ?? null,
  });
}

export async function fetchDueFlashcards(): Promise<Flashcard[]> {
  return invoke<Flashcard[]>("get_due_flashcards");
}

export async function createFlashcard(
  noteId: number,
  front: string,
  back: string
): Promise<Flashcard> {
  return invoke<Flashcard>("create_flashcard", {
    noteId,
    front,
    back,
  });
}

export async function deleteFlashcard(id: number): Promise<void> {
  return invoke<void>("delete_flashcard", { id });
}

export async function calculateNextReview(params: {
  flashcardId?: number;
  interval?: number;
  ease?: number;
  repetitions?: number;
  quality: number;
}): Promise<ReviewSchedule> {
  return invoke<ReviewSchedule>("calculate_next_review", {
    flashcardId: params.flashcardId ?? null,
    interval: params.interval ?? null,
    ease: params.ease ?? null,
    repetitions: params.repetitions ?? null,
    quality: params.quality,
  });
}

export async function reviewFlashcard(
  id: number,
  quality: number
): Promise<Flashcard> {
  return invoke<Flashcard>("review_flashcard", { id, quality });
}

export async function routeAgentTasks(
  tasks: AgentTask[]
): Promise<RoutingDecision[]> {
  if (isTauriRuntime()) {
    return invoke<RoutingDecision[]>("route_agent_tasks", { tasks });
  }
  return fallbackRouter.routeBatch(tasks);
}
