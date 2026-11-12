import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Brain,
  ChevronRight,
  Cpu,
  FilePlus2,
  FileText,
  FolderKanban,
  FolderOpen,
  LayoutDashboard,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Sparkles,
  Tag,
  Upload,
  X,
} from "lucide-react";
import {
  calculateNextReview,
  createDeck,
  createFlashcard,
  createFolder,
  createNote,
  deleteDeck,
  deleteFlashcard,
  deleteFolder,
  deleteNote,
  fetchDecks,
  fetchDueFlashcards,
  fetchFlashcards,
  fetchFolders,
  fetchNotes,
  importDeck,
  moveNoteToFolder,
  routeAgentTasks,
  updateDeck,
  updateFlashcard,
  updateNote,
  type CreateFlashcardInput,
  type UpdateFlashcardInput,
} from "./api";
import {
  DashboardView,
  type ActivityEvent,
} from "./components/DashboardView";
import { DeckImportModal } from "./components/DeckImportModal";
import { DecksManagementView } from "./components/DecksManagementView";
import { FileTreeSidebar } from "./components/FileTreeSidebar";
import { FlashcardCreationModal } from "./components/FlashcardCreationModal";
import { SettingsView } from "./components/SettingsView";
import { SplitMarkdownWorkspace } from "./components/SplitMarkdownWorkspace";
import { StudyCardStack } from "./components/StudyCardStack";
import type {
  AgentTask,
  AiProviderSettings,
  Deck,
  Flashcard,
  Folder,
  GeneratedCardDraft,
  Note,
  RoutingDecision,
} from "./types";
import {
  generateFlashcardsFromNote,
  loadAiProviderSettings,
  saveAiProviderSettings,
} from "./utils/flashcardGenerator";
import {
  formatCategoryLabel,
  formatComplexityLabel,
  formatPipelineLabel,
  sanitizeUiText,
} from "./utils/formatters";
import { TaskRouter } from "./utils/taskRouter";
import "./App.css";

type ActiveView =
  | "dashboard"
  | "editor"
  | "decks"
  | "study"
  | "router"
  | "settings";

const DEFAULT_AGENT_TASKS: AgentTask[] = [
  {
    id: "task-1",
    title: "Collapsible File-Tree Sidebar & Drag-and-Drop Directories",
    description:
      "Render nested directory structure with React drag-and-drop note organization in the Markdown workspace UI",
  },
  {
    id: "task-2",
    title: "SQLite Folders Schema & Foreign Key Migration",
    description:
      "Create folders table with parent_id nesting and migrate notes table with folder_id foreign key in rusqlite",
  },
  {
    id: "task-3",
    title: "Tauri save_image Command & studyhub:// Custom Protocol",
    description:
      "Save clipboard base64 and file path images in Rust backend to study-hub-data/images and serve via custom protocol",
  },
  {
    id: "task-4",
    title: "Automated Flashcard Generation & SM-2 Review Pipeline",
    description:
      "Parse Markdown clozes and bolded questions or route to Gemini model and schedule reviews with Anki SM-2 interval logic",
  },
];

