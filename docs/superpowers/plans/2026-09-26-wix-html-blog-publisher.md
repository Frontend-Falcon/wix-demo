# Wix HTML-to-Blog Publisher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js MVP where pasting HTML + filling a form creates/edits/publishes a Wix blog post (with SEO tags, cover image, and CRUD from a home screen), per `docs/superpowers/specs/2026-09-26-wix-html-blog-publisher-design.md`.

**Architecture:** Server-only route handlers under `app/api/**` proxy every Wix REST call (token stays in `process.env.AUTH_TOKEN`, never reaches the browser). All non-trivial logic (payload building, Ricos image rewriting, SEO tag merging) lives in small pure `utils/*.ts` modules that are unit-tested; route handlers and pages are thin wiring over those modules, verified by type-checking plus one end-to-end manual pass against the real Wix site at the end.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind (already configured). New dev dependency: `vitest` for the pure-logic unit tests. No other new dependencies.

---

## File Structure

```
utils/
  constants.ts          (existing — memberId, siteId)
  wix-client.ts          (new) — wixFetch() + WixApiError + toErrorResponse()
  wix-client.test.ts     (new)
  post-payload.ts        (new) — parseHashtags() + buildDraftPostBody()
  post-payload.test.ts   (new)
  ricos-images.ts        (new) — walk Ricos nodes, find/replace external image srcs
  ricos-images.test.ts   (new)
  seo.ts                 (new) — mergeSeoTags() + extractSeoValues()
  seo.test.ts            (new)
  wix-media.ts           (new) — importExternalImage() (Media Manager import + poll)
  wix-media.test.ts      (new)
  wix-blog.ts            (new) — orchestration: convert/create/update/publish/delete/list/SEO
  wix-blog.test.ts       (new) — targeted tests for action-selection and SEO-skip branches

app/
  api/
    posts/
      route.ts                 (new) — GET list, POST create
      [id]/
        route.ts                (new) — PATCH update, DELETE
        publish/
          route.ts              (new) — POST publish
  components/
    PostForm.tsx          (new) — shared create/edit form (client component)
    ViewPostModal.tsx     (new) — publish/view popup
  posts/
    new/
      page.tsx             (new) — create page
    [id]/
      edit/
        page.tsx           (new) — edit page (server component, loads snapshot directly)
  page.tsx                 (rewrite) — home screen: list + CRUD actions

.gitignore                 (modify) — ignore "Wix Integration.yml"
package.json                (modify) — add vitest devDependency + "test" script
```

---

## Task 1: Project setup — test runner and secrets hygiene

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Install vitest**

Run: `pnpm add -D vitest`
Expected: `vitest` added under `devDependencies` in `package.json`.

- [ ] **Step 2: Add the test script**

In `package.json`, add a `"test"` entry to `"scripts"`:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "biome check",
    "format": "biome format --write",
    "test": "vitest run"
  }
}
```

- [ ] **Step 3: Stop tracking the file with the live Wix token**

Append to `.gitignore`:

```
# Wix API collection — contains a live AUTH_TOKEN, never commit
Wix Integration.yml
```

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml .gitignore
git commit -m "chore: add vitest for unit tests, gitignore the Wix token export"
```

---

## Task 2: `utils/wix-client.ts` — shared Wix fetch wrapper

**Files:**
- Create: `utils/wix-client.ts`
- Test: `utils/wix-client.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// utils/wix-client.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run utils/wix-client.test.ts`
Expected: FAIL — `Cannot find module './wix-client'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```ts
// utils/wix-client.ts
import { siteId } from "./constants";

const WIX_BASE_URL = "https://www.wixapis.com";

export class WixApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`Wix API error ${status}`);
    this.status = status;
    this.body = body;
  }
}

