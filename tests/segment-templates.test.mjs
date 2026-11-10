import test from "node:test";
import assert from "node:assert/strict";
import { segmentTemplates, getSegmentTemplate, missingTemplateActions, applySegmentDraft } from "../lib/segment-templates.ts";

test("five segment presets contain distinct usable suggestions without invented destinations", () => {
  assert.deepEqual(segmentTemplates.map(template => template.id), ["restaurant", "salon", "workshop", "retail", "professional"]);
  for (const template of segmentTemplates) {
    assert(template.description.length <= 240);
    assert.equal(new Set(template.suggestedActions.map(action => action.type)).size, template.suggestedActions.length);
    for (const action of template.suggestedActions) {
      assert(action.label && action.hint && action.placeholder);
      assert.equal(Object.hasOwn(action, "url"), false);
      assert.equal(Object.hasOwn(action, "pix_key"), false);
    }
    for (const color of Object.values(template.colors)) assert.match(color, /^#[\da-f]{6}$/i);
  }
  assert.equal(getSegmentTemplate("unknown"), undefined);
});

test("template drafts preserve business identity and existing content until an explicit replacement", () => {
  const current = { name: "Minha empresa", description: "Minha descrição", logo: "logo.png", cover: "cover.png", phone: "61999999999", whatsapp: "61988888888", bg: "#ffffff" };
  const template = getSegmentTemplate("restaurant");
  const next = applySegmentDraft(current, template);
  assert.equal(next.description, current.description);
  for (const field of ["name", "logo", "cover", "phone", "whatsapp"]) assert.equal(next[field], current[field]);
  assert.equal(next.bg, template.colors.bg);
  assert.equal(current.bg, "#ffffff");
  assert.equal(applySegmentDraft(current, template, true).description, template.description);
  assert.equal(applySegmentDraft({ ...current, description: " " }, template).description, template.description);
});

test("suggestions skip all existing action types, including hidden actions and existing contact buttons", () => {
  const template = getSegmentTemplate("salon");
  const suggestions = missingTemplateActions(template, [{ type: "instagram", enabled: false }, { type: "pix" }], { whatsapp: "61999999999" });
  assert.deepEqual(suggestions.map(action => action.type), ["maps", "google"]);
  assert(missingTemplateActions(template, [], { whatsapp: "61999999999", whatsappEnabled: false }).some(action => action.type === "whatsapp"));
  assert.deepEqual(missingTemplateActions(template, template.suggestedActions), []);
});
