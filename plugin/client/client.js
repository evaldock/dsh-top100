window.__ModuleLoader__.load({ id: "@dsheval/dsh-top100-plugin", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
let react = require("react");
let react_jsx_runtime = require("react/jsx-runtime");

//#region src/client/ErrorBoundary.tsx
var PluginErrorBoundary = class extends react.Component {
	state = { failed: false };
	static getDerivedStateFromError() {
		return { failed: true };
	}
	render() {
		if (!this.state.failed) return this.props.children;
		return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: "dsh-top100",
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "error",
				role: "alert",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: this.props.t("clientErrorTitle") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: this.props.t("clientErrorHint") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => this.setState({ failed: false }),
						children: this.props.t("retry")
					})
				]
			})
		});
	}
};

//#endregion
//#region src/client/DescriptionPreview.tsx
/** Measure actual wrapping: short summaries need no extra control. */
function DescriptionPreview({ text, t }) {
	const id = (0, react.useId)();
	const element = (0, react.useRef)(null);
	const [expandedText, setExpandedText] = (0, react.useState)(null);
	const [overflows, setOverflows] = (0, react.useState)(false);
	const expanded = expandedText === text;
	(0, react.useEffect)(() => {
		const target = element.current;
		if (!target) return;
		const measure = () => {
			const lineHeight = Number.parseFloat(getComputedStyle(target).lineHeight);
			setOverflows(target.scrollHeight > lineHeight * 2 + 1);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(target);
		return () => observer.disconnect();
	}, [text]);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: `desc description-preview${expanded ? " is-expanded" : ""}`,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			ref: element,
			id,
			className: "description-text",
			children: text
		}), overflows || expanded ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
			type: "button",
			className: "description-toggle",
			"aria-expanded": expanded,
			"aria-controls": id,
			onClick: () => setExpandedText(expanded ? null : text),
			children: t(expanded ? "collapseDescription" : "expandDescription")
		}) : null]
	});
}

