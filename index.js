import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import cron from 'node-cron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;
const PYTHON = process.env.PYTHON || (process.platform === 'win32' ? 'py -3' : 'python3');
const WORKSPACE_ROOT = __dirname; // Python files are in the same directory
const DATA_DIR = path.join(__dirname, 'data');
const OUTPUT_JSON = path.join(DATA_DIR, 'results.json');
const FALLBACK_JSON = path.join(__dirname, 'results_from_gform.json');

// In-memory cache to serve instantly
let CACHE = {
  data: [],
  updatedAt: null,
};

app.use(cors({ origin: '*' }));
app.use(express.json());

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJsonSafe(file) {
  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error(`[readJsonSafe] Failed reading ${file}`, e);
  }
  return null;
}

// Initialize cache from last output or fallback
(function initCache() {
  const initial = readJsonSafe(OUTPUT_JSON) || readJsonSafe(FALLBACK_JSON) || [];
  CACHE.data = Array.isArray(initial) ? initial : [];
  CACHE.updatedAt = new Date().toISOString();
  // Ensure an output file exists for visibility
  try {
    if (!fs.existsSync(OUTPUT_JSON)) {
      fs.writeFileSync(OUTPUT_JSON, JSON.stringify(CACHE.data, null, 2));
    }
  } catch {}
})();

function runScrape() {
  return new Promise((resolve) => {
    console.log(`[scrape] Starting scrape at ${new Date().toISOString()}`);

    const outPath = OUTPUT_JSON;
    const script = 'batch_from_csv.py';
    const args = [script, '--out', outPath];
    console.log(`[scrape] cmd: ${PYTHON} ${args.join(' ')} (cwd=${WORKSPACE_ROOT})`);
    const proc = spawn(PYTHON, args, {
      cwd: WORKSPACE_ROOT,
      shell: true,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));

    proc.on('error', (err) => {
      console.error('[scrape] Spawn error:', err.message);
      resolve({ ok: false, stderr: err.message });
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log('[scrape] Completed successfully');
        // Refresh cache from latest file
        const latest = readJsonSafe(outPath);
        if (Array.isArray(latest)) {
          CACHE.data = latest;
          CACHE.updatedAt = new Date().toISOString();
        }
        resolve({ ok: true, stdout });
      } else {
        console.error(`[scrape] Failed with code ${code}`);
        if (stderr) console.error(stderr);
        resolve({ ok: false, stdout, stderr, code });
      }
    });
  });
}

// Skip startup scrape to save memory - serve cached data immediately
console.log('[init] Serving cached data. Scraping will start at scheduled interval.');

// Schedule scrape every 20 minutes (reduced from 5 to prevent memory issues)
cron.schedule('*/20 * * * *', async () => {
  console.log('[cron] Starting scheduled scrape...');
  await runScrape();
});

app.get('/api/leaderboard', (req, res) => {
  res.json(CACHE.data || []);
});

app.get('/api/status', (req, res) => {
  res.json({ updatedAt: CACHE.updatedAt, count: CACHE.data?.length || 0 });
});

app.post('/api/scrape', async (req, res) => {
  const result = await runScrape();
  res.json(result);
});

// Simple health endpoint
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Friendly root page
app.get('/', (req, res) => {
  res.type('html').send(`
    <html>
      <body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; padding:24px;">
        <h2>GDGC GGV Leaderboard API</h2>
        <ul>
          <li><a href="/api/leaderboard">/api/leaderboard</a> – Leaderboard data</li>
          <li><a href="/api/health">/api/health</a> – Health check</li>
          <li><a href="/api/scrape">/api/scrape</a> – Trigger scrape (POST)</li>
        </ul>
      </body>
    </html>
  `);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
