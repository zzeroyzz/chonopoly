/**
 * Read a response safely, whatever came back.
 *
 * A 500 from a crashed route has no JSON body, and calling `.json()` on it
 * throws "Unexpected end of JSON input" — which is what the Comps tab once
 * showed instead of the real database error. The status is checked first, the
 * server's own `error` is used when it sent one, and a body that will not parse
 * becomes a message about the status rather than a parser complaint nobody can
 * act on.
 *
 * Shared by the Comps tab and the Properties list, which each had a copy.
 */
export async function readJsonResponse<T>(res: Response, fallback: string): Promise<T> {
  const text = await res.text();

  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // Left null — handled below.
    }
  }

  if (!res.ok) {
    const serverMessage =
      parsed && typeof parsed === "object" && typeof (parsed as { error?: unknown }).error === "string"
        ? (parsed as { error: string }).error
        : null;
    throw new Error(serverMessage ?? `${fallback} (HTTP ${res.status})`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`${fallback} — the server sent an empty response.`);
  }

  return parsed as T;
}
