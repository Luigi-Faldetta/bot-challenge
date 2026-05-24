// Sticky header for the chat surface — title + hint pills.
// Pure presentational: no state, no callbacks. Lives in its own file so
// chat.tsx stays an orchestrator under the 150-line component rule.

const HINT_PILL_CLASS =
  "rounded-md bg-blue-50 px-2 py-0.5 font-mono text-xs font-medium text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900";

export function ChatHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <h1 className="text-lg font-semibold tracking-tight">Workfully Screening Bot</h1>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
        <span>Try:</span>
        <kbd className={HINT_PILL_CLASS}>/screen</kbd>
        <kbd className={HINT_PILL_CLASS}>/newjob</kbd>
        <kbd className={HINT_PILL_CLASS}>/cancel</kbd>
        <span className="text-zinc-500 dark:text-zinc-400">or just describe what you want.</span>
      </div>
    </header>
  );
}
