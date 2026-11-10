// The minimal editor runtime: the pinned scratch-vm and scratch-blocks, one workspace kept in step with the
// VM's editing target, and the editor host contract that family packages are written against.
import VirtualMachine from 'scratch-vm';
import Blocks from 'scratch-vm/src/engine/blocks.js';
import {deserializeBlocks} from 'scratch-vm/src/serialization/sb3.js';
import ScratchStorage from '@turbowarp/scratch-storage';
import ScratchRender from 'scratch-render';
import {BitmapAdapter} from '@turbowarp/scratch-svg-renderer';
import ScratchCommon from 'scratch-vm/src/extension-support/tw-extension-api-common.js';
import createTranslate from 'scratch-vm/src/extension-support/tw-l10n.js';
import staticFetch from 'scratch-vm/src/util/tw-static-fetch.js';
import dispatch from 'scratch-vm/src/dispatch/central-dispatch.js';

/**
 * The VM modules an extension host needs as the VM's own instances: `dispatch` is a singleton, so a
 * copy from anywhere else would not be the one this VM uses. The Loader's registrar takes these.
 */
export const vmModules = Object.freeze({ScratchCommon, createTranslate, staticFetch, dispatch});
/** The VM constructor, for a test that needs a second VM, such as a preview. */
export {VirtualMachine};

// Define an extension's blocks in Scratch Blocks, as the GUI does when one is added or changes:
// custom fields and menus are blocks too, so they are defined first. Dynamic blocks need the GUI's own
// block factory and are not supported here.
function defineExtensionBlocks(Blockly, categoryInfo) {
    const json = [
        ...Object.values(categoryInfo.customFieldTypes || {}).map(field => field.scratchBlocksDefinition),
        ...(categoryInfo.menus || []),
        ...(categoryInfo.blocks || [])
    ].filter(block => block && block.json && !(block.info && block.info.isDynamic)).map(block => block.json);
    if (json.length) Blockly.defineBlocksWithJsonArray(json);
}

function workspaceXml(vm, target) {
    const variables = Object.assign({}, vm.runtime.getTargetForStage().variables, target.variables);
    const declarations = Object.values(variables).map(variable => variable.toXML()).join('');
    return `<xml xmlns="http://www.w3.org/1999/xhtml"><variables>${declarations}</variables>${target.blocks.toXML(target.comments)}</xml>`;
}

/** Starts a VM and a Blockly workspace in `container` and resolves with the editor host. */
export async function start(container, {locale = 'en', project} = {}) {
    const Blockly = globalThis.Blockly;
    if (!Blockly) throw new Error('scratch-blocks must be loaded before the runtime');
    const vm = new VirtualMachine();
    // Assets come only from what a test adds to storage; nothing is fetched from the network.
    vm.attachStorage(new ScratchStorage());
    // The VM falls back to drawing default costumes, which needs a renderer; the stage canvas stays off screen.
    const canvas = document.createElement('canvas');
    canvas.width = 480; canvas.height = 360;
    vm.attachRenderer(new ScratchRender(canvas));
    vm.attachV2BitmapAdapter(new BitmapAdapter());
    const workspace = Blockly.inject(container, {
        media: './media/', toolbox: '<xml><category name="Motion" id="motion" colour="#4C97FF" secondaryColour="#3373CC"></category></xml>',
        zoom: {controls: false, wheel: false, startScale: 0.675}, scrollbars: true
    });
    workspace.addChangeListener(vm.blockListener);
    const defineBlocks = categoryInfo => defineExtensionBlocks(Blockly, categoryInfo);
    vm.on('EXTENSION_ADDED', defineBlocks);
    vm.on('BLOCKSINFO_UPDATE', defineBlocks);
    vm.on('workspaceUpdate', data => {
        Blockly.Events.disable();
        try {Blockly.Xml.clearWorkspaceAndLoadFromXml(Blockly.Xml.textToDom(data.xml), workspace);}
        finally {Blockly.Events.enable();}
    });
    let dirty = false;
    const listeners = new Set();
    const notify = () => {for (const listener of listeners) listener();};
    vm.on('PROJECT_CHANGED', () => {dirty = true; notify();});
    vm.start();
    const host = {
        vm, locale, workspace,
        getBlockly: async () => Blockly,
        deserializeBlocks,
        createBlockContainer: () => new Blocks(vm.runtime, true),
        isProjectDirty: () => dirty,
        markSaved() {dirty = false; notify();},
        isRunning: () => vm.runtime.threads.some(thread => !thread.updateMonitor && vm.runtime.isActiveThread(thread)),
        subscribe(listener) {listeners.add(listener); return () => listeners.delete(listener);},
        /** Shows external block changes, as the Editor does after reloading scripts in place. */
        refreshBlockViews(targets) {
            if (targets.includes(vm.editingTarget)) vm.emit('workspaceUpdate', {xml: workspaceXml(vm, vm.editingTarget)});
            vm.emit('EXTERNAL_BLOCKS_RELOADED', targets);
        },
        /**
         * Registers an extension object with the VM as the VM does for its built-in ones: no sandbox, no
         * Loader and no review. Its blocks are defined in the workspace. Returns the VM service name.
         */
        registerExtension(extension) {
            const {id} = extension.getInfo();
            if (vm.extensionManager.isExtensionLoaded(id)) throw new Error(`Extension ${id} is already registered`);
            const service = vm.extensionManager._registerInternalExtension(extension);
            vm.extensionManager._loadedExtensions.set(id, service);
            return service;
        },
        async loadProject(json) {
            await vm.loadProject(typeof json === 'string' ? json : JSON.stringify(json));
            const sprite = vm.runtime.targets.find(target => !target.isStage) ?? vm.runtime.targets[0];
            vm.setEditingTarget(sprite.id);
            dirty = false;
            notify();
        }
    };
    if (project) await host.loadProject(project);
    return host;
}
