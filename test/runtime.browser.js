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

test('a registered extension gets its blocks, menus and primitives, and a project that uses it renders', async t => {
    const {page} = await open(t, {script: fileURLToPath(new URL('./host-page.js', import.meta.url))});
    await page.evaluate(value => startAndVerify(value), project);
    assert.match(await page.evaluate(() => registerFixture()), /^extension_\d+_runtimefixture$/);
    assert.equal(await page.evaluate(() => typeof Blockly.Blocks.runtimefixture_say), 'object');
    assert.equal(await page.evaluate(() => typeof Blockly.Blocks.runtimefixture_menu_words), 'object');
    await page.evaluate(async () => {
        const json = JSON.parse(host.vm.toJSON());
        json.targets[1].blocks.say = {opcode: 'runtimefixture_say', next: null, parent: null, topLevel: true, shadow: false,
            x: 0, y: 200, inputs: {WORD: [1, 'menu']}, fields: {}};
        json.targets[1].blocks.menu = {opcode: 'runtimefixture_menu_words', next: null, parent: 'say', topLevel: false,
            shadow: true, inputs: {}, fields: {words: ['world', null]}};
        json.extensions = ['runtimefixture'];
        await host.loadProject(json);
    });
    assert.ok((await page.evaluate(() => host.workspace.getAllBlocks().map(block => block.type))).includes('runtimefixture_say'));
    // The block runs through the VM's own primitive table.
    await page.evaluate(() => host.vm.runtime.toggleScript(
        Object.values(host.vm.editingTarget.blocks._blocks).find(block => block.opcode === 'runtimefixture_say').id));
    await page.waitForFunction(() => fixtureRuns() === 1);
});

test('the VM modules and constructor are the runtime VM\'s own', async t => {
    const {page} = await open(t, {script: fileURLToPath(new URL('./host-page.js', import.meta.url))});
    await page.evaluate(value => startAndVerify(value), project);
    assert.deepEqual(await page.evaluate(() => {
        const {dispatch, ScratchCommon, createTranslate, staticFetch} = EditorRuntime.vmModules;
        // The VM registers its services with the dispatch singleton it imports; a second copy of the
        // module, which the registrar would refuse, would hold none of them.
        const dispatchRuntime = ['runtime', 'extensions'].every(name => Object.hasOwn(dispatch.services, name));
        const second = new EditorRuntime.VirtualMachine();
        return {dispatchRuntime,
            blockType: ScratchCommon.BlockType.COMMAND, translate: typeof createTranslate(host.vm), fetch: typeof staticFetch,
            separate: second !== host.vm && second.runtime !== host.vm.runtime};
    }), {dispatchRuntime: true, blockType: 'command', translate: 'function', fetch: 'function', separate: true});
});
