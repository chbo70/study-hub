import {
  AgentTask,
  ModelPipeline,
  RoutingDecision,
  TaskCategory,
  TaskComplexity,
} from "../types";

/**
 * Multi-Model Routing Strategy (`TaskRouter`)
 * - Evaluates task complexity statically.
 * - Routes UI/Markdown rendering tasks to the lightweight model pipeline.
 * - Routes Rust backend, SQLite persistence, and Anki algorithm logic to the reasoning model pipeline.
 */
export class TaskRouter {
  static categorizeTask(title: string, description: string): TaskCategory {
    const combined = `${title} ${description}`.toLowerCase();

    if (
      combined.includes("anki") ||
      combined.includes("sm-2") ||
      combined.includes("sm2") ||
      combined.includes("fsrs") ||
      combined.includes("spaced repetition") ||
      combined.includes("next_review") ||
      combined.includes("interval") ||
      combined.includes("ease") ||
      combined.includes("schedule")
    ) {
      return "anki_algorithm";
    }

    if (
      combined.includes("sqlite") ||
      combined.includes("rusqlite") ||
      combined.includes("database") ||
      combined.includes("sql") ||
      combined.includes("persistence") ||
      combined.includes("schema") ||
      combined.includes("crud")
    ) {
      return "sqlite_persistence";
    }

    if (
      combined.includes("rust") ||
      combined.includes("tauri") ||
      combined.includes("cargo") ||
      combined.includes("backend") ||
      combined.includes("command")
    ) {
      return "rust_backend";
    }

    if (
      combined.includes("markdown") ||
      combined.includes("wysiwyg") ||
      combined.includes("prosemirror") ||
      combined.includes("milkdown") ||
      combined.includes("preview") ||
      combined.includes("editor")
    ) {
      return "markdown_rendering";
    }

    if (
      combined.includes("ui") ||
      combined.includes("frontend") ||
      combined.includes("react") ||
      combined.includes("sidebar") ||
      combined.includes("layout") ||
      combined.includes("notion") ||
      combined.includes("css") ||
      combined.includes("render")
    ) {
      return "ui_rendering";
    }

    return "general";
  }

  static evaluateComplexity(
    category: TaskCategory,
    title: string,
    description: string
  ): TaskComplexity {
    const combined = `${title} ${description}`.toLowerCase();
    const wordCount = combined.trim().split(/\s+/).length;

    if (
      category === "anki_algorithm" ||
      category === "sqlite_persistence" ||
      category === "rust_backend"
    ) {
      return wordCount > 25 ||
        combined.includes("transaction") ||
        combined.includes("fsrs") ||
        combined.includes("migration")
        ? "high"
        : "medium";
    }

    if (category === "ui_rendering" || category === "markdown_rendering") {
      return wordCount > 35 ? "medium" : "low";
    }

    if (wordCount > 30) return "high";
    if (wordCount > 12) return "medium";
    return "low";
  }

  static selectPipeline(
    category: TaskCategory,
    complexity: TaskComplexity
  ): ModelPipeline {
    if (category === "ui_rendering" || category === "markdown_rendering") {
      return "lightweight";
    }
    if (
      category === "rust_backend" ||
      category === "sqlite_persistence" ||
      category === "anki_algorithm"
    ) {
      return "reasoning";
    }
    return complexity === "high" ? "reasoning" : "lightweight";
  }

  routeTask(task: AgentTask): RoutingDecision {
    const category = TaskRouter.categorizeTask(task.title, task.description);
    const complexity = TaskRouter.evaluateComplexity(
      category,
      task.title,
      task.description
    );
    const pipeline = TaskRouter.selectPipeline(category, complexity);

    const categoryLabel = {
      ui_rendering: "UI Rendering",
      markdown_rendering: "Markdown Rendering",
      rust_backend: "Rust Backend",
      sqlite_persistence: "SQLite Persistence",
      anki_algorithm: "Anki Algorithm",
      general: "General Task",
    }[category];
    const complexityLabel =
      complexity.charAt(0).toUpperCase() + complexity.slice(1);

    const rationale =
      pipeline === "lightweight"
        ? `Statically classified as ${categoryLabel} (${complexityLabel} complexity); routed to Lightweight model pipeline for UI/Markdown rendering.`
        : `Statically classified as ${categoryLabel} (${complexityLabel} complexity); routed to Reasoning model pipeline for Rust backend, SQLite persistence, or Anki scheduling logic.`;

    return {
      task_id: task.id,
      title: task.title,
      category,
      complexity,
      pipeline,
      rationale,
    };
  }

  routeBatch(tasks: AgentTask[]): RoutingDecision[] {
    return tasks.map((task) => this.routeTask(task));
  }
}
