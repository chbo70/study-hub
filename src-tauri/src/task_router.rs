use serde::{Deserialize, Serialize};

/// Target model pipeline for multi-model routing strategy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelPipeline {
    Lightweight,
    Reasoning,
}

/// Static complexity classification of an incoming task.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskComplexity {
    Low,
    Medium,
    High,
}

/// High-level domain category of an agent or background task.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskCategory {
    UiRendering,
    MarkdownRendering,
    RustBackend,
    SqlitePersistence,
    AnkiAlgorithm,
    General,
}

/// Input task descriptor for the background task runner and router.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTask {
    pub id: String,
    pub title: String,
    pub description: String,
}

/// Result of static task evaluation and model pipeline routing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutingDecision {
    pub task_id: String,
    pub title: String,
    pub category: TaskCategory,
    pub complexity: TaskComplexity,
    pub pipeline: ModelPipeline,
    pub rationale: String,
}

/// Multi-Model `TaskRouter` that statically evaluates task complexity and routes tasks:
/// - UI/Markdown rendering tasks -> Lightweight model pipeline
/// - Rust backend, SQLite persistence, and Anki algorithm logic -> Reasoning model pipeline
#[derive(Debug, Default, Clone)]
pub struct TaskRouter;

impl TaskRouter {
    pub fn new() -> Self {
        Self
    }

    /// Statically evaluates task category based on task title and description keywords.
    pub fn categorize_task(title: &str, description: &str) -> TaskCategory {
        let combined = format!("{} {}", title.to_lowercase(), description.to_lowercase());

        // Check reasoning-heavy backend/persistence/algorithm categories first
        if combined.contains("anki")
            || combined.contains("sm-2")
            || combined.contains("sm2")
            || combined.contains("fsrs")
            || combined.contains("spaced repetition")
            || combined.contains("next_review")
            || combined.contains("interval")
            || combined.contains("ease")
            || combined.contains("schedule")
        {
            return TaskCategory::AnkiAlgorithm;
        }

        if combined.contains("sqlite")
            || combined.contains("rusqlite")
            || combined.contains("database")
            || combined.contains("sql")
            || combined.contains("persistence")
            || combined.contains("schema")
            || combined.contains("migration")
            || combined.contains("crud")
        {
            return TaskCategory::SqlitePersistence;
        }

        if combined.contains("rust")
            || combined.contains("tauri")
            || combined.contains("cargo")
            || combined.contains("backend")
            || combined.contains("command")
            || combined.contains("mutex")
        {
            return TaskCategory::RustBackend;
        }

        // Check UI and Markdown rendering tasks
        if combined.contains("markdown")
            || combined.contains("wysiwyg")
            || combined.contains("prosemirror")
            || combined.contains("milkdown")
            || combined.contains("preview")
            || combined.contains("parser")
        {
            return TaskCategory::MarkdownRendering;
        }

        if combined.contains("ui")
            || combined.contains("frontend")
            || combined.contains("react")
            || combined.contains("sidebar")
            || combined.contains("layout")
            || combined.contains("notion")
            || combined.contains("css")
            || combined.contains("style")
            || combined.contains("component")
            || combined.contains("render")
        {
            return TaskCategory::UiRendering;
        }

        TaskCategory::General
    }

    /// Statically evaluates the complexity of a task without runtime LLM invocation.
    pub fn evaluate_complexity(category: TaskCategory, title: &str, description: &str) -> TaskComplexity {
        let combined = format!("{} {}", title.to_lowercase(), description.to_lowercase());
        let word_count = combined.split_whitespace().count();

        match category {
            TaskCategory::AnkiAlgorithm | TaskCategory::SqlitePersistence | TaskCategory::RustBackend => {
                if word_count > 25
                    || combined.contains("transaction")
                    || combined.contains("concurrency")
                    || combined.contains("fsrs")
                    || combined.contains("migration")
                {
                    TaskComplexity::High
                } else {
                    TaskComplexity::Medium
                }
            }
            TaskCategory::UiRendering | TaskCategory::MarkdownRendering => {
                if word_count > 35 {
                    TaskComplexity::Medium
                } else {
                    TaskComplexity::Low
                }
            }
            TaskCategory::General => {
                if word_count > 30 {
                    TaskComplexity::High
                } else if word_count > 12 {
                    TaskComplexity::Medium
                } else {
                    TaskComplexity::Low
                }
            }
        }
    }

