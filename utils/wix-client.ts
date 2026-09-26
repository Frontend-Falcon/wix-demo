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
