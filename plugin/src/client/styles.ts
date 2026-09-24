import { rankMarkMask } from "./RankMark.js";

export const css = `
[data-dsh-top100-nav-icon] > svg { display: none; }
[data-dsh-top100-nav-icon]::before { content: ""; flex: 0 0 16px; width: 16px; height: 16px; background: currentColor; mask: url("${rankMarkMask}") center / contain no-repeat; -webkit-mask: url("${rankMarkMask}") center / contain no-repeat; }
.dsh-top100 {
  color-scheme: light;
  --t100-ink: #1c2024;
  --t100-body: #60646c;
  --t100-muted: #60646c;
  --t100-line: #dddde5;
  --t100-surface: #ffffff;
  --t100-fill: #f4f4fa;
  --t100-accent: #5b5bd6;
  --t100-accent-soft: color-mix(in srgb, var(--t100-accent) 16%, transparent);
  /* Match the website's light purple palette throughout the plugin. */
  --t100-action: #5b5bd6;
  --t100-action-hover: #4b4bc0;
  --t100-action-border: #5b5bd6;
  --t100-on-action: #ffffff;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  min-width: 0;
  max-width: 100%;
  color: var(--t100-ink);
  background: var(--t100-surface);
  container-type: inline-size;
}
.dsh-top100.source-settings { padding: 12px; }
.dsh-top100.source-settings label { display: grid; gap: 8px; }
.dsh-top100.source-settings input { width: 100%; box-sizing: border-box; padding: 9px 12px; border: 1px solid var(--t100-line); border-radius: 7px; background: var(--t100-surface); color: var(--t100-ink); font: inherit; }
.dsh-top100.source-settings input:focus-visible { outline: 2px solid var(--t100-accent); outline-offset: 2px; }
.dsh-top100 .market-head {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  padding: 2px 0 4px;
}
.dsh-top100 .rank-mark {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border: 1px solid color-mix(in srgb, var(--t100-accent) 34%, var(--t100-line));
  border-radius: 14px;
  background: color-mix(in srgb, var(--t100-accent) 8%, var(--t100-surface));
  color: var(--t100-accent);
  box-shadow: inset 0 0 0 4px color-mix(in srgb, var(--t100-surface) 72%, transparent);
}
.dsh-top100 .rank-mark svg {
  width: 40px;
  height: 40px;
}
.dsh-top100 .rank-mark-list {
  fill: var(--t100-surface);
  stroke: currentColor;
  stroke-linecap: round;
  stroke-width: 2.25;
}
.dsh-top100 .rank-mark-list circle:first-child {
  fill: currentColor;
}
.dsh-top100 .rank-mark-check {
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.75;
}
.dsh-top100 .head-copy {
  display: grid;
  min-width: 0;
  gap: 5px;
}
.dsh-top100 .market-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.dsh-top100 h2 {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.2;
}
.dsh-top100 .lede {
  margin: 0;
  color: var(--t100-muted);
  font-size: 13px;
  line-height: 1.45;
}
.dsh-top100 .meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 14px;
  color: var(--t100-body);
  font-size: 12px;
  line-height: 18px;
}
.dsh-top100 .data-source {
  color: var(--t100-accent);
  font-weight: 650;
  text-decoration: none;
}
.dsh-top100 .data-source:hover { text-decoration: underline; }
.dsh-top100 .cache-warning { color: #9a6700; }
.dsh-top100 .github-link {
  display: inline-flex;
  flex: 0 0 36px;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  color: var(--t100-ink);
  text-decoration: none;
}
.dsh-top100 .github-link svg { width: 20px; height: 20px; fill: currentColor; }
.dsh-top100 .github-link:hover { background: var(--t100-fill); }
.dsh-top100 .github-link:focus-visible { outline: 2px solid var(--t100-accent); outline-offset: 2px; }
.dsh-top100 .toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
}
.dsh-top100 .search-cluster {
  display: flex;
  flex: 1 1 auto;
  gap: 8px;
  min-width: 0;
}
.dsh-top100 .ranking-toolbar {
  flex-direction: column;
  align-items: stretch;
}
.dsh-top100 .ranking-toolbar .search-cluster {
  width: 100%;
}
.dsh-top100 .page-tabs {
  display: flex;
  overflow-x: auto;
  gap: 2px;
  padding: 0 0 8px;
  border-bottom: 1px solid var(--t100-line);
}
.dsh-top100 .page-tabs button {
  min-width: 0;
  flex: 0 0 auto;
  white-space: nowrap;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  color: var(--t100-muted);
  font-weight: 600;
}
.dsh-top100 .page-tabs button[aria-selected="true"] {
  color: var(--t100-accent);
  border-bottom-color: var(--t100-accent);
  background: transparent;
}
.dsh-top100 input[type="search"] {
  flex: 1 1 auto;
  min-width: 180px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--t100-line);
  border-radius: 9px;
  background: var(--t100-surface);
  color: inherit;
}
.dsh-top100 .filter-control {
  position: relative;
  flex: 0 0 auto;
}
.dsh-top100 button.filter-trigger {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 76px;
  white-space: nowrap;
}
.dsh-top100 button.filter-trigger[aria-expanded="true"],
.dsh-top100 button.filter-trigger:has(.filter-count) {
  border-color: color-mix(in srgb, var(--t100-accent) 54%, var(--t100-line));
  color: var(--t100-accent);
  background: var(--t100-accent-soft);
}
.dsh-top100 .filter-trigger svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-width: 1.5;
}
.dsh-top100 .filter-count {
  display: grid;
  place-items: center;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 99px;
  background: var(--t100-action);
  color: var(--t100-on-action);
  font-size: 10px;
  font-weight: 700;
}
.dsh-top100 .filter-popover {
  position: absolute;
  z-index: 30;
  top: calc(100% + 7px);
  right: 0;
  display: grid;
  gap: 4px;
  width: min(310px, calc(100vw - 48px));
  padding: 10px;
  border: 1px solid var(--t100-line);
  border-radius: 10px;
  background: var(--t100-surface);
  box-shadow: 0 12px 30px color-mix(in srgb, #17211f 18%, transparent);
}
.dsh-top100 .filter-popover > p {
  margin: 0 4px 4px;
  color: var(--t100-muted);
  font-size: 11px;
}
.dsh-top100 .filter-popover label {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 46px;
  padding: 7px 8px;
  border-radius: 7px;
  cursor: pointer;
}
.dsh-top100 .filter-popover label:hover { background: var(--t100-fill); }
.dsh-top100 .filter-popover label > span {
  display: grid;
  flex: 1 1 auto;
  gap: 2px;
}
.dsh-top100 .filter-popover strong { font-size: 12px; }
.dsh-top100 .filter-popover small {
  color: var(--t100-muted);
  font-size: 10px;
  line-height: 1.35;
}
.dsh-top100 .filter-popover input { flex: 0 0 auto; }
.dsh-top100 button.filter-reset {
  justify-self: start;
  height: 28px;
  margin: 3px 4px 0;
  padding: 0;
  border: 0;
  color: var(--t100-accent);
  font-size: 11px;
}
.dsh-top100 .tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.dsh-top100 .tab,
.dsh-top100 button {
  border: 1px solid var(--t100-line);
  background: transparent;
  color: inherit;
  border-radius: 7px;
  height: 34px;
  padding: 0 10px;
  font: inherit;
  cursor: pointer;
}
.dsh-top100 span.tab {
  display: inline-flex;
  align-items: center;
  cursor: default;
}
.dsh-top100 .tab[aria-selected="true"] {
  background: var(--t100-action);
  border-color: var(--t100-action-border);
  color: var(--t100-on-action);
}
.dsh-top100 button.primary {
  background: var(--t100-action);
  border-color: var(--t100-action-border);
  color: var(--t100-on-action);
  font-size: 14px;
  font-weight: 600;
}
.dsh-top100 button.primary:hover:not(:disabled) {
  background: var(--t100-action-hover);
}
.dsh-top100 button:disabled {
  opacity: 0.5;
  cursor: default;
}
.dsh-top100 .category-panel {
  display: grid;
  gap: 8px;
}
.dsh-top100 .category-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.dsh-top100 .category-options button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.dsh-top100 .category-options button[aria-pressed="true"] {
  border-color: var(--t100-accent);
  background: var(--t100-accent-soft);
  color: var(--t100-accent);
}
.dsh-top100 .category-options small {
  color: var(--t100-muted);
  font-variant-numeric: tabular-nums;
}
.dsh-top100 .market-filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
}
.dsh-top100 .market-category-menu {
  position: relative;
  flex: 0 1 176px;
}
.dsh-top100 button.market-category-trigger {
  display: grid;
  grid-template-columns: 17px minmax(0, 1fr) 15px;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border-radius: 9px;
  background: var(--t100-surface);
  font-size: 12px;
  font-weight: 650;
  text-align: left;
  white-space: nowrap;
}
.dsh-top100 button.market-category-trigger:hover,
.dsh-top100 button.market-category-trigger[aria-expanded="true"] {
  border-color: color-mix(in srgb, var(--t100-accent) 52%, var(--t100-line));
  color: var(--t100-accent);
  background: color-mix(in srgb, var(--t100-accent) 7%, var(--t100-surface));
}
.dsh-top100 .market-category-trigger > svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.6;
  transition: transform 140ms ease;
}
.dsh-top100 .market-category-trigger[aria-expanded="true"] > svg { transform: rotate(180deg); }
.dsh-top100 .market-category-icon {
  display: grid;
  place-items: center;
  width: 17px;
  height: 17px;
  color: var(--t100-accent);
}
.dsh-top100 .market-category-icon svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.65;
}
.dsh-top100 .market-category-popover {
  position: absolute;
  z-index: 40;
  top: calc(100% + 7px);
  left: 0;
  width: min(330px, calc(100vw - 56px));
  padding: 7px;
  border: 1px solid var(--t100-line);
  border-radius: 12px;
  background: var(--t100-surface);
  box-shadow: 0 14px 34px color-mix(in srgb, #17211f 17%, transparent);
}
.dsh-top100 .market-category-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  padding-top: 4px;
  border-top: 1px solid var(--t100-line);
}
.dsh-top100 button.market-category-choice {
  display: grid;
  grid-template-columns: 17px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  min-width: 0;
  height: 38px;
  padding: 0 8px;
  border-color: transparent;
  border-radius: 7px;
  color: var(--t100-body);
  font-size: 11px;
  text-align: left;
}
.dsh-top100 button.market-category-choice:hover { background: var(--t100-fill); }
.dsh-top100 button.market-category-choice[aria-selected="true"] {
  color: var(--t100-accent);
  background: var(--t100-accent-soft);
  font-weight: 700;
}
.dsh-top100 .market-category-choice > span:nth-child(2) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-top100 button.market-category-choice-all {
  width: 100%;
  margin-bottom: 4px;
}
.dsh-top100 button.install-only-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 10px;
  border-radius: 9px;
  background: var(--t100-surface);
  color: var(--t100-body);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.dsh-top100 button.install-only-toggle:hover { color: var(--t100-ink); }
.dsh-top100 button.install-only-toggle[aria-checked="true"] {
  border-color: color-mix(in srgb, var(--t100-accent) 42%, var(--t100-line));
  color: var(--t100-accent);
  background: color-mix(in srgb, var(--t100-accent) 7%, var(--t100-surface));
}
.dsh-top100 .switch-track {
  position: relative;
  width: 28px;
  height: 16px;
  border-radius: 99px;
  background: color-mix(in srgb, var(--t100-muted) 28%, transparent);
  transition: background 140ms ease;
}
.dsh-top100 .switch-track > span {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--t100-surface);
  box-shadow: 0 1px 2px color-mix(in srgb, #17211f 24%, transparent);
  transition: transform 140ms ease;
}
.dsh-top100 .install-only-toggle[aria-checked="true"] .switch-track { background: var(--t100-accent); }
.dsh-top100 .install-only-toggle[aria-checked="true"] .switch-track > span { transform: translateX(12px); }
.dsh-top100 .ranking-context {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 32px;
  padding: 0 1px;
  color: var(--t100-body);
  font-size: 12px;
  line-height: 18px;
}
.dsh-top100 .search-result-count small {
  color: var(--t100-body);
  font-size: 12px;
}
.dsh-top100 .search-result-tab[aria-selected="true"]::before {
  content: "↳";
  margin-right: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.dsh-top100 .result-count {
  flex: 0 0 auto;
  font-size: 13px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dsh-top100 .filter-summary {
  flex: 0 0 auto;
  color: var(--t100-accent);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dsh-top100 .ranking-current-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  color: var(--t100-muted);
  font-weight: 600;
  white-space: nowrap;
}
.dsh-top100 .ranking-modes {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 1px;
  padding: 2px;
  border: 1px solid var(--t100-line);
  border-radius: 9px;
  background: var(--t100-fill);
}
.dsh-top100 .ranking-modes button {
  height: 30px;
  padding: 0 9px;
  border: 0;
  border-radius: 6px;
  color: var(--t100-body);
  font-size: 12px;
  font-weight: 600;
}
.dsh-top100 .ranking-modes button:hover { color: var(--t100-ink); }
.dsh-top100 .ranking-modes button[aria-pressed="true"] {
  color: var(--t100-accent);
  background: var(--t100-surface);
  box-shadow: 0 1px 3px color-mix(in srgb, #17211f 12%, transparent);
}
.dsh-top100 .list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  gap: 10px;
  min-height: 0;
  overflow: auto;
  padding: 1px 2px 10px 1px;
}
.dsh-top100 .card-skeleton {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 9px;
  min-height: 126px;
  padding: 13px;
  border: 1px solid var(--t100-line);
  border-radius: 12px;
  background: var(--t100-surface);
}
.dsh-top100 .card-skeleton > div {
  display: grid;
  align-content: start;
  gap: 9px;
}
.dsh-top100 .skeleton-rank,
.dsh-top100 .skeleton-line,
.dsh-top100 .skeleton-pills {
  display: block;
  overflow: hidden;
  background: color-mix(in srgb, currentColor 8%, transparent);
}
.dsh-top100 .skeleton-rank {
  width: 40px;
  height: 20px;
  border-radius: 999px;
}
.dsh-top100 .skeleton-line {
  position: relative;
  width: 100%;
  height: 12px;
  border-radius: 4px;
}
.dsh-top100 .skeleton-title { width: 62%; height: 15px; }
.dsh-top100 .skeleton-short { width: 74%; }
.dsh-top100 .skeleton-pills {
  width: 48%;
  height: 20px;
  margin-top: 4px;
  border-radius: 99px;
}
.dsh-top100 .skeleton-line::after,
.dsh-top100 .skeleton-rank::after,
.dsh-top100 .skeleton-pills::after {
  content: "";
  display: block;
  width: 42%;
  height: 100%;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, currentColor 8%, transparent), transparent);
  transform: translateX(-120%);
  animation: t100-skeleton 1.6s ease-in-out infinite;
}
@keyframes t100-skeleton { to { transform: translateX(340%); } }
.dsh-top100 .ranking-card {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto auto;
  gap: 10px;
  align-items: start;
  min-width: 0;
  padding: 13px;
  border: 1px solid var(--t100-line);
  border-radius: 12px;
  background: var(--t100-surface);
  box-shadow: 0 1px 2px color-mix(in srgb, #17211f 6%, transparent);
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.dsh-top100 .ranking-card::before {
  content: "";
  position: absolute;
  inset: 12px auto 12px 0;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--t100-line);
}
.dsh-top100 .ranking-card[data-trust="install-source"]::before { background: var(--t100-accent); }
.dsh-top100 .ranking-card:hover {
  border-color: color-mix(in srgb, var(--t100-accent) 34%, var(--t100-line));
  box-shadow: 0 7px 18px color-mix(in srgb, #17211f 9%, transparent);
}
.dsh-top100 .rank {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 21px;
  padding: 0 7px;
  border: 1px solid color-mix(in srgb, var(--t100-accent) 25%, var(--t100-line));
  border-radius: 999px;
  background: var(--t100-accent-soft);
  box-sizing: border-box;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: var(--t100-accent);
}
.dsh-top100 .ranking-card[data-rank="1"] .rank,
.dsh-top100 .ranking-card[data-rank="2"] .rank,
.dsh-top100 .ranking-card[data-rank="3"] .rank {
  border-color: var(--t100-action-border);
  background: var(--t100-action);
  color: var(--t100-on-action);
}
.dsh-top100 .card-copy { min-width: 0; }
.dsh-top100 .card-heading {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  margin-bottom: 7px;
}
.dsh-top100 h3 {
  margin: 0 0 5px;
  overflow: hidden;
  font-size: 14px;
  font-weight: 700;
  line-height: 20px;
  text-overflow: ellipsis;
}
.dsh-top100 .card-copy h3 {
  min-width: 0;
  margin: 0;
  font-size: 14px;
}
.dsh-top100 h3 a {
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  color: inherit;
  text-decoration: none;
}
.dsh-top100 h3 a > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-top100 .repo-name { font-weight: 720; }
.dsh-top100 .title-arrow {
  flex: 0 0 auto;
  color: var(--t100-muted);
  font-size: 11px;
  font-weight: 500;
}
.dsh-top100 h3 a:hover {
  color: var(--t100-accent);
  text-decoration: underline;
}
.dsh-top100 .repo-owner-name {
  min-width: 0;
  overflow: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
}
.dsh-top100 .desc {
  display: block;
  min-height: 0;
  margin: 0;
  overflow: visible;
  color: var(--t100-body);
  font-size: 13px;
  line-height: 20px;
}
.dsh-top100 .description-preview {
  min-width: 0;
  overflow-wrap: anywhere;
}
.dsh-top100 .description-preview .description-text {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  max-height: 40px;
  overflow: hidden;
}
.dsh-top100 .description-preview.is-expanded .description-text {
  display: block;
  -webkit-line-clamp: unset;
  max-height: none;
  overflow: visible;
}
.dsh-top100 button.description-toggle {
  display: inline-block;
  min-height: 0;
  height: auto;
  margin: 4px 0 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  color: var(--t100-accent);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.dsh-top100 button.description-toggle:hover {
  background: transparent;
  text-decoration: underline;
}
.dsh-top100 .facts {
  display: flex;
  flex-wrap: wrap;
  gap: 7px 10px;
  margin-top: 8px;
  color: var(--t100-body);
  font-size: 12px;
  line-height: 18px;
}
.dsh-top100 .facts > span {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
}
.dsh-top100 .capability-label {
  padding: 0;
  border-radius: 0;
  background: transparent;
  color: var(--t100-body);
  font: inherit;
  white-space: nowrap;
}
.dsh-top100 .capability-label.capability-ready,
.dsh-top100 .capability-label.capability-installed {
  color: var(--t100-accent);
}
.dsh-top100 .capability-label.capability-manual {
  color: #8a5c00;
}
.dsh-top100 .ranking-metric strong {
  color: var(--t100-accent);
  font-variant-numeric: tabular-nums;
}
.dsh-top100 .ranking-metric { gap: 3px; }
.dsh-top100 .star-fact {
  color: var(--t100-ink);
  font-variant-numeric: tabular-nums;
}
.dsh-top100 .evidence-badge,
.dsh-top100 .form-factor {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  min-height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  background: var(--t100-accent-soft);
  color: var(--t100-accent);
  font-weight: 650;
}
.dsh-top100 .evidence-indexed {
  background: var(--t100-fill);
  color: var(--t100-muted);
}
.dsh-top100 .form-factor {
  background: color-mix(in srgb, currentColor 8%, transparent);
  color: var(--t100-muted);
}
.dsh-top100 details.evidence-rail {
  margin-top: 7px;
  padding: 6px 9px 6px 12px;
  border: 0;
  border-left: 3px solid var(--t100-accent);
  border-radius: 0 7px 7px 0;
  background: color-mix(in srgb, var(--t100-accent) 5%, transparent);
  color: var(--t100-muted);
  font-size: 11px;
}
.dsh-top100 .evidence-rail summary {
  color: var(--t100-accent);
  font-size: 11px;
}
.dsh-top100 .evidence-rail ul {
  margin: 7px 0 0;
  padding-left: 17px;
}
.dsh-top100 .evidence-rail p {
  margin: 7px 0 0;
  line-height: 1.45;
}
.dsh-top100 .actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
}
.dsh-top100 .actions > button,
.dsh-top100 .actions > .project-link {
  box-sizing: border-box;
  display: inline-flex;
  flex: 0 0 auto;
  height: 36px;
  min-height: 36px;
  min-width: 64px;
  padding: 0 16px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  white-space: nowrap;
}
.dsh-top100 .card-footer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  min-width: 0;
  padding-top: 10px;
  border-top: 1px solid var(--t100-line);
}
.dsh-top100 .card-footer .facts {
  min-width: 0;
  margin-top: 0;
}
.dsh-top100 .project-link {
  border: 1px solid var(--t100-line);
  color: var(--t100-ink);
  background: var(--t100-fill);
  text-decoration: none;
  transition: border-color 120ms ease, background 120ms ease, color 120ms ease;
}
.dsh-top100 .project-link:hover {
  border-color: var(--t100-accent);
  background: var(--t100-accent-soft);
  color: var(--t100-accent);
}
.dsh-top100 .project-link:focus-visible {
  outline: 2px solid var(--t100-accent);
  outline-offset: 2px;
}
.dsh-top100 .row-actions {
  min-width: 104px;
}
/* Installed items are comparison rows, with actions separate from disclosure. */
.dsh-top100 .managed-list { display: flex; flex-direction: column; gap: 0; padding: 0; overflow: visible; border-top: 1px solid var(--t100-line); }
.dsh-top100 .managed-list article.managed-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 18px; min-width: 0; padding: 16px 0; border: 0; border-bottom: 1px solid var(--t100-line); border-radius: 0; background: var(--t100-surface); }
.dsh-top100 .managed-item-main { min-width: 0; }
.dsh-top100 .managed-item-title { display: flex; align-items: baseline; flex-wrap: wrap; gap: 2px 8px; }
.dsh-top100 .managed-item-title .managed-version { white-space: nowrap; }
.dsh-top100 .managed-item-icon svg { width: 30px; height: 30px; }
.dsh-top100 .managed-item-footer { display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: 8px; }
.dsh-top100 .managed-item-heading { display: flex; align-items: center; gap: 10px; min-width: 0; }
.dsh-top100 .managed-item-heading > div { min-width: 0; }
.dsh-top100 .managed-item h3 { margin: 0; font-size: 14px; line-height: 22px; font-weight: 650; overflow-wrap: anywhere; }
.dsh-top100 .managed-item-icon { display: grid; place-items: center; flex: 0 0 30px; height: 30px; color: var(--t100-accent); font-size: 22px; }
.dsh-top100 .managed-package { margin: 0; color: var(--t100-muted); font-size: 11px; line-height: 16px; overflow-wrap: anywhere; }
.dsh-top100 .managed-version { margin: 0; color: var(--t100-muted); font-size: 12px; line-height: 18px; }
.dsh-top100 .managed-item .managed-description { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin: 2px 0 0 40px; font-size: 13px; line-height: 20px; }
.dsh-top100 .managed-item-status { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 10px; }
.dsh-top100 .managed-item-status .badge { display: inline-flex; align-items: center; gap: 6px; padding: 0; background: transparent; font-size: 11px; line-height: 16px; }
.dsh-top100 .managed-item-actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
.dsh-top100 .managed-item-actions button { min-height: 30px; height: auto; padding: 5px 9px; font-size: 12px; line-height: 18px; }
.dsh-top100 .managed-item > .job, .dsh-top100 .managed-item > .managed-update-error { grid-column: 1 / -1; }
.dsh-top100 .managed-item > .managed-details { grid-column: 1 / -1; min-width: 0; margin-left: 40px; }
.dsh-top100 button.managed-switch { flex: 0 0 36px; width: 36px; height: 22px; min-height: 22px; padding: 2px; border: 0; border-radius: 99px; background: #737780; }
.dsh-top100 button.managed-switch[aria-checked="true"] { background: #16834b; }
.dsh-top100 .managed-switch > span { display: block; width: 18px; height: 18px; border-radius: 50%; background: white; transition: transform 120ms ease; }
.dsh-top100 .managed-switch[aria-checked="true"] > span { transform: translateX(14px); }
.dsh-top100 .managed-switch:disabled { opacity: .45; }
.dsh-top100 .managed-update-error { margin: 0; color: #9a6700; font-size: 12px; }
.dsh-top100 .restart-notice { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 14px 16px; border: 1px solid #e4cc86; border-radius: 10px; background: #fffbeb; color: #785213; }
.dsh-top100 .restart-notice > div { flex: 1 1 220px; }
.dsh-top100 .restart-notice > .restart-confirm-actions { display: flex; flex: 0 1 auto; flex-wrap: wrap; gap: 8px; }
.dsh-top100 .restart-notice.restart-complete { background: var(--t100-surface); border-color: var(--t100-line); color: var(--t100-ink); }
.dsh-top100 .restart-notice.restart-complete strong { color: #16834b; }
.dsh-top100 .restart-notice strong { font-size: 13px; }
.dsh-top100 .restart-notice p { margin: 4px 0 0; font-size: 12px; line-height: 19px; }
@media (prefers-reduced-motion: reduce) { .dsh-top100 .managed-switch > span { transition: none; } }
.dsh-top100 .managed-context { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px 8px; }
.dsh-top100 button.manage-options-trigger { display: inline-flex; align-items: center; gap: 5px; height: 32px; padding: 0 10px; border: 1px solid var(--t100-line); color: var(--t100-body); font-size: 13px; }
.dsh-top100 .manage-options-trigger:hover { background: var(--t100-fill); }
.dsh-top100 .manage-options-trigger[aria-expanded="true"] .managed-chevron { transform: rotate(90deg); }
.dsh-top100 .managed-title { display: flex; align-items: baseline; gap: 10px; min-width: 0; color: var(--t100-ink); font-size: 15px; line-height: 22px; font-weight: 650; }
.dsh-top100 .managed-title .dot { flex: 0 0 8px; }
.dsh-top100 .managed-title > span:last-child { overflow-wrap: anywhere; }
.dsh-top100 .managed-disclosure { display: inline-flex; align-items: center; gap: 4px; align-self: center; color: var(--t100-muted); font-size: 12px; line-height: 20px; font-weight: 400; white-space: nowrap; }
.dsh-top100 .managed-chevron { display: block; flex: 0 0 14px; width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.dsh-top100 .managed-details[open] > summary .managed-chevron { transform: rotate(90deg); }
.dsh-top100 .manage-options-content { grid-column: 1 / -1; display: grid; gap: 12px; padding: 4px 0 12px; }
.dsh-top100 .manage-options-content[hidden] { display: none; }
.dsh-top100 .managed-setting { display: grid; gap: 8px; }
.dsh-top100 .managed-setting-label { color: var(--t100-body); font-size: 13px; }
.dsh-top100 .managed-strategies { display: flex; flex-wrap: wrap; gap: 6px; }
.dsh-top100 .managed-strategies button { height: auto; min-height: 34px; padding: 7px 12px; font-size: 13px; line-height: 18px; }
.dsh-top100 .managed-strategies button[aria-pressed="true"] { color: var(--t100-accent); background: var(--t100-accent-soft); border-color: var(--t100-accent); }
.dsh-top100 .managed-list .managed-details > summary {
  display: flex;
  align-items: center;
  gap: 4px;
  width: fit-content;
  padding: 0;
  font-size: 12px;
  line-height: 20px;
  color: var(--t100-muted);
  list-style: none;
}
.dsh-top100 .managed-list .managed-details[open] > .managed-body { margin-top: 8px; padding: 12px; border-left: 2px solid var(--t100-line); background: var(--t100-fill); }
@container (max-width: 420px) {
  .dsh-top100 .managed-list article.managed-item { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .dsh-top100 .managed-item-footer { flex-direction: row; flex-wrap: wrap; justify-content: space-between; align-items: center; margin-left: 40px; }
  .dsh-top100 .managed-item-status, .dsh-top100 .managed-item-actions { justify-content: flex-start; }
}

.dsh-top100 .managed-details > summary::-webkit-details-marker { display: none; }
.dsh-top100 .managed-details > summary .facts { grid-column: 1 / -1; margin: 0 0 0 18px; font-weight: 400; }
.dsh-top100 .managed-details > summary .badge { padding: 0; background: transparent; }
.dsh-top100 .managed-details > summary .badge.warn { color: #9a6700; }
.dsh-top100 .managed-body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; padding: 10px 0 0; }
.dsh-top100 .managed-body .facts { margin: 0; }
.dsh-top100 .managed-body > * { min-width: 0; margin: 0; overflow-wrap: anywhere; }
.dsh-top100 .managed-footer { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; }
.dsh-top100 .managed-links { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; font-size: 12px; }
.dsh-top100 .managed-links a { color: var(--t100-accent); text-decoration: none; }
.dsh-top100 .managed-links a:hover { text-decoration: underline; }
.dsh-top100 .managed-links a:focus-visible { outline: 2px solid var(--t100-accent); outline-offset: 3px; }
.dsh-top100 .managed-footer .actions > button { min-width: 0; height: 32px; min-height: 32px; padding: 0 12px; font-size: 13px; font-weight: 500; }
.dsh-top100 .managed-page .toolbar { flex-wrap: wrap; align-items: center; }
.dsh-top100 .managed-page .toolbar > input { flex: 1 1 180px; min-width: 0; }
.dsh-top100 .managed-page .toolbar > button { flex-shrink: 0; white-space: nowrap; }
.dsh-top100 .managed-page .toolbar > label { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; max-width: 100%; }
.dsh-top100 .managed-page .toolbar select { max-width: 100%; }
.dsh-top100 .managed-page code, .dsh-top100 .banner code { overflow-wrap: anywhere; }
.dsh-top100 .managed-list .row-actions {
  grid-column: auto;
  grid-row: auto;
}
.dsh-top100 button.danger {
  color: #b42318;
  border-color: color-mix(in srgb, #b42318 36%, transparent);
}
.dsh-top100 .status-cell {
  display: grid;
  place-items: center;
  min-height: 32px;
}
.dsh-top100 .dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #16803c;
}
.dsh-top100 .dot.broken { background: #b42318; }
.dsh-top100 .dot.pending { background: #9a6700; }
.dsh-top100 .dot.off {
  background: #9b9b9b;
}
.dsh-top100 .badge {
  display: inline-flex;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--t100-accent-soft);
}
.dsh-top100 .badge.warn {
  color: #9a6700;
  background: color-mix(in srgb, #f0b429 18%, transparent);
}
.dsh-top100 .badge.muted {
  color: var(--t100-muted);
  background: var(--t100-fill);
}
.dsh-top100 .managed-page,
.dsh-top100 .diag-page {
  display: grid;
  gap: 12px;
  min-height: 0;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr);
}
.dsh-top100 .diag-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  padding: 4px 0 16px;
  border-bottom: 1px solid var(--t100-line);
  font-size: 13px;
}
.dsh-top100 .diag-summary > div { flex: 1 1 200px; min-width: 0; }
.dsh-top100 .diag-summary .lede { margin: 5px 0 0; }
.dsh-top100 .diag-details > summary { cursor: pointer; }
.dsh-top100 .diag-details > :not(summary) { margin-top: 12px; }
.dsh-top100 .diag-summary button {
  margin-left: auto;
}
.dsh-top100 .diag-ok { color: #16803c; }
.dsh-top100 .diag-error { color: #b42318; }
.dsh-top100 .diag-warning { color: #9a6700; }
.dsh-top100 .diag-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
}
.dsh-top100 .diag-grid section,
.dsh-top100 details {
  padding: 10px 12px;
  border: 1px solid var(--t100-line);
  border-radius: 10px;
  background: var(--t100-fill);
}
.dsh-top100 .diag-grid h3,
.dsh-top100 details summary {
  color: var(--t100-muted);
  margin: 0;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}
.dsh-top100 .diag-grid p { margin: 6px 0 0; font-size: 12px; color: var(--t100-muted); }
.dsh-top100 .diag-list { display: grid; gap: 6px; margin-top: 8px; font-size: 12px; }
.dsh-top100 .diag-list small { display: block; color: var(--t100-muted); margin-top: 2px; }
.dsh-top100 .managed-page details,
.dsh-top100 .diag-page details,
.dsh-top100 .diag-grid section {
  min-width: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}
.dsh-top100 .managed-page summary,
.dsh-top100 .diag-page summary { padding: 4px 0; font-weight: 500; color: var(--t100-body); }
.dsh-top100 .diag-page { overflow-wrap: anywhere; font-size: 13px; line-height: 20px; }
.dsh-top100 .diag-page .lede,
.dsh-top100 .diag-page .diag-grid p,
.dsh-top100 .diag-page .diag-list,
.dsh-top100 .diag-page .diag-list small,
.dsh-top100 .diag-page button { font-family: inherit; font-size: 13px; line-height: 20px; font-weight: 400; }
.dsh-top100 .diag-grid code { font: inherit; }
.dsh-top100 .diag-page summary { line-height: 20px; }
.dsh-top100 .diag-page * { min-width: 0; box-sizing: border-box; }
.dsh-top100 .diag-page pre { max-width: 100%; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; line-height: 1.6; color: var(--t100-muted); }
.dsh-top100 .diag-section { padding-top: 14px; border-top: 1px solid var(--t100-line); }
.dsh-top100 .diag-page h3 { margin: 0; font-size: 13px; font-weight: 600; color: var(--t100-body); }
.dsh-top100 .diag-list { line-height: 1.6; gap: 10px; }
.dsh-top100 .diag-list strong { font-weight: 500; }
.dsh-top100 .diag-list details { margin-top: 4px; }
.dsh-top100 .diag-counts { display: flex; flex-wrap: wrap; gap: 8px 24px; color: var(--t100-muted); padding: 2px 0 12px; }
.dsh-top100 .diag-counts b { font-size: 17px; font-weight: 600; color: var(--t100-body); margin-right: 3px; }
.dsh-top100 .diag-issue { padding: 16px 0; border-bottom: 1px solid var(--t100-line); }
.dsh-top100 .diag-issue-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.dsh-top100 .diag-issue-heading > span { flex-shrink: 0; font-size: 12px; }
.dsh-top100 .diag-evidence { margin-top: 10px; }
.dsh-top100 .diag-evidence p, .dsh-top100 .diag-next p { margin: 4px 0; }
.dsh-top100 .diag-next { border-left: 2px solid var(--t100-line); padding-left: 12px; margin: 12px 0; color: var(--t100-muted); }
.dsh-top100 .diag-next strong { font-weight: 500; color: var(--t100-body); }
.dsh-top100 .diag-pending { border-top: 1px solid var(--t100-line); padding-top: 12px; }
.dsh-top100 .diag-pending p { margin: 6px 0; }
.dsh-top100 .diag-page .diag-details { padding-top: 12px; border-top: 1px solid var(--t100-line); }
.dsh-top100 .diag-export { display: grid; justify-items: start; gap: 8px; padding-top: 14px; border-top: 1px solid var(--t100-line); }
.dsh-top100 .managed-list .row-actions { flex-wrap: wrap; justify-content: flex-start; }
.dsh-top100 .job {
  display: grid;
  gap: 9px;
  width: min(340px, 38vw);
  padding: 11px;
  border: 1px solid color-mix(in srgb, var(--t100-accent) 28%, var(--t100-line));
  border-radius: 10px;
  background: color-mix(in srgb, Canvas 94%, var(--t100-accent-soft));
  font-size: 12px;
}
.dsh-top100 .task-details { display: grid; gap: 9px; min-width: 0; overflow-wrap: anywhere; }
.dsh-top100 .task-details .job-status { color: var(--t100-body); }
.dsh-top100 .managed-list .row-actions > .job { width: 100%; }
.dsh-top100 .job-plugin-name {
  overflow: hidden;
  color: var(--t100-ink);
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-top100 .job-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.dsh-top100 .job-heading strong {
  flex: 0 0 auto;
  color: var(--t100-accent);
  font-size: 11px;
  font-weight: 500;
}
.dsh-top100 .job-progress {
  position: relative;
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, currentColor 10%, transparent);
}
.dsh-top100 .job-progress > span {
  position: relative;
  display: block;
  height: 100%;
  min-width: 6px;
  overflow: hidden;
  border-radius: inherit;
  background: var(--t100-accent);
  transition: width 520ms cubic-bezier(.2,.75,.25,1);
}
.dsh-top100 .job:not(.job-installed):not(.job-failed):not(.job-cancelled) .job-progress > span::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0 35%, color-mix(in srgb, white 62%, transparent) 50%, transparent 65% 100%);
  transform: translateX(-100%);
  animation: t100-progress-sweep 1.8s ease-in-out infinite;
}
.dsh-top100 .job-stages {
  display: flex;
  justify-content: space-between;
  gap: 4px;
  color: var(--t100-muted);
  font-size: 9px;
}
.dsh-top100 .job-stages > span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.dsh-top100 .job-stages i {
  width: 6px;
  height: 6px;
  border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
  border-radius: 50%;
  background: Canvas;
}
.dsh-top100 .job-stages .is-active,
.dsh-top100 .job-stages .is-complete {
  color: var(--t100-accent);
}
.dsh-top100 .job-stages .is-active i {
  border-color: var(--t100-accent);
  box-shadow: 0 0 0 3px var(--t100-accent-soft);
}
.dsh-top100 .job-stages .is-complete i {
  border-color: var(--t100-accent);
  background: var(--t100-accent);
}
.dsh-top100 .job-status {
  margin: 0;
  color: var(--t100-muted);
  line-height: 1.45;
}
.dsh-top100 .job-status span {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-variant-numeric: tabular-nums;
}
.dsh-top100 .activation,
.dsh-top100 .job-provenance {
  margin: 0;
  color: var(--t100-muted);
  line-height: 1.45;
}
.dsh-top100 .activation.activation-restart-required,
.dsh-top100 .activation.activation-configuration-required,
.dsh-top100 .activation.activation-unknown,
.dsh-top100 .activation.activation-broken {
  color: #9a6700;
  font-weight: 650;
}
.dsh-top100 .job-provenance code {
  display: block;
  margin-top: 3px;
}
.dsh-top100 .job-failed {
  border-color: color-mix(in srgb, #b42318 34%, var(--t100-line));
  background: color-mix(in srgb, Canvas 96%, #b42318 4%);
}
.dsh-top100 .job-failed .job-progress > span {
  background: #b42318;
}
.dsh-top100 .job-failed .job-stages .is-active,
.dsh-top100 .job-failed .job-stages .is-complete {
  color: #b42318;
}
.dsh-top100 .job-failed .job-stages .is-active i,
.dsh-top100 .job-failed .job-stages .is-complete i {
  border-color: #b42318;
}
.dsh-top100 .job-failed .job-stages .is-complete i {
  background: #b42318;
}
.dsh-top100 .job-installed {
  border-color: color-mix(in srgb, var(--t100-accent) 30%, var(--t100-line));
  background: color-mix(in srgb, Canvas 96%, var(--t100-accent-soft));
}
.dsh-top100 .job-installed .job-progress > span {
  background: var(--t100-accent);
}
.dsh-top100 .job-installed.activation-restart-required {
  border-color: color-mix(in srgb, #c98300 40%, var(--t100-line));
  background: color-mix(in srgb, Canvas 96%, #f0b429 7%);
}
.dsh-top100 .job-installed.activation-configuration-required {
  border-color: color-mix(in srgb, #c98300 46%, var(--t100-line));
}
.dsh-top100 .job-installed.activation-configuration-required .job-progress > span {
  background: #c98300;
}
.dsh-top100 .job-installed.activation-restart-required .job-progress > span {
  background: #c98300;
}
.dsh-top100 .job-uninstall.job-installed:not(.activation-broken) {
  border-color: var(--t100-line);
  background: var(--t100-surface);
}
.dsh-top100 .job-error-message {
  display: grid;
  gap: 6px;
  padding: 9px 10px;
  border-left: 3px solid #b42318;
  border-radius: 6px;
  background: color-mix(in srgb, #b42318 7%, transparent);
  line-height: 1.45;
}
.dsh-top100 .job-error-message > strong {
  color: color-mix(in srgb, #b42318 88%, currentColor);
  font-size: 12px;
}
.dsh-top100 .job-error-message p {
  margin: 0;
  color: var(--t100-muted);
}
.dsh-top100 .job-error-packages,
.dsh-top100 .job-error-hint {
  display: grid;
  gap: 2px;
}
.dsh-top100 .job-error-packages > span,
.dsh-top100 .job-error-hint > span {
  color: var(--t100-ink);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .04em;
}
.dsh-top100 .job-error-packages code {
  color: var(--t100-ink);
}
.dsh-top100 details.job-error-details {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}
.dsh-top100 .job-error-details summary {
  color: var(--t100-muted);
  font-size: 11px;
  font-weight: 400;
}
.dsh-top100 .job-error-details pre {
  max-height: 140px;
  margin: 7px 0 0;
  padding: 8px;
  overflow: auto;
  border-radius: 6px;
  background: color-mix(in srgb, CanvasText 6%, Canvas);
  color: var(--t100-muted);
  font: 10px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.dsh-top100 .job > button {
  width: 100%;
}
@keyframes t100-progress-sweep {
  55%, 100% { transform: translateX(100%); }
}
.dsh-top100 .banner,
.dsh-top100 .error {
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--t100-accent-soft);
  font-size: 13px;
}
.dsh-top100 .task-history { background: var(--t100-surface); border: 1px solid var(--t100-line); }
.dsh-top100 .task-history > summary { cursor: pointer; font-weight: 500; color: var(--t100-muted); }
.dsh-top100 .task-history-list { max-height: 260px; overflow-y: auto; margin-top: 8px; }
.dsh-top100 .task-history-item { padding: 8px 0; border: 0; border-top: 1px solid var(--t100-line); border-radius: 0; background: transparent; }
.dsh-top100 .task-history-item > summary { cursor: pointer; font: inherit; line-height: 1.6; color: var(--t100-ink); overflow-wrap: anywhere; }
.dsh-top100 .task-history-item > .task-details { margin-top: 6px; line-height: 1.6; }
.dsh-top100 .install-activity-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 10px 9px 12px;
  border: 1px solid color-mix(in srgb, var(--t100-accent) 25%, var(--t100-line));
  border-radius: 9px;
  background: color-mix(in srgb, Canvas 93%, var(--t100-accent-soft));
}
.dsh-top100 .install-activity-banner > div {
  display: flex;
  flex-wrap: wrap;
  min-width: 0;
  gap: 8px;
  align-items: baseline;
}
.dsh-top100 .install-activity-banner strong {
  font-size: 12px;
  font-weight: 500;
}
.dsh-top100 .install-activity-banner span {
  max-width: 280px;
  overflow: hidden;
  color: var(--t100-muted);
  font-family: inherit;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-top100 .install-activity-banner > button {
  flex: 0 0 auto;
  min-height: 30px;
  padding: 5px 10px;
  border-color: color-mix(in srgb, var(--t100-accent) 34%, var(--t100-line));
  color: var(--t100-accent);
  font-size: 11px;
  font-weight: 500;
}
.dsh-top100 .install-activity-banner.is-active {
  border-left: 3px solid var(--t100-accent);
}
.dsh-top100 .install-activity-mask {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 16px;
  background: color-mix(in srgb, #17211f 44%, transparent);
}
.dsh-top100 .install-activity-dialog {
  display: grid;
  grid-template-rows: auto auto;
  width: min(480px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  overflow: auto;
  border: 1px solid color-mix(in srgb, var(--t100-accent) 24%, var(--t100-line));
  border-radius: 14px;
  background: var(--t100-surface);
  color: var(--t100-ink);
  box-shadow: 0 24px 70px color-mix(in srgb, #17211f 26%, transparent);
  animation: t100-install-dialog-in 160ms cubic-bezier(.2,.75,.25,1);
}
@keyframes t100-install-dialog-in {
  from { opacity: .6; transform: translateY(8px) scale(.99); }
}
.dsh-top100 .install-activity-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 32px;
  gap: 16px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--t100-line);
}
.dsh-top100 .install-activity-head h3 {
  margin: 0 0 3px;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
}
.dsh-top100 .install-activity-head p {
  margin: 0;
  color: var(--t100-muted);
  font-size: 11px;
  line-height: 1.5;
}
.dsh-top100 button.install-activity-close {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  color: var(--t100-muted);
  font-size: 22px;
  font-weight: 300;
  line-height: 1;
}
.dsh-top100 button.install-activity-close:hover {
  background: var(--t100-fill);
  color: var(--t100-ink);
}
.dsh-top100 .install-activity-list {
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 12px 16px 16px;
  overflow: visible;
}
.dsh-top100 .install-activity-item > .job {
  box-sizing: border-box;
  min-width: 0;
  width: 100%;
  padding: 12px;
  border-radius: 9px;
}
.dsh-top100 .error {
  background: color-mix(in srgb, #b42318 12%, transparent);
}
.dsh-top100 .detail-mask {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  justify-content: flex-end;
  background: color-mix(in srgb, #17211f 38%, transparent);
}
.dsh-top100 .detail-drawer {
  display: flex;
  flex-direction: column;
  gap: 15px;
  width: min(440px, calc(100vw - 24px));
  height: 100%;
  padding: 18px;
  overflow: auto;
  border-left: 1px solid var(--t100-line);
  background: var(--t100-surface);
  color: var(--t100-ink);
  box-shadow: -18px 0 48px color-mix(in srgb, #17211f 18%, transparent);
  animation: t100-drawer-in 180ms cubic-bezier(.2,.75,.25,1);
}
@keyframes t100-drawer-in {
  from { opacity: .7; transform: translateX(24px); }
}
.dsh-top100 .detail-head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) 32px;
  gap: 10px;
  align-items: start;
}
.dsh-top100 .detail-rank {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 7px;
  box-sizing: border-box;
  border-radius: 9px 9px 9px 3px;
  background: var(--t100-action);
  color: var(--t100-on-action);
  font-size: 13px;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}
.dsh-top100 .detail-head h3 {
  margin: 0;
  font-size: 16px;
  line-height: 22px;
}
.dsh-top100 .detail-head p {
  margin: 2px 0 0;
  color: var(--t100-muted);
  font-size: 11px;
}
.dsh-top100 button.detail-close {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  color: var(--t100-muted);
  font-size: 22px;
  font-weight: 300;
  line-height: 1;
}
.dsh-top100 button.detail-close:hover {
  background: var(--t100-fill);
  color: var(--t100-ink);
}
.dsh-top100 .detail-description {
  margin: 0;
  color: var(--t100-muted);
  font-size: 12px;
  line-height: 1.6;
}
.dsh-top100 .detail-refresh {
  margin: -2px 0 0;
  color: var(--t100-accent);
  font-size: 10px;
}
.dsh-top100 .detail-refresh.is-warning { color: #9a6700; }
.dsh-top100 .detail-decision {
  display: grid;
  gap: 10px;
  padding: 13px;
  border: 1px solid var(--t100-line);
  border-left-width: 3px;
  border-radius: 10px;
  background: var(--t100-fill);
}
.dsh-top100 .detail-decision-installable,
.dsh-top100 .detail-decision-installed {
  border-color: color-mix(in srgb, var(--t100-accent) 28%, var(--t100-line));
  border-left-color: var(--t100-accent);
  background: color-mix(in srgb, var(--t100-accent) 5%, var(--t100-surface));
}
.dsh-top100 .detail-decision-browse {
  border-left-color: var(--t100-muted);
  background: var(--t100-fill);
}
.dsh-top100 .detail-decision h4 {
  margin: 2px 0 0;
  font-size: 14px;
  line-height: 1.4;
}
.dsh-top100 .detail-decision > p {
  margin: 0;
  color: var(--t100-body);
  font-size: 11px;
  line-height: 1.55;
}
.dsh-top100 .detail-eyebrow {
  color: var(--t100-muted);
  font-size: 9px;
  font-weight: 750;
  letter-spacing: .08em;
}
.dsh-top100 .detail-decision .detail-caveat {
  padding: 8px 9px;
  border-left: 3px solid #c98300;
  border-radius: 0 7px 7px 0;
  background: color-mix(in srgb, #f0b429 8%, transparent);
  color: #7a5200;
}
.dsh-top100 .detail-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin: 0;
}
.dsh-top100 .detail-metrics > div {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 9px 8px;
  border-radius: 8px;
  background: var(--t100-fill);
}
.dsh-top100 .detail-metrics dt,
.dsh-top100 .detail-properties dt {
  color: var(--t100-muted);
  font-size: 10px;
}
.dsh-top100 .detail-metrics dd {
  margin: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
}
.dsh-top100 .detail-section {
  display: grid;
  gap: 8px;
  padding-top: 14px;
  border-top: 1px solid var(--t100-line);
}
.dsh-top100 .detail-section h4 {
  margin: 0;
  font-size: 12px;
  font-weight: 750;
  letter-spacing: .02em;
}
.dsh-top100 .detail-section > p,
.dsh-top100 .detail-section > ul {
  margin: 0;
  color: var(--t100-muted);
  font-size: 11px;
  line-height: 1.55;
}
.dsh-top100 .detail-section > ul {
  display: grid;
  gap: 4px;
  padding-left: 17px;
}
.dsh-top100 .detail-section .detail-highlight {
  justify-self: start;
  padding: 4px 8px;
  border-radius: 99px;
  background: var(--t100-accent-soft);
  color: var(--t100-accent);
  font-weight: 700;
}
.dsh-top100 .detail-properties {
  display: grid;
  gap: 7px;
  margin: 0;
}
.dsh-top100 .detail-properties > div {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 10px;
  align-items: baseline;
}
.dsh-top100 .detail-properties dd {
  margin: 0;
  font-size: 11px;
  text-align: right;
}
.dsh-top100 .detail-properties a {
  color: var(--t100-accent);
  overflow-wrap: anywhere;
}
.dsh-top100 details.detail-secondary {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--t100-line);
  border-radius: 10px;
  background: transparent;
}
.dsh-top100 details.detail-secondary[open] {
  display: grid;
  gap: 12px;
}
.dsh-top100 .detail-secondary > summary {
  color: var(--t100-body);
  font-size: 11px;
  font-weight: 700;
}
.dsh-top100 .detail-ranking-basis {
  margin: 0;
  color: var(--t100-muted);
  font-size: 10px;
  line-height: 1.5;
}
.dsh-top100 .detail-secondary .detail-highlight {
  justify-self: start;
  margin: -6px 0 0;
  padding: 3px 7px;
  border-radius: 99px;
  background: var(--t100-accent-soft);
  color: var(--t100-accent);
  font-size: 10px;
  font-weight: 700;
}
.dsh-top100 .detail-secondary .detail-properties {
  padding-top: 10px;
  border-top: 1px solid var(--t100-line);
}
.dsh-top100 .decision-properties > div {
  padding: 7px 8px;
  border-radius: 7px;
  background: var(--t100-fill);
}
.dsh-top100 .decision-properties dd { color: var(--t100-body); }
.dsh-top100 .trust-section {
  gap: 10px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--t100-accent) 18%, var(--t100-line));
  border-radius: 10px;
  background: color-mix(in srgb, var(--t100-accent) 4%, var(--t100-surface));
}
.dsh-top100 .trust-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.dsh-top100 .trust-heading .evidence-badge {
  min-height: 22px;
  border: 1px solid color-mix(in srgb, var(--t100-accent) 22%, var(--t100-line));
  background: transparent;
}
.dsh-top100 .trust-note {
  margin: 0;
  color: var(--t100-muted);
  font-size: 11px;
  line-height: 1.55;
}
.dsh-top100 .trust-section details.evidence-rail {
  margin: 0;
  padding: 8px 10px;
  border: 0;
  border-radius: 7px;
  background: var(--t100-fill);
}
.dsh-top100 .detail-source {
  display: grid;
  gap: 5px;
  padding: 9px 10px;
  border-radius: 7px;
  background: var(--t100-fill);
}
.dsh-top100 .detail-source span {
  color: var(--t100-muted);
  font-size: 10px;
  font-weight: 650;
}
.dsh-top100 .detail-source code {
  color: var(--t100-ink);
  font-size: 10px;
}
.dsh-top100 .browse-note {
  padding: 9px 10px;
  border-radius: 7px;
  background: var(--t100-fill);
}
.dsh-top100 .detail-actions {
  position: sticky;
  bottom: 0;
  display: flex;
  gap: 8px;
  margin: auto -18px -18px;
  padding: 12px 18px 18px;
  border-top: 1px solid var(--t100-line);
  background: color-mix(in srgb, var(--t100-surface) 94%, transparent);
  backdrop-filter: blur(10px);
}
.dsh-top100 .detail-actions > * { flex: 1 1 0; }
.dsh-top100 .mask {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, #17211f 42%, transparent);
}
.dsh-top100 .dialog {
  box-sizing: border-box;
  width: min(480px, calc(100vw - 32px));
  max-height: min(760px, calc(100vh - 32px));
  overflow: hidden;
  border-radius: 12px;
  background: var(--t100-surface);
  color: var(--t100-ink);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  box-shadow: 0 16px 56px #0003;
}
.dsh-top100 .confirm-header { padding: 24px 24px 20px; }
.dsh-top100 .confirm-header h3 { margin: 0; font-size: 20px; line-height: 28px; font-weight: 600; overflow-wrap: anywhere; }
.dsh-top100 .confirm-body {
  min-height: 0;
  overflow: auto;
  padding: 0 24px 18px;
  overscroll-behavior: contain;
}
.dsh-top100 .confirm-list {
  display: grid;
  gap: 24px;
}
.dsh-top100 .confirm-item {
  min-width: 0;
}
.dsh-top100 .confirm-item + .confirm-item {
  border-top: 1px solid var(--t100-line);
  padding-top: 24px;
}
.dsh-top100 .confirm-project {
  display: grid;
  margin-bottom: 18px;
}
.dsh-top100 .confirm-project strong {
  overflow-wrap: anywhere;
  font-size: 17px;
  font-weight: 600;
  line-height: 24px;
}
.dsh-top100 .confirm-project-link {
  display: inline-block;
  margin-top: 8px;
  color: var(--t100-body);
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  text-decoration: none;
}
.dsh-top100 .confirm-project-link:hover { color: var(--t100-ink); text-decoration: underline; }
.dsh-top100 .confirm-project-link:focus-visible { outline: 2px solid var(--t100-accent); outline-offset: 3px; }
.dsh-top100 .dialog code {
  color: var(--t100-ink);
  font: 13px/20px ui-monospace, SFMono-Regular, Menlo, monospace;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.dsh-top100 code.confirm-target { display: block; margin-top: 6px; color: var(--t100-body); }
.dsh-top100 .confirm-source-status {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--t100-body);
}
.dsh-top100 .confirm-scripts p { margin: 0; font-size: 14px; line-height: 22px; }
.dsh-top100 .confirm-scripts[data-warning="true"] { border-left: 2px solid var(--t100-accent); padding-left: 12px; }
.dsh-top100 .confirm-scripts[data-warning="true"] > p { font-weight: 500; }
.dsh-top100 .confirm-followup { margin: 14px 0 0; font-size: 14px; line-height: 22px; color: var(--t100-body); }
.dsh-top100 .confirm-evidence {
  margin-top: 16px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--t100-body);
  font-size: 12px;
  line-height: 20px;
}
.dsh-top100 .confirm-evidence summary {
  padding: 0;
  color: var(--t100-ink);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.dsh-top100 .confirm-evidence dl { margin: 12px 0 0; padding: 12px; border-radius: 6px; background: color-mix(in srgb, var(--t100-ink) 4%, var(--t100-surface)); }
.dsh-top100 .confirm-evidence dl > div { display: grid; grid-template-columns: 86px minmax(0, 1fr); gap: 10px; }
.dsh-top100 .confirm-evidence dl > div + div { margin-top: 10px; }
.dsh-top100 .confirm-evidence dd { min-width: 0; margin: 0; }
.dsh-top100 .confirm-footer {
  padding: 16px 24px 20px;
  border-top: 1px solid var(--t100-line);
  background: var(--t100-surface);
}
.dsh-top100 .confirm-caveat {
  margin: 0;
  color: var(--t100-body);
  font-size: 12px;
  line-height: 18px;
}
.dsh-top100 .script-evidence {
  display: grid;
  grid-template-columns: auto 14px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--t100-ink) 4%, var(--t100-surface));
}
.dsh-top100 .script-evidence span {
  color: var(--t100-body);
  font: 400 13px/20px ui-monospace, SFMono-Regular, Menlo, monospace;
  overflow-wrap: anywhere;
}
.dsh-top100 .risk-list {
  display: grid;
  gap: 12px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}
.dsh-top100 .risk-list:empty { display: none; }
.dsh-top100 .risk-list li {
  display: grid;
  gap: 4px;
  font-size: 13px;
  line-height: 20px;
}
.dsh-top100 .risk-list strong { font-weight: 600; }
.dsh-top100 .risk-list li[data-severity="warning"] { border-left: 3px solid #b77912; padding-left: 12px; }
.dsh-top100 .risk-list span { color: var(--t100-body); white-space: pre-wrap; overflow-wrap: anywhere; }
.dsh-top100 .risk-approval {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin: 12px 0 0;
  font-size: 14px;
  line-height: 22px;
  cursor: pointer;
}
.dsh-top100 .risk-approval input { flex: 0 0 16px; width: 16px; height: 16px; margin: 3px 0 0; accent-color: var(--t100-accent); }
.dsh-top100 .confirm-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.dsh-top100 .confirm-actions button { min-width: 88px; height: 40px; padding: 0 16px; font-size: 14px; font-weight: 500; }
.dsh-top100 .confirm-actions button.primary { font-weight: 600; }
.dsh-top100 .confirm-actions button.primary:disabled { color: var(--t100-body); background: var(--t100-fill); border-color: var(--t100-line); opacity: 1; cursor: not-allowed; }
.dsh-top100 button:focus-visible,
.dsh-top100 input:focus-visible,
.dsh-top100 select:focus-visible,
.dsh-top100 summary:focus-visible {
  outline: 2px solid var(--t100-accent);
  outline-offset: 2px;
}
.dsh-top100 code {
  font-size: 12px;
  word-break: break-all;
}
@container (max-width: 420px) {
  .dsh-top100 .market-head { grid-template-columns: 40px minmax(0, 1fr); gap: 10px; }
  .dsh-top100 .rank-mark { width: 40px; height: 40px; border-radius: 12px; }
  .dsh-top100 .rank-mark svg { width: 34px; height: 34px; }
  .dsh-top100 .meta { gap: 3px 10px; }
  .dsh-top100 .toolbar { flex-wrap: wrap; }
  .dsh-top100 .search-cluster { flex-basis: 100%; }
  .dsh-top100 .search-cluster > button.primary { flex: 0 0 auto; }
  .dsh-top100 .market-filter-row { width: 100%; flex-wrap: wrap; }
  .dsh-top100 .market-category-menu { flex: 1 1 150px; }
  .dsh-top100 .market-category-popover { width: min(330px, calc(100vw - 36px)); }
  .dsh-top100 .ranking-context { flex-wrap: wrap; }
  .dsh-top100 .card-footer { grid-template-columns: minmax(0, 1fr); align-items: stretch; }
  .dsh-top100 .managed-list .row-actions { grid-column: 1 / -1; }
  .dsh-top100 .actions { flex-wrap: wrap; }
  .dsh-top100 .detail-drawer { width: 100%; padding: 15px; }
  .dsh-top100 .detail-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dsh-top100 .detail-actions { margin: auto -15px -15px; padding: 11px 15px 15px; }
  .dsh-top100 .install-activity-banner { align-items: stretch; flex-direction: column; }
  .dsh-top100 .install-activity-banner > div { justify-content: space-between; }
  .dsh-top100 .install-activity-banner > button { width: 100%; }
  .dsh-top100 .install-activity-mask { padding: 8px; }
  .dsh-top100 .install-activity-dialog { width: calc(100vw - 16px); max-height: calc(100vh - 16px); }
  .dsh-top100 .install-activity-head { padding: 15px 15px 12px; }
  .dsh-top100 .install-activity-list { padding: 12px 15px; }
}
@media (max-width: 720px) {
  .dsh-top100 .diag-grid { grid-template-columns: 1fr; }
  .dsh-top100 .actions .job { flex: 1 1 100%; width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .dsh-top100 .ranking-card { transition: none; }
  .dsh-top100 .detail-drawer { animation: none; }
  .dsh-top100 .install-activity-dialog { animation: none; }
  .dsh-top100 .skeleton-line::after,
  .dsh-top100 .skeleton-rank::after,
  .dsh-top100 .skeleton-pills::after { display: none; animation: none; }
  .dsh-top100 .job-progress > span { transition: none; }
  .dsh-top100 .job-progress > span::after { display: none; animation: none; }
}
`;
