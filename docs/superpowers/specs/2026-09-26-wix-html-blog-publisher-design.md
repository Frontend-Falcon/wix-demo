# Wix HTML-to-Blog Publisher — Design

## Purpose

MVP internal tool for `https://himanshusharma35.wixstudio.com/content-hub`: paste HTML, fill in a
few options, publish it as a Wix blog post — without hand-building Ricos JSON or calling Wix's
REST API by hand each time.

## Non-goals

- No auth/multi-user support — single operator, token lives in `.env.local`.
- No categoryIds/tagIds picker, no relatedPostIds/pricingPlanIds/translationId fields (multilingual
  and pricing-plan features aren't set up on this site).
- No member management — `memberId` is a fixed constant (`utils/constants.ts`), Get Members is
  never called.

## Architecture

Next.js app. All Wix API calls happen in server route handlers; the browser never sees
`AUTH_TOKEN` or talks to `wixapis.com` directly.

```
Browser  →  Next.js route handlers (app/api/**)  →  www.wixapis.com
```

### Route handlers

| Route | Method | Purpose |
|---|---|---|
| `app/api/posts/route.ts` | GET | List drafts + published posts for home screen |
| `app/api/posts/route.ts` | POST | Create a draft (optionally publish immediately) |
| `app/api/posts/[id]/route.ts` | GET | Fetch one post (draft or published) for the edit form |
| `app/api/posts/[id]/route.ts` | PATCH | Update a draft, or update+republish a published post |
| `app/api/posts/[id]/route.ts` | DELETE | Delete a draft or published post |
| `app/api/posts/[id]/publish/route.ts` | POST | Publish an existing draft |
| `app/api/posts/[id]/seo/route.ts` | GET/PATCH | Read/write Item SEO Tags for a post |

Every handler sets `Authorization: process.env.AUTH_TOKEN` and `wix-site-id: siteId` (from
`utils/constants.ts`) and forwards the Wix error body verbatim on non-2xx.

### External Wix endpoints used

| Purpose | Call |
|---|---|
| List drafts | `GET /blog/v3/draft-posts` (`status`, `paging`) |
| List published | `GET /v3/posts?fieldsets=URL,SEO` (`paging`) |
| Get one | `GET /blog/v3/draft-posts/{id}` (drafts) — published posts are read from the list-posts result, no separate get call needed for MVP |
| HTML → Ricos | `POST /ricos/v1/ricos-document/convert/to-ricos` |
| Import image | `POST /site-media/v1/files/import` |
| Create draft | `POST /blog/v3/draft-posts` |
| Update draft / republish | `PATCH /blog/v3/draft-posts/{id}` with `action: UPDATE` or `UPDATE_PUBLISH` |
| Publish | `POST /blog/v3/draft-posts/{id}/publish` |
| Delete | `DELETE /blog/v3/draft-posts/{id}` (works for both draft and published post ids, per Wix docs) |
| SEO read | `GET /promote/seo/v1/item-seo-tags/BLOG_POST/{id}` |
| SEO write | `PATCH /promote/seo/v1/item-seo-tags/BLOG_POST/{id}` (full-replace — always Get first, merge, then Set) |

`Get Members` and the collection's plain `Fetch Published Post` (`GET /v3/posts` with no params)
are intentionally not used — replaced by the richer `List Posts` call above with proper
fieldsets/pagination.

## Data flow: saving a post

1. User pastes HTML + fills form, clicks Save (or Save & Publish).
2. Client POSTs form data as JSON to `/api/posts` (or PATCHes `/api/posts/{id}`).
3. Handler calls Convert-to-Ricos on the HTML.
4. Handler walks the returned `richContent.nodes` tree for `IMAGE` nodes whose `image.src` is a
   `url` (external) rather than an `id` (Wix media). For each such node — and for the separate
   cover-image URL field, if provided — call Import File once per distinct URL (cache within the
   request so a repeated URL isn't imported twice), then replace `src` with `{ id: file.id }` and
   set `width`/`height` from the import response.
5. Handler builds the `draftPost` body (title, excerpt, hashtags, featured, commentingEnabled,
   language, heroImage, richContent, memberId) and calls Create or Update.
   - If "Save & Publish" was clicked: create/update with `UPDATE_PUBLISH` action, or Create then
     immediately call Publish.
6. If the post now exists (create/update succeeded), handler calls SEO Get for `BLOG_POST/{id}`,
   merges in the SEO title/description from the form, and calls SEO Set.
7. Response returns the resulting post id + status + (if published) live URL, to the client.

Image-import failures don't abort the save — log and continue with the original external URL left
in place (documented as "this image may not display" in the response so the UI can surface it),
per the create-blog-posts recipe's guidance to degrade gracefully rather than fail the whole post.

## Home screen

Single table listing drafts and published posts together (badge shows status). Columns: title,
status, hashtags, last edited/published date. Row actions:

- **Edit** → edit form, prefilled from GET.
- **Delete** → confirm dialog → DELETE.
- **Publish** (drafts only) → POST publish → on success, opens the view popup.
- **View live** (published only) → opens the view popup directly using the post's stored URL.

## Create/Edit form

| Field | Default | Notes shown in UI |
|---|---|---|
| Title | — (required) | — |
| HTML content | — (required) | "Converted to Wix's rich-content format on save." |
| Excerpt | empty | "Leave blank — Wix generates one from your content automatically." |
| Hashtags | `[]` | comma-separated input |
| Featured | off | — |
| Commenting enabled | on | matches Wix's own default |
| Language | `en` | — |
| Cover image URL | empty | "Imported into Wix Media so it can be used as the post's cover." |
| SEO title | autofilled from Title | "Written to the page's SEO tags once the post exists — a separate Wix API from the post itself." |
| SEO meta description | autofilled from Excerpt/first paragraph | same note as above |

Two submit actions: **Save as draft**, **Save & publish**.

## Publish confirmation popup

On successful publish, a modal shows the post's live URL (`url.base + url.path` from the List
Posts response) with a "View on site" link and an embedded preview iframe, plus a close button.

## Error handling

- Every Wix call's non-2xx response is surfaced verbatim to the user (toast), not swallowed or
  retried blindly — matches the SEO recipe's explicit warning against guessing at a 400.
  Ricos JSON is capped at 10,000 characters (Wix limit) — validated client-side before submit with
  a clear message, so an over-length paste fails fast instead of round-tripping to the API.
- SEO write always does Get → merge → Set, never a blind Set, so it can't wipe out tags this app
  didn't create.

## Security note

`Wix Integration.yml` contains a live token and is currently untracked but not git-ignored — add
it to `.gitignore` as part of this work so it can't be accidentally committed. All server routes
read the token from `process.env.AUTH_TOKEN` only, never from that file.
