import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Bold,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Code,
  Columns2,
  Copy,
  Eye,
  FileCode,
  Folder as FolderIcon,
  FolderOpen,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  List,
  Loader2,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Quote,
  Sparkles,
  Wand2,
} from "lucide-react";
import { saveImage } from "../api";
import type { Folder, Note } from "../types";
import { formatRelativeTimestamp, formatShortDate } from "../utils/formatters";
import { MarkdownPreview } from "./MarkdownPreview";

export interface SplitMarkdownWorkspaceProps {
  note: Note;
  folders: Folder[];
  title: string;
  content: string;
  saveStatus: "saved" | "saving" | "idle";
  highlightedHeader?: string | null;
  isSidebarCollapsed?: boolean;
  isGeneratingCards?: boolean;
  onToggleSidebar?: () => void;
  onTitleChange: (nextTitle: string) => void;
  onContentChange: (nextContent: string) => void;
  onSave: (nextTitle?: string, nextContent?: string) => void;
  onMoveNoteToFolder: (noteId: number, folderId: number | null) => Promise<void>;
  onGenerateFlashcards: () => Promise<void>;
  onNavigateDashboard: () => void;
}

const COLOR_SWATCHES = [
  { name: "emerald", label: "Emerald", dotClass: "bg-emerald-500" },
  { name: "amber", label: "Amber", dotClass: "bg-amber-500" },
  { name: "rose", label: "Rose", dotClass: "bg-rose-500" },
  { name: "sky", label: "Sky", dotClass: "bg-sky-500" },
  { name: "violet", label: "Violet", dotClass: "bg-violet-500" },
] as const;

