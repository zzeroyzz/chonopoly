import { integrationLines, type RentCastStatus } from "@/lib/rentcast/integrationStatus";

function status(used: number, overrides: Partial<RentCastStatus> = {}): RentCastStatus {
  const limit = 50;
  return {
    connected: true,
    mode: "live",
    usage: { used, limit, fraction: used / limit, monthStart: "2026-10-01T00:00:00.000Z" },
    warningFraction: 0.8,
    nearLimit: used / limit >= 0.8,
    atLimit: used >= limit,
    ...overrides,
  };
}

describe("integrationLines", () => {
  it("shows this month's usage against the limit, with no warning well under it", () => {
    const lines = integrationLines(status(12));
    expect(lines.connected).toBe("Connected");
    expect(`${lines.used}${lines.ofLimit}`).toBe("12 of 50 this month");
    expect(lines.left).toBe("38 left");
    expect(lines.warning).toBeNull();
  });

  it("warns at 80% and says how many are left", () => {
    const lines = integrationLines(status(40));
    expect(lines.warning?.kind).toBe("near_limit");
    expect(lines.warning?.text).toContain("80%");
    expect(lines.warning?.text).toContain("10 left");
  });

  it("says what still works once the allowance is gone, not the near-limit warning", () => {
    const lines = integrationLines(status(50));
    expect(lines.warning?.kind).toBe("at_limit");
    expect(lines.warning?.text).toContain("used up");
    expect(lines.warning?.text).toContain("by hand");
    expect(lines.left).toBe("0 left");
  });

  it("reports a missing key in words and never shows one", () => {
    const lines = integrationLines(status(0, { connected: false }));
    expect(lines.connected).toBe("Not connected");
    expect(lines.noKeyNote).toContain("entered by hand");
    const everything = JSON.stringify(lines);
    expect(everything).not.toContain("•••");
    expect(everything).not.toContain("API key");
  });

  it("explains a deployment that never calls RentCast, and the cap it keeps", () => {
    const lines = integrationLines(
      status(0, {
        connected: false,
        mode: "mock",
        cacheWindowDays: 30,
        usage: { used: 0, limit: 45, planLimit: 50, fraction: 0, monthStart: "2026-10-01T00:00:00.000Z" },
      })
    );
    expect(lines.mockNote).toContain("never calls RentCast");
    expect(lines.windowNote).toContain("once every 30 days");
    expect(lines.windowNote).toContain("stops at 45 of the plan's 50");
  });

  it("caps the bar at 100% even past the limit", () => {
    expect(integrationLines(status(60)).percent).toBe(100);
  });
});
