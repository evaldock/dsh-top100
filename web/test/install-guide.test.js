import assert from "node:assert/strict";
import test from "node:test";
import { existingDshCommands } from "../public/install-guide.js";

test("existing DSH commands keep the chosen launcher and exact version", () => {
  for (const [method, version, prefix] of [
    ["global", "", "dsh"],
    ["source", "", "pnpm dsh"],
    ["npx", "0.1.1-rc.2", "npx @deepseek-ai/dsh@0.1.1-rc.2"],
  ]) {
    assert.deepEqual(existingDshCommands(method, version, "1.3.2"), {
      install: `${prefix} plugin --profile web add @evaldock/dsh-top100-plugin@1.3.2`,
      check: `${prefix} plugin --profile web list --depth 0`,
      start: `${prefix} web`,
    });
  }
});

test("npx cannot produce copyable commands without an exact safe version", () => {
  for (const version of ["", "latest", "^0.1.1", "0.1", "0.1.1; echo bad", "$(whoami)", "0.1.1\nweb", "0.1.1 --help"]) {
    assert.equal(existingDshCommands("npx", version, "1.3.2"), null, version);
  }
  assert.equal(existingDshCommands("", "0.1.1", "1.3.2"), null);
  assert.equal(existingDshCommands("global", "", "latest"), null);
});

test("catalog commands use the user's launcher and preserve the selected plugin target", async () => {
  const { commandForExistingDsh } = await import("../public/catalog-install-command.js");
  const suffix = " plugin --profile web add @acme/demo@1.2.3";
  const original = `npx @deepseek-ai/dsh${suffix}`;
  assert.equal(commandForExistingDsh(original, "global"), `dsh${suffix}`);
  assert.equal(commandForExistingDsh(original, "source"), `pnpm dsh${suffix}`);
  assert.equal(commandForExistingDsh(original, "npx", "0.1.1-rc.2"), `npx @deepseek-ai/dsh@0.1.1-rc.2${suffix}`);
  for (const version of ["", "latest", "^0.1.1", "0.1.1; echo bad", "0.1.1\nweb"]) {
    assert.equal(commandForExistingDsh(original, "npx", version), null);
  }
  assert.equal(commandForExistingDsh(original, ""), null);
  assert.equal(commandForExistingDsh("npm install -g something", "global"), null);
});
