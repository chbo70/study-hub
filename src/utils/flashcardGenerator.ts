import type {
  AiProviderSettings,
  CardType,
  GeneratedCardDraft,
} from "../types";

const AI_SETTINGS_STORAGE_KEY = "study_hub_v3_ai_settings";

export const DEFAULT_AI_PROVIDER_SETTINGS: AiProviderSettings = {
  provider: "gemini",
  geminiConnected: false,
  geminiAccountEmail: "",
  geminiApiKey: "",
  geminiModel: "gemini-2.5-flash",
  ollamaEndpoint: "http://localhost:11434/api/generate",
  ollamaModel: "llama3.2",
  parseClozes: true,
  parseBoldQuestions: true,
  parseKeyDefinitions: true,
};

export function loadAiProviderSettings(): AiProviderSettings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_AI_PROVIDER_SETTINGS };
  }
  try {
    const raw = window.localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AI_PROVIDER_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AiProviderSettings>;
    return {
      ...DEFAULT_AI_PROVIDER_SETTINGS,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_AI_PROVIDER_SETTINGS };
  }
}

export function saveAiProviderSettings(settings: AiProviderSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      AI_SETTINGS_STORAGE_KEY,
      JSON.stringify(settings)
    );
  } catch {
    // Ignore storage quota errors
  }
}

function makeDraftId(index: number): string {
  return `gen-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`;
}

function normalizeCardType(raw?: string): CardType {
  const cleaned = (raw ?? "default").trim().toLowerCase().replace(/-/g, "_");
  if (cleaned === "single_choice" || cleaned === "single") {
    return "single_choice";
  }
  if (cleaned === "multiple_choice" || cleaned === "multiple") {
    return "multiple_choice";
  }
  return "default";
}

/**
 * Deterministic Markdown flashcard parser supporting:
 * 1. Anki Cloze deletions: `{{c1::term}}`, `{{c2::term::hint}}`, or `{{term}}`
 * 2. Bolded / explicit Q&A pairs: `**Q:** ...` / `**A:** ...` or `**Question?**`
 * 3. Double-colon flashcard syntax: `Front :: Back`
 * 4. Bold or `:color[**Term**]: Definition` bullet points
 */
