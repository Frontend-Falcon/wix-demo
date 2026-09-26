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
    if (status.file.operationStatus === "FAILED") {
      throw new Error(`Wix Media import failed for ${url}`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollDelayMs));
  }

  return { id: file.id, width: FALLBACK_WIDTH, height: FALLBACK_HEIGHT };
}
