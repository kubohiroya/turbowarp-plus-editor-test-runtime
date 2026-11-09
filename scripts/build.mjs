// Builds dist/runtime.js: the pinned scratch-vm, scratch-render and scratch-storage with the editor host in one
// script. Scratch Blocks is not part of it: the server loads it from @kubohiroya/turbowarp-plus-editor-test-runtime-blocks.
// The pins are in package.json and follow the TurboWarp Plus Editor's scratch-gui revision named in pins.json.
import {build} from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);

// scratch-vm and its renderer still use webpack loader prefixes in their sources. Map the ones they use.
const webpackLoaders = {
    name: 'webpack-loaders',
    setup(builder) {
        // JSZip offers Node streams when `stream` exists; in the browser it does without them.
        builder.onResolve({filter: /^stream$/}, () => ({path: 'stream', namespace: 'empty'}));
        builder.onLoad({filter: /.*/, namespace: 'empty'}, () => ({contents: 'module.exports = {}', loader: 'js'}));
        builder.onResolve({filter: /^!?[^!]+!/}, args => {
            const [loader, file] = args.path.replace(/^!/, '').split('!');
            return {path: path.resolve(args.resolveDir, file), namespace: 'webpack-loader', pluginData: {loader}};
        });
        builder.onLoad({filter: /.*/, namespace: 'webpack-loader'}, async ({path: file, pluginData: {loader}}) => {
            const exported = value => ({contents: `module.exports=${value}`, loader: 'js'});
            if (loader === 'base64-loader') return exported(JSON.stringify(fs.readFileSync(file).toString('base64')));
            if (loader === 'raw-loader') return exported(JSON.stringify(fs.readFileSync(file, 'utf8')));
            if (loader === 'arraybuffer-loader') {
                return exported(`Uint8Array.from(atob(${JSON.stringify(fs.readFileSync(file).toString('base64'))}), c => c.charCodeAt(0)).buffer`);
            }
            if (loader === './tw-load-script-as-plain-text') {
                const worker = await build({entryPoints: [file.endsWith('.js') ? file : `${file}.js`], bundle: true, write: false,
                    format: 'iife', platform: 'browser', define: {global: 'globalThis'}, logLevel: 'error'});
                return exported(JSON.stringify(worker.outputFiles[0].text));
            }
            // Sandboxed extension workers and speech bubble line breaking (brfs) are outside the runtime.
            if (loader.startsWith('worker-loader')) return exported("function(){throw new Error('Extension workers are not available in the minimal editor runtime')}");
            if (loader === 'ify-loader') return exported("function(){throw new Error('Speech bubble text wrapping is not available in the minimal editor runtime')}");
            throw new Error(`Unknown webpack loader ${loader} in ${file}`);
        });
    }
};

fs.rmSync('dist', {recursive: true, force: true});
await build({entryPoints: ['src/runtime.js'], bundle: true, format: 'iife', globalName: 'EditorRuntime', platform: 'browser',
    outfile: 'dist/runtime.js', plugins: [webpackLoaders], inject: ['src/buffer-shim.js'],
    define: {'process.env.NODE_ENV': '"production"', global: 'globalThis'},
    loader: {'.png': 'dataurl', '.svg': 'text', '.wav': 'binary', '.mp3': 'binary'}, legalComments: 'eof', logLevel: 'error'});


// What dist/ was built from, for anyone checking it against the Editor's pins.
const versions = Object.fromEntries(['scratch-vm', 'scratch-render', '@turbowarp/scratch-storage',
    '@turbowarp/scratch-svg-renderer'].map(name => [name, require('../package.json').devDependencies[name]]));
fs.writeFileSync('dist/build-info.json', `${JSON.stringify({...JSON.parse(fs.readFileSync('pins.json', 'utf8')), versions}, null, 2)}\n`);

// Third-party notices for everything dist/ contains.
const included = new Map();
const metafile = await build({entryPoints: ['src/runtime.js'], bundle: true, write: false, metafile: true, platform: 'browser',
    plugins: [webpackLoaders], inject: ['src/buffer-shim.js'], define: {'process.env.NODE_ENV': '"production"', global: 'globalThis'},
    loader: {'.png': 'dataurl', '.svg': 'text', '.wav': 'binary', '.mp3': 'binary'}, logLevel: 'error'});
for (const input of Object.keys(metafile.metafile.inputs)) {
    // The innermost node_modules entry names the package; its directory is read directly, because some
    // packages do not export their package.json.
    // `(disabled):` marks a file the browser field replaces with nothing; it is not in the bundle.
    if (input.startsWith('(disabled)')) continue;
    // Files the loader plugin reads carry its namespace in front of their path.
    const match = input.replace(/^webpack-loader:/, '').match(/^(.*node_modules\/((?:@[^/]+\/)?[^/]+))\//);
    if (match) included.set(`${match[2]}@${match[1]}`, match[1]);
}
// Some MIT packages publish no license file; the MIT License text then names the package's author.
const mit = ({author}) => `Copyright (c) ${typeof author === 'string' ? author : author?.name ?? 'the package authors'}

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;
const notices = [...new Set(included.values())].sort().map(directory => {
    const {name, version, license} = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
    // Fonts carry their own license (OFL.txt) beside the package's, so every license file is kept.
    const files = fs.readdirSync(directory).filter(entry => /^(licen[cs]e|copying|ofl)/i.test(entry)).sort();
    const text = files.length ? files.map(file => fs.readFileSync(path.join(directory, file), 'utf8').trim()).join('\n\n---\n\n') :
        license === 'MIT' ? mit(JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'))) :
        '(No license file is included in this package.)';
    // Where a package offers a choice, this package uses it under the first non-copyleft option.
    const choice = /\sOR\s/.test(license ?? '') ?
        ['MPL-2.0', 'MIT', 'BSD-3-Clause', 'Apache-2.0', 'Unlicense'].find(option => license.includes(option)) : null;
    if (/\sOR\s/.test(license ?? '') && !choice) throw new Error(`No usable license among ${license} for ${name}`);
    return `## ${name} ${version}\n\nLicense: ${license ?? 'see below'}${choice ? `\n\nUsed under: ${choice}` : ''}\n\n\`\`\`\n${text}\n\`\`\``;
});
fs.writeFileSync('THIRD_PARTY_NOTICES.md', `# Third-party notices\n\n\`dist/\` contains the following packages.\n\n${notices.join('\n\n')}\n`);
