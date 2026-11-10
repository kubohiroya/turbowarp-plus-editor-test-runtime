// Starts the runtime with a project and checks it against the editor host contract.
import {verifyEditorHost} from '@kubohiroya/turbowarp-plus-editor-host';

globalThis.startAndVerify = async project => {
    const host = await EditorRuntime.start(document.getElementById('workspace'), {locale: 'ja', project});
    globalThis.host = host;
    return verifyEditorHost(host);
};

// An extension with a command, a reporter and a menu, registered the way a test page registers one.
globalThis.registerFixture = async () => {
    const {ScratchCommon} = EditorRuntime.vmModules;
    let ran = 0;
    const service = host.registerExtension({
        getInfo: () => ({id: 'runtimefixture', name: 'Runtime fixture', blocks: [
            {opcode: 'say', blockType: ScratchCommon.BlockType.COMMAND, text: 'say [WORD]',
                arguments: {WORD: {type: ScratchCommon.ArgumentType.STRING, menu: 'words'}}},
            {opcode: 'value', blockType: ScratchCommon.BlockType.REPORTER, text: 'value'}
        ], menus: {words: {acceptReporters: false, items: ['hello', 'world']}}}),
        say: () => { ran++; },
        value: () => 42
    });
    globalThis.fixtureRuns = () => ran;
    return service;
};
