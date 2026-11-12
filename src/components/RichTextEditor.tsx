import { useEffect, useRef, useState } from "react";
import { EditorState, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { MarkType, NodeType } from "prosemirror-model";
import {
  defaultMarkdownParser,
  defaultMarkdownSerializer,
  schema,
} from "prosemirror-markdown";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import {
  baseKeymap,
  chainCommands,
  exitCode,
  lift,
  setBlockType,
  toggleMark,
  wrapIn,
} from "prosemirror-commands";
import {
  liftListItem,
  sinkListItem,
  splitListItem,
  wrapInList,
} from "prosemirror-schema-list";
import {
  InputRule,
  inputRules,
  textblockTypeInputRule,
  wrappingInputRule,
} from "prosemirror-inputrules";
import {
  Bold,
  Check,
  Code,
  FileCode,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  Sparkles,
  Undo2,
} from "lucide-react";

interface RichTextEditorProps {
  noteId: number;
  markdown: string;
  saveStatus: "saved" | "saving" | "idle";
  onChange: (nextMarkdown: string) => void;
  onSave: (nextMarkdown?: string) => void;
}

interface ActiveFormatState {
  bold: boolean;
  italic: boolean;
  code: boolean;
  headingLevel: number | null;
  blockquote: boolean;
  codeBlock: boolean;
  bulletList: boolean;
  orderedList: boolean;
  wordCount: number;
  blockCount: number;
}

function markInputRule(regexp: RegExp, markType: MarkType): InputRule {
  return new InputRule(regexp, (state, match, start, end) => {
    const text = match[1];
    if (!text) return null;
    const tr = state.tr;
    tr.replaceWith(start, end, schema.text(text, [markType.create()]));
    tr.removeStoredMark(markType);
    return tr;
  });
}

function buildEditorInputRules() {
  const rules: InputRule[] = [
    // Headings: #, ##, ###
    textblockTypeInputRule(/^(#{1,3})\s$/, schema.nodes.heading, (match) => ({
      level: match[1].length,
    })),
    // Blockquote: >
    wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote),
    // Bullet list: - or *
    wrappingInputRule(/^\s*([-+*])\s$/, schema.nodes.bullet_list),
    // Ordered list: 1.
    wrappingInputRule(
      /^(\d+)\.\s$/,
      schema.nodes.ordered_list,
      (match) => ({ order: +match[1] }),
      (match, node) => node.childCount + node.attrs.order === +match[1]
    ),
    // Code block: ```
    textblockTypeInputRule(/^```$/, schema.nodes.code_block),
    // Inline bold: **text**
    markInputRule(/\*\*([^*]+)\*\*$/, schema.marks.strong),
    // Inline code: `code`
    markInputRule(/`([^`]+)`$/, schema.marks.code),
  ];

  return inputRules({ rules });
}

function isMarkActive(state: EditorState, markType: MarkType): boolean {
  const { from, $from, to, empty } = state.selection;
  if (empty) {
    return Boolean(
      markType.isInSet(state.storedMarks || $from.marks())
    );
  }
  return state.doc.rangeHasMark(from, to, markType);
}

function isNodeActive(
  state: EditorState,
  nodeType: NodeType,
  attrs?: Record<string, unknown>
): boolean {
  const { $from } = state.selection;
  for (let d = $from.depth; d >= 0; d--) {
    const node = $from.node(d);
    if (node.type === nodeType) {
      if (!attrs) return true;
      return Object.entries(attrs).every(
        ([k, v]) => node.attrs[k] === v
      );
    }
  }
  return false;
}

function getFormatState(state: EditorState): ActiveFormatState {
  let headingLevel: number | null = null;
  if (isNodeActive(state, schema.nodes.heading, { level: 1 })) headingLevel = 1;
  else if (isNodeActive(state, schema.nodes.heading, { level: 2 }))
    headingLevel = 2;
  else if (isNodeActive(state, schema.nodes.heading, { level: 3 }))
    headingLevel = 3;

  const textContent = state.doc.textContent.trim();
  const wordCount = textContent
    ? textContent.split(/\s+/).filter(Boolean).length
    : 0;

  return {
    bold: isMarkActive(state, schema.marks.strong),
    italic: isMarkActive(state, schema.marks.em),
    code: isMarkActive(state, schema.marks.code),
    headingLevel,
    blockquote: isNodeActive(state, schema.nodes.blockquote),
    codeBlock: isNodeActive(state, schema.nodes.code_block),
    bulletList: isNodeActive(state, schema.nodes.bullet_list),
    orderedList: isNodeActive(state, schema.nodes.ordered_list),
    wordCount,
    blockCount: state.doc.childCount,
  };
}

function parseMarkdownSafe(md: string) {
  try {
    return defaultMarkdownParser.parse(md || "");
  } catch {
    return defaultMarkdownParser.parse("");
  }
}

export function RichTextEditor({
  noteId,
  markdown,
  saveStatus,
  onChange,
  onSave,
}: RichTextEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const lastSerializedRef = useRef<string>(markdown);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  const [formatState, setFormatState] = useState<ActiveFormatState>({
    bold: false,
    italic: false,
    code: false,
    headingLevel: null,
    blockquote: false,
    codeBlock: false,
    bulletList: false,
    orderedList: false,
    wordCount: 0,
    blockCount: 1,
  });

  // Initialize ProseMirror EditorView on mount or when switching notes
  useEffect(() => {
    const container = hostRef.current;
    if (!container) return;

    const doc = parseMarkdownSafe(markdown);
    lastSerializedRef.current = markdown;

    const hardBreak = schema.nodes.hard_break;
    const insertHardBreak = chainCommands(exitCode, (state, dispatch) => {
      if (dispatch) {
        dispatch(
          state.tr.replaceSelectionWith(hardBreak.create()).scrollIntoView()
        );
      }
      return true;
    });

    const state = EditorState.create({
      doc,
      plugins: [
        buildEditorInputRules(),
        keymap({
          "Mod-z": undo,
          "Mod-y": redo,
          "Shift-Mod-z": redo,
          "Mod-b": toggleMark(schema.marks.strong),
          "Mod-i": toggleMark(schema.marks.em),
          "Mod-`": toggleMark(schema.marks.code),
          "Mod-s": () => {
            onSaveRef.current(lastSerializedRef.current);
            return true;
          },
          "Shift-Enter": insertHardBreak,
          Enter: splitListItem(schema.nodes.list_item),
          "Mod-[": liftListItem(schema.nodes.list_item),
          "Mod-]": sinkListItem(schema.nodes.list_item),
          Tab: sinkListItem(schema.nodes.list_item),
          "Shift-Tab": liftListItem(schema.nodes.list_item),
        }),
        keymap(baseKeymap),
        history(),
      ],
    });

    const view = new EditorView(container, {
      state,
      attributes: {
        class: "prosemirror-notion-surface focus:outline-none",
        spellcheck: "true",
      },
      dispatchTransaction(tr: Transaction) {
        const nextState = view.state.apply(tr);
        view.updateState(nextState);
        setFormatState(getFormatState(nextState));

        if (tr.docChanged) {
          const serialized = defaultMarkdownSerializer.serialize(nextState.doc);
          lastSerializedRef.current = serialized;
          onChangeRef.current(serialized);
        }
      },
      handleDOMEvents: {
        blur: () => {
          onSaveRef.current(lastSerializedRef.current);
          return false;
        },
      },
    });

    viewRef.current = view;
    setFormatState(getFormatState(view.state));

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Re-create editor state cleanly when switching to a different noteId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  // Sync external markdown updates if changed from outside the editor
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (markdown !== lastSerializedRef.current) {
      const doc = parseMarkdownSafe(markdown);
      lastSerializedRef.current = markdown;
      const nextState = EditorState.create({
        doc,
        plugins: view.state.plugins,
      });
      view.updateState(nextState);
      setFormatState(getFormatState(nextState));
    }
  }, [markdown]);

  function execCommand(
    cmd: (
      state: EditorState,
      dispatch?: (tr: Transaction) => void,
      view?: EditorView
    ) => boolean
  ) {
    const view = viewRef.current;
    if (!view) return;
    cmd(view.state, view.dispatch, view);
    view.focus();
  }

  function toggleBlockHeading(level: 1 | 2 | 3) {
    const view = viewRef.current;
    if (!view) return;
    if (formatState.headingLevel === level) {
      setBlockType(schema.nodes.paragraph)(view.state, view.dispatch);
    } else {
      setBlockType(schema.nodes.heading, { level })(view.state, view.dispatch);
    }
    view.focus();
  }

  function setParagraphBlock() {
    execCommand(setBlockType(schema.nodes.paragraph));
  }

  function toggleBlockquote() {
    const view = viewRef.current;
    if (!view) return;
    if (formatState.blockquote) {
      lift(view.state, view.dispatch);
    } else {
      wrapIn(schema.nodes.blockquote)(view.state, view.dispatch);
    }
    view.focus();
  }

  function toggleCodeBlock() {
    const view = viewRef.current;
    if (!view) return;
    if (formatState.codeBlock) {
      setBlockType(schema.nodes.paragraph)(view.state, view.dispatch);
    } else {
      setBlockType(schema.nodes.code_block)(view.state, view.dispatch);
    }
    view.focus();
  }

  function toggleBulletList() {
    const view = viewRef.current;
    if (!view) return;
    if (formatState.bulletList) {
      liftListItem(schema.nodes.list_item)(view.state, view.dispatch);
    } else {
      wrapInList(schema.nodes.bullet_list)(view.state, view.dispatch);
    }
    view.focus();
  }

  function toggleOrderedList() {
    const view = viewRef.current;
    if (!view) return;
    if (formatState.orderedList) {
      liftListItem(schema.nodes.list_item)(view.state, view.dispatch);
    } else {
      wrapInList(schema.nodes.ordered_list)(view.state, view.dispatch);
    }
    view.focus();
  }

  function insertDivider() {
    const view = viewRef.current;
    if (!view) return;
    const { state, dispatch } = view;
    dispatch(
      state.tr
        .replaceSelectionWith(schema.nodes.horizontal_rule.create())
        .scrollIntoView()
    );
    view.focus();
  }

  const toolbarBtnBase =
    "inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer select-none";
  const toolbarBtnIdle =
    "text-stone-600 hover:bg-stone-200/70 hover:text-stone-900";
  const toolbarBtnActive =
    "bg-stone-900 text-white shadow-2xs hover:bg-stone-800";

  return (
    <div className="rounded-xl border border-stone-200/90 bg-white shadow-2xs transition-all">
      {/* Unified Block-Based Formatting Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-stone-200/80 bg-[#FBFBFA] px-3 py-2 rounded-t-xl">
        {/* History group */}
        <div className="flex items-center gap-0.5 pr-1.5 border-r border-stone-200/80">
          <button
            type="button"
            onClick={() => execCommand(undo)}
            className={`${toolbarBtnBase} ${toolbarBtnIdle}`}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => execCommand(redo)}
            className={`${toolbarBtnBase} ${toolbarBtnIdle}`}
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Block types group */}
        <div className="flex items-center gap-0.5 px-1.5 border-r border-stone-200/80">
          <button
            type="button"
            onClick={setParagraphBlock}
            className={`${toolbarBtnBase} ${
              formatState.headingLevel === null &&
              !formatState.codeBlock &&
              !formatState.blockquote
                ? "bg-stone-200/80 text-stone-900"
                : toolbarBtnIdle
            }`}
            title="Paragraph block"
          >
            <Pilcrow className="h-3.5 w-3.5" />
            <span>Text</span>
          </button>
          <button
            type="button"
            onClick={() => toggleBlockHeading(1)}
            className={`${toolbarBtnBase} ${
              formatState.headingLevel === 1 ? toolbarBtnActive : toolbarBtnIdle
            }`}
            title="Heading 1 (# + space)"
          >
            <Heading1 className="h-3.5 w-3.5" />
            <span>H1</span>
          </button>
          <button
            type="button"
            onClick={() => toggleBlockHeading(2)}
            className={`${toolbarBtnBase} ${
              formatState.headingLevel === 2 ? toolbarBtnActive : toolbarBtnIdle
            }`}
            title="Heading 2 (## + space)"
          >
            <Heading2 className="h-3.5 w-3.5" />
            <span>H2</span>
          </button>
          <button
            type="button"
            onClick={() => toggleBlockHeading(3)}
            className={`${toolbarBtnBase} ${
              formatState.headingLevel === 3 ? toolbarBtnActive : toolbarBtnIdle
            }`}
            title="Heading 3 (### + space)"
          >
            <Heading3 className="h-3.5 w-3.5" />
            <span>H3</span>
          </button>
        </div>

        {/* Inline Marks group */}
        <div className="flex items-center gap-0.5 px-1.5 border-r border-stone-200/80">
          <button
            type="button"
            onClick={() => execCommand(toggleMark(schema.marks.strong))}
            className={`${toolbarBtnBase} ${
              formatState.bold ? toolbarBtnActive : toolbarBtnIdle
            }`}
            title="Bold (Ctrl+B)"
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => execCommand(toggleMark(schema.marks.em))}
            className={`${toolbarBtnBase} ${
              formatState.italic ? toolbarBtnActive : toolbarBtnIdle
            }`}
            title="Italic (Ctrl+I)"
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => execCommand(toggleMark(schema.marks.code))}
            className={`${toolbarBtnBase} ${
              formatState.code ? toolbarBtnActive : toolbarBtnIdle
            }`}
            title="Inline Code (Ctrl+`)"
          >
            <Code className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Lists & Structured Blocks group */}
        <div className="flex items-center gap-0.5 px-1.5">
          <button
            type="button"
            onClick={toggleBulletList}
            className={`${toolbarBtnBase} ${
              formatState.bulletList ? toolbarBtnActive : toolbarBtnIdle
            }`}
            title="Bullet List (- + space)"
          >
            <List className="h-3.5 w-3.5" />
            <span>Bullet</span>
          </button>
          <button
            type="button"
            onClick={toggleOrderedList}
            className={`${toolbarBtnBase} ${
              formatState.orderedList ? toolbarBtnActive : toolbarBtnIdle
            }`}
            title="Numbered List (1. + space)"
          >
            <ListOrdered className="h-3.5 w-3.5" />
            <span>Numbered</span>
          </button>
          <button
            type="button"
            onClick={toggleBlockquote}
            className={`${toolbarBtnBase} ${
              formatState.blockquote ? toolbarBtnActive : toolbarBtnIdle
            }`}
            title="Callout / Quote (> + space)"
          >
            <Quote className="h-3.5 w-3.5" />
            <span>Quote</span>
          </button>
          <button
            type="button"
            onClick={toggleCodeBlock}
            className={`${toolbarBtnBase} ${
              formatState.codeBlock ? toolbarBtnActive : toolbarBtnIdle
            }`}
            title="Code Block (``` + space)"
          >
            <FileCode className="h-3.5 w-3.5" />
            <span>Code Block</span>
          </button>
          <button
            type="button"
            onClick={insertDivider}
            className={`${toolbarBtnBase} ${toolbarBtnIdle}`}
            title="Insert Divider"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Save Action on the right */}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSave(lastSerializedRef.current)}
            className="inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800 transition-colors cursor-pointer"
          >
            {saveStatus === "saving" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            <span>{saveStatus === "saving" ? "Saving..." : "Save Note"}</span>
          </button>
        </div>
      </div>

      {/* Seamless ProseMirror Block Canvas */}
      <div
        ref={hostRef}
        className="min-h-[340px] px-7 py-6 text-stone-800 selection:bg-sky-100"
      />

      {/* Subtle Notion-style Footer Metadata Bar */}
      <div className="flex items-center justify-between border-t border-stone-100 bg-[#FBFBFA] px-4 py-2 text-[11px] text-stone-500 rounded-b-xl">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3 w-3 text-stone-400" />
          <span>
            ProseMirror Block Editor — Type <kbd className="rounded border border-stone-200 bg-white px-1 py-0.5 font-mono text-[10px]">#</kbd>, <kbd className="rounded border border-stone-200 bg-white px-1 py-0.5 font-mono text-[10px]">&gt;</kbd>, <kbd className="rounded border border-stone-200 bg-white px-1 py-0.5 font-mono text-[10px]">-</kbd>, or <kbd className="rounded border border-stone-200 bg-white px-1 py-0.5 font-mono text-[10px]">```</kbd> for live block formatting
          </span>
        </div>
        <div className="flex items-center gap-3 font-medium">
          <span>{formatState.blockCount} {formatState.blockCount === 1 ? "block" : "blocks"}</span>
          <span>•</span>
          <span>{formatState.wordCount} {formatState.wordCount === 1 ? "word" : "words"}</span>
        </div>
      </div>
    </div>
  );
}
