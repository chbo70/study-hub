/**
 * Lightweight, zero-dependency Markdown-to-HTML renderer for the Notion-style
 * WYSIWYG / Split-view editor.
 */
export function renderMarkdownToHtml(markdown: string): string {
  if (!markdown.trim()) {
    return `<p class="md-placeholder">Start writing in Markdown...</p>`;
  }

  const escapeHtml = (str: string) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const formatInline = (text: string): string => {
    let out = escapeHtml(text);
    // Inline code
    out = out.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');
    // Bold + Italic
    out = out.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
    // Bold
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    // Italic
    out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    // Links [text](url)
    out = out.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    return out;
  };

  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const htmlBlocks: string[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const closeList = () => {
    if (listType) {
      htmlBlocks.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const rawLine of lines) {
    if (rawLine.trim().startsWith("```")) {
      closeList();
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBuffer = [];
      } else {
        inCodeBlock = false;
        htmlBlocks.push(
          `<pre class="md-code-block"><code>${escapeHtml(
            codeBuffer.join("\n")
          )}</code></pre>`
        );
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(rawLine);
      continue;
    }

    const trimmed = rawLine.trim();

    if (!trimmed) {
      closeList();
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      closeList();
      htmlBlocks.push("<hr />");
      continue;
    }

    if (trimmed.startsWith("### ")) {
      closeList();
      htmlBlocks.push(`<h3>${formatInline(trimmed.slice(4))}</h3>`);
      continue;
    }

    if (trimmed.startsWith("## ")) {
      closeList();
      htmlBlocks.push(`<h2>${formatInline(trimmed.slice(3))}</h2>`);
      continue;
    }

    if (trimmed.startsWith("# ")) {
      closeList();
      htmlBlocks.push(`<h1>${formatInline(trimmed.slice(2))}</h1>`);
      continue;
    }

    if (trimmed.startsWith("> ")) {
      closeList();
      htmlBlocks.push(
        `<blockquote class="md-quote">${formatInline(trimmed.slice(2))}</blockquote>`
      );
      continue;
    }

    const ulMatch = /^[-*]\s+(.+)$/.exec(trimmed);
    if (ulMatch) {
      if (listType !== "ul") {
        closeList();
        listType = "ul";
        htmlBlocks.push("<ul>");
      }
      htmlBlocks.push(`<li>${formatInline(ulMatch[1])}</li>`);
      continue;
    }

    const olMatch = /^\d+\.\s+(.+)$/.exec(trimmed);
    if (olMatch) {
      if (listType !== "ol") {
        closeList();
        listType = "ol";
        htmlBlocks.push("<ol>");
      }
      htmlBlocks.push(`<li>${formatInline(olMatch[1])}</li>`);
      continue;
    }

    closeList();
    htmlBlocks.push(`<p>${formatInline(trimmed)}</p>`);
  }

  closeList();
  if (inCodeBlock) {
    htmlBlocks.push(
      `<pre class="md-code-block"><code>${escapeHtml(
        codeBuffer.join("\n")
      )}</code></pre>`
    );
  }

  return htmlBlocks.join("\n");
}
