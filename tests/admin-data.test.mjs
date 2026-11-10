import test from "node:test";
import assert from "node:assert/strict";
import { subscriptionStatus, companyAccounts, matchesAdminSearch, adminDate } from "../lib/admin-data.ts";

const now = Date.parse("2026-11-09T15:00:00Z");
const subscription = { company_id: "one", status: "active", plan: "monthly", started_at: null, expires_at: "2026-11-10T15:00:00Z" };

test("admin subscription status respects actual expiry at the boundary without reviving cancellations", () => {
  assert.equal(subscriptionStatus(subscription, now), "active");
  assert.equal(subscriptionStatus({ ...subscription, expires_at: new Date(now).toISOString() }, now), "expired");
  assert.equal(subscriptionStatus({ ...subscription, expires_at: "invalid" }, now), "expired");
  assert.equal(subscriptionStatus({ ...subscription, expires_at: null }, now), "active");
  assert.equal(subscriptionStatus({ ...subscription, status: "canceled" }, now), "canceled");
  assert.equal(subscriptionStatus(null, now), "pending");
});

test("company accounts stay tied to exact company IDs and approved requests", () => {
  const companies = [{ id: "one", name: "Empresa igual", slug: "one", created_at: "2026-11-01" }, { id: "two", name: "Empresa igual", slug: "two", created_at: "2026-11-01" }];
  const request = { id: "req", name: "Ana", email: "ana@example.com", phone: null, company_name: "Empresa igual", status: "approved", user_id: "user", company_id: "one", created_at: "2026-11-01T00:00:00Z" };
  const accounts = companyAccounts(companies, [subscription], [request, { ...request, id: "new", name: "Outra", status: "pending", company_id: "one", created_at: "2026-11-02T00:00:00Z" }], now);
  assert.equal(accounts[0].account.name, "Ana");
  assert.equal(accounts[0].status, "active");
  assert.equal(accounts[1].account, null);
  assert.equal(accounts[1].status, "pending");
});

test("admin search supports names, emails, slugs and independent accent-insensitive terms", () => {
  const values = ["Salão São João", "Ana Maria", "ana@example.com", "salao-sao-joao"];
  assert.equal(matchesAdminSearch("  salao   ANA ", values), true);
  assert.equal(matchesAdminSearch("sao-joao", values), true);
  assert.equal(matchesAdminSearch("@example.com", values), true);
  assert.equal(matchesAdminSearch("Ana inexistente", values), false);
  assert.equal(matchesAdminSearch("", [null]), true);
});

test("admin dates use the Brasília day near UTC midnight and handle absent dates", () => {
  assert.equal(adminDate("2026-11-10T01:00:00Z"), "09/11/2026");
  assert.equal(adminDate(null), "—");
  assert.equal(adminDate("invalid"), "Data indisponível");
});
