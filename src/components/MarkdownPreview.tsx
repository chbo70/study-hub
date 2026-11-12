import React, { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import { visit } from "unist-util-visit";
import {
  getCachedStudyHubImage,
  isTauriRuntime,
  resolveStudyHubImageDataUrl,
} from "../api";

export interface MarkdownPreviewProps {
  markdown: string;
  className?: string;
  highlightedHeader?: string | null;
  compact?: boolean;
}

const NAMED_COLOR_PALETTE: Record<
  string,
  { text: string; bg: string; border: string }
> = {
  emerald: {
    text: "#047857",
    bg: "rgba(16, 185, 129, 0.12)",
    border: "rgba(16, 185, 129, 0.35)",
  },
  green: {
    text: "#15803d",
    bg: "rgba(34, 197, 94, 0.12)",
    border: "rgba(34, 197, 94, 0.35)",
  },
  amber: {
    text: "#b45309",
    bg: "rgba(245, 158, 11, 0.14)",
    border: "rgba(245, 158, 11, 0.38)",
  },
  yellow: {
    text: "#a16207",
    bg: "rgba(234, 179, 8, 0.15)",
    border: "rgba(234, 179, 8, 0.38)",
  },
  orange: {
    text: "#c2410c",
    bg: "rgba(249, 115, 22, 0.12)",
    border: "rgba(249, 115, 22, 0.35)",
  },
  rose: {
    text: "#be123c",
    bg: "rgba(244, 63, 94, 0.12)",
    border: "rgba(244, 63, 94, 0.35)",
  },
  red: {
    text: "#b91c1c",
    bg: "rgba(239, 68, 68, 0.12)",
    border: "rgba(239, 68, 68, 0.35)",
  },
  sky: {
    text: "#0369a1",
    bg: "rgba(14, 165, 233, 0.12)",
    border: "rgba(14, 165, 233, 0.35)",
  },
  blue: {
    text: "#1d4ed8",
    bg: "rgba(59, 130, 246, 0.12)",
    border: "rgba(59, 130, 246, 0.35)",
  },
  indigo: {
    text: "#4338ca",
    bg: "rgba(99, 102, 241, 0.12)",
    border: "rgba(99, 102, 241, 0.35)",
  },
  violet: {
    text: "#6d28d9",
    bg: "rgba(139, 92, 246, 0.12)",
    border: "rgba(139, 92, 246, 0.35)",
  },
  purple: {
    text: "#7e22ce",
    bg: "rgba(168, 85, 247, 0.12)",
    border: "rgba(168, 85, 247, 0.35)",
  },
  pink: {
    text: "#be185d",
    bg: "rgba(236, 72, 153, 0.12)",
    border: "rgba(236, 72, 153, 0.35)",
  },
  teal: {
    text: "#0f766e",
    bg: "rgba(20, 184, 166, 0.12)",
    border: "rgba(20, 184, 166, 0.35)",
  },
  cyan: {
    text: "#0e7490",
    bg: "rgba(6, 182, 212, 0.12)",
    border: "rgba(6, 182, 212, 0.35)",
  },
};

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

interface DirectiveNode {
  type: string;
  name?: string;
  attributes?: Record<string, string | null | undefined>;
  data?: {
    hName?: string;
    hProperties?: Record<string, unknown>;
  };
}

/**
 * Remark plugin that transforms `remark-directive` nodes into styled HTML spans/divs
 * supporting text coloring syntax such as:
 * - `:emerald[Active Recall]`, `:rose[Again]`, `:amber[SM-2]`, `:sky[FSRS]`, `:violet[TaskRouter]`
 * - `:color[Custom Colored Text]{color="#2563eb"}` or `:color[Text]{tone="emerald"}`
 * - `:highlight[Highlighted Text]{color="amber"}`
 * - `:::note`, `:::tip`, `:::warning`, `:::important` container callouts
 */
function remarkColorDirectives() {
  return (tree: Parameters<typeof visit>[0]) => {
    visit(tree, (rawNode) => {
      const node = rawNode as unknown as DirectiveNode;
      if (
        node.type !== "textDirective" &&
        node.type !== "leafDirective" &&
        node.type !== "containerDirective"
      ) {
        return;
      }

      const name = (node.name ?? "").toLowerCase();
      const attrs = node.attributes ?? {};
      const data = node.data || (node.data = {});

      if (node.type === "containerDirective") {
        const calloutTone =
          name === "warning" || name === "caution"
            ? "amber"
            : name === "danger" || name === "important"
              ? "rose"
              : name === "tip" || name === "success"
                ? "emerald"
                : (attrs.tone || attrs.color || "sky").toLowerCase();

        const palette =
          NAMED_COLOR_PALETTE[calloutTone] ?? NAMED_COLOR_PALETTE.sky;

        data.hName = "div";
        data.hProperties = {
          className: "md-directive-callout",
          "data-directive-type": name,
          style: {
            borderLeft: `3px solid ${palette.text}`,
            backgroundColor: palette.bg,
            borderColor: palette.border,
            color: "#1c1917",
            padding: "0.75rem 1rem",
            borderRadius: "0.5rem",
            margin: "0.85rem 0",
          },
        };
        return;
      }

      // Text or Leaf Directives for coloring / highlighting
      const attrColor = (attrs.color || attrs.tone || attrs.fg || "").trim();
      const paletteFromName = NAMED_COLOR_PALETTE[name];
      const paletteFromAttr = NAMED_COLOR_PALETTE[attrColor.toLowerCase()];

      if (paletteFromName) {
        data.hName = "span";
        data.hProperties = {
          className: "md-color-token",
          "data-color": name,
          style: {
            color: paletteFromName.text,
            backgroundColor: paletteFromName.bg,
            border: `1px solid ${paletteFromName.border}`,
            padding: "0.08rem 0.4rem",
            borderRadius: "0.35rem",
            fontWeight: 500,
          },
        };
      } else if (name === "color" || name === "fg" || name === "text") {
        const resolvedText = paletteFromAttr
          ? paletteFromAttr.text
          : attrColor || "#2563eb";
        const resolvedBg = paletteFromAttr
          ? paletteFromAttr.bg
          : "rgba(37, 99, 235, 0.08)";
        data.hName = "span";
        data.hProperties = {
          className: "md-color-custom",
          style: {
            color: resolvedText,
            backgroundColor: resolvedBg,
            padding: "0.08rem 0.38rem",
            borderRadius: "0.35rem",
            fontWeight: 500,
          },
        };
      } else if (name === "highlight" || name === "mark" || name === "bg") {
        const palette = paletteFromAttr ?? NAMED_COLOR_PALETTE.amber;
        data.hName = "mark";
        data.hProperties = {
          className: "md-highlight-token",
          style: {
            color: palette.text,
            backgroundColor: palette.bg,
            border: `1px solid ${palette.border}`,
            padding: "0.08rem 0.4rem",
            borderRadius: "0.35rem",
          },
        };
      } else {
        // Fallback for any custom directive name
        data.hName = "span";
        data.hProperties = {
          className: "md-directive-generic",
          style: {
            color: "#0369a1",
            backgroundColor: "rgba(14, 165, 233, 0.1)",
            padding: "0.08rem 0.35rem",
            borderRadius: "0.3rem",
          },
        };
      }
    });
  };
}

function extractNodeText(children: React.ReactNode): string {
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(extractNodeText).join("");
  }
  if (React.isValidElement(children)) {
    const props = children.props as { children?: React.ReactNode };
    return extractNodeText(props.children);
  }
  return "";
}

