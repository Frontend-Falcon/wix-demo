import { describe, it, expect } from "vitest";
import { inlineEmbeddedTextStyles } from "./html-inline-styles";

describe("inlineEmbeddedTextStyles", () => {
  it("inlines a color rule targeted by id and strips the style block", () => {
    const html =
      '<style>#extid{color:#122ade}</style><p>External <span id="extid">blue text</span> here.</p>';

    expect(inlineEmbeddedTextStyles(html)).toBe(
      '<p>External <span id="extid" style="color:#122ade;">blue text</span> here.</p>',
    );
  });

  it("inlines a color rule targeted by class", () => {
    const html =
      '<style>.hl{color:red}</style><p><span class="hl">hi</span></p>';

    expect(inlineEmbeddedTextStyles(html)).toBe(
      '<p><span class="hl" style="color:red;">hi</span></p>',
    );
  });

  it("merges into an existing inline style instead of overwriting it", () => {
    const html =
      '<style>#a{color:red}</style><span id="a" style="font-size:20px">x</span>';

    expect(inlineEmbeddedTextStyles(html)).toBe(
      '<span id="a" style="font-size:20px;color:red;">x</span>',
    );
  });

  it("drops non-text-styling declarations like layout/box properties", () => {
    const html =
      '<style>#a{color:red;padding:10px;display:flex}</style><span id="a">x</span>';

    expect(inlineEmbeddedTextStyles(html)).toBe(
      '<span id="a" style="color:red;">x</span>',
    );
  });

  it("resolves rules nested inside @media blocks, ignoring the condition", () => {
    const html =
      '<style>@media (max-width: 768px){#a{color:red}}</style><span id="a">x</span>';

    expect(inlineEmbeddedTextStyles(html)).toBe(
      '<span id="a" style="color:red;">x</span>',
    );
  });

  it("leaves html without a style block untouched", () => {
    const html = "<p>Hello</p>";
    expect(inlineEmbeddedTextStyles(html)).toBe(html);
  });

  it("leaves html untouched when the style block has no id/class rules matching text properties", () => {
    const html = "<style>body{margin:0}</style><p>Hello</p>";
    expect(inlineEmbeddedTextStyles(html)).toBe("<p>Hello</p>");
  });

  it("converts an rgb() color from a CSS rule to hex, since Wix's converter drops rgb()", () => {
    const html =
      '<style>#a{color:rgb(18, 42, 222)}</style><span id="a">x</span>';
    expect(inlineEmbeddedTextStyles(html)).toBe(
      '<span id="a" style="color:#122ade;">x</span>',
    );
  });

  it("converts a pre-existing inline rgb() color to hex even with no <style> block", () => {
    const html = '<span style="color: rgb(221, 44, 44)">x</span>';
    expect(inlineEmbeddedTextStyles(html)).toBe(
      '<span style="color: #dd2c2c;">x</span>',
    );
  });

  it("leaves an already-hex inline color untouched", () => {
    const html = '<span style="color:#dd2c2c">x</span>';
    expect(inlineEmbeddedTextStyles(html)).toBe(html);
  });
});
