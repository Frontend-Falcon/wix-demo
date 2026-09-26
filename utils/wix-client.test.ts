import { describe, it, expect, vi, beforeEach } from "vitest";
import { wixFetch, WixApiError, toErrorResponse } from "./wix-client";

describe("wixFetch", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_TOKEN", "test-token");
  });

  it("sends the auth and site headers and returns parsed JSON", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hello: "world" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await wixFetch<{ hello: string }>("/some/path");

    expect(result).toEqual({ hello: "world" });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://www.wixapis.com/some/path");
    expect(init.headers.Authorization).toBe("test-token");
    expect(init.headers["wix-site-id"]).toBe("c72d7f55-ce9a-40e5-9f0a-525ef7196087");
  });

  it("throws WixApiError with status and body on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: "bad request" }),
      })
    );

    await expect(wixFetch("/some/path")).rejects.toMatchObject({
      status: 400,
      body: { message: "bad request" },
    });
  });

  it("throws when AUTH_TOKEN is not set", async () => {
    vi.stubEnv("AUTH_TOKEN", "");
    await expect(wixFetch("/some/path")).rejects.toThrow("AUTH_TOKEN");
  });
});

describe("toErrorResponse", () => {
  it("maps a WixApiError to its status and body", async () => {
    const response = toErrorResponse(new WixApiError(404, { message: "not found" }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { message: "not found" } });
  });

  it("maps an unknown error to a 500", async () => {
    const response = toErrorResponse(new Error("boom"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "boom" });
  });
});
