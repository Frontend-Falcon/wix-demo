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
