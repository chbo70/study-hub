import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Brain,
  Calendar,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  CircleDot,
  Clock,
  Code,
  Eye,
  FileText,
  FolderKanban,
  FolderOpen,
  FolderPlus,
  Gauge,
  Layers,
  Palette,
  Pencil,
  Play,
  Plus,
  Repeat,
  Search,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { CreateFlashcardInput, UpdateFlashcardInput } from "../api";
import type { CardType, Deck, Flashcard, Note } from "../types";
import {
  formatCardTypeLabel,
  formatEaseFactor,
  formatInterval,
  formatRelativeTimestamp,
  formatReviewDate,
} from "../utils/formatters";
import { MarkdownPreview } from "./MarkdownPreview";

export interface DecksManagementViewProps {
  decks: Deck[];
  allCards: Flashcard[];
  dueCards: Flashcard[];
  notes: Note[];
  selectedDeckId: number | null;
  onSelectDeck: (deckId: number | null) => void;
  onCreateDeck: (name: string, description: string) => Promise<Deck>;
  onUpdateDeck: (
    id: number,
    name: string,
    description: string
  ) => Promise<Deck>;
  onDeleteDeck: (id: number) => Promise<void>;
  onCreateFlashcard: (input: CreateFlashcardInput) => Promise<void>;
  onUpdateFlashcard: (input: UpdateFlashcardInput) => Promise<Flashcard>;
  onDeleteFlashcard: (id: number) => Promise<void>;
  onOpenStudyMode: (deckId?: number) => void;
  onOpenCreateCardModal: (deckId?: number | null) => void;
  onOpenImportModal: () => void;
  onNavigateReferenceTag: (referenceTag: string) => void;
  onNavigateDashboard: () => void;
}

