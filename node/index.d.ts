export interface EditorRuntimeServer {
    /** The page's URL, ending in `/`. */
    url: string;
    close(): Promise<void>;
}
export interface EditorRuntimeServerOptions {
    /** A test's page entry, bundled and loaded after the runtime. */
    script?: string;
    /** Files to add or replace, by served path. */
    files?: Record<string, string | Uint8Array>;
}
export declare function serveEditorRuntime(options?: EditorRuntimeServerOptions): Promise<EditorRuntimeServer>;
