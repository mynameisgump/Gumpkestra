import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';

// The library lives on disk so shaders/presets can be edited in any editor,
// versioned with git, and shared. The dev server exposes it over a tiny API
// and pushes change events so edits hot-reload without a page refresh.
const LIB = path.resolve(import.meta.dirname, 'library');
const DIRS = { shaders: '.fs', presets: '.json' } as const;
type Kind = keyof typeof DIRS;

const safeName = (name: string) => name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim();

function libraryPlugin(): Plugin {
  return {
    name: 'gumpkestra-library',
    configureServer(server) {
      server.watcher.add(LIB);
      const notify = (file: string) => {
        if (!file.startsWith(LIB)) return;
        const kind = path.basename(path.dirname(file)) as Kind;
        if (!(kind in DIRS)) return;
        server.ws.send({
          type: 'custom',
          event: 'library-changed',
          data: { kind, name: path.basename(file, DIRS[kind]) },
        });
      };
      server.watcher.on('change', notify);
      server.watcher.on('add', notify);
      server.watcher.on('unlink', notify);

      server.middlewares.use('/api/library', async (req, res) => {
        try {
          const [, kind, rawName] = (req.url ?? '').split('?')[0].split('/');
          if (!(kind in DIRS)) throw new Error(`unknown library kind "${kind}"`);
          const ext = DIRS[kind as Kind];
          const dir = path.join(LIB, kind);

          if (!rawName && req.method === 'GET') {
            const files = (await fs.readdir(dir)).filter((f) => f.endsWith(ext));
            const items = await Promise.all(
              files.map(async (f) => ({
                name: path.basename(f, ext),
                source: await fs.readFile(path.join(dir, f), 'utf8'),
              })),
            );
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(items));
            return;
          }

          const name = safeName(decodeURIComponent(rawName ?? ''));
          if (!name) throw new Error('missing name');
          const file = path.join(dir, name + ext);

          if (req.method === 'PUT') {
            let body = '';
            for await (const chunk of req) body += chunk;
            await fs.writeFile(file, body, 'utf8');
            res.end(JSON.stringify({ ok: true, name }));
          } else if (req.method === 'DELETE') {
            await fs.unlink(file);
            res.end(JSON.stringify({ ok: true }));
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
