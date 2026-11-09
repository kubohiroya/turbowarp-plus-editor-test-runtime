// Serves the minimal editor runtime page on a free local port.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {directory as blocksDirectory, scripts as blockScripts} from '@kubohiroya/turbowarp-plus-editor-test-runtime-blocks';

const runtimeDirectory = fileURLToPath(new URL('../dist/', import.meta.url));
const types = {'.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.cur': 'image/x-icon', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.css': 'text/css'};

const page = test => `<!doctype html>
<meta charset="utf-8">
<title>Minimal editor runtime</title>
<style>html, body {margin: 0; height: 100%} #workspace {position: absolute; inset: 0}</style>
<div id="workspace"></div>
${blockScripts.map(file => `<script src="blocks/${file}"></script>`).join('\n')}
<script src="runtime.js"></script>
${test ? '<script src="test.js"></script>\n' : ''}`;

// Resolves a request path inside `root`, or null when it would leave it.
const inside = (root, name) => {
    const file = path.resolve(root, name);
    return file.startsWith(root) ? file : null;
};

/**
 * Starts the server. `script` is a test's page entry: it is bundled with esbuild and loaded after the runtime,
 * so it can call `EditorRuntime.start` and use the package under test. `files` adds or replaces served files.
 */
export async function serveEditorRuntime({script, files = {}} = {}) {
    const served = {'index.html': page(Boolean(script)), ...files};
    if (script) {
        const result = await build({entryPoints: [script], bundle: true, write: false, format: 'iife', platform: 'browser',
            define: {'process.env.NODE_ENV': '"development"'}, loader: {'.css': 'text'}, logLevel: 'error'});
        served['test.js'] = result.outputFiles[0].text;
    }
    const server = http.createServer(async (request, response) => {
        const name = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname).slice(1) || 'index.html';
        const file = name.startsWith('blocks/') ? inside(blocksDirectory, name.slice('blocks/'.length)) :
            name.startsWith('media/') ? inside(blocksDirectory, name) : inside(runtimeDirectory, name);
        try {
            const body = Object.hasOwn(served, name) ? served[name] : file && await fs.readFile(file);
            if (body === null) throw new Error('outside');
            response.writeHead(200, {'content-type': types[path.extname(name)] ?? 'application/octet-stream'});
            response.end(body);
        } catch {
            response.writeHead(404);
            response.end();
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const {port} = server.address();
    return {url: `http://127.0.0.1:${port}/`, close: () => new Promise(resolve => server.close(resolve))};
}