export const SplitMarkdownWorkspace: React.FC<SplitMarkdownWorkspaceProps> = ({
  note,
  folders,
  title,
  content,
  saveStatus,
  highlightedHeader = null,
  isSidebarCollapsed = false,
  isGeneratingCards = false,
  onToggleSidebar,
  onTitleChange,
  onContentChange,
  onSave,
  onMoveNoteToFolder,
  onGenerateFlashcards,
  onNavigateDashboard,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [copiedTag, setCopiedTag] = useState<string | null>(null);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageStatusBanner, setImageStatusBanner] = useState<string | null>(
    null
  );

  // Build folder path chain for current note (`parent_id` hierarchy)
  const folderBreadcrumbPath = useMemo(() => {
    const chain: Folder[] = [];
    let currentId = note.folder_id ?? null;
    const visited = new Set<number>();
    while (currentId !== null && !visited.has(currentId)) {
      visited.add(currentId);
      const found = folders.find((f) => f.id === currentId);
      if (!found) break;
      chain.unshift(found);
      currentId = found.parent_id ?? null;
    }
    return chain;
  }, [folders, note.folder_id]);

  // Build flat folder options with indentation for the quick folder assignment dropdown
  const folderSelectOptions = useMemo(() => {
    const result: Array<{ id: number; label: string }> = [];
    const walk = (parentId: number | null, prefix: string) => {
      const children = folders.filter(
        (f) => (f.parent_id ?? null) === parentId
      );
      for (const ch of children) {
        result.push({ id: ch.id, label: `${prefix}${ch.name}` });
        walk(ch.id, `${prefix}↳ `);
      }
    };
    walk(null, "");
    return result;
  }, [folders]);

  const stats = useMemo(() => {
    const trimmed = content.trim();
    const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
    const lines = content ? content.split("\n").length : 1;
    const chars = content.length;
    return { words, lines, chars };
  }, [content]);

  const headings = useMemo(() => {
    const matches: string[] = [];
    for (const line of content.split("\n")) {
      const m = /^#{1,3}\s+(.+)$/.exec(line.trim());
      if (m && m[1]) {
        matches.push(m[1].replace(/[*`]/g, "").trim());
      }
    }
    return matches;
  }, [content]);

  const insertTextAtCursor = useCallback(
    (snippet: string) => {
      const el = textareaRef.current;
      if (!el) {
        const next = `${content}${
          content.endsWith("\n") || !content ? "" : "\n"
        }${snippet}`;
        onContentChange(next);
        onSave(title, next);
        return;
      }

      const start = el.selectionStart ?? content.length;
      const end = el.selectionEnd ?? content.length;
      const next = content.slice(0, start) + snippet + content.slice(end);
      onContentChange(next);
      onSave(title, next);

      requestAnimationFrame(() => {
        el.focus();
        const cursor = start + snippet.length;
        el.setSelectionRange(cursor, cursor);
      });
    },
    [content, onContentChange, onSave, title]
  );

  const insertSnippet = useCallback(
    (prefix: string, suffix = "", fallbackText = "text") => {
      const el = textareaRef.current;
      if (!el) {
        const next = `${content}${
          content.endsWith("\n") || !content ? "" : "\n"
        }${prefix}${fallbackText}${suffix}`;
        onContentChange(next);
        return;
      }

      const start = el.selectionStart ?? content.length;
      const end = el.selectionEnd ?? content.length;
      const selected = content.slice(start, end) || fallbackText;
      const replacement = `${prefix}${selected}${suffix}`;
      const next = content.slice(0, start) + replacement + content.slice(end);

      onContentChange(next);
      requestAnimationFrame(() => {
        el.focus();
        const cursorStart = start + prefix.length;
        const cursorEnd = cursorStart + selected.length;
        el.setSelectionRange(cursorStart, cursorEnd);
      });
    },
    [content, onContentChange]
  );

  // Convert File/Blob to base64 data URL and upload via Tauri `save_image` command
  const processAndInsertImageFile = useCallback(
    async (file: File) => {
      setIsUploadingImage(true);
      try {
        const base64DataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === "string") {
              resolve(reader.result);
            } else {
              reject(new Error("Failed to read image file as data URL."));
            }
          };
          reader.onerror = () =>
            reject(reader.error || new Error("FileReader error"));
          reader.readAsDataURL(file);
        });

        const altLabel =
          file.name
            .replace(/\.[^.]+$/, "")
            .replace(/[_-]+/g, " ")
            .trim() || "image";
        const { markdownUri } = await saveImage(base64DataUrl, file.name);
        const markdownTag = `![${altLabel}](${markdownUri})`;

        insertTextAtCursor(markdownTag);
        setImageStatusBanner(`Saved to study-hub-data/images (${markdownUri})`);
        setTimeout(() => setImageStatusBanner(null), 3200);
      } catch (err) {
        console.error("Failed to save image via save_image:", err);
      } finally {
        setIsUploadingImage(false);
      }
    },
    [insertTextAtCursor]
  );

  // Phase 2: Clipboard Image Paste Handler (`onPaste`)
  const handlePaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) {
            const ext = item.type.split("/")[1]?.split("+")[0] || "png";
            const namedFile = new File(
              [blob],
              blob.name && blob.name !== "image.png"
                ? blob.name
                : `clipboard_${Date.now()}.${ext}`,
              { type: item.type }
            );
            await processAndInsertImageFile(namedFile);
          }
          return;
        }
      }
    },
    [processAndInsertImageFile]
  );

  // Phase 2: Drag-and-Drop Image Handler (`onDragOver`, `onDragLeave`, `onDrop`)
  const handleEditorDragOver = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      if (
        e.dataTransfer?.types?.includes("Files") &&
        !e.dataTransfer.types.includes("application/x-studyhub-note-id")
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
        if (!isDraggingImage) {
          setIsDraggingImage(true);
        }
      }
    },
    [isDraggingImage]
  );

  const handleEditorDragLeave = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingImage(false);
    },
    []
  );

  const handleEditorDrop = useCallback(
    async (e: React.DragEvent<HTMLElement>) => {
      setIsDraggingImage(false);
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      const imageFiles = Array.from(files).filter(
        (f) =>
          f.type.startsWith("image/") ||
          /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(f.name)
      );
      if (imageFiles.length === 0) return;

      e.preventDefault();
      e.stopPropagation();

      for (const imgFile of imageFiles) {
        await processAndInsertImageFile(imgFile);
      }
    },
    [processAndInsertImageFile]
  );

  const handleFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      for (const file of Array.from(files)) {
        await processAndInsertImageFile(file);
      }
      e.target.value = "";
    },
    [processAndInsertImageFile]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        onSave(title, content);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        insertSnippet("**", "**", "bold text");
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
        e.preventDefault();
        insertSnippet("*", "*", "italic text");
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const el = e.currentTarget;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const next = content.slice(0, start) + "  " + content.slice(end);
        onContentChange(next);
        requestAnimationFrame(() => {
          el.selectionStart = el.selectionEnd = start + 2;
        });
      }
    },
    [content, insertSnippet, onContentChange, onSave, title]
  );

  const handleCopySmartTag = useCallback(
    (headerText: string) => {
      const smartTag = `${title || "Untitled Note"}#${headerText}`;
      navigator.clipboard?.writeText(smartTag).catch(() => {});
      setCopiedTag(smartTag);
      setTimeout(() => setCopiedTag(null), 2000);
    },
    [title]
  );

  const toolbarBtn =
    "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-stone-600 hover:bg-stone-200/75 hover:text-stone-900 transition-colors cursor-pointer select-none";

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#FBFBFA]">
      {/* Top Bar: Collapsible Sidebar Toggle, Directory Breadcrumbs, Note Title, Generate Flashcards & Sync Status */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-stone-200/80 bg-white px-4 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className="inline-flex items-center justify-center rounded-lg border border-stone-200 bg-[#FBFBFA] p-1.5 text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition-colors cursor-pointer"
              title={
                isSidebarCollapsed
                  ? "Expand File-Tree Sidebar"
                  : "Collapse File-Tree Sidebar"
              }
              aria-label={
                isSidebarCollapsed
                  ? "Expand File-Tree Sidebar"
                  : "Collapse File-Tree Sidebar"
              }
            >
              {isSidebarCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          )}

          {/* Functional Breadcrumb: Clicking "Workspace" routes to Dashboard */}
          <button
            type="button"
            onClick={onNavigateDashboard}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition-colors cursor-pointer"
            title="Return to Workspace Dashboard"
          >
            <FolderOpen className="h-3.5 w-3.5 text-stone-500" />
            <span className="hidden sm:inline">Workspace</span>
          </button>

          {/* Nested Folder Path Breadcrumbs */}
          {folderBreadcrumbPath.map((folder) => (
            <React.Fragment key={folder.id}>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-stone-300" />
              <span className="hidden md:inline-flex items-center gap-1 rounded-md bg-amber-50/80 border border-amber-200/60 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                <FolderIcon className="h-3 w-3 text-amber-600" />
                <span className="truncate max-w-[110px]">{folder.name}</span>
              </span>
            </React.Fragment>
          ))}

          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-stone-400" />

          <input
            type="text"
            value={title}
            placeholder="Untitled Note..."
            aria-label="Note title"
            onChange={(e) => onTitleChange(e.target.value)}
            onBlur={() => onSave(title, content)}
            className="min-w-[150px] flex-1 rounded-md bg-transparent px-2 py-1 text-sm font-bold text-stone-900 placeholder:text-stone-400 hover:bg-stone-100/70 focus:bg-stone-100/80 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Quick Directory Folder Assignment Selector */}
          <div className="hidden lg:flex items-center gap-1 rounded-lg border border-stone-200 bg-[#FBFBFA] px-2 py-1">
            <FolderIcon className="h-3 w-3 text-amber-600 shrink-0" />
            <select
              aria-label="Note Folder"
              value={note.folder_id ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                onMoveNoteToFolder(note.id, val ? Number(val) : null);
              }}
              className="bg-transparent text-[11px] font-medium text-stone-700 focus:outline-none cursor-pointer max-w-[140px]"
              title="Move note to directory folder"
            >
              <option value="">/ Root Directory</option>
              {folderSelectOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Phase 3: "Generate Flashcards" Action in the Note Editor Header */}
          <button
            type="button"
            disabled={isGeneratingCards}
            onClick={onGenerateFlashcards}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50 transition-colors cursor-pointer shadow-2xs"
            title="Parse note Markdown or use Gemini / Ollama to generate flashcards and review them in the Flashcard Modal"
          >
            {isGeneratingCards ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-700" />
            ) : (
              <Wand2 className="h-3.5 w-3.5 text-amber-700" />
            )}
            <span>
              {isGeneratingCards ? "Generating..." : "Generate Flashcards"}
            </span>
          </button>

          <span
            className="hidden xl:inline-flex items-center gap-1.5 rounded-md bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-600"
            title={`Created ${formatShortDate(note.created_at)}`}
          >
            <Clock className="h-3 w-3 text-stone-400" />
            <span>Edited {formatRelativeTimestamp(note.updated_at)}</span>
          </span>

          <span className="inline-flex items-center gap-1.5 rounded-md border border-stone-200/80 bg-[#FBFBFA] px-2.5 py-1 text-[11px] font-medium text-stone-600">
            {saveStatus === "saving" ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-amber-600" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                <span>Synced to SQLite</span>
              </>
            )}
          </span>

          <button
            type="button"
            onClick={() => onSave(title, content)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <Check className="h-3.5 w-3.5" />
            <span>Save</span>
          </button>
        </div>
      </header>

      {/* Secondary Formatting, Image Upload & Extended Markdown Directive Bar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-stone-200/80 bg-[#F7F7F5] px-5 py-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => insertSnippet("# ", "", "Heading 1")}
            className={toolbarBtn}
            title="Heading 1"
          >
            <Heading1 className="h-3.5 w-3.5" />
            <span>H1</span>
          </button>
          <button
            type="button"
            onClick={() => insertSnippet("## ", "", "Heading 2")}
            className={toolbarBtn}
            title="Heading 2"
          >
            <Heading2 className="h-3.5 w-3.5" />
            <span>H2</span>
          </button>
          <button
            type="button"
            onClick={() => insertSnippet("### ", "", "Heading 3")}
            className={toolbarBtn}
            title="Heading 3"
          >
            <Heading3 className="h-3.5 w-3.5" />
            <span>H3</span>
          </button>

          <span className="mx-1 h-4 w-px bg-stone-300/80" />

          <button
            type="button"
            onClick={() => insertSnippet("**", "**", "bold")}
            className={toolbarBtn}
            title="Bold (Ctrl+B)"
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertSnippet("*", "*", "italic")}
            className={toolbarBtn}
            title="Italic (Ctrl+I)"
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertSnippet("`", "`", "code")}
            className={toolbarBtn}
            title="Inline Code"
          >
            <Code className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertSnippet("- ", "", "List item")}
            className={toolbarBtn}
            title="Bullet List"
          >
            <List className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertSnippet("> ", "", "Key insight")}
            className={toolbarBtn}
            title="Blockquote"
          >
            <Quote className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertSnippet("```rust\n", "\n```", "// code")}
            className={toolbarBtn}
            title="Code Block"
          >
            <FileCode className="h-3.5 w-3.5" />
          </button>

          {/* Cloze helper button */}
          <button
            type="button"
            onClick={() => insertSnippet("{{c1::", "}}", "key concept")}
            className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-2 py-0.5 text-[11px] font-mono text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
            title="Insert {{c1::cloze}} for automated flashcard generation"
          >
            {"{{c1::...}}"}
          </button>

          {/* Phase 2: Local Image Upload Button (`save_image` -> `![image](studyhub://...)`) */}
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={isUploadingImage}
            className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800 hover:bg-sky-100 transition-colors cursor-pointer"
            title="Upload local image via save_image or paste/drop into editor"
          >
            {isUploadingImage ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ImagePlus className="h-3 w-3 text-sky-600" />
            )}
            <span>Insert Image</span>
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileInputChange}
            className="hidden"
          />

          <span className="mx-1 h-4 w-px bg-stone-300/80" />

          {/* Extended Markdown Color Directives (remark-directive) */}
          <div className="flex items-center gap-1 rounded-lg border border-stone-200/90 bg-white px-2 py-0.5">
            <Palette className="h-3.5 w-3.5 text-stone-500 mr-0.5" />
            <span className="text-[11px] font-medium text-stone-500 mr-1">
              Color:
            </span>
            {COLOR_SWATCHES.map((swatch) => (
              <button
                key={swatch.name}
                type="button"
                onClick={() =>
                  insertSnippet(`:${swatch.name}[`, "]", "colored concept")
                }
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
                title={`Insert :${swatch.name}[text] directive`}
              >
                <span className={`h-2 w-2 rounded-full ${swatch.dotClass}`} />
                <span>{swatch.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Smart Tag Backlink Helper or Image Status Toast */}
        {imageStatusBanner ? (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            <span>{imageStatusBanner}</span>
          </div>
        ) : (
          headings.length > 0 && (
            <div className="hidden xl:flex items-center gap-1.5 text-[11px] text-stone-500">
              <Sparkles className="h-3 w-3 text-amber-600" />
              <span>Smart Tags:</span>
              <div className="flex items-center gap-1 max-w-xs overflow-x-auto">
                {headings.slice(0, 3).map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => handleCopySmartTag(h)}
                    className="inline-flex items-center gap-1 truncate rounded border border-stone-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-stone-600 hover:border-amber-300 hover:bg-amber-50/60 hover:text-amber-900 transition-colors cursor-pointer"
                    title={`Copy smart backlink tag: ${title}#${h}`}
                  >
                    <Copy className="h-2.5 w-2.5" />
                    <span className="truncate max-w-[90px]">#{h}</span>
                  </button>
                ))}
              </div>
              {copiedTag && (
                <span className="text-[10px] font-semibold text-emerald-700">
                  Copied!
                </span>
              )}
            </div>
          )
        )}
      </div>

      {/* Overleaf / Joplin Full-Height Split-Pane Container */}
      <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-stone-200/90 overflow-hidden">
        {/* LEFT PANE: Full-Height Raw Markdown Editor (Supports Paste & Drag-and-Drop Images!) */}
        <section
          onDragOver={handleEditorDragOver}
          onDragLeave={handleEditorDragLeave}
          onDrop={handleEditorDrop}
          className="relative flex h-full min-h-0 flex-col bg-[#1E1E1E] text-stone-100"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-stone-800 bg-[#181818] px-4 py-2 text-[11px] text-stone-400">
            <div className="flex items-center gap-2 font-medium text-stone-300">
              <Columns2 className="h-3.5 w-3.5 text-emerald-400" />
              <span>RAW MARKDOWN SOURCE</span>
              <span className="rounded bg-stone-800 px-1.5 py-0.5 font-mono text-[10px] text-stone-400">
                Paste / Drop Images → studyhub://
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px] text-stone-400">
              <span>{stats.lines} lines</span>
              <span>•</span>
              <span>{stats.words} words</span>
              <span>•</span>
              <span>{stats.chars} chars</span>
            </div>
          </div>

          {isDraggingImage && (
            <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center bg-stone-950/80 backdrop-blur-xs border-2 border-dashed border-sky-400 m-3 rounded-xl">
              <ImagePlus className="h-10 w-10 text-sky-400 mb-2" />
              <div className="text-sm font-bold text-white">
                Drop Image to Save Locally
              </div>
              <div className="mt-1 text-xs text-stone-300 font-mono">
                Uploads via <code>save_image</code> &amp; inserts{" "}
                <code>![image](studyhub://images/...)</code>
              </div>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            onBlur={() => onSave(title, content)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            spellCheck={false}
            aria-label="Raw Markdown Editor"
            placeholder="Write raw Markdown here... Paste (Ctrl+V) or drag-and-drop images directly into this editor to save them to study-hub-data/images and insert ![image](studyhub://...)."
            className="h-full w-full flex-1 resize-none overflow-y-auto bg-[#1E1E1E] px-6 py-5 font-mono text-[13px] leading-relaxed text-stone-100 placeholder:text-stone-500 focus:outline-none selection:bg-emerald-500/30"
          />
        </section>

        {/* RIGHT PANE: Full-Height Live Rendered Preview */}
        <section className="flex h-full min-h-0 flex-col bg-white">
          <div className="flex shrink-0 items-center justify-between border-b border-stone-200/80 bg-[#FBFBFA] px-5 py-2 text-[11px] text-stone-500">
            <div className="flex items-center gap-2 font-medium text-stone-700">
              <Eye className="h-3.5 w-3.5 text-sky-600" />
              <span>LIVE RENDERED PREVIEW</span>
            </div>
            <span className="text-[11px] text-stone-400">
              Instant sync • Color directives &amp; <code>studyhub://</code>{" "}
              assets enabled
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-8 py-6">
            <MarkdownPreview
              markdown={content}
              highlightedHeader={highlightedHeader}
            />
          </div>
        </section>
      </div>
    </div>
  );
};

export default SplitMarkdownWorkspace;