    /// Selects the target model pipeline based on static category and complexity evaluation.
    pub fn select_pipeline(category: TaskCategory, complexity: TaskComplexity) -> ModelPipeline {
        match category {
            // Route UI/Markdown rendering tasks to the lightweight model pipeline
            TaskCategory::UiRendering | TaskCategory::MarkdownRendering => ModelPipeline::Lightweight,
            // Route Rust backend, SQLite persistence, and Anki algorithm logic to the reasoning model pipeline
            TaskCategory::RustBackend
            | TaskCategory::SqlitePersistence
            | TaskCategory::AnkiAlgorithm => ModelPipeline::Reasoning,
            TaskCategory::General => match complexity {
                TaskComplexity::High => ModelPipeline::Reasoning,
                TaskComplexity::Low | TaskComplexity::Medium => ModelPipeline::Lightweight,
            },
        }
    }

    /// Evaluates and routes a single `AgentTask`.
    pub fn route_task(&self, task: &AgentTask) -> RoutingDecision {
        let category = Self::categorize_task(&task.title, &task.description);
        let complexity = Self::evaluate_complexity(category, &task.title, &task.description);
        let pipeline = Self::select_pipeline(category, complexity);

        let category_label = match category {
            TaskCategory::UiRendering => "UI Rendering",
            TaskCategory::MarkdownRendering => "Markdown Rendering",
            TaskCategory::RustBackend => "Rust Backend",
            TaskCategory::SqlitePersistence => "SQLite Persistence",
            TaskCategory::AnkiAlgorithm => "Anki Algorithm",
            TaskCategory::General => "General Task",
        };
        let complexity_label = match complexity {
            TaskComplexity::Low => "Low",
            TaskComplexity::Medium => "Medium",
            TaskComplexity::High => "High",
        };

        let rationale = match pipeline {
            ModelPipeline::Lightweight => format!(
                "Statically classified as {} ({} complexity); routed to Lightweight model pipeline for fast UI/Markdown rendering.",
                category_label, complexity_label
            ),
            ModelPipeline::Reasoning => format!(
                "Statically classified as {} ({} complexity); routed to Reasoning model pipeline for backend, SQLite persistence, or Anki scheduling logic.",
                category_label, complexity_label
            ),
        };

        RoutingDecision {
            task_id: task.id.clone(),
            title: task.title.clone(),
            category,
            complexity,
            pipeline,
            rationale,
        }
    }

    /// Evaluates and routes a batch of tasks for the background task runner.
    pub fn route_batch(&self, tasks: &[AgentTask]) -> Vec<RoutingDecision> {
        tasks.iter().map(|t| self.route_task(t)).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn routes_ui_and_markdown_to_lightweight() {
        let router = TaskRouter::new();
        let ui_task = AgentTask {
            id: "1".into(),
            title: "Build Notion sidebar layout".into(),
            description: "Render React sidebar component and CSS styles".into(),
        };
        let md_task = AgentTask {
            id: "2".into(),
            title: "Markdown WYSIWYG preview".into(),
            description: "Render markdown headings and code blocks".into(),
        };

        let d1 = router.route_task(&ui_task);
        let d2 = router.route_task(&md_task);

        assert_eq!(d1.pipeline, ModelPipeline::Lightweight);
        assert_eq!(d2.pipeline, ModelPipeline::Lightweight);
    }

    #[test]
    fn routes_rust_sqlite_anki_to_reasoning() {
        let router = TaskRouter::new();
        let sqlite_task = AgentTask {
            id: "3".into(),
            title: "Initialize rusqlite tables".into(),
            description: "Create notes and flashcards SQLite schema".into(),
        };
        let anki_task = AgentTask {
            id: "4".into(),
            title: "Calculate SM-2 next review".into(),
            description: "Update Anki interval and ease factor".into(),
        };
        let rust_task = AgentTask {
            id: "5".into(),
            title: "Tauri command handler".into(),
            description: "Implement Rust backend state management".into(),
        };

        assert_eq!(router.route_task(&sqlite_task).pipeline, ModelPipeline::Reasoning);
        assert_eq!(router.route_task(&anki_task).pipeline, ModelPipeline::Reasoning);
        assert_eq!(router.route_task(&rust_task).pipeline, ModelPipeline::Reasoning);
    }
}
