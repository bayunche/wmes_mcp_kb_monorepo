import { describe, expect, test } from "bun:test";

describe("workspace smoke test", () => {
  test("basic math", () => {
    expect(1 + 1).toBe(2);
  });
});
