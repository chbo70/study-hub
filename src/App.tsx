import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Brain,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cpu,
  Eye,
  FilePlus2,
  FileText,
  FolderOpen,
  Gauge,
  Layers,
  Loader2,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import {
  calculateNextReview,
  createFlashcard,
  createNote,
  deleteFlashcard,
  deleteNote,
  fetchDueFlashcards,
  fetchFlashcards,
  fetchNotes,
  routeAgentTasks,
  updateNote,
} from "./api";
import { RichTextEditor } from "./components/RichTextEditor";
import { AgentTask, Flashcard, Note, RoutingDecision } from "./types";
import {
  formatCategoryLabel,
  formatComplexityLabel,
  formatEaseFactor,
  formatInterval,
  formatPipelineLabel,
  formatRelativeTimestamp,
  formatReviewDate,
  formatShortDate,
  sanitizeUiText,
} from "./utils/formatters";
import { TaskRouter } from "./utils/taskRouter";
import "./App.css";

type ActiveView = "editor" | "study" | "router";

const DEFAULT_AGENT_TASKS: AgentTask[] = [
  {
    id: "task-1",
    title: "Notion Sidebar & Layout",
    description:
      "Render clean React sidebar component and responsive Tailwind CSS layout",
  },
  {
    id: "task-2",
    title: "ProseMirror Block Editor",
    description:
      "Parse and serialize live Markdown formatting in the unified block editor",
  },
  {
    id: "task-3",
    title: "SQLite Schema & Persistence",
    description:
      "Initialize SQLite tables for notes and flashcards CRUD storage",
  },
  {
    id: "task-4",
    title: "Anki SM-2 Next Review Scheduler",
    description:
      "Calculate interval, ease factor, and next review date in Rust backend",
  },
];

