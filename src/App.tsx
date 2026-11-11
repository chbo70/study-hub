import { useEffect, useMemo, useRef, useState } from "react";
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
import { AgentTask, Flashcard, Note, RoutingDecision } from "./types";
import { renderMarkdownToHtml } from "./utils/markdown";
import { TaskRouter } from "./utils/taskRouter";
import "./App.css";

type ActiveView = "editor" | "study" | "router";
type EditorMode = "split" | "wysiwyg" | "markdown";

const DEFAULT_AGENT_TASKS: AgentTask[] = [
  {
    id: "task-1",
    title: "Notion Sidebar & Layout",
    description: "Render clean React sidebar component and responsive CSS layout",
  },
  {
    id: "task-2",
    title: "Markdown WYSIWYG Preview",
    description: "Parse and render live Markdown formatting in the editor area",
  },
  {
    id: "task-3",
    title: "SQLite Schema & Persistence",
    description: "Initialize rusqlite tables for notes and flashcards CRUD storage",
  },
  {
    id: "task-4",
    title: "Anki SM-2 Next Review Scheduler",
    description: "Calculate interval, ease factor, and next_review date in Rust backend",
  },
];

function App() {
  const [activeView, setActiveView] = useState<ActiveView>("editor");
  const [editorMode, setEditorMode] = useState<EditorMode>("split");

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

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Load initial notes, due cards, and task routing decisions
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
        selectNote(loadedNotes[0]);
      }
    } catch (err) {
      console.error("Failed to load initial data from Tauri backend:", err);
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
        "# Untitled Note\n\nStart writing your study notes in Markdown..."
      );
      setNotes((prev) => [created, ...prev]);
      await selectNote(created);
      setActiveView("editor");
    } catch (err) {
      console.error("Failed to create note:", err);
    }
  }

  async function handleSaveNote(nextTitle = noteTitle, nextContent = noteContent) {
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

  function insertMarkdownSyntax(prefix: string, suffix = "") {
    const el = textareaRef.current;
    if (!el) {
      const updated = `${noteContent}\n${prefix}${suffix}`;
      setNoteContent(updated);
      handleSaveNote(noteTitle, updated);
      return;
    }

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = noteContent.slice(start, end) || "text";
    const replacement = `${prefix}${selected}${suffix}`;
    const updated =
      noteContent.slice(0, start) + replacement + noteContent.slice(end);
    setNoteContent(updated);
    handleSaveNote(noteTitle, updated);
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

  const renderedHtml = useMemo(
    () => renderMarkdownToHtml(noteContent),
    [noteContent]
  );

  const activeStudyCard = dueCards[currentCardIndex] ?? null;

  return (
    <div className="notion-app">
      {/* Notion-style Left Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">S</div>
          <div>
            <div className="brand-title">Study Hub</div>
            <div className="brand-subtitle">Notion + Anki Hybrid</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            type="button"
            className={`nav-item ${activeView === "editor" ? "active" : ""}`}
            onClick={() => setActiveView("editor")}
          >
            <span>📝 Notes Workspace</span>
            <span className="badge">{notes.length}</span>
          </button>

          <button
            type="button"
            className={`nav-item ${activeView === "study" ? "active" : ""}`}
            onClick={openStudyMode}
          >
            <span>🧠 Study Mode</span>
            <span className="badge badge-due">{dueCards.length} due</span>
          </button>

          <button
            type="button"
            className={`nav-item ${activeView === "router" ? "active" : ""}`}
            onClick={() => setActiveView("router")}
          >
            <span>⚡ TaskRouter</span>
            <span className="badge">{routingDecisions.length}</span>
          </button>
        </nav>

        <div className="sidebar-section-header">
          <span>PAGES</span>
          <button
            type="button"
            className="new-page-btn"
            onClick={handleCreateNote}
            title="Create new note"
          >
            + New
          </button>
        </div>

        <div className="sidebar-search">
          <input
            type="text"
            placeholder="Filter notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <ul className="note-list">
          {filteredNotes.map((note) => (
            <li
              key={note.id}
              className={`note-list-item ${
                selectedNoteId === note.id && activeView === "editor"
                  ? "selected"
                  : ""
              }`}
              onClick={() => {
                selectNote(note);
                setActiveView("editor");
              }}
            >
              <span className="note-title-text">
                📄 {note.title || "Untitled"}
              </span>
              <button
                type="button"
                className="delete-icon-btn"
                onClick={(e) => handleDeleteNote(note.id, e)}
                title="Delete note"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Main Content Area */}
      <main className="main-workspace">
        {activeView === "editor" && (
          <div className="editor-container">
            {selectedNoteId !== null ? (
              <>
                <header className="editor-topbar">
                  <div className="breadcrumbs">
                    Workspace / <strong>{noteTitle || "Untitled"}</strong>
                  </div>
                  <div className="editor-actions">
                    <span className="save-indicator">
                      {saveStatus === "saving" ? "Saving..." : "Saved to SQLite"}
                    </span>
                    <div className="mode-SegmentedControl">
                      <button
                        type="button"
                        className={editorMode === "split" ? "active" : ""}
                        onClick={() => setEditorMode("split")}
                      >
                        Split WYSIWYG
                      </button>
                      <button
                        type="button"
                        className={editorMode === "wysiwyg" ? "active" : ""}
                        onClick={() => setEditorMode("wysiwyg")}
                      >
                        Rich Preview
                      </button>
                      <button
                        type="button"
                        className={editorMode === "markdown" ? "active" : ""}
                        onClick={() => setEditorMode("markdown")}
                      >
                        Markdown
                      </button>
                    </div>
                  </div>
                </header>

                <input
                  className="notion-title-input"
                  type="text"
                  value={noteTitle}
                  placeholder="Untitled page..."
                  onChange={(e) => setNoteTitle(e.target.value)}
                  onBlur={() => handleSaveNote(noteTitle, noteContent)}
                />

                {/* Formatting Toolbar */}
                <div className="wysiwyg-toolbar">
                  <button
                    type="button"
                    onClick={() => insertMarkdownSyntax("# ", "")}
                  >
                    H1
                  </button>
                  <button
                    type="button"
                    onClick={() => insertMarkdownSyntax("## ", "")}
                  >
                    H2
                  </button>
                  <button
                    type="button"
                    onClick={() => insertMarkdownSyntax("**", "**")}
                  >
                    <strong>B</strong>
                  </button>
                  <button
                    type="button"
                    onClick={() => insertMarkdownSyntax("*", "*")}
                  >
                    <em>I</em>
                  </button>
                  <button
                    type="button"
                    onClick={() => insertMarkdownSyntax("`", "`")}
                  >
                    Code
                  </button>
                  <button
                    type="button"
                    onClick={() => insertMarkdownSyntax("> ", "")}
                  >
                    Quote
                  </button>
                  <button
                    type="button"
                    onClick={() => insertMarkdownSyntax("- ", "")}
                  >
                    • List
                  </button>
                  <button
                    type="button"
                    className="save-btn"
                    onClick={() => handleSaveNote(noteTitle, noteContent)}
                  >
                    Save Note
                  </button>
                </div>

                {/* Markdown Editor + WYSIWYG Preview Surface */}
                <div className={`editor-panes mode-${editorMode}`}>
                  {(editorMode === "split" || editorMode === "markdown") && (
                    <textarea
                      ref={textareaRef}
                      className="markdown-textarea"
                      value={noteContent}
                      placeholder="Write your note in Markdown..."
                      onChange={(e) => setNoteContent(e.target.value)}
                      onBlur={() => handleSaveNote(noteTitle, noteContent)}
                    />
                  )}
                  {(editorMode === "split" || editorMode === "wysiwyg") && (
                    <div
                      className="markdown-preview"
                      dangerouslySetInnerHTML={{ __html: renderedHtml }}
                    />
                  )}
                </div>

                {/* Linked Anki Flashcards Panel */}
                <section className="flashcards-section">
                  <div className="flashcards-header">
                    <h3>
                      Linked Anki Flashcards ({noteFlashcards.length})
                    </h3>
                    <button
                      type="button"
                      className="study-cta-btn"
                      onClick={openStudyMode}
                    >
                      Review Due Cards ({dueCards.length})
                    </button>
                  </div>

                  <form
                    className="add-flashcard-form"
                    onSubmit={handleAddFlashcard}
                  >
                    <input
                      type="text"
                      placeholder="Front (Question / Prompt)..."
                      value={newFront}
                      onChange={(e) => setNewFront(e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Back (Answer / Explanation)..."
                      value={newBack}
                      onChange={(e) => setNewBack(e.target.value)}
                    />
                    <button type="submit">+ Add Card</button>
                  </form>

                  <div className="flashcard-grid">
                    {noteFlashcards.map((card) => (
                      <div key={card.id} className="flashcard-item">
                        <div className="flashcard-q">
                          <strong>Q:</strong> {card.front}
                        </div>
                        <div className="flashcard-a">
                          <strong>A:</strong> {card.back}
                        </div>
                        <div className="flashcard-meta">
                          <span>Interval: {card.interval}d</span>
                          <span>Ease: {card.ease.toFixed(2)}</span>
                          <span>Next: {card.next_review}</span>
                          <button
                            type="button"
                            className="card-delete-btn"
                            onClick={() => handleDeleteFlashcard(card.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : (
              <div className="empty-state">
                <h2>No Note Selected</h2>
                <p>Create or select a note from the sidebar to begin.</p>
                <button type="button" onClick={handleCreateNote}>
                  + Create First Note
                </button>
              </div>
            )}
          </div>
        )}

        {activeView === "study" && (
          <div className="study-container">
            <header className="study-header">
              <div>
                <h2>Anki Study Mode (SM-2 Scheduler)</h2>
                <p>
                  Due today: <strong>{dueCards.length}</strong> | Reviewed this
                  session: <strong>{reviewedCount}</strong>
                </p>
              </div>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setActiveView("editor")}
              >
                ← Back to Notes
              </button>
            </header>

            {activeStudyCard ? (
              <div className="study-card-box">
                <div className="study-card-meta">
                  <span>Card #{activeStudyCard.id}</span>
                  <span>Current Interval: {activeStudyCard.interval}d</span>
                  <span>Ease Factor: {activeStudyCard.ease.toFixed(2)}</span>
                  <span>Due: {activeStudyCard.next_review}</span>
                </div>

                <div className="study-card-prompt">
                  <span className="card-label">PROMPT</span>
                  <h3>{activeStudyCard.front}</h3>
                </div>

                {showAnswer ? (
                  <>
                    <div className="study-card-answer">
                      <span className="card-label">ANSWER</span>
                      <p>{activeStudyCard.back}</p>
                    </div>

                    <div className="rating-buttons">
                      <button
                        type="button"
                        className="rate-btn rate-again"
                        onClick={() => handleGradeCard(1)}
                      >
                        <strong>Again</strong>
                        <span>Reset (1d)</span>
                      </button>
                      <button
                        type="button"
                        className="rate-btn rate-hard"
                        onClick={() => handleGradeCard(3)}
                      >
                        <strong>Hard</strong>
                        <span>×1.2 interval</span>
                      </button>
                      <button
                        type="button"
                        className="rate-btn rate-good"
                        onClick={() => handleGradeCard(4)}
                      >
                        <strong>Good</strong>
                        <span>×{activeStudyCard.ease.toFixed(1)} interval</span>
                      </button>
                      <button
                        type="button"
                        className="rate-btn rate-easy"
                        onClick={() => handleGradeCard(5)}
                      >
                        <strong>Easy</strong>
                        <span>Bonus interval</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    className="show-answer-btn"
                    onClick={() => setShowAnswer(true)}
                  >
                    Show Answer
                  </button>
                )}
              </div>
            ) : (
              <div className="study-complete">
                <h3>🎉 All caught up!</h3>
                <p>
                  No flashcards are currently due for review. Add more cards in
                  the Notes Workspace or come back on your next scheduled review
                  date.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveView("editor")}
                >
                  Return to Notes
                </button>
              </div>
            )}
          </div>
        )}

        {activeView === "router" && (
          <div className="router-container">
            <header className="study-header">
              <div>
                <h2>Multi-Model TaskRouter</h2>
                <p>
                  Statically evaluates task complexity and routes UI/Markdown
                  tasks to the <strong>Lightweight</strong> pipeline and Rust /
                  SQLite / Anki tasks to the <strong>Reasoning</strong>{" "}
                  pipeline.
                </p>
              </div>
            </header>

            <form className="add-flashcard-form" onSubmit={handleAddAgentTask}>
              <input
                type="text"
                placeholder="Task title (e.g., Implement FSRS decay)..."
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
              />
              <input
                type="text"
                placeholder="Task description..."
                value={newTaskDesc}
                onChange={(e) => setNewTaskDesc(e.target.value)}
              />
              <button type="submit">Route Task</button>
            </form>

            <div className="router-list">
              {routingDecisions.map((d) => (
                <div key={d.task_id} className="router-card">
                  <div className="router-card-top">
                    <strong>{d.title}</strong>
                    <div className="router-badges">
                      <span className="tag-badge">{d.category}</span>
                      <span className="tag-badge">
                        complexity: {d.complexity}
                      </span>
                      <span
                        className={`pipeline-badge pipeline-${d.pipeline}`}
                      >
                        {d.pipeline.toUpperCase()} PIPELINE
                      </span>
                    </div>
                  </div>
                  <p className="router-rationale">{d.rationale}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
