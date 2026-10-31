import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';

// The library lives on disk so shaders/presets/models can be edited in any
// editor (or re-exported from Blender), versioned with git, and shared. The dev
// server exposes it over a tiny API and pushes change events so edits
// hot-reload without a page refresh.
const LIB = path.resolve(import.meta.dirname, 'library');

// Text kinds are addressed by bare name ("tunnel" → tunnel.fs). Models,
// textures and fonts are binary and keep their extension in the name
// ("skull.glb"), since the format matters to the loader.
const KINDS = {
  shaders: { exts: ['.fs'], binary: false },
  presets: { exts: ['.json'], binary: false },
  models: { exts: ['.glb', '.gltf', '.obj', '.stl'], binary: true },
  textures: { exts: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.mp4', '.webm', '.mov'], binary: true },
  fonts: { exts: ['.ttf', '.otf', '.woff', '.woff2'], binary: true },
} as const;
type Kind = keyof typeof KINDS;

const safeName = (name: string) => {
  const clean = name.replace(/[^a-zA-Z0-9_\-. ]/g, '').trim();
  return clean.startsWith('.') || clean.includes('..') ? '' : clean;
};

function nameOf(kind: Kind, file: string) {
  const { exts, binary } = KINDS[kind];
  const ext = path.extname(file).toLowerCase();
  if (!(exts as readonly string[]).includes(ext)) return null;
  return binary ? path.basename(file) : path.basename(file, ext);
}

function libraryPlugin(): Plugin {
  return {
    name: 'gumpkestra-library',
    configureServer(server) {
      server.watcher.add(LIB);
      const notify = (file: string) => {
        if (!file.startsWith(LIB)) return;
        const kind = path.basename(path.dirname(file)) as Kind;
        if (!(kind in KINDS)) return;
        const name = nameOf(kind, file);
        if (name) server.ws.send({ type: 'custom', event: 'library-changed', data: { kind, name } });
      };
      server.watcher.on('change', notify);
      server.watcher.on('add', notify);
      server.watcher.on('unlink', notify);

      server.middlewares.use('/api/library', async (req, res) => {
        try {
          const [, kind, rawName] = (req.url ?? '').split('?')[0].split('/');
          if (!(kind in KINDS)) throw new Error(`unknown library kind "${kind}"`);
          const { exts, binary } = KINDS[kind as Kind];
          const dir = path.join(LIB, kind);
          await fs.mkdir(dir, { recursive: true });

          if (!rawName && req.method === 'GET') {
            const names = (await fs.readdir(dir)).filter((f) => nameOf(kind as Kind, f));
            const items = await Promise.all(
              names.map(async (f) => binary
                ? { name: f }
                : { name: nameOf(kind as Kind, f)!, source: await fs.readFile(path.join(dir, f), 'utf8') }),
            );
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(items));
            return;
          }

          const name = safeName(decodeURIComponent(rawName ?? ''));
          if (!name) throw new Error('missing name');
          if (binary && !nameOf(kind as Kind, name)) throw new Error(`unsupported file type (${exts.join(', ')})`);
          const file = path.join(dir, binary ? name : name + exts[0]);

          if (req.method === 'PUT') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) chunks.push(chunk as Buffer);
            await fs.writeFile(file, Buffer.concat(chunks));
            res.end(JSON.stringify({ ok: true, name }));
          } else if (req.method === 'DELETE') {
            await fs.unlink(file);
            res.end(JSON.stringify({ ok: true }));
          } else if (binary) {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.end(await fs.readFile(file));
          } else {
            res.end(await fs.readFile(file, 'utf8'));
          }
        } catch (err) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [libraryPlugin()],
});
