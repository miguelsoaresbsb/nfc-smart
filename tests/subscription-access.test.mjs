import test from "node:test";
import assert from "node:assert/strict";
import { hasPaidSubscription, isPaidDashboardPath } from "../lib/subscription-access.ts";

const now = Date.parse("2026-11-10T16:00:00Z");
test("paid features require a confirmed active subscription and a finite future expiry", () => {
  assert.equal(hasPaidSubscription({ status: "active", expires_at: "2026-11-10T16:00:01Z" }, now), true);
  for (const subscription of [
    null, undefined,
    { status: "pending", expires_at: "2027-01-01T00:00:00Z" },
    { status: "canceled", expires_at: "2027-01-01T00:00:00Z" },
    { status: "expired", expires_at: "2027-01-01T00:00:00Z" },
    { status: "active", expires_at: null },
    { status: "active", expires_at: "" },
    { status: "active", expires_at: "invalid-date" },
    { status: "active", expires_at: "2026-11-10T16:00:00Z" },
    { status: "active", expires_at: "2026-11-09T16:00:00Z" },
  ]) assert.equal(hasPaidSubscription(subscription, now), false, JSON.stringify(subscription));
});

test("all paid areas including the old QR entry point are gated while billing and status remain available", () => {
  for (const pathname of ["/dashboard/editor", "/dashboard/actions", "/dashboard/analytics", "/dashboard/nfc", "/dashboard/qr-codes", "/dashboard/editor/nested"]) {
    assert.equal(isPaidDashboardPath(pathname), true, pathname);
  }
  for (const pathname of ["/dashboard", "/dashboard/subscription", "/admin", "/login", "/dashboard/editor-unrelated"]) {
    assert.equal(isPaidDashboardPath(pathname), false, pathname);
  }
});
