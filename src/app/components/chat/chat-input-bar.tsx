// Input bar at the bottom of the chat surface — paperclip upload button,
// textarea, send button. Controlled by the parent: parent owns the input
// value + busy state, this component only handles UI events.

import { useRef } from "react";

type ChatInputBarProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onFileSelected: (file: File) => void;
  disabled: boolean;
};

export function ChatInputBar({
  value,
  onChange,
  onSubmit,
  onFileSelected,
  disabled,
}: ChatInputBarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <form
      className="flex items-end gap-2 border-t border-zinc-200 bg-white/80 p-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-zinc-300 text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
        disabled={disabled}
        aria-label="Upload a PDF or text file"
      >
        {/* Heroicons v2 outline / paperclip — MIT licensed, inlined to avoid an icon-library dep. */}
        <svg
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.75}
          stroke="currentColor"
          className="h-5 w-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13"
          />
        </svg>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,text/plain"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFileSelected(f);
          e.target.value = "";
        }}
      />
      <label htmlFor="chat-input" className="sr-only">
        Message
      </label>
      <textarea
        id="chat-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        rows={1}
        placeholder="Type a message, or paste the JD/CV…"
        className="min-h-[2.5rem] flex-1 resize-none rounded-2xl border border-zinc-300 bg-white px-4 py-2 text-sm transition-colors placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:placeholder:text-zinc-500"
        disabled={disabled}
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="cursor-pointer rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Send
      </button>
    </form>
  );
}
