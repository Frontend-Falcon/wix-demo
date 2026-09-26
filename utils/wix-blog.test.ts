import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./wix-client", () => ({ wixFetch: vi.fn() }));

import { wixFetch } from "./wix-client";
import { updateDraftPost, writeSeoTags } from "./wix-blog";

const mockedWixFetch = wixFetch as unknown as ReturnType<typeof vi.fn>;

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

    await writeSeoTags("post-1", { title: "New title" });

    const patchCall = mockedWixFetch.mock.calls[1];
    const body = JSON.parse(patchCall[1].body);
    expect(body.fieldMask).toBe("tags");
    expect(body.itemSeoTags.tags).toEqual([
      { type: "meta", props: { name: "og:image", content: "x.jpg" } },
      { type: "title", children: "New title" },
    ]);
  });
});
