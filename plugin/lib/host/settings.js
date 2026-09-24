/** Optional settings namespace so operators can change the catalog URL without editing YAML. */
import * as settings from "@deepseek-ai/dsh-settings";
import z from "@deepseek-ai/schemastery";
import { DEFAULT_DATA_URL, invalidateCatalog, normalizeDataUrl } from "./catalog.js";
export const TOP100_SETTINGS_NS = "dsh-top100";
export const Top100Settings = z.object({
    dataUrl: z.string().default(DEFAULT_DATA_URL),
});
export function installTop100Settings(ctx, resolved) {
    const entry = { dataUrl: resolved.dataUrl || DEFAULT_DATA_URL };
    let source = () => entry;
    const hooks = {
        validate: (value) => {
            normalizeDataUrl(value.dataUrl);
        },
        setSource: (current) => {
            source = current;
        },
        onChange: () => {
            resolved.dataUrl = normalizeDataUrl(source().dataUrl);
            invalidateCatalog();
        },
    };
    const legacy = settings;
    if (typeof legacy.installSettingsSection === "function") {
        legacy.installSettingsSection(ctx, TOP100_SETTINGS_NS, Top100Settings, entry, hooks);
    }
    else {
        ctx.inject(["settings"], (scoped) => {
            // 0.1.7 derives forms directly from the Loader entry's exported Config.
            // Its settings service has no installSection; the host owns changes/reloads.
            const service = scoped.get("settings");
            service?.installSection?.(ctx, TOP100_SETTINGS_NS, Top100Settings, entry, hooks);
        });
    }
}
