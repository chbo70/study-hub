import React, { useCallback, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Brain,
  Check,
  Clock,
  FilePlus2,
  FileText,
  FolderKanban,
  Layers,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { Deck, Flashcard, Note } from "../types";
import {
  formatCardTypeLabel,
  formatRelativeTimestamp,
  formatReviewDate,
} from "../utils/formatters";

export interface ActivityEvent {
  id: string;
  type: "note" | "deck" | "card" | "review";
  title: string;
  subtitle: string;
  timestamp: string;
}

export interface DashboardViewProps {
  notes: Note[];
  decks: Deck[];
  allCards: Flashcard[];
  dueCards: Flashcard[];
  recentActivity: ActivityEvent[];
  onSelectNote: (note: Note) => void;
  onCreateNote: () => void;
  onDeleteNote: (id: number, e: React.MouseEvent) => void;
  onOpenStudyMode: (deckId?: number) => void;
  onOpenDecksManagement?: (deckId?: number | null) => void;
  onUpdateDeck?: (
    id: number,
    name: string,
    description: string
  ) => Promise<Deck>;
  onDeleteDeck?: (id: number) => Promise<void>;
  onOpenCreateCardModal: () => void;
  onOpenImportModal: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  notes,
  decks,
  allCards,
  dueCards,
  recentActivity,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
  onOpenStudyMode,
  onOpenDecksManagement,
  onUpdateDeck,
  onDeleteDeck,
  onOpenCreateCardModal,
  onOpenImportModal,
}) => {
  const [editingDeckId, setEditingDeckId] = useState<number | null>(null);
  const [editDeckName, setEditDeckName] = useState("");
  const [editDeckDescription, setEditDeckDescription] = useState("");

  const handleStartEditDeck = useCallback((deck: Deck) => {
    setEditingDeckId(deck.id);
    setEditDeckName(deck.name);
    setEditDeckDescription(deck.description);
  }, []);

  const handleSaveEditDeck = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (editingDeckId === null || !editDeckName.trim() || !onUpdateDeck) {
        return;
      }
      await onUpdateDeck(
        editingDeckId,
        editDeckName.trim(),
        editDeckDescription.trim()
      );
      setEditingDeckId(null);
    },
    [editDeckDescription, editDeckName, editingDeckId, onUpdateDeck]
  );
  const combinedActivity = useMemo(() => {
    const derived: ActivityEvent[] = [...recentActivity];

    for (const note of notes.slice(0, 4)) {
      derived.push({
        id: `note-${note.id}`,
        type: "note",
        title: `Edited "${note.title || "Untitled Note"}"`,
        subtitle: "Split-pane Markdown workspace synced to SQLite",
        timestamp: note.updated_at,
      });
    }

    for (const card of allCards.slice(-4).reverse()) {
      const deckName =
        decks.find((d) => d.id === card.deck_id)?.name ?? "Study Deck";
      derived.push({
        id: `card-${card.id}`,
        type: "card",
        title: `Card #${card.id} in ${deckName}`,
        subtitle: `${formatCardTypeLabel(card.card_type)}${
          card.reference_tag ? ` • Ref: ${card.reference_tag}` : ""
        }`,
        timestamp: card.created_at,
      });
    }

    return derived
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      .slice(0, 8);
  }, [allCards, decks, notes, recentActivity]);

  return (
    <div className="h-full w-full overflow-y-auto bg-[#FBFBFA] px-6 py-7 lg:px-12">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Top Hero & Quick Actions */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200/80 pb-6">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-stone-600 mb-2">
              <Sparkles className="h-3 w-3 text-amber-600" />
              <span>Study Hub v2 Workspace</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-stone-900">
              Workspace Dashboard
            </h1>
            <p className="mt-1 text-xs text-stone-500">
              Manage your split-pane Markdown notes, decoupled Anki study decks,
              smart header backlinks, and recent activity.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onCreateNote}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100 transition-colors cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Note</span>
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
              onClick={onOpenCreateCardModal}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition-colors cursor-pointer"
            >
              <Layers className="h-3.5 w-3.5 text-amber-700" />
              <span>Quick Add Cards</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenStudyMode()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Study Due ({dueCards.length})</span>
            </button>
          </div>
        </header>

        {/* Key Metrics Strip */}
        <section className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
          <div className="rounded-xl border border-stone-200/90 bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between text-xs font-medium text-stone-500">
              <span>Markdown Notes</span>
              <FileText className="h-4 w-4 text-stone-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-stone-900">
              {notes.length}
            </div>
            <div className="mt-1 text-[11px] text-stone-400">
              Overleaf/Joplin split-pane ready
            </div>
          </div>

          <div className="rounded-xl border border-stone-200/90 bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between text-xs font-medium text-stone-500">
              <span>Flashcard Decks</span>
              <FolderKanban className="h-4 w-4 text-sky-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-stone-900">
              {decks.length}
            </div>
            <div className="mt-1 text-[11px] text-stone-400">
              Decoupled deck collections
            </div>
          </div>

          <div className="rounded-xl border border-stone-200/90 bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between text-xs font-medium text-stone-500">
              <span>Total Flashcards</span>
              <Layers className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-stone-900">
              {allCards.length}
            </div>
            <div className="mt-1 text-[11px] text-stone-400">
              Default, Single & Multiple Choice
            </div>
          </div>

          <div className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-4 shadow-2xs">
            <div className="flex items-center justify-between text-xs font-medium text-amber-800">
              <span>Due Today</span>
              <Brain className="h-4 w-4 text-amber-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-amber-950">
              {dueCards.length}
            </div>
            <div className="mt-1 text-[11px] text-amber-700">
              Ready for 3D stack review
            </div>
          </div>
        </section>

        {/* Main Two-Column Grid: All Notes + Recent Activity & Decks */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left 2 Columns: All Notes List */}
          <section className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-stone-700" />
                <h2 className="text-base font-bold text-stone-900">
                  All Notes ({notes.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={onCreateNote}
                className="inline-flex items-center gap-1 text-xs font-semibold text-stone-700 hover:text-stone-900 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create Note</span>
              </button>
            </div>

            {notes.length > 0 ? (
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                {notes.map((note) => {
                  const plainSnippet = note.content
                    .replace(/^#+\s+.+$/gm, "")
                    .replace(/:[a-z]+\[([^\]]+)\](?:\{[^}]*\})?/g, "$1")
                    .replace(/[*`>_~#-]/g, "")
                    .trim()
                    .slice(0, 140);
                  const wordCount = note.content
                    .trim()
                    .split(/\s+/)
                    .filter(Boolean).length;

                  // Count flashcards referencing this note via smart tags
                  const backlinkCount = allCards.filter((c) =>
                    c.reference_tag
                      ?.toLowerCase()
                      .startsWith(note.title.toLowerCase())
                  ).length;

                  return (
                    <div
                      key={note.id}
                      onClick={() => onSelectNote(note)}
                      className="group flex flex-col justify-between rounded-xl border border-stone-200/90 bg-white p-4 shadow-2xs hover:border-stone-300 hover:shadow-xs transition-all cursor-pointer"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-bold text-stone-900 group-hover:text-sky-700 transition-colors line-clamp-1">
                            {note.title || "Untitled Note"}
                          </h3>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => onDeleteNote(note.id, e)}
                              className="rounded p-1 text-stone-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 transition-all cursor-pointer"
                              title="Delete note"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                            <ArrowUpRight className="h-4 w-4 text-stone-400 group-hover:text-stone-700 transition-colors" />
                          </div>
                        </div>

                        <p className="mt-2 text-xs leading-relaxed text-stone-500 line-clamp-3">
                          {plainSnippet || "Empty markdown note..."}
                        </p>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-2.5 text-[11px] text-stone-400">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>{formatRelativeTimestamp(note.updated_at)}</span>
                        </span>

                        <div className="flex items-center gap-2">
                          {backlinkCount > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200/60">
                              <Tag className="h-2.5 w-2.5" />
                              <span>{backlinkCount} smart links</span>
                            </span>
                          )}
                          <span>{wordCount} words</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-200 bg-white px-6 py-14 text-center">
                <FilePlus2 className="h-8 w-8 text-stone-400 mb-2" />
                <h3 className="text-sm font-semibold text-stone-900">
                  No Notes Yet
                </h3>
                <p className="mt-1 mb-4 text-xs text-stone-500">
                  Create your first Markdown note to launch the split-pane editor.
                </p>
                <button
                  type="button"
                  onClick={onCreateNote}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-stone-800 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create Note</span>
                </button>
              </div>
            )}

            {/* Decks Overview Section */}
            <div className="pt-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FolderKanban className="h-4 w-4 text-stone-700" />
                  <h2 className="text-base font-bold text-stone-900">
                    Study Decks ({decks.length})
                  </h2>
                </div>
                <div className="flex items-center gap-3">
                  {onOpenDecksManagement && (
                    <button
                      type="button"
                      onClick={() => onOpenDecksManagement(null)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-stone-700 hover:text-stone-900 cursor-pointer"
                    >
                      <FolderKanban className="h-3.5 w-3.5" />
                      <span>Manage Decks &amp; Cards</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onOpenImportModal}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-900 cursor-pointer"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>Import JSON / CSV</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {decks.map((deck) => {
                  const deckCards = allCards.filter(
                    (c) => c.deck_id === deck.id
                  );
                  const deckDue = dueCards.filter((c) => c.deck_id === deck.id);
                  const isEditingThisDeck = editingDeckId === deck.id;

                  if (isEditingThisDeck) {
                    return (
                      <form
                        key={deck.id}
                        onSubmit={handleSaveEditDeck}
                        className="flex flex-col justify-between rounded-xl border-2 border-amber-400 bg-white p-4 space-y-2.5 shadow-2xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-amber-900">
                            Edit Deck
                          </span>
                          <button
                            type="button"
                            onClick={() => setEditingDeckId(null)}
                            className="rounded p-0.5 text-stone-400 hover:text-stone-700 cursor-pointer"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <input
                          type="text"
                          value={editDeckName}
                          onChange={(e) => setEditDeckName(e.target.value)}
                          placeholder="Deck name..."
                          className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-900 focus:border-stone-500 focus:outline-none"
                          autoFocus
                        />
                        <textarea
                          value={editDeckDescription}
                          onChange={(e) =>
                            setEditDeckDescription(e.target.value)
                          }
                          rows={2}
                          placeholder="Deck description..."
                          className="w-full resize-none rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-900 focus:border-stone-500 focus:outline-none"
                        />
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingDeckId(null)}
                            className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-600 hover:bg-stone-100 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="inline-flex items-center gap-1 rounded-lg bg-stone-900 px-3 py-1 text-[11px] font-semibold text-white hover:bg-stone-800 cursor-pointer"
                          >
                            <Check className="h-3 w-3" />
                            <span>Save</span>
                          </button>
                        </div>
                      </form>
                    );
                  }

                  return (
                    <div
                      key={deck.id}
                      className="flex flex-col justify-between rounded-xl border border-stone-200/90 bg-white p-4 shadow-2xs"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <h3 className="truncate text-sm font-bold text-stone-900">
                              {deck.name}
                            </h3>
                            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                              {deckDue.length} Due
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {onUpdateDeck && (
                              <button
                                type="button"
                                onClick={() => handleStartEditDeck(deck)}
                                className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-800 transition-colors cursor-pointer"
                                title={`Edit deck "${deck.name}"`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {onDeleteDeck && (
                              <button
                                type="button"
                                onClick={() => onDeleteDeck(deck.id)}
                                className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
                                title={`Delete deck "${deck.name}"`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-stone-500 line-clamp-2">
                          {deck.description || "Spaced repetition flashcard deck."}
                        </p>
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-2.5 text-xs">
                        <span className="text-[11px] font-medium text-stone-500">
                          {deckCards.length}{" "}
                          {deckCards.length === 1 ? "card" : "cards"} total
                        </span>
                        <div className="flex items-center gap-1.5">
                          {onOpenDecksManagement && (
                            <button
                              type="button"
                              onClick={() => onOpenDecksManagement(deck.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-[#FBFBFA] px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
                            >
                              <Layers className="h-3 w-3" />
                              <span>Manage Cards</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpenStudyMode(deck.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-stone-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-stone-800 transition-colors cursor-pointer"
                          >
                            <Play className="h-3 w-3 fill-current" />
                            <span>Study Deck</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Right Column: Recent Activity Feed */}
          <aside className="space-y-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-600" />
              <h2 className="text-base font-bold text-stone-900">
                Recent Activity
              </h2>
            </div>

            <div className="rounded-xl border border-stone-200/90 bg-white p-4 shadow-2xs">
              <ul className="divide-y divide-stone-100">
                {combinedActivity.map((item) => (
                  <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold text-stone-800">
                        {item.title}
                      </span>
                      <span className="shrink-0 text-[10px] text-stone-400">
                        {formatRelativeTimestamp(item.timestamp)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-stone-500">
                      {item.subtitle}
                    </p>
                  </li>
                ))}
              </ul>

              {allCards.length > 0 && (
                <div className="mt-4 border-t border-stone-100 pt-3">
                  <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-2">
                    Upcoming Schedule
                  </div>
                  <div className="space-y-1.5">
                    {allCards.slice(0, 3).map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between text-[11px] text-stone-600"
                      >
                        <span className="truncate max-w-[170px]">
                          Card #{c.id}: {c.front.replace(/[*`#]/g, "")}
                        </span>
                        <span className="font-medium text-stone-800">
                          {formatReviewDate(c.next_review)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default DashboardView;
