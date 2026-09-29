import type { InstallProvenance } from "../shared/types.js";
import type { Translate } from "./locales.js";

export interface UpdateLink { label: string; href: string }

function githubRepository(value: string | null): string | null {
  if (!value) return null;
  const match = /^(?:git\+)?https:\/\/github\.com\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(value);
  if (!match || match[2] === "." || match[2] === "..") return null;
  return `https://github.com/${match[1]}/${match[2]}`;
}

/** Link only to known identities; version numbers do not imply a GitHub release tag. */
export function updateLinks(provenance: Pick<InstallProvenance, "source" | "packageName" | "version" | "repositoryUrl" | "commit">): UpdateLink[] {
  const links: UpdateLink[] = [];
  if (provenance.source === "npm" && provenance.packageName && provenance.version
    && provenance.packageName.length <= 214 && /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(provenance.packageName)
    && provenance.version.length <= 128 && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(provenance.version)) {
    links.push({ label: "updateNotesNpm", href: `https://www.npmjs.com/package/${provenance.packageName}/v/${encodeURIComponent(provenance.version)}` });
  }
  const repository = githubRepository(provenance.repositoryUrl);
  if (repository) {
    links.push({ label: "updateNotesReleases", href: `${repository}/releases` });
    if (provenance.source === "github" && provenance.commit && /^[a-f0-9]{40}$/i.test(provenance.commit)) {
      links.push({ label: "updateNotesCommit", href: `${repository}/commit/${provenance.commit}` });
    }
  }
  return links;
}

export function UpdateLinks({ provenance, t }: { provenance: InstallProvenance; t: Translate }) {
  const links = updateLinks(provenance);
  return <p className="update-links">{t("updateNotesLabel")}: {links.length ? links.map((link, index) =>
    <span key={link.href}>{index > 0 ? " · " : ""}<a href={link.href} target="_blank" rel="noopener noreferrer">{t(link.label)}</a></span>,
  ) : t("updateNotesUnavailable")}</p>;
}
