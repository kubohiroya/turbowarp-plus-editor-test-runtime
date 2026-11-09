// Types for test pages: the global the runtime defines in the browser.
import type {EditorHost} from '@kubohiroya/turbowarp-plus-editor-host';

export interface EditorRuntimeHost extends EditorHost {
    /** The workspace that shows the VM's editing target. */
    workspace: any;
    /** Loads a project (`project.json` contents) and edits its first sprite. The project is then saved. */
    loadProject(project: string | object): Promise<void>;
}
export interface EditorRuntimeOptions {
    locale?: string;
    project?: string | object;
}
declare global {
    const EditorRuntime: {start(container: HTMLElement, options?: EditorRuntimeOptions): Promise<EditorRuntimeHost>};
}