function App() {
  const [activeView, setActiveView] = useState<ActiveView>("editor");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Folders & Notes state (Phase 1)
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [highlightedHeader, setHighlightedHeader] = useState<string | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "idle">(
    "saved"
  );

  // Decks & Flashcards state
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<number | null>(null);
  const [allCards, setAllCards] = useState<Flashcard[]>([]);
  const [dueCards, setDueCards] = useState<Flashcard[]>([]);
  const [reviewedCount, setReviewedCount] = useState(0);

  // Phase 3: Automated Flashcard Generation & AI Settings state
  const [aiSettings, setAiSettings] = useState<AiProviderSettings>(() =>
    loadAiProviderSettings()
  );
  const [generatedCardDrafts, setGeneratedCardDrafts] = useState<
    GeneratedCardDraft[]
  >([]);
  const [isGeneratingCards, setIsGeneratingCards] = useState(false);

  // Modals state
  const [isCreateCardModalOpen, setIsCreateCardModalOpen] = useState(false);
  const [editingCardForModal, setEditingCardForModal] =
    useState<Flashcard | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Recent activity log for Dashboard
  const [recentActivity, setRecentActivity] = useState<ActivityEvent[]>([]);

  // TaskRouter state
  const [tasks, setTasks] = useState<AgentTask[]>(DEFAULT_AGENT_TASKS);
  const [routingDecisions, setRoutingDecisions] = useState<RoutingDecision[]>(
    () => new TaskRouter().routeBatch(DEFAULT_AGENT_TASKS)
  );
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");

  const pushActivity = useCallback(
    (type: ActivityEvent["type"], title: string, subtitle: string) => {
      setRecentActivity((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type,
          title,
          subtitle,
          timestamp: new Date().toISOString(),
        },
        ...prev.slice(0, 14),
      ]);
    },
    []
  );

  const refreshDecksAndCards = useCallback(
    async (deckFilterId: number | null = selectedDeckId) => {
      const [loadedDecks, loadedAllCards, loadedDue] = await Promise.all([
        fetchDecks(),
        fetchFlashcards(),
        fetchDueFlashcards(deckFilterId ?? undefined),
      ]);
      setDecks(loadedDecks);
      setAllCards(loadedAllCards);
      setDueCards(loadedDue);
    },
    [selectedDeckId]
  );

  useEffect(() => {
    async function loadInitialData() {
      try {
        const [
          loadedFolders,
          loadedNotes,
          loadedDecks,
          loadedAllCards,
          loadedDue,
          routed,
        ] = await Promise.all([
          fetchFolders(),
          fetchNotes(),
          fetchDecks(),
          fetchFlashcards(),
          fetchDueFlashcards(),
          routeAgentTasks(DEFAULT_AGENT_TASKS),
        ]);
        setFolders(loadedFolders);
        setNotes(loadedNotes);
        setDecks(loadedDecks);
        setAllCards(loadedAllCards);
        setDueCards(loadedDue);
        setRoutingDecisions(routed);

        if (loadedNotes.length > 0) {
          const first = loadedNotes[0];
          setSelectedNoteId(first.id);
          setSelectedFolderId(first.folder_id ?? null);
          setNoteTitle(first.title);
          setNoteContent(first.content);
        }
      } catch (err) {
        console.error("Failed to load initial data:", err);
      }
    }
    loadInitialData();
  }, []);

  const handleUpdateAiSettings = useCallback((next: AiProviderSettings) => {
    setAiSettings(next);
    saveAiProviderSettings(next);
  }, []);

  const selectNote = useCallback(
    (note: Note, targetHeader: string | null = null) => {
      setSelectedNoteId(note.id);
      setSelectedFolderId(note.folder_id ?? null);
      setNoteTitle(note.title);
      setNoteContent(note.content);
      setHighlightedHeader(targetHeader);
      setSaveStatus("saved");
      setActiveView("editor");
    },
    []
  );

  // Phase 1: Folder CRUD & Note Directory Movement
  const handleCreateFolder = useCallback(
    async (name: string, parentId: number | null): Promise<Folder> => {
      const created = await createFolder(name, parentId);
      setFolders((prev) => [...prev, created]);
      pushActivity(
        "note",
        `Created folder "${created.name}"`,
        parentId ? "Nested subdirectory created" : "Root directory created"
      );
      return created;
    },
    [pushActivity]
  );

  const handleDeleteFolder = useCallback(
    async (folderId: number, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        const target = folders.find((f) => f.id === folderId);
        await deleteFolder(folderId);
        const [reloadedFolders, reloadedNotes] = await Promise.all([
          fetchFolders(),
          fetchNotes(),
        ]);
        setFolders(reloadedFolders);
        setNotes(reloadedNotes);
        if (selectedFolderId === folderId) {
          setSelectedFolderId(null);
        }
        if (target) {
          pushActivity(
            "note",
            `Deleted folder "${target.name}"`,
            "Notes moved to root directory"
          );
        }
      } catch (err) {
        console.error("Failed to delete folder:", err);
      }
    },
    [folders, pushActivity, selectedFolderId]
  );

  const handleMoveNoteToFolder = useCallback(
    async (noteId: number, folderId: number | null) => {
      try {
        const updated = await moveNoteToFolder(noteId, folderId);
        setNotes((prev) =>
          prev.map((n) => (n.id === updated.id ? updated : n))
        );
        if (selectedNoteId === noteId) {
          setSelectedFolderId(folderId);
        }
        const folderName =
          folderId === null
            ? "Root Directory"
            : folders.find((f) => f.id === folderId)?.name ?? "Folder";
        pushActivity(
          "note",
          `Moved "${updated.title}"`,
          `Moved to ${folderName}`
        );
      } catch (err) {
        console.error("Failed to move note to folder:", err);
      }
    },
    [folders, pushActivity, selectedNoteId]
  );

  const handleCreateNote = useCallback(
    async (folderId: number | null = selectedFolderId) => {
      try {
        const targetFolderId =
          typeof folderId === "number" ? folderId : selectedFolderId;
        const created = await createNote(
          "Untitled Note",
          "# Untitled Note\n\nWrite in **Markdown** on the left and preview live on the right.\n\n## Key Highlights\n- :emerald[**Active Concept**]: Use colored directives or `{{c1::cloze deletions}}` to generate flashcards automatically.\n\n**Q:** How do you embed local images in Study Hub v3?\n**A:** Paste or drag-and-drop an image directly into the raw Markdown editor to save via `save_image` and insert `![image](studyhub://...)`.",
          targetFolderId
        );
        setNotes((prev) => [created, ...prev]);
        selectNote(created);
        pushActivity(
          "note",
          `Created "${created.title}"`,
          targetFolderId
            ? `Created in folder #${targetFolderId}`
            : "Created in root directory"
        );
      } catch (err) {
        console.error("Failed to create note:", err);
      }
    },
    [pushActivity, selectNote, selectedFolderId]
  );

  const handleSaveNote = useCallback(
    async (nextTitle = noteTitle, nextContent = noteContent) => {
      if (selectedNoteId === null) return;
      setSaveStatus("saving");
      try {
        const currentNote = notes.find((n) => n.id === selectedNoteId);
        const updated = await updateNote(
          selectedNoteId,
          nextTitle,
          nextContent,
          currentNote?.folder_id ?? null
        );
        setNotes((prev) =>
          prev.map((n) => (n.id === updated.id ? updated : n))
        );
        setSaveStatus("saved");
      } catch (err) {
        console.error("Failed to update note:", err);
        setSaveStatus("idle");
      }
    },
    [noteContent, noteTitle, notes, selectedNoteId]
  );

  const handleDeleteNote = useCallback(
    async (id: number, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        const target = notes.find((n) => n.id === id);
        await deleteNote(id);
        const remaining = notes.filter((n) => n.id !== id);
        setNotes(remaining);
        if (selectedNoteId === id) {
          if (remaining.length > 0) {
            selectNote(remaining[0]);
          } else {
            setSelectedNoteId(null);
            setNoteTitle("");
            setNoteContent("");
          }
        }
        if (target) {
          pushActivity(
            "note",
            `Deleted "${target.title}"`,
            "Removed from SQLite"
          );
        }
      } catch (err) {
        console.error("Failed to delete note:", err);
      }
    },
    [notes, pushActivity, selectNote, selectedNoteId]
  );

  // Phase 3: Automated Flashcard Generation -> Review Pipeline in FlashcardCreationModal
  const handleGenerateFlashcards = useCallback(async () => {
    if (!noteContent.trim() || isGeneratingCards) return;
    setIsGeneratingCards(true);
    try {
      const drafts = await generateFlashcardsFromNote(
        noteTitle || "Untitled Note",
        noteContent,
        aiSettings
      );
      setGeneratedCardDrafts(drafts);
      setIsCreateCardModalOpen(true);
      pushActivity(
        "card",
        `Generated ${drafts.length} flashcard drafts`,
        `Loaded into Review Modal via ${
          aiSettings.provider === "gemini" && aiSettings.geminiConnected
            ? `Google Gemini (${aiSettings.geminiModel})`
            : aiSettings.provider === "ollama"
              ? `Ollama (${aiSettings.ollamaModel})`
              : "Markdown Syntax Parser"
        }`
      );
    } catch (err) {
      console.error("Failed to generate flashcards from note:", err);
    } finally {
      setIsGeneratingCards(false);
    }
  }, [aiSettings, isGeneratingCards, noteContent, noteTitle, pushActivity]);

  const openStudyMode = useCallback(
    async (deckId?: number) => {
      const resolvedDeck = deckId !== undefined ? deckId : selectedDeckId;
      setSelectedDeckId(resolvedDeck ?? null);
      setActiveView("study");
      try {
        const due = await fetchDueFlashcards(resolvedDeck ?? undefined);
        setDueCards(due);
      } catch (err) {
        console.error("Failed to fetch due flashcards:", err);
      }
    },
    [selectedDeckId]
  );

  const handleSelectDeckFilter = useCallback(async (deckId: number | null) => {
    setSelectedDeckId(deckId);
    try {
      const due = await fetchDueFlashcards(deckId ?? undefined);
      setDueCards(due);
    } catch (err) {
      console.error("Failed to filter due cards by deck:", err);
    }
  }, []);

  const handleCreateDeck = useCallback(
    async (name: string, description: string): Promise<Deck> => {
      const created = await createDeck(name, description);
      setDecks((prev) => [...prev, created]);
      pushActivity("deck", `Created deck "${created.name}"`, description);
      return created;
    },
    [pushActivity]
  );

  const handleUpdateDeck = useCallback(
    async (id: number, name: string, description: string): Promise<Deck> => {
      const updated = await updateDeck(id, name, description);
      setDecks((prev) => prev.map((d) => (d.id === id ? updated : d)));
      pushActivity(
        "deck",
        `Updated deck "${updated.name}"`,
        description || "Deck metadata updated"
      );
      return updated;
    },
    [pushActivity]
  );

  const handleDeleteDeck = useCallback(
    async (id: number) => {
      const target = decks.find((d) => d.id === id);
      await deleteDeck(id);
      const nextDeckId = selectedDeckId === id ? null : selectedDeckId;
      setSelectedDeckId(nextDeckId);
      await refreshDecksAndCards(nextDeckId);
      if (target) {
        pushActivity(
          "deck",
          `Deleted deck "${target.name}"`,
          "Removed deck and associated flashcards"
        );
      }
    },
    [decks, pushActivity, refreshDecksAndCards, selectedDeckId]
  );

  const handleCreateCardFromModal = useCallback(
    async (input: CreateFlashcardInput) => {
      const created = await createFlashcard(input);
      await refreshDecksAndCards(selectedDeckId);
      pushActivity(
        "card",
        `Added ${created.card_type.replace("_", " ")} card #${created.id}`,
        created.reference_tag
          ? `Smart link: ${created.reference_tag}`
          : "Committed via Flashcard Review Modal"
      );
    },
    [pushActivity, refreshDecksAndCards, selectedDeckId]
  );

  const handleUpdateFlashcard = useCallback(
    async (input: UpdateFlashcardInput): Promise<Flashcard> => {
      const updated = await updateFlashcard(input);
      await refreshDecksAndCards(selectedDeckId);
      pushActivity(
        "card",
        `Edited card #${updated.id}`,
        updated.reference_tag
          ? `Smart link: ${updated.reference_tag}`
          : `Updated ${updated.card_type.replace("_", " ")} flashcard`
      );
      return updated;
    },
    [pushActivity, refreshDecksAndCards, selectedDeckId]
  );

  const handleImportDeck = useCallback(
    async (params: {
      payload: string;
      deckName?: string;
      deckDescription?: string;
      format?: "json" | "csv";
    }): Promise<number> => {
      const result = await importDeck(params);
      setSelectedDeckId(result.deck.id);
      await refreshDecksAndCards(result.deck.id);
      pushActivity(
        "deck",
        `Imported "${result.deck.name}"`,
        `${result.imported_count} cards imported via import_deck`
      );
      return result.imported_count;
    },
    [pushActivity, refreshDecksAndCards]
  );

  const handleGradeCard = useCallback(
    async (card: Flashcard, quality: number) => {
      try {
        await calculateNextReview({
          flashcardId: card.id,
          interval: card.interval,
          ease: card.ease,
          repetitions: card.repetitions,
          quality,
        });

        setReviewedCount((c) => c + 1);
        pushActivity(
          "review",
          `Reviewed Card #${card.id} (Grade ${quality})`,
          quality < 3
            ? "Shuffled to back of deck (1d reset)"
            : "Scheduled next SM-2 interval"
        );

        const refreshedAll = await fetchFlashcards();
        setAllCards(refreshedAll);

        setDueCards((prev) => {
          const rest = prev.filter((c) => c.id !== card.id);
          if (quality < 3) {
            const updatedCard =
              refreshedAll.find((c) => c.id === card.id) ?? card;
            return [...rest, updatedCard];
          }
          return rest;
        });
      } catch (err) {
        console.error("Failed to calculate next review:", err);
      }
    },
    [pushActivity]
  );

  const handleDeleteFlashcard = useCallback(async (id: number) => {
    try {
      await deleteFlashcard(id);
      setAllCards((prev) => prev.filter((c) => c.id !== id));
      setDueCards((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error("Failed to delete flashcard:", err);
    }
  }, []);

  // Smart Tag (`reference_tag`) navigation: e.g. "Spaced Repetition & Memory Systems#Core Concepts"
  const handleNavigateReferenceTag = useCallback(
    (referenceTag: string) => {
      const cleaned = referenceTag.replace(/^\[\[|\]\]$/g, "").trim();
      const [rawNotePart, rawHeaderPart] = cleaned.split("#");
      const noteQuery = (rawNotePart || "")
        .replace(/^@|^#/, "")
        .trim()
        .toLowerCase();
      const headerTarget = rawHeaderPart ? rawHeaderPart.trim() : null;

      const matchedNote =
        notes.find((n) => n.title.toLowerCase() === noteQuery) ??
        notes.find((n) => n.title.toLowerCase().includes(noteQuery)) ??
        notes[0];

      if (matchedNote) {
        selectNote(matchedNote, headerTarget);
      }
    },
    [notes, selectNote]
  );

  const handleAddAgentTask = useCallback(
    async (e: React.FormEvent) => {
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
    },
    [newTaskDesc, newTaskTitle, tasks]
  );

  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedNoteId) ?? null,
    [notes, selectedNoteId]
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#FBFBFA] text-stone-800 antialiased">
      {/* Collapsible Left Sidebar Navigation & Nested File-Tree */}
      {!isSidebarCollapsed ? (
        <aside className="flex w-76 shrink-0 flex-col border-r border-stone-200/80 bg-[#F7F7F5] px-3 py-3.5 select-none">
          {/* Functional Home Button Logo + Collapse Button */}
          <div className="mb-3 flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={() => setActiveView("dashboard")}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-stone-200/60 transition-colors cursor-pointer group"
              title="Return to Study Hub Dashboard"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-900 text-white shadow-2xs group-hover:bg-stone-800 transition-colors">
                <BookOpen className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-stone-900">
                  Study Hub v3
                </div>
                <div className="truncate text-[11px] font-medium text-stone-500">
                  Folders • Media • AI Cards
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setIsSidebarCollapsed(true)}
              className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-200/70 hover:text-stone-800 transition-colors cursor-pointer"
              title="Collapse File-Tree Sidebar"
              aria-label="Collapse File-Tree Sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>

          {/* Primary Sidebar Navigation */}
          <nav className="mb-3.5 flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => setActiveView("dashboard")}
              className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                activeView === "dashboard"
                  ? "bg-stone-200/80 text-stone-900 font-semibold"
                  : "text-stone-600 hover:bg-stone-200/50 hover:text-stone-900"
              }`}
            >
              <span className="flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4 text-stone-500" />
                <span>Workspace Dashboard</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView("editor")}
              className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                activeView === "editor"
                  ? "bg-stone-200/80 text-stone-900 font-semibold"
                  : "text-stone-600 hover:bg-stone-200/50 hover:text-stone-900"
              }`}
            >
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-600" />
                <span>Notes Workspace</span>
              </span>
              <span className="rounded-full bg-stone-200/90 px-2 py-0.5 text-[10px] font-semibold text-stone-700">
                {folders.length}F • {notes.length}N
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView("decks")}
              className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                activeView === "decks"
                  ? "bg-stone-200/80 text-stone-900 font-semibold"
                  : "text-stone-600 hover:bg-stone-200/50 hover:text-stone-900"
              }`}
            >
              <span className="flex items-center gap-2">
                <FolderKanban className="h-4 w-4 text-sky-600" />
                <span>Decks Management</span>
              </span>
              <span className="rounded-full bg-stone-200/90 px-2 py-0.5 text-[10px] font-semibold text-stone-700">
                {decks.length}D • {allCards.length}C
              </span>
            </button>

            <button
              type="button"
              onClick={() => openStudyMode()}
              className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                activeView === "study"
                  ? "bg-stone-200/80 text-stone-900 font-semibold"
                  : "text-stone-600 hover:bg-stone-200/50 hover:text-stone-900"
              }`}
            >
              <span className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-amber-600" />
                <span>Study Mode</span>
              </span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200/60">
                {dueCards.length} Due
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView("router")}
              className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                activeView === "router"
                  ? "bg-stone-200/80 text-stone-900 font-semibold"
                  : "text-stone-600 hover:bg-stone-200/50 hover:text-stone-900"
              }`}
            >
              <span className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-sky-600" />
                <span>Task Router</span>
              </span>
              <span className="rounded-full bg-stone-200/90 px-2 py-0.5 text-[10px] font-semibold text-stone-700">
                {routingDecisions.length}
              </span>
            </button>

            {/* Phase 3: Settings Menu Point (Gemini Login & AI Model Connection) */}
            <button
              type="button"
              onClick={() => setActiveView("settings")}
              className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                activeView === "settings"
                  ? "bg-stone-200/80 text-stone-900 font-semibold"
                  : "text-stone-600 hover:bg-stone-200/50 hover:text-stone-900"
              }`}
            >
              <span className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-violet-600" />
                <span>Settings &amp; Gemini AI</span>
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  aiSettings.geminiConnected
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-200/70"
                    : "bg-stone-200/80 text-stone-600"
                }`}
              >
                {aiSettings.geminiConnected ? "Gemini" : aiSettings.provider}
              </span>
            </button>
          </nav>

          {/* Phase 1: Collapsible Nested File-Tree Directory Sidebar */}
          <FileTreeSidebar
            folders={folders}
            notes={notes}
            selectedNoteId={selectedNoteId}
            selectedFolderId={selectedFolderId}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSelectNote={(note) => selectNote(note)}
            onSelectFolder={(fid) => setSelectedFolderId(fid)}
            onCreateNote={(fid) => handleCreateNote(fid)}
            onDeleteNote={handleDeleteNote}
            onCreateFolder={handleCreateFolder}
            onDeleteFolder={handleDeleteFolder}
            onMoveNoteToFolder={handleMoveNoteToFolder}
          />
        </aside>
      ) : (
        /* Collapsed Slim Rail */
        <aside className="flex w-13 shrink-0 flex-col items-center border-r border-stone-200/80 bg-[#F7F7F5] py-3.5 gap-2 select-none">
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-900 text-white hover:bg-stone-800 transition-colors cursor-pointer"
            title="Expand File-Tree Sidebar"
            aria-label="Expand File-Tree Sidebar"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setActiveView("dashboard")}
            className={`rounded-lg p-2 transition-colors cursor-pointer ${
              activeView === "dashboard"
                ? "bg-stone-200 text-stone-900"
                : "text-stone-500 hover:bg-stone-200/60"
            }`}
            title="Workspace Dashboard"
          >
            <LayoutDashboard className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setActiveView("editor")}
            className={`rounded-lg p-2 transition-colors cursor-pointer ${
              activeView === "editor"
                ? "bg-stone-200 text-emerald-700"
                : "text-stone-500 hover:bg-stone-200/60"
            }`}
            title="Notes Workspace"
          >
            <FileText className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setActiveView("decks")}
            className={`rounded-lg p-2 transition-colors cursor-pointer ${
              activeView === "decks"
                ? "bg-stone-200 text-sky-700"
                : "text-stone-500 hover:bg-stone-200/60"
            }`}
            title="Decks Management"
          >
            <FolderKanban className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => openStudyMode()}
            className={`rounded-lg p-2 transition-colors cursor-pointer ${
              activeView === "study"
                ? "bg-stone-200 text-amber-700"
                : "text-stone-500 hover:bg-stone-200/60"
            }`}
            title="Study Mode"
          >
            <Brain className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setActiveView("router")}
            className={`rounded-lg p-2 transition-colors cursor-pointer ${
              activeView === "router"
                ? "bg-stone-200 text-sky-700"
                : "text-stone-500 hover:bg-stone-200/60"
            }`}
            title="Task Router"
          >
            <Cpu className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setActiveView("settings")}
            className={`rounded-lg p-2 transition-colors cursor-pointer ${
              activeView === "settings"
                ? "bg-stone-200 text-violet-700"
                : "text-stone-500 hover:bg-stone-200/60"
            }`}
            title="Settings & Gemini AI"
          >
            <Settings className="h-4 w-4" />
          </button>
        </aside>
      )}

      {/* Main Content Area */}
      <main className="flex-1 h-full overflow-hidden bg-[#FBFBFA]">
        {/* VIEW 1: WORKSPACE DASHBOARD */}
        {activeView === "dashboard" && (
          <DashboardView
            notes={notes}
            decks={decks}
            allCards={allCards}
            dueCards={dueCards}
            recentActivity={recentActivity}
            onSelectNote={(note) => selectNote(note)}
            onCreateNote={() => handleCreateNote(selectedFolderId)}
            onDeleteNote={handleDeleteNote}
            onOpenStudyMode={(deckId) => openStudyMode(deckId)}
            onOpenDecksManagement={(deckId) => {
              if (deckId !== undefined) {
                handleSelectDeckFilter(deckId);
              }
              setActiveView("decks");
            }}
            onUpdateDeck={handleUpdateDeck}
            onDeleteDeck={handleDeleteDeck}
            onOpenCreateCardModal={() => {
              setEditingCardForModal(null);
              setGeneratedCardDrafts([]);
              setIsCreateCardModalOpen(true);
            }}
            onOpenImportModal={() => setIsImportModalOpen(true)}
          />
        )}

        {/* VIEW 2: OVERLEAF / JOPLIN SPLIT-PANE NOTES WORKSPACE */}
        {activeView === "editor" && (
          <div className="h-full w-full">
            {selectedNote ? (
              <SplitMarkdownWorkspace
                note={selectedNote}
                folders={folders}
                title={noteTitle}
                content={noteContent}
                saveStatus={saveStatus}
                highlightedHeader={highlightedHeader}
                isSidebarCollapsed={isSidebarCollapsed}
                isGeneratingCards={isGeneratingCards}
                onToggleSidebar={() => setIsSidebarCollapsed((v) => !v)}
                onTitleChange={(nextTitle) => setNoteTitle(nextTitle)}
                onContentChange={(nextContent) => setNoteContent(nextContent)}
                onSave={(nextTitle, nextContent) =>
                  handleSaveNote(nextTitle, nextContent)
                }
                onMoveNoteToFolder={handleMoveNoteToFolder}
                onGenerateFlashcards={handleGenerateFlashcards}
                onNavigateDashboard={() => setActiveView("dashboard")}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-8 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-stone-100 text-stone-600">
                  <FilePlus2 className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-semibold text-stone-900">
                  No Note Selected
                </h2>
                <p className="mt-1 mb-5 max-w-sm text-xs text-stone-500">
                  Select a note from the directory tree or create a new Markdown
                  note to open the split-pane editor.
                </p>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setActiveView("dashboard")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 cursor-pointer"
                  >
                    <FolderOpen className="h-4 w-4" />
                    <span>Open Dashboard</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCreateNote(selectedFolderId)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800 transition-colors cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Create First Note</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW 2.5: DECKS & FLASHCARDS MANAGEMENT */}
        {activeView === "decks" && (
          <DecksManagementView
            decks={decks}
            allCards={allCards}
            dueCards={dueCards}
            notes={notes}
            selectedDeckId={selectedDeckId}
            onSelectDeck={handleSelectDeckFilter}
            onCreateDeck={handleCreateDeck}
            onUpdateDeck={handleUpdateDeck}
            onDeleteDeck={handleDeleteDeck}
            onCreateFlashcard={handleCreateCardFromModal}
            onUpdateFlashcard={handleUpdateFlashcard}
            onDeleteFlashcard={handleDeleteFlashcard}
            onOpenStudyMode={(deckId) => openStudyMode(deckId)}
            onOpenCreateCardModal={(deckId) => {
              if (deckId !== undefined) {
                setSelectedDeckId(deckId);
              }
              setEditingCardForModal(null);
              setGeneratedCardDrafts([]);
              setIsCreateCardModalOpen(true);
            }}
            onOpenImportModal={() => setIsImportModalOpen(true)}
            onNavigateReferenceTag={handleNavigateReferenceTag}
            onNavigateDashboard={() => setActiveView("dashboard")}
          />
        )}

        {/* VIEW 3: STUDY MODE & 3D FLASHCARD STACK */}
        {activeView === "study" && (
          <div className="h-full w-full overflow-y-auto px-6 py-6 lg:px-12">
            <div className="mx-auto max-w-4xl">
              {/* Top Functional Breadcrumb & Study Mode Actions */}
              <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-stone-200/80 pb-4">
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs text-stone-500">
                    <button
                      type="button"
                      onClick={() => setActiveView("dashboard")}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-stone-600 hover:bg-stone-200/60 hover:text-stone-900 transition-colors cursor-pointer"
                    >
                      <FolderOpen className="h-3.5 w-3.5 text-stone-400" />
                      <span>Workspace</span>
                    </button>
                    <ChevronRight className="h-3.5 w-3.5 text-stone-400" />
                    <span className="font-semibold text-stone-800">
                      Study Mode
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                      <Brain className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-stone-900">
                        3D Deck Study Session (SM-2)
                      </h2>
                      <p className="text-xs text-stone-500">
                        Due in queue:{" "}
                        <strong className="text-stone-800">
                          {dueCards.length}
                        </strong>{" "}
                        • Reviewed this session:{" "}
                        <strong className="text-stone-800">
                          {reviewedCount}
                        </strong>{" "}
                        • Total cards:{" "}
                        <strong className="text-stone-800">
                          {allCards.length}
                        </strong>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveView("decks")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
                  >
                    <FolderKanban className="h-3.5 w-3.5 text-stone-600" />
                    <span>Manage Decks &amp; Cards</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsImportModalOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
                  >
                    <Upload className="h-3.5 w-3.5 text-sky-600" />
                    <span>Import Deck (JSON/CSV)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingCardForModal(null);
                      setGeneratedCardDrafts([]);
                      setIsCreateCardModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800 transition-colors cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>New Flashcard</span>
                  </button>
                </div>
              </header>

              {/* Deck Filter Bar */}
              <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-stone-200/80 bg-white p-2.5 shadow-2xs">
                <span className="inline-flex items-center gap-1.5 px-2 text-xs font-semibold text-stone-500">
                  <FolderKanban className="h-3.5 w-3.5 text-stone-400" />
                  <span>Decks:</span>
                </span>

                <button
                  type="button"
                  onClick={() => handleSelectDeckFilter(null)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                    selectedDeckId === null
                      ? "bg-stone-900 text-white"
                      : "text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>All Decks ({allCards.length})</span>
                </button>

                {decks.map((deck) => {
                  const count = allCards.filter(
                    (c) => c.deck_id === deck.id
                  ).length;
                  const active = selectedDeckId === deck.id;
                  return (
                    <div
                      key={deck.id}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                        active
                          ? "border-stone-900 bg-stone-900 text-white"
                          : "border-stone-200 bg-[#FBFBFA] text-stone-700 hover:bg-stone-100"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectDeckFilter(deck.id)}
                        className="cursor-pointer"
                      >
                        {deck.name} ({count})
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteDeck(deck.id)}
                        title={`Delete deck ${deck.name}`}
                        className={`ml-1 rounded p-0.5 cursor-pointer ${
                          active
                            ? "text-stone-300 hover:text-white"
                            : "text-stone-400 hover:text-red-600"
                        }`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* 3D Animated Flashcard Stack */}
              <StudyCardStack
                cards={dueCards}
                decks={decks}
                onGradeCard={handleGradeCard}
                onEditCard={(card) => {
                  setEditingCardForModal(card);
                  setGeneratedCardDrafts([]);
                  setIsCreateCardModalOpen(true);
                }}
                onDeleteCard={handleDeleteFlashcard}
                onNavigateReferenceTag={handleNavigateReferenceTag}
                onOpenCreateModal={() => {
                  setEditingCardForModal(null);
                  setGeneratedCardDrafts([]);
                  setIsCreateCardModalOpen(true);
                }}
              />
            </div>
          </div>
        )}

        {/* VIEW 4: MULTI-MODEL TASK ROUTER */}
        {activeView === "router" && (
          <div className="h-full w-full overflow-y-auto px-6 py-6 lg:px-12">
            <div className="mx-auto max-w-3xl">
              <header className="mb-6 border-b border-stone-200/80 pb-4">
                <div className="mb-2 flex items-center gap-1.5 text-xs text-stone-500">
                  <button
                    type="button"
                    onClick={() => setActiveView("dashboard")}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-stone-600 hover:bg-stone-200/60 hover:text-stone-900 transition-colors cursor-pointer"
                  >
                    <FolderOpen className="h-3.5 w-3.5 text-stone-400" />
                    <span>Workspace</span>
                  </button>
                  <ChevronRight className="h-3.5 w-3.5 text-stone-400" />
                  <span className="font-semibold text-stone-800">
                    Task Router
                  </span>
                </div>

                <div className="flex items-start gap-3">
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
                      <strong className="text-stone-800">
                        Lightweight Pipeline
                      </strong>{" "}
                      and Rust backend, SQLite persistence, and Anki scheduling
                      tasks to the{" "}
                      <strong className="text-stone-800">
                        Reasoning Pipeline
                      </strong>
                      .
                    </p>
                  </div>
                </div>
              </header>

              <form
                onSubmit={handleAddAgentTask}
                className="mb-6 grid grid-cols-1 gap-2.5 rounded-xl border border-stone-200/80 bg-[#F7F7F5] p-3.5 sm:grid-cols-[1fr_1fr_auto]"
              >
                <input
                  type="text"
                  placeholder="Task title (e.g., Implement save_image Rust command)..."
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
          </div>
        )}

        {/* VIEW 5: SETTINGS MENU POINT (Gemini Login & AI Model Routing) */}
        {activeView === "settings" && (
          <SettingsView
            settings={aiSettings}
            onUpdateSettings={handleUpdateAiSettings}
            onNavigateDashboard={() => setActiveView("dashboard")}
          />
        )}
      </main>

      {/* Persistent Flashcard Creation & Generated Card Review Modal (Phase 3) */}
      <FlashcardCreationModal
        isOpen={isCreateCardModalOpen}
        decks={decks}
        notes={notes}
        defaultDeckId={selectedDeckId}
        editingCard={editingCardForModal}
        initialDrafts={generatedCardDrafts}
        onClearDrafts={() => setGeneratedCardDrafts([])}
        onClose={() => {
          setIsCreateCardModalOpen(false);
          setEditingCardForModal(null);
          setGeneratedCardDrafts([]);
        }}
        onCreateCard={handleCreateCardFromModal}
        onUpdateCard={async (input) => {
          await handleUpdateFlashcard(input);
          setEditingCardForModal(null);
        }}
        onCreateDeck={handleCreateDeck}
      />

      {/* JSON / CSV Deck Importer Modal (`import_deck`) */}
      <DeckImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportDeck={handleImportDeck}
      />
    </div>
  );
}

export default App;
