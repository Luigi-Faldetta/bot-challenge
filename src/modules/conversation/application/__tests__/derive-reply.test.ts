import { deriveReply } from "@/modules/conversation/application/derive-reply";

describe("deriveReply (pure helper)", () => {
  const idle = { kind: "IDLE" } as const;
  const jobBuilder = { kind: "JOB_BUILDER" } as const;

  it("IDLE + /cancel → cancellation acknowledgement", () => {
    expect(
      deriveReply(idle, { type: "COMMAND", command: "cancel" }, idle),
    ).toMatch(/cancelled/i);
  });

  it("AWAITING_JD → ask for the JD", () => {
    expect(
      deriveReply(
        { kind: "SCREENING", step: "AWAITING_JD" },
        { type: "USER_MESSAGE", text: "x" },
        idle,
      ),
    ).toMatch(/job description/i);
  });

  it("AWAITING_CV → ask for the CV", () => {
    expect(
      deriveReply(
        { kind: "SCREENING", step: "AWAITING_CV", jd: "x" },
        { type: "USER_MESSAGE", text: "y" },
        { kind: "SCREENING", step: "AWAITING_JD" },
      ),
    ).toMatch(/CV/);
  });

  it("IDLE → JOB_BUILDER → entry reply", () => {
    expect(
      deriveReply(jobBuilder, { type: "COMMAND", command: "newjob" }, idle),
    ).toMatch(/sample JD/i);
  });

  it("JOB_BUILDER → IDLE via USER_MESSAGE → sample JD output", () => {
    expect(
      deriveReply(idle, { type: "USER_MESSAGE", text: "x" }, jobBuilder),
    ).toMatch(/sample job description/i);
  });

  it("JOB_BUILDER → JOB_BUILDER (no-op) → nudge reply", () => {
    expect(
      deriveReply(
        jobBuilder,
        { type: "COMMAND", command: "screen" },
        jobBuilder,
      ),
    ).toMatch(/job builder/i);
  });
});