//#endregion
//#region src/shared/description-rules.ts
/** Presentation contract only. Editorial decisions belong to the publisher. */
const DESCRIPTION_POLICY = "server-v1";
const PENDING_DESCRIPTION_ZH = "中文简介待生成。";
/** Shared display rules; raw repository text is always rendered via textContent. */
function cleanDescription(value) {
	return String(value ?? "").replace(/```[\s\S]*?```/g, " ").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/[`*_~>#]/g, " ").replace(/\s+/g, " ").trim().replace(/^((?:[\w@/.-]+\s+)?)(?:简体中文|中文)\s*[|·]\s*English\s*/i, "$1").replace(/^((?:[\w@/.-]+\s+)?)English\s*[|·]\s*(?:简体中文|中文)\s*/i, "$1").trim();
}
/** Validate the calendar date without accepting JavaScript's invalid-date rollover. */
function isDescriptionReviewDate(value) {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
	const parsed = /* @__PURE__ */ new Date(`${value}T00:00:00.000Z`);
	return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
/** Invalid server status fails closed; clients do not invent missing review evidence. */
function descriptionStatusFor(value) {
	if (value === void 0) return void 0;
	if (value && typeof value === "object") {
		const status = value;
		if (typeof status.state === "string" && [
			"pending",
			"review-required",
			"missing-source",
			"retry",
			"stale"
		].includes(status.state) && typeof status.reason === "string" && (status.origin === void 0 || status.origin === "model") && (status.state !== "stale" || isDescriptionReviewDate(status.origin === "model" ? status.generatedAt : status.reviewedAt))) return {
			state: status.state,
			reason: cleanDescription(status.reason).slice(0, 200),
			...status.origin === "model" ? { origin: "model" } : {},
			...isDescriptionReviewDate(status.generatedAt) ? { generatedAt: status.generatedAt } : {},
			...isDescriptionReviewDate(status.reviewedAt) ? { reviewedAt: status.reviewedAt } : {}
		};
	}
	return {
		state: "review-required",
		reason: "服务端简介状态无效，等待复核。"
	};
}
/** Never infer a summary from author metadata, a README or an older local review. */
function descriptionFor(entry) {
	if (entry.descriptionPolicy !== DESCRIPTION_POLICY) return PENDING_DESCRIPTION_ZH;
	const status = descriptionStatusFor(entry.descriptionStatus);
	if (status !== void 0 && status.state !== "stale") return PENDING_DESCRIPTION_ZH;
	if (typeof entry.descriptionZh !== "string") return PENDING_DESCRIPTION_ZH;
	return cleanDescription(entry.descriptionZh) || PENDING_DESCRIPTION_ZH;
}
function descriptionDisplayFor(entry) {
	const description = descriptionFor(entry);
	const status = descriptionStatusFor(entry.descriptionStatus);
	if (status?.state === "stale") {
		if (description === PENDING_DESCRIPTION_ZH) return "中文简介待复核：旧简介正文缺失，等待服务端核查。";
		return status.origin === "model" ? `生成于 ${status.generatedAt}，来源待核查，简介待更新。${description}` : `上次核验 ${status.reviewedAt}，来源核查中，简介待更新。${description}`;
	}
	if (description !== PENDING_DESCRIPTION_ZH || !status) return description;
	return `${{
		"pending": "中文简介待生成",
		"review-required": "中文简介待复核",
		"missing-source": "中文简介资料不足",
		"retry": "中文简介生成未完成"
	}[status.state]}${status.reason ? `：${status.reason}` : "。"}`;
}

//#endregion
//#region src/client/latest-request.ts
/** Own one read-only request; a cancelled or superseded result must never reach the UI. */
var LatestRequest = class {
	controller = null;
	start() {
		this.cancel();
		const controller = new AbortController();
		this.controller = controller;
		return {
			signal: controller.signal,
			isCurrent: () => this.controller === controller && !controller.signal.aborted
		};
	}
	cancel() {
		this.controller?.abort();
		this.controller = null;
	}
};

//#endregion
//#region src/client/metric-presentation.ts
function deltaLabel(value) {
	return value === null || !Number.isFinite(value) ? "—" : value > 0 ? `+${value}` : String(value);
}
function scoreLabel(value) {
	return value === null || !Number.isFinite(value) ? "—" : value.toFixed(1);
}

//#endregion
//#region src/client/diagnostic-export.ts
const CODES = new Set([
	"profile-missing",
	"catalog-unreachable",
	"catalog-stale",
	"bundle-unresolved",
	"bundle-disabled",
	"bundle-local",
	"bundle-unlisted",
	"peer-mismatch",
	"peer-missing",
	"host-core-dependency",
	"duplicate-entry",
	"skill-manifest-missing",
	"core-multi-version",
	"patch-orphan",
	"extra-dependency"
]);
const count = (value) => Number.isFinite(value) && value >= 0 ? value : null;
/** Construct a new payload; never copy free-form fields from the report. */
function diagnosticSummary(report) {
	const findings = {};
	for (const finding of report.findings) {
		const code = CODES.has(finding.code) ? finding.code : "other";
		findings[code] = (findings[code] ?? 0) + 1;
	}
	return {
		schema: "dsh-top100/diagnostic-summary/v1",
		pluginVersion: /^\d+\.\d+\.\d+$/.test(report.pluginVersion) ? report.pluginVersion : null,
		summary: {
			ok: report.summary.ok === true,
			errors: count(report.summary.errors),
			warnings: count(report.summary.warnings),
			conflicts: count(report.summary.conflicts),
			dependencies: count(report.summary.dependencies)
		},
		catalog: {
			ok: report.catalog.ok === true,
			latencyMs: report.catalog.latencyMs === null ? null : count(report.catalog.latencyMs),
			staleDays: report.catalog.staleDays === null ? null : count(report.catalog.staleDays),
			total: count(report.catalog.counts.total)
		},
		inventory: {
			official: count(report.inventory.official),
			community: count(report.inventory.community),
			skills: count(report.inventory.skills),
			enabled: count(report.inventory.enabled),
			disabled: count(report.inventory.disabled)
		},
		findings
	};
}

//#endregion
//#region src/client/diagnostic-presentation.ts
function diagnosticLabels(language) {
	return language === "en" ? {
		technicalDetails: "Technical details",
		information: "Information"
	} : {
		technicalDetails: "技术详情",
		information: "提示"
	};
}
function parameter(finding, key) {
	const value = finding.parameters?.[key];
	return typeof value === "string" || typeof value === "number" ? String(value) : null;
}
function listParameter(finding, key) {
	const value = finding.parameters?.[key];
	return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : null;
}
function only(items) {
	return items.length === 1 ? items[0] : void 0;
}
function bundleError(reason, language) {
	return {
		"package-missing": ["包未解析到安装目录", "The package installation directory could not be resolved."],
		"manifest-unreadable": ["package.json 不可读", "The package.json manifest could not be read."],
		"not-dsh-bundle": ["不是 DSH bundle（缺少 dsh 清单字段）", "The package is missing the dsh manifest field required for a DSH bundle."],
		"patch-invalid": ["插件补丁缺失或无效；请查看技术详情", "The plugin patch is missing or invalid. See technical details."]
	}[reason ?? ""]?.[language === "en" ? 1 : 0] ?? (language === "en" ? "The plugin could not be validated. See technical details." : "插件未通过检查，请查看技术详情");
}
function presentDiagnosticBundleError(bundle, language) {
	if (!bundle.error) return null;
	const message = bundleError(bundle.errorCode ?? (!bundle.directory ? "package-missing" : void 0), language);
	return {
		message,
		technicalDetails: bundle.error !== message ? bundle.error : null
	};
}
function presentDiagnosticFinding(finding, report, language) {
	const en$1 = language === "en";
	const bundle = report.bundles.find((item) => item.name === finding.subject);
	let message;
	switch (finding.code) {
		case "runtime-missing-services":
			message = en$1 ? `Required host services are missing: ${(listParameter(finding, "services") ?? []).join(", ")}. Check the author’s configuration and companion plugins.` : `宿主入口缺少必需服务：${(listParameter(finding, "services") ?? []).join("、")}。请检查作者要求的配置或配套插件。`;
			break;
		case "runtime-failed":
			message = en$1 ? "The host entry failed to load. Check DSH logs for the cause." : "宿主入口加载失败，请查看 DSH 日志中的具体原因。";
			break;
		case "runtime-restart-required":
			message = en$1 ? "Configuration changed. Restart DSH, then refresh to verify." : "配置已改变，重启 DSH 后刷新验证。";
			break;
		case "profile-missing":
			message = en$1 ? "The Profile directory or package.json could not be read." : "Profile 目录或 package.json 不可读取。";
			break;
		case "catalog-unreachable":
			message = en$1 ? "The catalog is unavailable. Check the connection and data source." : "榜单不可用，请检查连接和数据源。";
			break;
		case "catalog-stale": {
			const days = parameter(finding, "days") ?? report.catalog.staleDays;
			message = days === null ? en$1 ? "The catalog snapshot is out of date." : "榜单快照已过期。" : en$1 ? `The catalog snapshot is ${days} days old.` : `榜单快照已有 ${days} 天。`;
			break;
		}
		case "user-patch-invalid":
			message = en$1 ? "The user patch could not be read or is not a valid DSH patch list." : "用户补丁不可读取或不是有效的 DSH 补丁列表。";
			break;
		case "bundle-unresolved":
			message = bundleError(parameter(finding, "reason") ?? bundle?.errorCode ?? (bundle && !bundle.directory ? "package-missing" : void 0), language);
			break;
		case "bundle-local":
			message = en$1 ? "Local link/file plugins must be updated at their source." : "本地 link/file 插件需在来源目录更新。";
			break;
		case "bundle-unlisted":
			message = en$1 ? "This installed plugin is not in the current catalog." : "已安装的插件不在当前榜单里。";
			break;
		case "bundle-disabled":
			message = en$1 ? "All loading entries for this plugin are disabled in the current configuration." : "当前配置已停用该插件的全部加载行。";
			break;
		case "peer-missing":
		case "peer-mismatch": {
			const missing = finding.code === "peer-missing";
			const peer = only(report.peers.filter((item) => item.plugin === finding.subject && (missing ? item.resolved === null : item.satisfied === false)));
			const dependency = parameter(finding, "dependency") ?? peer?.name;
			const range = parameter(finding, "range") ?? peer?.range;
			const resolved = parameter(finding, "resolved") ?? peer?.resolved;
			if (dependency && range && (missing || resolved)) message = missing ? en$1 ? `Required dependency ${dependency} is missing (declared ${range}).` : `缺少必需依赖 ${dependency}（声明 ${range}）。` : en$1 ? `${dependency} requires ${range}, but resolves to ${resolved}.` : `${dependency} 声明 ${range}，解析到 ${resolved}。`;
			else message = missing ? en$1 ? "A required peer dependency is missing. See technical details." : "缺少必需依赖，请查看技术详情。" : en$1 ? "A peer dependency version does not satisfy the declared range. See technical details." : "依赖版本不满足声明范围，请查看技术详情。";
			break;
		}
		case "host-core-dependency": {
			const dependency = parameter(finding, "dependency") ?? only(report.hostDeps.filter((item) => item.plugin === finding.subject))?.dependency;
			message = dependency ? en$1 ? `Host core package ${dependency} is declared in dependencies.` : `把宿主核心包 ${dependency} 写进了 dependencies。` : en$1 ? "A host core package is declared in dependencies. See technical details." : "把宿主核心包写进了 dependencies，请查看技术详情。";
			break;
		}
		case "duplicate-entry": {
			const layers = listParameter(finding, "layers") ?? report.duplicates.find((item) => item.id === finding.subject)?.layers;
			message = layers?.length ? en$1 ? `The loading ID appears in ${layers.join(" / ")}.` : `加载 id 出现在 ${layers.join(" / ")}。` : en$1 ? "The loading ID is declared by multiple bundles." : "多个插件声明了同一个加载 id。";
			break;
		}
		case "skill-manifest-missing":
			message = en$1 ? "The Skill directory is missing SKILL.md." : "Skill 目录缺少 SKILL.md。";
			break;
		case "core-multi-version": {
			const versions = listParameter(finding, "versions") ?? report.multiVersion.find((item) => item.name === finding.subject)?.versions;
			message = versions?.length ? en$1 ? `The lockfile contains multiple versions: ${versions.join(" / ")}.` : `锁文件里有多个版本：${versions.join(" / ")}。` : en$1 ? "The lockfile contains multiple versions of this core package." : "锁文件中该核心包存在多个版本。";
			break;
		}
		case "patch-orphan":
			message = en$1 ? "The user patch disables an ID that is absent from the current loading layers." : "用户补丁停用了一个当前加载层找不到的 id。";
			break;
		case "extra-dependency":
			message = en$1 ? "The package is listed in package.json but not in dsh.profile.bundles loading order." : "写在 package.json 里，但不在 dsh.profile.bundles 加载顺序中。";
			break;
		default: message = en$1 ? "An additional diagnostic finding was reported. See technical details." : "发现其他诊断问题，请查看技术详情。";
	}
	const technicalDetails = [finding.message !== message ? finding.message : null, finding.detail].filter((value) => Boolean(value)).join("\n");
	return {
		message,
		technicalDetails: technicalDetails || null
	};
}

//#endregion
//#region src/client/DiagnosticsPage.tsx
function TechnicalDetails({ text, language }) {
	return text ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: diagnosticLabels(language).technicalDetails }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", { children: text })] }) : null;
}
function FindingList({ items, report, language }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		className: "diag-list",
		children: items.map((item, index) => {
			const presented = presentDiagnosticFinding(item, report, language);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: `diag-${item.severity}`,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: item.subject }),
					" — ",
					presented.message,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TechnicalDetails, {
						text: presented.technicalDetails,
						language
					})
				]
			}, `${item.code}-${item.subject}-${index}`);
		})
	});
}
function DiagnosticsPage({ t }) {
	const language = t("descriptionLocale") === "en" ? "en" : "zh";
	const [report, setReport] = (0, react.useState)(null);
	const [error, setError] = (0, react.useState)(null);
	const [exportError, setExportError] = (0, react.useState)(false);
	const [loading, setLoading] = (0, react.useState)(true);
	const load = (0, react.useCallback)(async () => {
		setLoading(true);
		setError(null);
		try {
			const response = await fetch("/dsh-top100/diagnose", { cache: "no-store" });
			const body = await response.json();
			if (!response.ok) throw new Error(body.error || `${response.status} ${response.statusText}`);
			setReport(body);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setLoading(false);
		}
	}, []);
	(0, react.useEffect)(() => {
		load();
	}, [load]);
	if (error) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "error",
		children: [
			t("diagLoadFail"),
			" ",
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TechnicalDetails, {
				text: error,
				language
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => void load(),
				children: t("retry")
			})
		]
	});
	if (!report) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
		className: "lede",
		children: loading ? t("diagLoading") : t("diagLoadFail")
	});
	function exportSummary() {
		if (!report) return;
		setExportError(false);
		let url = null;
		let link = null;
		try {
			const payload = JSON.stringify(diagnosticSummary(report), null, 2);
			url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
			link = document.createElement("a");
			link.href = url;
			link.download = "dsh-top100-diagnostic-summary.json";
			document.body.appendChild(link);
			link.click();
		} catch {
			setExportError(true);
		} finally {
			link?.remove();
			if (url) {
				const objectUrl = url;
				setTimeout(() => URL.revokeObjectURL(objectUrl), 1e3);
			}
		}
	}
	const errors = report.findings.filter((item) => item.severity === "error");
	const warnings = report.findings.filter((item) => item.severity === "warning");
	const infos = report.findings.filter((item) => item.severity === "info");
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "diag-page",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "diag-summary",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
					className: errors.length ? "diag-error" : warnings.length ? "diag-warning" : "diag-ok",
					children: loading ? t("diagLoading") : errors.length || warnings.length ? t("diagIssues") : t("diagOk")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "lede",
					children: t("diagScopeShort")
				})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					disabled: loading,
					onClick: () => void load(),
					children: t("diagRefresh")
				})]
			}),
			errors.length || warnings.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FindingList, {
				items: [...errors, ...warnings],
				report,
				language
			}) : null,
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
				className: "diag-details",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("diagDetails") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "lede",
						children: t("runtimeScope")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "diag-grid",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("diagCatalogTitle") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: report.catalog.dataUrl }) }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
								t("updated"),
								": ",
								report.catalog.snapshotDate ?? "—",
								" · ",
								report.catalog.counts.total,
								" ",
								t("entries")
							] })
						] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("diagInventory") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
								t("profile"),
								": ",
								report.profile
							] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
								t("diagOfficial"),
								": ",
								report.inventory.official,
								" · ",
								t("diagCommunity"),
								": ",
								report.inventory.community,
								" · ",
								t("skillKind"),
								": ",
								report.inventory.skills
							] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
								t("enabled"),
								": ",
								report.inventory.enabled,
								" · ",
								t("disabled"),
								": ",
								report.inventory.disabled
							] })
						] })]
					}),
					infos.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "diag-section",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h3", { children: [
							diagnosticLabels(language).information,
							" (",
							infos.length,
							")"
						] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FindingList, {
							items: infos,
							report,
							language
						})]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "diag-section",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h3", { children: [
							t("diagBundles"),
							" (",
							report.bundles.length,
							")"
						] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "diag-list",
							children: report.bundles.map((item) => {
								const error$1 = presentDiagnosticBundleError(item, language);
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: item.name }),
									" · ",
									item.version ?? "—",
									" · ",
									item.enabled ? t("enabled") : t("disabled"),
									" ",
									item.runtime ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [" · ", t(`runtime_${item.runtime.state}`)] }) : null,
									error$1 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
										className: "diag-error",
										children: error$1.message
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TechnicalDetails, {
										text: error$1.technicalDetails,
										language
									})] }) : null
								] }, item.name);
							})
						})]
					}),
					report.skills.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "diag-section",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h3", { children: [
							t("diagSkills"),
							" (",
							report.skills.length,
							")"
						] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "diag-list",
							children: report.skills.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: item.name }),
								" · ",
								item.hasManifest ? "SKILL.md ✓" : "SKILL.md ✕"
							] }, item.name))
						})]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("diagPatch") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "diag-list",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: report.patch.path }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
								t("disabled"),
								": ",
								report.patch.disables.join(", ") || "—"
							] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
								t("diagOrphans"),
								": ",
								report.patch.orphans.join(", ") || "—"
							] })
						]
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "diag-export",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: loading,
								onClick: exportSummary,
								children: t("diagExport")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "lede",
								children: t("diagExportHint")
							}),
							exportError ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "error",
								role: "alert",
								children: t("diagExportFailed")
							}) : null
						]
					})
				]
			})
		]
	});
}

//#endregion
//#region src/client/install-batch-presentation.ts
function isInstallBatchComplete(batch) {
	return batch.completed === batch.total;
}

//#endregion
//#region src/shared/github-source.ts
const REPOSITORY = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/;
const PORTS = {
	"https:": "443",
	"http:": "80",
	"ssh:": "22",
	"git:": "9418"
};
function parseGitHubSource(value, purpose = "install") {
	if (typeof value !== "string") return null;
	let source = value.trim().replace(/^git\+/i, "");
	if (!source || source.length > 2048 || /[\\\s]/.test(source)) return null;
	let repository;
	let selector = "";
	if (/^github:/i.test(source) || REPOSITORY.test(source.split("#")[0].replace(/\.git$/i, ""))) {
		const parts = source.replace(/^github:/i, "").split("#");
		if (parts.length > 2) return null;
		repository = parts[0].replace(/\.git$/i, "");
		selector = parts[1] ?? "";
	} else {
		source = source.replace(/^git@github\.com:/i, "ssh://git@github.com/");
		let url;
		try {
			url = new URL(source);
		} catch {
			return null;
		}
		if (!Object.hasOwn(PORTS, url.protocol) || url.hostname.toLowerCase() !== "github.com") return null;
		if (url.port && url.port !== PORTS[url.protocol] || url.search || url.password) return null;
		if (url.username && !(url.protocol === "ssh:" && url.username === "git")) return null;
		if (source.replace(/^[^:]+:\/\/[^/]+/, "").split("#")[0].split("/").some((part) => part === "." || part === ".." || /%/i.test(part))) return null;
		const match = /^\/([^/]+)\/([^/]+?)(?:\.git)?(\/.*)?$/i.exec(url.pathname);
		if (!match) return null;
		if (purpose === "install" && match[3] && match[3] !== "/") return null;
		repository = `${match[1]}/${match[2]}`;
		selector = url.hash.slice(1);
	}
	if (!REPOSITORY.test(repository)) return null;
	if (purpose === "repository") return {
		repository: repository.toLowerCase(),
		ref: null,
		path: null
	};
	let ref = null;
	let path = null;
	for (const parameter$1 of selector ? selector.split("&") : []) if (parameter$1.startsWith("path:")) {
		if (path !== null) return null;
		path = parameter$1.slice(5).replace(/^\/+|\/+$/g, "");
		if (!path || !/^[A-Za-z0-9@._/-]+$/.test(path) || path.split("/").some((segment) => !segment || segment === "." || segment === "..")) return null;
	} else {
		if (ref !== null || !/^[A-Za-z0-9._~+/:=-]+$/.test(parameter$1)) return null;
		ref = parameter$1;
	}
	return {
		repository: repository.toLowerCase(),
		ref,
		path
	};
}
function githubInstallTarget(source) {
	const selector = [source.ref, source.path ? `path:/${source.path}` : null].filter(Boolean).join("&");
	return `github:${source.repository}${selector ? `#${selector}` : ""}`;
}

//#endregion
//#region src/shared/install-source.ts
/** Pure, allow-listed source recognition. Never execute README commands or forward their flags. */
const NPM_NAME = "(?:@[a-z0-9-~][a-z0-9-._~]*\\/)?[a-z0-9-~][a-z0-9-._~]*";
const NPM_SPEC_RE = new RegExp(`^(${NPM_NAME})(?:@([a-z0-9][a-z0-9._+-]*))?$`, "i");
const OWNER = "[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})";
const REPO = "(?!\\.{1,2}(?:$|[#/]))[A-Za-z0-9._-]{1,100}";
const REF = "[A-Za-z0-9._~+/:=-]+";
const FULL_NAME_RE = /* @__PURE__ */ new RegExp(`^${OWNER}/${REPO}$`);
const GITHUB_SPEC_RE = new RegExp(`^github:(${OWNER})/(${REPO})(?:#(${REF}))?$`, "i");
const UNSAFE = /[\s|&;<>()$`\\'"!*?]/;
function normalizeInstallTarget(value) {
	if (typeof value !== "string" || value.length > 2048) return null;
	let token = value.trim();
	if (token.startsWith("\"") && token.endsWith("\"") || token.startsWith("'") && token.endsWith("'")) token = token.slice(1, -1);
	if (!token || token.startsWith("-") || UNSAFE.test(token)) return null;
	const github = parseGitHubSource(token);
	if (github) return githubInstallTarget(github);
	if (token.startsWith("npm:")) token = token.slice(4);
	return !token.startsWith("-") && NPM_SPEC_RE.test(token) ? token : null;
}
/** A # inside a ref or a quoted token is not a shell comment. */
function stripInstallComment(command) {
	let quote = "";
	for (let i = 0; i < command.length; i++) {
		const char = command[i];
		if (char === quote) quote = "";
		else if (!quote && (char === "'" || char === "\"")) quote = char;
		else if (!quote && char === "#" && (i === 0 || /\s/.test(command[i - 1]))) return command.slice(0, i).trim();
	}
	return command.trim();
}
function commandTokens(value) {
	if (value.length > 8192 || /[\r\n]/.test(value)) return null;
	const command = stripInstallComment(value.trim().replace(/^[$>]\s+/, ""));
	const tokens = [];
	const pattern = /"([^"\r\n]*)"|'([^'\r\n]*)'|([^\s'"\r\n]+)/gy;
	let offset = 0;
	while (offset < command.length) {
		pattern.lastIndex = offset;
		const match = pattern.exec(command);
		if (!match) return null;
		const token = match[1] ?? match[2] ?? match[3];
		if (!token || UNSAFE.test(token)) return null;
		tokens.push(token);
		offset = pattern.lastIndex;
		if (offset < command.length && !/\s/.test(command[offset])) return null;
		while (/\s/.test(command[offset] ?? "") && offset < command.length) offset++;
	}
	return tokens;
}
function parseDshInstallCommandDetails(value) {
	if (typeof value !== "string") return null;
	const tokens = commandTokens(value);
	if (!tokens?.length) return null;
	let offset = 1;
	if (tokens[0] === "npx") {
		if (tokens[offset] === "--yes" || tokens[offset] === "-y") offset++;
		if (tokens[offset]?.match(NPM_SPEC_RE)?.[1] !== "@deepseek-ai/dsh") return null;
		offset++;
		if (tokens[offset] === "--") offset++;
	} else if (tokens[0] === "pnpm" || tokens[0] === "corepack") {
		if (tokens[0] === "corepack" && tokens[offset++] !== "pnpm") return null;
		if (tokens[offset] === "exec") offset++;
		if (tokens[offset++] !== "dsh") return null;
	} else if (tokens[0] !== "dsh") return null;
	const args = [];
	let profile = null;
	let registry = null;
	let saveExact = false;
	let workspace = false;
	let literal = false;
	for (; offset < tokens.length; offset++) {
		const token = tokens[offset];
		if (!literal && token === "--") {
			if (args.length !== 2 || args[0] !== "plugin" || args[1] !== "add") return null;
			literal = true;
		} else if (!literal && (token === "--profile" || token.startsWith("--profile="))) {
			const value$1 = token === "--profile" ? tokens[++offset] : token.slice(10);
			if (profile !== null || !value$1 || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value$1)) return null;
			profile = value$1;
		} else if (!literal && (token === "--save-exact" || token === "-w")) {
			if (args[0] !== "plugin" || args[1] !== "add") return null;
			if (token === "--save-exact") {
				if (saveExact) return null;
				saveExact = true;
			} else {
				if (workspace) return null;
				workspace = true;
			}
		} else if (!literal && (token === "--registry" || token.startsWith("--registry="))) {
			if (registry !== null || args[0] !== "plugin" || args[1] !== "add") return null;
			const value$1 = token === "--registry" ? tokens[++offset] : token.slice(11);
			if (!value$1) return null;
			try {
				const url = new URL(value$1);
				if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
				registry = url.href;
			} catch {
				return null;
			}
		} else args.push(token);
	}
	if (args.length !== 3 || args[0] !== "plugin" || args[1] !== "add") return null;
	const target = normalizeInstallTarget(args[2]);
	return target ? {
		target,
		profile,
		registry,
		saveExact,
		workspace
	} : null;
}
/** Public npm is supported; an explicit author Profile must match the requested destination. */
function isDshInstallCommandCompatible(command, options = {}) {
	return (command.profile === null || command.profile === (options.profile ?? "web")) && (command.registry === null || command.registry === "https://registry.npmjs.org/");
}
function resolveCatalogInstallTarget(entry, options = {}) {
	if (!FULL_NAME_RE.test(entry.fullName)) return null;
	const candidates = entry.install?.commands?.length ? [] : [normalizeInstallTarget(entry.installTarget)];
	const unsupported = [];
	for (const value of entry.install?.commands ?? []) {
		const command = parseDshInstallCommandDetails(value);
		if (command) (isDshInstallCommandCompatible(command, options) ? candidates : unsupported).push(command.target);
	}
	const packageName = entry.install?.packageName ?? entry.installPackageName;
	if (typeof packageName === "string") {
		const npm = candidates.find((target) => target?.match(NPM_SPEC_RE)?.[1].toLowerCase() === packageName.trim().toLowerCase());
		if (npm) return npm;
	}
	const github = candidates.find((target) => parseGitHubSource(target)?.repository === entry.fullName.toLowerCase());
	if (github) return github;
	if (unsupported.some((target) => parseGitHubSource(target)?.repository === entry.fullName.toLowerCase() || typeof packageName === "string" && target.match(NPM_SPEC_RE)?.[1].toLowerCase() === packageName.trim().toLowerCase())) return null;
	return entry.type?.toLowerCase() === "skill" ? `github:${entry.fullName}` : null;
}

//#endregion
//#region src/shared/install-assessment.ts
const SOURCE_ASSESSMENT_TTL_MS = 10080 * 60 * 1e3;
/** Bind evidence to source + selected subpackage, not merely the repository name. */
function installSourceKey(entry, profile = "web") {
	return JSON.stringify([
		entry.fullName.toLowerCase(),
		resolveCatalogInstallTarget(entry, { profile }),
		entry.install?.packageName ?? entry.installPackageName ?? null,
		entry.install?.repositoryPath ?? entry.installRepositoryPath ?? null
	]);
}
function catalogSourceStatus(entry, profile = "web", now = Date.now()) {
	if (!resolveCatalogInstallTarget(entry, { profile })) return "unidentified";
	const assessment = entry.install?.assessment ?? entry.installAssessment;
	if (!assessment || assessment.sourceKey !== installSourceKey(entry, profile)) return "identified";
	const checkedAt = Date.parse(assessment.checkedAt);
	if (!Number.isFinite(checkedAt) || checkedAt > now || now - checkedAt > SOURCE_ASSESSMENT_TTL_MS) return "stale";
	if (assessment.status === "verified" && (!assessment.resolvedTarget || !assessment.integrity)) return "identified";
	return [
		"verified",
		"invalid",
		"unavailable"
	].includes(assessment.status) ? assessment.status : "identified";
}
function discoveryNeedsReview(entry) {
	return (entry.install?.discovery ?? entry.discovery)?.status === "review-required";
}

//#endregion
//#region src/client/install-capability.ts
/** Explain the next user-visible step without conflating structure, trust, and installability. */
function presentInstallCapability(item) {
	if (item.installed) return {
		kind: "installed",
		labelKey: "capabilityInstalled",
		reasonKey: "capabilityInstalledReason"
	};
	if (discoveryNeedsReview(item)) return {
		kind: "browse",
		labelKey: "capabilityReview",
		reasonKey: "capabilityReviewReason"
	};
	const sourceStatus = catalogSourceStatus(item);
	if (sourceStatus === "invalid" || sourceStatus === "unavailable" || sourceStatus === "stale") return {
		kind: "manual",
		labelKey: `capabilitySource_${sourceStatus}`,
		reasonKey: `capabilitySource_${sourceStatus}Reason`
	};
	if (item.installable && item.install?.needsConfig) return {
		kind: "manual",
		labelKey: "capabilityManual",
		reasonKey: "capabilityManualReason"
	};
	if (sourceStatus === "verified") return {
		kind: "ready",
		labelKey: "capabilitySource_verified",
		reasonKey: "capabilitySource_verifiedReason"
	};
	if (item.installable) return {
		kind: "ready",
		labelKey: "capabilityReady",
		reasonKey: "capabilityReadyReason"
	};
	if (!item.evidence.compatible) return {
		kind: "browse",
		labelKey: "capabilityBrowse",
		reasonKey: "capabilityUnverifiedReason"
	};
	return {
		kind: "browse",
		labelKey: "capabilityUnavailable",
		reasonKey: "capabilityNoSourceReason"
	};
}

//#endregion
//#region src/client/install-review-presentation.ts
/** Scripts and ordinary restart guidance have their own always-visible compact rows. */
function visibleInstallReviewRisks(risks, scriptCount) {
	return risks.filter((risk) => {
		if (risk.code === "lifecycle-scripts" && scriptCount > 0) return false;
		if (risk.code === "restart-required" && risk.severity === "info") return false;
		return true;
	});
}

//#endregion
//#region src/client/install-presentation.ts
/** Status follows the operation, never the shared internal mutation phase. */
function taskPhaseKey(job) {
	const action = job.action ?? "install";
	if (job.activationState === "broken") return `task_${action}_failed`;
	if ([
		"installing",
		"installed",
		"failed",
		"cancelled"
	].includes(job.phase)) return `task_${action}_${job.phase}`;
	return `phase_${job.phase}`;
}
function taskProgressKey(jobs) {
	const actions = new Set(jobs.map((job) => job.action ?? "install"));
	return actions.size === 1 ? `task_${[...actions][0]}_progress` : "batchProgress";
}
function dependencyProgress(line) {
	if (!/\bProgress:/i.test(line)) return null;
	const result = {};
	for (const key of [
		"resolved",
		"reused",
		"downloaded",
		"added"
	]) {
		const value = new RegExp(`\\b${key}\\s+(\\d+)`, "i").exec(line)?.[1];
		if (value !== void 0) result[key] = Number(value);
	}
	return Object.keys(result).length ? result : null;
}
/** Terminal state takes precedence over stale package-manager output. */
function installStatus(job) {
	if ([
		"installed",
		"failed",
		"cancelled"
	].includes(job.phase)) return { key: taskPhaseKey(job) };
	if (/正在恢复/.test(job.lastLine)) return { key: "taskRecoveringDependencies" };
	if (/Will retry|retries? left|retrying/i.test(job.lastLine)) return { key: "taskNetworkRetry" };
	if (dependencyProgress(job.lastLine)) return { key: "taskDependencies" };
	if (/检查当前.*profile/i.test(job.lastLine)) return { key: "installStatusProfileCheck" };
	if (/验证安装后|验证更新后/i.test(job.lastLine)) return { key: "installStatusFinalCheck" };
	return { key: taskPhaseKey(job) };
}
function ignoredBuildPackages(raw) {
	return [...(/Ignored build scripts:\s*([\s\S]*?)(?:\s+Run\s+["']?pnpm approve-builds|$)/i.exec(raw)?.[1] ?? "").matchAll(/(?:@[a-z0-9._~-]+\/)?[a-z0-9._~-]+@[a-z0-9._~+-]+/gi)].map((match) => match[0]);
}
/** Turn raw pnpm/DSH output into an error category while preserving details. */
function presentInstallError(raw) {
	const detail = raw.trim() || "install failed";
	const code = /^\[([a-z-]+)\]/.exec(detail)?.[1];
	const kinds = {
		"ignored-builds": "ignored-builds",
		"peer-dependency": "peer",
		"host-peer": "peer",
		"prepare-failed": "build",
		"lifecycle-failed": "build",
		"release-age": "policy",
		"hoist-drift": "lockfile",
		"git-network": "network",
		"transient-network": "network",
		"fetch-timeout": "timeout",
		"install-timeout": "timeout"
	};
	if (code && kinds[code]) return {
		kind: kinds[code],
		packages: code === "ignored-builds" ? ignoredBuildPackages(detail) : [],
		detail
	};
	if (/ERR_PNPM_PEER_DEP_ISSUES/.test(detail)) return {
		kind: "peer",
		packages: [],
		detail
	};
	if (/ERR_PNPM_PREPARE_PACKAGE|ELIFECYCLE/.test(detail)) return {
		kind: "build",
		packages: [],
		detail
	};
	if (/ERR_PNPM_IGNORED_BUILDS|Ignored build scripts/i.test(detail)) return {
		kind: "ignored-builds",
		packages: ignoredBuildPackages(detail),
		detail
	};
	if (/ERR_PNPM_FETCH_5\d\d|ERR_PNPM_META_FETCH_FAIL|ECONNRESET|EAI_AGAIN|ENETUNREACH|socket hang up/i.test(detail)) return {
		kind: "network",
		packages: [],
		detail
	};
	if (/TimeoutError|UND_ERR_CONNECT_TIMEOUT|ETIMEDOUT|timed?\s*out|超时/i.test(detail)) return {
		kind: "timeout",
		packages: [],
		detail
	};
	if (/\bEACCES\b|\bEPERM\b|permission denied|权限/i.test(detail)) return {
		kind: "permission",
		packages: [],
		detail
	};
	if (/ERR_PNPM_(?:OUTDATED_)?LOCKFILE|frozen[- ]lockfile|lockfile.*(?:mismatch|broken|冲突)/i.test(detail)) return {
		kind: "lockfile",
		packages: [],
		detail
	};
	if (/配置验证|dsh\.profile|cordis\.patch|profile.*(?:invalid|problem|问题)/i.test(detail)) return {
		kind: "profile",
		packages: [],
		detail
	};
	if (/published catalog|trusted DSH install source|安装源|source verification/i.test(detail)) return {
		kind: "source",
		packages: [],
		detail
	};
	return {
		kind: "generic",
		packages: [],
		detail
	};
}

//#endregion
//#region src/client/TaskDetails.tsx
const ERROR_LOCALE_KEYS = {
	"ignored-builds": "ignoredBuilds",
	peer: "peer",
	build: "build",
	policy: "policy",
	network: "network",
	timeout: "timeout",
	permission: "permission",
	lockfile: "lockfile",
	profile: "profile",
	source: "source",
	generic: "generic"
};
const ROUTINE_COMPLETION_LINES = new Set([
	"已卸载，重启后确认运行状态",
	"卸载已完成，并清理了残留配置",
	"更新完成，已记录精确来源；重启后验证运行状态",
	"已写入且配置可组合；完成作者要求的配置并重启 DSH 后再验证",
	"已写入且配置可组合；重启 DSH 后再验证实际运行状态",
	"Skill 已复制并记录来源；完成作者要求的配置后，在后续 Agent 会话中验证可见性",
	"全局 Skill 已复制并记录来源；将在后续 Agent 会话中验证可见性"
]);
const normalizedText = (value) => value.replace(/[\s。.!！]+/g, "").toLowerCase();
function taskResultText(job, t, includeIdentity = true) {
	const parts = includeIdentity ? [`${job.fullName} · ${t(taskPhaseKey(job))}`] : [];
	if (job.phase === "installed" && job.activationState !== "broken") {
		if (job.activationState === "configuration-required") parts.push(t("taskCheckConfiguration"));
		if (!job.requiresRestart && job.action !== "uninstall" && job.activationState !== "configuration-required") parts.push(t(`activation_${job.activationState}`));
		if (job.requiresRestart) parts.push(t(job.action === "uninstall" ? "taskUninstallRestart" : job.action === "update" ? "taskUpdateRestart" : "taskInstallRestart"));
	}
	if (job.recovery) parts.push(t(job.recovery === "restored" ? "taskRestored" : "taskRecoveryFailed"));
	return parts.join(" ");
}
/** Shared by the task dialog and Installed page, including mutation failures. */
function TaskDetails({ job, t, headingPresent = false }) {
	const terminal = [
		"installed",
		"failed",
		"cancelled"
	].includes(job.phase);
	const counters = !terminal ? dependencyProgress(job.lastLine ?? "") : null;
	const error = job.phase === "failed" ? presentInstallError(job.error ?? job.lastLine) : null;
	const errorKey = error ? ERROR_LOCALE_KEYS[error.kind] : null;
	const statusKey = installStatus(job).key;
	const heading = headingPresent ? t(taskPhaseKey(job)) : "";
	const rawProgress = !terminal && !counters && job.lastLine && normalizedText(job.lastLine) !== normalizedText(heading) ? job.lastLine : "";
	const statusText = terminal ? taskResultText(job, t, !headingPresent) : rawProgress && statusKey !== "taskNetworkRetry" ? "" : normalizedText(t(statusKey)) === normalizedText(heading) ? "" : t(statusKey);
	const log = job.error || job.lastLine;
	const duplicateLog = job.phase === "installed" && job.activationState !== "broken" && !job.error && (ROUTINE_COMPLETION_LINES.has(log?.trim() ?? "") || normalizedText(log ?? "") === normalizedText(statusText));
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "task-details",
		children: [
			statusText ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "job-status",
				children: statusText
			}) : null,
			counters ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "job-status",
				children: [
					"resolved",
					"reused",
					"downloaded",
					"added"
				].filter((key) => counters[key] !== void 0).map((key) => `${t(`task${key[0].toUpperCase()}${key.slice(1)}`)} ${counters[key]}`).join(" · ")
			}) : null,
			rawProgress && normalizedText(rawProgress) !== normalizedText(statusText) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "job-status",
				style: { overflowWrap: "anywhere" },
				children: rawProgress
			}) : null,
			error && errorKey ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "job-error-message",
				role: "alert",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t(`installError_${errorKey}_title`) }),
					job.action === "uninstall" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t(`installError_${errorKey}_summary`) }),
					error.packages.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "job-error-packages",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("installErrorPackages") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: error.packages.join(", ") })]
					}) : null,
					job.profileDirectory ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "job-error-packages",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("taskProfileDirectory") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: job.profileDirectory })]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "job-error-hint",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("installErrorNext") }), t(`installError_${errorKey}_hint`)]
					}),
					error.kind === "ignored-builds" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
						href: "https://github.com/evaldock/dsh-top100/blob/main/docs/build-approval-recovery.md",
						target: "_blank",
						rel: "noopener noreferrer",
						children: t("buildRecoveryGuide")
					}) }) : null
				]
			}) : null,
			terminal && log && !duplicateLog ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
				className: "job-error-details",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("taskLogs") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", { children: log })]
			}) : null
		]
	});
}

//#endregion
//#region src/client/use-task-tracker.ts
const BATCH_KEY = "dsh-top100:last-install-batch:v1";
const RECENT_KEY = "dsh-top100:recent-install-batches:v1";
const COMPLETED_KEY = "dsh-top100:completed-install-batches:v1";
const PENDING_KEY = "dsh-top100:pending-submission:v1";
const SUBMIT_PATHS = new Set([
	"/dsh-top100/install-batch",
	"/dsh-top100/install",
	"/dsh-top100/manage",
	"/dsh-top100/retry"
]);
const subscribers = /* @__PURE__ */ new Set();
let pendingMemory = null;
let pendingStored = true;
const pendingControllers = /* @__PURE__ */ new Map();
function readStorage(key) {
	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
}
function writeStorage(key, value) {
	try {
		if (window.localStorage.getItem(key) === value) return;
		if (value === null) window.localStorage.removeItem(key);
		else window.localStorage.setItem(key, value);
	} catch {}
}
function pendingSubmission() {
	let raw;
	try {
		raw = window.localStorage.getItem(PENDING_KEY);
	} catch {
		return pendingMemory;
	}
	if (!raw) return pendingStored ? null : pendingMemory;
	try {
		const value = JSON.parse(raw);
		if (typeof value.id === "string" && /^[\w-]{1,128}$/.test(value.id) && SUBMIT_PATHS.has(value.url) && Number.isFinite(value.startedAt) && [
			"sending",
			"uncertain",
			"cancelling"
		].includes(value.state)) return value;
	} catch {}
	return pendingMemory;
}
function persistPending(value) {
	pendingMemory = value;
	try {
		if (value) window.localStorage.setItem(PENDING_KEY, JSON.stringify(value));
		else window.localStorage.removeItem(PENDING_KEY);
		pendingStored = true;
	} catch {
		pendingStored = false;
	}
}
function clearPending(id) {
	if (pendingSubmission()?.id === id) persistPending(null);
}
function recentIds() {
	try {
		const values = JSON.parse(readStorage(RECENT_KEY) ?? "[]");
		const ids = Array.isArray(values) ? values.filter((id) => typeof id === "string") : [];
		const last = readStorage(BATCH_KEY);
		return [...new Set([...last ? [last] : [], ...ids])].slice(0, 10);
	} catch {
		const last = readStorage(BATCH_KEY);
		return last ? [last] : [];
	}
}
function rememberBatches(batches) {
	if (!batches.length) return;
	writeStorage(RECENT_KEY, JSON.stringify([...new Set([...batches.map((batch) => batch.batchId), ...recentIds()])].slice(0, 10)));
	writeStorage(BATCH_KEY, batches[0].batchId);
	batches.forEach(rememberCompletion);
}
function completedIds() {
	try {
		const ids = JSON.parse(readStorage(COMPLETED_KEY) ?? "[]");
		return Array.isArray(ids) ? ids.filter((id) => typeof id === "string").slice(0, 10) : [];
	} catch {
		return [];
	}
}
function rememberCompletion(batch) {
	if (isInstallBatchComplete(batch)) writeStorage(COMPLETED_KEY, JSON.stringify([...new Set([batch.batchId, ...completedIds()])].slice(0, 10)));
}
function rememberBatch(batch) {
	rememberBatches([batch]);
}
function forgetBatch(id) {
	const ids = recentIds().filter((value) => value !== id);
	writeStorage(RECENT_KEY, JSON.stringify(ids));
	if (readStorage(BATCH_KEY) === id) writeStorage(BATCH_KEY, ids[0] ?? null);
	writeStorage(COMPLETED_KEY, JSON.stringify(completedIds().filter((value) => value !== id)));
}
var TaskHttpError = class extends Error {
	constructor(message, status) {
		super(message);
		this.status = status;
	}
};
async function readTask(url, init) {
	const response = await fetch(url, init);
	const body = await response.json();
	if (!response.ok) throw new TaskHttpError(body.error ?? `${response.status} ${response.statusText}`, response.status);
	return body;
}
function broadcast(batch, error) {
	if (batch) rememberBatch(batch);
	subscribers.forEach((accept) => accept(batch, error));
}
/** One owner above the settings sections, with a submission lock that survives remounts. */
function useTaskTracker() {
	const [state, setState] = (0, react.useState)(() => ({
		batch: null,
		busy: null,
		ready: false,
		recovered: false,
		error: null,
		pending: pendingSubmission(),
		history: []
	}));
	const stateRef = (0, react.useRef)(state);
	stateRef.current = state;
	const [recovery, setRecovery] = (0, react.useState)(0);
	const [cancelling, setCancelling] = (0, react.useState)([]);
	const generation = (0, react.useRef)(0);
	const mounted = (0, react.useRef)(false);
	const known = (0, react.useRef)(/* @__PURE__ */ new Map());
	const cancellationLocks = (0, react.useRef)(/* @__PURE__ */ new Set());
	const history = () => [...known.current.values()].filter(isInstallBatchComplete).sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
	(0, react.useEffect)(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			generation.current++;
		};
	}, []);
	const requestRecovery = (0, react.useCallback)((batch, error) => {
		generation.current++;
		if (batch) known.current.set(batch.batchId, batch);
		setState((previous) => ({
			...previous,
			batch: previous.batch ?? batch ?? null,
			ready: false,
			pending: pendingSubmission(),
			history: history(),
			error: error === void 0 ? previous.error : error
		}));
		setRecovery((value) => value + 1);
	}, []);
	(0, react.useEffect)(() => {
		subscribers.add(requestRecovery);
		return () => {
			subscribers.delete(requestRecovery);
		};
	}, [requestRecovery]);
	(0, react.useEffect)(() => {
		let timer;
		const recoverSoon = () => {
			if (timer !== void 0) return;
			timer = setTimeout(() => {
				timer = void 0;
				requestRecovery();
			}, 50);
		};
		const onStorage = (event) => {
			if (event.key === null || [
				PENDING_KEY,
				BATCH_KEY,
				RECENT_KEY
			].includes(event.key)) recoverSoon();
		};
		const onVisibility = () => {
			if (document.visibilityState === "visible") recoverSoon();
		};
		window.addEventListener("storage", onStorage);
		window.addEventListener("focus", recoverSoon);
		document.addEventListener("visibilitychange", onVisibility);
		return () => {
			window.removeEventListener("storage", onStorage);
			window.removeEventListener("focus", recoverSoon);
			document.removeEventListener("visibilitychange", onVisibility);
			if (timer !== void 0) clearTimeout(timer);
		};
	}, [requestRecovery]);
	const track = (0, react.useCallback)((batch) => {
		broadcast(batch);
	}, []);
	const retryTracking = (0, react.useCallback)(() => {
		requestRecovery(void 0, null);
	}, [requestRecovery]);
	const dismissNotice = (0, react.useCallback)(() => {
		setState((previous) => previous.error?.kind === "missing" ? {
			...previous,
			error: null
		} : previous);
	}, []);
	(0, react.useEffect)(() => {
		const controller = new AbortController();
		const epoch = generation.current;
		let disposed = false;
		let timer;
		const current = () => !disposed && !controller.signal.aborted && generation.current === epoch;
		(async () => {
			try {
				const pending = pendingSubmission();
				const status = await readTask(`/dsh-top100/status${pending ? `?submissionId=${encodeURIComponent(pending.id)}` : ""}`, {
					signal: controller.signal,
					cache: "no-store"
				});
				if (!current()) return;
				if (pending && (status.submission || status.submissionCancelled)) {
					clearPending(pending.id);
					if (status.submissionCancelled) pendingControllers.get(pending.id)?.abort();
				}
				if (status.submission) known.current.set(status.submission.batchId, status.submission);
				for (const batch of status.activeBatches) known.current.set(batch.batchId, batch);
				rememberBatches([...status.activeBatches, ...status.submission ? [status.submission] : []]);
				let missing = stateRef.current.error?.kind === "missing";
				for (const id of recentIds()) {
					if (status.activeBatches.some((batch) => batch.batchId === id) || known.current.get(id) && isInstallBatchComplete(known.current.get(id))) continue;
					try {
						const batch = await readTask(`/dsh-top100/install-jobs?batchId=${encodeURIComponent(id)}`, {
							signal: controller.signal,
							cache: "no-store"
						});
						if (!current()) return;
						if (batch.batchId !== id) throw new Error("Task response did not match the requested batch");
						known.current.set(id, batch);
						rememberCompletion(batch);
					} catch (cause) {
						if (!current()) return;
						if (cause instanceof TaskHttpError && cause.status === 404) {
							missing ||= !completedIds().includes(id);
							forgetBatch(id);
							known.current.delete(id);
						} else throw cause;
					}
				}
				if (!current()) return;
				const remainingPending = pendingSubmission();
				const active = status.activeBatches.find((batch) => batch.batchId === stateRef.current.busy) ?? status.activeBatches[0];
				const last = active ?? (readStorage(BATCH_KEY) ? known.current.get(readStorage(BATCH_KEY)) : null) ?? history()[0] ?? null;
				setState((previous) => ({
					batch: last,
					busy: active?.batchId ?? null,
					ready: !remainingPending,
					pending: remainingPending,
					recovered: true,
					history: history(),
					error: missing ? {
						kind: "missing",
						message: "Task record is no longer available"
					} : previous.error?.kind === "cancel" && !status.submissionCancelled || previous.error?.kind === "submission" && !status.submission ? previous.error : null
				}));
				if (remainingPending) timer = setTimeout(requestRecovery, 1500);
			} catch (cause) {
				if (!current()) return;
				setState((previous) => ({
					...previous,
					ready: false,
					pending: pendingSubmission(),
					error: {
						kind: "tracking",
						message: cause instanceof Error ? cause.message : String(cause)
					}
				}));
			}
		})();
		return () => {
			disposed = true;
			controller.abort();
			if (timer !== void 0) clearTimeout(timer);
		};
	}, [recovery, requestRecovery]);
	(0, react.useEffect)(() => {
		if (!state.busy || !state.ready) return;
		const batchId = state.busy;
		const epoch = generation.current;
		const controller = new AbortController();
		let disposed = false;
		let timer;
		const current = () => !disposed && !controller.signal.aborted && generation.current === epoch;
		const poll = async () => {
			let again = true;
			let delay = 800;
			try {
				const snapshot = await readTask(`/dsh-top100/install-jobs?batchId=${encodeURIComponent(batchId)}`, {
					signal: controller.signal,
					cache: "no-store"
				});
				if (!current()) return;
				if (snapshot.batchId !== batchId) throw new Error("Task response did not match the requested batch");
				known.current.set(batchId, snapshot);
				rememberCompletion(snapshot);
				if (isInstallBatchComplete(snapshot)) {
					again = false;
					setState((previous) => ({
						...previous,
						batch: snapshot,
						history: history()
					}));
					requestRecovery();
				} else setState((previous) => previous.busy !== batchId ? previous : {
					...previous,
					batch: snapshot,
					error: previous.error?.kind === "cancel" ? previous.error : null
				});
			} catch (cause) {
				if (!current()) return;
				delay = 2e3;
				if (cause instanceof TaskHttpError && cause.status === 404) {
					again = false;
					forgetBatch(batchId);
					known.current.delete(batchId);
					requestRecovery(void 0, {
						kind: "missing",
						message: "Task record is no longer available"
					});
				} else setState((previous) => ({
					...previous,
					error: {
						kind: "tracking",
						message: cause instanceof Error ? cause.message : String(cause)
					}
				}));
			} finally {
				if (current() && again) timer = setTimeout(() => {
					poll();
				}, delay);
			}
		};
		poll();
		return () => {
			disposed = true;
			controller.abort();
			if (timer !== void 0) clearTimeout(timer);
		};
	}, [
		state.busy,
		state.ready,
		recovery,
		requestRecovery
	]);
	const submit = (0, react.useCallback)(async (url, body) => {
		if (!SUBMIT_PATHS.has(url)) throw new Error("Unsupported submission endpoint");
		if (pendingSubmission() || !stateRef.current.ready || stateRef.current.busy) {
			requestRecovery();
			return null;
		}
		const pending = {
			id: crypto.randomUUID(),
			url,
			startedAt: Date.now(),
			state: "sending"
		};
		persistPending(pending);
		broadcast(void 0, null);
		const controller = new AbortController();
		pendingControllers.set(pending.id, controller);
		const timer = setTimeout(() => controller.abort(), 45e3);
		try {
			const snapshot = await readTask(url, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					...body,
					submissionId: pending.id
				}),
				signal: controller.signal
			});
			clearPending(pending.id);
			broadcast(snapshot);
			return snapshot;
		} catch (cause) {
			if (cause instanceof TaskHttpError && [
				400,
				403,
				404,
				409,
				422
			].includes(cause.status)) {
				if (pendingSubmission()?.id !== pending.id) return null;
				clearPending(pending.id);
				broadcast(void 0, {
					kind: "submission",
					message: cause.message
				});
				throw cause;
			}
			if (pendingSubmission()?.id === pending.id) {
				persistPending({
					...pendingSubmission(),
					state: pendingSubmission().state === "cancelling" ? "cancelling" : "uncertain"
				});
				broadcast(void 0, {
					kind: "submission",
					message: cause instanceof Error ? cause.message : String(cause)
				});
			}
			return null;
		} finally {
			clearTimeout(timer);
			pendingControllers.delete(pending.id);
		}
	}, [requestRecovery]);
	const cancelSubmission = (0, react.useCallback)(async () => {
		const pending = pendingSubmission();
		if (!pending || cancellationLocks.current.has(pending.id)) return;
		cancellationLocks.current.add(pending.id);
		persistPending({
			...pending,
			state: "cancelling"
		});
		broadcast();
		try {
			const result = await readTask("/dsh-top100/cancel-submission", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ submissionId: pending.id })
			});
			if (!result.cancelled) throw new Error("The host did not confirm cancellation of this submission");
			clearPending(pending.id);
			pendingControllers.get(pending.id)?.abort();
			broadcast(result.submission ?? void 0, null);
		} catch (cause) {
			broadcast(void 0, {
				kind: "cancel",
				message: cause instanceof Error ? cause.message : String(cause)
			});
		} finally {
			cancellationLocks.current.delete(pending.id);
		}
	}, []);
	const cancel = (0, react.useCallback)(async (jobId) => {
		if (cancellationLocks.current.has(jobId)) return;
		cancellationLocks.current.add(jobId);
		setCancelling((ids) => [...ids, jobId]);
		const epoch = generation.current;
		try {
			if (!(await readTask("/dsh-top100/cancel", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ jobId })
			})).cancelled) throw new Error("The host did not accept this cancellation request");
		} catch (cause) {
			if (mounted.current && epoch === generation.current) setState((previous) => ({
				...previous,
				error: {
					kind: "cancel",
					message: cause instanceof Error ? cause.message : String(cause)
				}
			}));
		} finally {
			cancellationLocks.current.delete(jobId);
			if (mounted.current) setCancelling((ids) => ids.filter((id) => id !== jobId));
		}
	}, []);
	return {
		...state,
		cancelling,
		track,
		submit,
		cancel,
		cancelSubmission,
		retryTracking,
		dismissNotice
	};
}

//#endregion
//#region src/client/TaskStatus.tsx
function TaskStatus({ tracking, t, onViewResult }) {
	const recent = tracking.history.flatMap((batch) => batch.jobs);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [tracking.pending ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "banner",
		role: "status",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t(tracking.pending.state === "sending" ? "submissionSending" : tracking.pending.state === "cancelling" ? "submissionCancelling" : "submissionUncertain") }),
			tracking.error ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
				className: "error",
				children: [
					tracking.error.kind === "cancel" ? t("cancelFailed") : t("taskTrackingError"),
					" ",
					tracking.error.message
				]
			}) : null,
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: tracking.retryTracking,
				children: t("querySubmission")
			}),
			" ",
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => void tracking.cancelSubmission(),
				children: t("cancelSubmission")
			})
		]
	}) : tracking.error?.kind === "missing" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "banner",
		role: "status",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("installTaskUnavailable") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
			type: "button",
			onClick: tracking.dismissNotice,
			children: t("dismissTaskNotice")
		})]
	}) : tracking.error ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "error",
		role: "alert",
		children: [
			t(tracking.error.kind === "cancel" ? "cancelFailed" : tracking.error.kind === "submission" ? "submissionRejected" : "taskTrackingError"),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: tracking.error.message }),
			" ",
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: tracking.retryTracking,
				children: t("retry")
			})
		]
	}) : !tracking.ready ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		className: "banner",
		role: "status",
		children: t("taskRecovering")
	}) : null, recent.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
		className: "banner task-history",
		open: true,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [
				t("recentTasks"),
				" (",
				recent.length,
				")"
			] }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "task-history-list",
				children: recent.map((job) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
					className: "task-history-item",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [
						job.fullName,
						" · ",
						t(taskPhaseKey(job))
					] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TaskDetails, {
						job,
						t,
						headingPresent: true
					})]
				}, job.id))
			}),
			onViewResult && tracking.batch && !tracking.busy && isInstallBatchComplete(tracking.batch) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: onViewResult,
				children: t("viewLatestTaskResult")
			}) : null
		]
	}) : null] });
}

//#endregion
//#region src/client/trust-presentation.ts
function presentInstallRisk(risk, t) {
	return {
		summary: t(`risk_${risk.code}_summary`),
		detail: risk.code === "lifecycle-scripts" ? risk.detail : t(`risk_${risk.code}_detail`)
	};
}

//#endregion
//#region src/client/use-dialog-focus.ts
/** Keep keyboard navigation in an open dialog, then return to its invoking control. */
function useDialogFocus(active, restoreTarget) {
	const dialog = (0, react.useRef)(null);
	const previous = (0, react.useRef)(null);
	const wasActive = (0, react.useRef)(false);
	if (active && !wasActive.current && typeof document !== "undefined") previous.current = restoreTarget ?? document.activeElement;
	wasActive.current = active;
	(0, react.useEffect)(() => {
		const root = dialog.current;
		if (!active || !root) return;
		const focusable = () => Array.from(root.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex]:not([tabindex=\"-1\"])")).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0 && !element.closest("[inert], [hidden]"));
		const focusFirst = () => (focusable()[0] ?? root).focus();
		const onFocus = (event) => {
			if (!root.contains(event.target)) focusFirst();
		};
		const onKey = (event) => {
			if (event.key !== "Tab") return;
			const targets = focusable();
			const first = targets[0];
			const last = targets.at(-1);
			if (!first || !last) {
				event.preventDefault();
				root.focus();
				return;
			}
			const current = document.activeElement;
			if (!root.contains(current) || event.shiftKey && current === first || !event.shiftKey && current === last) {
				event.preventDefault();
				(event.shiftKey ? last : first).focus();
			}
		};
		if (!root.contains(document.activeElement)) focusFirst();
		document.addEventListener("keydown", onKey, true);
		document.addEventListener("focusin", onFocus);
		return () => {
			document.removeEventListener("keydown", onKey, true);
			document.removeEventListener("focusin", onFocus);
			if (previous.current?.isConnected) previous.current.focus();
		};
	}, [active]);
	return dialog;
}

//#endregion
//#region src/client/UpdateCheckResults.tsx
function UpdateCheckResults({ issues, t }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: issues.map((issue) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
		issue.name,
		" · ",
		t(issue.status === "current" ? "noUpdateAvailable" : "updateCheckFailed"),
		t("descriptionLocale") === "en" ? ` · ${t(issue.status === "current" ? "updateIssueCurrent" : issue.code === "update-strategy-required" ? "updateIssueStrategy" : "updateIssueFailed")}` : ` · ${issue.message}`
	] }), t("descriptionLocale") === "en" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("updateCheckDetails") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: issue.message })] }) : null] }, issue.name)) });
}

//#endregion
//#region src/client/UpdateReview.tsx
function UpdateReview({ items, issues = [], strategy = "preserve", accepted, onAccepted, onCancel, onConfirm, t, restoreFocusTo }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		ref: useDialogFocus(true, restoreFocusTo),
		tabIndex: -1,
		className: "mask",
		role: "dialog",
		"aria-modal": "true",
		"aria-labelledby": "dsh-top100-update-title",
		onKeyDownCapture: (event) => {
			if (event.key === "Escape") {
				event.stopPropagation();
				onCancel();
			}
		},
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "dialog",
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
					className: "confirm-header",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							id: "dsh-top100-update-title",
							children: t("reviewUpdateTitle")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("reviewUpdateHint") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t(strategy === "latest" ? "updateLatestHint" : "updatePreserveHint") })
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "confirm-body",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "confirm-list",
						children: [issues.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [
							t("updateCheckResults"),
							" (",
							issues.length,
							")"
						] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UpdateCheckResults, {
							issues,
							t
						})] }) : null, items.map(({ name: name$1, currentVersion, preflight }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "confirm-item",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "confirm-project",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: name$1 }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
										t("version"),
										": ",
										currentVersion ?? "—",
										" → ",
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
											className: "confirm-target",
											children: preflight.provenance.resolvedTarget
										})
									] })]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
									t("updateTarget"),
									": ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: preflight.provenance.requestedTarget })
								] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
									className: "confirm-effects",
									"aria-label": t("installSummary"),
									children: [
										preflight.lifecycleScripts.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "confirm-scripts",
											"data-warning": "true",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("confirmScripts") }), preflight.lifecycleScripts.map((script) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: "script-evidence",
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: script.name }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														"aria-hidden": "true",
														children: "→"
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: script.command })
												]
											}, script.name))]
										}) : null,
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
											className: "risk-list",
											children: visibleInstallReviewRisks(preflight.risks, preflight.lifecycleScripts.length).map((risk) => {
												const presented = presentInstallRisk(risk, t);
												return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
													"data-severity": risk.severity,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: presented.summary }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: presented.detail })]
												}, risk.code);
											})
										}),
										preflight.risks.some((risk) => risk.code === "restart-required") ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: "confirm-followup",
											children: t("confirmRestart")
										}) : null
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
									className: "confirm-evidence",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("viewInstallTechnicalEvidence") }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t(preflight.provenance.source === "github" ? "commitLocked" : preflight.provenance.repositoryIdentity === "unavailable" ? "sourceIdentityUnavailable" : "sourceMatched") }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", { children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("requestedSource") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: preflight.provenance.requestedTarget }) })] }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("resolvedSource") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: preflight.provenance.resolvedTarget }) })] }),
											preflight.provenance.integrity ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("integrity") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: preflight.provenance.integrity }) })] }) : null
										] }),
										preflight.lifecycleScripts.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("noBuildScripts") }) : null
									]
								})
							]
						}, name$1))]
					})
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
					className: "confirm-footer",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "confirm-caveat",
							children: t("confirmSecurityNote")
						}),
						items.some((item) => item.preflight.requiresExplicitApproval) ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: "risk-approval",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: accepted,
								onChange: (event) => onAccepted(event.target.checked)
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("riskApproval") })]
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "confirm-actions",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								autoFocus: true,
								onClick: onCancel,
								children: t("cancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "primary",
								disabled: !accepted,
								onClick: onConfirm,
								children: t("confirmUpdate")
							})]
						})
					]
				})
			]
		})
	});
}

//#endregion
//#region src/host/semver.ts
/** Small semver helpers for peer-range diagnostics. */
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
function parseSemver(value) {
	const match = SEMVER_RE.exec(value.trim());
	if (!match) return null;
	if (match.slice(1, 4).some((part) => !Number.isSafeInteger(Number(part))) || match[4]?.split(".").some((part) => /^0\d+$/.test(part))) return null;
	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
		pre: match[4] ?? ""
	};
}

//#endregion
//#region src/shared/types.ts
const UPDATE_PREFLIGHT_GROUP_SIZE = 20;
const MAX_UPDATE_BATCH_SIZE = 200;

//#endregion
//#region src/client/update-batch.ts
/** Keep requests small while reviewing all successful targets together. No package operation runs here. */
async function prepareUpdateBatch(names, strategy, options) {
	const selected = [...new Set(names)];
	if (selected.length > MAX_UPDATE_BATCH_SIZE) throw new Error(`At most ${MAX_UPDATE_BATCH_SIZE} updates can be reviewed at once`);
	const items = [];
	const issues = [];
	if (selected.length === 0) return {
		items,
		issues
	};
	let sessionToken = null;
	async function sessionAction(action) {
		options.signal.throwIfAborted();
		const response = await fetch("/dsh-top100/update-preflight-session", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				action,
				...sessionToken ? { sessionToken } : {}
			}),
			signal: options.signal
		});
		const body = await response.json();
		if (!response.ok) throw Object.assign(new Error(body.error || `${response.status} ${response.statusText}`), { code: body.code });
		return body;
	}
	try {
		const started = await sessionAction("start");
		if (typeof started.sessionToken !== "string" || !started.sessionToken) throw new Error("updatePreflightIncomplete");
		sessionToken = started.sessionToken;
		for (let offset = 0; offset < selected.length; offset += UPDATE_PREFLIGHT_GROUP_SIZE) {
			options.signal.throwIfAborted();
			const group = selected.slice(offset, offset + UPDATE_PREFLIGHT_GROUP_SIZE);
			const response = await fetch("/dsh-top100/update-preflight", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					names: group,
					strategy,
					partial: true,
					sessionToken
				}),
				signal: options.signal
			});
			const body = await response.json();
			options.signal.throwIfAborted();
			if (!response.ok) throw Object.assign(new Error(body.error || `${response.status} ${response.statusText}`), { code: body.code });
			if (!Array.isArray(body.items) || body.issues !== void 0 && !Array.isArray(body.issues)) throw new Error("updatePreflightIncomplete");
			const byName = new Map(body.items.map((item) => [item.name, item]));
			const failures = body.issues ?? [];
			const accounted = [...body.items.map((item) => item.name), ...failures.map((issue) => issue.name)];
			if (accounted.length !== group.length || new Set(accounted).size !== group.length || accounted.some((name$1) => !group.includes(name$1)) || body.items.some((item) => item.preflight?.kind !== "bundle" || !item.preflight.approvalToken || !item.preflight.provenance?.resolvedTarget) || failures.some((issue) => !["current", "failed"].includes(issue.status) || typeof issue.message !== "string")) throw new Error("updatePreflightIncomplete");
			items.push(...group.flatMap((name$1) => byName.has(name$1) ? [byName.get(name$1)] : []));
			issues.push(...failures);
			options.onProgress?.(offset + group.length, selected.length);
		}
		const finalized = await sessionAction("finalize");
		options.signal.throwIfAborted();
		const drafts = new Map(items.map((item) => [item.name, item]));
		if (!Array.isArray(finalized.items) || finalized.items.length !== items.length || new Set(finalized.items.map((item) => item.name)).size !== items.length || finalized.items.some((item) => {
			const draft = drafts.get(item.name);
			return !draft || !item.preflight?.approvalToken || !Number.isFinite(item.preflight.expiresAt) || item.preflight.expiresAt <= Date.now() || item.preflight.provenance?.resolvedTarget !== draft.preflight.provenance.resolvedTarget || item.preflight.provenance?.requestedTarget !== draft.preflight.provenance.requestedTarget;
		})) throw new Error("updatePreflightIncomplete");
		sessionToken = null;
		const ready = new Map(finalized.items.map((item) => [item.name, item]));
		return {
			items: items.map((item) => ready.get(item.name)),
			issues
		};
	} finally {
		if (sessionToken) fetch("/dsh-top100/update-preflight-session", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				action: "cancel",
				sessionToken
			}),
			keepalive: true
		}).catch(() => {});
	}
}

//#endregion
//#region src/client/SkillBackupList.tsx
function SkillBackupList({ jobs, t }) {
	const backups = jobs.flatMap((job) => job.skillBackups ?? []);
	if (!backups.length) return null;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "banner",
		role: "status",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("skillBackupSaved") }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("skillBackupSavedHint") }),
			backups.map((backup) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
				backup.name,
				" · ",
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: backup.path })
			] }, backup.path))
		]
	});
}

//#endregion
//#region src/client/ManagedPage.tsx
function Chevron() {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
		className: "managed-chevron",
		viewBox: "0 0 16 16",
		"aria-hidden": "true",
		focusable: "false",
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m5.5 3.5 4.5 4.5-4.5 4.5" })
	});
}
async function readJson$1(url, init) {
	const response = await fetch(url, init);
	const body = await response.json();
	if (!response.ok) throw Object.assign(new Error(body.error || `${response.status} ${response.statusText}`), { code: body.code });
	return body;
}
function ManagedPage({ t, tracking, retryUpdate, onRetryConsumed, initialQuery = "", onBrowseSkills }) {
	const [draft, setDraft] = (0, react.useState)(initialQuery);
	const [optionsOpen, setOptionsOpen] = (0, react.useState)(false);
	const [query, setQuery] = (0, react.useState)(initialQuery);
	const [data, setData] = (0, react.useState)(null);
	const [error, setError] = (0, react.useState)(null);
	const [loading, setLoading] = (0, react.useState)(true);
	const { batch, busy } = tracking;
	const completedBatch = (0, react.useRef)(null);
	const consumedRetry = (0, react.useRef)(null);
	const [notice, setNotice] = (0, react.useState)(null);
	const loadSequence = (0, react.useRef)(0);
	const updateRequest = (0, react.useRef)(new LatestRequest());
	const [preparing, setPreparing] = (0, react.useState)(false);
	const [submitting, setSubmitting] = (0, react.useState)(false);
	const [review, setReview] = (0, react.useState)(null);
	const [accepted, setAccepted] = (0, react.useState)(false);
	const [retryNames, setRetryNames] = (0, react.useState)(null);
	const [updateStrategy, setUpdateStrategy] = (0, react.useState)("preserve");
	const [issues, setIssues] = (0, react.useState)([]);
	const [checkedCount, setCheckedCount] = (0, react.useState)(0);
	const [checkingTotal, setCheckingTotal] = (0, react.useState)(0);
	const [migrating, setMigrating] = (0, react.useState)(false);
	const migrationLock = (0, react.useRef)(false);
	const submissionLock = (0, react.useRef)(false);
	const updateInvoker = (0, react.useRef)(null);
	(0, react.useEffect)(() => () => updateRequest.current.cancel(), []);
	const load = (0, react.useCallback)(async (refreshUpdates = false) => {
		const requestId = ++loadSequence.current;
		setLoading(true);
		setError(null);
		try {
			const payload = await readJson$1(`/dsh-top100/managed?q=${encodeURIComponent(query)}${refreshUpdates ? "&refresh=1" : ""}`);
			if (requestId === loadSequence.current) setData(payload);
		} catch (cause) {
			if (requestId === loadSequence.current) {
				setRetryNames(null);
				setError(cause instanceof Error ? cause.message : String(cause));
			}
		} finally {
			if (requestId === loadSequence.current) setLoading(false);
		}
	}, [query]);
	(0, react.useEffect)(() => {
		load();
	}, [load]);
	(0, react.useEffect)(() => {
		if (!batch || busy || batch.completed !== batch.total || completedBatch.current === batch.batchId) return;
		completedBatch.current = batch.batchId;
		load();
	}, [
		batch,
		busy,
		load,
		t
	]);
	(0, react.useEffect)(() => {
		if (!retryUpdate || consumedRetry.current === retryUpdate.id || busy || !tracking.ready) return;
		consumedRetry.current = retryUpdate.id;
		prepareUpdates(retryUpdate.names);
		onRetryConsumed?.();
	}, [
		retryUpdate,
		busy,
		tracking.ready,
		onRetryConsumed
	]);
	const jobByName = (0, react.useMemo)(() => new Map((batch?.jobs ?? []).map((job) => [job.fullName, job])), [batch]);
	async function manage(action, names, kind) {
		if (!window.confirm(t(kind === "skill" ? "confirmRemoveSkill" : "confirmRemovePlugin"))) return;
		setError(null);
		setRetryNames(null);
		setNotice(null);
		try {
			await tracking.submit("/dsh-top100/manage", {
				action,
				names,
				kind
			});
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	}
	async function prepareUpdates(names) {
		if (!names.length || submitting || busy || !tracking.ready) return;
		updateInvoker.current = document.activeElement;
		const requestedNames = [...new Set(names)].slice(0, MAX_UPDATE_BATCH_SIZE);
		const request = updateRequest.current.start();
		setPreparing(true);
		setReview(null);
		setIssues([]);
		setCheckedCount(0);
		setCheckingTotal(requestedNames.length);
		setAccepted(false);
		setRetryNames(null);
		setError(null);
		setNotice(null);
		try {
			const response = await prepareUpdateBatch(requestedNames, updateStrategy, {
				signal: request.signal,
				onProgress: (checked) => {
					if (request.isCurrent()) setCheckedCount(checked);
				}
			});
			if (!request.isCurrent()) return;
			setIssues(response.issues);
			setReview(response.items.length ? response.items : null);
			setAccepted(!response.items.some((item) => item.preflight.requiresExplicitApproval));
			if (!response.items.length) setNotice(t("noUpdatesPrepared"));
			if (response.issues.some((issue) => issue.status === "current")) load(true);
		} catch (cause) {
			if (!request.isCurrent()) return;
			if (cause instanceof Error && "code" in cause && cause.code === "no-update") {
				setNotice(cause.message);
				load(true);
				return;
			}
			setRetryNames(requestedNames);
			setError(cause instanceof Error ? cause.message === "updatePreflightIncomplete" ? t(cause.message) : cause.message : String(cause));
		} finally {
			if (request.isCurrent()) setPreparing(false);
		}
	}
	function cancelUpdateReview() {
		updateRequest.current.cancel();
		setPreparing(false);
		setReview(null);
		setRetryNames(null);
		setAccepted(false);
		setIssues([]);
		setNotice(t("updatePreflightCancelled"));
	}
	async function confirmUpdates() {
		if (!review?.length || !accepted || submissionLock.current) return;
		const approved = review;
		submissionLock.current = true;
		setSubmitting(true);
		setReview(null);
		setError(null);
		setNotice(null);
		try {
			await tracking.submit("/dsh-top100/manage", {
				action: "update",
				kind: "bundle",
				names: approved.map((item) => item.name),
				approvals: approved.map((item) => ({
					name: item.name,
					approvalToken: item.preflight.approvalToken,
					risksAccepted: item.preflight.requiresExplicitApproval ? accepted : true
				}))
			});
		} catch (cause) {
			setRetryNames(approved.map((item) => item.name));
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			submissionLock.current = false;
			setSubmitting(false);
		}
	}
	async function toggle(item) {
		setRetryNames(null);
		try {
			await readJson$1("/dsh-top100/toggle", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: item.name,
					enabled: !item.enabled
				})
			});
			setNotice(t("restart"));
			await load();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	}
	async function migrateSources() {
		if (migrationLock.current || busy || !tracking.ready) return;
		migrationLock.current = true;
		setMigrating(true);
		setError(null);
		setNotice(null);
		try {
			const preflight = await readJson$1("/dsh-top100/source-migration", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ action: "preflight" })
			});
			if (preflight.items.length === 0) {
				await load(true);
				return;
			}
			const changes = preflight.items.map((item) => `${item.name}: ${item.from} → ${item.version}`).join("\n");
			if (!window.confirm(`${t("sourceMigrationConfirm")}\n\n${changes}`)) return;
			await readJson$1("/dsh-top100/source-migration", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					action: "apply",
					approvalToken: preflight.approvalToken
				})
			});
			await load(true);
			setNotice(t("sourceMigrationComplete"));
		} catch (cause) {
			await load(true);
			setError(`${t("sourceMigrationFailed")} ${cause instanceof Error ? cause.message : String(cause)}`);
		} finally {
			migrationLock.current = false;
			setMigrating(false);
		}
	}
	const operationBlocked = !tracking.ready || busy !== null || preparing || submitting || migrating || review !== null;
	const hasUpdateSettings = data?.items.some((item) => item.kind === "bundle" && !item.protected && !item.local) ?? false;
	const updates = data?.items.filter((item) => item.kind === "bundle" && !item.protected && !item.local && (updateStrategy === "latest" || item.updateAvailable || !item.latest)) ?? [];
	function descriptionFor$1(item) {
		if (item.name === "@dsheval/dsh-top100-plugin") return t("managedSelfDescription");
		if (t("descriptionLocale") === "en") return item.description.trim() || `${t(item.kind === "skill" ? "installedSkillFallback" : "installedPluginFallback")}: ${item.name}.`;
		const supplied = item.descriptionZh.trim();
		if (supplied) return supplied;
		return item.kind === "skill" ? `${t("installedSkillFallback")}：${item.name}。${t("noChineseDescription")}。` : `${t("installedPluginFallback")}：${item.name}。${t("noChineseDescription")}。`;
	}
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "managed-page",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "toolbar",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						type: "search",
						"aria-label": t("searchInstalled"),
						value: draft,
						placeholder: t("searchInstalled"),
						onChange: (event) => setDraft(event.target.value),
						onKeyDown: (event) => {
							if (event.key === "Enter") setQuery(draft.trim());
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "primary",
						onClick: () => setQuery(draft.trim()),
						children: t("search")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						disabled: loading || operationBlocked,
						onClick: () => void load(true),
						children: t("refreshInstalled")
					}),
					updates.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						disabled: operationBlocked || data?.sourceMigrationRequired === true,
						onClick: () => void prepareUpdates(updates.map((item) => item.name)),
						children: t("updateAll")
					}) : null
				]
			}),
			data?.sourceMigrationRequired ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "banner",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("sourceMigrationTitle") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("sourceMigrationHint") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						disabled: operationBlocked,
						onClick: () => void migrateSources(),
						children: t(migrating ? "sourceMigrationWorking" : "sourceMigrationAction")
					})
				]
			}) : null,
			updates.length > MAX_UPDATE_BATCH_SIZE ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
				className: "banner",
				children: [
					t("updateBatchLimit"),
					" ",
					MAX_UPDATE_BATCH_SIZE,
					" / ",
					updates.length
				]
			}) : null,
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "managed-context",
				children: [
					data ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "lede",
						children: [
							data.total,
							" ",
							t("managedItems")
						]
					}) : null,
					hasUpdateSettings ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "manage-options-trigger",
						"aria-expanded": optionsOpen,
						"aria-controls": "dsh-top100-management-options",
						onClick: () => setOptionsOpen((open) => !open),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Chevron, {}), t("manageOptions")]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						id: "dsh-top100-management-options",
						className: "manage-options-content",
						hidden: !optionsOpen || !hasUpdateSettings,
						children: data?.items.some((item) => item.kind === "bundle" && !item.protected && !item.local) ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "managed-setting",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "managed-strategies",
								role: "group",
								"aria-label": t("updateStrategy"),
								children: ["preserve", "latest"].map((strategy) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									"aria-pressed": updateStrategy === strategy,
									disabled: operationBlocked,
									onClick: () => {
										setUpdateStrategy(strategy);
										setIssues([]);
										setNotice(null);
									},
									children: t(strategy === "preserve" ? "updatePreserve" : "updateLatest")
								}, strategy))
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "lede",
								children: t(updateStrategy === "latest" ? "managedLatestHint" : "managedPreserveHint")
							})]
						}) : null
					})
				]
			}),
			notice ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "banner",
				style: { whiteSpace: "pre-line" },
				children: notice
			}) : null,
			batch ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillBackupList, {
				jobs: batch.jobs,
				t
			}) : null,
			error ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "error",
				children: [
					error,
					" ",
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						disabled: operationBlocked,
						onClick: () => void (retryNames ? prepareUpdates(retryNames) : load(true)),
						children: t(retryNames ? "retry" : "refreshInstalled")
					})
				]
			}) : null,
			issues.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "banner",
				role: "status",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("updateCheckResults") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UpdateCheckResults, {
						issues,
						t
					}),
					issues.some((issue) => issue.status === "failed") ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						disabled: operationBlocked,
						onClick: () => void prepareUpdates(issues.filter((issue) => issue.status === "failed").map((issue) => issue.name)),
						children: t("retryFailedChecks")
					}) : null
				]
			}) : null,
			preparing ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "install-activity-banner is-active",
				role: "status",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [
					t("preflighting"),
					" ",
					checkedCount,
					"/",
					checkingTotal
				] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("updatePreflightWait") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: cancelUpdateReview,
					children: t("cancel")
				})]
			}) : null,
			submitting ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "banner",
				role: "status",
				children: t("updateSubmitting")
			}) : null,
			review ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UpdateReview, {
				items: review,
				issues,
				strategy: updateStrategy,
				accepted,
				onAccepted: setAccepted,
				onCancel: cancelUpdateReview,
				onConfirm: () => void confirmUpdates(),
				t,
				restoreFocusTo: updateInvoker.current
			}) : null,
			busy && batch ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "banner",
				role: "status",
				children: [
					t(taskProgressKey(batch.jobs)),
					" ",
					batch.completed,
					"/",
					batch.total,
					batch.jobs.filter((job) => ![
						"installed",
						"failed",
						"cancelled"
					].includes(job.phase)).map((job) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
							job.fullName,
							" · ",
							t(taskPhaseKey(job))
						] }),
						" ",
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							disabled: job.cancelRequested || tracking.cancelling.includes(job.id),
							onClick: () => void tracking.cancel(job.id),
							children: t("cancel")
						})
					] }, job.id))
				]
			}) : null,
			loading && !data && !error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "banner",
				role: "status",
				children: t("loadingInstalled")
			}) : null,
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "list managed-list",
				children: [(data?.items ?? []).map((item) => {
					const job = jobByName.get(item.name);
					const shortName = item.name.replace(/^@[^/]+\//, "");
					const displayName = item.name === "@dsheval/dsh-top100-plugin" ? "dsh-top100" : data?.items.some((other) => other.name !== item.name && other.name.replace(/^@[^/]+\//, "") === shortName) ? item.name : shortName;
					const versionsKnown = Boolean(item.version && item.latest && parseSemver(item.version.replace(/^v/, "")) && parseSemver(item.latest.replace(/^v/, "")));
					const noUpdate = updateStrategy === "preserve" && versionsKnown && !item.updateAvailable;
					return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("article", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
						className: "managed-details",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "managed-title",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: `dot ${item.kind === "skill" ? "off" : item.activationState === "live" ? "live" : item.activationState === "broken" ? "broken" : item.activationState === "restart-required" ? "pending" : "off"}`,
									"aria-hidden": "true"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									title: item.name,
									children: displayName
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "managed-disclosure",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(item.protected ? "viewDetails" : "manage") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Chevron, {})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "facts",
								children: [
									item.kind === "skill" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "badge",
										children: t("skillKind")
									}) : null,
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: `badge activation-${item.activationState}`,
										title: t("runtimeScope"),
										children: t(item.kind === "skill" ? "installed" : item.runtime ? `runtime_${item.runtime.state}` : `activation_${item.activationState}`)
									}),
									item.version ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
										t("version"),
										": ",
										item.version
									] }) : null,
									item.updateAvailable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "badge warn",
										children: t("updateAvailable")
									}) : null,
									item.updateError ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "badge warn",
										children: t("updateStatus_failed")
									}) : null
								]
							})
						] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "managed-body",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "desc",
									children: descriptionFor$1(item)
								}),
								item.updateAvailable && item.latest ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
									className: "lede",
									children: [
										t("updateAvailable"),
										": ",
										item.latest
									]
								}) : null,
								item.updateError ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("updateCheckDetails") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "lede",
									children: item.updateError
								})] }) : null,
								item.kind === "skill" && item.modificationState ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "lede",
									children: t(`skillModification_${item.modificationState}`)
								}) : null,
								item.runtime?.missingServices?.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("runtimeDetails") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: item.runtime.missingServices.join(", ") })] }) : null,
								item.kind === "bundle" && (item.protected || item.local) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "lede",
									children: t(item.protected ? "protectedManageHint" : "localManageHint")
								}) : null,
								item.kind === "skill" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "lede",
									children: t("skillReinstallHint")
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "managed-footer",
									children: [!item.protected || job ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "actions row-actions",
										children: [
											job ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: "job",
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TaskDetails, {
													job,
													t
												})
											}) : null,
											job?.action === "update" && (job.phase === "failed" || job.phase === "cancelled") ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												disabled: item.protected || item.local || operationBlocked,
												onClick: () => void prepareUpdates([item.name]),
												children: t("retry")
											}) : null,
											item.kind === "bundle" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												disabled: item.protected || operationBlocked,
												onClick: () => void toggle(item),
												children: item.enabled ? t("disable") : t("enable")
											}) : null,
											item.kind === "bundle" && !item.local && !noUpdate ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												disabled: item.protected || operationBlocked || data?.sourceMigrationRequired === true,
												onClick: () => void prepareUpdates([item.name]),
												children: t(item.updateAvailable ? "update" : "checkUpdates")
											}) : null,
											item.kind === "skill" && onBrowseSkills ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												disabled: operationBlocked,
												onClick: onBrowseSkills,
												children: t("browseSkillUpdates")
											}) : null,
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: "danger",
												disabled: item.protected || operationBlocked || item.kind === "bundle" && data?.sourceMigrationRequired === true,
												onClick: () => void manage("uninstall", [item.name], item.kind),
												children: t("uninstall")
											})
										]
									}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "managed-links",
										children: [item.url ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
											href: item.url,
											target: "_blank",
											rel: "noreferrer",
											children: [t("viewProject"), " ↗"]
										}) : null, item.protected ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
											href: "https://www.evaldock.ai/top100/?page=dsh#dsh",
											target: "_blank",
											rel: "noreferrer",
											children: [t("maintenanceGuide"), " ↗"]
										}) : null]
									})]
								})
							]
						})]
					}) }, `${item.kind}-${item.name}`);
				}), !loading && data?.items.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "lede",
					children: t("emptyInstalled")
				}) : null]
			})
		]
	});
}

//#endregion
//#region src/client/pagination.ts
/** Keep paginated rows from two independently published catalog snapshots from being mixed. */
function shouldRestartPagination(append, currentGeneratedAt, incomingGeneratedAt) {
	return append && currentGeneratedAt !== null && currentGeneratedAt !== incomingGeneratedAt;
}

//#endregion
//#region src/client/repository-identity.ts
function presentRepositoryIdentity(entry) {
	const path = entry.fullName.split("/").map((part) => part.trim()).filter(Boolean);
	const repositoryName = path.at(-1) || entry.name.trim() || entry.fullName;
	const sourceName = entry.name.trim();
	const nameRepeatsFullPath = sourceName.toLocaleLowerCase() === entry.fullName.trim().toLocaleLowerCase();
	return {
		name: !sourceName || nameRepeatsFullPath ? repositoryName : sourceName,
		owner: entry.owner.trim() || path[0] || ""
	};
}

//#endregion
//#region src/client/data-freshness.ts
const STALE_AFTER_MS = 2160 * 60 * 1e3;
const DAY_MS = 1440 * 60 * 1e3;
function snapshotDay(value) {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const utc = Date.parse(`${value}T00:00:00Z`);
	if (!Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 10) !== value) return null;
	return {
		label: value,
		start: utc - 480 * 60 * 1e3
	};
}
function staleSnapshotLabel(metadata, now = Date.now()) {
	if (!metadata || !Number.isFinite(now)) return null;
	const value = metadata.generatedAt;
	const generated = typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && snapshotDay(value.slice(0, 10)) ? Date.parse(value) : NaN;
	const day = snapshotDay(metadata.snapshotDate);
	const validDay = day && day.start <= now ? day : null;
	const candidates = [];
	if (Number.isFinite(generated) && generated <= now) candidates.push(generated);
	if (validDay) candidates.push(validDay.start + DAY_MS);
	if (!candidates.length || now - Math.min(...candidates) <= STALE_AFTER_MS) return null;
	return validDay?.label ?? new Intl.DateTimeFormat("sv-SE", {
		timeZone: "Asia/Shanghai",
		year: "numeric",
		month: "2-digit",
		day: "2-digit"
	}).format(new Date(generated));
}

//#endregion
//#region src/client/RankingsPage.tsx
const SORT_VIEWS = [
	"hot",
	"rising",
	"total"
];
const EVALDOCK_SITE = "https://www.evaldock.ai/top100/";
const GITHUB_ICON = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
	viewBox: "0 0 24 24",
	"aria-hidden": "true",
	focusable: "false",
	children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 .7a11.3 11.3 0 0 0-3.6 22c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.9 1.2 1.9 1.2 1.1 1.9 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6a4.7 4.7 0 0 1 1.2-3.1c-.1-.3-.5-1.6.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.5.2 2.8.1 3.1a4.7 4.7 0 0 1 1.2 3.1c0 4.7-2.8 5.7-5.5 6 .4.4.8 1.1.8 2.2v3.2c0 .4.2.7.8.6A11.3 11.3 0 0 0 12 .7Z" })
});
function RankTrustMark() {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
		viewBox: "0 0 48 48",
		"aria-hidden": "true",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("g", {
			className: "rank-mark-list",
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "11",
					cy: "14",
					r: "2"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M17 14h17" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "11",
					cy: "23",
					r: "2"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M17 23h12" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "11",
					cy: "32",
					r: "2"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M17 32h7" })
			]
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
			className: "rank-mark-check",
			d: "m28.5 30.5 3.5 3.5 7-9"
		})]
	});
}
function CategoryGlyph({ id }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
		viewBox: "0 0 24 24",
		"aria-hidden": "true",
		children: [
			id === "ai" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m12 3 1.35 4.15L17.5 8.5l-4.15 1.35L12 14l-1.35-4.15L6.5 8.5l4.15-1.35L12 3Z" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m18.5 14 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" })] }) : null,
			id === "appearance" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
					x: "4",
					y: "4",
					width: "6",
					height: "6",
					rx: "1"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
					x: "14",
					y: "4",
					width: "6",
					height: "6",
					rx: "1"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
					x: "4",
					y: "14",
					width: "6",
					height: "6",
					rx: "1"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
					x: "14",
					y: "14",
					width: "6",
					height: "6",
					rx: "1"
				})
			] }) : null,
			id === "coding" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m8.5 7-5 5 5 5M15.5 7l5 5-5 5M13.5 4l-3 16" }) }) : null,
			id === "knowledge" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4 5.5A3.5 3.5 0 0 1 7.5 2H11v17H7.5A3.5 3.5 0 0 0 4 22V5.5ZM20 5.5A3.5 3.5 0 0 0 16.5 2H13v17h3.5A3.5 3.5 0 0 1 20 22V5.5Z" }) }) : null,
			id === "tools" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.4 2.4-3-3 2.4-2.4Z" }) }) : null,
			id === "security" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 3 20 6v5c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10V6l8-3Z" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m9 12 2 2 4-4" })] }) : null,
			id === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4 5h16M4 12h16M4 19h16" }) : null
		]
	});
}
function ChevronDown() {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
		viewBox: "0 0 20 20",
		"aria-hidden": "true",
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m5.5 7.5 4.5 4.5 4.5-4.5" })
	});
}
function rankingBasisKey(view, query) {
	return query ? "basis_search" : `basis_${view}`;
}
function rankingBasisShortKey(view, query) {
	return query ? "basisShort_search" : `basisShort_${view}`;
}
const SKELETON_CARDS = Array.from({ length: 6 }, (_, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
	className: "card-skeleton",
	"aria-hidden": "true",
	children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "skeleton-rank" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "skeleton-line skeleton-title" }),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "skeleton-line" }),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "skeleton-line skeleton-short" }),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "skeleton-pills" })
	] })]
}, index));
var HttpError = class extends Error {
	constructor(message, status, code) {
		super(message);
		this.status = status;
		this.code = code;
	}
};
async function readJson(url, init) {
	const response = await fetch(url, init);
	const body = await response.json();
	if (!response.ok) throw new HttpError(body.error || body.message || `${response.status} ${response.statusText}`, response.status, body.code);
	return body;
}
function RankingsPage({ t }) {
	const [section, setSection] = (0, react.useState)("rankings");
	const [view, setView] = (0, react.useState)("hot");
	const [category, setCategory] = (0, react.useState)(null);
	const [query, setQuery] = (0, react.useState)("");
	const [draft, setDraft] = (0, react.useState)("");
	const [catalogScope, setCatalogScope] = (0, react.useState)("plugins");
	const [installAvailability, setInstallAvailability] = (0, react.useState)("all");
	const [categoryMenuOpen, setCategoryMenuOpen] = (0, react.useState)(false);
	const [data, setData] = (0, react.useState)(null);
	const [now, setNow] = (0, react.useState)(Date.now);
	(0, react.useEffect)(() => {
		const refresh = () => setNow(Date.now());
		const timer = setInterval(refresh, 6e4);
		document.addEventListener("visibilitychange", refresh);
		return () => {
			clearInterval(timer);
			document.removeEventListener("visibilitychange", refresh);
		};
	}, []);
	const delayedSnapshot = staleSnapshotLabel(data, now);
	const [items, setItems] = (0, react.useState)([]);
	const [error, setError] = (0, react.useState)(null);
	const [errorAction, setErrorAction] = (0, react.useState)("load");
	const [loading, setLoading] = (0, react.useState)(true);
	const tracking = useTaskTracker();
	const { batch, busy } = tracking;
	const [updateRetry, setUpdateRetry] = (0, react.useState)(null);
	const updateRetrySequence = (0, react.useRef)(0);
	const [preflightRetry, setPreflightRetry] = (0, react.useState)(null);
	const preflightRequest = (0, react.useRef)(new LatestRequest());
	(0, react.useEffect)(() => () => preflightRequest.current.cancel(), []);
	const [preparing, setPreparing] = (0, react.useState)(null);
	(0, react.useEffect)(() => {
		if (section !== "rankings") {
			preflightRequest.current.cancel();
			setPreparing(null);
		}
	}, [section]);
	const [confirming, setConfirming] = (0, react.useState)(null);
	const [preflights, setPreflights] = (0, react.useState)([]);
	const [riskAccepted, setRiskAccepted] = (0, react.useState)(false);
	const [installActivityOpen, setInstallActivityOpen] = (0, react.useState)(false);
	const installInvoker = (0, react.useRef)(null);
	const reviewDialog = useDialogFocus(Boolean(confirming), installInvoker.current);
	const activityDialog = useDialogFocus(Boolean(batch && installActivityOpen));
	const [notice, setNotice] = (0, react.useState)(null);
	const loadSequence = (0, react.useRef)(0);
	const loadedSnapshot = (0, react.useRef)(null);
	const completedBatch = (0, react.useRef)(null);
	const load = (0, react.useCallback)(async (nextView, nextQuery, nextCategory, nextCatalogScope, nextInstallAvailability, offset = 0, append = false) => {
		const requestId = ++loadSequence.current;
		const requestSnapshot = loadedSnapshot.current;
		setLoading(true);
		setErrorAction("load");
		setError(null);
		if (!append) {
			loadedSnapshot.current = null;
			setData(null);
			setItems([]);
		}
		try {
			const fetchPage = (pageOffset) => readJson(`/dsh-top100/rankings?${new URLSearchParams({
				view: nextView,
				category: nextCategory ?? "",
				catalogScope: nextCatalogScope,
				installAvailability: nextInstallAvailability,
				q: nextQuery,
				offset: String(pageOffset),
				limit: "40"
			})}`);
			let payload = await fetchPage(offset);
			if (requestId !== loadSequence.current) return;
			let shouldAppend = append;
			if (shouldRestartPagination(append, requestSnapshot, payload.generatedAt)) {
				payload = await fetchPage(0);
				if (requestId !== loadSequence.current) return;
				shouldAppend = false;
			}
			loadedSnapshot.current = payload.generatedAt;
			setData(payload);
			setItems((current) => shouldAppend ? [...current, ...payload.items] : payload.items);
		} catch (cause) {
			if (requestId !== loadSequence.current) return;
			setErrorAction("load");
			setPreflightRetry(null);
			setError(cause instanceof Error ? cause.message : String(cause));
			if (!append) setItems([]);
		} finally {
			if (requestId === loadSequence.current) setLoading(false);
		}
	}, []);
	(0, react.useEffect)(() => {
		if (section !== "rankings") return;
		load(view, query, category, catalogScope, installAvailability, 0, false);
	}, [
		catalogScope,
		category,
		installAvailability,
		load,
		query,
		section,
		view
	]);
	(0, react.useEffect)(() => {
		if (!batch || busy || !isInstallBatchComplete(batch) || completedBatch.current === batch.batchId) return;
		completedBatch.current = batch.batchId;
		if (section === "rankings") load(view, query, category, catalogScope, installAvailability, 0, false);
	}, [
		batch,
		busy,
		catalogScope,
		category,
		installAvailability,
		load,
		query,
		section,
		t,
		view
	]);
	const remaining = (0, react.useMemo)(() => {
		if (!data) return 0;
		return Math.max(0, data.total - items.length);
	}, [data, items.length]);
	const preflightsByName = (0, react.useMemo)(() => new Map(preflights.map((preflight) => [preflight.fullName, preflight])), [preflights]);
	const activeCategory = data?.categories.find((definition) => definition.id === category);
	function resetPreflight() {
		preflightRequest.current.cancel();
		setPreparing(null);
		setPreflightRetry(null);
		setConfirming(null);
		setPreflights([]);
		setRiskAccepted(false);
	}
	function selectSection(nextSection) {
		resetPreflight();
		setSection(nextSection);
	}
	function startSearch(value) {
		resetPreflight();
		const nextQuery = value.trim();
		setCategory(null);
		setDraft(nextQuery);
		setQuery(nextQuery);
	}
	function switchCatalogScope(nextScope) {
		if (nextScope === catalogScope) {
			selectSection("rankings");
			return;
		}
		resetPreflight();
		setSection("rankings");
		setCatalogScope(nextScope);
		setView(nextScope === "plugins" ? "hot" : "total");
		setInstallAvailability("all");
		setCategory(null);
		setQuery("");
		setDraft("");
		setCategoryMenuOpen(false);
	}
	function selectCategory(nextCategory) {
		resetPreflight();
		setCategory(nextCategory);
		setCategoryMenuOpen(false);
	}
	function selectRankingView(nextView) {
		resetPreflight();
		setView(nextView);
		setQuery("");
		setDraft("");
	}
	async function prepareInstall(item) {
		installInvoker.current = document.activeElement;
		const request = preflightRequest.current.start();
		setPreflightRetry(null);
		setConfirming(null);
		setPreflights([]);
		setInstallActivityOpen(false);
		setPreparing(item.fullName);
		setError(null);
		setNotice(null);
		try {
			const preflight = await readJson("/dsh-top100/install-preflight", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					fullName: item.fullName,
					installLocator: item.installLocator
				}),
				signal: request.signal
			});
			if (!request.isCurrent()) return;
			setPreflights([preflight]);
			setRiskAccepted(!preflight.requiresExplicitApproval);
			setConfirming([item]);
		} catch (cause) {
			if (!request.isCurrent()) return;
			const needsReload = cause instanceof HttpError && (cause.code === "catalog-changed" || cause.code === "invalid-locator");
			setPreflightRetry(needsReload ? null : item);
			setErrorAction(needsReload ? "load" : "install");
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			if (request.isCurrent()) setPreparing(null);
		}
	}
	function cancelPreflight() {
		preflightRequest.current.cancel();
		setPreparing(null);
		setPreflightRetry(null);
		setNotice(t("preflightCancelled"));
	}
	async function install(selectedItems) {
		setConfirming(null);
		setNotice(null);
		setError(null);
		try {
			if (await tracking.submit("/dsh-top100/install-batch", { approvals: selectedItems.map((item) => {
				const preflight = preflightsByName.get(item.fullName);
				return {
					fullName: item.fullName,
					approvalToken: preflight?.approvalToken ?? "",
					risksAccepted: preflight?.requiresExplicitApproval ? riskAccepted : true
				};
			}) })) setInstallActivityOpen(true);
		} catch (cause) {
			setErrorAction("install");
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setPreflights([]);
			setRiskAccepted(false);
		}
	}
	async function retryJob(job) {
		if (job.action === "update") {
			setInstallActivityOpen(false);
			selectSection("installed");
			setUpdateRetry({
				id: ++updateRetrySequence.current,
				names: [job.fullName]
			});
			return;
		}
		if (!job.action || job.action === "install") {
			let item = items.find((candidate) => candidate.fullName === job.fullName);
			if (!item) try {
				item = (await readJson(`/dsh-top100/rankings?${new URLSearchParams({
					view: "total",
					category: "",
					catalogScope: job.kind === "skill" ? "skills" : "plugins",
					installAvailability: "all",
					q: job.fullName,
					offset: "0",
					limit: "20"
				})}`)).items.find((candidate) => candidate.fullName === job.fullName);
			} catch {}
			if (item) await prepareInstall(item);
			else {
				setErrorAction("install");
				setError(t("retryReloadRequired"));
			}
			return;
		}
		try {
			if (await tracking.submit("/dsh-top100/retry", { jobId: job.id })) setInstallActivityOpen(true);
		} catch (cause) {
			setErrorAction("install");
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	}
	function jobPanel(job) {
		return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: `job job-${job.phase} job-${job.action ?? "install"} activation-${job.activationState}`,
			"aria-live": "polite",
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "job-heading",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "job-plugin-name",
						title: job.fullName,
						children: job.fullName
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t(taskPhaseKey(job)) })]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TaskDetails, {
					job,
					t,
					headingPresent: true
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillBackupList, {
					jobs: [job],
					t
				}),
				![
					"installed",
					"failed",
					"cancelled"
				].includes(job.phase) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					disabled: job.cancelRequested || tracking.cancelling.includes(job.id),
					onClick: () => void tracking.cancel(job.id),
					children: t("cancel")
				}) : ["failed", "cancelled"].includes(job.phase) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					disabled: busy !== null,
					onClick: () => void retryJob(job),
					children: t("retry")
				}) : job.phase === "installed" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => {
						setInstallActivityOpen(false);
						selectSection("installed");
					},
					children: t("manage")
				}) : null
			]
		});
	}
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "dsh-top100",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
				className: "market-head",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "rank-mark",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RankTrustMark, {})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "head-copy",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "market-title-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
							className: "github-link",
							href: "https://github.com/evaldock/dsh-top100",
							"aria-label": "dsh-top100 GitHub",
							title: "dsh-top100 GitHub",
							target: "_blank",
							rel: "noopener noreferrer",
							children: GITHUB_ICON
						})]
					}), data ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "meta",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
							className: "data-source",
							href: EVALDOCK_SITE,
							target: "_blank",
							rel: "noreferrer",
							children: "EvalDock Top100"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: data.snapshotDate })]
					}) : null]
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("nav", {
				className: "page-tabs",
				"aria-label": t("nav"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						"aria-selected": section === "rankings" && catalogScope === "plugins",
						onClick: () => switchCatalogScope("plugins"),
						children: t("rankings")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						"aria-selected": section === "rankings" && catalogScope === "skills",
						onClick: () => switchCatalogScope("skills"),
						children: t("skillsMarket")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						"aria-selected": section === "installed",
						onClick: () => selectSection("installed"),
						children: t("installedPage")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						"aria-selected": section === "diagnostics",
						onClick: () => selectSection("diagnostics"),
						children: t("diagnostics")
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TaskStatus, {
				tracking,
				t,
				onViewResult: () => setInstallActivityOpen(true)
			}),
			section === "rankings" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				delayedSnapshot ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "cache-warning",
					role: "status",
					children: t("dataUpdateDelayed").replace("{date}", delayedSnapshot)
				}) : null,
				data?.cache.stale ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "cache-warning",
					title: data.cache.reason ?? void 0,
					children: t("cachedStale")
				}) : null,
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "toolbar ranking-toolbar",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "search-cluster",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "search",
							value: draft,
							placeholder: t("searchPlaceholder"),
							onChange: (event) => setDraft(event.target.value),
							onKeyDown: (event) => {
								if (event.key === "Enter" && !event.nativeEvent.isComposing) startSearch(draft);
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "primary",
							onClick: () => startSearch(draft),
							children: t("search")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "market-filter-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "market-category-menu",
							onBlur: (event) => {
								if (!event.currentTarget.contains(event.relatedTarget)) setCategoryMenuOpen(false);
							},
							onKeyDown: (event) => {
								if (event.key === "Escape") setCategoryMenuOpen(false);
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "market-category-trigger",
								"aria-expanded": categoryMenuOpen,
								"aria-controls": "top100-category-menu",
								title: activeCategory?.description ?? t("allCategories"),
								onClick: () => setCategoryMenuOpen((current) => !current),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "market-category-icon",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CategoryGlyph, { id: category })
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: activeCategory?.label ?? t("allCategories") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChevronDown, {})
								]
							}), categoryMenuOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								id: "top100-category-menu",
								className: "market-category-popover",
								role: "listbox",
								"aria-label": t(catalogScope === "skills" ? "skillCategoryFilter" : "categoryFilter"),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "market-category-choice market-category-choice-all",
									role: "option",
									"aria-selected": category === null,
									onClick: () => selectCategory(null),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "market-category-icon",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CategoryGlyph, { id: null })
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("allCategories") })]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "market-category-grid",
									children: data?.categories.map((definition) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										className: "market-category-choice",
										role: "option",
										"aria-selected": definition.id === category,
										title: definition.description,
										onClick: () => selectCategory(definition.id),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "market-category-icon",
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CategoryGlyph, { id: definition.id })
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: definition.label })]
									}, definition.id))
								})]
							}) : null]
						}), catalogScope === "plugins" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "install-only-toggle",
							role: "switch",
							"aria-checked": installAvailability === "installable",
							onClick: () => {
								resetPreflight();
								setInstallAvailability((current) => current === "installable" ? "all" : "installable");
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "switch-track",
								"aria-hidden": "true",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {})
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("installableOnly") })]
						}) : null]
					})]
				}),
				data ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "ranking-context",
					"aria-live": "polite",
					children: [query ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "result-count search-result-count",
						children: [
							t("catalogMatches"),
							" ",
							data.total,
							" ",
							t("entries"),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [
								" · ",
								t("showingResults"),
								" ",
								items.length
							] })
						]
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "result-count",
						children: [
							items.length,
							" / ",
							data.total,
							" ",
							t(catalogScope === "plugins" ? "pluginEntries" : "skillEntries")
						]
					}), query ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "ranking-current-label",
						title: t(rankingBasisKey(view, query)),
						children: t(rankingBasisShortKey(view, query))
					}) : catalogScope === "plugins" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "ranking-modes",
						"aria-label": t("sortBy"),
						children: SORT_VIEWS.map((id) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							"aria-pressed": view === id,
							title: t(rankingBasisKey(id, "")),
							onClick: () => selectRankingView(id),
							children: t(id)
						}, id))
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "ranking-current-label stars-browse",
						children: ["★ ", t("starsBrowsing")]
					})]
				}) : null,
				notice ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "banner",
					style: { whiteSpace: "pre-line" },
					children: notice
				}) : null,
				error ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "error",
					children: [
						t(errorAction === "install" ? "installError" : "loadError"),
						": ",
						error,
						" ",
						errorAction === "load" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => void load(view, query, category, catalogScope, installAvailability, 0, false),
							children: t("retry")
						}) : preflightRetry ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							disabled: preparing !== null || busy !== null,
							onClick: () => void prepareInstall(preflightRetry),
							children: t("retry")
						}) : null
					]
				}) : null,
				preparing ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "install-activity-banner is-active",
					role: "status",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("preflighting") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
						preparing,
						" · ",
						t("preflightWait")
					] })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: cancelPreflight,
						children: t("cancel")
					})]
				}) : null,
				batch && busy ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: `install-activity-banner ${busy ? "is-active" : "is-complete"}`,
					role: "status",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: batch.jobs[0] ? t(taskPhaseKey(batch.jobs[0])) : t(busy ? "installTaskRunning" : "installTaskComplete") }), batch.jobs[0] ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						title: batch.jobs[0].fullName,
						children: batch.jobs[0].fullName
					}) : null] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => setInstallActivityOpen(true),
						children: t(busy ? "viewInstallProgress" : "viewInstallResult")
					})]
				}) : null,
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "list",
					"aria-busy": loading,
					"aria-label": loading && items.length === 0 ? t("loadingRankings") : void 0,
					children: [loading && items.length === 0 && !error ? SKELETON_CARDS : items.map((item) => {
						const identity = presentRepositoryIdentity(item);
						const installCapability = presentInstallCapability(item);
						const rankingMetric = catalogScope === "plugins" && !query && view === "hot" ? {
							label: t("hotScore"),
							value: scoreLabel(item.hotScore)
						} : catalogScope === "plugins" && !query && view === "rising" ? {
							label: t(item.risingScore == null ? "daily" : "risingScore"),
							value: item.risingScore == null ? deltaLabel(item.dailyStars) : scoreLabel(item.risingScore)
						} : null;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
							className: "ranking-card",
							"data-rank": item.rank,
							"data-trust": item.evidence.trustLevel,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "card-copy",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "card-heading",
									children: [catalogScope === "plugins" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "rank",
										"aria-label": `${t("rank")} ${item.rank}`,
										children: ["#", item.rank]
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "rank",
										children: t(`catalogScope_${catalogScope}`)
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
										href: item.url || `https://github.com/${item.fullName}`,
										target: "_blank",
										rel: "noreferrer",
										"aria-label": identity.name,
										title: identity.name,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "repo-name",
											children: identity.name
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "title-arrow",
											"aria-hidden": "true",
											children: "↗"
										})]
									}) })]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DescriptionPreview, {
									text: descriptionDisplayFor(item),
									t
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "card-footer",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "facts",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: "star-fact",
											title: `${t("repositoryStars")} · ${item.fullName}`,
											children: ["★ ", item.stars]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											title: t("repositoryStars"),
											children: item.fullName
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
											t("weekly"),
											" ",
											deltaLabel(item.weeklyStars)
										] }),
										item.threeDayStars != null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
											t("threeDay"),
											" ",
											deltaLabel(item.threeDayStars)
										] }) : null,
										rankingMetric ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: "ranking-metric",
											title: t(rankingBasisKey(view, query)),
											children: [
												rankingMetric.label,
												" ",
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: rankingMetric.value })
											]
										}) : null,
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: `capability-label capability-${installCapability.kind}`,
											title: t(installCapability.reasonKey),
											children: t(installCapability.labelKey)
										})
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "actions",
									children: item.installed && item.type?.toLowerCase() !== "skill" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "primary",
										onClick: () => selectSection("installed"),
										children: t("manage")
									}) : item.installable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "primary",
										disabled: !tracking.ready || busy !== null || preparing !== null,
										onClick: () => void prepareInstall(item),
										children: preparing === item.fullName ? t("preflighting") : t("reviewInstall")
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
										className: "project-link",
										href: item.url || `https://github.com/${item.fullName}`,
										target: "_blank",
										rel: "noreferrer",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("viewProject") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											"aria-hidden": "true",
											children: "↗"
										})]
									})
								})]
							})]
						}, `${item.fullName}-${item.rank}`);
					}), !loading && items.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "lede",
						children: t(catalogScope === "plugins" && !query && view !== "total" ? "emptyRanking" : "empty")
					}) : null]
				}),
				remaining > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					disabled: loading,
					onClick: () => void load(view, query, category, catalogScope, installAvailability, items.length, true),
					children: [
						t("more"),
						" (",
						remaining,
						")"
					]
				}) : null,
				confirming ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					ref: reviewDialog,
					tabIndex: -1,
					className: "mask",
					role: "dialog",
					"aria-modal": "true",
					"aria-labelledby": "dsh-top100-confirm-title",
					onKeyDownCapture: (event) => {
						if (event.key !== "Escape") return;
						event.stopPropagation();
						setConfirming(null);
						setPreflights([]);
						setRiskAccepted(false);
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dialog",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
								className: "confirm-header",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
									id: "dsh-top100-confirm-title",
									children: confirming.length === 1 ? t("confirmProjectTitle").replace("{name}", presentRepositoryIdentity(confirming[0]).name) : t("confirmTitle")
								}), confirming.length === 1 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
									className: "confirm-target",
									"aria-label": t("resolvedSource"),
									children: preflightsByName.get(confirming[0].fullName)?.provenance.resolvedTarget ?? confirming[0].installSpec?.spec ?? "-"
								}) : null]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "confirm-body",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "confirm-list",
									children: confirming.map((item) => {
										const preflight = preflightsByName.get(item.fullName);
										const identity = presentRepositoryIdentity(item);
										const scriptCount = preflight?.lifecycleScripts.length ?? 0;
										const needsRestart = preflight?.risks.some((risk) => risk.code === "restart-required") ?? false;
										const visibleRisks = visibleInstallReviewRisks(preflight?.risks ?? [], scriptCount);
										const sourceSummaryKey = preflight?.provenance.source === "github" ? "commitLocked" : preflight?.provenance.repositoryIdentity === "unavailable" ? "sourceIdentityUnavailable" : "sourceMatched";
										return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "confirm-item",
											children: [
												confirming.length > 1 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: "confirm-project",
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: identity.name }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
														className: "confirm-target",
														"aria-label": t("resolvedSource"),
														children: preflight?.provenance.resolvedTarget ?? item.installSpec?.spec ?? "-"
													})]
												}) : null,
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
													className: "confirm-effects",
													"aria-label": t("installSummary"),
													children: [
														scriptCount > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
															className: "confirm-scripts",
															"data-warning": scriptCount > 0,
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("confirmScripts") }), preflight?.lifecycleScripts.map((script) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																className: "script-evidence",
																children: [
																	/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: script.name }),
																	/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																		"aria-hidden": "true",
																		children: "→"
																	}),
																	/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: script.command })
																]
															}, script.name))]
														}) : null,
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
															className: "risk-list",
															children: visibleRisks.map((risk) => {
																const presented = presentInstallRisk(risk, t);
																return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
																	"data-severity": risk.severity,
																	children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: presented.summary }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: presented.detail })]
																}, risk.code);
															})
														}),
														needsRestart ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
															className: "confirm-followup",
															children: t("confirmRestart")
														}) : null,
														item.install?.needsConfig ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
															className: "confirm-followup",
															children: t("confirmNeedConfig")
														}) : null
													]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
													className: "confirm-evidence",
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("viewInstallTechnicalEvidence") }),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
															className: "confirm-source-status",
															children: t(sourceSummaryKey)
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", { children: [
															/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("requestedSource") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: preflight?.provenance.requestedTarget ?? item.installSpec?.spec ?? item.type }) })] }),
															/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("resolvedSource") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: preflight?.provenance.resolvedTarget ?? "-" }) })] }),
															preflight?.provenance.integrity ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("integrity") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: preflight.provenance.integrity }) })] }) : null
														] }),
														scriptCount === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("noBuildScripts") }) : null,
														needsRestart ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("risk_restart-required_detail") }) : null,
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
															className: "confirm-project-link",
															href: item.url || `https://github.com/${item.fullName}`,
															target: "_blank",
															rel: "noreferrer",
															children: [t("viewProject"), " ↗"]
														})
													]
												})
											]
										}, item.fullName);
									})
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
								className: "confirm-footer",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "confirm-caveat",
										children: t("confirmSecurityNote")
									}),
									preflights.some((value) => value.requiresExplicitApproval) ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: "risk-approval",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: riskAccepted,
											onChange: (event) => setRiskAccepted(event.target.checked)
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("riskApproval") })]
									}) : null,
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "confirm-actions",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											autoFocus: true,
											onClick: () => {
												setConfirming(null);
												setPreflights([]);
												setRiskAccepted(false);
											},
											children: t("cancel")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "primary",
											disabled: !riskAccepted,
											onClick: () => void install(confirming),
											children: t("confirm")
										})]
									})
								]
							})
						]
					})
				}) : null
			] }) : section === "installed" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ManagedPage, {
				t,
				tracking,
				retryUpdate: updateRetry,
				onRetryConsumed: () => setUpdateRetry(null),
				onBrowseSkills: () => {
					resetPreflight();
					setCatalogScope("skills");
					setView("total");
					setInstallAvailability("all");
					setCategory(null);
					setQuery("");
					setDraft("");
					setSection("rankings");
				}
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DiagnosticsPage, { t }),
			batch && installActivityOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "install-activity-mask",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					ref: activityDialog,
					tabIndex: -1,
					className: "install-activity-dialog",
					role: "dialog",
					"aria-modal": "true",
					"aria-labelledby": "dsh-top100-install-activity-title",
					onKeyDownCapture: (event) => {
						if (event.key !== "Escape") return;
						event.stopPropagation();
						event.nativeEvent.stopImmediatePropagation();
						setInstallActivityOpen(false);
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: "install-activity-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							id: "dsh-top100-install-activity-title",
							children: t("installActivityTitle")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t(busy ? "installActivityActiveHint" : "installActivityCompleteHint") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "install-activity-close",
							autoFocus: true,
							"aria-label": t("closeInstallActivity"),
							onClick: () => setInstallActivityOpen(false),
							children: "×"
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "install-activity-list",
						children: batch.jobs.map((job) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "install-activity-item",
							children: jobPanel(job)
						}, job.id))
					})]
				})
			}) : null
		]
	});
}

