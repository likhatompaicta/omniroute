import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// === CHANGE: protect the Kiro route's append-only persistence contract ===
const ROUTE_PATH = path.resolve("src/app/api/oauth/kiro/import/route.ts");

test("Kiro import route uses append-only persistence without changing amazon-q", () => {
  const source = fs.readFileSync(ROUTE_PATH, "utf8");

  assert.match(source, /if \(targetProvider === "kiro"\)/);
  assert.match(source, /\{ deduplicate: false \}/);
  assert.match(
    source,
    /const existing = await getProviderConnections\(\{ provider: targetProvider \}\)/
  );
});
