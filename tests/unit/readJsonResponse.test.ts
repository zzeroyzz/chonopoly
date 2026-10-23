import { readJsonResponse } from "@/lib/http/readJsonResponse";

function response(status: number, body: string): Response {
  return new Response(body, { status });
}

async function messageOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected it to throw");
}

describe("readJsonResponse", () => {
  it("returns the body when the request worked", async () => {
    await expect(readJsonResponse(response(200, '{"rows":[]}'), "Failed")).resolves.toEqual({
      rows: [],
    });
  });

  it("shows the server's own reason on a 500", async () => {
    const message = await messageOf(
      readJsonResponse(
        response(500, JSON.stringify({ error: "column analyses.home_value does not exist" })),
        "Failed to refresh comps"
      )
    );
    expect(message).toBe("column analyses.home_value does not exist");
  });

  it("reads an empty 500 as a server error, not a parser complaint", async () => {
    const message = await messageOf(readJsonResponse(response(500, ""), "Failed to refresh comps"));
    expect(message).toBe("Failed to refresh comps (HTTP 500)");
    expect(message).not.toContain("JSON");
  });

  it("reads an HTML error page the same way", async () => {
    const message = await messageOf(
      readJsonResponse(response(502, "<html>Bad gateway</html>"), "Failed to load")
    );
    expect(message).toBe("Failed to load (HTTP 502)");
  });

  it("says so when a success comes back empty", async () => {
    const message = await messageOf(readJsonResponse(response(200, ""), "Failed to load"));
    expect(message).toBe("Failed to load — the server sent an empty response.");
  });
});
