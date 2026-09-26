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

/** Mutates `nodes` in place (rewrites matched IMAGE src/width/height); does not return a copy. */
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
          if (image.width === undefined) image.width = match.width;
          if (image.height === undefined) image.height = match.height;
        }
      }
      walk(node.nodes);
    }
  };

  walk(nodes);
}
