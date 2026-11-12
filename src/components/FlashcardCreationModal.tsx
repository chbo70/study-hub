import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  CheckCheck,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Code,
  Eye,
  FileText,
  FolderPlus,
  Layers,
  Palette,
  Plus,
  Sparkles,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import type { CreateFlashcardInput, UpdateFlashcardInput } from "../api";
import type {
  CardType,
  Deck,
  Flashcard,
  GeneratedCardDraft,
  Note,
} from "../types";
import { MarkdownPreview } from "./MarkdownPreview";

export interface FlashcardCreationModalProps {
  isOpen: boolean;
  decks: Deck[];
  notes: Note[];
  defaultDeckId?: number | null;
  editingCard?: Flashcard | null;
  initialDrafts?: GeneratedCardDraft[];
  onClearDrafts?: () => void;
  onClose: () => void;
  onCreateCard: (input: CreateFlashcardInput) => Promise<void>;
  onUpdateCard?: (input: UpdateFlashcardInput) => Promise<void>;
  onCreateDeck: (name: string, description: string) => Promise<Deck>;
}

const CARD_TYPE_OPTIONS: Array<{
  value: CardType;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    value: "default",
    label: "Default",
    description: "Classic Front & Back recall",
    icon: <FileText className="h-3.5 w-3.5" />,
  },
  {
    value: "single_choice",
    label: "Single Choice",
    description: "Pick one option before reveal",
    icon: <CircleDot className="h-3.5 w-3.5" />,
  },
  {
    value: "multiple_choice",
    label: "Multiple Choice",
    description: "Select multiple valid options",
    icon: <CheckSquare className="h-3.5 w-3.5" />,
  },
];

