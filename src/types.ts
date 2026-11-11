export interface Note {
  id: number;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface Flashcard {
  id: number;
  note_id: number;
  front: string;
  back: string;
  interval: number;
  ease: number;
  repetitions: number;
  next_review: string;
  created_at: string;
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
