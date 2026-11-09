import assert from "node:assert/strict";
import test from "node:test";
import { actionTarget, publicActionTarget, whatsappNumber } from "../lib/action-target.ts";
import { getPublicPageUrl } from "../lib/public-url.ts";

test("WhatsApp accepts formatted numbers and preserves DDD 55", () => {
  assert.equal(actionTarget("whatsapp", "(61) 99999-9999"), "https://wa.me/5561999999999");
  assert.equal(whatsappNumber("(55) 99999-9999"), "5555999999999");
  assert.equal(whatsappNumber("+55 61 99999-9999"), "5561999999999");
});
test("links are absolute while Instagram handles and phones retain intended actions", () => {
  assert.equal(actionTarget("website", "example.com"), "https://example.com/");
  assert.equal(actionTarget("instagram", "@empresa"), "https://www.instagram.com/empresa/");
  assert.equal(actionTarget("phone", "+55 (61) 99999-9999"), "tel:+5561999999999");
  assert.equal(actionTarget("custom", "mailto:hello@example.com"), "mailto:hello@example.com");
});
test("unsafe schemes, relative links and credentials are rejected", () => {
  for (const input of ["javascript:alert(1)", "data:text/html,hi", "/login", "https://user:password@example.com"] ) {
    assert.equal(publicActionTarget("custom", input), null);
  }
});
test("NFC addresses never depend on a preview host", () => {
  const before = process.env.NEXT_PUBLIC_APP_URL;
  try {
    delete process.env.NEXT_PUBLIC_APP_URL;
    assert.equal(getPublicPageUrl("minha empresa"), "https://nfc-smart-one.vercel.app/p/minha%20empresa");
    process.env.NEXT_PUBLIC_APP_URL = "https://nfc.example.com/";
    assert.equal(getPublicPageUrl("loja"), "https://nfc.example.com/p/loja");
  } finally {
    if (before === undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL = before;
  }
});
