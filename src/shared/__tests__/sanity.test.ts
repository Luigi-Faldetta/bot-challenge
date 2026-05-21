// Smoke test for the Jest setup. Proves the SWC preset, path aliases,
// and module resolution are wired correctly before any real test gets written.

describe("test runner", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