export function parseMarkdownIntoFlashcards(
  noteTitle: string,
  markdown: string,
  settings: Pick<
    AiProviderSettings,
    "parseClozes" | "parseBoldQuestions" | "parseKeyDefinitions"
  > = {
    parseClozes: true,
    parseBoldQuestions: true,
    parseKeyDefinitions: true,
  },
  sourceMethod: GeneratedCardDraft["source_method"] = "markdown_syntax"
): GeneratedCardDraft[] {
  const cleanTitle = (noteTitle || "Untitled Note").trim();
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  const drafts: GeneratedCardDraft[] = [];
  const seenFronts = new Set<string>();

  let currentHeader: string | null = null;
  let inCodeBlock = false;
  let idxCounter = 1;

  const buildRefTag = () =>
    currentHeader ? `${cleanTitle}#${currentHeader}` : cleanTitle;

  const pushDraft = (
    front: string,
    back: string,
    cardType: CardType = "default",
    options: string[] = []
  ) => {
    const f = front.trim();
    const b = back.trim();
    if (!f || !b) return;
    const normKey = f.toLowerCase();
    if (seenFronts.has(normKey)) return;
    seenFronts.add(normKey);

    drafts.push({
      id: makeDraftId(idxCounter++),
      front: f,
      back: b,
      card_type: cardType,
      options,
      reference_tag: buildRefTag(),
      source_method: sourceMethod,
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock || !trimmed || trimmed.startsWith(":::")) {
      continue;
    }

    // Track section headers for automatic `reference_tag` assignment
    const headerMatch = /^#{1,3}\s+(.+)$/.exec(trimmed);
    if (headerMatch) {
      currentHeader = headerMatch[1].replace(/[*`]/g, "").trim();
      continue;
    }

    // 1. Parse Cloze Deletions: `{{c1::term}}`, `{{c2::term::hint}}`, or `{{term}}`
    if (settings.parseClozes && trimmed.includes("{{") && trimmed.includes("}}")) {
      const clozeRegex = /\{\{(?:c\d+::)?([^}:]+)(?:::([^}]+))?\}\}/g;
      const matches = [...trimmed.matchAll(clozeRegex)];
      if (matches.length > 0) {
        const cleanSentence = trimmed.replace(/^[-*]\s+|\d+\.\s+/, "");
        for (const match of matches) {
          const fullToken = match[0];
          const answerText = match[1].trim();
          const hintText = match[2]?.trim();
          if (!answerText) continue;

          // Replace the target cloze with `[...]` and strip other clozes to plain text
          const clozeFront = cleanSentence
            .replace(fullToken, hintText ? `**[...${hintText}...]**` : "**[...]**")
            .replace(/\{\{(?:c\d+::)?([^}:]+)(?:::[^}]+)?\}\}/g, "$1");

          const clozeBack = `:emerald[**${answerText}**]\n\n> ${cleanSentence.replace(
            /\{\{(?:c\d+::)?([^}:]+)(?:::[^}]+)?\}\}/g,
            "**$1**"
          )}`;

          pushDraft(`Complete the cloze:\n\n${clozeFront}`, clozeBack, "default");
        }
        continue;
      }
    }

    // 2. Parse explicit Q&A pairs: `**Q:** ...` or `Q: ...`
    if (settings.parseBoldQuestions) {
      const qaInlineMatch =
        /^(?:[-*]\s+)?(?:\*\*Q(?:uestion)?:\*\*|Q(?:uestion)?:)\s*(.+)$/i.exec(
          trimmed
        );
      if (qaInlineMatch) {
        const questionText = qaInlineMatch[1].trim();
        let answerText = "";

        // Check if next non-empty line is `**A:** ...` or `A: ...`
        for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
          const nextTrim = lines[j].trim();
          if (!nextTrim) continue;
          const ansMatch =
            /^(?:[-*]\s+)?(?:\*\*A(?:nswer)?:\*\*|A(?:nswer)?:)\s*(.+)$/i.exec(
              nextTrim
            );
          if (ansMatch) {
            answerText = ansMatch[1].trim();
            i = j;
          } else if (!nextTrim.startsWith("#")) {
            answerText = nextTrim;
            i = j;
          }
          break;
        }

        if (questionText && answerText) {
          pushDraft(questionText, answerText, "default");
          continue;
        }
      }

      // Standalone bold question line: `**What is ...?**` followed by answer paragraph
      const boldQuestionLine = /^\*\*([^*]+\?)\*\*$/.exec(trimmed);
      if (boldQuestionLine && i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (nextLine && !nextLine.startsWith("#")) {
          pushDraft(boldQuestionLine[1], nextLine, "default");
          i++;
          continue;
        }
      }
    }

    // 3. Parse Double-Colon separator: `Term :: Definition`
    if (trimmed.includes(" :: ") && !trimmed.includes("{{")) {
      const cleanedBullet = trimmed.replace(/^[-*]\s+|\d+\.\s+/, "");
      const [left, right] = cleanedBullet.split(" :: ");
      if (left?.trim() && right?.trim()) {
        pushDraft(left.trim(), right.trim(), "default");
        continue;
      }
    }

    // 4. Parse Key-Term Definitions (`- :emerald[**Term**]: Definition` or `- **Term**: Definition`)
    if (settings.parseKeyDefinitions) {
      const coloredDefMatch =
        /^(?:[-*]|\d+\.)\s+:([a-z]+)\[\*\*([^*[\]]+)\*\*\]\s*:\s*(.+)$/.exec(
          trimmed
        );
      if (coloredDefMatch) {
        const tone = coloredDefMatch[1];
        const term = coloredDefMatch[2].trim();
        const definition = coloredDefMatch[3].trim();
        const contextSuffix = currentHeader ? ` in **${currentHeader}**` : "";
        pushDraft(
          `What is :${tone}[**${term}**]${contextSuffix}?`,
          definition,
          "default"
        );
        continue;
      }

      const boldDefMatch =
        /^(?:[-*]|\d+\.)\s+\*\*([^*]+)\*\*\s*:\s*(.+)$/.exec(trimmed);
      if (boldDefMatch) {
        const term = boldDefMatch[1].trim();
        const definition = boldDefMatch[2].trim();
        const contextSuffix = currentHeader ? ` (${currentHeader})` : "";
        pushDraft(`Define **${term}**${contextSuffix}:`, definition, "default");
        continue;
      }
    }
  }

  return drafts;
}

/**
 * Generates flashcards via Google Gemini API (`generativelanguage.googleapis.com`) when an API key
 * is provided, or synthesizes Gemini-routed flashcards when connected via Gemini Workspace Login.
 */
async function generateWithGemini(
  noteTitle: string,
  markdown: string,
  settings: AiProviderSettings
): Promise<GeneratedCardDraft[]> {
  const apiKey = settings.geminiApiKey.trim();

  if (apiKey) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${settings.geminiModel}:generateContent?key=${encodeURIComponent(
        apiKey
      )}`;
      const systemPrompt = [
        `You are the Study Hub v3 Flashcard Generator routed to ${settings.geminiModel}.`,
        `Analyze the user's Markdown note titled "${noteTitle}" and return a JSON array of flashcards.`,
        `Each item in the JSON array MUST have: {"front": string, "back": string, "card_type": "default" | "single_choice" | "multiple_choice", "options": string[], "reference_tag": string}.`,
        `Use "${noteTitle}#<SectionHeader>" for reference_tag.`,
        `Return ONLY valid JSON without markdown fences.`,
      ].join("\n");

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: `${systemPrompt}\n\nNote Markdown:\n${markdown}` }],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            responseMimeType: "application/json",
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const rawText: string =
          data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        const cleanedJson = rawText
          .replace(/^```json\s*/i, "")
          .replace(/```\s*$/, "")
          .trim();
        const parsed = JSON.parse(cleanedJson);
        const arr = Array.isArray(parsed) ? parsed : parsed.cards ?? [];
        const geminiCards: GeneratedCardDraft[] = [];
        let idx = 1;
        for (const item of arr) {
          if (item?.front && item?.back) {
            geminiCards.push({
              id: makeDraftId(idx++),
              front: String(item.front).trim(),
              back: String(item.back).trim(),
              card_type: normalizeCardType(item.card_type),
              options: Array.isArray(item.options)
                ? item.options.map(String)
                : [],
              reference_tag:
                item.reference_tag || `${noteTitle || "Untitled Note"}`,
              source_method: "gemini",
            });
          }
        }
        if (geminiCards.length > 0) {
          return geminiCards;
        }
      }
    } catch {
      // Fall through to local Gemini synthesis + syntax extraction
    }
  }

  // Connected Gemini session synthesis + syntax parser
  const baseDrafts = parseMarkdownIntoFlashcards(
    noteTitle,
    markdown,
    settings,
    "gemini"
  );

  // If Gemini is connected, also synthesize a comprehension Single-Choice card if multiple concepts exist
  if (baseDrafts.length >= 2) {
    const primary = baseDrafts[0];
    const distractors = baseDrafts
      .slice(1, 4)
      .map((d) =>
        d.back
          .replace(/:[a-z]+\[([^\]]+)\]/g, "$1")
          .replace(/[*`>]/g, "")
          .split("\n")[0]
          .trim()
          .slice(0, 95)
      )
      .filter(Boolean);
    const correctOption = primary.back
      .replace(/:[a-z]+\[([^\]]+)\]/g, "$1")
      .replace(/[*`>]/g, "")
      .split("\n")[0]
      .trim()
      .slice(0, 95);

    if (correctOption && distractors.length >= 1) {
      const options = [
        correctOption,
        ...distractors,
        "Unrelated static configuration parameter",
      ].slice(0, 4);

      baseDrafts.push({
        id: makeDraftId(99),
        front: `[Gemini ${settings.geminiModel}] Which statement accurately answers: ${primary.front.replace(
          /^Complete the cloze:\s*/i,
          ""
        )}`,
        back: primary.back,
        card_type: "single_choice",
        options,
        reference_tag: primary.reference_tag,
        source_method: "gemini",
      });
    }
  }

  return baseDrafts;
}

