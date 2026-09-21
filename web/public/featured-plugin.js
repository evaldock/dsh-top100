// plugin/src/shared/featured.ts
function isFeaturedRepository(entry) {
  return ["dsheval/dsh-top100", "evaldock/dsh-top100"].includes(entry.fullName?.trim().toLowerCase() ?? "");
}
function showFeaturedPlugin({
  view,
  query = "",
  category = null,
  catalogScope = "plugins",
  installAvailability = "all"
}) {
  return (view === "hot" || view === "rising" || view === "total") && !query.trim() && !category && catalogScope === "plugins" && installAvailability === "all";
}
export {
  isFeaturedRepository,
  showFeaturedPlugin
};
