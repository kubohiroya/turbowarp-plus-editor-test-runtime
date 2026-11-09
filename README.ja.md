# TurboWarp Plus Editor Test Runtime

TurboWarp Plus Editor ファミリーのパッケージの試験に使う、最小 editor runtime です。Editor が固定している scratch-vm と Scratch Blocks をワークスペース 1 面で動かし、editor host の取り決め（`@kubohiroya/turbowarp-plus-editor-host`）を実装します。パッケージは Editor をビルドせずに、本物の VM やブロックとの結合を 1 秒ほどで試せます。

## 中身

- **`dist/runtime.js`：** 固定した scratch-vm、scratch-render、`@turbowarp/scratch-storage` と editor host を 1 本にまとめたもの。これらの固定が追従する Editor の scratch-gui のリビジョンを `pins.json` に記します。`dist/build-info.json` にも記録します。
- **Scratch Blocks：** このパッケージには入れていません。`@kubohiroya/turbowarp-plus-editor-test-runtime-blocks` から取ります。そちらは GPL-3.0 で、こちらは MPL-2.0 のまま、そのファイルを配信するだけです。
- **`serveEditorRuntime`：** 試験ページのための手元のサーバー。

入れていないもの：

- scratch-gui の画面
- 拡張機能の sandbox worker
- 吹き出しの文字の折り返し

これらを呼ぶと例外になります。

## 使い方

runtime と Playwright を devDependency に加えます。runtime を起動し、試すパッケージを使うページのエントリーを書きます。

```js
// test/page.js
import {mountSomething} from '../dist/index.js';

globalThis.setup = async project => {
    const host = await EditorRuntime.start(document.getElementById('workspace'), {locale: 'en', project});
    return mountSomething({vm: host.vm, document, host});
};
```

それを配信して操作します。

```js
import {chromium} from '@playwright/test';
import {serveEditorRuntime} from '@kubohiroya/turbowarp-plus-editor-test-runtime';

const server = await serveEditorRuntime({script: fileURLToPath(new URL('./page.js', import.meta.url))});
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(server.url);
await page.evaluate(project => setup(project), project);
```

`EditorRuntime.start(container, {locale, project})` は、`EditorHost` に次の 2 つを加えたもので解決します。
- `workspace`：VM の編集対象を表示するワークスペース。
- `loadProject(project)`

ページ用の型は `@kubohiroya/turbowarp-plus-editor-test-runtime/page` にあります。

## 開発

| コマンド | 内容 |
| --- | --- |
| `npm test` | `dist/` をビルドする。Scratch Blocks を同梱していないこと、同梱した全パッケージのライセンス文が `THIRD_PARTY_NOTICES.md` にあること、固定が記録されていることを確かめる |
| `npm run test:browser` | runtime を editor host の取り決めと照合する。ワークスペースの編集が VM に届くこと、サーバーが自分のディレクトリの外を返さないことも確かめる |

Editor に追従するときは、その scratch-gui のリビジョンと lockfile に合わせて、`package.json` と `pins.json` の固定を変えます。

npm への公開は `.github/workflows/release.yml` が行います。`v<版>` のタグを push したときに、npm の Trusted Publisher で公開します。

## ライセンス

MPL-2.0。`dist/runtime.js` には、MPL-2.0・BSD・MIT・ISC・Apache-2.0 のパッケージも入っています。一覧は `THIRD_PARTY_NOTICES.md` にあります。ライセンスを選べるパッケージは、MPL-2.0 か MIT を選んでいます。GPL のコードを含まず、GPL のモジュールも import しません。
