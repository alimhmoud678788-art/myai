import { memo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useTranslation } from "react-i18next";
import { openExternal } from "../../lib/links";

function CodeBlock({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();
  const cls: string = (children as { props?: { className?: string } } | undefined)?.props?.className ?? "";
  const lang = /language-([\w-]+)/.exec(cls)?.[1] ?? "code";

  const copy = async () => {
    await navigator.clipboard.writeText(ref.current?.innerText ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    // Code is always LTR, even inside an Arabic answer.
    <div dir="ltr" className="not-prose my-3 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-100">
      <div className="flex items-center justify-between bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300">
        <span className="font-mono">{lang}</span>
        <button onClick={copy} className="rounded px-2 py-0.5 hover:bg-zinc-700 hover:text-white">
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
      <pre ref={ref} className="overflow-x-auto p-3 font-mono text-sm leading-6">
        {children}
      </pre>
    </div>
  );
}

/** Raw HTML is NOT rendered (no rehype-raw) — protects against XSS from model output. */
export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div dir="auto" className="prose prose-zinc max-w-none dark:prose-invert prose-pre:p-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre: CodeBlock,
          a: ({ href, children }) => (
            <a href={href} onClick={openExternal} rel="noreferrer">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
