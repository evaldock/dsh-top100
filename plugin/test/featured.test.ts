import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isFeaturedRepository, showFeaturedPlugin } from "../src/shared/featured.js";
import { css } from "../src/client/styles.js";
import { zh } from "../src/client/locales.js";

const page = readFileSync(new URL("../src/client/RankingsPage.tsx", import.meta.url), "utf8");

describe("website unranked editorial placement", () => {
  it("identifies only our exact repository, case-insensitively", () => {
    expect(isFeaturedRepository({ fullName: "DSHEval/DSH-Top100" })).toBe(true);
    expect(isFeaturedRepository({ fullName: "EvalDock/DSH-Top100" })).toBe(true);
    expect(isFeaturedRepository({ fullName: "another/dsh-top100" })).toBe(false);
    expect(isFeaturedRepository({ fullName: "dsheval/dsh-top100-extra" })).toBe(false);
    expect(isFeaturedRepository({})).toBe(false);
  });
  it.each(["hot", "rising", "total"])("shows in the unfiltered %s plugin ranking", (view) => {
    expect(showFeaturedPlugin({ view })).toBe(true);
    expect(showFeaturedPlugin({ view, query: "  " })).toBe(true);
  });

  it.each(["hot", "rising", "total"])("hides during search, filtering or other catalog scopes in %s", (view) => {
    for (const options of [
      { view, query: "dsh" }, { view, query: "!!!" },
      { view, category: "tools" },
      { view, catalogScope: "skills" },
      { view, catalogScope: "ecosystem" },
      { view, installAvailability: "installable" },
      { view, installAvailability: "unavailable" },
    ]) expect(showFeaturedPlugin(options)).toBe(false);
  });

  it("does not appear in unknown views", () => {
    expect(showFeaturedPlugin({ view: "unknown" })).toBe(false);
  });
});

describe("plugin ranking presentation", () => {
  it("places the accessible GitHub link beside the market title", () => {
    const start = page.indexOf('<div className="market-title-row">');
    expect(start).toBeGreaterThan(page.indexOf('<header className="market-head">'));
    const heading = page.slice(start, page.indexOf("</div>", start));
    expect(heading).toContain('<h2>{t("title")}</h2>');
    expect(heading).toContain('aria-label="dsh-top100 GitHub"');
    expect(heading).toContain('href="https://github.com/evaldock/dsh-top100"');
    expect(heading).toContain('rel="noopener noreferrer"');
    expect(page.match(/aria-label="dsh-top100 GitHub"/g)).toHaveLength(1);
    expect(css).toContain('.dsh-top100 .market-title-row {');
    expect(css).toContain('.dsh-top100 .github-link:focus-visible');
  });

  it("renders catalog results without inserting a self-promotional card", () => {
    expect(page).not.toContain("showFeaturedPlugin");
    expect(page).not.toContain("featured-plugin");
    expect(page).not.toContain('<span className="rank">#0</span>');
    expect(page).not.toContain('<span className="rank">#000</span>');
    expect(page).toContain('items.map((item) =>');
    expect(css).not.toContain('.featured-plugin');
  });

  it("names the total ranking consistently without changing its sorting handler", () => {
    const modes = page.slice(page.indexOf('<div className="ranking-modes"'), page.indexOf('className="ranking-current-label stars-browse"'));
    expect(modes).toContain('{t(id)}');
    expect(modes).toContain('selectRankingView(id)');
    expect(modes).toContain('rankingBasisKey(id, "")');
    expect(zh.total).toBe("总榜");
  });

  it("keeps result counts at a uniform normal weight", () => {
    const counts = page.slice(page.indexOf('<span className="result-count search-result-count">'), page.indexOf('<div className="ranking-modes"'));
    expect(counts).not.toContain("<strong>");
    const countCss = css.slice(css.indexOf(".dsh-top100 .result-count {"), css.indexOf(".dsh-top100 .filter-summary {"));
    expect(countCss).toContain("font-weight: 400");
    expect(countCss).not.toContain(".result-count strong");
  });
});
