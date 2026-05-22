// Events the FSM accepts. Three only:
// - USER_MESSAGE: free-text content from the user (treated as JD or CV
//   contextually based on current state).
// - COMMAND: a recognised slash command. The application layer is responsible
//   for parsing user input into a COMMAND when it matches; everything else
//   becomes USER_MESSAGE.
// - SCREENING_COMPLETED: emitted by the application layer when the LLM has
//   returned a result while in SCREENING/PROCESSING. The state holds no
//   reference to the result itself — that's persisted by the screening
//   repository; the conversation only needs to know it's done.

export type SlashCommand = "screen" | "newjob" | "cancel";

export type ConversationEvent =
  | { readonly type: "USER_MESSAGE"; readonly text: string }
  | { readonly type: "COMMAND"; readonly command: SlashCommand }
  | { readonly type: "SCREENING_COMPLETED" };
