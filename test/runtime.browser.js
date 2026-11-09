import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import http from 'node:http';
import {chromium} from '@playwright/test';
import {serveEditorRuntime} from '../node/index.js';

const block = (opcode, {next = null, parent = null, inputs = {}} = {}) =>
    ({opcode, next, parent, inputs, fields: {}, shadow: false, topLevel: parent === null, ...(parent === null ? {x: 0, y: 0} : {})});
const target = (isStage, name, blocks) => ({isStage, name, variables: {}, lists: {}, broadcasts: {}, blocks, comments: {},
    currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: isStage ? 0 : 1,
    ...(isStage ? {} : {visible: true, x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around'})});
const project = {targets: [target(true, 'Stage', {}), target(false, 'Cat', {
    flag: block('event_whenflagclicked', {next: 'move'}),
    move: block('motion_movesteps', {parent: 'flag', inputs: {STEPS: [1, [4, '10']]}})
})], monitors: [], extensions: [], meta: {semver: '3.0.0'}};

async function open(t, options) {
    const server = await serveEditorRuntime(options);
    const browser = await chromium.launch();
    t.after(async () => {await browser.close(); await server.close();});
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    t.after(() => assert.deepEqual(errors, []));
    await page.goto(server.url);
    return {page, server};
}

test('the runtime keeps to the editor host contract', async t => {
    const {page} = await open(t, {script: fileURLToPath(new URL('./host-page.js', import.meta.url))});
    assert.deepEqual(await page.evaluate(value => startAndVerify(value), project), []);
});

test('the workspace shows the editing target and edits reach the VM', async t => {
    const {page} = await open(t, {script: fileURLToPath(new URL('./host-page.js', import.meta.url))});
    await page.evaluate(value => startAndVerify(value), project);
    assert.deepEqual(await page.evaluate(() => host.workspace.getAllBlocks().map(block => block.type).sort()),
        ['event_whenflagclicked', 'math_number', 'motion_movesteps']);
    assert.equal(await page.evaluate(() => host.vm.editingTarget.getName()), 'Cat');
    await page.evaluate(() => {
        const created = host.workspace.newBlock('motion_turnright');
        created.initSvg();
        created.render();
    });
    await page.waitForFunction(() => host.isProjectDirty());
    assert.equal(await page.evaluate(() => Object.values(host.vm.editingTarget.blocks._blocks).some(block => block.opcode === 'motion_turnright')), true);
});

test('the server stays inside its directories', async t => {
    const {server} = await open(t, {});
    // Sent as raw paths: fetch would normalize the dot segments before they reach the server. URL parsing removes
    // plain and %2e dot segments; an encoded slash hides them until the path is decoded.
    const status = requestPath => new Promise((resolve, reject) => {
        const {port} = new URL(server.url);
        http.get({host: '127.0.0.1', port, path: requestPath}, response => {response.resume(); resolve(response.statusCode);}).on('error', reject);
    });
    for (const name of ['/../package.json', '/blocks/../../package.json', '/media/../../package.json', '/%2e%2e/package.json',
        '/blocks/%2e%2e/%2e%2e/package.json', '/blocks/..%2F..%2Fpackage.json', '/..%2Fpackage.json', '/media%2F..%2F..%2Fpackage.json']) {
        assert.equal(await status(name), 404, name);
    }
    assert.equal(await status('/blocks/../index.js'), 404, 'a sibling of the blocks directory');
    assert.equal((await fetch(`${server.url}blocks/blockly_compressed_vertical.js`)).status, 200);
    assert.equal((await fetch(`${server.url}media/zoom-in.svg`)).status, 200);
});
