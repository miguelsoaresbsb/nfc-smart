import assert from "node:assert/strict";
import test from "node:test";
import { analyticsDay, analyticsWindow, parseAnalyticsEvent, readAllPages } from "../lib/analytics.ts";

const companyId = "f53cefb3-f305-49d8-a349-00e0776dfeaa";
const actionId = "d294ff38-6774-4524-a271-f2695bde6816";

test("analytics validates identifiers, event types and session values before database writes", () => {
  assert.deepEqual(parseAnalyticsEvent({ companyId, eventType: "page_view", sessionId: "session-1" }), {
    company_id: companyId, event_type: "page_view", action_id: null, session_id: "session-1",
  });
  assert.equal(parseAnalyticsEvent({ companyId, eventType: "action_click", actionId }).action_id, actionId);
  for (const input of [null, [], "hello", { companyId: {}, eventType: "page_view" },
    { companyId: "wrong-id", eventType: "page_view" }, { companyId, eventType: "unknown" },
    { companyId, eventType: "action_click" }, { companyId, eventType: "action_click", actionId: 1 },
    { companyId, eventType: "page_view", actionId }, { companyId, eventType: "page_view", sessionId: {} },
    { companyId, eventType: "page_view", sessionId: "a".repeat(121) },
  ]) assert.equal(parseAnalyticsEvent(input), null);
});

test("daily metrics use the Brasília calendar on both sides of midnight", () => {
  const now = new Date("2026-11-09T02:30:00Z");
  const window = analyticsWindow(now);
  assert.equal(analyticsDay(now), "2026-11-08");
  assert.equal(analyticsDay(new Date("2026-11-09T03:00:00Z")), "2026-11-09");
  assert.equal(window.since, "2026-10-10T03:00:00.000Z");
  assert.equal(window.days.length, 30);
  assert.equal(window.days[0].key, "2026-10-10");
  assert.equal(window.days.at(-1).label, "08/11");
  assert.equal(window.until, now.toISOString());
});

test("analytics loads every page above Supabase's default 1000-row limit", async () => {
  const input = Array.from({ length: 1203 }, (_, id) => ({ id }));
  const requested = [];
  const result = await readAllPages(async (from, to) => {
    requested.push([from, to]);
    return { data: input.slice(from, to + 1), error: null };
  });
  assert.deepEqual(result, input);
  assert.deepEqual(requested, [[0, 499], [500, 999], [1000, 1499], [1203, 1702]]);
});

test("a smaller configured API cap does not truncate analytics", async () => {
  const input = Array.from({ length: 723 }, (_, id) => id);
  const result = await readAllPages(async from => ({ data: input.slice(from, from + 100), error: null }));
  assert.deepEqual(result, input);
});

test("failed page loads reject instead of presenting a partial success", async () => {
  await assert.rejects(readAllPages(async from => from
    ? { data: null, error: { message: "connection failed" } }
    : { data: [1], error: null }), /connection failed/);
});
