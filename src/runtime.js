// The minimal editor runtime: the pinned scratch-vm and scratch-blocks, one workspace kept in step with the
// VM's editing target, and the editor host contract that family packages are written against.
import VirtualMachine from 'scratch-vm';
import Blocks from 'scratch-vm/src/engine/blocks.js';
import {deserializeBlocks} from 'scratch-vm/src/serialization/sb3.js';
import ScratchStorage from '@turbowarp/scratch-storage';
import ScratchRender from 'scratch-render';
import {BitmapAdapter} from '@turbowarp/scratch-svg-renderer';

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