export const FlashcardCreationModal: React.FC<FlashcardCreationModalProps> = ({
  isOpen,
  decks,
  notes,
  defaultDeckId,
  editingCard = null,
  initialDrafts = [],
  onClearDrafts,
  onClose,
  onCreateCard,
  onUpdateCard,
  onCreateDeck,
}) => {
  const [selectedDeckId, setSelectedDeckId] = useState<number>(
    defaultDeckId ?? decks[0]?.id ?? 1
  );
  const [cardType, setCardType] = useState<CardType>("default");
  const [frontMarkdown, setFrontMarkdown] = useState("");
  const [backMarkdown, setBackMarkdown] = useState("");
  const [choiceOptions, setChoiceOptions] = useState<string[]>(["", ""]);
  const [newOptionDraft, setNewOptionDraft] = useState("");
  const [referenceTag, setReferenceTag] = useState("");

  // Phase 3 Review Pipeline Queue State
  const [reviewQueue, setReviewQueue] = useState<GeneratedCardDraft[]>([]);
  const [activeDraftIndex, setActiveDraftIndex] = useState<number>(0);

  // New deck inline creation state
  const [isCreatingDeck, setIsCreatingDeck] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");

  // Rapid entry feedback state (keeps modal open!)
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sessionCreatedCount, setSessionCreatedCount] = useState(0);
  const [lastCreatedToast, setLastCreatedToast] = useState<string | null>(null);

  const frontTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const loadDraftIntoForm = useCallback((draft: GeneratedCardDraft) => {
    setFrontMarkdown(draft.front);
    setBackMarkdown(draft.back);
    setCardType(draft.card_type);
    setChoiceOptions(
      draft.options && draft.options.length >= 2 ? draft.options : ["", ""]
    );
    setReferenceTag(draft.reference_tag ?? "");
  }, []);

  // Sync incoming `editingCard` or `initialDrafts` into the form when modal opens
  useEffect(() => {
    if (isOpen && editingCard) {
      setReviewQueue([]);
      setSelectedDeckId(editingCard.deck_id);
      setCardType(editingCard.card_type);
      setFrontMarkdown(editingCard.front);
      setBackMarkdown(editingCard.back);
      setChoiceOptions(
        editingCard.options && editingCard.options.length >= 2
          ? [...editingCard.options]
          : editingCard.options.length === 1
            ? [editingCard.options[0], ""]
            : ["", ""]
      );
      setReferenceTag(editingCard.reference_tag ?? "");
      setLastCreatedToast(null);
      return;
    }
    if (isOpen && initialDrafts.length > 0) {
      setReviewQueue(initialDrafts);
      setActiveDraftIndex(0);
      loadDraftIntoForm(initialDrafts[0]);
      setLastCreatedToast(
        `Loaded ${initialDrafts.length} generated ${
          initialDrafts.length === 1 ? "card" : "cards"
        } for review before database commit.`
      );
    }
  }, [editingCard, initialDrafts, isOpen, loadDraftIntoForm]);

  useEffect(() => {
    if (defaultDeckId) {
      setSelectedDeckId(defaultDeckId);
    } else if (decks[0]?.id && !selectedDeckId) {
      setSelectedDeckId(decks[0].id);
    }
  }, [decks, defaultDeckId, selectedDeckId]);

  // Keep current draft in `reviewQueue` updated as the user edits fields
  const syncCurrentEditsToQueue = useCallback(() => {
    if (reviewQueue.length === 0) return reviewQueue;
    const cleanedOpts =
      cardType === "default"
        ? []
        : choiceOptions.map((o) => o.trim()).filter(Boolean);
    return reviewQueue.map((item, idx) =>
      idx === activeDraftIndex
        ? {
            ...item,
            front: frontMarkdown,
            back: backMarkdown,
            card_type: cardType,
            options: cleanedOpts,
            reference_tag: referenceTag.trim() || null,
          }
        : item
    );
  }, [
    activeDraftIndex,
    backMarkdown,
    cardType,
    choiceOptions,
    frontMarkdown,
    referenceTag,
    reviewQueue,
  ]);

  const handleSelectDraftIndex = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= reviewQueue.length) return;
      const updatedQueue = syncCurrentEditsToQueue();
      setReviewQueue(updatedQueue);
      setActiveDraftIndex(nextIndex);
      loadDraftIntoForm(updatedQueue[nextIndex]);
    },
    [loadDraftIntoForm, reviewQueue.length, syncCurrentEditsToQueue]
  );

  const handleDiscardCurrentDraft = useCallback(() => {
    if (reviewQueue.length === 0) return;
    const remaining = reviewQueue.filter((_, idx) => idx !== activeDraftIndex);
    setReviewQueue(remaining);
    if (remaining.length === 0) {
      setFrontMarkdown("");
      setBackMarkdown("");
      setChoiceOptions(["", ""]);
      setReferenceTag("");
      onClearDrafts?.();
      setLastCreatedToast("All generated drafts processed.");
    } else {
      const nextIdx = Math.min(activeDraftIndex, remaining.length - 1);
      setActiveDraftIndex(nextIdx);
      loadDraftIntoForm(remaining[nextIdx]);
    }
  }, [activeDraftIndex, loadDraftIntoForm, onClearDrafts, reviewQueue]);

  // Extract all `NoteTitle#Header` smart tag suggestions from notes
  const smartTagSuggestions = useMemo(() => {
    const suggestions: string[] = [];
    for (const note of notes) {
      const noteTitle = (note.title || "Untitled Note").trim();
      suggestions.push(noteTitle);
      const lines = note.content.split("\n");
      for (const line of lines) {
        const m = /^#{1,3}\s+(.+)$/.exec(line.trim());
        if (m && m[1]) {
          const cleanHeader = m[1].replace(/[*`]/g, "").trim();
          suggestions.push(`${noteTitle}#${cleanHeader}`);
        }
      }
    }
    return suggestions;
  }, [notes]);

  const handleOptionChange = useCallback((idx: number, val: string) => {
    setChoiceOptions((prev) => prev.map((item, i) => (i === idx ? val : item)));
  }, []);

  const handleRemoveOption = useCallback((idx: number) => {
    setChoiceOptions((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleAddOption = useCallback(() => {
    if (newOptionDraft.trim()) {
      setChoiceOptions((prev) => [...prev, newOptionDraft.trim()]);
      setNewOptionDraft("");
    } else {
      setChoiceOptions((prev) => [...prev, ""]);
    }
  }, [newOptionDraft]);

  const handleCreateInlineDeck = useCallback(async () => {
    if (!newDeckName.trim()) return;
    try {
      const created = await onCreateDeck(
        newDeckName.trim(),
        "Created from Study Mode Flashcard Modal"
      );
      setSelectedDeckId(created.id);
      setNewDeckName("");
      setIsCreatingDeck(false);
    } catch (err) {
      console.error("Failed to create deck:", err);
    }
  }, [newDeckName, onCreateDeck]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!frontMarkdown.trim() || !backMarkdown.trim() || isSubmitting) return;

      const cleanedOptions =
        cardType === "default"
          ? []
          : [
              ...choiceOptions.map((o) => o.trim()).filter(Boolean),
              ...(newOptionDraft.trim() ? [newOptionDraft.trim()] : []),
            ];

      setIsSubmitting(true);
      try {
        if (editingCard && onUpdateCard) {
          await onUpdateCard({
            id: editingCard.id,
            deckId: selectedDeckId || editingCard.deck_id,
            front: frontMarkdown.trim(),
            back: backMarkdown.trim(),
            cardType,
            options: cleanedOptions,
            referenceTag: referenceTag.trim() || null,
          });
          onClose();
          return;
        }

        await onCreateCard({
          deckId: selectedDeckId || decks[0]?.id || 1,
          front: frontMarkdown.trim(),
          back: backMarkdown.trim(),
          cardType,
          options: cleanedOptions,
          referenceTag: referenceTag.trim() || null,
        });

        setSessionCreatedCount((c) => c + 1);

        // If reviewing generated cards in the Phase 3 Review Pipeline, advance to the next draft!
        if (reviewQueue.length > 0) {
          const remaining = reviewQueue.filter(
            (_, idx) => idx !== activeDraftIndex
          );
          setReviewQueue(remaining);
          if (remaining.length > 0) {
            const nextIdx = Math.min(activeDraftIndex, remaining.length - 1);
            setActiveDraftIndex(nextIdx);
            loadDraftIntoForm(remaining[nextIdx]);
            setLastCreatedToast(
              `Committed card to deck! ${remaining.length} generated ${
                remaining.length === 1 ? "draft" : "drafts"
              } remaining in review queue.`
            );
          } else {
            setFrontMarkdown("");
            setBackMarkdown("");
            setChoiceOptions(["", ""]);
            setNewOptionDraft("");
            setReferenceTag("");
            onClearDrafts?.();
            setLastCreatedToast(
              "All generated flashcards reviewed and committed to SQLite!"
            );
          }
        } else {
          // Standard rapid-entry mode: clear fields and keep modal open
          setFrontMarkdown("");
          setBackMarkdown("");
          setChoiceOptions(["", ""]);
          setNewOptionDraft("");
          setReferenceTag("");
          setLastCreatedToast("Card saved to deck! Ready for next card.");
        }

        requestAnimationFrame(() => {
          frontTextareaRef.current?.focus();
        });
      } catch (err) {
        console.error("Failed to create flashcard:", err);
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      activeDraftIndex,
      backMarkdown,
      cardType,
      choiceOptions,
      decks,
      editingCard,
      frontMarkdown,
      isSubmitting,
      loadDraftIntoForm,
      newOptionDraft,
      onClearDrafts,
      onClose,
      onCreateCard,
      onUpdateCard,
      referenceTag,
      reviewQueue,
      selectedDeckId,
    ]
  );

  const handleCommitAllDrafts = useCallback(async () => {
    if (reviewQueue.length === 0 || isSubmitting) return;
    const syncedQueue = syncCurrentEditsToQueue();
    setIsSubmitting(true);
    try {
      const targetDeck = selectedDeckId || decks[0]?.id || 1;
      let committed = 0;
      for (const draft of syncedQueue) {
        if (!draft.front.trim() || !draft.back.trim()) continue;
        await onCreateCard({
          deckId: targetDeck,
          front: draft.front.trim(),
          back: draft.back.trim(),
          cardType: draft.card_type,
          options: draft.options,
          referenceTag: draft.reference_tag,
        });
        committed++;
      }
      setSessionCreatedCount((c) => c + committed);
      setReviewQueue([]);
      setFrontMarkdown("");
      setBackMarkdown("");
      setChoiceOptions(["", ""]);
      setReferenceTag("");
      onClearDrafts?.();
      setLastCreatedToast(
        `Committed all ${committed} reviewed flashcards to SQLite!`
      );
    } catch (err) {
      console.error("Failed to commit all generated flashcards:", err);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    decks,
    isSubmitting,
    onClearDrafts,
    onCreateCard,
    reviewQueue.length,
    selectedDeckId,
    syncCurrentEditsToQueue,
  ]);

  if (!isOpen) return null;

  const activeDraft = reviewQueue[activeDraftIndex] ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-flashcard-modal-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl">
        {/* Modal Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-stone-200/80 bg-[#F7F7F5] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-900 text-white">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <h2
                id="create-flashcard-modal-title"
                className="text-base font-bold text-stone-900"
              >
                {editingCard
                  ? `Edit Flashcard #${editingCard.id}`
                  : reviewQueue.length > 0
                    ? "Review Generated Flashcards"
                    : "Rapid Flashcard Creator"}
              </h2>
              <p className="text-xs text-stone-500">
                {editingCard
                  ? "Modify deck assignment, card type, options, smart reference tag, and Markdown content"
                  : reviewQueue.length > 0
                    ? "Review, edit, and assign a target deck before committing generated cards to SQLite"
                    : "Full Markdown + color directives • Stays open after saving for continuous entry"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {sessionCreatedCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>
                  {sessionCreatedCount}{" "}
                  {sessionCreatedCount === 1 ? "card" : "cards"} added
                </span>
              </span>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-200/70 hover:text-stone-900 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Phase 3 Review Pipeline Queue Banner (shown when generated cards are loaded) */}
        {reviewQueue.length > 0 && (
          <div className="shrink-0 border-b border-amber-200/80 bg-amber-50/70 px-6 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-900 px-2.5 py-0.5 text-[11px] font-bold text-white">
                  <Bot className="h-3 w-3 text-amber-300" />
                  <span>
                    Review Queue: Card {activeDraftIndex + 1} of{" "}
                    {reviewQueue.length}
                  </span>
                </span>
                {activeDraft && (
                  <span className="rounded-md border border-amber-300/80 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-900">
                    Source:{" "}
                    {activeDraft.source_method === "gemini"
                      ? "Google Gemini Model"
                      : activeDraft.source_method === "ollama"
                        ? "Local Ollama LLM"
                        : "Markdown Syntax Parser"}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={activeDraftIndex === 0}
                  onClick={() => handleSelectDraftIndex(activeDraftIndex - 1)}
                  className="inline-flex items-center gap-0.5 rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="h-3 w-3" />
                  <span>Prev</span>
                </button>
                <button
                  type="button"
                  disabled={activeDraftIndex >= reviewQueue.length - 1}
                  onClick={() => handleSelectDraftIndex(activeDraftIndex + 1)}
                  className="inline-flex items-center gap-0.5 rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-40 cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={handleDiscardCurrentDraft}
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 cursor-pointer"
                  title="Discard this generated card draft"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>Skip Draft</span>
                </button>
                {reviewQueue.length > 1 && (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleCommitAllDrafts}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-40 cursor-pointer"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    <span>Commit All ({reviewQueue.length})</span>
                  </button>
                )}
              </div>
            </div>

            {/* Draft Selector Pills */}
            <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {reviewQueue.map((draft, idx) => {
                const isCurrent = idx === activeDraftIndex;
                const cleanPreview = draft.front
                  .replace(/:[a-z]+\[([^\]]+)\]/g, "$1")
                  .replace(/[*`#]/g, "")
                  .slice(0, 32);
                return (
                  <button
                    key={draft.id}
                    type="button"
                    onClick={() => handleSelectDraftIndex(idx)}
                    className={`shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                      isCurrent
                        ? "border-stone-900 bg-stone-900 text-white font-semibold"
                        : "border-amber-200 bg-white text-stone-700 hover:bg-amber-100/60"
                    }`}
                  >
                    #{idx + 1}: {cleanPreview || "Draft"}...
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Scrollable Modal Body */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-6 py-5 space-y-5"
        >
          {/* Row 1: Deck Selection + Smart Tag (reference_tag) */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Deck Picker */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-semibold text-stone-700">
                  Target Deck
                </label>
                <button
                  type="button"
                  onClick={() => setIsCreatingDeck((v) => !v)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:text-sky-900 cursor-pointer"
                >
                  <FolderPlus className="h-3 w-3" />
                  <span>{isCreatingDeck ? "Cancel" : "+ New Deck"}</span>
                </button>
              </div>

              {isCreatingDeck ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newDeckName}
                    onChange={(e) => setNewDeckName(e.target.value)}
                    placeholder="New deck name..."
                    className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-800 focus:border-stone-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCreateInlineDeck}
                    className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-semibold text-white hover:bg-stone-800 cursor-pointer"
                  >
                    Create
                  </button>
                </div>
              ) : (
                <select
                  aria-label="Target Deck"
                  value={selectedDeckId}
                  onChange={(e) => setSelectedDeckId(Number(e.target.value))}
                  className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-800 focus:border-stone-400 focus:outline-none"
                >
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Smart Tag Backlink Input (`reference_tag`) */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-stone-700">
                <Tag className="h-3.5 w-3.5 text-amber-600" />
                <span>Smart Reference Tag (Note Header Backlink)</span>
              </label>
              <input
                type="text"
                list="smart-tag-options"
                value={referenceTag}
                onChange={(e) => setReferenceTag(e.target.value)}
                placeholder="e.g. Spaced Repetition & Memory Systems#Core Concepts"
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none"
              />
              <datalist id="smart-tag-options">
                {smartTagSuggestions.map((tag) => (
                  <option key={tag} value={tag} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Row 2: Card Type Toggle (Default, Single Choice, Multiple Choice) */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-stone-700">
              Card Type
            </label>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {CARD_TYPE_OPTIONS.map((opt) => {
                const active = cardType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCardType(opt.value)}
                    className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all cursor-pointer ${
                      active
                        ? "border-stone-900 bg-stone-900 text-white shadow-2xs"
                        : "border-stone-200 bg-[#FBFBFA] text-stone-700 hover:border-stone-300 hover:bg-stone-100/70"
                    }`}
                  >
                    <div
                      className={`mt-0.5 rounded-lg p-1.5 ${
                        active
                          ? "bg-white/15 text-white"
                          : "bg-stone-200/80 text-stone-700"
                      }`}
                    >
                      {opt.icon}
                    </div>
                    <div>
                      <div className="text-xs font-bold">{opt.label}</div>
                      <div
                        className={`text-[11px] ${
                          active ? "text-stone-300" : "text-stone-500"
                        }`}
                      >
                        {opt.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 3: Choice Options Builder (for Single Choice & Multiple Choice) */}
          {(cardType === "single_choice" || cardType === "multiple_choice") && (
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-950">
                  {cardType === "single_choice"
                    ? "Single Choice Options"
                    : "Multiple Choice Options"}
                </span>
                <button
                  type="button"
                  onClick={handleAddOption}
                  className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer"
                >
                  <Plus className="h-3 w-3" />
                  <span>Add Option</span>
                </button>
              </div>

              <div className="space-y-2">
                {choiceOptions.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-[11px] font-bold text-stone-600 border border-stone-200">
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => handleOptionChange(idx, e.target.value)}
                      placeholder={`Option ${String.fromCharCode(65 + idx)}...`}
                      className="flex-1 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-800 focus:border-stone-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setBackMarkdown((prev) =>
                          prev ? `${prev}\n- ${opt}` : opt
                        )
                      }
                      className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                      title="Copy option to Back answer"
                    >
                      Use as Answer
                    </button>
                    {choiceOptions.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(idx)}
                        className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                        title="Remove option"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Row 4: Full Markdown Editor + Live Preview for FRONT */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-stone-800">
                Front (Question / Prompt Markdown)
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setFrontMarkdown((p) => `${p}${p ? " " : ""}**bold**`)
                  }
                  className="rounded border border-stone-200 bg-[#FBFBFA] px-2 py-0.5 text-[10px] font-semibold text-stone-600 hover:bg-stone-100 cursor-pointer"
                >
                  **Bold**
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setFrontMarkdown((p) => `${p}${p ? " " : ""}\`code\``)
                  }
                  className="inline-flex items-center gap-1 rounded border border-stone-200 bg-[#FBFBFA] px-2 py-0.5 text-[10px] font-semibold text-stone-600 hover:bg-stone-100 cursor-pointer"
                >
                  <Code className="h-2.5 w-2.5" />
                  <span>Code</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setFrontMarkdown(
                      (p) => `${p}${p ? " " : ""}:emerald[key term]`
                    )
                  }
                  className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                >
                  <Palette className="h-2.5 w-2.5" />
                  <span>:emerald[...]</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 rounded-xl border border-stone-200 bg-[#FBFBFA] p-3">
              <textarea
                ref={frontTextareaRef}
                value={frontMarkdown}
                onChange={(e) => setFrontMarkdown(e.target.value)}
                rows={4}
                placeholder="Write Front prompt in Markdown (e.g. What is :emerald[Active Recall]?)..."
                className="w-full resize-none rounded-lg border border-stone-200 bg-[#1E1E1E] p-3 font-mono text-xs leading-relaxed text-stone-100 placeholder:text-stone-500 focus:outline-none"
              />
              <div className="rounded-lg border border-stone-200/80 bg-white p-3 overflow-y-auto max-h-32">
                <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                  <Eye className="h-2.5 w-2.5" />
                  <span>Front Preview</span>
                </div>
                <MarkdownPreview markdown={frontMarkdown} compact />
              </div>
            </div>
          </div>

          {/* Row 5: Full Markdown Editor + Live Preview for BACK */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-stone-800">
                Back (Answer / Explanation Markdown)
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setBackMarkdown((p) => `${p}${p ? " " : ""}**bold**`)
                  }
                  className="rounded border border-stone-200 bg-[#FBFBFA] px-2 py-0.5 text-[10px] font-semibold text-stone-600 hover:bg-stone-100 cursor-pointer"
                >
                  **Bold**
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setBackMarkdown(
                      (p) => `${p}${p ? " " : ""}:amber[important]`
                    )
                  }
                  className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 hover:bg-amber-100 cursor-pointer"
                >
                  <Palette className="h-2.5 w-2.5" />
                  <span>:amber[...]</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 rounded-xl border border-stone-200 bg-[#FBFBFA] p-3">
              <textarea
                value={backMarkdown}
                onChange={(e) => setBackMarkdown(e.target.value)}
                rows={4}
                placeholder="Write Back answer & explanation in Markdown..."
                className="w-full resize-none rounded-lg border border-stone-200 bg-[#1E1E1E] p-3 font-mono text-xs leading-relaxed text-stone-100 placeholder:text-stone-500 focus:outline-none"
              />
              <div className="rounded-lg border border-stone-200/80 bg-white p-3 overflow-y-auto max-h-32">
                <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                  <Eye className="h-2.5 w-2.5" />
                  <span>Back Preview</span>
                </div>
                <MarkdownPreview markdown={backMarkdown} compact />
              </div>
            </div>
          </div>

          {/* Modal Footer Actions */}
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200/80 pt-4">
            <div className="flex items-center gap-2 text-xs text-stone-500">
              {lastCreatedToast ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{lastCreatedToast}</span>
                </span>
              ) : (
                <span>
                  Modal stays open after clicking{" "}
                  <strong className="text-stone-700">Add Card</strong> for rapid
                  batch creation.
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
              >
                Done
              </button>

              <button
                type="submit"
                disabled={
                  !frontMarkdown.trim() || !backMarkdown.trim() || isSubmitting
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-5 py-2 text-xs font-semibold text-white hover:bg-stone-800 disabled:opacity-40 transition-colors cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>
                  {isSubmitting
                    ? "Saving..."
                    : editingCard
                      ? "Save Flashcard Changes"
                      : reviewQueue.length > 0
                        ? `Approve & Save Card (${activeDraftIndex + 1}/${reviewQueue.length})`
                        : "Add Card"}
                </span>
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
};

export default FlashcardCreationModal;
