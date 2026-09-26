import { memberId } from "./constants";
import { wixFetch, WixApiError } from "./wix-client";
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
  const res = await wixFetch<{ draftPost: RawDraftPost }>(
    `/blog/v3/draft-posts/${encodeURIComponent(id)}`
  );
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
  // Unlike body images, a failed cover-image import fails the whole save —
  // the cover is prominent enough that silently dropping it isn't acceptable.
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
  // Unlike body images, a failed cover-image import fails the whole save —
  // the cover is prominent enough that silently dropping it isn't acceptable.
  if (coverImageUrl) heroImageId = (await importExternalImage(coverImageUrl)).id;

  const draftPost: DraftPostBody & { id: string } = {
    id,
    ...buildDraftPostBody(input, richContent, memberId, heroImageId),
  };
  const action =
    currentStatus === "published" ? "UPDATE_PUBLICATION" : publish ? "UPDATE_PUBLISH" : "UPDATE";

  await wixFetch(`/blog/v3/draft-posts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ draftPost, action }),
  });
}

export async function publishDraftPost(id: string): Promise<void> {
  await wixFetch(`/blog/v3/draft-posts/${encodeURIComponent(id)}/publish`, { method: "POST" });
}

export async function deletePost(id: string): Promise<void> {
  await wixFetch(`/blog/v3/draft-posts/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function getPublishedPostUrl(id: string): Promise<string | undefined> {
  const res = await wixFetch<{ post: { url?: { base: string; path: string } } }>(
    `/v3/posts/${encodeURIComponent(id)}?fieldsets=URL`
  );
  return res.post.url ? `${res.post.url.base}${res.post.url.path}` : undefined;
}

async function fetchExistingSeoTags(id: string): Promise<SeoTag[]> {
  try {
    const current = await wixFetch<{ itemSeoTags: { tags: SeoTag[] } }>(
      `/promote/seo/v1/item-seo-tags/BLOG_POST/${encodeURIComponent(id)}`
    );
    return current.itemSeoTags.tags;
  } catch (error) {
    if (error instanceof WixApiError && error.status === 404) {
      // ponytail: a brand-new post may not be SEO-indexed yet — start from an
      // empty tag list instead of failing the save.
      return [];
    }
    throw error;
  }
}

export async function readSeoTags(id: string): Promise<{ title?: string; description?: string }> {
  try {
    const tags = await fetchExistingSeoTags(id);
    return extractSeoValues(tags);
  } catch {
    return {};
  }
}

export async function writeSeoTags(
  id: string,
  input: { title?: string; description?: string }
): Promise<void> {
  if (input.title === undefined && input.description === undefined) return;

  const existing = await fetchExistingSeoTags(id);
  const tags = mergeSeoTags(existing, input);
  await wixFetch(`/promote/seo/v1/item-seo-tags/BLOG_POST/${encodeURIComponent(id)}`, {
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
