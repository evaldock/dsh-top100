import { describe, expect, it } from "vitest";
import { css } from "../src/client/styles.js";

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
}

function colorToken(name: string): string {
  const value = css.match(new RegExp(`--t100-${name}:\\s*(#[\\da-f]{6});`, "i"))?.[1];
  expect(value, name).toBeDefined();
  return value!;
}

describe("market action and status styling", () => {
  it("uses the Top100 purple in a fixed light palette", () => {
    expect(colorToken("accent")).toBe("#5b5bd6");
    expect(colorToken("action")).toBe("#5b5bd6");
    expect(colorToken("action-border")).toBe("#5b5bd6");
    expect(colorToken("action-hover")).toBe("#4b4bc0");
    expect(colorToken("on-action")).toBe("#ffffff");
    expect(rule(".dsh-top100")).toContain("color-scheme: light");
    expect(colorToken("surface")).toBe("#ffffff");
    expect(css).not.toContain("[data-ds-dark-theme]");
  });

  it("gives search and installation buttons the same typography and action colors", () => {
    const primary = rule(".dsh-top100 button.primary");
    expect(primary).toContain("background: var(--t100-action)");
    expect(primary).toContain("border-color: var(--t100-action-border)");
    expect(primary).toContain("color: var(--t100-on-action)");
    expect(primary).toContain("font-size: 14px");
    expect(primary).toContain("font-weight: 600");
    expect(rule(".dsh-top100 .confirm-actions button.primary")).not.toContain("background:");
  });

  it("renders source states as plain metadata rather than capsules", () => {
    const status = rule(".dsh-top100 .capability-label");
    expect(status).toContain("padding: 0");
    expect(status).toContain("border-radius: 0");
    expect(status).toContain("background: transparent");
    expect(status).toContain("font: inherit");
    expect(rule(".dsh-top100 .capability-label.capability-installed")).not.toContain("background:");
    expect(rule(".dsh-top100 .capability-label.capability-manual")).not.toContain("background:");
  });

  it("keeps row actions compact, content-sized and right-aligned at narrow widths too", () => {
    const action = rule(".dsh-top100 .actions > .project-link");
    expect(action).toContain("flex: 0 0 auto");
    expect(action).toContain("height: 36px");
    expect(action).toContain("min-height: 36px");
    expect(action).toContain("min-width: 64px");
    expect(action).toContain("padding: 0 16px");
    expect(rule(".dsh-top100 .actions")).toContain("justify-content: flex-end");
    expect(css).not.toContain(".actions > .project-link { flex-basis: calc(50% - 4px)");
  });

  it("retains keyboard focus and a visually distinct disabled confirmation", () => {
    expect(css).toContain("outline: 2px solid var(--t100-accent)");
    const disabled = rule(".dsh-top100 .confirm-actions button.primary:disabled");
    expect(disabled).toContain("background: var(--t100-fill)");
    expect(disabled).toContain("cursor: not-allowed");
  });
});
