import React, { useCallback, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  FilePlus,
  FileText,
  Folder as FolderIcon,
  FolderOpen,
  FolderPlus,
  GripVertical,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { Folder, Note } from "../types";
import { formatRelativeTimestamp } from "../utils/formatters";

export interface FileTreeSidebarProps {
  folders: Folder[];
  notes: Note[];
  selectedNoteId: number | null;
  selectedFolderId: number | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelectNote: (note: Note) => void;
  onSelectFolder: (folderId: number | null) => void;
  onCreateNote: (folderId?: number | null) => void;
  onDeleteNote: (noteId: number, e: React.MouseEvent) => void;
  onCreateFolder: (name: string, parentId: number | null) => Promise<Folder>;
  onDeleteFolder: (folderId: number, e: React.MouseEvent) => void;
  onMoveNoteToFolder: (noteId: number, folderId: number | null) => Promise<void>;
}

export const FileTreeSidebar: React.FC<FileTreeSidebarProps> = ({
  folders,
  notes,
  selectedNoteId,
  selectedFolderId,
  searchQuery,
  onSearchChange,
  onSelectNote,
  onSelectFolder,
  onCreateNote,
  onDeleteNote,
  onCreateFolder,
  onDeleteFolder,
  onMoveNoteToFolder,
}) => {
  // Track expanded folder IDs (default all open so nested hierarchy is immediately visible)
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());

  // Inline folder creation state
  const [creatingInParentId, setCreatingInParentId] = useState<
    number | "root" | null
  >(null);
  const [newFolderName, setNewFolderName] = useState("");

  // Drag-and-drop state
  const [draggedNoteId, setDraggedNoteId] = useState<number | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<
    number | "root" | null
  >(null);

  const toggleFolderExpand = useCallback((folderId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const handleStartCreateFolder = useCallback(
    (parentId: number | "root", e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (typeof parentId === "number") {
        setCollapsedIds((prev) => {
          const next = new Set(prev);
          next.delete(parentId);
          return next;
        });
      }
      setCreatingInParentId(parentId);
      setNewFolderName("");
    },
    []
  );

  const handleConfirmCreateFolder = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newFolderName.trim() || creatingInParentId === null) return;
      const parentId =
        creatingInParentId === "root" ? null : creatingInParentId;
      await onCreateFolder(newFolderName.trim(), parentId);
      setNewFolderName("");
      setCreatingInParentId(null);
    },
    [creatingInParentId, newFolderName, onCreateFolder]
  );

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const matchingNotes = useMemo(() => {
    if (!normalizedQuery) return notes;
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(normalizedQuery) ||
        n.content.toLowerCase().includes(normalizedQuery)
    );
  }, [normalizedQuery, notes]);

  // Map parent_id -> child folders
  const childFoldersByParent = useMemo(() => {
    const map = new Map<number | null, Folder[]>();
    for (const folder of folders) {
      const key = folder.parent_id ?? null;
      const list = map.get(key) ?? [];
      list.push(folder);
      map.set(key, list);
    }
    return map;
  }, [folders]);

  // Map folder_id -> notes in that folder
  const notesByFolder = useMemo(() => {
    const map = new Map<number | null, Note[]>();
    for (const note of matchingNotes) {
      const key = note.folder_id ?? null;
      const list = map.get(key) ?? [];
      list.push(note);
      map.set(key, list);
    }
    return map;
  }, [matchingNotes]);

  // Count total notes recursively inside a folder and its subfolders
  const countFolderNotesRecursive = useCallback(
    (folderId: number): number => {
      const direct = (notesByFolder.get(folderId) ?? []).length;
      const children = childFoldersByParent.get(folderId) ?? [];
      return (
        direct +
        children.reduce((acc, ch) => acc + countFolderNotesRecursive(ch.id), 0)
      );
    },
    [childFoldersByParent, notesByFolder]
  );

  // Drag handlers for Note items
  const handleNoteDragStart = useCallback(
    (noteId: number, e: React.DragEvent<HTMLLIElement>) => {
      setDraggedNoteId(noteId);
      e.dataTransfer.setData("text/plain", String(noteId));
      e.dataTransfer.setData("application/x-studyhub-note-id", String(noteId));
      e.dataTransfer.effectAllowed = "move";
    },
    []
  );

  const handleNoteDragEnd = useCallback(() => {
    setDraggedNoteId(null);
    setDragOverTarget(null);
  }, []);

  const handleFolderDragOver = useCallback(
    (target: number | "root", e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      if (dragOverTarget !== target) {
        setDragOverTarget(target);
      }
    },
    [dragOverTarget]
  );

  const handleFolderDrop = useCallback(
    async (target: number | "root", e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverTarget(null);

      const rawId =
        e.dataTransfer.getData("application/x-studyhub-note-id") ||
        e.dataTransfer.getData("text/plain");
      const noteId = draggedNoteId ?? (rawId ? Number(rawId) : NaN);
      setDraggedNoteId(null);

      if (!Number.isFinite(noteId)) return;
      const destinationFolderId = target === "root" ? null : target;

      // Expand target folder when a note is dropped into it
      if (typeof destinationFolderId === "number") {
        setCollapsedIds((prev) => {
          const next = new Set(prev);
          next.delete(destinationFolderId);
          return next;
        });
      }

      await onMoveNoteToFolder(noteId, destinationFolderId);
    },
    [draggedNoteId, onMoveNoteToFolder]
  );

  const renderNoteItem = (note: Note, depth: number) => {
    const isSelected = selectedNoteId === note.id;
    const isDragging = draggedNoteId === note.id;

    return (
      <li
        key={`note-${note.id}`}
        draggable
        onDragStart={(e) => handleNoteDragStart(note.id, e)}
        onDragEnd={handleNoteDragEnd}
        onClick={() => onSelectNote(note)}
        style={{ paddingLeft: `${Math.min(depth * 14 + 10, 64)}px` }}
        className={`group flex items-center justify-between gap-1.5 rounded-lg py-1.5 pr-2 text-xs transition-all cursor-pointer ${
          isDragging ? "opacity-40" : ""
        } ${
          isSelected
            ? "bg-white text-stone-900 shadow-2xs ring-1 ring-stone-200/90 font-medium"
            : "text-stone-600 hover:bg-stone-200/55 hover:text-stone-900"
        }`}
        title="Click to open • Drag to move into any folder"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <GripVertical className="h-3 w-3 shrink-0 text-stone-300 opacity-0 group-hover:opacity-100 cursor-grab" />
          <FileText
            className={`h-3.5 w-3.5 shrink-0 ${
              isSelected ? "text-emerald-600" : "text-stone-400"
            }`}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium">
              {note.title || "Untitled Note"}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-stone-400">
              <Clock className="h-2.5 w-2.5" />
              <span>{formatRelativeTimestamp(note.updated_at)}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={(e) => onDeleteNote(note.id, e)}
          title="Delete note"
          className="rounded p-1 text-stone-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 cursor-pointer"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </li>
    );
  };

  const renderFolderNode = (folder: Folder, depth: number): React.ReactNode => {
    const isExpanded = !collapsedIds.has(folder.id) || Boolean(normalizedQuery);
    const childFolders = childFoldersByParent.get(folder.id) ?? [];
    const folderNotes = notesByFolder.get(folder.id) ?? [];
    const totalCount = countFolderNotesRecursive(folder.id);
    const isDropTarget = dragOverTarget === folder.id;
    const isSelectedFolder = selectedFolderId === folder.id;

    return (
      <li key={`folder-${folder.id}`} className="select-none">
        <div
          onClick={() => {
            onSelectFolder(folder.id);
            setCollapsedIds((prev) => {
              const next = new Set(prev);
              if (next.has(folder.id)) next.delete(folder.id);
              else next.add(folder.id);
              return next;
            });
          }}
          onDragOver={(e) => handleFolderDragOver(folder.id, e)}
          onDragLeave={() => {
            if (dragOverTarget === folder.id) setDragOverTarget(null);
          }}
          onDrop={(e) => handleFolderDrop(folder.id, e)}
          style={{ paddingLeft: `${Math.min(depth * 14 + 6, 56)}px` }}
          className={`group flex items-center justify-between gap-1 rounded-lg py-1.5 pr-1.5 text-xs transition-all cursor-pointer ${
            isDropTarget
              ? "bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500 font-semibold"
              : isSelectedFolder
                ? "bg-stone-200/75 text-stone-900 font-semibold"
                : "text-stone-700 hover:bg-stone-200/50"
          }`}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => toggleFolderExpand(folder.id, e)}
              className="rounded p-0.5 text-stone-400 hover:text-stone-700 cursor-pointer"
              aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
            {isExpanded ? (
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-600" />
            ) : (
              <FolderIcon className="h-3.5 w-3.5 shrink-0 text-amber-600" />
            )}
            <span className="truncate font-medium">{folder.name}</span>
            <span className="ml-0.5 rounded-full bg-stone-200/80 px-1.5 py-0.2 text-[10px] font-semibold text-stone-600">
              {totalCount}
            </span>
          </div>

          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCreateNote(folder.id);
              }}
              title={`New note in "${folder.name}"`}
              className="rounded p-1 text-stone-500 hover:bg-stone-300/60 hover:text-stone-900 cursor-pointer"
            >
              <FilePlus className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={(e) => handleStartCreateFolder(folder.id, e)}
              title={`New subfolder in "${folder.name}"`}
              className="rounded p-1 text-stone-500 hover:bg-stone-300/60 hover:text-stone-900 cursor-pointer"
            >
              <FolderPlus className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={(e) => onDeleteFolder(folder.id, e)}
              title={`Delete folder "${folder.name}"`}
              className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Inline Subfolder Creator */}
        {creatingInParentId === folder.id && (
          <form
            onSubmit={handleConfirmCreateFolder}
            style={{ paddingLeft: `${Math.min((depth + 1) * 14 + 10, 64)}px` }}
            className="my-1 flex items-center gap-1 pr-2"
          >
            <input
              type="text"
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Subfolder name..."
              className="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-2 py-1 text-xs text-stone-800 focus:border-stone-500 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-md bg-stone-900 px-2 py-1 text-[10px] font-semibold text-white hover:bg-stone-800 cursor-pointer"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setCreatingInParentId(null)}
              className="rounded p-1 text-stone-400 hover:text-stone-700 cursor-pointer"
            >
              <X className="h-3 w-3" />
            </button>
          </form>
        )}

        {/* Nested Subfolders & Notes */}
        {isExpanded && (
          <ul className="mt-0.5 space-y-0.5">
            {childFolders.map((sub) => renderFolderNode(sub, depth + 1))}
            {folderNotes.map((n) => renderNoteItem(n, depth + 1))}
            {childFolders.length === 0 && folderNotes.length === 0 && (
              <li
                style={{
                  paddingLeft: `${Math.min((depth + 1) * 14 + 18, 70)}px`,
                }}
                className="py-1 text-[11px] italic text-stone-400"
              >
                Empty folder (drop notes here)
              </li>
            )}
          </ul>
        )}
      </li>
    );
  };

  const rootFolders = childFoldersByParent.get(null) ?? [];
  const rootNotes = notesByFolder.get(null) ?? [];

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* Directory Header & Actions */}
      <div className="mb-1.5 flex items-center justify-between px-2">
        <span className="text-[11px] font-semibold tracking-wider text-stone-400 uppercase">
          Directory Tree
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleStartCreateFolder("root")}
            title="Create new folder"
            className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <FolderPlus className="h-3 w-3 text-amber-600" />
            <span>Folder</span>
          </button>
          <button
            type="button"
            onClick={() => onCreateNote(selectedFolderId)}
            title="Create new note"
            className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <FilePlus className="h-3 w-3 text-emerald-600" />
            <span>Note</span>
          </button>
        </div>
      </div>

      {/* Root Folder Inline Input */}
      {creatingInParentId === "root" && (
        <form
          onSubmit={handleConfirmCreateFolder}
          className="mb-2 flex items-center gap-1 px-1"
        >
          <input
            type="text"
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="New root folder name..."
            className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs text-stone-800 focus:border-stone-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-stone-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-stone-800 cursor-pointer"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => setCreatingInParentId(null)}
            className="rounded p-1 text-stone-400 hover:text-stone-700 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </form>
      )}

      {/* Search Filter Input */}
      <div className="mb-2 px-1">
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-stone-400" />
          <input
            type="text"
            placeholder="Filter folders & notes..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-lg border border-stone-200/90 bg-white py-1.5 pr-7 pl-8 text-xs text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 text-stone-400 hover:text-stone-600 cursor-pointer"
              title="Clear filter"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Nested File-Tree List */}
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-1">
        {rootFolders.map((folder) => renderFolderNode(folder, 0))}

        {/* Root / Uncategorized Drop Target & Notes */}
        <li
          onDragOver={(e) => handleFolderDragOver("root", e)}
          onDragLeave={() => {
            if (dragOverTarget === "root") setDragOverTarget(null);
          }}
          onDrop={(e) => handleFolderDrop("root", e)}
          className={`mt-1 rounded-lg transition-colors ${
            dragOverTarget === "root"
              ? "bg-emerald-50/80 ring-2 ring-emerald-500 p-1"
              : ""
          }`}
        >
          {rootFolders.length > 0 && (
            <div
              onClick={() => onSelectFolder(null)}
              className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold tracking-wider text-stone-400 uppercase cursor-pointer hover:text-stone-600"
            >
              <span>Root Notes ({rootNotes.length})</span>
              {draggedNoteId !== null && (
                <span className="text-emerald-700 font-bold">
                  Drop to move to root
                </span>
              )}
            </div>
          )}
          <ul className="space-y-0.5">
            {rootNotes.map((note) => renderNoteItem(note, 0))}
          </ul>
        </li>

        {folders.length === 0 && matchingNotes.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-stone-400">
            No matching folders or notes found.
          </li>
        )}
      </ul>
    </div>
  );
};

export default FileTreeSidebar;
