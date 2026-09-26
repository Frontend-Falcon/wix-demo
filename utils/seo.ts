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
