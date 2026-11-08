import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONTACT_EMAIL, PRIVACY_POLICY, type PolicyBlock } from "./privacy-policy";

function shape(block: PolicyBlock): string {
  if (block.kind === "paragraph") return "paragraph";
  if (block.kind === "list") return `list:${block.items.length}`;
  return `table:${block.head.length}x${block.rows.length}`;
}

describe("privacy policy content", () => {
  it("has the same structure in both locales", () => {
    // The two texts are the same legal document. A section, list item or table
    // row present in only one means the languages promise different things.
    const outline = (locale: "en" | "bg") =>
      PRIVACY_POLICY[locale].sections.map((s) => ({ id: s.id, blocks: s.blocks.map(shape) }));

    assert.deepEqual(outline("bg"), outline("en"));
  });

  it("identifies the controller in both locales", () => {
    for (const locale of ["en", "bg"] as const) {
      const controller = JSON.stringify(PRIVACY_POLICY[locale].sections[0]);
      assert.ok(controller.includes("206929451"), `${locale} is missing the company number`);
      assert.ok(controller.includes(CONTACT_EMAIL), `${locale} is missing the contact email`);
    }
  });
});
