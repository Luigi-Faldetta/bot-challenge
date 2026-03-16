# Workfully Technical Challenge

1. Preferably: You can just decide to show any project you are proud of. Explain what, why, and what you would do differently.

2. Or build the following proposal:

## Objective

Build a conversational bot powered by a finite state machine (FSM) that can:

1. Greet users and offer help
2. **Screen a candidate against a specific job description**
3. Guide a company through building a job description (mocked output; you don't need to build this)

---

## State Machine

```
┌─────────────┐
│    IDLE      │  ← Default. "I'm here to help."
│  (State 1)   │
└──────┬───┬──┘
       │   │
       │   └──────────────────────┐
       ▼                          ▼
┌──────────────┐          ┌───────────────┐
│  SCREENING   │          │  JOB_BUILDER  │
│  (State 2)   │          │  (State 3)    │
└──────┬───────┘          └──────┬────────┘
       │                         │
       │   ← /cancel or done →   │
       ▼                         ▼
    IDLE                      IDLE
```

### Transitions

| From        | To          | Trigger                                     |
| ----------- | ----------- | ------------------------------------------- |
| IDLE        | SCREENING   | User says "screen a candidate" or `/screen` |
| IDLE        | JOB_BUILDER | User says "create a job" or `/newjob`       |
| SCREENING   | IDLE        | Screening complete or `/cancel`             |
| JOB_BUILDER | IDLE        | Builder complete or `/cancel`               |

---

## Architecture

### Preferred Stack — not required.

| Layer       | Tech                          | Why                                   |
| ----------- | ----------------------------- | ------------------------------------- |
| Runtime     | Nextjs                        | Matches existing Workfully backend    |
| State store | Decide what database you need | Why you decided to use this database? |
| Language    | TypeScript                    | Matches existing Workfully stack      |
| AI          | Any                           | It has to be smart enough             |

### Project Structure

You decide what you think is best and explain it briefly. We can discuss it later.

### Key Design Decisions - Outputs we want to get from the challenge

**1. How did you decide to implement the state machine**

**2. The architecture you used and why**

**3. What database you used and why**

---

## Screening Flow (State 2) — Detail

1. User triggers screening → state = `SCREENING`
2. Bot asks: _"Select or Paste or upload the job description."_
3. User provides JD
4. Bot asks: _"Now paste or upload the candidate's CV."_
5. User provides CV

If the user sends `/cancel` at step 2–5, state resets to IDLE.
