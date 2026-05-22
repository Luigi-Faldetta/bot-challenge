import {
  Conversation,
  ConversationId,
  type ChatMessage,
} from "@/modules/conversation/domain/conversation";

const id = ConversationId("conv-123");

const msg = (
  overrides: Partial<ChatMessage> = {},
): ChatMessage => ({
  id: "m-1",
  role: "user",
  text: "hello",
  createdAt: new Date("2026-05-21T10:00:00Z"),
  ...overrides,
});

describe("Conversation", () => {
  it("create() starts in IDLE with empty history", () => {
    const c = Conversation.create(id);
    expect(c.id).toBe(id);
    expect(c.state).toEqual({ kind: "IDLE" });
    expect(c.messages).toEqual([]);
  });

  it("rebuild() restores any state + history from persistence", () => {
    const messages = [msg({ id: "m-1" }), msg({ id: "m-2", role: "assistant", text: "hi" })];
    const c = Conversation.rebuild(
      id,
      { kind: "SCREENING", step: "AWAITING_CV", jd: "the JD" },
      messages,
    );
    expect(c.state).toEqual({
      kind: "SCREENING",
      step: "AWAITING_CV",
      jd: "the JD",
    });
    expect(c.messages).toEqual(messages);
  });

  it("apply() drives the FSM and returns a new aggregate", () => {
    const c1 = Conversation.create(id);
    const c2 = c1.apply({ type: "COMMAND", command: "screen" });
    expect(c1.state).toEqual({ kind: "IDLE" }); // unchanged
    expect(c2.state).toEqual({ kind: "SCREENING", step: "AWAITING_JD" });
    expect(c2).not.toBe(c1);
    expect(c2.id).toBe(c1.id);
  });

  it("appendMessage() extends history without touching state", () => {
    const c1 = Conversation.create(id).apply({
      type: "COMMAND",
      command: "screen",
    });
    const c2 = c1.appendMessage(msg());
    expect(c1.messages).toEqual([]);
    expect(c2.messages).toHaveLength(1);
    expect(c2.state).toEqual(c1.state);
  });

  it("equals() compares by id (entity equality, not structural)", () => {
    const a = Conversation.create(id);
    const b = Conversation.create(id).apply({
      type: "COMMAND",
      command: "screen",
    });
    expect(a.equals(b)).toBe(true); // same id, different state
    const other = Conversation.create(ConversationId("conv-456"));
    expect(a.equals(other)).toBe(false);
  });
});
