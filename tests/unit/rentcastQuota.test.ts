import { normalizeAddress, addressHash, foldDiacritics } from "@/lib/property/address";

jest.mock("server-only", () => ({}), { virtual: true });

/**
 * The quota guard's rules, each tested on its own.
 *
 * Nothing here touches the network or the database. The client is imported
 * lazily per test so it reads the environment as set, and `fetch` is replaced
 * everywhere — a live call from a test would spend one of the fifty.
 */

const ORIGINAL = {
  key: process.env.RENTCAST_API_KEY,
  mode: process.env.RENTCAST_MODE,
  vercel: process.env.VERCEL_ENV,
};

function restore() {
  for (const [name, value] of [
    ["RENTCAST_API_KEY", ORIGINAL.key],
    ["RENTCAST_MODE", ORIGINAL.mode],
    ["VERCEL_ENV", ORIGINAL.vercel],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

async function client() {
  jest.resetModules();
  return import("@/lib/rentcast/client");
}

afterEach(() => {
  restore();
  jest.restoreAllMocks();
});

// ─── 6. Mock mode ─────────────────────────────────────────────────────────────

describe("mock mode", () => {
  it("is the default when there is no Vercel environment at all", async () => {
    delete process.env.VERCEL_ENV;
    delete process.env.RENTCAST_MODE;

    const { rentCastMode } = await client();
    // Local and CI. Failing safe matters more than convenience here.
    expect(rentCastMode()).toBe("mock");
  });

  it("is mock on preview", async () => {
    process.env.VERCEL_ENV = "preview";
    delete process.env.RENTCAST_MODE;

    const { rentCastMode } = await client();
    // A preview deploy quietly eating the month's quota is a cost nobody
    // notices until screening stops working.
    expect(rentCastMode()).toBe("mock");
  });

  it("is mock on Vercel's development environment", async () => {
    process.env.VERCEL_ENV = "development";
    delete process.env.RENTCAST_MODE;

    expect((await client()).rentCastMode()).toBe("mock");
  });

  it("is live only on production", async () => {
    process.env.VERCEL_ENV = "production";
    delete process.env.RENTCAST_MODE;

    expect((await client()).rentCastMode()).toBe("live");
  });

  it("lets RENTCAST_MODE force either way", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.RENTCAST_MODE = "mock";
    expect((await client()).rentCastMode()).toBe("mock");

    delete process.env.VERCEL_ENV;
    process.env.RENTCAST_MODE = "live";
    expect((await client()).rentCastMode()).toBe("live");
  });

  it("serves fixtures without opening a socket, and bills nothing", async () => {
    delete process.env.VERCEL_ENV;
    process.env.RENTCAST_MODE = "mock";
    process.env.RENTCAST_API_KEY = "a-real-key-that-must-not-be-used";

    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const { fetchValueEstimate } = await client();
    const result = await fetchValueEstimate({ address: "9 Test Rd, Atlanta, GA 30310" });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.billable).toBe(false);
    expect(result.mode).toBe("mock");
  });

  it("echoes the requested address so cache keys stay distinct", async () => {
    delete process.env.VERCEL_ENV;
    process.env.RENTCAST_MODE = "mock";
    process.env.RENTCAST_API_KEY = "k";
    global.fetch = jest.fn() as unknown as typeof fetch;

    const { fetchValueEstimate } = await client();
    const a = await fetchValueEstimate({ address: "1 First St" });
    const b = await fetchValueEstimate({ address: "2 Second St" });

    // A mock that always claimed one address would collapse every house in a
    // test onto one cache entry, hiding the bug this work exists to prevent.
    if (!a.ok || !b.ok) throw new Error("expected both to succeed");
    expect(a.data.subjectProperty?.formattedAddress).toBe("1 First St");
    expect(b.data.subjectProperty?.formattedAddress).toBe("2 Second St");
    // The comps stay realistic — tests assert against their numbers.
    expect(a.data.comparables?.length).toBeGreaterThan(0);
  });
});

// ─── The billable rule ────────────────────────────────────────────────────────

describe("what counts against the quota", () => {
  async function liveClient() {
    process.env.VERCEL_ENV = "production";
    process.env.RENTCAST_MODE = "live";
    process.env.RENTCAST_API_KEY = "test-key";
    return client();
  }

  function stub(status: number, body: unknown = {}) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as unknown as typeof fetch;
  }

  it("counts a rejected key — this is the undercount that was found", async () => {
    // RentCast's dashboard read 3 while the app reported 1. The two missing
    // requests were 403s, recorded free on the theory that a rejected key does
    // no work. It reaches their API, so it counts.
    stub(403, { message: "The provided API key is not associated with an active API subscription" });

    const { fetchValueEstimate } = await liveClient();
    const result = await fetchValueEstimate({ address: "128 Maple St" });

    if (result.ok) throw new Error("expected a failure");
    expect(result.failure).toBe("no_key");
    expect(result.billable).toBe(true);
  });

  it("counts a 401 the same way", async () => {
    stub(401, { message: "Invalid API key" });
    const { fetchValueEstimate } = await liveClient();
    expect((await fetchValueEstimate({ address: "x" })).billable).toBe(true);
  });

  it("counts a 429", async () => {
    // Whether RentCast bills it is their call, not ours to assume away.
    stub(429, { message: "Monthly request quota exceeded" });
    const { fetchValueEstimate } = await liveClient();
    const result = await fetchValueEstimate({ address: "x" });

    if (result.ok) throw new Error("expected a failure");
    expect(result.failure).toBe("quota");
    expect(result.billable).toBe(true);
  });

  it("counts a 5xx", async () => {
    stub(503);
    const { fetchValueEstimate } = await liveClient();
    expect((await fetchValueEstimate({ address: "x" })).billable).toBe(true);
  });

  it("counts a 404 — it looked and found nothing", async () => {
    stub(404, { message: "No data" });
    const { fetchValueEstimate } = await liveClient();
    expect((await fetchValueEstimate({ address: "x" })).billable).toBe(true);
  });

  it("counts a network error, because it may have been served", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNRESET")) as unknown as typeof fetch;
    process.env.RENTCAST_MODE = "live";
    process.env.RENTCAST_API_KEY = "test-key";

    const { fetchValueEstimate } = await client();
    const result = await fetchValueEstimate({ address: "x" });

    if (result.ok) throw new Error("expected a failure");
    expect(result.failure).toBe("network_error");
    // Over-reporting costs headroom; under-reporting costs a cut-off
    // mid-screening with no warning.
    expect(result.billable).toBe(true);
  });

  it("does not count a request that never opened a socket", async () => {
    process.env.RENTCAST_MODE = "live";
    delete process.env.RENTCAST_API_KEY;

    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const { fetchValueEstimate } = await client();
    const result = await fetchValueEstimate({ address: "x" });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.billable).toBe(false);
  });

  it("reconciles the observed 3 against the 1 we reported", async () => {
    // The exact sequence from production: 4 local refusals, 2 × 403, 1 × 200.
    // RentCast counted 3. Under the corrected rule, so do we.
    const outcomes: boolean[] = [];

    process.env.RENTCAST_MODE = "live";
    for (let i = 0; i < 4; i++) {
      delete process.env.RENTCAST_API_KEY;
      const { fetchValueEstimate } = await client();
      outcomes.push((await fetchValueEstimate({ address: "a" })).billable);
    }

    process.env.RENTCAST_API_KEY = "test-key";
    for (let i = 0; i < 2; i++) {
      stub(403, { message: "not associated with an active API subscription" });
      const { fetchValueEstimate } = await client();
      outcomes.push((await fetchValueEstimate({ address: "a" })).billable);
    }

    stub(200, { price: 1, comparables: [] });
    const { fetchValueEstimate } = await client();
    outcomes.push((await fetchValueEstimate({ address: "a" })).billable);

    expect(outcomes.filter(Boolean)).toHaveLength(3);
  });
});

