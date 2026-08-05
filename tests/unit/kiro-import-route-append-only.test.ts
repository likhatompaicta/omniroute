import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SignJWT } from "jose";

const originalDataDir = process.env.DATA_DIR;
const originalJwtSecret = process.env.JWT_SECRET;
const originalDisableBackup = process.env.DISABLE_SQLITE_AUTO_BACKUP;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-kiro-route-append-"));
const jwtSecret = "test-jwt-secret-kiro-route-append";

process.env.DATA_DIR = dataDir;
process.env.JWT_SECRET = jwtSecret;
process.env.DISABLE_SQLITE_AUTO_BACKUP = "true";

const { POST } = await import("../../src/app/api/oauth/kiro/import/route.ts");
const { KiroService } = await import("../../src/lib/oauth/services/kiro.ts");
const providersDb = await import("../../src/lib/db/providers.ts");
const core = await import("../../src/lib/db/core.ts");

// === CHANGE: exercise two dashboard Kiro imports through the real route and SQLite ===
test("two manual Kiro imports create independent IDs and credentials", async () => {
  const originalValidateImportToken = KiroService.prototype.validateImportToken;
  const originalExtractEmailFromJWT = KiroService.prototype.extractEmailFromJWT;

  KiroService.prototype.validateImportToken = async function (refreshToken: string) {
    return {
      accessToken: `access-${refreshToken}`,
      refreshToken: `rotated-${refreshToken}`,
      expiresIn: 3600,
      profileArn: null,
      authMethod: "imported",
    };
  };
  KiroService.prototype.extractEmailFromJWT = function () {
    return "same-account@example.com";
  };

  try {
    const authToken = await new SignJWT({ authenticated: true })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(jwtSecret));

    const importToken = async (refreshToken: string) =>
      POST(
        new Request("http://localhost:20128/api/oauth/kiro/import?targetProvider=kiro", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `auth_token=${authToken}`,
          },
          body: JSON.stringify({ refreshToken }),
        })
      );

    const firstResponse = await importToken("aorAAAAAGsynthetic-account-a");
    const secondResponse = await importToken("aorAAAAAGsynthetic-account-b");
    const firstBody = await firstResponse.json();
    const secondBody = await secondResponse.json();

    assert.equal(firstResponse.status, 200);
    assert.equal(secondResponse.status, 200);
    assert.notEqual(firstBody.connection.id, secondBody.connection.id);

    const rows = await providersDb.getProviderConnections({ provider: "kiro" });
    const firstConnection = await providersDb.getProviderConnectionById(firstBody.connection.id);
    const secondConnection = await providersDb.getProviderConnectionById(secondBody.connection.id);

    assert.equal(rows.length, 2);
    assert.equal(firstConnection?.refreshToken, "rotated-aorAAAAAGsynthetic-account-a");
    assert.equal(secondConnection?.refreshToken, "rotated-aorAAAAAGsynthetic-account-b");
  } finally {
    KiroService.prototype.validateImportToken = originalValidateImportToken;
    KiroService.prototype.extractEmailFromJWT = originalExtractEmailFromJWT;
  }
});

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(dataDir, { recursive: true, force: true });

  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
  if (originalDisableBackup === undefined) delete process.env.DISABLE_SQLITE_AUTO_BACKUP;
  else process.env.DISABLE_SQLITE_AUTO_BACKUP = originalDisableBackup;
});
