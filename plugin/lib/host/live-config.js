import { DEFAULT_DATA_URL, normalizeDataUrl } from "./catalog.js";
export function configValue(value) {
    return value !== null && typeof value === "object" && "get" in value ? value.get() : value;
}
/** 0.1.7 projects volatile fields; older schema packages keep the plain field. */
export function editableSchema(schema) {
    const modern = schema;
    return typeof modern.volatile === "function" ? modern.volatile() : schema;
}
/** Read a live field on every operation while retaining the older settings provider's setter. */
export function resolvedConfig(dataUrl, profile, profileDirectory) {
    let legacyUrl = normalizeDataUrl(configValue(dataUrl) || DEFAULT_DATA_URL);
    let legacyOverride = false;
    return {
        get dataUrl() { return normalizeDataUrl(process.env.DSH_TOP100_DATA_URL || (!legacyOverride && typeof dataUrl === "object" ? dataUrl.get() : legacyUrl)); },
        set dataUrl(value) { legacyUrl = normalizeDataUrl(value); legacyOverride = true; },
        profile,
        ...(profileDirectory === undefined ? {} : { profileDirectory }),
    };
}
