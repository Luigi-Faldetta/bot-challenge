// Result<T, E> — discriminated-union return type for use cases.
//
// Reasoning: throwing is reserved for true programmer errors (invariants broken
// inside our own code). Expected failure modes — invalid input, port returning
// a domain error, an LLM extraction failure — get carried back to the caller
// as data, so route handlers can map them to user-facing replies and tests can
// assert on them without `expect().toThrow()`.

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export function isOk<T, E>(r: Result<T, E>): r is { ok: true; value: T } {
  return r.ok;
}

export function isErr<T, E>(r: Result<T, E>): r is { ok: false; error: E } {
  return !r.ok;
}
