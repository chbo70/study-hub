import React, { useCallback, useState } from "react";
import {
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  Cpu,
  FileCode2,
  FolderOpen,
  KeyRound,
  LogIn,
  LogOut,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { AiProviderMode, AiProviderSettings } from "../types";

export interface SettingsViewProps {
  settings: AiProviderSettings;
  onUpdateSettings: (next: AiProviderSettings) => void;
  onNavigateDashboard: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  onNavigateDashboard,
}) => {
  const [emailInput, setEmailInput] = useState(
    settings.geminiAccountEmail || "student@studyhub.ai"
  );
  const [apiKeyInput, setApiKeyInput] = useState(settings.geminiApiKey);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  const showSavedFeedback = useCallback((msg: string) => {
    setSavedBanner(msg);
    setTimeout(() => setSavedBanner(null), 2600);
  }, []);

  const handleSelectProvider = useCallback(
    (provider: AiProviderMode) => {
      onUpdateSettings({
        ...settings,
        provider,
      });
      showSavedFeedback(
        `Active flashcard generation engine set to ${
          provider === "gemini"
            ? `Google Gemini (${settings.geminiModel})`
            : provider === "ollama"
              ? `Local Ollama (${settings.ollamaModel})`
              : "Markdown Syntax Parser"
        }`
      );
    },
    [onUpdateSettings, settings, showSavedFeedback]
  );

  const handleConnectGemini = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const resolvedEmail = emailInput.trim() || "student@studyhub.ai";
      onUpdateSettings({
        ...settings,
        provider: "gemini",
        geminiConnected: true,
        geminiAccountEmail: resolvedEmail,
        geminiApiKey: apiKeyInput.trim(),
      });
      showSavedFeedback(
        `Connected to Google Gemini as ${resolvedEmail} • AI routed to ${settings.geminiModel}`
      );
    },
    [apiKeyInput, emailInput, onUpdateSettings, settings, showSavedFeedback]
  );

  const handleDisconnectGemini = useCallback(() => {
    onUpdateSettings({
      ...settings,
      geminiConnected: false,
    });
    showSavedFeedback("Disconnected from Google Gemini session.");
  }, [onUpdateSettings, settings, showSavedFeedback]);

  return (
    <div className="h-full w-full overflow-y-auto bg-[#FBFBFA] px-6 py-7 lg:px-12">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Top Breadcrumb & Header */}
        <header className="border-b border-stone-200/80 pb-5">
          <div className="mb-2 flex items-center gap-1.5 text-xs text-stone-500">
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
              Settings & AI Model Routing
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-900 text-white shadow-2xs">
                <Settings className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-stone-900">
                  AI & Flashcard Generation Settings
                </h1>
                <p className="text-xs text-stone-500">
                  Connect to Google Gemini to route AI flashcard generation to a
                  Gemini model, configure a local Ollama LLM endpoint, or tune
                  Markdown syntax parsing rules.
                </p>
              </div>
            </div>

            {savedBanner && (
              <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>{savedBanner}</span>
              </div>
            )}
          </div>
        </header>

        {/* Active Generation Engine Selector */}
        <section className="rounded-2xl border border-stone-200/90 bg-white p-5 shadow-2xs">
          <h2 className="text-sm font-bold text-stone-900 mb-1">
            Active Flashcard Generation Pipeline
          </h2>
          <p className="text-xs text-stone-500 mb-4">
            Select how the <strong>Generate Flashcards</strong> action in the
            Note Editor processes your note&apos;s raw Markdown before loading
            cards into the Review Modal.
          </p>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <button
              type="button"
              onClick={() => handleSelectProvider("gemini")}
              className={`flex flex-col justify-between rounded-xl border p-4 text-left transition-all cursor-pointer ${
                settings.provider === "gemini"
                  ? "border-stone-900 bg-stone-900 text-white shadow-xs"
                  : "border-stone-200 bg-[#FBFBFA] text-stone-800 hover:border-stone-300"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <Sparkles
                    className={`h-4 w-4 ${
                      settings.provider === "gemini"
                        ? "text-amber-400"
                        : "text-amber-600"
                    }`}
                  />
                  {settings.geminiConnected && (
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-400/30">
                      Connected
                    </span>
                  )}
                </div>
                <div className="mt-2.5 text-xs font-bold">
                  Google Gemini AI Routing
                </div>
                <p
                  className={`mt-1 text-[11px] leading-relaxed ${
                    settings.provider === "gemini"
                      ? "text-stone-300"
                      : "text-stone-500"
                  }`}
                >
                  Routes note Markdown to{" "}
                  <code>{settings.geminiModel}</code> for intelligent Q&amp;A,
                  choice, and cloze card synthesis.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleSelectProvider("ollama")}
              className={`flex flex-col justify-between rounded-xl border p-4 text-left transition-all cursor-pointer ${
                settings.provider === "ollama"
                  ? "border-stone-900 bg-stone-900 text-white shadow-xs"
                  : "border-stone-200 bg-[#FBFBFA] text-stone-800 hover:border-stone-300"
              }`}
            >
              <div>
                <Server
                  className={`h-4 w-4 ${
                    settings.provider === "ollama"
                      ? "text-sky-400"
                      : "text-sky-600"
                  }`}
                />
                <div className="mt-2.5 text-xs font-bold">
                  Local LLM (Ollama)
                </div>
                <p
                  className={`mt-1 text-[11px] leading-relaxed ${
                    settings.provider === "ollama"
                      ? "text-stone-300"
                      : "text-stone-500"
                  }`}
                >
                  Processes Markdown locally via{" "}
                  <code>{settings.ollamaModel}</code> with offline syntax
                  fallback.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleSelectProvider("markdown_syntax")}
              className={`flex flex-col justify-between rounded-xl border p-4 text-left transition-all cursor-pointer ${
                settings.provider === "markdown_syntax"
                  ? "border-stone-900 bg-stone-900 text-white shadow-xs"
                  : "border-stone-200 bg-[#FBFBFA] text-stone-800 hover:border-stone-300"
              }`}
            >
              <div>
                <FileCode2
                  className={`h-4 w-4 ${
                    settings.provider === "markdown_syntax"
                      ? "text-emerald-400"
                      : "text-emerald-600"
                  }`}
                />
                <div className="mt-2.5 text-xs font-bold">
                  Markdown Syntax Parser
                </div>
                <p
                  className={`mt-1 text-[11px] leading-relaxed ${
                    settings.provider === "markdown_syntax"
                      ? "text-stone-300"
                      : "text-stone-500"
                  }`}
                >
                  Deterministic parsing of <code>{"{{c1::clozes}}"}</code>,{" "}
                  <code>**Q:** / **A:**</code>, and colored key definitions.
                </p>
              </div>
            </button>
          </div>
        </section>

        {/* Card 1: Google Gemini Login & Connection */}
        <section className="rounded-2xl border border-stone-200/90 bg-white p-6 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-stone-900">
                  Google Gemini Connection & Login
                </h2>
                <p className="text-xs text-stone-500">
                  Sign in / connect your Gemini session or provide a Gemini API
                  key so automated flashcard generation routes directly to a
                  Gemini model.
                </p>
              </div>
            </div>

            {settings.geminiConnected ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                <span>
                  Connected ({settings.geminiAccountEmail || "Gemini Session"})
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
                Not Connected
              </span>
            )}
          </div>

          <form onSubmit={handleConnectGemini} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  Google / Gemini Account Email
                </label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="student@studyhub.ai"
                  className="w-full rounded-lg border border-stone-200 bg-[#FBFBFA] px-3 py-2 text-xs text-stone-800 focus:border-stone-400 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-stone-700">
                  <Cpu className="h-3.5 w-3.5 text-sky-600" />
                  <span>Target Gemini Model Pipeline</span>
                </label>
                <select
                  value={settings.geminiModel}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      geminiModel: e.target
                        .value as AiProviderSettings["geminiModel"],
                    })
                  }
                  className="w-full rounded-lg border border-stone-200 bg-[#FBFBFA] px-3 py-2 text-xs font-medium text-stone-800 focus:border-stone-400 focus:bg-white focus:outline-none"
                >
                  <option value="gemini-2.5-flash">
                    Gemini 2.5 Flash (Lightweight / Fast Extraction)
                  </option>
                  <option value="gemini-2.5-pro">
                    Gemini 2.5 Pro (Reasoning / Deep Synthesis)
                  </option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-stone-700">
                <KeyRound className="h-3.5 w-3.5 text-amber-600" />
                <span>
                  Gemini API Key (Optional — enables live{" "}
                  <code>generativelanguage.googleapis.com</code> calls)
                </span>
              </label>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="AIzaSy... (Leave blank to use connected local Gemini synthesis)"
                className="w-full rounded-lg border border-stone-200 bg-[#FBFBFA] px-3 py-2 font-mono text-xs text-stone-800 focus:border-stone-400 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-3">
              <div className="text-[11px] text-stone-500">
                When connected, clicking{" "}
                <strong className="text-stone-800">Generate Flashcards</strong>{" "}
                in the Note Editor routes your note to{" "}
                <code className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-800">
                  {settings.geminiModel}
                </code>
                .
              </div>

              <div className="flex items-center gap-2">
                {settings.geminiConnected && (
                  <button
                    type="button"
                    onClick={handleDisconnectGemini}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 cursor-pointer"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Disconnect</span>
                  </button>
                )}

                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800 transition-colors cursor-pointer"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  <span>
                    {settings.geminiConnected
                      ? "Update Gemini Connection"
                      : "Login & Connect to Gemini"}
                  </span>
                </button>
              </div>
            </div>
          </form>
        </section>

        {/* Card 2: Local LLM (Ollama) & Markdown Syntax Rules */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-stone-200/90 bg-white p-5 shadow-2xs space-y-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-800">
                <Server className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-stone-900">
                  Local LLM Endpoint (Ollama)
                </h3>
                <p className="text-[11px] text-stone-500">
                  Configure a local Ollama instance for offline AI generation
                </p>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">
                Ollama Generate Endpoint URL
              </label>
              <input
                type="text"
                value={settings.ollamaEndpoint}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    ollamaEndpoint: e.target.value,
                  })
                }
                placeholder="http://localhost:11434/api/generate"
                className="w-full rounded-lg border border-stone-200 bg-[#FBFBFA] px-3 py-2 font-mono text-xs text-stone-800 focus:border-stone-400 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">
                Model Name
              </label>
              <input
                type="text"
                value={settings.ollamaModel}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    ollamaModel: e.target.value,
                  })
                }
                placeholder="llama3.2"
                className="w-full rounded-lg border border-stone-200 bg-[#FBFBFA] px-3 py-2 font-mono text-xs text-stone-800 focus:border-stone-400 focus:bg-white focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                onUpdateSettings({ ...settings, provider: "ollama" });
                showSavedFeedback(
                  `Saved Ollama settings (${settings.ollamaModel})`
                );
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-100 cursor-pointer"
            >
              <Check className="h-3.5 w-3.5 text-emerald-600" />
              <span>Use Ollama Endpoint</span>
            </button>
          </section>

          <section className="rounded-2xl border border-stone-200/90 bg-white p-5 shadow-2xs space-y-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
                <FileCode2 className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-stone-900">
                  Markdown Syntax Extraction Rules
                </h3>
                <p className="text-[11px] text-stone-500">
                  Patterns automatically parsed into flashcards
                </p>
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              <label className="flex items-start gap-2.5 text-xs text-stone-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.parseClozes}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      parseClozes: e.target.checked,
                    })
                  }
                  className="mt-0.5 rounded border-stone-300"
                />
                <div>
                  <div className="font-semibold text-stone-900">
                    Cloze Deletions (<code>{"{{c1::term}}"}</code>)
                  </div>
                  <div className="text-[11px] text-stone-500">
                    Replaces cloze markers with <code>[...]</code> on the front
                    and highlights the answer on the back.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 text-xs text-stone-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.parseBoldQuestions}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      parseBoldQuestions: e.target.checked,
                    })
                  }
                  className="mt-0.5 rounded border-stone-300"
                />
                <div>
                  <div className="font-semibold text-stone-900">
                    Bolded Questions (<code>**Q:** ... **A:** ...</code>)
                  </div>
                  <div className="text-[11px] text-stone-500">
                    Extracts explicit Q&amp;A blocks and standalone bold
                    questions ending in <code>?</code>.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 text-xs text-stone-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.parseKeyDefinitions}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      parseKeyDefinitions: e.target.checked,
                    })
                  }
                  className="mt-0.5 rounded border-stone-300"
                />
                <div>
                  <div className="font-semibold text-stone-900">
                    Colored &amp; Bold Key Terms (
                    <code>- :emerald[**Term**]: Definition</code>)
                  </div>
                  <div className="text-[11px] text-stone-500">
                    Converts bulleted concept definitions and{" "}
                    <code>Term :: Definition</code> lines into active-recall
                    cards with section smart tags.
                  </div>
                </div>
              </label>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
