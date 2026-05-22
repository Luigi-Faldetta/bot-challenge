// Marker base for value objects — structural equality via JSON serialization.
// Sufficient for the scope here (MatchScore, etc.) where VOs are flat,
// JSON-safe shapes. If we ever need VOs containing Date/Map/Set we'll
// override `equals` in the subclass.

export abstract class ValueObject<Props extends object> {
  protected constructor(public readonly props: Readonly<Props>) {
    Object.freeze(this.props);
  }

  equals(other: ValueObject<Props>): boolean {
    return (
      this.constructor === other.constructor &&
      JSON.stringify(this.props) === JSON.stringify(other.props)
    );
  }
}
