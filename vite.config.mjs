import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { defineConfig } from 'vite';

const ROOT_DIR = fileURLToPath(new URL('.', import.meta.url));
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');

export const EXTENSION_ENTRIES = [
  { name: 'background', entry: 'src/background/index.ts', fileName: 'background.js', globalName: 'ChatGptInterviewBackground' },
  { name: 'content', entry: 'src/ui/content/index.ts', fileName: 'content.js', globalName: 'ChatGptInterviewContent' },
  { name: 'offscreen', entry: 'src/ui/offscreen/index.ts', fileName: 'offscreen.js', globalName: 'ChatGptInterviewOffscreen' },
  { name: 'popup', entry: 'src/ui/popup/index.ts', fileName: 'popup.js', globalName: 'ChatGptInterviewPopup' },
  { name: 'sidepanel', entry: 'src/ui/sidePanel/index.ts', fileName: 'sidepanel.js', globalName: 'ChatGptInterviewSidePanel' },
  { name: 'options', entry: 'src/ui/options/index.ts', fileName: 'options.js', globalName: 'ChatGptInterviewOptions' }
];

/** Copies one static asset into the extension dist directory. */
async function copyFileTask(from, to, options = {}) {
  const source = path.resolve(ROOT_DIR, from);
  const target = path.resolve(DIST_DIR, to);
  await fs.mkdir(path.dirname(target), { recursive: true });

  if (options.stripSourceMapComment) {
    const content = await fs.readFile(source, 'utf8');
    const normalizedContent = content.replace(/\r?\n\/\/# sourceMappingURL=.*$/g, '');
    await fs.writeFile(target, normalizedContent, 'utf8');
    return;
  }

  await fs.copyFile(source, target);
}

/** Copies manifest, HTML, worklet, worker, styles, and icon assets into dist. */
async function copyStaticAssets() {
  await Promise.all([
    copyFileTask('public/manifest.json', 'manifest.json'),
    copyFileTask('public/offscreen.html', 'offscreen.html'),
    copyFileTask('public/audio-worklet.js', 'audio-worklet.js'),
    copyFileTask('node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', 'pdf.worker.mjs'),
    copyFileTask('public/popup.html', 'popup.html'),
    copyFileTask('public/sidepanel.html', 'sidepanel.html'),
    copyFileTask('public/options.html', 'options.html'),
    copyFileTask('public/styles.css', 'styles.css'),
    copyFileTask('public/icons/chatgpt-icon.png', 'icons/chatgpt-icon.png')
  ]);
}

/** Creates a Vite plugin that copies extension static assets before each build. */
function copyStaticAssetsPlugin() {
  return {
    name: 'copy-static-assets',
    async buildStart() {
      await copyStaticAssets();
    }
  };
}

/** Creates the Vite library build config for one MV3 entrypoint. */
export function createExtensionBuildConfig({ entry, fileName, globalName, watch = false }) {
  return defineConfig({
    build: {
      outDir: DIST_DIR,
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      reportCompressedSize: false,
      watch: watch ? {} : undefined,
      target: 'chrome120',
      lib: {
        entry: path.resolve(ROOT_DIR, entry),
        name: globalName,
        formats: ['iife'],
        fileName: () => fileName
      },
      rolldownOptions: {
        transform: {
          define: {
            'import.meta': '{}'
          }
        }
      }
    },
    plugins: [copyStaticAssetsPlugin()]
  });
}

export default createExtensionBuildConfig(EXTENSION_ENTRIES[0]);
