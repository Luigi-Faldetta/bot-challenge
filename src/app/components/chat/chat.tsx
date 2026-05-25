"use client";

// Orchestrator for the chat surface. Owns the message list, input value, and
// busy state; delegates header chrome to <ChatHeader> and the input form to
// <ChatInputBar>. Stays under the 150-line component rule.

import { useEffect, useRef, useState } from "react";
import { MessageBubble, type BubbleMessage } from "./message-bubble";
import { ChatHeader } from "./chat-header";
import { ChatInputBar } from "./chat-input-bar";
import { consumeSSE } from "./sse";

const INITIAL_BOT_MESSAGE: BubbleMessage = {
  id: "greeting",
  role: "assistant",
  text:
    "Hi! I can help you **screen a candidate** against a job description, or **draft a new job description**. Just tell me what you'd like to do, or use /screen or /newjob. Type /cancel anytime to go back.",
};

export function Chat() {
  const [messages, setMessages] = useState<BubbleMessage[]>([INITIAL_BOT_MESSAGE]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  const append = (m: BubbleMessage) => setMessages((prev) => [...prev, m]);

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    setBusy(true);
    append({ id: crypto.randomUUID(), role: "user", text });
    setInput("");

    // why: defer creating the assistant bubble until the first chunk arrives,
    // so the "Thinking…" indicator isn't paired with an empty placeholder.
    let botId: string | null = null;

    try {
      const res = await fetch("/api/conversation/message/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok || !res.body) {
        append({
          id: crypto.randomUUID(),
          role: "assistant",
          text: "Something went wrong — please try again.",
        });
        return;
      }
      await consumeSSE(res.body, {
        onChunk: (chunkText) => {
          if (botId === null) {
            botId = crypto.randomUUID();
            append({ id: botId, role: "assistant", text: chunkText });
            return;
          }
          const id = botId;
          setMessages((prev) =>
            prev.map((m) => (m.id === id ? { ...m, text: m.text + chunkText } : m)),
          );
        },
      });
    } catch {
      append({
        id: crypto.randomUUID(),
        role: "assistant",
        text: "Network error — please check your connection and try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    if (busy) return;
    setBusy(true);
    append({
      id: crypto.randomUUID(),
      role: "user",
      text: `📎 Uploaded ${file.name}`,
    });
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.text) {
        append({
          id: crypto.randomUUID(),
          role: "assistant",
          text: data.message ?? "I couldn't read that file. Please paste the text instead.",
        });
        return;
      }
      await send(data.text);
    } catch {
      append({
        id: crypto.randomUUID(),
        role: "assistant",
        text: "Network error — please check your connection and try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-[100dvh] flex-col">
      <ChatHeader />

      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-6"
        aria-live="polite"
      >
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {busy ? (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span
              className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600 dark:border-zinc-700 dark:border-t-zinc-300"
              role="presentation"
            />
            <span>Thinking…</span>
          </div>
        ) : null}
      </div>

      <ChatInputBar
        value={input}
        onChange={setInput}
        onSubmit={() => send(input)}
        onFileSelected={upload}
        disabled={busy}
      />
    </div>
  );
}
