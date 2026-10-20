import fixture from "@/lib/rentcast/fixtures/valueEstimate.json";
import { COMP_ELIGIBILITY } from "@/lib/comps/arv";

/**
 * `server-only` is a Next bundler marker with no Node resolution, so it is
 * stubbed here rather than removed from the client or mapped in the jest
 * config. The import is the thing that makes an accidental client-side import
 * of the API key a build error, so it must stay exactly where it is.
 */
jest.mock("server-only", () => ({}), { virtual: true });

/**
 * The RentCast client's failure paths.
 *
 * No live calls: `fetch` is replaced for every test. The client is server-only,
 * so it is imported lazily inside each test after the environment is set up.
 *
 * What is being pinned down here is which failures count against the quota.
 * A usage counter that over-reports is one people stop trusting and then stop
 * looking at, which defeats the point of having it.
 */

const ORIGINAL_KEY = process.env.RENTCAST_API_KEY;
const ORIGINAL_MODE = process.env.RENTCAST_MODE;

/**
 * These tests exercise the live HTTP path, and mock mode is now the default —
 * so each one opts in explicitly. Without this they would all short-circuit to
 * fixtures and assert nothing about request handling.
 */
beforeEach(() => {
  process.env.RENTCAST_MODE = "live";
});

function stubFetch(response: {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
}) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    json: response.json ?? (async () => ({})),
  }) as unknown as typeof fetch;
}

async function client() {
  // Re-imported per test so the module reads the current env.
  jest.resetModules();
  return import("@/lib/rentcast/client");
}

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.RENTCAST_API_KEY;
  else process.env.RENTCAST_API_KEY = ORIGINAL_KEY;
  if (ORIGINAL_MODE === undefined) delete process.env.RENTCAST_MODE;
  else process.env.RENTCAST_MODE = ORIGINAL_MODE;
  jest.restoreAllMocks();
});

describe("no API key", () => {
  it("fails without making a request and without spending quota", async () => {
    delete process.env.RENTCAST_API_KEY;
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const { fetchValueEstimate, hasApiKey } = await client();
    const result = await fetchValueEstimate({ address: "128 Maple St, Duluth, GA 30096" });

    expect(hasApiKey()).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a failure");
    expect(result.failure).toBe("no_key");
    // Refused locally, so nothing was consumed.
    expect(result.billable).toBe(false);
    expect(result.statusCode).toBeNull();
  });

  it("reports a rejected key the same way, since the remedy is the same", async () => {
    process.env.RENTCAST_API_KEY = "test-key";
    stubFetch({ ok: false, status: 401, json: async () => ({ message: "Invalid API key" }) });

    const { fetchValueEstimate } = await client();
    const result = await fetchValueEstimate({ address: "128 Maple St" });

    if (result.ok) throw new Error("expected a failure");
    expect(result.failure).toBe("no_key");
    // Corrected: this reaches RentCast and they count it. Two of these were
    // logged free while their dashboard counted them, which is why our number
    // read 1 against their 3.
    expect(result.billable).toBe(true);
  });
});

describe("429", () => {
  it("distinguishes an exhausted quota from plain rate limiting", async () => {
    process.env.RENTCAST_API_KEY = "test-key";
    stubFetch({
      ok: false,
      status: 429,
      json: async () => ({ message: "Monthly request quota exceeded" }),
    });

    const { fetchValueEstimate } = await client();
    const result = await fetchValueEstimate({ address: "128 Maple St" });

    if (result.ok) throw new Error("expected a failure");
    // One is "wait until next month", the other is "wait a minute". A single
    // state would send someone hunting for a key they already have.
    expect(result.failure).toBe("quota");
    // Corrected: a 429 reached RentCast.
    expect(result.billable).toBe(true);
    expect(result.statusCode).toBe(429);
  });

  it("treats a bare 429 as rate limiting", async () => {
    process.env.RENTCAST_API_KEY = "test-key";
    stubFetch({ ok: false, status: 429, json: async () => ({ message: "Too many requests" }) });

    const { fetchValueEstimate } = await client();
    const result = await fetchValueEstimate({ address: "128 Maple St" });

    if (result.ok) throw new Error("expected a failure");
    expect(result.failure).toBe("rate_limited");
    expect(result.billable).toBe(true);
  });
});

describe("other failures", () => {
  it("counts a 404 as billable because the lookup ran", async () => {
    process.env.RENTCAST_API_KEY = "test-key";
    stubFetch({ ok: false, status: 404, json: async () => ({ message: "No data" }) });

    const { fetchValueEstimate } = await client();
    const result = await fetchValueEstimate({ address: "Nowhere" });

    if (result.ok) throw new Error("expected a failure");
    expect(result.failure).toBe("not_found");
    // It found nothing, but it looked.
    expect(result.billable).toBe(true);
  });

  it("counts a 5xx — the request still reached them", async () => {
    process.env.RENTCAST_API_KEY = "test-key";
    stubFetch({ ok: false, status: 503, json: async () => ({}) });

    const { fetchValueEstimate } = await client();
    const result = await fetchValueEstimate({ address: "128 Maple St" });

    if (result.ok) throw new Error("expected a failure");
    expect(result.failure).toBe("http_error");
    // Previously treated as free on the grounds that a RentCast fault is not
    // the user's fault. True, but irrelevant: fault and billing are different
    // questions, and guessing in the user's favour undercounts.
    expect(result.billable).toBe(true);
  });

  it("returns a value for a network error rather than throwing", async () => {
    process.env.RENTCAST_API_KEY = "test-key";
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;

    const { fetchValueEstimate } = await client();
    // A throw here would lose the other four houses in a batch of five.
    const result = await fetchValueEstimate({ address: "128 Maple St" });

    if (result.ok) throw new Error("expected a failure");
    expect(result.failure).toBe("network_error");
    // The request left the process and may have been served before the
    // connection broke. Counted, because undercounting is the worse direction.
    expect(result.billable).toBe(true);
  });

  it("counts an unparseable 200 — it was served, so the quota is gone", async () => {
    process.env.RENTCAST_API_KEY = "test-key";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("not json");
      },
    }) as unknown as typeof fetch;

    const { fetchValueEstimate } = await client();
    const result = await fetchValueEstimate({ address: "128 Maple St" });

    if (result.ok) throw new Error("expected a failure");
    expect(result.failure).toBe("bad_response");
    expect(result.billable).toBe(true);
  });
});

