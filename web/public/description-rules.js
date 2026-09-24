// plugin/src/shared/description-rules.ts
var DESCRIPTION_POLICY = "server-v1";
var PENDING_DESCRIPTION_ZH = "\u4E2D\u6587\u7B80\u4ECB\u5F85\u751F\u6210\u3002";
function cleanDescription(value) {
  return String(value ?? "").replace(/```[\s\S]*?```/g, " ").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/[`*_~>#]/g, " ").replace(/\s+/g, " ").trim().replace(/^((?:[\w@/.-]+\s+)?)(?:简体中文|中文)\s*[|·]\s*English\s*/i, "$1").replace(/^((?:[\w@/.-]+\s+)?)English\s*[|·]\s*(?:简体中文|中文)\s*/i, "$1").trim();
}
function isDescriptionReviewDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const parsed = /* @__PURE__ */ new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function descriptionStatusFor(value) {
  if (value === void 0) return void 0;
  if (value && typeof value === "object") {
    const status = value;
    if (typeof status.state === "string" && ["pending", "review-required", "missing-source", "retry", "stale"].includes(status.state) && typeof status.reason === "string" && (status.origin === void 0 || status.origin === "model") && (status.state !== "stale" || isDescriptionReviewDate(status.origin === "model" ? status.generatedAt : status.reviewedAt))) {
      return {
        state: status.state,
        reason: cleanDescription(status.reason).slice(0, 200),
        ...status.origin === "model" ? { origin: "model" } : {},
        ...isDescriptionReviewDate(status.generatedAt) ? { generatedAt: status.generatedAt } : {},
        ...isDescriptionReviewDate(status.reviewedAt) ? { reviewedAt: status.reviewedAt } : {}
      };
    }
  }
  return { state: "review-required", reason: "\u670D\u52A1\u7AEF\u7B80\u4ECB\u72B6\u6001\u65E0\u6548\uFF0C\u7B49\u5F85\u590D\u6838\u3002" };
}
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
    if (description === PENDING_DESCRIPTION_ZH) return "\u4E2D\u6587\u7B80\u4ECB\u5F85\u590D\u6838\uFF1A\u65E7\u7B80\u4ECB\u6B63\u6587\u7F3A\u5931\uFF0C\u7B49\u5F85\u670D\u52A1\u7AEF\u6838\u67E5\u3002";
    return status.origin === "model" ? `\u65E7\u7248\u7B80\u4ECB\uFF08${status.generatedAt} \u751F\u6210\uFF0C\u672A\u786E\u8BA4\u6700\u65B0\u53D8\u5316\uFF09\uFF1A${description}` : `\u65E7\u7248\u7B80\u4ECB\uFF08${status.reviewedAt} \u6838\u5BF9\uFF0C\u672A\u786E\u8BA4\u6700\u65B0\u53D8\u5316\uFF09\uFF1A${description}`;
  }
  if (description !== PENDING_DESCRIPTION_ZH || !status) return description;
  if (status.state === "review-required") {
    const explanations = {
      "\u5DF2\u590D\u6838\u7684\u529F\u80FD\u6E90\u7801\u5C1A\u672A\u901A\u8FC7\u5F53\u524D\u6838\u9A8C\uFF0C\u65E7\u7B80\u4ECB\u548C\u5206\u7C7B\u6682\u505C\u4F7F\u7528\u3002": "\u9879\u76EE\u4EE3\u7801\u5DF2\u53D8\u5316\uFF0C\u65E7\u7B80\u4ECB\u53EF\u80FD\u4E0D\u518D\u51C6\u786E\uFF0C\u5F85\u6838\u5B9E\u540E\u66F4\u65B0\u3002",
      "\u6240\u9009\u63D2\u4EF6\u7684\u56FA\u5B9A\u6E90\u7801\u8BC1\u636E\u53D1\u751F\u5B9E\u9645\u884C\u4E3A\u53D8\u5316\uFF0C\u9700\u5B8C\u6210\u590D\u6838\u540E\u6062\u590D\u7B80\u4ECB\u3002": "\u9879\u76EE\u4EE3\u7801\u5DF2\u53D8\u5316\uFF0C\u65E7\u7B80\u4ECB\u53EF\u80FD\u4E0D\u518D\u51C6\u786E\uFF0C\u5F85\u6838\u5B9E\u540E\u66F4\u65B0\u3002",
      "\u56FA\u5B9A\u590D\u6838\u7B80\u4ECB\u7684\u6765\u6E90\u6216\u5305\u8EAB\u4EFD\u5DF2\u53D8\u5316\uFF0C\u9700\u6838\u5BF9\u529F\u80FD\u540E\u5B9A\u5411\u66F4\u65B0\uFF0C\u4E0D\u81EA\u52A8\u66FF\u6362\u6587\u6848\u3002": "\u9879\u76EE\u8D44\u6599\u6216\u63D2\u4EF6\u5305\u53D1\u751F\u53D8\u5316\uFF0C\u5C1A\u672A\u786E\u8BA4\u662F\u5426\u4ECD\u4E0E\u539F\u7B80\u4ECB\u5BF9\u5E94\u3002",
      "\u5F53\u524D\u6458\u8981\u672A\u6807\u660E\u6240\u9009\u5B50\u5305\u6216\u8DEF\u5F84\uFF0C\u9700\u53D6\u5F97\u5B50\u5305\u81EA\u8EAB README \u540E\u518D\u751F\u6210\u5185\u5BB9\u3002": "\u6682\u7F3A\u8FD9\u4E2A\u63D2\u4EF6\u81EA\u8EAB\u7684\u529F\u80FD\u8BF4\u660E\uFF0C\u4E0D\u80FD\u7528\u6574\u4E2A\u9879\u76EE\u7684\u4ECB\u7ECD\u4EE3\u66FF\u3002"
    };
    if (explanations[status.reason]) return explanations[status.reason];
  }
  const labels = {
    "pending": "\u4E2D\u6587\u7B80\u4ECB\u5F85\u751F\u6210",
    "review-required": "\u4E2D\u6587\u7B80\u4ECB\u5F85\u590D\u6838",
    "missing-source": "\u4E2D\u6587\u7B80\u4ECB\u8D44\u6599\u4E0D\u8DB3",
    "retry": "\u4E2D\u6587\u7B80\u4ECB\u751F\u6210\u672A\u5B8C\u6210"
  };
  const label = labels[status.state];
  return `${label}${status.reason ? `\uFF1A${status.reason}` : "\u3002"}`;
}
export {
  DESCRIPTION_POLICY,
  PENDING_DESCRIPTION_ZH,
  cleanDescription,
  descriptionDisplayFor,
  descriptionFor,
  descriptionStatusFor,
  isDescriptionReviewDate
};
