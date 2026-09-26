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
