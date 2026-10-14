import { NextResponse } from "next/server";
import { importJWK, jwtVerify } from "jose";
import { createHash } from "crypto";
import { plaidClient } from "@/lib/plaid";
import { syncPlaidItem, serviceDb } from "@/lib/plaid-sync";

// Cache imported CryptoKey per kid to avoid re-fetching on every request
const keyCache = new Map<string, CryptoKey>();

async function getVerificationKey(kid: string): Promise<CryptoKey | null> {
  if (keyCache.has(kid)) return keyCache.get(kid)!;
  try {
    const res = await plaidClient.webhookVerificationKeyGet({ key_id: kid });
    // importJWK returns CryptoKey in jose v6
    const key = await importJWK(
      res.data.key as unknown as Parameters<typeof importJWK>[0],
      "ES256"
    ) as CryptoKey;
    keyCache.set(kid, key);
    return key;
  } catch {
    return null;
  }
}

async function verifyPlaidWebhook(req: Request, rawBody: string): Promise<boolean> {
  const token = req.headers.get("Plaid-Verification");
  if (!token) return false;

  // Decode the JWT header to extract kid without verifying yet
  const [headerB64] = token.split(".");
  let kid: string;
  try {
    kid = JSON.parse(Buffer.from(headerB64, "base64url").toString()).kid;
    if (!kid) return false;
  } catch {
    return false;
  }

  const publicKey = await getVerificationKey(kid);
  if (!publicKey) return false;

  try {
    const { payload } = await jwtVerify(token, publicKey, { algorithms: ["ES256"] });

    // JWT must have been issued within the last 5 minutes
    const iat = payload.iat;
    if (!iat || Date.now() / 1000 - iat > 300) return false;

    // Body hash must match what Plaid signed
    const expectedHash = createHash("sha256").update(rawBody).digest("hex");
    if (payload["request_body_sha256"] !== expectedHash) return false;

    return true;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const rawBody = await req.text();

  const verified = await verifyPlaidWebhook(req, rawBody);
  if (!verified) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { webhook_type?: string; webhook_code?: string; item_id?: string };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { webhook_type, webhook_code, item_id } = body;

  if (webhook_type === "TRANSACTIONS" && webhook_code === "SYNC_UPDATES_AVAILABLE") {
    if (item_id) {
      const db = serviceDb();
      const { data: item } = await db
        .from("plaid_items")
        .select("user_id, access_token")
        .eq("item_id", item_id)
        .maybeSingle();

      if (item) {
        // Fire async — do not await; return 200 immediately so Plaid doesn't retry
        syncPlaidItem(item.user_id as string, item_id, item.access_token as string).catch(
          (err: unknown) => console.error("[webhook] sync error for item", item_id, err)
        );
      }
    }
  } else if (webhook_type === "ITEM" && webhook_code === "ERROR") {
    console.error("[webhook] ITEM ERROR received", { item_id, body });
  }

  return NextResponse.json({ received: true });
}