function App() {
  const [activeView, setActiveView] = useState<ActiveView>("editor");

  // Notes state
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "idle">(
    "saved"
  );

  // Flashcards for the selected note
  const [noteFlashcards, setNoteFlashcards] = useState<Flashcard[]>([]);
  const [newFront, setNewFront] = useState("");
  const [newBack, setNewBack] = useState("");

  // Study Mode state (due flashcards)
  const [dueCards, setDueCards] = useState<Flashcard[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);

  // TaskRouter state
  const [tasks, setTasks] = useState<AgentTask[]>(DEFAULT_AGENT_TASKS);
  const [routingDecisions, setRoutingDecisions] = useState<RoutingDecision[]>(
    () => new TaskRouter().routeBatch(DEFAULT_AGENT_TASKS)
  );
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    try {
      const [loadedNotes, loadedDue, routed] = await Promise.all([
        fetchNotes(),
        fetchDueFlashcards(),
        routeAgentTasks(DEFAULT_AGENT_TASKS),
      ]);
      setNotes(loadedNotes);
      setDueCards(loadedDue);
      setRoutingDecisions(routed);

      if (loadedNotes.length > 0) {
        await selectNote(loadedNotes[0]);
      }
    } catch (err) {
      console.error("Failed to load initial data:", err);
    }
  }

  async function selectNote(note: Note) {
    setSelectedNoteId(note.id);
    setNoteTitle(note.title);
    setNoteContent(note.content);
    setSaveStatus("saved");
    try {
      const cards = await fetchFlashcards(note.id);
      setNoteFlashcards(cards);
    } catch (err) {
      console.error("Failed to load note flashcards:", err);
    }
  }

  async function handleCreateNote() {
    try {
      const created = await createNote(
        "Untitled Note",
        "# Untitled Note\n\nStart writing your study notes here..."
      );
      setNotes((prev) => [created, ...prev]);
      await selectNote(created);
      setActiveView("editor");
    } catch (err) {
      console.error("Failed to create note:", err);
    }
  }

  async function handleSaveNote(
    nextTitle = noteTitle,
    nextContent = noteContent
  ) {
    if (selectedNoteId === null) return;
    setSaveStatus("saving");
    try {
      const updated = await updateNote(selectedNoteId, nextTitle, nextContent);
      setNotes((prev) =>
        prev.map((n) => (n.id === updated.id ? updated : n))
      );
      setSaveStatus("saved");
    } catch (err) {
      console.error("Failed to update note:", err);
      setSaveStatus("idle");
    }
  }

  async function handleDeleteNote(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await deleteNote(id);
      const remaining = notes.filter((n) => n.id !== id);
      setNotes(remaining);
      if (selectedNoteId === id) {
        if (remaining.length > 0) {
          await selectNote(remaining[0]);
        } else {
          setSelectedNoteId(null);
          setNoteTitle("");
          setNoteContent("");
          setNoteFlashcards([]);
        }
      }
      const updatedDue = await fetchDueFlashcards();
      setDueCards(updatedDue);
    } catch (err) {
      console.error("Failed to delete note:", err);
    }
  }

  async function handleAddFlashcard(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedNoteId || !newFront.trim() || !newBack.trim()) return;
    try {
      const created = await createFlashcard(
        selectedNoteId,
        newFront.trim(),
        newBack.trim()
      );
      setNoteFlashcards((prev) => [...prev, created]);
      setNewFront("");
      setNewBack("");
      const updatedDue = await fetchDueFlashcards();
      setDueCards(updatedDue);
    } catch (err) {
      console.error("Failed to create flashcard:", err);
    }
  }

  async function handleDeleteFlashcard(id: number) {
    try {
      await deleteFlashcard(id);
      setNoteFlashcards((prev) => prev.filter((c) => c.id !== id));
      setDueCards((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error("Failed to delete flashcard:", err);
    }
  }

  async function openStudyMode() {
    setActiveView("study");
    setShowAnswer(false);
    setCurrentCardIndex(0);
    try {
      const due = await fetchDueFlashcards();
      setDueCards(due);
    } catch (err) {
      console.error("Failed to fetch due flashcards:", err);
    }
  }

  async function handleGradeCard(quality: number) {
    const currentCard = dueCards[currentCardIndex];
    if (!currentCard) return;

    try {
      await calculateNextReview({
        flashcardId: currentCard.id,
        interval: currentCard.interval,
        ease: currentCard.ease,
        repetitions: currentCard.repetitions,
        quality,
      });

      setReviewedCount((c) => c + 1);
      setShowAnswer(false);

      const refreshedDue = await fetchDueFlashcards();
      setDueCards(refreshedDue);
      if (currentCardIndex >= refreshedDue.length) {
        setCurrentCardIndex(0);
      }

      if (selectedNoteId) {
        const refreshedNoteCards = await fetchFlashcards(selectedNoteId);
        setNoteFlashcards(refreshedNoteCards);
      }
    } catch (err) {
      console.error("Failed to calculate next review:", err);
    }
  }

  async function handleAddAgentTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    const nextTask: AgentTask = {
      id: `task-${tasks.length + 1}`,
      title: newTaskTitle.trim(),
      description: newTaskDesc.trim(),
    };
    const nextTasks = [...tasks, nextTask];
    setTasks(nextTasks);
    setNewTaskTitle("");
    setNewTaskDesc("");
    const decisions = await routeAgentTasks(nextTasks);
    setRoutingDecisions(decisions);
  }

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
    );
  }, [notes, searchQuery]);

  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedNoteId) ?? null,
    [notes, selectedNoteId]
  );

  const activeStudyCard = dueCards[currentCardIndex] ?? null;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#FBFBFA] text-stone-800 antialiased">
      {/* Notion-Style Off-White Left Sidebar */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-stone-200/80 bg-[#F7F7F5] px-3 py-3.5 select-none">
        {/* Workspace Brand Header */}
        <div className="flex items-center gap-2.5 px-2.5 pb-3.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-900 text-white shadow-2xs">
            <BookOpen className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-stone-900">
              Study Hub
            </div>
            <div className="truncate text-[11px] font-medium text-stone-500">
              Notion + Anki Workspace
            </div>
          </div>
        </div>

        {/* Primary Sidebar Navigation */}
        <nav className="mb-4 flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setActiveView("editor")}
            className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
              activeView === "editor"
                ? "bg-stone-200/80 text-stone-900 font-semibold"
                : "text-stone-600 hover:bg-stone-200/50 hover:text-stone-900"
            }`}
          >
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-stone-500" />
              <span>Notes Workspace</span>
            </span>
            <span className="rounded-full bg-stone-200/90 px-2 py-0.5 text-[11px] font-semibold text-stone-700">
              {notes.length}
            </span>
          </button>

          <button
            type="button"
            onClick={openStudyMode}
            className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
              activeView === "study"
                ? "bg-stone-200/80 text-stone-900 font-semibold"
                : "text-stone-600 hover:bg-stone-200/50 hover:text-stone-900"
            }`}
          >
            <span className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-amber-600" />
              <span>Study Mode</span>
            </span>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 border border-amber-200/60">
              {dueCards.length} Due
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView("router")}
            className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
              activeView === "router"
                ? "bg-stone-200/80 text-stone-900 font-semibold"
                : "text-stone-600 hover:bg-stone-200/50 hover:text-stone-900"
            }`}
          >
            <span className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-sky-600" />
              <span>Task Router</span>
            </span>
            <span className="rounded-full bg-stone-200/90 px-2 py-0.5 text-[11px] font-semibold text-stone-700">
              {routingDecisions.length}
            </span>
          </button>
        </nav>

        {/* Pages Section Header */}
        <div className="mb-1.5 flex items-center justify-between px-2.5">
          <span className="text-[11px] font-semibold tracking-wider text-stone-400 uppercase">
            Pages
          </span>
          <button
            type="button"
            onClick={handleCreateNote}
            title="Create new note"
            className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-2 py-0.5 text-[11px] font-medium text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <Plus className="h-3 w-3" />
            <span>New</span>
          </button>
        </div>

        {/* Search Input with Lucide Icon */}
        <div className="mb-2 px-1">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-stone-400" />
            <input
              type="text"
              placeholder="Filter notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-stone-200/90 bg-white py-1.5 pr-7 pl-8 text-xs text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 text-stone-400 hover:text-stone-600 cursor-pointer"
                title="Clear filter"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Notes List with Icons & Human-Readable Relative Dates */}
        <ul className="flex-1 space-y-0.5 overflow-y-auto px-1">
          {filteredNotes.map((note) => {
            const isSelected =
              selectedNoteId === note.id && activeView === "editor";
            return (
              <li
                key={note.id}
                onClick={() => {
                  selectNote(note);
                  setActiveView("editor");
                }}
                className={`group flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-white text-stone-900 shadow-2xs ring-1 ring-stone-200/90 font-medium"
                    : "text-stone-600 hover:bg-stone-200/50 hover:text-stone-900"
                }`}
              >
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <FileText
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                      isSelected ? "text-stone-900" : "text-stone-400"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {note.title || "Untitled Note"}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-[10px] text-stone-400">
                      <Clock className="h-2.5 w-2.5" />
                      <span>{formatRelativeTimestamp(note.updated_at)}</span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => handleDeleteNote(note.id, e)}
                  title="Delete note"
                  className="rounded p-1 text-stone-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}

          {filteredNotes.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-stone-400">
              No matching notes found.
            </li>
          )}
        </ul>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-[#FBFBFA] px-8 py-6 lg:px-14">
        {activeView === "editor" && (
          <div className="mx-auto max-w-4xl">
            {selectedNoteId !== null ? (
              <>
                {/* Top Breadcrumb & Metadata Bar */}
                <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-stone-200/70 pb-3.5">
                  <div className="flex items-center gap-1.5 text-xs text-stone-500">
                    <FolderOpen className="h-3.5 w-3.5 text-stone-400" />
                    <span>Workspace</span>
                    <ChevronRight className="h-3.5 w-3.5 text-stone-400" />
                    <span className="font-semibold text-stone-800">
                      {noteTitle || "Untitled Note"}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-stone-500">
                    {selectedNote && (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-md bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-600"
                        title={`Created ${formatShortDate(selectedNote.created_at)}`}
                      >
                        <Clock className="h-3 w-3 text-stone-400" />
                        <span>
                          Edited {formatRelativeTimestamp(selectedNote.updated_at)}
                        </span>
                      </span>
                    )}

                    <span className="inline-flex items-center gap-1.5 rounded-md border border-stone-200/80 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-600">
                      {saveStatus === "saving" ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin text-amber-600" />
                          <span>Saving changes...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          <span>Synced to SQLite</span>
                        </>
                      )}
                    </span>
                  </div>
                </header>

                {/* Page Title Input */}
                <input
                  type="text"
                  value={noteTitle}
                  placeholder="Untitled page..."
                  onChange={(e) => setNoteTitle(e.target.value)}
                  onBlur={() => handleSaveNote(noteTitle, noteContent)}
                  className="mb-4 w-full bg-transparent text-3xl font-bold tracking-tight text-stone-900 placeholder:text-stone-300 focus:outline-none"
                />

                {/* Single Seamless Block-Based Rich-Text Editor (ProseMirror) */}
                <div className="mb-10">
                  <RichTextEditor
                    noteId={selectedNoteId}
                    markdown={noteContent}
                    saveStatus={saveStatus}
                    onChange={(nextMarkdown) => setNoteContent(nextMarkdown)}
                    onSave={(nextMarkdown) =>
                      handleSaveNote(noteTitle, nextMarkdown ?? noteContent)
                    }
                  />
                </div>

                {/* Linked Anki Flashcards Panel */}
                <section className="rounded-xl border border-stone-200/80 bg-[#F7F7F5]/70 p-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900 text-white">
                        <Layers className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-stone-900">
                          Linked Anki Flashcards ({noteFlashcards.length})
                        </h3>
                        <p className="text-xs text-stone-500">
                          Spaced repetition cards anchored to this note
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={openStudyMode}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-stone-800 transition-colors cursor-pointer"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                      <span>Review Due Cards ({dueCards.length})</span>
                    </button>
                  </div>

                  <form
                    onSubmit={handleAddFlashcard}
                    className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_1fr_auto]"
                  >
                    <input
                      type="text"
                      placeholder="Front (Question or Prompt)..."
                      value={newFront}
                      onChange={(e) => setNewFront(e.target.value)}
                      className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Back (Answer or Explanation)..."
                      value={newBack}
                      onChange={(e) => setNewBack(e.target.value)}
                      className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100 transition-colors cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add Card</span>
                    </button>
                  </form>

                  {noteFlashcards.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {noteFlashcards.map((card) => (
                        <div
                          key={card.id}
                          className="flex flex-col justify-between rounded-xl border border-stone-200/90 bg-white p-4 shadow-2xs"
                        >
                          <div className="space-y-2">
                            <div className="text-xs font-semibold text-stone-900">
                              <span className="mr-1.5 inline-block rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold text-stone-600 uppercase">
                                Prompt
                              </span>
                              {sanitizeUiText(card.front)}
                            </div>
                            <div className="text-xs leading-relaxed text-stone-600">
                              <span className="mr-1.5 inline-block rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 uppercase">
                                Answer
                              </span>
                              {sanitizeUiText(card.back)}
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-2.5 text-[11px] text-stone-500">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <span className="inline-flex items-center gap-1">
                                <Repeat className="h-3 w-3 text-stone-400" />
                                <span>{formatInterval(card.interval)}</span>
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Gauge className="h-3 w-3 text-stone-400" />
                                <span>Ease {formatEaseFactor(card.ease)}</span>
                              </span>
                              <span className="inline-flex items-center gap-1 font-medium text-stone-700">
                                <Calendar className="h-3 w-3 text-stone-400" />
                                <span>Due {formatReviewDate(card.next_review)}</span>
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleDeleteFlashcard(card.id)}
                              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                              title="Delete flashcard"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-stone-200 bg-white/60 py-8 text-center text-xs text-stone-400">
                      No flashcards linked to this note yet. Add a prompt and
                      answer above to start spaced repetition.
                    </div>
                  )}
                </section>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-stone-200/80 bg-white px-8 py-20 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-stone-100 text-stone-600">
                  <FilePlus2 className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-semibold text-stone-900">
                  No Note Selected
                </h2>
                <p className="mt-1 mb-5 max-w-sm text-xs text-stone-500">
                  Select a page from the sidebar or create a new block-based
                  study note to begin.
                </p>
                <button
                  type="button"
                  onClick={handleCreateNote}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800 transition-colors cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create First Note</span>
                </button>
              </div>
            )}
          </div>
        )}

        {activeView === "study" && (
          <div className="mx-auto max-w-2xl">
            <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-stone-200/80 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                  <Brain className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-stone-900">
                    Anki Study Session (SM-2 Scheduler)
                  </h2>
                  <p className="text-xs text-stone-500">
                    Due today:{" "}
                    <strong className="text-stone-800">{dueCards.length}</strong>{" "}
                    • Reviewed this session:{" "}
                    <strong className="text-stone-800">{reviewedCount}</strong>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveView("editor")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to Notes</span>
              </button>
            </header>

            {activeStudyCard ? (
              <div className="rounded-2xl border border-stone-200/90 bg-white p-7 shadow-2xs">
                <div className="mb-6 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                  <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 font-medium text-stone-700">
                    <Tag className="h-3 w-3 text-stone-400" />
                    <span>Card #{activeStudyCard.id}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 font-medium text-stone-700">
                    <Repeat className="h-3 w-3 text-stone-400" />
                    <span>Interval: {formatInterval(activeStudyCard.interval)}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 font-medium text-stone-700">
                    <Gauge className="h-3 w-3 text-stone-400" />
                    <span>Ease: {formatEaseFactor(activeStudyCard.ease)}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-800 border border-amber-200/60">
                    <Calendar className="h-3 w-3 text-amber-600" />
                    <span>Scheduled: {formatReviewDate(activeStudyCard.next_review)}</span>
                  </span>
                </div>

                <div className="mb-6">
                  <span className="mb-2 inline-block rounded bg-stone-100 px-2 py-0.5 text-[10px] font-bold tracking-wider text-stone-600 uppercase">
                    Prompt
                  </span>
                  <h3 className="text-xl font-semibold leading-snug text-stone-900">
                    {sanitizeUiText(activeStudyCard.front)}
                  </h3>
                </div>

                {showAnswer ? (
                  <>
                    <div className="mb-7 border-t border-stone-200/80 pt-5">
                      <span className="mb-2 inline-block rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold tracking-wider text-emerald-700 uppercase">
                        Answer
                      </span>
                      <p className="text-base leading-relaxed text-stone-700">
                        {sanitizeUiText(activeStudyCard.back)}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      <button
                        type="button"
                        onClick={() => handleGradeCard(1)}
                        className="flex flex-col items-center rounded-xl border border-red-200 bg-red-50/70 p-3 text-red-700 hover:bg-red-100/80 transition-colors cursor-pointer"
                      >
                        <RotateCcw className="mb-1 h-4 w-4" />
                        <strong className="text-xs">Again</strong>
                        <span className="mt-0.5 text-[11px] text-red-600/80">
                          Reset (1 day)
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleGradeCard(3)}
                        className="flex flex-col items-center rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-amber-800 hover:bg-amber-100/80 transition-colors cursor-pointer"
                      >
                        <AlertCircle className="mb-1 h-4 w-4" />
                        <strong className="text-xs">Hard</strong>
                        <span className="mt-0.5 text-[11px] text-amber-700/80">
                          1.2× interval
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleGradeCard(4)}
                        className="flex flex-col items-center rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-emerald-800 hover:bg-emerald-100/80 transition-colors cursor-pointer"
                      >
                        <CheckCircle2 className="mb-1 h-4 w-4" />
                        <strong className="text-xs">Good</strong>
                        <span className="mt-0.5 text-[11px] text-emerald-700/80">
                          {activeStudyCard.ease.toFixed(1)}× interval
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleGradeCard(5)}
                        className="flex flex-col items-center rounded-xl border border-sky-200 bg-sky-50/70 p-3 text-sky-800 hover:bg-sky-100/80 transition-colors cursor-pointer"
                      >
                        <Zap className="mb-1 h-4 w-4" />
                        <strong className="text-xs">Easy</strong>
                        <span className="mt-0.5 text-[11px] text-sky-700/80">
                          Bonus interval
                        </span>
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAnswer(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 py-3 text-sm font-semibold text-white hover:bg-stone-800 transition-colors cursor-pointer"
                  >
                    <Eye className="h-4 w-4" />
                    <span>Show Answer</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-stone-200/90 bg-white px-8 py-16 text-center shadow-2xs">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <Sparkles className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-stone-900">
                  All Caught Up!
                </h3>
                <p className="mt-1 mb-6 max-w-md text-xs leading-relaxed text-stone-500">
                  No flashcards are currently due for review. Add more cards in
                  the Notes Workspace or return on your next scheduled review
                  date.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveView("editor")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Return to Notes</span>
                </button>
              </div>
            )}
          </div>
        )}

        {activeView === "router" && (
          <div className="mx-auto max-w-3xl">
            <header className="mb-6 flex items-start gap-3 border-b border-stone-200/80 pb-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-800">
                <Cpu className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-stone-900">
                  Multi-Model Task Router
                </h2>
                <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
                  Statically evaluates task complexity and routes UI and
                  Markdown tasks to the{" "}
                  <strong className="text-stone-800">Lightweight Pipeline</strong>{" "}
                  and Rust backend, SQLite persistence, and Anki scheduling
                  tasks to the{" "}
                  <strong className="text-stone-800">Reasoning Pipeline</strong>.
                </p>
              </div>
            </header>

            <form
              onSubmit={handleAddAgentTask}
              className="mb-6 grid grid-cols-1 gap-2.5 rounded-xl border border-stone-200/80 bg-[#F7F7F5] p-3.5 sm:grid-cols-[1fr_1fr_auto]"
            >
              <input
                type="text"
                placeholder="Task title (e.g., Implement FSRS decay)..."
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none"
              />
              <input
                type="text"
                placeholder="Task description..."
                value={newTaskDesc}
                onChange={(e) => setNewTaskDesc(e.target.value)}
                className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800 transition-colors cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Route Task</span>
              </button>
            </form>

            <div className="space-y-3">
              {routingDecisions.map((d) => {
                const isReasoning = d.pipeline === "reasoning";
                return (
                  <div
                    key={d.task_id}
                    className="rounded-xl border border-stone-200/90 bg-white p-4 shadow-2xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Cpu
                          className={`h-4 w-4 ${
                            isReasoning ? "text-sky-600" : "text-emerald-600"
                          }`}
                        />
                        <strong className="text-sm font-semibold text-stone-900">
                          {sanitizeUiText(d.title)}
                        </strong>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-stone-100 px-2.5 py-0.5 text-[11px] font-medium text-stone-700">
                          <Tag className="h-2.5 w-2.5 text-stone-500" />
                          <span>{formatCategoryLabel(d.category)}</span>
                        </span>

                        <span className="inline-flex items-center rounded-full border border-stone-200 bg-stone-50 px-2.5 py-0.5 text-[11px] font-medium text-stone-600">
                          {formatComplexityLabel(d.complexity)}
                        </span>

                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            isReasoning
                              ? "border border-sky-200 bg-sky-50 text-sky-800"
                              : "border border-emerald-200 bg-emerald-50 text-emerald-800"
                          }`}
                        >
                          <Sparkles className="h-2.5 w-2.5" />
                          <span>{formatPipelineLabel(d.pipeline)}</span>
                        </span>
                      </div>
                    </div>

                    <p className="mt-2 text-xs leading-relaxed text-stone-600">
                      {sanitizeUiText(d.rationale)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
