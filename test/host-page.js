// Starts the runtime with a project and checks it against the editor host contract.
import {verifyEditorHost} from '@kubohiroya/turbowarp-plus-editor-host';

globalThis.startAndVerify = async project => {
    const host = await EditorRuntime.start(document.getElementById('workspace'), {locale: 'ja', project});
    globalThis.host = host;
    return verifyEditorHost(host);
};
