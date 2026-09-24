import { expect, it, vi } from "vitest";
import { supplementInstallDocument } from "../src/install-document.js";
import { parseInstallCommands } from "../src/install-parse.js";

it("reads Treg's installation document only for the reviewed root package", async () => {
  const read = vi.fn(async () => '```sh\ndsh plugin --profile <name> add github:superdesigndev/treg\n```');
  const previous = { commands: [], source: "template" };
  const identity = { fullName: "superdesigndev/treg", packageName: "treg-dsh", repositoryPath: null };
  expect(await supplementInstallDocument(identity, previous, "pinned-commit", read)).toEqual({
    commands: ["dsh plugin --profile web add github:superdesigndev/treg"], source: "docs/DSH-PLUGIN.md",
  });
  expect(read).toHaveBeenCalledWith(identity.fullName, "docs/DSH-PLUGIN.md", "pinned-commit");
  read.mockClear();
  for (const changed of [{ fullName: "other/treg" }, { packageName: "other" }, { repositoryPath: "packages/other" }]) {
    expect(await supplementInstallDocument({ ...identity, ...changed }, previous, "rev", read)).toBe(previous);
  }
  expect(read).not.toHaveBeenCalled();
});

it("normalizes only documented profile placeholders and retains strict command validation", () => {
  const parse = (cmd: string) => parseInstallCommands('```sh\n' + cmd + '\n```').commands;
  expect(parse("dsh plugin --profile <name> add dsh-plugin-reactive-resume"))
    .toEqual(["dsh plugin --profile web add dsh-plugin-reactive-resume"]);
  for (const cmd of ["dsh plugin --profile <name> add demo > output", "dsh plugin --profile <name> add demo && echo bad",
    "dsh plugin --profile <name> add <package>", "dsh plugin --profile $(whoami) add demo"]) expect(parse(cmd)).toEqual([]);
  expect(parse("dsh plugin --profile research add demo")).toEqual(["dsh plugin --profile research add demo"]);
});

it("requests only the audited missing README when its old cache cannot be reparsed", async () => {
  const { refreshCachedInstallEvidence } = await import('../src/install-cache.js');
  const previous = { commands: [], source: 'template' };
  const identity = { fullName: 'reactive-resume/reactive-resume', packageName: 'dsh-plugin-reactive-resume', repositoryPath: 'packages/dsh-plugin' };
  expect(refreshCachedInstallEvidence(identity, previous, null).needsReadmeRefresh).toBe(true);
  expect(refreshCachedInstallEvidence({ ...identity, repositoryPath: 'packages/other' }, previous, null).needsReadmeRefresh).toBe(false);
  expect(refreshCachedInstallEvidence(identity, previous, '```sh\ndsh plugin --profile <name> add dsh-plugin-reactive-resume\n```').installParsed.commands)
    .toEqual(['dsh plugin --profile web add dsh-plugin-reactive-resume']);
});
