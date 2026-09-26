import { describe, it, expect } from "vitest";
import { collectExternalImageUrls, replaceExternalImageSrcs, type RicosNode } from "./ricos-images";

describe("collectExternalImageUrls", () => {
  it("finds external image URLs at any depth and dedupes them", () => {
    const nodes: RicosNode[] = [
      { type: "PARAGRAPH", nodes: [] },
      {
        type: "TABLE",
        nodes: [
          {
            type: "TABLE_ROW",
            nodes: [
              {
                type: "TABLE_CELL",
                nodes: [
                  { type: "IMAGE", imageData: { image: { src: { url: "https://example.com/a.jpg" } } } },
                ],
              },
              {
                type: "TABLE_CELL",
                nodes: [
                  { type: "IMAGE", imageData: { image: { src: { url: "https://example.com/a.jpg" } } } },
                ],
              },
            ],
          },
        ],
      },
      { type: "IMAGE", imageData: { image: { src: { id: "already-imported" } } } },
    ];

    expect(collectExternalImageUrls(nodes)).toEqual(["https://example.com/a.jpg"]);
  });

  it("returns an empty array when there are no nodes", () => {
    expect(collectExternalImageUrls(undefined)).toEqual([]);
  });
});

describe("replaceExternalImageSrcs", () => {
  it("replaces matched external URLs with the imported media id", () => {
    const nodes: RicosNode[] = [
      { type: "IMAGE", imageData: { image: { src: { url: "https://example.com/a.jpg" } } } },
    ];
    const imported = new Map([["https://example.com/a.jpg", { id: "media-1", width: 400, height: 300 }]]);

    replaceExternalImageSrcs(nodes, imported);

    expect(nodes[0].imageData?.image?.src).toEqual({ id: "media-1" });
    expect(nodes[0].imageData?.image?.width).toBe(400);
    expect(nodes[0].imageData?.image?.height).toBe(300);
  });

  it("keeps an existing width/height instead of overwriting it", () => {
    const nodes: RicosNode[] = [
      {
        type: "IMAGE",
        imageData: { image: { src: { url: "https://example.com/a.jpg" }, width: 900, height: 600 } },
      },
    ];
    const imported = new Map([["https://example.com/a.jpg", { id: "media-1", width: 400, height: 300 }]]);

    replaceExternalImageSrcs(nodes, imported);

    expect(nodes[0].imageData?.image?.width).toBe(900);
    expect(nodes[0].imageData?.image?.height).toBe(600);
  });

  it("leaves nodes unmatched by the imported map untouched", () => {
    const nodes: RicosNode[] = [
      { type: "IMAGE", imageData: { image: { src: { url: "https://example.com/missing.jpg" } } } },
    ];

    replaceExternalImageSrcs(nodes, new Map());

    expect(nodes[0].imageData?.image?.src).toEqual({ url: "https://example.com/missing.jpg" });
  });
});
