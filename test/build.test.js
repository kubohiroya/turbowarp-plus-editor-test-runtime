import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';

const runtime = fs.readFileSync(new URL('../dist/runtime.js', import.meta.url), 'utf8');
const notices = fs.readFileSync(new URL('../THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8');

test('the runtime does not contain Scratch Blocks', () => {
    // Scratch Blocks is GPL-3.0 and lives in its own package; this one stays MPL-2.0.
    assert.doesNotMatch(runtime, /goog\.provide\(|Blockly\.inject\s*=/);
    assert.doesNotMatch(notices, /^## scratch-blocks /m);
});

test('every bundled package has its license text', () => {
    assert.match(notices, /^## scratch-vm /m);
    assert.doesNotMatch(notices, /No license file is included/);
    for (const [, license] of notices.matchAll(/^License: (.+)$/gm)) assert.doesNotMatch(license, /^GPL/, license);
    // A package with a choice of licenses names the one used, and it is not GPL.
    const choices = [...notices.matchAll(/^License: (.+ OR .+)\n\nUsed under: (.+)$/gm)];
    assert.equal(choices.length, [...notices.matchAll(/^License: .+ OR .+$/gm)].length);
    for (const [, , chosen] of choices) assert.doesNotMatch(chosen, /GPL/);
});

test('the build records the pinned revisions', () => {
    const info = JSON.parse(fs.readFileSync(new URL('../dist/build-info.json', import.meta.url), 'utf8'));
    assert.match(info.guiRevision, /^[0-9a-f]{40}$/);
    assert.match(info.versions['scratch-vm'], /#[0-9a-f]{40}$/);
});
