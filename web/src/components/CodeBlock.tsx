import type { ReactNode } from 'react';

interface CodeBlockProps {
  children: string;
  /** Optional header row (e.g. source + score, or line range + date). */
  header?: ReactNode;
  maxHeight?: number;
  resizable?: boolean;
}

/** Themed monospace block for memory chunks, search hits, task payloads, etc. */
export function CodeBlock({ children, header, maxHeight = 300, resizable = false }: CodeBlockProps) {
  return (
    <div className="code-block">
      {header && <div className="code-block-head">{header}</div>}
      <pre className="code-block-pre" style={{ maxHeight, resize: resizable ? 'vertical' : 'none' }}>
        {children}
      </pre>
    </div>
  );
}