// ─── 5. The monthly cap ───────────────────────────────────────────────────────

describe("the monthly cap", () => {
  it("stops below the plan limit, leaving headroom", async () => {
    const { MONTHLY_REQUEST_CAP, FREE_PLAN_MONTHLY_REQUESTS } = await client();

    // Our count is an estimate of theirs, so the app must stop before the real
    // ceiling rather than discover it by being cut off.
    expect(MONTHLY_REQUEST_CAP).toBe(45);
    expect(MONTHLY_REQUEST_CAP).toBeLessThan(FREE_PLAN_MONTHLY_REQUESTS);
  });

  it("uses a 30-day reuse window", async () => {
    expect((await client()).CACHE_WINDOW_DAYS).toBe(30);
  });
});

// ─── 7. Address normalization ─────────────────────────────────────────────────

describe("address folding", () => {
  const sw = { addressLine1: "1653 Sylvan Rd SW", city: "Atlanta", state: "GA", zip: "30310" };
  const accented = { addressLine1: "1653 sylvan rd św", city: "Atlanta", state: "GA", zip: "30310" };

  it("folds the real production pair to one address", () => {
    // These became two property rows and burned a request on the wrong one.
    expect(normalizeAddress(accented)).toBe(normalizeAddress(sw));
    expect(normalizeAddress(sw)).toBe("1653 SYLVAN RD SW ATLANTA GA 30310");
  });

  it("gives them the same hash, so dedupe catches them going forward", () => {
    expect(addressHash(accented)).toBe(addressHash(sw));
  });

  it("folds before stripping, which is the whole fix", () => {
    // The old order deleted the accented letter instead of folding it: "ŚW"
    // became " W" while "SW" stayed "SW".
    expect(foldDiacritics("ŚW")).toBe("SW");
    expect(foldDiacritics("św")).toBe("sw");
  });

  it("handles the accents a mistyped US address actually produces", () => {
    expect(foldDiacritics("Peña")).toBe("Pena");
    expect(foldDiacritics("Köln")).toBe("Koln");
    expect(foldDiacritics("Çirçle")).toBe("Circle");
    expect(foldDiacritics("Ångström")).toBe("Angstrom");
  });

  it("folds letters with no combining form", () => {
    // NFD leaves these whole, so they need naming individually.
    expect(foldDiacritics("Łódź")).toBe("Lodz");
    expect(foldDiacritics("Øre")).toBe("Ore");
  });

  it("folds the city too", () => {
    const a = { addressLine1: "1 Main St", city: "Peña Blanca", state: "NM", zip: "87041" };
    const b = { addressLine1: "1 Main St", city: "Pena Blanca", state: "NM", zip: "87041" };
    expect(normalizeAddress(a)).toBe(normalizeAddress(b));
  });

  it("still keeps genuinely different addresses apart", () => {
    // Folding must not make everything match everything.
    const a = { addressLine1: "1653 Sylvan Rd SW", city: "Atlanta", state: "GA", zip: "30310" };
    const b = { addressLine1: "1653 Sylvan Rd NW", city: "Atlanta", state: "GA", zip: "30310" };
    const c = { addressLine1: "1654 Sylvan Rd SW", city: "Atlanta", state: "GA", zip: "30310" };

    expect(normalizeAddress(a)).not.toBe(normalizeAddress(b));
    expect(normalizeAddress(a)).not.toBe(normalizeAddress(c));
    expect(addressHash(a)).not.toBe(addressHash(b));
  });

  it("leaves unaccented addresses byte-identical to before", () => {
    // The folding must be a no-op for the overwhelming majority of rows, or it
    // would invalidate every stored hash.
    expect(normalizeAddress({ addressLine1: "128 Maple St", city: "Duluth", state: "GA", zip: "30096" }))
      .toBe("128 MAPLE ST DULUTH GA 30096");
    expect(foldDiacritics("128 Maple St")).toBe("128 Maple St");
  });
});
