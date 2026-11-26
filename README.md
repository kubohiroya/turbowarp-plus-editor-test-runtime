# TurboWarp Plus Editor Test Runtime

A minimal editor runtime for the tests of TurboWarp Plus Editor family packages. It runs the Editor's pinned scratch-vm and Scratch Blocks with one workspace, and implements the editor host contract (`@kubohiroya/turbowarp-plus-editor-host`). A package can test how it works with the real VM and blocks in about a second, without building the Editor.

## What it contains

- **`dist/runtime.js`:** the pinned scratch-vm, scratch-render and `@turbowarp/scratch-storage` in one script, plus the editor host. `pins.json` names the Editor's scratch-gui revision these pins follow. `dist/build-info.json` records them.
- **Scratch Blocks:** not in this package. It comes from `@kubohiroya/turbowarp-plus-editor-test-runtime-blocks`. That package is GPL-3.0; this one stays MPL-2.0 and only serves its files.
- **`serveEditorRuntime`:** a local server for the test page.

Left out:

- scratch-gui's interface
- extension sandbox workers
- speech-bubble text wrapping

Calling these throws.

## Use

Add the runtime and Playwright as devDependencies. Write a page entry that starts the runtime and uses the package under test:

```js
// test/page.js
import {mountSomething} from '../dist/index.js';

globalThis.setup = async project => {
    const host = await EditorRuntime.start(document.getElementById('workspace'), {locale: 'en', project});
    return mountSomething({vm: host.vm, document, host});
};
```

Then serve it and drive it:

```js
import {chromium} from '@playwright/test';
import {serveEditorRuntime} from '@kubohiroya/turbowarp-plus-editor-test-runtime';

const server = await serveEditorRuntime({script: fileURLToPath(new URL('./page.js', import.meta.url))});
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(server.url);
await page.evaluate(project => setup(project), project);
```

`EditorRuntime.start(container, {locale, project})` resolves with an `EditorHost` plus:
- `workspace`: the workspace that shows the VM's editing target.
- `loadProject(project)`
- `registerExtension(extension)`: registers an extension object as the VM registers its built-in ones (no sandbox, Loader or review). Its blocks, menus and custom fields are defined in the workspace, as the GUI does when an extension is added or changes. Dynamic blocks are not supported: defining them needs the GUI's own block factory.

The page also has:
- `EditorRuntime.vmModules`: the VM's own `ScratchCommon`, `createTranslate`, `staticFetch` and central `dispatch`, as the Loader's registrar needs them. `dispatch` is a singleton, and these are the instances the runtime's VM uses.
- `EditorRuntime.VirtualMachine`: the VM constructor, for a test that needs a second VM, such as a preview.

The types for the page are in `@kubohiroya/turbowarp-plus-editor-test-runtime/page`.

## Development

| Command | What it does |
| --- | --- |
| `npm test` | Builds `dist/`. Checks that Scratch Blocks is not bundled, that every bundled package's license text is in `THIRD_PARTY_NOTICES.md`, and that the pins are recorded |
| `npm run test:browser` | Checks the runtime against the editor host contract, that workspace edits reach the VM, and that the server stays inside its directories |

To follow the Editor, change the pins in `package.json` and `pins.json` to its scratch-gui revision and lockfile.

Publishing happens in `.github/workflows/release.yml`, when a `v<version>` tag is pushed, through npm Trusted Publishing.

## License

MPL-2.0. `dist/runtime.js` also contains MPL-2.0, BSD, MIT, ISC and Apache-2.0 packages, listed in `THIRD_PARTY_NOTICES.md`. Where a package offers a choice of licenses, the choice is MPL-2.0 or MIT. This package contains no GPL code and imports no GPL module.

## Pin and contract check for Editor #823

This candidate follows GUI `60b87e2f2503206847f509285aa4de3cee3670c7` and VM `88a2c06e9deb3dd652c52c20daf4f728b387d41d`. Blocks 0.1.1 comes from `4113c5348e6b4c76da9071a1800a62ab96ef793f`; renderer, storage and SVG renderer also match that GUI lockfile. Acceptance requires the existing three build checks, five browser checks, and the same host contract check in the real Editor. Roll back pins.json and the VM manifest/lock together, then rebuild.

This does not replace GUI, sandbox worker, Desktop or cross-tab OPFS checks. Incoming-file progress belongs to Workbench; real file/approval/VM wiring stays in the Editor. WebKit storage/reopen and packaged HTML consent require their actual browser and Electron environments. These remaining cases do not require adding GUI or worker implementations to this runtime. A future worker-dependent migration needs separate capability and execution proof. Tracking: [Editor #823](https://github.com/kubohiroya/turbowarp-plus-editor/issues/823).
