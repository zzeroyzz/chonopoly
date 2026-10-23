import {
  forceCost,
  refreshControls,
  sourceLine,
  type RefreshStatus,
} from "@/lib/comps/refreshControls";

function status(overrides: Partial<RefreshStatus> = {}): RefreshStatus {
  return {
    usage: { used: 3, cap: 45, planLimit: 50, remaining: 42, atCap: false },
    mode: "live",
    connected: true,
    locked: false,
    fetchedAt: null,
    nextRefreshAt: null,
    canForce: true,
    canRebuild: false,
    windowDays: 30,
    ...overrides,
  };
}

const LOCKED = {
  locked: true,
  fetchedAt: "2026-10-18T12:00:00.000Z",
  nextRefreshAt: "2026-11-17T12:00:00.000Z",
};

describe("refreshControls", () => {
  it("offers plain Refresh on an unlocked house", () => {
    const controls = refreshControls(status());
    expect(controls.button).toBe("refresh");
    expect(controls.lockLine).toBeNull();
    expect(controls.notice).toBeNull();
  });

  it("offers Refresh early on a locked house, and says when it opens again", () => {
    const controls = refreshControls(status(LOCKED));
    expect(controls.button).toBe("force");
    expect(controls.lockLine).toBe("Comps from Oct 18 · refresh available Nov 17");
  });

  it("lets only the owner refresh early", () => {
    expect(refreshControls(status({ ...LOCKED, canForce: false })).forceAllowed).toBe(false);
    expect(refreshControls(status({ ...LOCKED, canForce: true })).forceAllowed).toBe(true);
  });

  it("removes Refresh with no key and says why, pointing at entering by hand", () => {
    const controls = refreshControls(status({ connected: false }));
    expect(controls.button).toBe("none");
    expect(controls.notice?.kind).toBe("unavailable");
    expect(controls.notice?.text).toContain("isn't connected");
    expect(controls.notice?.text).toContain("by hand");
  });

  it("removes Refresh at the monthly cap and says what is left to do", () => {
    const controls = refreshControls(
      status({ usage: { used: 45, cap: 45, planLimit: 50, remaining: 0, atCap: true } })
    );
    expect(controls.button).toBe("none");
    expect(controls.notice?.kind).toBe("cap");
    expect(controls.notice?.text).toContain("45 of 45");
    expect(controls.notice?.text).toContain("until next month");
    expect(controls.notice?.text).toContain("by hand");
  });

  it("puts a missing key ahead of the cap, since nothing could be pulled anyway", () => {
    const controls = refreshControls(
      status({ connected: false, usage: { used: 45, cap: 45, planLimit: 50, remaining: 0, atCap: true } })
    );
    expect(controls.notice?.kind).toBe("unavailable");
  });

  it("offers rebuild only when a response was saved", () => {
    expect(refreshControls(status({ canRebuild: true })).rebuild).toBe(true);
    expect(refreshControls(status({ canRebuild: false })).rebuild).toBe(false);
  });

  it("shows plain Refresh before the status has loaded", () => {
    expect(refreshControls(null).button).toBe("refresh");
  });
});

describe("forceCost", () => {
  it("names the cost against what is left", () => {
    expect(forceCost(42)).toBe("Uses 1 of 42 remaining this month.");
  });
});

describe("sourceLine", () => {
  it("says a lookup was fresh", () => {
    expect(sourceLine("live")).toBe("Comps fresh from RentCast");
  });

  it("says a saved response was used, so it is not mistaken for fresh", () => {
    expect(sourceLine("cached")).toBe("Comps from the saved response");
    expect(sourceLine("rebuilt")).toBe("Comps rebuilt from the saved response");
  });

  it("says nothing for an unknown or missing source", () => {
    expect(sourceLine(null)).toBeNull();
    expect(sourceLine("something-new")).toBeNull();
  });
});