//#endregion
//#region src/client/SettingsCard.tsx
function SettingsCard({ t, settings }) {
	const snapshot = (0, react.useSyncExternalStore)((listener) => settings.subscribe(listener), () => settings.getSnapshot());
	const [draft, setDraft] = (0, react.useState)(null);
	const [saving, setSaving] = (0, react.useState)(false);
	const [message, setMessage] = (0, react.useState)("");
	const mounted = (0, react.useRef)(true);
	(0, react.useEffect)(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	const writable = snapshot.status === "ready" && snapshot.writable;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
		className: "dsh-top100 source-settings",
		onSubmit: async (event) => {
			event.preventDefault();
			if (!writable || saving || draft === null) return;
			setSaving(true);
			setMessage("");
			try {
				const url = new URL(draft.trim());
				if (!["http:", "https:"].includes(url.protocol)) throw new Error(t("sourceInvalid"));
				await settings.set("dataUrl", draft.trim().replace(/\/+$/, ""));
				if (mounted.current) {
					setDraft(null);
					setMessage(t("sourceSaved"));
				}
			} catch (error) {
				if (mounted.current) setMessage(error instanceof Error ? error.message : String(error));
			} finally {
				if (mounted.current) setSaving(false);
			}
		},
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("cardTitle") }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "lede",
				children: t("cardHint")
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("cardTitle"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
				type: "url",
				value: draft ?? snapshot.value?.dataUrl ?? "",
				disabled: !writable || saving,
				onChange: (event) => {
					setDraft(event.target.value);
					setMessage("");
				},
				required: true
			})] }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				className: "primary",
				type: "submit",
				disabled: !writable || saving || draft === null,
				children: saving ? t("sourceSaving") : t("sourceSave")
			}) }),
			!writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "lede",
				children: t("sourceReadOnly")
			}) : null,
			message ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				role: "status",
				children: message
			}) : null
		]
	});
}

