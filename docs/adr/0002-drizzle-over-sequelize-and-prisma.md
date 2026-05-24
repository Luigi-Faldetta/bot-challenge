# ADR 0002 — Drizzle ORM, not Sequelize or Prisma

- **Status**: Accepted
- **Date**: 2026-05-21

## Context

The bot needs a Postgres adapter for the conversation aggregate and the screening result. The brief allows any ORM. Workfully's existing stack is **NestJS + Sequelize**, so the senior reviewer will absolutely ask why I chose differently.

Three candidates in 2026:

- **Sequelize** — mature, dynamic, callback-heavy, weak type inference.
- **Prisma** — schema-first with a separate `.prisma` file and a code generator. Strong DX, full ORM with relations.
- **Drizzle** — schema-as-TypeScript, no codegen, thin layer above SQL.

## Decision

Drizzle.

- Schema is defined in TypeScript (`src/shared/infrastructure/db/schema.ts`). No `.prisma` file, no generator step.
- Queries are SQL-shaped with type inference from the schema. The repository adapter (`postgres-conversation-repository.ts`) reads like SQL, not like dynamic finder magic.
- Migrations applied via `drizzle-kit push` for this take-home — no migration files; the simplest thing that works.

## Consequences

**Wins**:

- Type inference all the way through. The repository can't return a row shape that doesn't match the domain type.
- No build-step dependency on a schema generator. Edit a column, save, run.
- The SQL is right there in the file. Easy to reason about query cost.
- Onboarding for a new contributor: the schema file is short and readable in one minute.

**Costs**:

- Smaller ecosystem than Prisma. Some advanced features (computed columns, custom types) are coded by hand.
- No automatic migrations workflow. For production we'd switch to Drizzle Kit's migration-file generation.
- One more thing for a Sequelize-native team to learn if this code lived in the main Workfully repo (but the adapter is ~90 lines — translatable in an afternoon).

## Alternatives considered

- **Sequelize** — matches Workfully's stack. Dynamic model definitions, weaker type inference, mature ecosystem. Rejected here because:
  - The brief is graded on architecture demonstration, not stack alignment. The architecture is identical in either ORM — only the adapter changes.
  - Sequelize model classes would dominate the file's surface area and blur the boundary between domain and persistence. Drizzle stays out of the way.
- **Prisma** — best TypeScript DX of the three. Rejected because:
  - The `.prisma` file becomes a second source of truth that has to stay in sync with the TS domain types.
  - Codegen step adds friction (have to `prisma generate` after every schema change).
  - The relational features Prisma excels at aren't needed here — two tables, one FK, no joins beyond ordering messages by `createdAt`.

The dependency rule (domain doesn't know about the ORM at all) means swapping Drizzle for Sequelize or Prisma is mechanical work, contained to the infrastructure folder. The architectural choice is the port; the ORM is an implementation detail.
