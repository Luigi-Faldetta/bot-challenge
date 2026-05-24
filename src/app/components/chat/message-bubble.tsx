// Single message in the conversation history. Markdown-light: bold (**...**),
// bullet lists (lines starting with "- "), and paragraph breaks. Avoids a full
// markdown renderer dep for what's a tiny subset of formatting.

import { type ReactNode } from "react";

export type BubbleMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

export function MessageBubble({ message }: { message: BubbleMessage }) {
  const isUser = message.role === "user";
  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
      data-role={message.role}
    >
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-[1.6] whitespace-pre-wrap break-words ${
          isUser
            ? "bg-blue-600 text-white shadow-sm"
            : "bg-zinc-50 text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-800"
        }`}
      >
        {renderLight(message.text)}
      </div>
    </div>
  );
}

/** Tiny inline renderer: **bold**, "- bullet" lines, blank-line paragraphs. */
function renderLight(text: string): ReactNode {
  const lines = text.split("\n");
  const elements: ReactNode[] = [];
  let bulletBuffer: string[] = [];

  const flushBullets = (key: number) => {
    if (bulletBuffer.length > 0) {
      elements.push(
        <ul key={`ul-${key}`} className="my-1 ml-4 list-disc">
          {bulletBuffer.map((b, i) => (
            <li key={i}>{renderInline(b)}</li>
          ))}
        </ul>,
      );
      bulletBuffer = [];
    }
  };

  lines.forEach((line, i) => {
    if (line.startsWith("- ")) {
      bulletBuffer.push(line.slice(2));
      return;
    }
    flushBullets(i);
    if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(<div key={i}>{renderInline(line)}</div>);
    }
  });
  flushBullets(lines.length);

  return elements;
}

/** **bold** segments only. */
function renderInline(line: string): ReactNode {
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}
