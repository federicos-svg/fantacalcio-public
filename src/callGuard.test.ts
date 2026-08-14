import { describe, expect, it } from "vitest";
import { requiredRoleError, REQUIRED_ROLE_MESSAGE } from "./callGuard.js";

describe("LIVE-03 role guard", () => {
  it("rejects a missing role with the visible message", () => {
    expect(requiredRoleError("")).toBe(REQUIRED_ROLE_MESSAGE);
  });

  it.each(["P", "D", "C", "A"] as const)("accepts explicit role %s", (role) => {
    expect(requiredRoleError(role)).toBeNull();
  });
});
