import { ModelPipeline, TaskCategory, TaskComplexity } from "../types";

const CATEGORY_LABELS: Record<TaskCategory, string> = {
  ui_rendering: "UI Rendering",
  markdown_rendering: "Markdown Rendering",
  rust_backend: "Rust Backend",
  sqlite_persistence: "SQLite Persistence",
  anki_algorithm: "Anki Algorithm",
  general: "General Task",
};

const COMPLEXITY_LABELS: Record<TaskComplexity, string> = {
  low: "Low Complexity",
  medium: "Medium Complexity",
  high: "High Complexity",
};

const PIPELINE_LABELS: Record<ModelPipeline, string> = {
  lightweight: "Lightweight Pipeline",
  reasoning: "Reasoning Pipeline",
};

const SPECIAL_ACRONYMS: Record<string, string> = {
  ui: "UI",
  ux: "UX",
  sqlite: "SQLite",
  sql: "SQL",
  api: "API",
  id: "ID",
  sm2: "SM-2",
  fsrs: "FSRS",
  html: "HTML",
  css: "CSS",
  ipc: "IPC",
  crud: "CRUD",
  wysiwyg: "WYSIWYG",
};

/**
 * Converts raw variable or enum names containing underscores or camelCase
 * into properly capitalized, human-readable labels.
 */
export function formatHumanLabel(raw: string): string {
  if (!raw) return "";
  const normalized = raw.trim();

  if (normalized in CATEGORY_LABELS) {
    return CATEGORY_LABELS[normalized as TaskCategory];
  }
  if (normalized in COMPLEXITY_LABELS) {
    return COMPLEXITY_LABELS[normalized as TaskComplexity];
  }
  if (normalized in PIPELINE_LABELS) {
    return PIPELINE_LABELS[normalized as ModelPipeline];
  }

  return normalized
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower in SPECIAL_ACRONYMS) {
        return SPECIAL_ACRONYMS[lower];
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export function formatCategoryLabel(category: TaskCategory | string): string {
  if (category in CATEGORY_LABELS) {
    return CATEGORY_LABELS[category as TaskCategory];
  }
  return formatHumanLabel(category);
}

export function formatComplexityLabel(
  complexity: TaskComplexity | string
): string {
  if (complexity in COMPLEXITY_LABELS) {
    return COMPLEXITY_LABELS[complexity as TaskComplexity];
  }
  return `${formatHumanLabel(complexity)} Complexity`;
}

export function formatPipelineLabel(pipeline: ModelPipeline | string): string {
  if (pipeline in PIPELINE_LABELS) {
    return PIPELINE_LABELS[pipeline as ModelPipeline];
  }
  return `${formatHumanLabel(pipeline)} Pipeline`;
}

/**
 * Cleans up any raw snake_case identifiers inside descriptions or rationales
 * so UI text never displays raw variable names with underscores.
 */
export function sanitizeUiText(text: string): string {
  if (!text) return "";
  return text
    .replace(/\bui_rendering\b/gi, "UI Rendering")
    .replace(/\bmarkdown_rendering\b/gi, "Markdown Rendering")
    .replace(/\brust_backend\b/gi, "Rust Backend")
    .replace(/\bsqlite_persistence\b/gi, "SQLite Persistence")
    .replace(/\banki_algorithm\b/gi, "Anki Algorithm")
    .replace(/\bnext_review\b/gi, "Next Review")
    .replace(/\bnote_id\b/gi, "Note ID")
    .replace(/\btask_id\b/gi, "Task ID")
    .replace(/\bcreated_at\b/gi, "Created At")
    .replace(/\bupdated_at\b/gi, "Updated At")
    .replace(/\b([a-z]+)_([a-z]+)(?:_([a-z]+))?\b/g, (match) =>
      formatHumanLabel(match)
    );
}

/**
 * Parses an ISO-8601 timestamp or YYYY-MM-DD date string safely.
 */
function parseDateSafe(input: string | Date | null | undefined): Date | null {
  if (!input) return null;
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : input;
  }
  const trimmed = input.trim();
  // Handle YYYY-MM-DD date-only strings in local time to avoid UTC off-by-one shifts
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const parsed = new Date(trimmed);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Formats a date as a short calendar label like "Nov 12" or "Nov 12, 2025".
 */
export function formatShortDate(
  input: string | Date | null | undefined,
  now: Date = new Date()
): string {
  const date = parseDateSafe(input);
  if (!date) return "Unknown date";

  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/**
 * Formats raw timestamps into human-readable relative dates like
 * "Just now", "15m ago", "3 hours ago", "Yesterday", "2 days ago", or "Nov 12".
 */
export function formatRelativeTimestamp(
  input: string | Date | null | undefined,
  now: Date = new Date()
): string {
  const date = parseDateSafe(input);
  if (!date) return "Recently";

  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHours = Math.round(diffMin / 60);
  const diffDays = Math.round(diffHours / 24);

  if (diffSec < 45 && diffSec >= -45) {
    return "Just now";
  }
  if (diffSec > 0) {
    if (diffMin < 60) {
      return `${diffMin}m ago`;
    }
    if (diffHours < 24) {
      return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
    }
    if (diffDays === 1) {
      return "Yesterday";
    }
    if (diffDays < 7) {
      return `${diffDays} days ago`;
    }
  } else {
    const futureDays = Math.abs(diffDays);
    if (futureDays === 0) return "Today";
    if (futureDays === 1) return "Tomorrow";
    if (futureDays < 7) return `In ${futureDays} days`;
  }

  return formatShortDate(date, now);
}

/**
 * Formats a flashcard scheduled review date (`YYYY-MM-DD` or ISO timestamp)
 * into a human-readable relative or calendar date ("Due today", "Tomorrow",
 * "2 days ago", "In 4 days", or "Nov 12").
 */
export function formatReviewDate(
  input: string | Date | null | undefined,
  now: Date = new Date()
): string {
  const date = parseDateSafe(input);
  if (!date) return "Today";

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const startOfTarget = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  const diffDays = Math.round(
    (startOfTarget.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays < -1 && diffDays >= -14) {
    return `${Math.abs(diffDays)} days ago`;
  }
  if (diffDays > 1 && diffDays <= 14) {
    return `In ${diffDays} days (${formatShortDate(date, now)})`;
  }

  return formatShortDate(date, now);
}

/**
 * Formats an Anki interval in days into a clean human-readable string.
 */
export function formatInterval(days: number): string {
  if (!days || days <= 0) return "New card";
  if (days === 1) return "1 day";
  if (days < 30) return `${days} days`;
  const months = Math.round((days / 30) * 10) / 10;
  return months === 1 ? "1 month" : `${months} months`;
}

export function formatCardTypeLabel(cardType: string): string {
  switch (cardType) {
    case "single_choice":
      return "Single Choice";
    case "multiple_choice":
      return "Multiple Choice";
    case "default":
    default:
      return "Default (Q&A)";
  }
}

/**
 * Formats an Anki ease factor multiplier into a readable percentage/multiplier.
 */
export function formatEaseFactor(ease: number): string {
  const pct = Math.round(ease * 100);
  return `${pct}% (${ease.toFixed(2)}×)`;
}