export async function wixFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.AUTH_TOKEN;
  if (!token) throw new Error("AUTH_TOKEN environment variable is not set");

  const response = await fetch(`${WIX_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
      "wix-site-id": siteId,
      ...init.headers,
    },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) throw new WixApiError(response.status, body);
  return body as T;
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof WixApiError) {
    return Response.json({ error: error.body ?? error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  return Response.json({ error: message }, { status: 500 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run utils/wix-client.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add utils/wix-client.ts utils/wix-client.test.ts
git commit -m "feat: add wixFetch client wrapper with error mapping"
```

---

## Task 3: `utils/post-payload.ts` — draft post body builder

**Files:**
- Create: `utils/post-payload.ts`
- Test: `utils/post-payload.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// utils/post-payload.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run utils/post-payload.test.ts`
Expected: FAIL — `Cannot find module './post-payload'` (and `./ricos-images` doesn't exist yet either — that's expected, Task 4 creates it; for now this failure is fine).

- [ ] **Step 3: Write the implementation**

```ts
// utils/post-payload.ts
import type { RicosDocument } from "./ricos-images";

export interface PostFormInput {
  title: string;
  excerpt?: string;
  hashtags?: string;
  featured?: boolean;
  commentingEnabled?: boolean;
  language?: string;
}

export interface DraftPostBody {
  title: string;
  memberId: string;
  excerpt?: string;
  hashtags: string[];
  featured: boolean;
  commentingEnabled: boolean;
  language: string;
  richContent: RicosDocument;
  heroImage?: { id: string };
}

export function parseHashtags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

export function buildDraftPostBody(
  input: PostFormInput,
  richContent: RicosDocument,
  memberId: string,
  heroImageId?: string
): DraftPostBody {
  const body: DraftPostBody = {
    title: input.title,
    memberId,
    hashtags: parseHashtags(input.hashtags),
    featured: input.featured ?? false,
    commentingEnabled: input.commentingEnabled ?? true,
    language: input.language?.trim() || "en",
    richContent,
  };

  const excerpt = input.excerpt?.trim();
  if (excerpt) body.excerpt = excerpt;
  if (heroImageId) body.heroImage = { id: heroImageId };

  return body;
}
```

You'll also need `utils/ricos-images.ts` to exist for this to type-check — that's built in Task 4. It's fine to write this file now; the test stays red until Task 4 lands.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run utils/post-payload.test.ts`
Expected: Still FAILS at this point because `./ricos-images` doesn't exist yet. That's expected — proceed to Task 4, then come back and re-run this exact command, which should now PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add utils/post-payload.ts utils/post-payload.test.ts
git commit -m "feat: add buildDraftPostBody payload builder"
```

---

## Task 4: `utils/ricos-images.ts` — external image discovery and rewriting

**Files:**
- Create: `utils/ricos-images.ts`
- Test: `utils/ricos-images.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// utils/ricos-images.test.ts
import { describe, it, expect } from "vitest";
import { collectExternalImageUrls, replaceExternalImageSrcs, type RicosNode } from "./ricos-images";

describe("collectExternalImageUrls", () => {
  it("finds external image URLs at any depth and dedupes them", () => {
    const nodes: RicosNode[] = [
      { type: "PARAGRAPH", nodes: [] },
      {
        type: "TABLE",
        nodes: [
          { type: "IMAGE", imageData: { image: { src: { url: "https://example.com/a.jpg" } } } },
          { type: "IMAGE", imageData: { image: { src: { url: "https://example.com/a.jpg" } } } },
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run utils/ricos-images.test.ts`
Expected: FAIL — `Cannot find module './ricos-images'`.

- [ ] **Step 3: Write the implementation**

```ts
// utils/ricos-images.ts
export interface RicosImageSrc {
  id?: string;
  url?: string;
}

export interface RicosNode {
  type: string;
  nodes?: RicosNode[];
  imageData?: {
    image?: {
      src?: RicosImageSrc;
      width?: number;
      height?: number;
    };
  };
  [key: string]: unknown;
}

export interface RicosDocument {
  nodes: RicosNode[];
}

export function collectExternalImageUrls(nodes: RicosNode[] | undefined): string[] {
  const urls = new Set<string>();

  const walk = (list: RicosNode[] | undefined) => {
    if (!list) return;
    for (const node of list) {
      const src = node.imageData?.image?.src;
      if (node.type === "IMAGE" && src?.url && !src.id) urls.add(src.url);
      walk(node.nodes);
    }
  };

  walk(nodes);
  return [...urls];
}

export function replaceExternalImageSrcs(
  nodes: RicosNode[] | undefined,
  imported: Map<string, { id: string; width: number; height: number }>
): void {
  const walk = (list: RicosNode[] | undefined) => {
    if (!list) return;
    for (const node of list) {
      const image = node.imageData?.image;
      if (node.type === "IMAGE" && image?.src?.url) {
        const match = imported.get(image.src.url);
        if (match) {
          image.src = { id: match.id };
          if (!image.width) image.width = match.width;
          if (!image.height) image.height = match.height;
        }
      }
      walk(node.nodes);
    }
  };

  walk(nodes);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run utils/ricos-images.test.ts utils/post-payload.test.ts`
Expected: PASS (all tests in both files — this also unblocks Task 3's test).

- [ ] **Step 5: Commit**

```bash
git add utils/ricos-images.ts utils/ricos-images.test.ts
git commit -m "feat: add Ricos external-image discovery and rewriting"
```

---

## Task 5: `utils/seo.ts` — SEO tag merge/extract

**Files:**
- Create: `utils/seo.ts`
- Test: `utils/seo.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// utils/seo.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run utils/seo.test.ts`
Expected: FAIL — `Cannot find module './seo'`.

- [ ] **Step 3: Write the implementation**

```ts
// utils/seo.ts
export interface SeoTag {
  type: "title" | "meta" | "script" | "link";
  children?: string;
  props?: Record<string, string>;
}

export function mergeSeoTags(
  existing: SeoTag[],
  input: { title?: string; description?: string }
): SeoTag[] {
  let tags = [...existing];

  if (input.title !== undefined) {
    tags = tags.filter((tag) => tag.type !== "title");
    if (input.title) tags.push({ type: "title", children: input.title });
  }

  if (input.description !== undefined) {
    tags = tags.filter((tag) => !(tag.type === "meta" && tag.props?.name === "description"));
    if (input.description) {
      tags.push({ type: "meta", props: { name: "description", content: input.description } });
    }
  }

  return tags;
}

export function extractSeoValues(tags: SeoTag[]): { title?: string; description?: string } {
  const titleTag = tags.find((tag) => tag.type === "title");
  const descriptionTag = tags.find((tag) => tag.type === "meta" && tag.props?.name === "description");
  return {
    title: titleTag?.children,
    description: descriptionTag?.props?.content,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run utils/seo.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add utils/seo.ts utils/seo.test.ts
git commit -m "feat: add SEO tag merge/extract helpers"
```

---

## Task 6: `utils/wix-media.ts` — image import with dimension polling

**Files:**
- Create: `utils/wix-media.ts`
- Test: `utils/wix-media.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// utils/wix-media.test.ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run utils/wix-media.test.ts`
Expected: FAIL — `Cannot find module './wix-media'`.

- [ ] **Step 3: Write the implementation**

```ts
// utils/wix-media.ts
import { wixFetch } from "./wix-client";

export interface ImportedImage {
  id: string;
  width: number;
  height: number;
}

interface ImportFileResponse {
  file: { id: string; operationStatus: string };
}

interface GetFileByIdResponse {
  file: {
    id: string;
    operationStatus: string;
    media?: { image?: { image?: { width: number; height: number } } };
  };
}

const DEFAULT_POLL_ATTEMPTS = 5;
const DEFAULT_POLL_DELAY_MS = 300;
// ponytail: fallback size when Wix hasn't computed the image's real dimensions
// within our polling budget — keeps the Ricos IMAGE node valid (it requires
// both width and height). Upgrade path: poll longer, or accept a slightly
// stretched/cropped image as good enough for an MVP.
const FALLBACK_WIDTH = 1200;
const FALLBACK_HEIGHT = 800;

export async function importExternalImage(
  url: string,
  options: { pollAttempts?: number; pollDelayMs?: number } = {}
): Promise<ImportedImage> {
  const pollAttempts = options.pollAttempts ?? DEFAULT_POLL_ATTEMPTS;
  const pollDelayMs = options.pollDelayMs ?? DEFAULT_POLL_DELAY_MS;

  const { file } = await wixFetch<ImportFileResponse>("/site-media/v1/files/import", {
    method: "POST",
    body: JSON.stringify({ url, displayName: "Imported image" }),
  });

  for (let attempt = 0; attempt < pollAttempts; attempt++) {
    const status = await wixFetch<GetFileByIdResponse>(
      `/site-media/v1/files/get-file-by-id?fileId=${encodeURIComponent(file.id)}`
    );
    const dims = status.file.media?.image?.image;
    if (dims) return { id: file.id, width: dims.width, height: dims.height };
    if (status.file.operationStatus === "FAILED") break;
    await new Promise((resolve) => setTimeout(resolve, pollDelayMs));
  }

  return { id: file.id, width: FALLBACK_WIDTH, height: FALLBACK_HEIGHT };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run utils/wix-media.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add utils/wix-media.ts utils/wix-media.test.ts
git commit -m "feat: add Wix Media import with dimension polling and fallback"
```

---

## Task 7: `utils/wix-blog.ts` — orchestration layer

**Files:**
- Create: `utils/wix-blog.ts`
- Test: `utils/wix-blog.test.ts`

- [ ] **Step 1: Write the failing test**

These tests target the two branchy pieces of logic in this file — action selection on update, and the SEO skip/merge behavior. The rest of the file is thin sequencing over already-tested helpers and gets its check in Task 15's manual pass.

```ts
// utils/wix-blog.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run utils/wix-blog.test.ts`
Expected: FAIL — `Cannot find module './wix-blog'`.

- [ ] **Step 3: Write the implementation**

```ts
// utils/wix-blog.ts
import { memberId } from "./constants";
import { wixFetch } from "./wix-client";
import { buildDraftPostBody, type DraftPostBody, type PostFormInput } from "./post-payload";
import { collectExternalImageUrls, replaceExternalImageSrcs, type RicosDocument } from "./ricos-images";
import { importExternalImage } from "./wix-media";
import { extractSeoValues, mergeSeoTags, type SeoTag } from "./seo";

export interface PostListItem {
  id: string;
  title: string;
  status: "draft" | "published";
  hashtags: string[];
  editedDate?: string;
  url?: string;
}

export interface RawDraftPost {
  id: string;
  title: string;
  excerpt?: string;
  hashtags?: string[];
  featured?: boolean;
  commentingEnabled?: boolean;
  language?: string;
  status?: string;
  richContent?: RicosDocument;
  heroImage?: { id?: string; url?: string; altText?: string };
}

export interface PostFormSnapshot {
  title: string;
  html: string;
  excerpt: string;
  hashtags: string;
  featured: boolean;
  commentingEnabled: boolean;
  language: string;
  status: "draft" | "published";
  coverImageUrl: string;
  seoTitle: string;
  seoDescription: string;
}

export async function convertHtmlToRicos(html: string): Promise<RicosDocument> {
  const res = await wixFetch<{ document: RicosDocument }>(
    "/ricos/v1/ricos-document/convert/to-ricos",
    {
      method: "POST",
      body: JSON.stringify({
        html,
        options: {
          plugins: ["HEADING", "LINK", "IMAGE", "TEXT_COLOR", "TEXT_HIGHLIGHT", "DIVIDER", "TABLE"],
        },
      }),
    }
  );
  return res.document;
}

export async function convertRicosToHtml(document: RicosDocument): Promise<string> {
  const res = await wixFetch<{ html: string }>("/ricos/v1/ricos-document/convert/from-ricos", {
    method: "POST",
    body: JSON.stringify({ document, targetFormat: "HTML" }),
  });
  return res.html;
}

export async function importRicosImages(document: RicosDocument): Promise<RicosDocument> {
  const urls = collectExternalImageUrls(document.nodes);
  if (urls.length === 0) return document;

  const imported = new Map<string, { id: string; width: number; height: number }>();
  for (const url of urls) {
    try {
      imported.set(url, await importExternalImage(url));
    } catch {
      // ponytail: one bad image shouldn't fail the whole post — it's left
      // as an external URL and simply won't render on the published page.
    }
  }
  replaceExternalImageSrcs(document.nodes, imported);
  return document;
}

export async function listDraftPosts(): Promise<PostListItem[]> {
  const res = await wixFetch<{
    draftPosts: Array<{ id: string; title: string; hashtags?: string[]; updatedDate?: string }>;
  }>("/blog/v3/draft-posts?status=UNPUBLISHED&paging.limit=100");
  return res.draftPosts.map((post) => ({
    id: post.id,
    title: post.title,
    status: "draft",
    hashtags: post.hashtags ?? [],
    editedDate: post.updatedDate,
  }));
}

export async function listPublishedPosts(): Promise<PostListItem[]> {
  const res = await wixFetch<{
    posts: Array<{
      id: string;
      title: string;
      hashtags?: string[];
      lastPublishedDate?: string;
      url?: { base: string; path: string };
    }>;
  }>("/v3/posts?fieldsets=URL&paging.limit=100");
  return res.posts.map((post) => ({
    id: post.id,
    title: post.title,
    status: "published",
    hashtags: post.hashtags ?? [],
    editedDate: post.lastPublishedDate,
    url: post.url ? `${post.url.base}${post.url.path}` : undefined,
  }));
}

export async function getDraftPost(id: string): Promise<RawDraftPost> {
  const res = await wixFetch<{ draftPost: RawDraftPost }>(`/blog/v3/draft-posts/${id}`);
  return res.draftPost;
}

export async function createDraftPost(
  input: PostFormInput,
  html: string,
  coverImageUrl?: string
): Promise<string> {
  let richContent = await convertHtmlToRicos(html);
  richContent = await importRicosImages(richContent);

  let heroImageId: string | undefined;
  if (coverImageUrl) heroImageId = (await importExternalImage(coverImageUrl)).id;

  const draftPost = buildDraftPostBody(input, richContent, memberId, heroImageId);
  const res = await wixFetch<{ draftPost: { id: string } }>("/blog/v3/draft-posts", {
    method: "POST",
    body: JSON.stringify({ draftPost }),
  });
  return res.draftPost.id;
}

export async function updateDraftPost(
  id: string,
  input: PostFormInput,
  html: string,
  currentStatus: "draft" | "published",
  publish: boolean,
  coverImageUrl?: string
): Promise<void> {
  let richContent = await convertHtmlToRicos(html);
  richContent = await importRicosImages(richContent);

  let heroImageId: string | undefined;
  if (coverImageUrl) heroImageId = (await importExternalImage(coverImageUrl)).id;

  const draftPost: DraftPostBody & { id: string } = {
    id,
    ...buildDraftPostBody(input, richContent, memberId, heroImageId),
  };
  const action =
    currentStatus === "published" ? "UPDATE_PUBLICATION" : publish ? "UPDATE_PUBLISH" : "UPDATE";

  await wixFetch(`/blog/v3/draft-posts/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ draftPost, action }),
  });
}

export async function publishDraftPost(id: string): Promise<void> {
  await wixFetch(`/blog/v3/draft-posts/${id}/publish`, { method: "POST" });
}

export async function deletePost(id: string): Promise<void> {
  await wixFetch(`/blog/v3/draft-posts/${id}`, { method: "DELETE" });
}

export async function getPublishedPostUrl(id: string): Promise<string | undefined> {
  const res = await wixFetch<{ post: { url?: { base: string; path: string } } }>(
    `/v3/posts/${id}?fieldsets=URL`
  );
  return res.post.url ? `${res.post.url.base}${res.post.url.path}` : undefined;
}

export async function readSeoTags(id: string): Promise<{ title?: string; description?: string }> {
  try {
    const current = await wixFetch<{ itemSeoTags: { tags: SeoTag[] } }>(
      `/promote/seo/v1/item-seo-tags/BLOG_POST/${id}`
    );
    return extractSeoValues(current.itemSeoTags.tags);
  } catch {
    return {};
  }
}

export async function writeSeoTags(
  id: string,
  input: { title?: string; description?: string }
): Promise<void> {
  if (input.title === undefined && input.description === undefined) return;

  let existing: SeoTag[] = [];
  try {
    const current = await wixFetch<{ itemSeoTags: { tags: SeoTag[] } }>(
      `/promote/seo/v1/item-seo-tags/BLOG_POST/${id}`
    );
    existing = current.itemSeoTags.tags;
  } catch {
    // ponytail: a brand-new post may not be SEO-indexed yet — start from an
    // empty tag list instead of failing the save.
  }

  const tags = mergeSeoTags(existing, input);
  await wixFetch(`/promote/seo/v1/item-seo-tags/BLOG_POST/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ itemSeoTags: { tags }, fieldMask: "tags" }),
  });
}

export async function loadPostFormSnapshot(id: string): Promise<PostFormSnapshot> {
  const draftPost = await getDraftPost(id);
  const seo = await readSeoTags(id);
  return {
    title: draftPost.title,
    html: draftPost.richContent ? await convertRicosToHtml(draftPost.richContent) : "",
    excerpt: draftPost.excerpt ?? "",
    hashtags: draftPost.hashtags?.join(", ") ?? "",
    featured: Boolean(draftPost.featured),
    commentingEnabled: draftPost.commentingEnabled !== false,
    language: draftPost.language ?? "en",
    status: draftPost.status === "PUBLISHED" ? "published" : "draft",
    coverImageUrl: draftPost.heroImage?.url ?? "",
    seoTitle: seo.title ?? "",
    seoDescription: seo.description ?? "",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run utils/wix-blog.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full unit test suite**

Run: `pnpm test`
Expected: PASS — every test file from Tasks 2–7 passes (21 tests total).

- [ ] **Step 6: Commit**

```bash
git add utils/wix-blog.ts utils/wix-blog.test.ts
git commit -m "feat: add Wix blog orchestration layer (create/update/publish/list/SEO)"
```

---

## Task 8: `app/api/posts/route.ts` — list and create

**Files:**
- Create: `app/api/posts/route.ts`

- [ ] **Step 1: Write the route handler**

```ts
// app/api/posts/route.ts
import { toErrorResponse } from "@/utils/wix-client";
import {
  createDraftPost,
  getPublishedPostUrl,
  listDraftPosts,
  listPublishedPosts,
  publishDraftPost,
  writeSeoTags,
} from "@/utils/wix-blog";

export async function GET() {
  try {
    const [drafts, published] = await Promise.all([listDraftPosts(), listPublishedPosts()]);
    const posts = [...drafts, ...published].sort((a, b) =>
      (b.editedDate ?? "").localeCompare(a.editedDate ?? "")
    );
    return Response.json({ posts });
  } catch (error) {
    return toErrorResponse(error);
  }
}

interface CreatePostRequest {
  title: string;
  html: string;
  excerpt?: string;
  hashtags?: string;
  featured?: boolean;
  commentingEnabled?: boolean;
  language?: string;
  coverImageUrl?: string;
  seoTitle?: string;
  seoDescription?: string;
  publish: boolean;
}

export async function POST(request: Request) {
  const body = (await request.json()) as CreatePostRequest;
  if (!body.title?.trim() || !body.html?.trim()) {
    return Response.json({ error: "title and html are required" }, { status: 400 });
  }

  try {
    const id = await createDraftPost(body, body.html, body.coverImageUrl);
    if (body.publish) await publishDraftPost(id);
    await writeSeoTags(id, { title: body.seoTitle, description: body.seoDescription });
    const url = body.publish ? await getPublishedPostUrl(id) : undefined;
    return Response.json({ id, status: body.publish ? "published" : "draft", url }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: No errors referencing `app/api/posts/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/api/posts/route.ts
git commit -m "feat: add list/create route for posts"
```

---

## Task 9: `app/api/posts/[id]/route.ts` — update and delete

**Files:**
- Create: `app/api/posts/[id]/route.ts`

- [ ] **Step 1: Write the route handler**

```ts
// app/api/posts/[id]/route.ts
import { toErrorResponse } from "@/utils/wix-client";
import {
  deletePost,
  getDraftPost,
  getPublishedPostUrl,
  updateDraftPost,
  writeSeoTags,
} from "@/utils/wix-blog";

interface UpdatePostRequest {
  title: string;
  html: string;
  excerpt?: string;
  hashtags?: string;
  featured?: boolean;
  commentingEnabled?: boolean;
  language?: string;
  coverImageUrl?: string;
  seoTitle?: string;
  seoDescription?: string;
  publish: boolean;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as UpdatePostRequest;
  if (!body.title?.trim() || !body.html?.trim()) {
    return Response.json({ error: "title and html are required" }, { status: 400 });
  }

  try {
    const draftPost = await getDraftPost(id);
    const currentStatus = draftPost.status === "PUBLISHED" ? "published" : "draft";
    await updateDraftPost(id, body, body.html, currentStatus, body.publish, body.coverImageUrl);
    await writeSeoTags(id, { title: body.seoTitle, description: body.seoDescription });

    const isNowPublished = currentStatus === "published" || body.publish;
    const url = isNowPublished ? await getPublishedPostUrl(id) : undefined;
    return Response.json({ id, status: isNowPublished ? "published" : "draft", url });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await deletePost(id);
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: No errors referencing `app/api/posts/[id]/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add "app/api/posts/[id]/route.ts"
git commit -m "feat: add update/delete route for a single post"
```

---

## Task 10: `app/api/posts/[id]/publish/route.ts` — publish

**Files:**
- Create: `app/api/posts/[id]/publish/route.ts`

- [ ] **Step 1: Write the route handler**

```ts
// app/api/posts/[id]/publish/route.ts
import { toErrorResponse } from "@/utils/wix-client";
import { getPublishedPostUrl, publishDraftPost } from "@/utils/wix-blog";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await publishDraftPost(id);
    const url = await getPublishedPostUrl(id);
    return Response.json({ id, status: "published", url });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: No errors referencing `app/api/posts/[id]/publish/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add "app/api/posts/[id]/publish/route.ts"
git commit -m "feat: add publish route for a draft post"
```

---

## Task 11: `app/components/ViewPostModal.tsx` — publish/view popup

**Files:**
- Create: `app/components/ViewPostModal.tsx`

- [ ] **Step 1: Write the component**

```tsx
// app/components/ViewPostModal.tsx
"use client";

interface ViewPostModalProps {
  url: string;
  onClose: () => void;
}

export function ViewPostModal({ url, onClose }: ViewPostModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl rounded-lg bg-white shadow-xl dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Published</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
          >
            Close
          </button>
        </div>
        <div className="p-4">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            View on site →
          </a>
          <iframe
            src={url}
            title="Published post preview"
            className="mt-3 h-[60vh] w-full rounded border border-zinc-200 dark:border-zinc-800"
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: No errors referencing `app/components/ViewPostModal.tsx`.

- [ ] **Step 3: Commit**

```bash
git add app/components/ViewPostModal.tsx
git commit -m "feat: add publish/view popup component"
```

---

## Task 12: `app/components/PostForm.tsx` — shared create/edit form

**Files:**
- Create: `app/components/PostForm.tsx`

- [ ] **Step 1: Write the component**

```tsx
// app/components/PostForm.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PostFormSnapshot } from "@/utils/wix-blog";

export type PostFormValues = Omit<PostFormSnapshot, "status">;

export const DEFAULT_POST_FORM_VALUES: PostFormValues = {
  title: "",
  html: "",
  excerpt: "",
  hashtags: "",
  featured: false,
  commentingEnabled: true,
  language: "en",
  coverImageUrl: "",
  seoTitle: "",
  seoDescription: "",
};

interface PostFormProps {
  postId?: string;
  initialValues?: PostFormValues;
}

export function PostForm({ postId, initialValues }: PostFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<PostFormValues>(initialValues ?? DEFAULT_POST_FORM_VALUES);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateField<K extends keyof PostFormValues>(key: K, value: PostFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(publish: boolean) {
    setIsSaving(true);
    setError(null);
    try {
      const seoTitle = values.seoTitle.trim() || values.title;
      const seoDescription = values.seoDescription.trim() || values.excerpt;
      const payload = { ...values, seoTitle, seoDescription, publish };
      const url = postId ? `/api/posts/${postId}` : "/api/posts";
      const method = postId ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(typeof result.error === "string" ? result.error : JSON.stringify(result.error));
      }

      if (result.url) sessionStorage.setItem("viewPostUrl", result.url);
      router.push("/");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Something went wrong");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="mx-auto flex max-w-2xl flex-col gap-6 py-10" onSubmit={(event) => event.preventDefault()}>
      {error && (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Title</span>
        <input
          className="rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          value={values.title}
          onChange={(event) => updateField("title", event.target.value)}
          required
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">HTML content</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Converted to Wix&apos;s rich-content format on save.
        </span>
        <textarea
          className="h-48 rounded border border-zinc-300 px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
          value={values.html}
          onChange={(event) => updateField("html", event.target.value)}
          required
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Excerpt</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Leave blank — Wix generates one from your content automatically.
        </span>
        <textarea
          className="h-20 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          value={values.excerpt}
          onChange={(event) => updateField("excerpt", event.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Hashtags</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">Comma-separated.</span>
        <input
          className="rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          value={values.hashtags}
          onChange={(event) => updateField("hashtags", event.target.value)}
        />
      </label>

      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-100">
          <input
            type="checkbox"
            checked={values.featured}
            onChange={(event) => updateField("featured", event.target.checked)}
          />
          Featured
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-100">
          <input
            type="checkbox"
            checked={values.commentingEnabled}
            onChange={(event) => updateField("commentingEnabled", event.target.checked)}
          />
          Commenting enabled
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Language</span>
        <input
          className="rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          value={values.language}
          onChange={(event) => updateField("language", event.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Cover image URL</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Imported into Wix Media so it can be used as the post&apos;s cover.
        </span>
        <input
          className="rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          value={values.coverImageUrl}
          onChange={(event) => updateField("coverImageUrl", event.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">SEO title</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Written to the page&apos;s SEO tags once the post exists — a separate Wix API from the
          post itself. Defaults to the title above if left blank.
        </span>
        <input
          className="rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          value={values.seoTitle}
          onChange={(event) => updateField("seoTitle", event.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">SEO meta description</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">Defaults to the excerpt above if left blank.</span>
        <textarea
          className="h-20 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          value={values.seoDescription}
          onChange={(event) => updateField("seoDescription", event.target.value)}
        />
      </label>

      <div className="flex gap-3">
        <button
          type="button"
          disabled={isSaving}
          onClick={() => handleSubmit(false)}
          className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-100"
        >
          Save as draft
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={() => handleSubmit(true)}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Save &amp; publish
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: No errors referencing `app/components/PostForm.tsx`.

- [ ] **Step 3: Commit**

```bash
git add app/components/PostForm.tsx
git commit -m "feat: add shared create/edit post form"
```

---

## Task 13: Create and edit pages

**Files:**
- Create: `app/posts/new/page.tsx`
- Create: `app/posts/[id]/edit/page.tsx`

- [ ] **Step 1: Write the create page**

```tsx
// app/posts/new/page.tsx
import { PostForm } from "@/app/components/PostForm";

export default function NewPostPage() {
  return (
    <main className="flex flex-1 justify-center px-6">
      <PostForm />
    </main>
  );
}
```

- [ ] **Step 2: Write the edit page**

```tsx
// app/posts/[id]/edit/page.tsx
import { PostForm } from "@/app/components/PostForm";
import { loadPostFormSnapshot } from "@/utils/wix-blog";

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const initialValues = await loadPostFormSnapshot(id);

  return (
    <main className="flex flex-1 justify-center px-6">
      <PostForm postId={id} initialValues={initialValues} />
    </main>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: No errors referencing either new page.

- [ ] **Step 4: Commit**

```bash
git add app/posts/new/page.tsx "app/posts/[id]/edit/page.tsx"
git commit -m "feat: add create and edit pages"
```

---

## Task 14: Home screen — list and CRUD actions

**Files:**
- Modify: `app/page.tsx` (replace the default `create-next-app` template entirely)

- [ ] **Step 1: Write the home page**

```tsx
// app/page.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ViewPostModal } from "./components/ViewPostModal";

interface PostListItem {
  id: string;
  title: string;
  status: "draft" | "published";
  hashtags: string[];
  editedDate?: string;
  url?: string;
}

export default function Home() {
  const [posts, setPosts] = useState<PostListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/posts");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Failed to load posts");
      setPosts(result.posts);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load posts");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    const stored = sessionStorage.getItem("viewPostUrl");
    if (stored) {
      setViewUrl(stored);
      sessionStorage.removeItem("viewPostUrl");
    }
  }, []);

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this post? This moves it to the trash bin.")) return;
    setBusyId(id);
    try {
      const response = await fetch(`/api/posts/${id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Failed to delete post");
      await loadPosts();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete post");
    } finally {
      setBusyId(null);
    }
  }

  async function handlePublish(id: string) {
    setBusyId(id);
    try {
      const response = await fetch(`/api/posts/${id}/publish`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Failed to publish post");
      if (result.url) setViewUrl(result.url);
      await loadPosts();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Failed to publish post");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-6 px-6 py-10 md:px-12">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Content Hub</h1>
        <Link
          href="/posts/new"
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          New post
        </Link>
      </div>

      {error && (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : posts.length === 0 ? (
        <p className="text-sm text-zinc-500">No posts yet.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
              <th className="py-2">Title</th>
              <th className="py-2">Status</th>
              <th className="py-2">Hashtags</th>
              <th className="py-2">Last edited</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post.id} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="py-2 font-medium text-zinc-900 dark:text-zinc-100">{post.title}</td>
                <td className="py-2 capitalize text-zinc-600 dark:text-zinc-400">{post.status}</td>
                <td className="py-2 text-zinc-600 dark:text-zinc-400">{post.hashtags.join(", ")}</td>
                <td className="py-2 text-zinc-600 dark:text-zinc-400">
                  {post.editedDate ? new Date(post.editedDate).toLocaleDateString() : "—"}
                </td>
                <td className="py-2">
                  <div className="flex justify-end gap-3">
                    <Link href={`/posts/${post.id}/edit`} className="text-blue-600 hover:underline">
                      Edit
                    </Link>
                    {post.status === "draft" && (
                      <button
                        type="button"
                        disabled={busyId === post.id}
                        onClick={() => handlePublish(post.id)}
                        className="text-blue-600 hover:underline disabled:opacity-50"
                      >
                        Publish
                      </button>
                    )}
                    {post.status === "published" && post.url && (
                      <button
                        type="button"
                        onClick={() => setViewUrl(post.url ?? null)}
                        className="text-blue-600 hover:underline"
                      >
                        View live
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyId === post.id}
                      onClick={() => handleDelete(post.id)}
                      className="text-red-600 hover:underline disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {viewUrl && <ViewPostModal url={viewUrl} onClose={() => setViewUrl(null)} />}
    </main>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: No errors referencing `app/page.tsx`.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: build home screen with post list and CRUD actions"
```

---

## Task 15: End-to-end manual verification against the live Wix site

**Files:** none (verification only)

This is the "does it actually work" check for everything Tasks 8–14 wired together — the unit
tests from Tasks 2–7 already cover the logic; this exercises the real Wix API calls.

- [ ] **Step 1: Confirm `.env.local` has a valid `AUTH_TOKEN`**

Run: `grep -c AUTH_TOKEN .env.local`
Expected: `1`. If missing, add it (server-only var, never `NEXT_PUBLIC_`).

- [ ] **Step 2: Start the dev server**

Run: `pnpm dev`
Expected: Server starts on `http://localhost:3000` with no build errors.

- [ ] **Step 3: Create and publish a post**

In the browser: open `http://localhost:3000`, click "New post", fill in a title and a small HTML
snippet with one `<img src="https://images.unsplash.com/...">`, set an SEO title/description,
click "Save & publish".
Expected: Redirected to the home screen, the "Published" popup shows a live URL, and opening that
URL in a new tab shows the post with the image rendered (confirms the image auto-import path
worked, not just the text).

- [ ] **Step 4: Edit the published post**

Click "Edit" on the post just created, change the title, click "Save & publish" again.
Expected: No error; "View live" on the home screen opens the updated title.

- [ ] **Step 5: Create a draft, then delete it**

Create a second post with "Save as draft" (don't publish). Confirm it shows status "Draft" on the
home screen. Click "Delete", confirm the dialog.
Expected: Post disappears from the list after the confirm.

- [ ] **Step 6: Check the SEO tags actually landed**

For the published post from Step 3, verify its SEO title in the Wix dashboard (Marketing & SEO →
that page's SEO settings) matches what was typed in the form.
Expected: Match. If not, re-check `writeSeoTags`'s itemId (must be the post's id, not the draft's
different id, if those ever diverge for a published post — confirm they don't for this site).

- [ ] **Step 7: Run the full check one more time**

```bash
pnpm test
pnpm exec tsc --noEmit
```
Expected: Both pass clean.

- [ ] **Step 8: Commit anything left over (docs/log only — no code changes expected)**

If Step 3–6 surfaced no code changes, there's nothing to commit here — this task is verification
only. If something broke, fix it inline as part of the relevant earlier task's file, re-run its
tests, and commit that fix with a message describing what was wrong (e.g. `fix: correct SEO item
type for published posts`).

---

## Plan Self-Review Notes

- **Spec coverage:** every section of the design doc maps to a task — architecture/routes (Tasks
  8–10), image auto-import (Tasks 4, 6, 7), SEO write (Tasks 5, 7), home screen CRUD (Task 14),
  create/edit form with autofilled defaults (Task 12), view popup (Task 11), delete via trash bin
  (Task 9 + Step 3 of Task 15's checklist).
- **Deliberate deviation from the spec's route table:** the spec listed a `GET /api/posts/[id]`
  route and a standalone `/api/posts/[id]/seo` route. Neither is implemented as its own route:
  the edit page (a server component) calls `loadPostFormSnapshot()` directly instead of
  round-tripping through its own API, and SEO reads/writes are plain function calls inside the
  create/update flow rather than a separate HTTP hop on the same server. Fewer files, same
  behavior — flagged here since it's a deviation, not an oversight.
