// Wix's HTML->Ricos converter has two undocumented gaps confirmed by live
// testing against the Wix API:
//  1. It only reads inline `style="..."` attributes — CSS in <style> blocks,
//     and the class/id association to it, is silently dropped.
//  2. Even inline, it only recognizes hex colors (`#rrggbb`) — `rgb(...)`/
//     `rgba(...)` values are silently dropped too.
// Editors that export HTML with embedded stylesheets and computed-style rgb()
// colors (e.g. GrapesJS) lose all text styling unless both are normalized
// away before conversion.
const TEXT_STYLE_PROPS = [
  "color",
  "background-color",
  "font-weight",
  "font-style",
  "text-decoration",
];

const COLOR_PROPS = new Set(["color", "background-color"]);

// Wix's converter applies a block container's own `color`/`background-color`
// as the color for its entire text subtree, overriding any span-level color
// inside it (confirmed live: a `color` on a wrapping <div> blanked out every
// nested span's own color). Restricting CSS-derived color to actual inline
// text elements avoids that trap; block-level color rules are dropped as a
// harmless no-op (Wix's default text color already matches almost always).
const INLINE_TEXT_TAGS = new Set([
  "span",
  "a",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "mark",
  "small",
  "sub",
  "sup",
  "font",
]);

interface CssRule {
  selectors: string[];
  declarations: string;
}

function rgbToHex(value: string): string {
  const m = value.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)/i,
  );
  if (!m) return value;
  const [, r, g, b] = m;
  return `#${[r, g, b].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
}

// Normalizes rgb()/rgba() values in `color`/`background-color` declarations
// within an existing inline style string to hex; leaves everything else as-is.
function normalizeInlineRgbColors(styleValue: string): string {
  return styleValue.replace(
    /((?:^|;)\s*(color|background-color)\s*:\s*)(rgba?\([^)]*\))/gi,
    (_m, prefix, _prop, rgb) => `${prefix}${rgbToHex(rgb)}`,
  );
}

function extractStyleBlocks(html: string): { css: string; html: string } {
  let css = "";
  const stripped = html.replace(
    /<style[^>]*>([\s\S]*?)<\/style>/gi,
    (_match, body) => {
      css += `${body}\n`;
      return "";
    },
  );
  return { css, html: stripped };
}

// Brace-aware so @media/@supports blocks don't break parsing of the rules
// that follow them; their nested rules are applied unconditionally (a
// simplification — ignoring the media condition is harmless for detecting
// author intent like "this text is red").
function parseCssRules(css: string): CssRule[] {
  const rules: CssRule[] = [];
  let i = 0;
  while (i < css.length) {
    const braceOpen = css.indexOf("{", i);
    if (braceOpen === -1) break;
    const selectorText = css.slice(i, braceOpen).trim();

    let depth = 1;
    let j = braceOpen + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
      j++;
    }
    const body = css.slice(braceOpen + 1, j - 1);

    if (selectorText.startsWith("@")) {
      rules.push(...parseCssRules(body));
    } else if (selectorText) {
      const selectors = selectorText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      rules.push({ selectors, declarations: body });
    }
    i = j;
  }
  return rules;
}

function extractTextStyleDeclarations(declarations: string): string {
  const kept: string[] = [];
  for (const decl of declarations.split(";")) {
    const colonIdx = decl.indexOf(":");
    if (colonIdx === -1) continue;
    const prop = decl.slice(0, colonIdx).trim().toLowerCase();
    let value = decl.slice(colonIdx + 1).trim();
    if (!value || !TEXT_STYLE_PROPS.includes(prop)) continue;
    if (COLOR_PROPS.has(prop)) value = rgbToHex(value);
    kept.push(`${prop}:${value}`);
  }
  return kept.length > 0 ? `${kept.join(";")};` : "";
}

/**
 * Resolves `#id` and `.class` selector rules from any `<style>` blocks into
 * inline `style` attributes on matching elements, keeping only text-styling
 * properties the Ricos converter recognizes, and converts any rgb()/rgba()
 * color values (inline or CSS-derived) to hex. Strips the `<style>` blocks
 * afterward since the converter never reads them.
 */
export function inlineEmbeddedTextStyles(html: string): string {
  const { css, html: stripped } = extractStyleBlocks(html);

  const idDecls = new Map<string, string>();
  const classDecls = new Map<string, string>();
  for (const rule of parseCssRules(css)) {
    const decl = extractTextStyleDeclarations(rule.declarations);
    if (!decl) continue;
    for (const selector of rule.selectors) {
      const idMatch = selector.match(/^#([\w-]+)$/);
      const classMatch = selector.match(/^\.([\w-]+)$/);
      if (idMatch) {
        idDecls.set(idMatch[1], (idDecls.get(idMatch[1]) ?? "") + decl);
      } else if (classMatch) {
        classDecls.set(
          classMatch[1],
          (classDecls.get(classMatch[1]) ?? "") + decl,
        );
      }
    }
  }

  const hasExtras = idDecls.size > 0 || classDecls.size > 0;
  const hasInlineRgb = /style=["'][^"']*rgba?\(/i.test(stripped);
  if (!hasExtras && !hasInlineRgb) return stripped;

  return stripped.replace(
    /<([a-zA-Z][\w-]*)((?:\s+[^<>]*?)?)\s*(\/?)>/g,
    (match, tag, attrs, selfClose) => {
      const classMatch = attrs.match(/\sclass=["']([^"']*)["']/);
      const idMatch = attrs.match(/\sid=["']([^"']*)["']/);

      let extra = "";
      if (INLINE_TEXT_TAGS.has(tag.toLowerCase())) {
        if (classMatch) {
          for (const cls of classMatch[1].split(/\s+/)) {
            if (classDecls.has(cls)) extra += classDecls.get(cls);
          }
        }
        if (idMatch && idDecls.has(idMatch[1]))
          extra += idDecls.get(idMatch[1]);
      }

      const styleMatch = attrs.match(/\sstyle=(["'])([^"']*)\1/);
      const normalizedExisting = styleMatch
        ? normalizeInlineRgbColors(styleMatch[2])
        : undefined;
      const existingChanged =
        styleMatch !== null && normalizedExisting !== styleMatch[2];
      if (!extra && !existingChanged) return match;

      const combined =
        normalizedExisting !== undefined
          ? `${normalizedExisting};${extra}`
          : extra;
      const newAttrs = styleMatch
        ? attrs.replace(
            styleMatch[0],
            ` style=${styleMatch[1]}${combined}${styleMatch[1]}`,
          )
        : `${attrs} style="${extra}"`;
      return `<${tag}${newAttrs}${selfClose ? "/" : ""}>`;
    },
  );
}
