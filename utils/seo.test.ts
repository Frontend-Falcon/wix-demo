import { describe, it, expect } from "vitest";
import { mergeSeoTags, extractSeoValues, type SeoTag } from "./seo";

describe("mergeSeoTags", () => {
  it("adds title and description tags while keeping unrelated tags", () => {
    const existing: SeoTag[] = [{ type: "meta", props: { name: "og:image", content: "x.jpg" } }];
    const merged = mergeSeoTags(existing, { title: "New title", description: "New description" });

    expect(merged).toEqual([
      { type: "meta", props: { name: "og:image", content: "x.jpg" } },
      { type: "title", children: "New title" },
      { type: "meta", props: { name: "description", content: "New description" } },
    ]);
  });

  it("replaces an existing title/description instead of duplicating it", () => {
    const existing: SeoTag[] = [
      { type: "title", children: "Old title" },
      { type: "meta", props: { name: "description", content: "Old description" } },
    ];
    const merged = mergeSeoTags(existing, { title: "New title", description: "New description" });

    expect(merged).toEqual([
      { type: "title", children: "New title" },
      { type: "meta", props: { name: "description", content: "New description" } },
    ]);
  });

  it("leaves a field untouched when it is not provided", () => {
    const existing: SeoTag[] = [{ type: "title", children: "Old title" }];
    const merged = mergeSeoTags(existing, { description: "New description" });

    expect(merged).toEqual([
      { type: "title", children: "Old title" },
      { type: "meta", props: { name: "description", content: "New description" } },
    ]);
  });
});

describe("extractSeoValues", () => {
  it("reads the title and description out of a tag list", () => {
    const tags: SeoTag[] = [
      { type: "title", children: "A title" },
      { type: "meta", props: { name: "description", content: "A description" } },
      { type: "meta", props: { name: "og:image", content: "x.jpg" } },
    ];
    expect(extractSeoValues(tags)).toEqual({ title: "A title", description: "A description" });
  });

  it("returns an empty object when neither tag exists", () => {
    expect(extractSeoValues([])).toEqual({});
  });
});
