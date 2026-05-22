// Minimal Entity base — identity-based equality, not structural.
// Aggregates extend this; value objects do not (they're structurally equal).
// Kept deliberately tiny: just enough to make the DDD intent visible without
// inventing a framework.

export abstract class Entity<Id extends string | number> {
  constructor(public readonly id: Id) {}

  equals(other: Entity<Id>): boolean {
    return this.constructor === other.constructor && this.id === other.id;
  }
}
