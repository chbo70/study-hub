export interface Folder {
  id: number;
  name: string;
  parent_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: number;
  title: string;
  content: string;
  folder_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Deck {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export type CardType = "default" | "single_choice" | "multiple_choice";

export interface Flashcard {
  id: number;
  deck_id: number;
  note_id?: number | null;
  front: string;
  back: string;
  card_type: CardType;
  options: string[];
  reference_tag?: string | null;
  interval: number;
  ease: number;
  repetitions: number;
  next_review: string;
  created_at: string;
}

export interface GeneratedCardDraft {
  id: string;
  front: string;
  back: string;
  card_type: CardType;
  options: string[];
  reference_tag: string | null;
  source_method: "gemini" | "ollama" | "markdown_syntax";
}

export type AiProviderMode = "gemini" | "ollama" | "markdown_syntax";

export interface AiProviderSettings {
  provider: AiProviderMode;
  geminiConnected: boolean;
  geminiAccountEmail: string;
  geminiApiKey: string;
  geminiModel: "gemini-2.5-flash" | "gemini-2.5-pro";
  ollamaEndpoint: string;
  ollamaModel: string;
  parseClozes: boolean;
  parseBoldQuestions: boolean;
  parseKeyDefinitions: boolean;
}

export interface ImportDeckResult {
  deck: Deck;
  flashcards: Flashcard[];
  imported_count: number;
}

export interface ReviewSchedule {
  interval: number;
  ease: number;
  repetitions: number;
  next_review: string;
}

export type ModelPipeline = "lightweight" | "reasoning";
export type TaskComplexity = "low" | "medium" | "high";
export type TaskCategory =
  | "ui_rendering"
  | "markdown_rendering"
  | "rust_backend"
  | "sqlite_persistence"
  | "anki_algorithm"
  | "general";

export interface AgentTask {
  id: string;
  title: string;
  description: string;
}

export interface RoutingDecision {
  task_id: string;
  title: string;
  category: TaskCategory;
  complexity: TaskComplexity;
  pipeline: ModelPipeline;
  rationale: string;
}