const StudyHubMarkdownImage: React.FC<
  React.ImgHTMLAttributes<HTMLImageElement>
> = ({ src, alt, ...props }) => {
  const rawSrc = typeof src === "string" ? src.trim() : "";
  const isCustomProtocol =
    rawSrc.startsWith("studyhub://") || rawSrc.startsWith("asset://");

  const [resolvedSrc, setResolvedSrc] = useState<string>(() => {
    if (!rawSrc) return "";
    const cached = getCachedStudyHubImage(rawSrc);
    if (cached) return cached;
    return rawSrc;
  });

  useEffect(() => {
    if (!rawSrc) return;
    const cached = getCachedStudyHubImage(rawSrc);
    if (cached) {
      setResolvedSrc(cached);
      return;
    }
    if (isCustomProtocol && !isTauriRuntime()) {
      resolveStudyHubImageDataUrl(rawSrc).then((dataUrl) => {
        if (dataUrl) setResolvedSrc(dataUrl);
      });
    } else {
      setResolvedSrc(rawSrc);
    }
  }, [isCustomProtocol, rawSrc]);

  const handleImageError = () => {
    if (isCustomProtocol) {
      resolveStudyHubImageDataUrl(rawSrc).then((dataUrl) => {
        if (dataUrl && dataUrl !== resolvedSrc) {
          setResolvedSrc(dataUrl);
        }
      });
    }
  };

  if (!rawSrc) return null;

  return (
    <span className="my-3 block overflow-hidden rounded-xl border border-stone-200/90 bg-stone-50/70 p-2 shadow-2xs">
      <img
        src={resolvedSrc}
        alt={alt || "Embedded study asset"}
        onError={handleImageError}
        className="max-h-96 w-auto max-w-full rounded-lg object-contain mx-auto"
        {...props}
      />
      {(alt || isCustomProtocol) && (
        <span className="mt-1.5 flex items-center justify-between px-1 text-[11px] text-stone-500">
          <span className="font-medium text-stone-600">
            {alt || "Local Image Asset"}
          </span>
          {isCustomProtocol && (
            <code className="rounded bg-stone-200/80 px-1.5 py-0.5 font-mono text-[10px] text-stone-600">
              {rawSrc}
            </code>
          )}
        </span>
      )}
    </span>
  );
};

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  markdown,
  className = "",
  highlightedHeader = null,
  compact = false,
}) => {
  const normalizedTargetSlug = useMemo(
    () => (highlightedHeader ? slugifyHeading(highlightedHeader) : null),
    [highlightedHeader]
  );

  if (!markdown.trim()) {
    return (
      <div
        className={`text-stone-400 italic ${
          compact ? "text-xs py-2" : "text-sm py-6"
        } ${className}`}
      >
        Start writing Markdown (supports `:emerald[colored text]`, `:rose[alerts]`, `![image](studyhub://...)`, tables, and code blocks)...
      </div>
    );
  }

  return (
    <div
      className={`markdown-preview-surface ${
        compact ? "markdown-preview-compact" : ""
      } ${className}`}
    >
      <ReactMarkdown
        urlTransform={(url) => url}
        remarkPlugins={[remarkGfm, remarkDirective, remarkColorDirectives]}
        components={{
          img: (imgProps) => <StudyHubMarkdownImage {...imgProps} />,
          h1: ({ children, ...props }) => {
            const text = extractNodeText(children);
            const slug = slugifyHeading(text);
            const isHighlighted =
              normalizedTargetSlug !== null && slug === normalizedTargetSlug;
            return (
              <h1
                id={`heading-${slug}`}
                data-heading-slug={slug}
                className={
                  isHighlighted
                    ? "rounded-lg bg-amber-100/80 px-2.5 py-1 ring-2 ring-amber-400 transition-all"
                    : undefined
                }
                {...props}
              >
                {children}
              </h1>
            );
          },
          h2: ({ children, ...props }) => {
            const text = extractNodeText(children);
            const slug = slugifyHeading(text);
            const isHighlighted =
              normalizedTargetSlug !== null && slug === normalizedTargetSlug;
            return (
              <h2
                id={`heading-${slug}`}
                data-heading-slug={slug}
                className={
                  isHighlighted
                    ? "rounded-lg bg-amber-100/80 px-2.5 py-1 ring-2 ring-amber-400 transition-all"
                    : undefined
                }
                {...props}
              >
                {children}
              </h2>
            );
          },
          h3: ({ children, ...props }) => {
            const text = extractNodeText(children);
            const slug = slugifyHeading(text);
            const isHighlighted =
              normalizedTargetSlug !== null && slug === normalizedTargetSlug;
            return (
              <h3
                id={`heading-${slug}`}
                data-heading-slug={slug}
                className={
                  isHighlighted
                    ? "rounded-lg bg-amber-100/80 px-2 py-0.5 ring-2 ring-amber-400 transition-all"
                    : undefined
                }
                {...props}
              >
                {children}
              </h3>
            );
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownPreview;
