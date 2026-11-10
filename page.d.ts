// Types for test pages: the global the runtime defines in the browser.
import type {EditorHost} from '@kubohiroya/turbowarp-plus-editor-host';

export interface EditorRuntimeHost extends EditorHost {
    /** The workspace that shows the VM's editing target. */
    workspace: any;
    /** Loads a project (`project.json` contents) and edits its first sprite. The project is then saved. */
    loadProject(project: string | object): Promise<void>;
    /**
     * Registers an extension object as the VM registers its built-in ones (no sandbox, Loader or review)
     * and defines its blocks in the workspace. Returns the VM service name.
     */
    registerExtension(extension: {getInfo(): {id: string}}): string;
}
/** The VM's own modules an extension host needs, such as the Loader's registrar. */
export interface VMModules {
    ScratchCommon: Record<string, any>;
    createTranslate(vm: unknown): unknown;
    staticFetch(url: unknown): Response | null;
    dispatch: {services: Record<string, any>; setServiceSync(name: string, provider: unknown): void};
}
export interface EditorRuntimeOptions {
    locale?: string;
    project?: string | object;
}
declare global {
    const EditorRuntime: {
        start(container: HTMLElement, options?: EditorRuntimeOptions): Promise<EditorRuntimeHost>;
        vmModules: VMModules;
        /** The VM constructor, for a second VM such as a preview. */
        VirtualMachine: new () => any;
    };
}
