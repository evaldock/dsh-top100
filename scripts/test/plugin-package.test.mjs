import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validatePluginPackage } from '../check-plugin-package.mjs';

function fixture() {
  const manifest = { name: '@evaldock/dsh-top100-plugin', version: '1.0.0', main: 'lib/index.js', types: 'lib/index.d.ts',
    exports: { '.': { types: './lib/index.d.ts', default: './lib/index.js' }, './client': './client/client.js' },
    dsh: { bundle: { patch: './cordis.patch.yml' } } };
  const sourceFiles = { 'cordis.patch.yml': '- insert: []\n', 'skills/recommend/SKILL.md': '# Recommendation\n',
    'skills/recommend/agents/openai.yaml': 'display_name: Recommendation\n' };
  const contents = { ...sourceFiles, 'package.json': JSON.stringify(manifest), 'lib/index.js': 'export const name = "top100";',
    'lib/index.d.ts': 'export declare const name: string;',
    'client/client.js': 'window.__ModuleLoader__.load({ id: "@evaldock/dsh-top100-plugin", factory: () => ({}) });' };
  return { manifest, expectedManifest: structuredClone(manifest), sourceFiles, files: Object.keys(contents), readFile: path => contents[path], contents };
}

test('accepts a complete package', () => {
  const input = fixture();
  assert.equal(validatePluginPackage(input).name, input.manifest.name);
});

test('rejects missing runtime, declarations, client, patch, skills and data', () => {
  for (const path of ['lib/index.js', 'lib/index.d.ts', 'client/client.js', 'cordis.patch.yml',
    'skills/recommend/SKILL.md', 'skills/recommend/agents/openai.yaml']) {
    const input = fixture();input.files = input.files.filter(file => file !== path);
    assert.throws(() => validatePluginPackage(input), /Missing package file/, path);
  }
});

test('rejects empty build output', () => {
  const input = fixture();input.contents['lib/index.js'] = '';
  assert.throws(() => validatePluginPackage(input), /Empty package file/);
});

test('rejects stale packaged skill assets', () => {
  for (const path of Object.keys(fixture().sourceFiles)) {
    const input = fixture();input.contents[path] = path.endsWith('.json') ? '{}' : 'outdated';
    assert.throws(() => validatePluginPackage(input), /Stale package/);
  }
});

test('rejects a client bundle without the DSH loader registration', () => {
  const input = fixture();input.contents['client/client.js'] = 'export default {};';
  assert.throws(() => validatePluginPackage(input), /DSH module loader/);
});

test('rejects a mismatched package version', () => {
  const input = fixture();input.manifest.version = '0.9.0';
  assert.throws(() => validatePluginPackage(input), /differs from the plugin manifest/);
});

test('rejects accidentally bundled editorial content', () => {
  const input = fixture(); input.files.push('lib/shared/reviewed-descriptions.json');
  assert.throws(() => validatePluginPackage(input), /Editorial content must not ship/);
});

test('rejects editorial policy embedded in the client bundle', () => {
  const input = fixture();input.contents['client/client.js'] += '\nfunction descriptionQualityIssue() {}';
  assert.throws(() => validatePluginPackage(input), /Server editorial policy must not ship/);
});
