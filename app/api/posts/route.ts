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
  try {
    const body = (await request.json()) as CreatePostRequest;
    if (!body.title?.trim() || !body.html?.trim()) {
      return Response.json({ error: "title and html are required" }, { status: 400 });
    }

    const id = await createDraftPost(body, body.html, body.coverImageUrl);
    if (body.publish) await publishDraftPost(id);
    await writeSeoTags(id, { title: body.seoTitle, description: body.seoDescription });
    const url = body.publish ? await getPublishedPostUrl(id) : undefined;
    return Response.json({ id, status: body.publish ? "published" : "draft", url }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
