// Minimal SSE parser for fetch-Response bodies. The browser's EventSource
// API only handles GET requests, and we want POST (the message body has
// the user's text). So we read the body stream manually and dispatch by
// event name.

export type SSEHandlers = {
  onChunk: (text: string) => void;
  onDone?: (data: unknown) => void;
};

export async function consumeSSE(
  body: ReadableStream<Uint8Array>,
  handlers: SSEHandlers,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by a blank line ("\n\n").
    let eventEnd: number;
    while ((eventEnd = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, eventEnd);
      buffer = buffer.slice(eventEnd + 2);
      dispatch(rawEvent, handlers);
    }
  }
}

function dispatch(rawEvent: string, handlers: SSEHandlers): void {
  let eventName = "message";
  let dataLine = "";
  for (const line of rawEvent.split("\n")) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLine = line.slice(5).trim();
  }
  if (!dataLine) return;

  let data: unknown;
  try {
    data = JSON.parse(dataLine);
  } catch {
    return; // skip malformed
  }

  if (eventName === "chunk" && isChunk(data)) {
    handlers.onChunk(data.text);
  } else if (eventName === "done") {
    handlers.onDone?.(data);
  }
}

function isChunk(d: unknown): d is { text: string } {
  return typeof d === "object" && d !== null && typeof (d as { text?: unknown }).text === "string";
}