describe("empty comps", () => {
  it("is a success carrying nothing, not a failure", async () => {
    process.env.RENTCAST_API_KEY = "test-key";
    stubFetch({ ok: true, status: 200, json: async () => ({ price: 350_000, comparables: [] }) });

    const { fetchValueEstimate } = await client();
    const result = await fetchValueEstimate({ address: "128 Maple St" });

    // The route turns this into a `no_comps` reason for the UI; the client's
    // job is only to report that the call worked.
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.data.comparables).toEqual([]);
    expect(result.billable).toBe(true);
  });

  it("tolerates a response with no comparables key at all", async () => {
    process.env.RENTCAST_API_KEY = "test-key";
    stubFetch({ ok: true, status: 200, json: async () => ({ price: 350_000 }) });

    const { fetchValueEstimate } = await client();
    const result = await fetchValueEstimate({ address: "128 Maple St" });

    expect(result.ok).toBe(true);
  });
});

describe("request parameters", () => {
  async function capturedUrl(params: Record<string, unknown>): Promise<URL> {
    process.env.RENTCAST_API_KEY = "test-key";
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => fixture,
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const { fetchValueEstimate } = await client();
    await fetchValueEstimate({ address: "128 Maple St", ...params });

    return new URL(fetchSpy.mock.calls[0][0] as string);
  }

  it("clamps compCount into RentCast's 5–25 range", async () => {
    // Sending 30 is a 400, not 25 comps.
    expect((await capturedUrl({ compCount: 30 })).searchParams.get("compCount")).toBe("25");
    expect((await capturedUrl({ compCount: 1 })).searchParams.get("compCount")).toBe("5");
    expect((await capturedUrl({ compCount: 12 })).searchParams.get("compCount")).toBe("12");
  });

  it("asks for the maximum 25 comps, because the count is free", async () => {
    expect((await capturedUrl({})).searchParams.get("compCount")).toBe("25");
  });

  it("searches the same 1 mile the ARV is willing to count", async () => {
    // Searching wider than the filter means paying for comps that are thrown
    // away the moment they arrive.
    expect((await capturedUrl({})).searchParams.get("maxRadius")).toBe(
      String(COMP_ELIGIBILITY.maxDistanceMiles)
    );
  });

  it("looks back six months, not nine", async () => {
    expect((await capturedUrl({})).searchParams.get("daysOld")).toBe("180");
  });

  it("keeps daysOld at the documented minimum of 1", async () => {
    expect((await capturedUrl({ daysOld: 0 })).searchParams.get("daysOld")).toBe("1");
  });

  it("omits the matching hints when they are not known", async () => {
    const url = await capturedUrl({});

    // A guessed sqft produces confidently wrong comps, so nothing is guessed.
    expect(url.searchParams.has("squareFootage")).toBe(false);
    expect(url.searchParams.has("bedrooms")).toBe(false);
    expect(url.searchParams.has("propertyType")).toBe(false);
  });

  it("sends the hints when they are known", async () => {
    const url = await capturedUrl({ squareFootage: 1750, bedrooms: 3, propertyType: "Single Family" });

    expect(url.searchParams.get("squareFootage")).toBe("1750");
    expect(url.searchParams.get("bedrooms")).toBe("3");
    expect(url.searchParams.get("propertyType")).toBe("Single Family");
  });

  it("sends the key as a header, never in the query string", async () => {
    process.env.RENTCAST_API_KEY = "test-key";
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => fixture });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const { fetchValueEstimate } = await client();
    await fetchValueEstimate({ address: "128 Maple St" });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    // A key in a URL ends up in logs and referrers.
    expect(url).not.toContain("test-key");
    expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe("test-key");
  });
});

describe("the fixture itself", () => {
  it("contains no status RentCast cannot actually produce", async () => {
    // Guards the fixture against drifting into fantasy: if a "Sold" ever
    // appears here, the tests built on it stop describing reality.
    const statuses = fixture.comparables.map((c) => c.status);
    for (const status of statuses) {
      expect(["Active", "Inactive"]).toContain(status);
    }
  });

  it("carries the subject property's own facts, so one call is enough", async () => {
    expect(fixture.subjectProperty.squareFootage).toBe(1750);
    expect(fixture.subjectProperty.bedrooms).toBe(3);
    expect(fixture.subjectProperty.bathrooms).toBe(2);
  });
});
