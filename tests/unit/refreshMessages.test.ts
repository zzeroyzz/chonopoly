jest.mock("server-only", () => ({}), { virtual: true });

import {
  DEGRADED_MESSAGES,
  IN_FLIGHT_MESSAGE,
  NO_COMPS_MESSAGE,
} from "@/lib/comps/refreshMessages";

describe("refresh messages", () => {
  it("says a missing key in words, and points at entering comps by hand", () => {
    expect(DEGRADED_MESSAGES.no_key).toContain("isn't connected");
    expect(DEGRADED_MESSAGES.no_key).toContain("by hand");
  });

  it("tells an exhausted quota apart from a missing key", () => {
    // Nothing here should send someone hunting for a key they already have.
    expect(DEGRADED_MESSAGES.quota).toContain("used up");
    expect(DEGRADED_MESSAGES.quota).not.toContain("isn't connected");
  });

  it("ends every failure on something the user can still do", () => {
    for (const message of Object.values(DEGRADED_MESSAGES)) {
      expect(message).toMatch(/by hand|Try again/);
    }
  });

  it("says when another lookup is already running", () => {
    expect(IN_FLIGHT_MESSAGE).toContain("already running");
  });

  it("reports finding nothing as nothing, with the way forward", () => {
    expect(NO_COMPS_MESSAGE).toContain("No recorded sales");
    expect(NO_COMPS_MESSAGE).toContain("by hand");
  });
});
