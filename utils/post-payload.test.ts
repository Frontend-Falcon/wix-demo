import { describe, it, expect } from "vitest";
import { parseHashtags, buildDraftPostBody } from "./post-payload";
import type { RicosDocument } from "./ricos-images";

const richContent: RicosDocument = { nodes: [] };

describe("parseHashtags", () => {
  it("splits, trims, and drops empty entries", () => {
    expect(parseHashtags("  wix , blog ,, seo")).toEqual(["wix", "blog", "seo"]);
  });

  it("returns an empty array for undefined input", () => {
    expect(parseHashtags(undefined)).toEqual([]);
  });
});

describe("buildDraftPostBody", () => {
  it("applies defaults when optional fields are omitted", () => {
    const body = buildDraftPostBody({ title: "Hello" }, richContent, "member-1");
    expect(body).toEqual({
      title: "Hello",
      memberId: "member-1",
      hashtags: [],
      featured: false,
      commentingEnabled: true,
      language: "en",
      richContent,
    });
  });

  it("includes excerpt and heroImage only when provided", () => {
    const body = buildDraftPostBody(
      {
        title: "Hello",
        excerpt: "  An excerpt  ",
        featured: true,
        commentingEnabled: false,
        language: "fr",
      },
      richContent,
      "member-1",
      "media-1"
    );
    expect(body.excerpt).toBe("An excerpt");
    expect(body.heroImage).toEqual({ id: "media-1" });
    expect(body.featured).toBe(true);
    expect(body.commentingEnabled).toBe(false);
    expect(body.language).toBe("fr");
  });
});