export const DecksManagementView: React.FC<DecksManagementViewProps> = ({
  decks,
  allCards,
  dueCards,
  notes,
  selectedDeckId,
  onSelectDeck,
  onCreateDeck,
  onUpdateDeck,
  onDeleteDeck,
  onUpdateFlashcard,
  onDeleteFlashcard,
  onOpenStudyMode,
  onOpenCreateCardModal,
  onOpenImportModal,
  onNavigateReferenceTag,
  onNavigateDashboard,
}) => {
  // Deck creation state
  const [isCreatingDeck, setIsCreatingDeck] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");
  const [newDeckDescription, setNewDeckDescription] = useState("");
  const [isSavingDeck, setIsSavingDeck] = useState(false);

  // Deck editing state
  const [editingDeckId, setEditingDeckId] = useState<number | null>(null);
  const [editDeckName, setEditDeckName] = useState("");
  const [editDeckDescription, setEditDeckDescription] = useState("");

  // Flashcard filtering state
  const [cardSearchQuery, setCardSearchQuery] = useState("");
  const [cardTypeFilter, setCardTypeFilter] = useState<"all" | CardType>("all");

  // Flashcard inline editing state
  const [editingCardId, setEditingCardId] = useState<number | null>(null);
  const [editCardDeckId, setEditCardDeckId] = useState<number>(1);
  const [editCardType, setEditCardType] = useState<CardType>("default");
  const [editCardFront, setEditCardFront] = useState("");
  const [editCardBack, setEditCardBack] = useState("");
  const [editCardOptions, setEditCardOptions] = useState<string[]>(["", ""]);
  const [editCardReferenceTag, setEditCardReferenceTag] = useState("");
  const [isSavingCard, setIsSavingCard] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const selectedDeck = useMemo(
    () => decks.find((d) => d.id === selectedDeckId) ?? null,
    [decks, selectedDeckId]
  );

  // Clear stale editing state if the edited deck or card was deleted
  useEffect(() => {
    if (editingDeckId !== null && !decks.some((d) => d.id === editingDeckId)) {
      setEditingDeckId(null);
    }
  }, [decks, editingDeckId]);

  useEffect(() => {
    if (
      editingCardId !== null &&
      !allCards.some((c) => c.id === editingCardId)
    ) {
      setEditingCardId(null);
    }
  }, [allCards, editingCardId]);

  // Extract smart tag suggestions from notes (`NoteTitle#Header`)
  const smartTagSuggestions = useMemo(() => {
    const suggestions: string[] = [];
    for (const note of notes) {
      const noteTitle = (note.title || "Untitled Note").trim();
      suggestions.push(noteTitle);
      for (const line of note.content.split("\n")) {
        const m = /^#{1,3}\s+(.+)$/.exec(line.trim());
        if (m && m[1]) {
          const cleanHeader = m[1].replace(/[*`]/g, "").trim();
          suggestions.push(`${noteTitle}#${cleanHeader}`);
        }
      }
    }
    return suggestions;
  }, [notes]);

  const filteredCards = useMemo(() => {
    const q = cardSearchQuery.trim().toLowerCase();
    return allCards.filter((card) => {
      if (selectedDeckId !== null && card.deck_id !== selectedDeckId) {
        return false;
      }
      if (cardTypeFilter !== "all" && card.card_type !== cardTypeFilter) {
        return false;
      }
      if (!q) return true;
      const inFront = card.front.toLowerCase().includes(q);
      const inBack = card.back.toLowerCase().includes(q);
      const inTag = card.reference_tag?.toLowerCase().includes(q) ?? false;
      const inOptions = card.options.some((o) => o.toLowerCase().includes(q));
      return inFront || inBack || inTag || inOptions;
    });
  }, [allCards, cardSearchQuery, cardTypeFilter, selectedDeckId]);

  // Start creating a deck
  const handleCreateDeckSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newDeckName.trim() || isSavingDeck) return;
      setIsSavingDeck(true);
      try {
        const created = await onCreateDeck(
          newDeckName.trim(),
          newDeckDescription.trim()
        );
        setNewDeckName("");
        setNewDeckDescription("");
        setIsCreatingDeck(false);
        onSelectDeck(created.id);
        setStatusBanner(`Created deck "${created.name}".`);
      } catch (err) {
        console.error("Failed to create deck:", err);
      } finally {
        setIsSavingDeck(false);
      }
    },
    [isSavingDeck, newDeckDescription, newDeckName, onCreateDeck, onSelectDeck]
  );

  // Start editing a deck
  const handleStartEditDeck = useCallback(
    (deck: Deck, e?: React.MouseEvent) => {
      e?.stopPropagation();
      setEditingDeckId(deck.id);
      setEditDeckName(deck.name);
      setEditDeckDescription(deck.description);
    },
    []
  );

  const handleSaveEditDeck = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (editingDeckId === null || !editDeckName.trim() || isSavingDeck) {
        return;
      }
      setIsSavingDeck(true);
      try {
        const updated = await onUpdateDeck(
          editingDeckId,
          editDeckName.trim(),
          editDeckDescription.trim()
        );
        setEditingDeckId(null);
        setStatusBanner(`Updated deck "${updated.name}".`);
      } catch (err) {
        console.error("Failed to update deck:", err);
      } finally {
        setIsSavingDeck(false);
      }
    },
    [editDeckDescription, editDeckName, editingDeckId, isSavingDeck, onUpdateDeck]
  );

  const handleDeleteDeckClick = useCallback(
    async (deck: Deck, e?: React.MouseEvent) => {
      e?.stopPropagation();
      try {
        await onDeleteDeck(deck.id);
        if (editingDeckId === deck.id) {
          setEditingDeckId(null);
        }
        setStatusBanner(
          `Deleted deck "${deck.name}" and its associated flashcards.`
        );
      } catch (err) {
        console.error("Failed to delete deck:", err);
      }
    },
    [editingDeckId, onDeleteDeck]
  );

  // Start editing a flashcard inline
  const handleStartEditCard = useCallback((card: Flashcard) => {
    setEditingCardId(card.id);
    setEditCardDeckId(card.deck_id);
    setEditCardType(card.card_type);
    setEditCardFront(card.front);
    setEditCardBack(card.back);
    setEditCardOptions(
      card.options && card.options.length >= 2
        ? [...card.options]
        : card.options.length === 1
          ? [card.options[0], ""]
          : ["", ""]
    );
    setEditCardReferenceTag(card.reference_tag ?? "");
  }, []);

  const handleOptionChange = useCallback((idx: number, val: string) => {
    setEditCardOptions((prev) =>
      prev.map((item, i) => (i === idx ? val : item))
    );
  }, []);

  const handleAddOption = useCallback(() => {
    setEditCardOptions((prev) => [...prev, ""]);
  }, []);

  const handleRemoveOption = useCallback((idx: number) => {
    setEditCardOptions((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleSaveEditCard = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (
        editingCardId === null ||
        !editCardFront.trim() ||
        !editCardBack.trim() ||
        isSavingCard
      ) {
        return;
      }

      const cleanedOptions =
        editCardType === "default"
          ? []
          : editCardOptions.map((o) => o.trim()).filter(Boolean);

      setIsSavingCard(true);
      try {
        const updated = await onUpdateFlashcard({
          id: editingCardId,
          deckId: editCardDeckId,
          front: editCardFront.trim(),
          back: editCardBack.trim(),
          cardType: editCardType,
          options: cleanedOptions,
          referenceTag: editCardReferenceTag.trim() || null,
        });
        setEditingCardId(null);
        setStatusBanner(`Saved changes to Flashcard #${updated.id}.`);
      } catch (err) {
        console.error("Failed to update flashcard:", err);
      } finally {
        setIsSavingCard(false);
      }
    },
    [
      editCardBack,
      editCardDeckId,
      editCardFront,
      editCardOptions,
      editCardReferenceTag,
      editCardType,
      editingCardId,
      isSavingCard,
      onUpdateFlashcard,
    ]
  );

  const handleDeleteCardClick = useCallback(
    async (cardId: number) => {
      try {
        await onDeleteFlashcard(cardId);
        if (editingCardId === cardId) {
          setEditingCardId(null);
        }
        setStatusBanner(`Deleted Flashcard #${cardId}.`);
      } catch (err) {
        console.error("Failed to delete flashcard:", err);
      }
    },
    [editingCardId, onDeleteFlashcard]
  );

  return (
    <div className="h-full w-full overflow-y-auto bg-[#FBFBFA] px-6 py-6 lg:px-12">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Top Functional Breadcrumb & Header Actions */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200/80 pb-5">
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs text-stone-500">
              <button
                type="button"
                onClick={onNavigateDashboard}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-stone-600 hover:bg-stone-200/60 hover:text-stone-900 transition-colors cursor-pointer"
              >
                <FolderOpen className="h-3.5 w-3.5 text-stone-400" />
                <span>Workspace</span>
              </button>
              <ChevronRight className="h-3.5 w-3.5 text-stone-400" />
              <span className="font-semibold text-stone-800">
                Decks Management
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-900 text-white shadow-2xs">
                <FolderKanban className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-stone-900">
                  Decks &amp; Flashcards Management
                </h1>
                <p className="text-xs text-stone-500">
                  Create, edit, and delete study decks and manage their
                  respective flashcards, options, and smart reference tags.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIsCreatingDeck(true);
                setEditingDeckId(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100 transition-colors cursor-pointer"
            >
              <FolderPlus className="h-3.5 w-3.5 text-sky-600" />
              <span>New Deck</span>
            </button>

            <button
              type="button"
              onClick={onOpenImportModal}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100 transition-colors cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5 text-sky-600" />
              <span>Import Deck (JSON/CSV)</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenCreateCardModal(selectedDeckId)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition-colors cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5 text-amber-700" />
              <span>New Flashcard</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenStudyMode(selectedDeckId ?? undefined)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>
                Study {selectedDeck ? `"${selectedDeck.name}"` : "All Decks"}
              </span>
            </button>
          </div>
        </header>

        {/* Status Toast Banner */}
        {statusBanner && (
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-2.5 text-xs font-medium text-emerald-900">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{statusBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="rounded p-1 text-emerald-700 hover:bg-emerald-100 cursor-pointer"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Two-Column Layout: Left = Decks List & Deck CRUD, Right = Respective Flashcards CRUD */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* LEFT COLUMN (4 cols): Study Decks List & Editor */}
          <section className="lg:col-span-5 xl:col-span-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderKanban className="h-4 w-4 text-stone-700" />
                <h2 className="text-sm font-bold text-stone-900">
                  Study Decks ({decks.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsCreatingDeck((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-900 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{isCreatingDeck ? "Cancel" : "Create Deck"}</span>
              </button>
            </div>

            {/* Inline Create Deck Form */}
            {isCreatingDeck && (
              <form
                onSubmit={handleCreateDeckSubmit}
                className="rounded-xl border border-sky-200 bg-sky-50/40 p-4 space-y-3 shadow-2xs"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-900">
                    Create New Deck
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsCreatingDeck(false)}
                    className="rounded p-0.5 text-stone-400 hover:text-stone-700 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-stone-700">
                    Deck Name
                  </label>
                  <input
                    type="text"
                    value={newDeckName}
                    onChange={(e) => setNewDeckName(e.target.value)}
                    placeholder="e.g. Neurobiology & Synapses"
                    aria-label="New deck name"
                    className="w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs text-stone-900 focus:border-stone-500 focus:outline-none"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-stone-700">
                    Description
                  </label>
                  <textarea
                    value={newDeckDescription}
                    onChange={(e) => setNewDeckDescription(e.target.value)}
                    rows={2}
                    placeholder="Brief summary of this study deck..."
                    aria-label="New deck description"
                    className="w-full resize-none rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs text-stone-900 focus:border-stone-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCreatingDeck(false)}
                    className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!newDeckName.trim() || isSavingDeck}
                    className="inline-flex items-center gap-1 rounded-lg bg-stone-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-stone-800 disabled:opacity-40 cursor-pointer"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>Save Deck</span>
                  </button>
                </div>
              </form>
            )}

            {/* "All Decks" Selector Card */}
            <button
              type="button"
              onClick={() => onSelectDeck(null)}
              className={`w-full flex items-center justify-between rounded-xl border p-3.5 text-left transition-all cursor-pointer ${
                selectedDeckId === null
                  ? "border-stone-900 bg-stone-900 text-white shadow-xs"
                  : "border-stone-200/90 bg-white text-stone-800 hover:border-stone-300"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    selectedDeckId === null
                      ? "bg-white/15 text-white"
                      : "bg-stone-100 text-stone-700"
                  }`}
                >
                  <Layers className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold">All Study Decks</div>
                  <div
                    className={`text-[11px] ${
                      selectedDeckId === null
                        ? "text-stone-300"
                        : "text-stone-500"
                    }`}
                  >
                    View &amp; manage all {allCards.length} flashcards across{" "}
                    {decks.length} {decks.length === 1 ? "deck" : "decks"}
                  </div>
                </div>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  selectedDeckId === null
                    ? "bg-white/20 text-white"
                    : "bg-stone-100 text-stone-700"
                }`}
              >
                {allCards.length}
              </span>
            </button>

            {/* Individual Deck Cards */}
            {decks.length > 0 ? (
              <div className="space-y-2.5">
                {decks.map((deck) => {
                  const deckCards = allCards.filter(
                    (c) => c.deck_id === deck.id
                  );
                  const deckDue = dueCards.filter((c) => c.deck_id === deck.id);
                  const isSelected = selectedDeckId === deck.id;
                  const isEditingThisDeck = editingDeckId === deck.id;

                  if (isEditingThisDeck) {
                    return (
                      <form
                        key={deck.id}
                        onSubmit={handleSaveEditDeck}
                        className="rounded-xl border-2 border-amber-400 bg-white p-4 space-y-3 shadow-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-900">
                            <Pencil className="h-3.5 w-3.5 text-amber-600" />
                            <span>Edit Deck #{deck.id}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setEditingDeckId(null)}
                            className="rounded p-0.5 text-stone-400 hover:text-stone-700 cursor-pointer"
                            aria-label="Cancel deck edit"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div>
                          <label className="mb-1 block text-[11px] font-semibold text-stone-700">
                            Deck Name
                          </label>
                          <input
                            type="text"
                            value={editDeckName}
                            onChange={(e) => setEditDeckName(e.target.value)}
                            aria-label="Edit deck name"
                            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs text-stone-900 focus:border-stone-500 focus:outline-none"
                            autoFocus
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-[11px] font-semibold text-stone-700">
                            Description
                          </label>
                          <textarea
                            value={editDeckDescription}
                            onChange={(e) =>
                              setEditDeckDescription(e.target.value)
                            }
                            rows={2}
                            aria-label="Edit deck description"
                            className="w-full resize-none rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs text-stone-900 focus:border-stone-500 focus:outline-none"
                          />
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setEditingDeckId(null)}
                            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-100 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={!editDeckName.trim() || isSavingDeck}
                            className="inline-flex items-center gap-1 rounded-lg bg-stone-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-stone-800 disabled:opacity-40 cursor-pointer"
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span>Save Changes</span>
                          </button>
                        </div>
                      </form>
                    );
                  }

                  return (
                    <div
                      key={deck.id}
                      onClick={() => onSelectDeck(deck.id)}
                      className={`group rounded-xl border p-4 transition-all cursor-pointer ${
                        isSelected
                          ? "border-stone-900 bg-white ring-2 ring-stone-900/10 shadow-xs"
                          : "border-stone-200/90 bg-white hover:border-stone-300"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="truncate text-sm font-bold text-stone-900">
                              {deck.name}
                            </h3>
                            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                              {deckDue.length} Due
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-stone-500 line-clamp-2">
                            {deck.description ||
                              "Spaced repetition flashcard deck."}
                          </p>
                        </div>

                        {/* Deck Edit & Delete Action Buttons */}
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => handleStartEditDeck(deck, e)}
                            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-800 transition-colors cursor-pointer"
                            title={`Edit deck "${deck.name}"`}
                            aria-label={`Edit deck ${deck.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteDeckClick(deck, e)}
                            className="rounded-lg p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
                            title={`Delete deck "${deck.name}"`}
                            aria-label={`Delete deck ${deck.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-3.5 flex items-center justify-between border-t border-stone-100 pt-2.5 text-[11px] text-stone-500">
                        <div className="flex items-center gap-2.5">
                          <span className="font-semibold text-stone-700">
                            {deckCards.length}{" "}
                            {deckCards.length === 1 ? "card" : "cards"}
                          </span>
                          <span>•</span>
                          <span className="inline-flex items-center gap-1 text-stone-400">
                            <Clock className="h-3 w-3" />
                            <span>
                              {formatRelativeTimestamp(deck.updated_at)}
                            </span>
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenCreateCardModal(deck.id);
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-[#FBFBFA] px-2 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-100 cursor-pointer"
                            title="Add flashcard to this deck"
                          >
                            <Plus className="h-3 w-3" />
                            <span>Add Card</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenStudyMode(deck.id);
                            }}
                            className="inline-flex items-center gap-1 rounded-md bg-stone-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-stone-800 cursor-pointer"
                          >
                            <Play className="h-2.5 w-2.5 fill-current" />
                            <span>Study</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-stone-200 bg-white p-6 text-center">
                <FolderKanban className="mx-auto mb-2 h-7 w-7 text-stone-400" />
                <h3 className="text-xs font-bold text-stone-800">
                  No Study Decks
                </h3>
                <p className="mt-1 mb-3 text-[11px] text-stone-500">
                  Create a new deck or import a JSON/CSV deck to get started.
                </p>
                <button
                  type="button"
                  onClick={() => setIsCreatingDeck(true)}
                  className="inline-flex items-center gap-1 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-800 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create First Deck</span>
                </button>
              </div>
            )}
          </section>

          {/* RIGHT COLUMN (8 cols): Flashcards Management for Selected Deck */}
          <section className="lg:col-span-7 xl:col-span-8 space-y-4">
            {/* Active Deck Summary Header Card */}
            <div className="rounded-xl border border-stone-200/90 bg-white p-4 shadow-2xs">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-semibold text-stone-700">
                      <Layers className="h-3 w-3 text-stone-500" />
                      <span>
                        {selectedDeck ? `Deck #${selectedDeck.id}` : "All Decks"}
                      </span>
                    </span>
                    <h2 className="text-base font-bold text-stone-900">
                      {selectedDeck ? selectedDeck.name : "All Flashcards"}
                    </h2>
                  </div>
                  <p className="mt-1 text-xs text-stone-500">
                    {selectedDeck
                      ? selectedDeck.description ||
                        "Manage, edit, or delete flashcards in this deck."
                      : "Showing flashcards across all study decks. Select a deck on the left to filter or edit deck details."}
                  </p>
                </div>

                {selectedDeck && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleStartEditDeck(selectedDeck)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
                    >
                      <Pencil className="h-3.5 w-3.5 text-stone-500" />
                      <span>Edit Deck</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDeckClick(selectedDeck)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50/70 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete Deck</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Search & Card Type Filter Bar */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-3.5">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
                  <input
                    type="text"
                    value={cardSearchQuery}
                    onChange={(e) => setCardSearchQuery(e.target.value)}
                    placeholder="Search flashcards by question, answer, option, or smart tag..."
                    aria-label="Search flashcards"
                    className="w-full rounded-lg border border-stone-200 bg-[#FBFBFA] pl-8 pr-8 py-1.5 text-xs text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:bg-white focus:outline-none"
                  />
                  {cardSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setCardSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  {(
                    [
                      { value: "all", label: "All Types" },
                      { value: "default", label: "Default" },
                      { value: "single_choice", label: "Single Choice" },
                      { value: "multiple_choice", label: "Multiple Choice" },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => setCardTypeFilter(tab.value)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                        cardTypeFilter === tab.value
                          ? "bg-stone-900 text-white"
                          : "bg-stone-100 text-stone-600 hover:bg-stone-200/70"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Flashcards List */}
            {filteredCards.length > 0 ? (
              <div className="space-y-3">
                {filteredCards.map((card) => {
                  const deckName =
                    decks.find((d) => d.id === card.deck_id)?.name ??
                    "Study Deck";
                  const isEditingThisCard = editingCardId === card.id;

                  if (isEditingThisCard) {
                    return (
                      <form
                        key={card.id}
                        onSubmit={handleSaveEditCard}
                        className="rounded-2xl border-2 border-amber-400 bg-white p-5 space-y-4 shadow-sm"
                      >
                        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-0.5 text-xs font-bold text-amber-900">
                              <Pencil className="h-3 w-3 text-amber-700" />
                              <span>Editing Flashcard #{card.id}</span>
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setEditingCardId(null)}
                            className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 cursor-pointer"
                            aria-label="Cancel card edit"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Deck Assignment & Card Type & Smart Reference Tag */}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <div>
                            <label className="mb-1 block text-[11px] font-semibold text-stone-700">
                              Deck
                            </label>
                            <select
                              aria-label="Edit card deck"
                              value={editCardDeckId}
                              onChange={(e) =>
                                setEditCardDeckId(Number(e.target.value))
                              }
                              className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-800 focus:border-stone-400 focus:outline-none"
                            >
                              {decks.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="mb-1 block text-[11px] font-semibold text-stone-700">
                              Card Type
                            </label>
                            <select
                              aria-label="Edit card type"
                              value={editCardType}
                              onChange={(e) =>
                                setEditCardType(e.target.value as CardType)
                              }
                              className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-800 focus:border-stone-400 focus:outline-none"
                            >
                              <option value="default">Default (Q&amp;A)</option>
                              <option value="single_choice">
                                Single Choice
                              </option>
                              <option value="multiple_choice">
                                Multiple Choice
                              </option>
                            </select>
                          </div>

                          <div>
                            <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-stone-700">
                              <Tag className="h-3 w-3 text-amber-600" />
                              <span>Smart Reference Tag</span>
                            </label>
                            <input
                              type="text"
                              list={`smart-tags-card-${card.id}`}
                              value={editCardReferenceTag}
                              onChange={(e) =>
                                setEditCardReferenceTag(e.target.value)
                              }
                              placeholder="NoteTitle#Section"
                              aria-label="Edit card reference tag"
                              className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs text-stone-800 focus:border-stone-400 focus:outline-none"
                            />
                            <datalist id={`smart-tags-card-${card.id}`}>
                              {smartTagSuggestions.map((tag) => (
                                <option key={tag} value={tag} />
                              ))}
                            </datalist>
                          </div>
                        </div>

                        {/* Choice Options Editor (for Single Choice / Multiple Choice) */}
                        {(editCardType === "single_choice" ||
                          editCardType === "multiple_choice") && (
                          <div className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-3.5 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-amber-950">
                                {editCardType === "single_choice"
                                  ? "Single Choice Options"
                                  : "Multiple Choice Options"}
                              </span>
                              <button
                                type="button"
                                onClick={handleAddOption}
                                className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 cursor-pointer"
                              >
                                <Plus className="h-3 w-3" />
                                <span>Add Option</span>
                              </button>
                            </div>

                            <div className="space-y-1.5">
                              {editCardOptions.map((opt, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center gap-2"
                                >
                                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-white text-[11px] font-bold text-stone-600 border border-stone-200">
                                    {String.fromCharCode(65 + idx)}
                                  </span>
                                  <input
                                    type="text"
                                    value={opt}
                                    onChange={(e) =>
                                      handleOptionChange(idx, e.target.value)
                                    }
                                    placeholder={`Option ${String.fromCharCode(
                                      65 + idx
                                    )}...`}
                                    className="flex-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-800 focus:border-stone-400 focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditCardBack((prev) =>
                                        prev ? `${prev}\n- ${opt}` : opt
                                      )
                                    }
                                    className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                                  >
                                    Use as Answer
                                  </button>
                                  {editCardOptions.length > 2 && (
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

                        {/* Front Markdown + Live Preview */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-stone-800">
                              Front (Prompt Markdown)
                            </label>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setEditCardFront(
                                    (p) => `${p}${p ? " " : ""}**bold**`
                                  )
                                }
                                className="rounded border border-stone-200 bg-[#FBFBFA] px-2 py-0.5 text-[10px] font-semibold text-stone-600 hover:bg-stone-100 cursor-pointer"
                              >
                                **Bold**
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setEditCardFront(
                                    (p) => `${p}${p ? " " : ""}\`code\``
                                  )
                                }
                                className="inline-flex items-center gap-1 rounded border border-stone-200 bg-[#FBFBFA] px-2 py-0.5 text-[10px] font-semibold text-stone-600 hover:bg-stone-100 cursor-pointer"
                              >
                                <Code className="h-2.5 w-2.5" />
                                <span>Code</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setEditCardFront(
                                    (p) =>
                                      `${p}${p ? " " : ""}:emerald[highlight]`
                                  )
                                }
                                className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                              >
                                <Palette className="h-2.5 w-2.5" />
                                <span>:emerald[...]</span>
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 rounded-xl border border-stone-200 bg-[#FBFBFA] p-2.5">
                            <textarea
                              value={editCardFront}
                              onChange={(e) => setEditCardFront(e.target.value)}
                              rows={3}
                              aria-label="Edit card front"
                              className="w-full resize-none rounded-lg border border-stone-200 bg-[#1E1E1E] p-2.5 font-mono text-xs text-stone-100 focus:outline-none"
                            />
                            <div className="rounded-lg border border-stone-200/80 bg-white p-2.5 overflow-y-auto max-h-28">
                              <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                                <Eye className="h-2.5 w-2.5" />
                                <span>Front Preview</span>
                              </div>
                              <MarkdownPreview
                                markdown={editCardFront}
                                compact
                              />
                            </div>
                          </div>
                        </div>

                        {/* Back Markdown + Live Preview */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-stone-800">
                              Back (Answer Markdown)
                            </label>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setEditCardBack(
                                    (p) => `${p}${p ? " " : ""}**bold**`
                                  )
                                }
                                className="rounded border border-stone-200 bg-[#FBFBFA] px-2 py-0.5 text-[10px] font-semibold text-stone-600 hover:bg-stone-100 cursor-pointer"
                              >
                                **Bold**
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setEditCardBack(
                                    (p) =>
                                      `${p}${p ? " " : ""}:amber[key point]`
                                  )
                                }
                                className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 hover:bg-amber-100 cursor-pointer"
                              >
                                <Palette className="h-2.5 w-2.5" />
                                <span>:amber[...]</span>
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 rounded-xl border border-stone-200 bg-[#FBFBFA] p-2.5">
                            <textarea
                              value={editCardBack}
                              onChange={(e) => setEditCardBack(e.target.value)}
                              rows={3}
                              aria-label="Edit card back"
                              className="w-full resize-none rounded-lg border border-stone-200 bg-[#1E1E1E] p-2.5 font-mono text-xs text-stone-100 focus:outline-none"
                            />
                            <div className="rounded-lg border border-stone-200/80 bg-white p-2.5 overflow-y-auto max-h-28">
                              <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                                <Eye className="h-2.5 w-2.5" />
                                <span>Back Preview</span>
                              </div>
                              <MarkdownPreview
                                markdown={editCardBack}
                                compact
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-stone-100 pt-3">
                          <button
                            type="button"
                            onClick={() => setEditingCardId(null)}
                            className="rounded-lg border border-stone-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-100 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={
                              !editCardFront.trim() ||
                              !editCardBack.trim() ||
                              isSavingCard
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-stone-800 disabled:opacity-40 cursor-pointer"
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span>
                              {isSavingCard ? "Saving..." : "Save Card Changes"}
                            </span>
                          </button>
                        </div>
                      </form>
                    );
                  }

                  return (
                    <div
                      key={card.id}
                      className="rounded-xl border border-stone-200/90 bg-white p-4 shadow-2xs hover:border-stone-300 transition-all"
                    >
                      {/* Top Meta & Edit/Delete Controls */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="rounded-md bg-stone-900 px-2 py-0.5 text-[11px] font-bold text-white">
                            #{card.id}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-semibold text-stone-700">
                            <Layers className="h-3 w-3 text-stone-500" />
                            <span>{deckName}</span>
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-medium text-stone-700">
                            {card.card_type === "single_choice" ? (
                              <CircleDot className="h-3 w-3 text-sky-600" />
                            ) : card.card_type === "multiple_choice" ? (
                              <CheckSquare className="h-3 w-3 text-violet-600" />
                            ) : (
                              <FileText className="h-3 w-3 text-stone-400" />
                            )}
                            <span>{formatCardTypeLabel(card.card_type)}</span>
                          </span>

                          {card.reference_tag && (
                            <button
                              type="button"
                              onClick={() =>
                                onNavigateReferenceTag(card.reference_tag!)
                              }
                              className="inline-flex items-center gap-1 rounded-full border border-amber-300/80 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 transition-colors cursor-pointer"
                              title={`Jump to smart reference: ${card.reference_tag}`}
                            >
                              <Tag className="h-2.5 w-2.5 text-amber-600" />
                              <span>{card.reference_tag}</span>
                              <ArrowUpRight className="h-2.5 w-2.5" />
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleStartEditCard(card)}
                            className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
                            title={`Edit Flashcard #${card.id}`}
                            aria-label={`Edit Flashcard #${card.id}`}
                          >
                            <Pencil className="h-3 w-3 text-stone-500" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCardClick(card.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200/80 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                            title={`Delete Flashcard #${card.id}`}
                            aria-label={`Delete Flashcard #${card.id}`}
                          >
                            <Trash2 className="h-3 w-3" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>

                      {/* Front & Back Content Grid */}
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="rounded-lg border border-stone-200/70 bg-[#FBFBFA] p-3">
                          <span className="mb-1 inline-block rounded bg-stone-200/80 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-stone-700">
                            Front
                          </span>
                          <div className="text-xs text-stone-900">
                            <MarkdownPreview markdown={card.front} compact />
                          </div>
                        </div>

                        <div className="rounded-lg border border-emerald-200/70 bg-emerald-50/30 p-3">
                          <span className="mb-1 inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                            Back
                          </span>
                          <div className="text-xs text-stone-800">
                            <MarkdownPreview markdown={card.back} compact />
                          </div>
                        </div>
                      </div>

                      {/* Choice Options Preview (if choice card) */}
                      {(card.card_type === "single_choice" ||
                        card.card_type === "multiple_choice") &&
                        card.options.length > 0 && (
                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mr-1">
                              Options:
                            </span>
                            {card.options.map((opt, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-[#FBFBFA] px-2 py-0.5 text-[11px] text-stone-700"
                              >
                                <strong className="text-stone-500">
                                  {String.fromCharCode(65 + idx)}.
                                </strong>{" "}
                                {opt}
                              </span>
                            ))}
                          </div>
                        )}

                      {/* SM-2 Scheduling Footer */}
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-2.5 text-[11px] text-stone-500">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded bg-stone-100/80 px-2 py-0.5 font-medium text-stone-600">
                            <Repeat className="h-3 w-3 text-stone-400" />
                            <span>Interval: {formatInterval(card.interval)}</span>
                          </span>
                          <span className="inline-flex items-center gap-1 rounded bg-stone-100/80 px-2 py-0.5 font-medium text-stone-600">
                            <Gauge className="h-3 w-3 text-stone-400" />
                            <span>Ease: {formatEaseFactor(card.ease)}</span>
                          </span>
                          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 font-medium text-amber-800">
                            <Calendar className="h-3 w-3 text-amber-600" />
                            <span>Due: {formatReviewDate(card.next_review)}</span>
                          </span>
                        </div>

                        <span className="text-[10px] text-stone-400">
                          Repetitions: {card.repetitions}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-200 bg-white px-6 py-14 text-center">
                <Brain className="mb-2 h-8 w-8 text-stone-400" />
                <h3 className="text-sm font-bold text-stone-900">
                  No Flashcards Found
                </h3>
                <p className="mt-1 mb-4 max-w-sm text-xs text-stone-500">
                  {cardSearchQuery || cardTypeFilter !== "all"
                    ? "No flashcards match your current search or type filter."
                    : selectedDeck
                      ? `Deck "${selectedDeck.name}" has no flashcards yet. Add your first card below!`
                      : "Create a flashcard or import a JSON/CSV deck to populate your study collection."}
                </p>
                <div className="flex items-center gap-2">
                  {(cardSearchQuery || cardTypeFilter !== "all") && (
                    <button
                      type="button"
                      onClick={() => {
                        setCardSearchQuery("");
                        setCardTypeFilter("all");
                      }}
                      className="rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 cursor-pointer"
                    >
                      Reset Filters
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenCreateCardModal(selectedDeckId)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Flashcard</span>
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default DecksManagementView;
