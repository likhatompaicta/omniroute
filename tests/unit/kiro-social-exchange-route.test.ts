import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SignJWT } from "jose";

const originalDataDir = process.env.DATA_DIR;
const originalJwtSecret = process.env.JWT_SECRET;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-kiro-social-exchange-"));
const jwtSecret = "test-jwt-secret-kiro-social-exchange";

process.env.DATA_DIR = dataDir;
process.env.JWT_SECRET = jwtSecret;

const { POST } = await import("../../src/app/api/oauth/kiro/social-exchange/route.ts");
const { KIRO_CONFIG } = await import("../../src/lib/oauth/constants/oauth.ts");
const core = await import("../../src/lib/db/core.ts");

// === CHANGE: preserve unfinished social authorization when the upstream poll is empty ===
test("social exchange keeps an empty successful poll pending", async () => {
  const originalFetch = globalThis.fetch;
  const authToken = await new SignJWT({ authenticated: true })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(jwtSecret));

  globalThis.fetch = (async (input) => {
    assert.equal(String(input), KIRO_CONFIG.socialDevicePollUrl);
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const response = await POST(
      new Request("http://localhost:20128/api/oauth/kiro/social-exchange", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `auth_token=${authToken}`,
        },
        body: JSON.stringify({
          deviceCode: "synthetic-device-code",
          provider: "google",
          targetProvider: "kiro",
        }),
      })
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      success: false,
      pending: true,
      error: "authorization_pending",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(dataDir, { recursive: true, force: true });

  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});
