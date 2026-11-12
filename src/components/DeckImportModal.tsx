import React, { useCallback, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileCode,
  FileSpreadsheet,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

export interface DeckImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportDeck: (params: {
    payload: string;
    deckName?: string;
    deckDescription?: string;
    format?: "json" | "csv";
  }) => Promise<number>;
}

const SAMPLE_JSON_DECK = `{
  "name": "Systems Neuroscience & Memory",
  "description": "Imported deck covering synaptic plasticity, SM-2, and cortical consolidation.",
  "cards": [
    {
      "front": "Which glutamate receptor acts as a **coincidence detector** during :emerald[Long-Term Potentiation (LTP)]?",
      "back": "The **NMDA receptor** (requires both presynaptic glutamate release and postsynaptic depolarization to expel Mg2+).",
      "card_type": "single_choice",
      "options": [
        "AMPA receptor",
        "NMDA receptor",
        "GABA-A receptor",
        "Metabotropic mGluR5"
      ],
      "reference_tag": "Spaced Repetition & Memory Systems#Core Concepts"
    },
    {
      "front": "Select all components managed by the **Study Hub v2** Rust backend:",
      "back": "SQLite persistence (decks, flashcards, notes), SM-2 scheduling, and static TaskRouter classification.",
      "card_type": "multiple_choice",
      "options": [
        "SQLite persistence for decks and flashcards",
        "Anki SM-2 interval and ease calculation",
        "Multi-Model TaskRouter static classification"
      ],
      "reference_tag": "Rust & Tauri Architecture#Key Components"
    }
  ]
}`;

const SAMPLE_CSV_DECK = `front,back,card_type,options,reference_tag
"What is the minimum **Ease Factor** allowed in the SM-2 algorithm?","1.30 (130%)",single_choice,"1.10|1.30|2.00|2.50","Spaced Repetition & Memory Systems#SM-2 Scheduling"
"Why does :emerald[Active Recall] outperform passive re-reading?","Retrieving information from memory strengthens neural pathways and highlights retrieval gaps.",default,"","Spaced Repetition & Memory Systems#Core Concepts"`;

export const DeckImportModal: React.FC<DeckImportModalProps> = ({
  isOpen,
  onClose,
  onImportDeck,
}) => {
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [deckName, setDeckName] = useState("");
  const [deckDescription, setDeckDescription] = useState("");
  const [payload, setPayload] = useState(SAMPLE_JSON_DECK);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".csv")) {
        setFormat("csv");
      } else if (lower.endsWith(".json")) {
        setFormat("json");
      }
      if (!deckName) {
        setDeckName(file.name.replace(/\.(json|csv)$/i, ""));
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setPayload(reader.result);
          setErrorMsg(null);
        }
      };
      reader.readAsText(file);
    },
    [deckName]
  );

  const handleLoadSample = useCallback((nextFormat: "json" | "csv") => {
    setFormat(nextFormat);
    setPayload(nextFormat === "json" ? SAMPLE_JSON_DECK : SAMPLE_CSV_DECK);
    setErrorMsg(null);
    setImportedCount(null);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!payload.trim() || isImporting) return;
      setIsImporting(true);
      setErrorMsg(null);
      setImportedCount(null);
      try {
        const count = await onImportDeck({
          payload: payload.trim(),
          deckName: deckName.trim() || undefined,
          deckDescription: deckDescription.trim() || undefined,
          format,
        });
        setImportedCount(count);
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : String(err || "Import failed")
        );
      } finally {
        setIsImporting(false);
      }
    },
    [deckDescription, deckName, format, isImporting, onImportDeck, payload]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-deck-modal-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-stone-200/80 bg-[#F7F7F5] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-600 text-white">
              <Upload className="h-4 w-4" />
            </div>
            <div>
              <h2
                id="import-deck-modal-title"
                className="text-base font-bold text-stone-900"
              >
                Import Flashcard Deck (`import_deck`)
              </h2>
              <p className="text-xs text-stone-500">
                Upload or paste JSON or CSV payloads to populate `decks` and
                `flashcards`
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close import modal"
            className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-200/70 hover:text-stone-900 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-6 py-5 space-y-4"
        >
          {/* Format Toggle & File Input */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-xl border border-stone-200 bg-[#FBFBFA] p-1">
              <button
                type="button"
                onClick={() => handleLoadSample("json")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  format === "json"
                    ? "bg-stone-900 text-white"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                <FileCode className="h-3.5 w-3.5" />
                <span>JSON Payload</span>
              </button>
              <button
                type="button"
                onClick={() => handleLoadSample("csv")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  format === "csv"
                    ? "bg-stone-900 text-white"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>CSV Payload</span>
              </button>
            </div>

            <label className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer">
              <Upload className="h-3.5 w-3.5 text-sky-600" />
              <span>Choose .json or .csv file</span>
              <input
                type="file"
                accept=".json,.csv,application/json,text/csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">
                Deck Name Override (Optional)
              </label>
              <input
                type="text"
                value={deckName}
                onChange={(e) => setDeckName(e.target.value)}
                placeholder="Uses JSON name or 'Imported Study Deck'"
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">
                Description Override (Optional)
              </label>
              <input
                type="text"
                value={deckDescription}
                onChange={(e) => setDeckDescription(e.target.value)}
                placeholder="Optional deck summary..."
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-700">
              {format === "json" ? "JSON Deck Content" : "CSV Deck Content"}
            </label>
            <textarea
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              rows={10}
              spellCheck={false}
              className="w-full rounded-xl border border-stone-200 bg-[#1E1E1E] p-3.5 font-mono text-xs leading-relaxed text-stone-100 focus:outline-none"
            />
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {importedCount !== null && (
            <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>
                  Successfully imported {importedCount} flashcards into SQLite!
                </span>
              </span>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md bg-emerald-700 px-2.5 py-1 text-[11px] text-white hover:bg-emerald-800 cursor-pointer"
              >
                Start Studying
              </button>
            </div>
          )}

          <footer className="flex items-center justify-between border-t border-stone-200/80 pt-4">
            <span className="inline-flex items-center gap-1 text-[11px] text-stone-500">
              <Sparkles className="h-3 w-3 text-sky-600" />
              <span>
                Supports `card_type`, `options`, and `reference_tag` columns
              </span>
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 cursor-pointer"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={!payload.trim() || isImporting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-5 py-2 text-xs font-semibold text-white hover:bg-stone-800 disabled:opacity-40 cursor-pointer"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>{isImporting ? "Importing..." : "Run import_deck"}</span>
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
};

export default DeckImportModal;