//#endregion
//#region src/client/styles.ts
const css = `
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
  gap: 2px;
  padding: 0 0 8px;
  border-bottom: 1px solid var(--t100-line);
}
.dsh-top100 .page-tabs button {
  min-width: 0;
  flex: 0 1 auto;
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
.dsh-top100 .managed-list { gap: 0; padding: 0; overflow: visible; }
.dsh-top100 .managed-list article {
  min-width: 0;
  border-bottom: 1px solid var(--t100-line);
}
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
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 5px 12px;
  padding: 14px 0;
  list-style: none;
}
.dsh-top100 .managed-details > summary::-webkit-details-marker { display: none; }
.dsh-top100 .managed-details > summary .facts { grid-column: 1 / -1; margin: 0 0 0 18px; font-weight: 400; }
.dsh-top100 .managed-details > summary .badge { padding: 0; background: transparent; }
.dsh-top100 .managed-details > summary .badge.warn { color: #9a6700; }
.dsh-top100 .managed-body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; padding: 0 0 14px 18px; }
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
.dsh-top100 .task-history > summary { cursor: pointer; font-weight: 500; }
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

//#endregion
//#region src/client/locales.ts
const zh = {
	taskDependencies: "正在处理依赖",
	taskNetworkRetry: "网络请求失败，正在等待重试",
	taskRecoveringDependencies: "正在恢复原有依赖，请等待恢复结束",
	taskResolved: "已解析",
	taskReused: "复用缓存",
	taskDownloaded: "已下载",
	taskAdded: "已写入",
	taskLogs: "执行详情",
	taskRestored: "原有依赖已恢复。",
	taskRecoveryFailed: "自动恢复失败，请先检查并修复当前配置。",
	taskProfileDirectory: "当前插件目录",
	taskUninstallRestart: "请重启 DSH，使卸载生效。",
	taskUpdateRestart: "请重启 DSH，使更新生效，再检查插件功能。",
	taskInstallRestart: "请重启 DSH，再检查插件功能。",
	taskCheckConfiguration: "请先完成作者要求的配置。",
	buildRecoveryGuide: "查看构建授权与重试指南",
	task_install_installing: "安装中",
	task_install_installed: "已安装",
	task_install_failed: "安装失败",
	task_install_cancelled: "安装已取消",
	task_install_progress: "安装进度",
	task_update_installing: "更新中",
	task_update_installed: "已更新",
	task_update_failed: "更新失败",
	task_update_cancelled: "更新已取消",
	task_update_progress: "更新进度",
	task_uninstall_installing: "卸载中",
	task_uninstall_installed: "已卸载",
	task_uninstall_failed: "卸载失败",
	task_uninstall_cancelled: "卸载已取消",
	task_uninstall_progress: "卸载进度",
	submissionRejected: "提交未被接受，请核对错误后重新操作。",
	submissionSending: "正在确认提交结果，确认前暂不接受新的安装或更新。",
	submissionUncertain: "提交结果暂时未知，服务端可能已经开始执行。请查询结果或取消这次提交。",
	submissionCancelling: "正在确认取消提交；只有服务端确认后才会解除等待。",
	querySubmission: "查询结果",
	cancelSubmission: "取消这次提交",
	recentTasks: "最近操作",
	viewLatestTaskResult: "查看最新任务详情",
	taskRecovering: "正在恢复安装与更新任务状态…",
	taskTrackingError: "无法读取任务状态，任务可能仍在执行。",
	reviewUpdateTitle: "确认更新",
	reviewUpdateHint: "核对每个插件的当前版本、锁定目标和执行影响后，再确认更新。",
	confirmUpdate: "确认更新",
	updatePreflightWait: "每 20 项核验一组。检查失败或暂无更新的项目会单独列出，可更新项目核验后统一确认；尚未开始更新。",
	updatePreflightCancelled: "已取消更新核验，未开始更新。",
	updatePreflightIncomplete: "未获得全部插件的完整更新核验结果，未开始更新。请重试。",
	updateSubmitting: "正在提交已确认的更新…",
	preflightWait: "正在等待来源核验结果，较慢的连接可能需要更多时间；尚未开始安装。",
	preflightCancelled: "已取消等待来源核验，未开始安装。",
	clientErrorTitle: "插件页面暂时无法显示",
	clientErrorHint: "可重新打开页面。正在执行的安装不会因此取消，恢复后会重新读取安装状态。",
	diagExport: "导出诊断摘要",
	runtime_loaded: "宿主已加载",
	"runtime_restart-required": "待重启验证",
	"runtime_missing-services": "缺少必需服务",
	runtime_failed: "宿主加载失败",
	runtime_inactive: "未激活",
	runtime_unknown: "未验证",
	runtimeScope: "状态仅反映当前宿主加载情况；插件页面和实际功能需使用后确认。",
	runtimeDetails: "加载详情",
	manageOptions: "更新设置",
	managedSelfDescription: "发现、安装和管理 DSH 插件与 Skills。",
	managedPreserveHint: "沿用当前来源检查更新；没有来源记录时仅检查兼容版本。",
	managedLatestHint: "切换至最新发布版本或默认分支，可能跨越主要版本；更新前会显示具体目标。",
	diagExportHint: "仅导出版本、计数和问题代码，不包含路径、地址、插件清单或原始日志。",
	diagExportFailed: "诊断摘要导出失败，请重试。",
	expandDescription: "展开简介",
	collapseDescription: "收起简介",
	nav: "插件排行",
	title: "dsh-top100",
	subtitle: "发现、核对并安装 DSH 插件",
	rankings: "插件市场",
	skillsMarket: "Skill 市场",
	installedPage: "已安装",
	diagnostics: "诊断",
	search: "搜索",
	searchPlaceholder: "搜索名称、简介或标签",
	searchResults: "搜索结果",
	catalogMatches: "全库匹配",
	showingResults: "已显示",
	catalogRank: "全库排名",
	filter: "筛选",
	filterHint: "调整榜单的收录范围。",
	catalogScope: "市场范围",
	catalogScope_plugins: "插件",
	catalogScope_skills: "Skills",
	catalogScope_ecosystem: "生态项目",
	catalogScopeHint_plugins: "已验证为 DSH Plugin；安装能力作为独立条件筛选",
	catalogScopeHint_skills: "独立 Skills 技能库，不参与 Plugin 排名",
	catalogScopeHint_ecosystem: "经确认与 DSH 相关的应用和外围项目，不参与排名",
	exploreMore: "探索更多",
	installAvailability: "安装来源",
	installAvailability_installable: "有安装源",
	installAvailability_all: "全部插件",
	installAvailability_unavailable: "未识别安装源",
	installableOnly: "仅看有安装源",
	sortBy: "排序",
	starsSort: "GitHub Stars",
	starsShort: "Stars",
	starsBrowsing: "按 Stars 浏览",
	allCategories: "全部分类",
	categoryRanking: "分类筛选结果",
	hot: "Top100",
	rising: "新锐榜",
	total: "总榜",
	category: "分类筛选",
	categoryFilter: "插件分类",
	skillCategoryFilter: "Skill 分类",
	hideSkills: "Skills 技能库",
	hideSkillsHint: "Skills 使用独立目录，不参与 Plugin 排名",
	hiddenSkillsPrefix: "已隐藏",
	skillRepositories: "个 Skill 仓库",
	showCandidates: "探索候选与生态项目",
	showCandidatesHint: "同时显示当前不能直接安装的候选项目",
	clearFilters: "清除筛选",
	entries: "项",
	pluginEntries: "个插件",
	skillEntries: "个 Skills",
	cachedFresh: "本地快照可用",
	cachedStale: "正在显示较旧快照",
	dataUpdateDelayed: "数据更新延迟，当前展示 {date} 的快照（北京时间）。榜单将在新数据发布后更新。",
	cacheAgeUnknown: "缓存时间未知",
	minutesAgo: "分钟前获取",
	hoursAgo: "小时前获取",
	cacheFallback: "使用快照原因",
	updated: "数据日期",
	source: "数据源",
	empty: "此范围内没有匹配项目",
	emptyRanking: "暂无满足观测和入榜条件的项目；新数据需积累3日或7日，可查看 Stars 总榜。",
	loadingRankings: "正在加载榜单…",
	loadError: "无法读取线上榜单",
	installError: "插件安装失败",
	retry: "重试",
	rank: "排名",
	retryReloadRequired: "榜单已变化，请刷新当前结果后重新执行安装预检。",
	install: "安装",
	preflighting: "正在核对来源",
	batchInstall: "安装已选择",
	batchProgress: "任务进度",
	batchComplete: "文件操作已完成；请按各项运行状态继续验证。",
	installTaskRunning: "任务正在运行",
	installTaskComplete: "任务已有结果",
	viewInstallProgress: "查看任务进度",
	viewInstallResult: "查看任务结果",
	installActivityTitle: "插件任务",
	installActivityActiveHint: "操作会在后台继续；关闭窗口不会中断任务。",
	installActivityCompleteHint: "任务已经结束，可在这里查看结果或重新尝试。",
	installTaskRecovered: "已恢复上次未完成的任务。",
	installTaskUnavailable: "此前的任务记录已失效，无法确认最终结果。可到“已安装”或“诊断”查看当前状态。",
	dismissTaskNotice: "知道了",
	cancelFailed: "取消请求失败，任务可能仍在运行；正在继续读取权威状态。",
	closeInstallActivity: "关闭任务窗口",
	continueBrowsing: "继续浏览",
	batchSucceeded: "成功",
	batchFailed: "失败",
	batchCancelled: "取消",
	batchActive: "进行中",
	batchRestartRequired: "待重启",
	batchConfigurationRequired: "待配置",
	batchLimit: "每批最多安装 20 个项目",
	select: "选择",
	installed: "已安装",
	manage: "管理",
	searchInstalled: "搜索已安装插件或技能（Skill）",
	loadingInstalled: "正在读取已安装项目…",
	installedManagerTitle: "已安装插件管理",
	installedManagerHint: "插件属于当前 Profile；Skills 为用户全局共享。Skill 卸载或替换前会完整备份原目录。",
	profile: "当前配置（Profile）",
	managedItems: "个已安装项目",
	bundleKind: "插件（Bundle）",
	skillKind: "技能（Skill）",
	project: "项目",
	installedPluginFallback: "已安装的 DSH 插件",
	installedSkillFallback: "已安装的本地技能（Skill）",
	noChineseDescription: "暂无中文简介",
	update: "更新",
	checkUpdates: "检查更新",
	noUpdateAvailable: "暂无更新",
	refreshInstalled: "刷新",
	updateAll: "批量检查更新",
	updateStrategy: "更新方式",
	updatePreserve: "沿用原来源（推荐）",
	updateLatest: "切换到最新版",
	updatePreserveHint: "保留原版本范围、发布频道或 GitHub 分支。没有来源记录的精确 npm 版本只检查兼容版本。",
	updateLatestHint: "明确改用 npm latest 或 GitHub 默认分支，可能跨主要版本或离开原频道；确认页会展示精确目标。",
	updateBatchLimit: "本次检查列表前面的项目；其余项目可在完成后刷新或搜索分批处理：",
	updateCheckResults: "未进入本次更新的项目",
	updateCheckFailed: "检查失败",
	updateStatus_current: "当前来源内暂无更新",
	updateStatus_available: "当前来源内有可用更新",
	updateStatus_failed: "版本检查失败，可刷新后重试",
	updateStatus_unknown: "尚未核对远端版本或提交",
	updateCheckedAt: "版本检查时间",
	updateCheckDetails: "查看检查详情",
	updateIssueCurrent: "目标与当前版本相同或更旧，已跳过。",
	updateIssueStrategy: "无法确认原更新分支，请明确选择更新方式后重试。",
	updateIssueFailed: "来源未通过检查。请查看详情，修复后重新检查。",
	protectedManageHint: "此插件不能在这里修改，请通过原安装方式维护。",
	localManageHint: "本地插件请在源码目录更新并重新构建，然后重启 DSH。",
	maintenanceGuide: "维护说明",
	reviewSkillInstall: "安装",
	browseSkillUpdates: "去 Skills 目录检查更新",
	skillReinstallHint: "在 Skills 目录找到原项目后，点击“安装 / 更新 Skill”核对来源。替换前会备份完整原目录。",
	skillBackupSaved: "Skill 原内容已备份",
	skillBackupSavedHint: "备份包含本地修改，可从以下目录找回。Skills 由所有 Profile 共用。",
	retryFailedChecks: "重新检查失败项",
	noUpdatesPrepared: "本次没有可确认的更新，请查看逐项检查结果。",
	updateTarget: "更新来源",
	sourceLatestVersion: "当前来源目标版本",
	sourceMigrationTitle: "旧版频道依赖需要先整理",
	sourceMigrationHint: "当前配置直接使用 beta/latest 等频道名，包管理器可能顺带更新未选择的插件。请先固定当前已安装版本并保留原频道，再执行安装、更新或卸载。",
	sourceMigrationAction: "固定当前版本并保留频道",
	sourceMigrationWorking: "正在核对并整理…",
	sourceMigrationConfirm: "将下列依赖固定为当前已安装版本，并同步锁文件、保存原频道供以后检查更新。此操作不会下载、升级或运行安装脚本。确认这些变更？",
	sourceMigrationComplete: "当前版本已固定，原频道已保留。现在可以重新检查更新。",
	sourceMigrationFailed: "未确认整理成功。已刷新当前状态，请核对详情后重试；复杂工作区需要按原安装方式维护。",
	globalSkill: "全局 Skill · 所有 Profile 共用",
	skillModification_unchanged: "内容与安装记录一致",
	skillModification_modified: "检测到本地修改，操作前会完整备份",
	skillModification_unknown: "缺少可核对记录，操作前会完整备份",
	descriptionLocale: "zh",
	updateAvailable: "有可用更新",
	uninstall: "卸载",
	enable: "启用",
	disable: "停用",
	enabled: "配置已启用",
	disabled: "配置已停用",
	version: "版本",
	latest: "最新",
	localLink: "本地源码",
	protected: "受保护",
	emptyInstalled: "没有匹配的已安装项目",
	manageComplete: "操作完成。",
	manageFailed: "部分操作失败，请查看对应插件的错误与恢复结果。",
	manageCancelled: "操作已取消，请查看对应插件的恢复结果。",
	confirmRemoveSkill: "这个 Skill 由所有 Profile 共用。卸载会影响所有 Profile；原目录及本地修改会完整保留到 DSH_HOME/skill-backups，操作结果会显示备份路径。确定卸载？",
	confirmRemovePlugin: "确定卸载这个插件？",
	browseOnly: "未识别安装源",
	browseOnlyHint: "暂未识别到匹配当前项目的安装源，不代表无法安装；请前往 GitHub 查看说明。",
	capabilityReview: "收录依据待复核",
	capabilityReviewReason: "仓库结构尚未重新确认，历史收录不代表当前可安装",
	capabilitySource_verified: "来源已预检",
	capabilitySource_verifiedReason: "已核对清单元数据中的来源、Bundle 声明及版本；发布归档、安装、宿主兼容及功能仍需验证",
	capabilitySource_invalid: "来源预检未通过",
	capabilitySource_invalidReason: "来源结构或身份检查未通过，可重新预检或查看作者说明",
	capabilitySource_unavailable: "来源暂未确认",
	capabilitySource_unavailableReason: "本次未能完成来源检查，可能为网络或限流；不代表无法安装",
	capabilitySource_stale: "来源需重新预检",
	capabilitySource_staleReason: "历史来源检查已过期，安装前会重新核对当前版本",
	capabilityReady: "已识别安装源",
	capabilityReadyReason: "点击后核对精确来源与脚本；识别到安装源不保证安装成功或通过安全审核",
	capabilityManual: "安装后需配置",
	capabilityManualReason: "目录提供安装目标，但作者标注安装后还需配置",
	capabilityBrowse: "生态项目",
	capabilityUnavailable: "未识别安装源",
	capabilityNoSourceReason: "暂未识别到匹配的安装源，不代表无法安装；请查看项目说明",
	capabilityUnverifiedReason: "尚未确认符合 DSH 插件结构",
	capabilityInstalled: "已安装",
	capabilityInstalledReason: "当前 Profile 已包含这个项目",
	viewDetails: "查看详情",
	reviewInstall: "安装",
	viewProject: "查看项目",
	closeDetails: "关闭详情",
	readmeSummary: "README 摘要",
	detailRefreshing: "正在读取权威详情…",
	detailFallback: "权威详情暂时不可用，以下显示榜单摘要",
	installDecision: "安装决策",
	installAvailableTitle: "可以在 DSH 中预检安装",
	installAvailableHint: "继续后会先核对精确版本、仓库身份、内容完整性和安装脚本，再由你确认是否写入。",
	installUnavailableTitle: "暂不支持在 DSH 内安装",
	installedDecisionTitle: "已安装到当前 Profile",
	installedDecisionHint: "前往已安装管理，可以启停、更新或卸载这个项目。",
	installContextMissing: "目录未提供权限、账号和首次使用说明；继续前请查看作者文档。",
	afterInstall: "安装后",
	afterInstallConfigure: "完成作者要求的配置，再验证插件是否运行",
	afterInstallVerify: "可能需要重启 DSH，再验证插件是否运行",
	projectAndRankingDetails: "项目与排名信息",
	reviewAndInstall: "核对并安装",
	trustDetails: "信任证据",
	projectType: "项目形态",
	license: "许可证",
	lastMaintained: "最近维护",
	language: "主要语言",
	homepage: "项目主页",
	configurationRequirement: "额外配置",
	configurationRequiredUnknown: "需要；具体步骤由作者文档说明",
	configurationNotDeclared: "目录未标注；安装前仍应核对作者文档",
	notSecurityReview: "这里核对的是结构与来源一致性，不是代码安全认证。",
	notAvailable: "暂无",
	catalogInstallSource: "目录安装源",
	installing: "安装中",
	confirmTitle: "确认安装",
	confirmProjectTitle: "安装 {name}？",
	confirmScripts: "安装时将执行脚本：",
	confirmRestart: "安装后需重启 DSH，并检查插件是否正常运行。",
	confirmSecurityNote: "来源校验不等于安全审核。",
	confirmBody: "确认后，将写入当前 DSH 配置或 Skills 目录。",
	installSummary: "安装影响",
	sourceMatched: "版本已固定，仓库身份匹配",
	sourceIdentityUnavailable: "版本已固定，发布者身份待人工确认",
	commitLocked: "仓库 commit 已固定",
	willRunScriptsPrefix: "将执行",
	buildScriptsUnit: "个 npm 生命周期脚本",
	noBuildScripts: "未发现 npm 生命周期脚本",
	restartAfterInstall: "安装后需重启验证",
	noRestartRequired: "无需重启",
	viewInstallTechnicalEvidence: "来源与校验详情",
	viewTechnicalEvidence: "查看技术证据",
	confirmSpec: "安装源",
	requestedSource: "目录声明",
	resolvedSource: "实际安装",
	integrity: "内容完整性",
	riskApproval: "我已核对安装来源、脚本与风险，同意安装。",
	confirmNeedConfig: "这个插件可能还需要额外配置。",
	confirm: "开始安装",
	cancel: "取消",
	github: "GitHub",
	more: "加载更多",
	stars: "仓库 Stars",
	threeDay: "3日",
	risingScore: "新锐指数",
	repositoryStars: "所属仓库 Stars，非插件独立使用量",
	weekly: "7日",
	daily: "今日",
	hotScore: "热度分",
	basis_hot: "排序依据：近7日增长与仓库累计关注度；数据不足不入榜",
	basis_rising: "新锐指数0～100分：近3日仓库增长，按原有规模修正；至少净增3星",
	basis_total: "排序依据：GitHub Stars 总数",
	basis_category: "分类筛选保持总榜顺序",
	basis_search: "搜索结果按名称与内容相关性排序",
	basisShort_hot: "综合热度榜",
	basisShort_rising: "新锐榜",
	basisShort_total: "Stars 总榜",
	basisShort_category: "分类筛选",
	basisShort_search: "相关性排序",
	restart: "配置已更新；请重启 DSH，使变更生效。",
	phase_queued: "排队中",
	phase_validating: "验证中",
	phase_downloading: "下载中",
	"phase_waiting-profile-lock": "等待写入 profile",
	phase_installing: "安装中",
	phase_installed: "写入完成",
	phase_failed: "安装失败",
	phase_cancelled: "已取消",
	installProgressLabel: "安装进度",
	installProgressEstimate: "阶段",
	installStageCheck: "检查",
	installStageDownload: "下载",
	installStageApply: "安装",
	installStageReady: "完成",
	installStatusQueued: "正在准备安装",
	installStatusValidating: "正在核对安装源和风险证据",
	installStatusDownloading: "正在下载插件文件",
	installStatusWaiting: "正在等待其他插件操作完成",
	installStatusWriting: "正在写入当前 DSH Profile",
	installStatusProfileCheck: "正在检查当前 DSH Profile",
	installStatusDependencies: "正在安装依赖",
	installStatusFinalCheck: "正在确认 Profile 配置可组合",
	installStatusInstalled: "文件已写入，配置检查已结束",
	installStatusFailed: "操作没有完成",
	installStatusCancelled: "安装已取消",
	installErrorNext: "建议操作",
	installErrorDetails: "查看技术详情",
	installErrorPackages: "涉及依赖",
	installError_peer_title: "依赖版本不兼容",
	installError_peer_summary: "当前宿主或 Profile 无法满足插件声明的依赖。",
	installError_peer_hint: "核对作者支持的 DSH 版本及配套插件，再重试。",
	installError_build_title: "插件构建失败",
	installError_build_summary: "作者源码包或依赖的安装脚本执行失败。",
	installError_build_hint: "检查作者要求的构建环境；若作者提供预构建包，可使用该安装来源。",
	installError_policy_title: "操作受当前策略限制",
	installError_policy_summary: "当前 Profile 的版本等待期或发布渠道策略阻止安装。",
	installError_policy_hint: "等待策略允许，或自行调整当前 Profile 的策略后重试。",
	installError_ignoredBuilds_title: "依赖构建被安全策略拦截",
	installError_ignoredBuilds_summary: "pnpm 阻止了部分依赖运行安装脚本，因此插件没有安装完成。",
	installError_ignoredBuilds_hint: "先查看任务恢复结果。回滚后 pnpm approve-builds 可能不再列出这些依赖；请按指南核对 pnpm 版本，在当前插件目录中明确批准所需构建后，再重试。不要全局放行脚本。",
	installError_network_title: "下载连接中断",
	installError_network_summary: "插件或依赖没有完整下载，当前 Profile 未完成这次安装。",
	installError_network_hint: "检查网络、代理或 DNS，连接恢复后点击重试。",
	installError_timeout_title: "下载等待时间过长",
	installError_timeout_summary: "安装在限定时间内没有完成，操作已停止。",
	installError_timeout_hint: "确认网络稳定后重试；大型依赖可能需要更长时间。",
	installError_permission_title: "当前 Profile 无法写入",
	installError_permission_summary: "DSH 没有足够权限修改插件目录或相关文件。",
	installError_permission_hint: "检查 Profile 目录的所有者和写入权限后重试。",
	installError_lockfile_title: "依赖记录不一致",
	installError_lockfile_summary: "当前 Profile 的依赖记录与已安装文件不匹配。",
	installError_lockfile_hint: "先在 DSH 插件诊断中修复 Profile 依赖，再重试安装。",
	installError_profile_title: "操作后的配置无法加载",
	installError_profile_summary: "插件文件已处理，但 DSH 配置检查没有通过。系统会尽量保留或恢复原配置。",
	installError_profile_hint: "打开诊断页查看 Profile 问题；修复冲突后再重试。",
	installError_source_title: "安装源未通过验证",
	installError_source_summary: "榜单没有找到可验证的插件安装源，因此没有修改当前 Profile。",
	installError_source_hint: "前往项目 GitHub 核对作者提供的安装方式，或等待榜单数据更新。",
	installError_generic_title: "操作没有完成",
	installError_generic_summary: "DSH 没能完成这次插件操作。",
	installError_generic_hint: "展开技术详情确认具体原因，处理后再点击重试。",
	evidence: "查看信任证据",
	evidenceSignalIndexed: "已进入 DSHEval 索引",
	evidenceSignalDshSkill: "声明为 DSH Skill",
	evidenceSignalAgentSkill: "声明为通用 Agent Skill",
	evidenceSignalThemeBundle: "命中 DSH/Cordis 主题 Bundle 结构",
	evidenceSignalDshBundle: "命中 DSH Bundle 结构",
	evidenceSignalDshClient: "已识别 DSH 客户端插件结构",
	evidenceSignalDshPlugin: "已识别 DSH 宿主插件结构",
	evidenceSignalInstallSource: "安装源可解析",
	evidenceCaveatNotSecurityReview: "这些证据不代表代码已通过安全审核；安装前仍需核对精确来源、脚本与权限。",
	"risk_lifecycle-scripts_summary": "安装会执行包生命周期脚本",
	"risk_lifecycle-scripts_detail": "安装器会运行上方列出的包脚本。",
	"risk_repository-identity_summary": "npm 包未能与目录仓库自动绑定",
	"risk_repository-identity_detail": "包未声明可识别的 GitHub repository；精确版本已锁定，但发布者身份仍需人工判断。",
	"risk_skill-content_summary": "Skill 是会影响模型行为的主动内容",
	"risk_skill-content_detail": "将复制该 commit 的内容到所有 Profile 共用的全局 Skills。若同名内容变化，会先完整备份原目录与本地修改到 DSH_HOME/skill-backups，再替换；失败时尝试恢复。安装器拒绝符号链接，结构验证不等于安全审核。",
	"risk_restart-required_summary": "写入成功后仍需重启并验证运行状态",
	"risk_restart-required_detail": "安装后的配置检查只证明 Profile 可以组合，不代表插件已经在当前 DSH 进程中运行。",
	trust_indexed: "已收录，结构待确认",
	trust_structured: "符合 DSH 插件结构",
	"trust_install-source": "目录含安装目标",
	"form_dsh-bundle": "DSH Bundle",
	"form_dsh-client": "DSH 客户端插件",
	"form_dsh-plugin": "DSH 插件",
	"form_dsh-skill": "DSH Skill",
	"form_agent-skill": "Agent Skill",
	form_theme: "主题",
	"form_mcp-integration": "MCP 集成",
	"form_desktop-app": "桌面应用",
	"form_ecosystem-project": "生态项目",
	form_candidate: "候选项目",
	activation_pending: "运行状态：等待安装",
	"activation_not-applicable": "请在新会话中确认 Skill 是否可用。",
	"activation_configuration-required": "状态：已安装，完成作者要求的配置后再验证",
	"activation_configuration-valid": "运行状态：配置可组合，当前进程尚未验证",
	"activation_restart-required": "运行状态：需要重启后验证",
	activation_live: "运行状态：宿主已加载",
	activation_inert: "运行状态：已写入但未激活",
	activation_broken: "运行状态：安装或配置验证失败",
	activation_unknown: "运行状态：尚未取得运行时证据",
	skillHint: "这是 Skill，不能通过 dsh plugin 一键装进 Web profile。",
	sourceSave: "保存地址",
	sourceSaving: "正在保存…",
	sourceSaved: "数据源已保存",
	sourceInvalid: "请输入 HTTP 或 HTTPS 地址",
	sourceReadOnly: "当前连接无法修改数据源",
	cardTitle: "榜单数据源",
	cardHint: "插件和 Skills 共用此数据源。保存后生效，也可以使用自定义榜单地址。",
	diagLoading: "正在扫描当前 DSH Profile…",
	diagLoadFail: "诊断加载失败",
	diagOk: "已检查项目无错误",
	diagIssues: "发现需要处理的问题",
	diagErrors: "错误",
	diagWarnings: "警告",
	diagConflicts: "加载冲突",
	diagDeps: "依赖问题",
	diagRefresh: "重新检查",
	diagDetails: "检查详情",
	diagScopeShort: "检查范围：配置与宿主加载",
	diagCatalogTitle: "榜单数据源",
	diagInventory: "安装概览",
	diagOfficial: "官方 Bundle",
	diagCommunity: "社区 Bundle",
	diagBundles: "Bundle 详情",
	diagSkills: "本地 Skills",
	diagPatch: "用户补丁层",
	diagOrphans: "孤立停用项"
};
const en = {
	taskDependencies: "Processing dependencies",
	taskNetworkRetry: "Network request failed; waiting to retry",
	taskRecoveringDependencies: "Restoring previous dependencies; please wait",
	taskResolved: "Resolved",
	taskReused: "Reused",
	taskDownloaded: "Downloaded",
	taskAdded: "Added",
	taskLogs: "Execution details",
	taskRestored: "Previous dependencies restored.",
	taskRecoveryFailed: "Automatic recovery failed. Check and repair the current configuration first.",
	taskProfileDirectory: "Current plugin profile directory",
	taskUninstallRestart: "Restart DSH for removal to take effect.",
	taskUpdateRestart: "Restart DSH to apply the update, then check the plugin.",
	taskInstallRestart: "Restart DSH, then check the plugin.",
	taskCheckConfiguration: "Complete the configuration required by the author first.",
	buildRecoveryGuide: "Build approval and retry guide",
	task_install_installing: "Installing",
	task_install_installed: "Installed",
	task_install_failed: "install failed",
	task_install_cancelled: "install cancelled",
	task_install_progress: "install progress",
	task_update_installing: "Updating",
	task_update_installed: "Updated",
	task_update_failed: "update failed",
	task_update_cancelled: "update cancelled",
	task_update_progress: "update progress",
	task_uninstall_installing: "Uninstalling",
	task_uninstall_installed: "Uninstalled",
	task_uninstall_failed: "uninstall failed",
	task_uninstall_cancelled: "uninstall cancelled",
	task_uninstall_progress: "uninstall progress",
	submissionRejected: "The submission was not accepted. Review the error before trying again.",
	submissionSending: "Confirming the submission result. New installations and updates are temporarily blocked.",
	submissionUncertain: "The submission result is unknown; the server may already be running it. Check the result or cancel this submission.",
	submissionCancelling: "Waiting for the server to confirm cancellation before releasing this submission.",
	querySubmission: "Check result",
	cancelSubmission: "Cancel this submission",
	recentTasks: "Recent activity",
	viewLatestTaskResult: "View latest task details",
	taskRecovering: "Restoring installation and update task status…",
	taskTrackingError: "Could not read task status. The task may still be running.",
	reviewUpdateTitle: "Review updates",
	reviewUpdateHint: "Review each plugin’s current version, pinned target and execution effects before confirming.",
	confirmUpdate: "Confirm updates",
	updatePreflightWait: "Checking groups of 20. Failed checks and unavailable updates are listed separately; review the available updates before anything is installed.",
	updatePreflightCancelled: "Update verification cancelled. No updates have started.",
	updatePreflightIncomplete: "Complete verification was not received for every plugin. No updates have started. Please retry.",
	updateSubmitting: "Submitting the approved updates…",
	preflightWait: "Waiting for source verification. A slow connection may take longer; installation has not started.",
	preflightCancelled: "Stopped waiting for source verification. Installation has not started.",
	clientErrorTitle: "The plugin page could not be displayed",
	clientErrorHint: "Reopen this page to recover. Running installations are not cancelled; their status will be loaded again.",
	diagExport: "Export diagnostic summary",
	runtime_loaded: "Host loaded",
	"runtime_restart-required": "Restart to verify",
	"runtime_missing-services": "Required services missing",
	runtime_failed: "Host load failed",
	runtime_inactive: "Inactive",
	runtime_unknown: "Unverified",
	runtimeScope: "Status reflects current host loading only. Verify plugin pages and features by using them.",
	runtimeDetails: "Loading details",
	manageOptions: "Update settings",
	managedSelfDescription: "Discover, install and manage DSH plugins and Skills.",
	managedPreserveHint: "Check the current source for updates; without source records, check compatible versions only.",
	managedLatestHint: "Use the latest release or default branch, which may cross major versions. Review the exact target before updating.",
	diagExportHint: "Exports only the version, counts and issue codes; excludes paths, addresses, plugin inventories and raw logs.",
	diagExportFailed: "Could not export the diagnostic summary. Please retry.",
	expandDescription: "Show description",
	collapseDescription: "Hide description",
	nav: "Rankings",
	title: "dsh-top100",
	subtitle: "Discover, review, and install DSH plugins",
	rankings: "Plugin market",
	skillsMarket: "Skill market",
	installedPage: "Installed",
	diagnostics: "Diagnostics",
	search: "Search",
	searchPlaceholder: "Search name, summary, or tags",
	searchResults: "Search results",
	catalogMatches: "Catalog matches",
	showingResults: "showing",
	catalogRank: "Catalog rank",
	filter: "Filters",
	filterHint: "Adjust which catalog entries are included.",
	catalogScope: "Marketplace scope",
	catalogScope_plugins: "Plugins",
	catalogScope_skills: "Skills",
	catalogScope_ecosystem: "Ecosystem",
	catalogScopeHint_plugins: "Verified DSH Plugins; installation availability is filtered separately",
	catalogScopeHint_skills: "A separate Skills library that does not participate in Plugin rankings",
	catalogScopeHint_ecosystem: "Confirmed DSH apps and related projects that do not participate in rankings",
	exploreMore: "Explore more",
	installAvailability: "Install source",
	installAvailability_installable: "Source identified",
	installAvailability_all: "All plugins",
	installAvailability_unavailable: "No install source identified",
	installableOnly: "With install source only",
	sortBy: "Sort",
	starsSort: "GitHub Stars",
	starsShort: "Stars",
	starsBrowsing: "Browse by Stars",
	allCategories: "All categories",
	categoryRanking: "Category ranking",
	hot: "Top100",
	rising: "Rising",
	total: "All",
	category: "Category filter",
	categoryFilter: "Plugin category",
	skillCategoryFilter: "Skill category",
	hideSkills: "Skills directory",
	hideSkillsHint: "Skills use a separate directory and do not participate in Plugin rankings",
	hiddenSkillsPrefix: "Hidden",
	skillRepositories: "Skill repositories",
	showCandidates: "Explore candidates and ecosystem projects",
	showCandidatesHint: "Also show candidates that cannot currently be installed directly",
	clearFilters: "Clear filters",
	entries: "entries",
	pluginEntries: "plugins",
	skillEntries: "Skills",
	cachedFresh: "Local snapshot available",
	cachedStale: "Showing an older snapshot",
	dataUpdateDelayed: "Data update delayed. Showing the {date} snapshot (Beijing time). Rankings will update when new data is published.",
	cacheAgeUnknown: "cache age unknown",
	minutesAgo: "minutes ago",
	hoursAgo: "hours ago",
	cacheFallback: "Snapshot fallback",
	updated: "Snapshot",
	source: "Source",
	empty: "No matching projects in this section",
	emptyRanking: "No projects meet the observation and ranking criteria yet. New data needs 3 or 7 days; browse total Stars meanwhile.",
	loadingRankings: "Loading rankings…",
	loadError: "Could not load the hosted rankings",
	installError: "Plugin installation failed",
	retry: "Retry",
	rank: "Rank",
	retryReloadRequired: "The catalog has changed. Refresh these results before running a new install preflight.",
	install: "Install",
	preflighting: "Checking source",
	batchInstall: "Install selected",
	batchProgress: "Batch progress",
	batchComplete: "File operations finished; continue with the runtime verification shown for each item.",
	installTaskRunning: "Operation in progress",
	installTaskComplete: "Operation result available",
	viewInstallProgress: "View task progress",
	viewInstallResult: "View task result",
	installActivityTitle: "Plugin task",
	installActivityActiveHint: "The operation continues in the background; closing this window will not interrupt it.",
	installActivityCompleteHint: "The task has finished. Review the result or try again here.",
	installTaskRecovered: "Recovered the previous active installation task.",
	installTaskUnavailable: "A previous task record has expired, so its final result is unknown. Check Installed or Diagnostics for the current state.",
	dismissTaskNotice: "Dismiss",
	cancelFailed: "The cancel request failed. The task may still be running; authoritative status polling will continue.",
	closeInstallActivity: "Close task window",
	continueBrowsing: "Continue browsing",
	batchSucceeded: "Succeeded",
	batchFailed: "Failed",
	batchCancelled: "Cancelled",
	batchActive: "Active",
	batchRestartRequired: "Restart pending",
	batchConfigurationRequired: "Configuration pending",
	batchLimit: "A batch can contain at most 20 items",
	select: "Select",
	installed: "Installed",
	manage: "Manage",
	searchInstalled: "Search installed plugins or Skills",
	loadingInstalled: "Loading installed items…",
	installedManagerTitle: "Installed plugin management",
	installedManagerHint: "Plugins belong to this Profile. Skills are shared globally; their complete directory is backed up before removal or replacement.",
	profile: "Profile",
	managedItems: "items",
	bundleKind: "Plugin (Bundle)",
	skillKind: "Skill",
	project: "Project",
	installedPluginFallback: "Installed DSH plugin",
	installedSkillFallback: "Installed local Skill",
	noChineseDescription: "No Chinese summary available",
	update: "Update",
	checkUpdates: "Check for updates",
	noUpdateAvailable: "No update available",
	refreshInstalled: "Refresh",
	updateAll: "Check updates in batch",
	updateStrategy: "Update source",
	updatePreserve: "Keep original source (recommended)",
	updateLatest: "Switch to latest",
	updatePreserveHint: "Keep the original version range, release channel, or GitHub branch. Exact npm versions without source records stay within compatible versions.",
	updateLatestHint: "Use npm latest or the GitHub default branch. This may cross major versions or leave the original channel; review the exact target before confirming.",
	updateBatchLimit: "This run checks the first items shown. Refresh after completion or search to process the rest:",
	updateCheckResults: "Items excluded from this update",
	updateCheckFailed: "Check failed",
	updateStatus_current: "No update within the current source",
	updateStatus_available: "Update available within the current source",
	updateStatus_failed: "Version check failed; refresh to retry",
	updateStatus_unknown: "Remote version or commit has not been checked",
	updateCheckedAt: "Version checked",
	updateCheckDetails: "View check details",
	updateIssueCurrent: "The target is the same or older; this item was skipped.",
	updateIssueStrategy: "The original branch could not be established. Choose an update strategy and retry.",
	updateIssueFailed: "Source verification failed. Review the details, resolve the issue and retry.",
	protectedManageHint: "This plugin cannot be changed here. Maintain it through its original installation method.",
	localManageHint: "Update and rebuild local plugins in their source directory, then restart DSH.",
	maintenanceGuide: "Maintenance guide",
	reviewSkillInstall: "Install",
	browseSkillUpdates: "Check updates in Skills",
	skillReinstallHint: "Find the original project in Skills and choose Install / update Skill to review its source. The complete existing directory is backed up before replacement.",
	skillBackupSaved: "Original Skill content backed up",
	skillBackupSavedHint: "Local edits are included. Recover files from the directories below. Skills are shared by every Profile.",
	retryFailedChecks: "Retry failed checks",
	noUpdatesPrepared: "No updates are ready to confirm. Review the results for each item.",
	updateTarget: "Update source",
	sourceLatestVersion: "Target version in current source",
	sourceMigrationTitle: "Legacy channel dependencies need migration",
	sourceMigrationHint: "This Profile uses moving tags such as beta/latest directly. The package manager may update unselected plugins. Pin the currently installed versions and preserve their channels before installing, updating or removing bundles.",
	sourceMigrationAction: "Pin current versions and keep channels",
	sourceMigrationWorking: "Checking and migrating…",
	sourceMigrationConfirm: "Pin these dependencies to their currently installed versions, synchronize the lockfile, and record the original channels for future update checks. This does not download, upgrade, or run install scripts. Apply these changes?",
	sourceMigrationComplete: "Current versions are pinned and original channels are saved. You can check for updates again.",
	sourceMigrationFailed: "Migration success could not be confirmed. The current state has been refreshed; review the details before retrying. Complex workspaces require their original maintenance workflow.",
	globalSkill: "Global Skill · shared by all Profiles",
	skillModification_unchanged: "Matches the installed content record",
	skillModification_modified: "Local changes detected; a complete backup will be kept",
	skillModification_unknown: "No matching record; a complete backup will be kept",
	descriptionLocale: "en",
	updateAvailable: "Update available",
	uninstall: "Uninstall",
	enable: "Enable",
	disable: "Disable",
	enabled: "Enabled in config",
	disabled: "Disabled in config",
	version: "Version",
	latest: "Latest",
	localLink: "Local source",
	protected: "Protected",
	emptyInstalled: "No matching installed items",
	manageComplete: "Operation complete.",
	manageFailed: "Some operations failed. Check the affected plugins for errors and recovery results.",
	manageCancelled: "Operations were cancelled. Check the affected plugins for recovery results.",
	confirmRemoveSkill: "This Skill is shared by every Profile. Removal affects all Profiles. Its entire directory and local changes will be kept in DSH_HOME/skill-backups; the result will show the backup path. Uninstall it?",
	confirmRemovePlugin: "Uninstall this plugin?",
	browseOnly: "No install source identified",
	browseOnlyHint: "No matching install source has been identified; this does not mean installation is impossible. Check GitHub for instructions.",
	capabilityReview: "Catalog evidence needs review",
	capabilityReviewReason: "Repository structure has not been reconfirmed; past indexing does not prove installability",
	capabilitySource_verified: "Source preflight passed",
	capabilitySource_verifiedReason: "Manifest metadata checked for identity, Bundle declaration and version; release archives, installation, host compatibility and functionality remain unverified",
	capabilitySource_invalid: "Source preflight failed",
	capabilitySource_invalidReason: "Source structure or identity check failed; retry preflight or read the author instructions",
	capabilitySource_unavailable: "Source not yet confirmed",
	capabilitySource_unavailableReason: "Source check could not finish, possibly due to network or rate limits; this does not mean installation is impossible",
	capabilitySource_stale: "Source needs a fresh check",
	capabilitySource_staleReason: "Historical source check expired; installation will recheck the current version",
	capabilityReady: "Install source identified",
	capabilityReadyReason: "Review exact source and scripts after click; source recognition does not guarantee installation or security",
	capabilityManual: "Configure after install",
	capabilityManualReason: "The catalog has an install target, and the author marks additional configuration as required",
	capabilityBrowse: "Ecosystem project",
	capabilityUnavailable: "No install source identified",
	capabilityNoSourceReason: "No matching source has been identified yet; check the project instructions for other installation methods",
	capabilityUnverifiedReason: "DSH plugin structure has not been confirmed",
	capabilityInstalled: "Installed",
	capabilityInstalledReason: "This item is already in the current profile",
	viewDetails: "View details",
	reviewInstall: "Install",
	viewProject: "View project",
	closeDetails: "Close details",
	readmeSummary: "README summary",
	detailRefreshing: "Loading authoritative details…",
	detailFallback: "Authoritative details are unavailable; showing the ranking summary",
	installDecision: "Install decision",
	installAvailableTitle: "Available for DSH preflight",
	installAvailableHint: "Continue to verify the exact version, repository identity, content integrity, and install scripts before anything is written.",
	installUnavailableTitle: "Not installable inside DSH",
	installedDecisionTitle: "Installed in the current profile",
	installedDecisionHint: "Open Installed management to enable, disable, update, or uninstall this item.",
	installContextMissing: "Permissions, accounts, and first-use instructions are not in the catalog; review the author's documentation before continuing.",
	afterInstall: "After installation",
	afterInstallConfigure: "Complete the author's configuration, then verify that the plugin is running",
	afterInstallVerify: "You may need to restart DSH, then verify that the plugin is running",
	projectAndRankingDetails: "Project and ranking details",
	reviewAndInstall: "Review and install",
	trustDetails: "Trust evidence",
	projectType: "Project type",
	license: "License",
	lastMaintained: "Last maintained",
	language: "Primary language",
	homepage: "Project homepage",
	configurationRequirement: "Additional configuration",
	configurationRequiredUnknown: "Required; consult the author's documentation for the exact steps",
	configurationNotDeclared: "Not declared in the catalog; still check the author's documentation",
	notSecurityReview: "This checks structure and source consistency; it is not a code security certification.",
	notAvailable: "Not available",
	catalogInstallSource: "Catalog install source",
	installing: "Installing",
	confirmTitle: "Confirm installation",
	confirmProjectTitle: "Install {name}?",
	confirmScripts: "Installation will run these scripts:",
	confirmRestart: "Restart DSH after installation and check that the plugin is running.",
	confirmSecurityNote: "Source verification is not a security review.",
	confirmBody: "Once confirmed, this writes to your current DSH profile or Skills directory.",
	installSummary: "Installation effects",
	sourceMatched: "Version pinned; repository identity matched",
	sourceIdentityUnavailable: "Version pinned; publisher identity needs manual review",
	commitLocked: "Repository commit pinned",
	willRunScriptsPrefix: "Will run",
	buildScriptsUnit: "npm lifecycle script(s)",
	noBuildScripts: "No npm lifecycle scripts detected",
	restartAfterInstall: "Restart to verify",
	noRestartRequired: "No restart required",
	viewInstallTechnicalEvidence: "Source and verification details",
	viewTechnicalEvidence: "View technical evidence",
	confirmSpec: "Install spec",
	requestedSource: "Catalog source",
	resolvedSource: "Resolved install",
	integrity: "Integrity",
	riskApproval: "I reviewed the install source, scripts, and risks and agree to install.",
	confirmNeedConfig: "This plugin may require extra configuration.",
	confirm: "Start install",
	cancel: "Cancel",
	github: "GitHub",
	more: "Load more",
	stars: "Repository Stars",
	threeDay: "3d",
	risingScore: "Rising index",
	repositoryStars: "Stars of the entire repository, not plugin usage",
	weekly: "7d",
	daily: "Today",
	hotScore: "Heat score",
	basis_hot: "Ranked by 7-day growth and repository Stars; requires valid observations",
	basis_rising: "Rising index (0–100): size-adjusted 3-day repository growth; at least 3 new Stars",
	basis_total: "Ranked by total GitHub Stars",
	basis_category: "Category filters retain the overall ranking order",
	basis_search: "Search results are ranked by name and content relevance",
	basisShort_hot: "Composite heat",
	basisShort_rising: "Recent momentum",
	basisShort_total: "Stars ranking",
	basisShort_category: "Category filter",
	basisShort_search: "Relevance order",
	restart: "Configuration updated. Restart DSH to apply the changes.",
	phase_queued: "Queued",
	phase_validating: "Validating",
	phase_downloading: "Downloading",
	"phase_waiting-profile-lock": "Waiting for profile",
	phase_installing: "Installing",
	phase_installed: "Files written",
	phase_failed: "Failed",
	phase_cancelled: "Cancelled",
	installProgressLabel: "Installation progress",
	installProgressEstimate: "Stage",
	installStageCheck: "Check",
	installStageDownload: "Download",
	installStageApply: "Install",
	installStageReady: "Ready",
	installStatusQueued: "Preparing the installation",
	installStatusValidating: "Checking the source and risk evidence",
	installStatusDownloading: "Downloading plugin files",
	installStatusWaiting: "Waiting for another plugin operation",
	installStatusWriting: "Writing to the current DSH profile",
	installStatusProfileCheck: "Checking the current DSH profile",
	installStatusDependencies: "Installing dependencies",
	installStatusFinalCheck: "Confirming that the Profile configuration composes",
	installStatusInstalled: "Files written; configuration check finished",
	installStatusFailed: "Operation did not finish",
	installStatusCancelled: "Installation cancelled",
	installErrorNext: "What to do",
	installErrorDetails: "View technical details",
	installErrorPackages: "Affected dependencies",
	installError_peer_title: "Dependency versions are incompatible",
	installError_peer_summary: "The host or Profile cannot satisfy the plugin’s declared dependencies.",
	installError_peer_hint: "Check the author’s supported DSH version and companion plugins, then retry.",
	installError_build_title: "Plugin build failed",
	installError_build_summary: "A source package or dependency install script failed.",
	installError_build_hint: "Check the required build environment, or use the author’s prebuilt package if available.",
	installError_policy_title: "Operation restricted by Profile policy",
	installError_policy_summary: "A version waiting period or release channel policy prevented installation.",
	installError_policy_hint: "Wait until the policy permits installation, or explicitly adjust your Profile policy before retrying.",
	installError_ignoredBuilds_title: "Dependency build blocked by safety policy",
	installError_ignoredBuilds_summary: "pnpm prevented some dependencies from running install scripts, so installation could not finish.",
	installError_ignoredBuilds_hint: "Check the task recovery result. After rollback, pnpm approve-builds may no longer list these dependencies. Follow the guide for your pnpm version, explicitly approve the required builds in this profile, then retry. Do not allow all scripts globally.",
	installError_network_title: "Download connection interrupted",
	installError_network_summary: "The plugin or its dependencies were not fully downloaded, so the profile was not updated.",
	installError_network_hint: "Check the network, proxy, or DNS, then retry when the connection is stable.",
	installError_timeout_title: "Download took too long",
	installError_timeout_summary: "The installation did not finish within the allowed time and was stopped.",
	installError_timeout_hint: "Retry on a stable connection; large dependencies may need more time.",
	installError_permission_title: "Profile is not writable",
	installError_permission_summary: "DSH does not have permission to change the plugin directory or related files.",
	installError_permission_hint: "Check the profile directory owner and write permissions, then retry.",
	installError_lockfile_title: "Dependency records do not match",
	installError_lockfile_summary: "The profile lockfile does not match the files currently installed.",
	installError_lockfile_hint: "Repair the profile dependencies from Diagnostics before retrying.",
	installError_profile_title: "The updated profile could not load",
	installError_profile_summary: "Plugin files were processed, but the DSH configuration check failed. The original profile is preserved or restored when possible.",
	installError_profile_hint: "Open Diagnostics, resolve the profile conflict, and retry.",
	installError_source_title: "Install source could not be verified",
	installError_source_summary: "The catalog does not contain a verifiable install source, so the profile was not changed.",
	installError_source_hint: "Check the author's instructions on GitHub or wait for the catalog to refresh.",
	installError_generic_title: "Operation did not finish",
	installError_generic_summary: "DSH could not complete this plugin operation.",
	installError_generic_hint: "Expand the technical details, resolve the reported issue, and retry.",
	evidence: "Review trust evidence",
	evidenceSignalIndexed: "Listed in the DSHEval index",
	evidenceSignalDshSkill: "Declared as a DSH Skill",
	evidenceSignalAgentSkill: "Declared as a general Agent Skill",
	evidenceSignalThemeBundle: "Matches the DSH/Cordis theme Bundle structure",
	evidenceSignalDshBundle: "Matches the DSH Bundle structure",
	evidenceSignalDshClient: "DSH client plugin structure identified",
	evidenceSignalDshPlugin: "DSH host plugin structure identified",
	evidenceSignalInstallSource: "Install source resolved",
	evidenceCaveatNotSecurityReview: "This evidence is not a security review. Verify the exact source, scripts, and permissions before installing.",
	"risk_lifecycle-scripts_summary": "Installation will run package lifecycle scripts",
	"risk_lifecycle-scripts_detail": "The installer will run the package scripts listed above.",
	"risk_repository-identity_summary": "The npm package could not be linked to the catalog repository",
	"risk_repository-identity_detail": "The package does not declare a recognizable GitHub repository. The exact version is pinned, but publisher identity still needs manual review.",
	"risk_skill-content_summary": "A Skill is active content that can influence model behavior",
	"risk_skill-content_detail": "Content from this commit is installed into global Skills shared by every Profile. Changed content with the same name replaces the existing directory only after a complete backup, including local changes, is kept in DSH_HOME/skill-backups. Recovery is attempted on failure. Symbolic links are rejected; structural validation is not a security review.",
	"risk_restart-required_summary": "Restart and runtime verification are still required after files are written",
	"risk_restart-required_detail": "The post-install check only proves that the Profile composes; it does not prove that the plugin is running in the current DSH process.",
	trust_indexed: "Listed; structure unconfirmed",
	trust_structured: "Matches the DSH plugin structure",
	"trust_install-source": "Catalog has an install target",
	"form_dsh-bundle": "DSH Bundle",
	"form_dsh-client": "DSH client plugin",
	"form_dsh-plugin": "DSH plugin",
	"form_dsh-skill": "DSH Skill",
	"form_agent-skill": "Agent Skill",
	form_theme: "Theme",
	"form_mcp-integration": "MCP integration",
	"form_desktop-app": "Desktop app",
	"form_ecosystem-project": "Ecosystem project",
	form_candidate: "Candidate",
	activation_pending: "Runtime: waiting for installation",
	"activation_not-applicable": "Check that the Skill is available in a new session.",
	"activation_configuration-required": "Status: installed; complete the author's configuration before verification",
	"activation_configuration-valid": "Runtime: profile composes; current process not verified",
	"activation_restart-required": "Runtime: restart required before verification",
	activation_live: "Runtime: host loaded",
	activation_inert: "Runtime: written but inactive",
	activation_broken: "Runtime: installation or configuration check failed",
	activation_unknown: "Runtime: no authoritative evidence yet",
	skillHint: "This is a Skill and cannot be installed into the Web profile with dsh plugin.",
	sourceSave: "Save URL",
	sourceSaving: "Saving…",
	sourceSaved: "Catalog source saved",
	sourceInvalid: "Enter an HTTP or HTTPS URL",
	sourceReadOnly: "This connection cannot change the catalog source",
	cardTitle: "Rankings source",
	cardHint: "Plugins and Skills share this source. Save to apply, or use your own catalog URL.",
	diagLoading: "Scanning the current DSH profile…",
	diagLoadFail: "Could not load diagnostics",
	diagOk: "No errors in checked items",
	diagIssues: "Issues need attention",
	diagErrors: "Errors",
	diagWarnings: "Warnings",
	diagConflicts: "Load conflicts",
	diagDeps: "Dependency issues",
	diagRefresh: "Check again",
	diagDetails: "Check details",
	diagScopeShort: "Checks configuration and host loading",
	diagCatalogTitle: "Catalog source",
	diagInventory: "Inventory",
	diagOfficial: "Official bundles",
	diagCommunity: "Community bundles",
	diagBundles: "Bundle details",
	diagSkills: "Local Skills",
	diagPatch: "User patch layer",
	diagOrphans: "Orphan disables"
};

//#endregion
//#region src/client/index.ts
/**
* Browser half: register a Settings section. Official dual-face client entry.
*/
const NS = "dsh-top100";
const STYLE_ID = "dsh-top100-plugin-css";
const name = "dsh-top100";
const inject = ["slots", "locale"];
function ensureCss() {
	if (typeof document === "undefined") return () => void 0;
	if (document.getElementById(STYLE_ID) === null) {
		const tag = document.createElement("style");
		tag.id = STYLE_ID;
		tag.dataset.plugin = "dsh-top100-plugin";
		tag.textContent = css;
		document.head.appendChild(tag);
	}
	return () => document.getElementById(STYLE_ID)?.remove();
}
function apply(ctx) {
	ctx.effect(() => {
		return ctx.locale.register(NS, {
			zh,
			en
		});
	}, "dsh-top100: dictionaries");
	ctx.effect(() => ensureCss(), "dsh-top100: css");
	const t = ctx.locale.bind(NS);
	ctx.slots.inject("settings.section", () => ctx.slots.register({
		name: "settings.section",
		id: "dsh-top100",
		order: 45,
		label: () => t("nav"),
		locale: NS,
		inject: () => ({ t })
	}, () => (0, react.createElement)(PluginErrorBoundary, {
		t,
		children: (0, react.createElement)(RankingsPage, { t })
	})));
	ctx.inject?.(["settingsScope"], (scoped) => {
		const settings = scoped.settingsScope.bind({ namespace: NS });
		scoped.slots.inject("plugins.bundle.config", () => scoped.slots.register({
			name: "plugins.bundle.config",
			key: "@dsheval/dsh-top100-plugin",
			locale: NS,
			inject: () => ({ t })
		}, () => (0, react.createElement)(PluginErrorBoundary, {
			t,
			children: (0, react.createElement)(SettingsCard, {
				t,
				settings
			})
		})));
		scoped.slots.inject("settings.plugin.item", () => scoped.slots.register({
			name: "settings.plugin.item",
			key: "dsh-top100",
			locale: NS,
			inject: () => ({ t })
		}, () => (0, react.createElement)(PluginErrorBoundary, {
			t,
			children: (0, react.createElement)(SettingsCard, {
				t,
				settings
			})
		})));
	});
}

//#endregion
exports.apply = apply;
exports.inject = inject;
exports.name = name;
return module.exports; } });