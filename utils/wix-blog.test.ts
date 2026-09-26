import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./wix-client", async () => {
  const actual = await vi.importActual<typeof import("./wix-client")>("./wix-client");
  return { ...actual, wixFetch: vi.fn() };
});

import { wixFetch, WixApiError } from "./wix-client";
import { convertHtmlToRicos, deletePost, updateDraftPost, writeSeoTags } from "./wix-blog";

const mockedWixFetch = wixFetch as unknown as ReturnType<typeof vi.fn>;

describe("convertHtmlToRicos JSON-paste guard", () => {
  beforeEach(() => {
    mockedWixFetch.mockReset();
    mockedWixFetch.mockResolvedValue({ document: { nodes: [] } });
  });

  it("unwraps a pasted JSON-quoted string into the real HTML", async () => {
    await convertHtmlToRicos('"<p>Hi</p>"');

    const [, init] = mockedWixFetch.mock.calls[0];
    expect(JSON.parse(init.body).html).toBe("<p>Hi</p>");
  });

  it("leaves real HTML with quoted attributes untouched", async () => {
    await convertHtmlToRicos('<img src="https://example.com/a.png">');

    const [, init] = mockedWixFetch.mock.calls[0];
    expect(JSON.parse(init.body).html).toBe('<img src="https://example.com/a.png">');
  });
});

describe("updateDraftPost action selection", () => {
  beforeEach(() => {
    mockedWixFetch.mockReset();
  });

  const input = { title: "Hello" };

  it("uses UPDATE when saving a draft without publishing", async () => {
    mockedWixFetch
      .mockResolvedValueOnce({ document: { nodes: [] } })
      .mockResolvedValueOnce(undefined);

    await updateDraftPost("post-1", input, "<p>Hi</p>", "draft", false);

    const patchCall = mockedWixFetch.mock.calls[1];
    expect(JSON.parse(patchCall[1].body).action).toBe("UPDATE");
  });

  it("uses UPDATE_PUBLISH when publishing a draft for the first time", async () => {
    mockedWixFetch
      .mockResolvedValueOnce({ document: { nodes: [] } })
      .mockResolvedValueOnce(undefined);

    await updateDraftPost("post-1", input, "<p>Hi</p>", "draft", true);

    const patchCall = mockedWixFetch.mock.calls[1];
    expect(JSON.parse(patchCall[1].body).action).toBe("UPDATE_PUBLISH");
  });

  it("uses UPDATE_PUBLICATION when editing an already-published post", async () => {
    mockedWixFetch
      .mockResolvedValueOnce({ document: { nodes: [] } })
      .mockResolvedValueOnce(undefined);

    await updateDraftPost("post-1", input, "<p>Hi</p>", "published", false);

    const patchCall = mockedWixFetch.mock.calls[1];
    expect(JSON.parse(patchCall[1].body).action).toBe("UPDATE_PUBLICATION");
  });
});

describe("deletePost", () => {
  beforeEach(() => {
    mockedWixFetch.mockReset();
  });

  it("reverts the post to draft before deleting, so a published post is actually removed", async () => {
    mockedWixFetch.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);

    await deletePost("post-1");

    expect(mockedWixFetch).toHaveBeenCalledTimes(2);
    const [revertPath, revertInit] = mockedWixFetch.mock.calls[0];
    expect(revertPath).toBe("/blog/v3/draft-posts/post-1");
    expect(revertInit.method).toBe("PATCH");
    expect(JSON.parse(revertInit.body)).toEqual({
      action: "UPDATE_REVERT_TO_DRAFT",
      draftPost: { id: "post-1" },
    });
    const [deletePath, deleteInit] = mockedWixFetch.mock.calls[1];
    expect(deletePath).toBe("/blog/v3/draft-posts/post-1");
    expect(deleteInit.method).toBe("DELETE");
  });
});

describe("writeSeoTags", () => {
  beforeEach(() => {
    mockedWixFetch.mockReset();
  });

  it("does nothing when neither title nor description is provided", async () => {
    await writeSeoTags("post-1", {});
    expect(mockedWixFetch).not.toHaveBeenCalled();
  });

  it("merges into the existing tags and writes the full set back", async () => {
    mockedWixFetch
      .mockResolvedValueOnce({
        itemSeoTags: { tags: [{ type: "meta", props: { name: "og:image", content: "x.jpg" } }] },
      })
      .mockResolvedValueOnce(undefined);

    const result = await writeSeoTags("post-1", { title: "New title" });

    expect(result).toEqual({ ok: true });
    const patchCall = mockedWixFetch.mock.calls[1];
    const body = JSON.parse(patchCall[1].body);
    expect(body.fieldMask).toBe("tags");
    expect(body.itemSeoTags.tags).toEqual([
      { type: "meta", props: { name: "og:image", content: "x.jpg" } },
      { type: "title", children: "New title" },
    ]);
  });

  it("reports a failed write as a non-throwing result instead of failing the whole save", async () => {
    mockedWixFetch
      .mockResolvedValueOnce({ itemSeoTags: { tags: [] } })
      .mockRejectedValueOnce(new WixApiError(400, null));

    const result = await writeSeoTags("post-1", { title: "New title" });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Wix SEO API error 400");
  });
});
