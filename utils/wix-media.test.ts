import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./wix-client", () => ({ wixFetch: vi.fn() }));

import { wixFetch } from "./wix-client";
import { importExternalImage } from "./wix-media";

const mockedWixFetch = wixFetch as unknown as ReturnType<typeof vi.fn>;

describe("importExternalImage", () => {
  beforeEach(() => {
    mockedWixFetch.mockReset();
  });

  it("returns the id and dimensions once the file is ready", async () => {
    mockedWixFetch
      .mockResolvedValueOnce({ file: { id: "media-1", operationStatus: "PENDING" } })
      .mockResolvedValueOnce({
        file: {
          id: "media-1",
          operationStatus: "READY",
          media: { image: { image: { width: 400, height: 300 } } },
        },
      });

    const result = await importExternalImage("https://example.com/a.jpg", {
      pollAttempts: 3,
      pollDelayMs: 0,
    });

    expect(result).toEqual({ id: "media-1", width: 400, height: 300 });
  });

  it("falls back to a default size if dimensions never become available", async () => {
    mockedWixFetch.mockResolvedValue({ file: { id: "media-1", operationStatus: "PENDING" } });

    const result = await importExternalImage("https://example.com/a.jpg", {
      pollAttempts: 2,
      pollDelayMs: 0,
    });

    expect(result).toEqual({ id: "media-1", width: 1200, height: 800 });
  });

  it("throws if the import fails", async () => {
    mockedWixFetch
      .mockResolvedValueOnce({ file: { id: "media-1", operationStatus: "PENDING" } })
      .mockResolvedValueOnce({ file: { id: "media-1", operationStatus: "FAILED" } });

    await expect(
      importExternalImage("https://example.com/a.jpg", { pollAttempts: 3, pollDelayMs: 0 })
    ).rejects.toThrow("Wix Media import failed");
  });
});