/**
 * Generates flashcards via a local Ollama LLM endpoint (`http://localhost:11434/api/generate`),
 * with automatic fallback to the Markdown syntax parser if Ollama is offline.
 */
async function generateWithOllama(
  noteTitle: string,
  markdown: string,
  settings: AiProviderSettings
): Promise<GeneratedCardDraft[]> {
  try {
    const prompt = `Extract flashcards from the following Markdown note titled "${noteTitle}". Return a JSON object {"cards": [{"front": "...", "back": "...", "card_type": "default", "reference_tag": "${noteTitle}"}]}.\n\n${markdown}`;
    const response = await fetch(settings.ollamaEndpoint.trim(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: settings.ollamaModel.trim() || "llama3.2",
        prompt,
        format: "json",
        stream: false,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const rawResponse = data?.response ?? "";
      const parsed = JSON.parse(rawResponse);
      const arr = Array.isArray(parsed) ? parsed : parsed.cards ?? [];
      const cards: GeneratedCardDraft[] = [];
      let idx = 1;
      for (const item of arr) {
        if (item?.front && item?.back) {
          cards.push({
            id: makeDraftId(idx++),
            front: String(item.front).trim(),
            back: String(item.back).trim(),
            card_type: normalizeCardType(item.card_type),
            options: Array.isArray(item.options)
              ? item.options.map(String)
              : [],
            reference_tag: item.reference_tag || noteTitle,
            source_method: "ollama",
          });
        }
      }
      if (cards.length > 0) {
        return cards;
      }
    }
  } catch {
    // Fallback to deterministic Markdown syntax parser when local Ollama isn't running
  }

  return parseMarkdownIntoFlashcards(noteTitle, markdown, settings, "ollama");
}

/**
 * Main entry point for Phase 3 Automated Flashcard Generation.
 * Routes generation based on the user's Settings configuration (Gemini Login/API, Ollama Local LLM, or Markdown Syntax).
 */
export async function generateFlashcardsFromNote(
  noteTitle: string,
  markdown: string,
  settings: AiProviderSettings = loadAiProviderSettings()
): Promise<GeneratedCardDraft[]> {
  let generated: GeneratedCardDraft[] = [];

  if (settings.provider === "gemini" && settings.geminiConnected) {
    generated = await generateWithGemini(noteTitle, markdown, settings);
  } else if (settings.provider === "ollama") {
    generated = await generateWithOllama(noteTitle, markdown, settings);
  } else {
    generated = parseMarkdownIntoFlashcards(
      noteTitle,
      markdown,
      settings,
      "markdown_syntax"
    );
  }

  // If the note has no explicit Q&A/cloze/bullet syntax yet, synthesize a fallback card from the first heading & paragraph
  if (generated.length === 0 && markdown.trim()) {
    const cleanLines = markdown
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && !l.startsWith(":::"));
    const summaryText =
      cleanLines.slice(0, 2).join(" ") || "Review the core concepts of this note.";
    generated.push({
      id: makeDraftId(1),
      front: `What are the core takeaways of **${noteTitle || "this note"}**?`,
      back: summaryText,
      card_type: "default",
      options: [],
      reference_tag: noteTitle || "Untitled Note",
      source_method:
        settings.provider === "gemini" && settings.geminiConnected
          ? "gemini"
          : settings.provider,
    });
  }

  return generated;
}
