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
  try {
    const body = (await request.json()) as UpdatePostRequest;
    if (!body.title?.trim() || !body.html?.trim()) {
      return Response.json({ error: "title and html are required" }, { status: 400 });
    }

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
