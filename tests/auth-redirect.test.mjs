import test from "node:test";
import assert from "node:assert/strict";
import { safeAuthPath } from "../lib/auth-redirect.ts";

test("preserves local callback destinations", () => {
  for (const path of ["/dashboard", "/acesso-pendente", "/dashboard/editor?tab=colors", "/p/empresa-um"]) {
    assert.equal(safeAuthPath(path), path);
  }
  assert.equal(safeAuthPath(null), "/dashboard");
});

test("rejects external URLs and encoded redirect escapes", () => {
  for (const path of ["https://evil.example", "//evil.example", "/\\evil.example", "\\evil.example", "javascript:alert(1)", "/%2fevil.example", "/%255cevil.example", "/%0aevil", " /dashboard", "/%invalid"]) {
    assert.equal(safeAuthPath(path), "/dashboard", path);
  }
});
