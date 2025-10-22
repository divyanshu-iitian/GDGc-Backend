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

// Track scraping state for incremental updates
let SCRAPE_STATE = {
  lastBatchIndex: -1,  // Which batch was scraped last
  totalProfiles: 187,
  batchSize: 50,       // Scrape 50 profiles at a time
  isRunning: false,
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

function runScrape(batchIndex = null) {
  return new Promise((resolve) => {
    if (SCRAPE_STATE.isRunning) {
      console.log('[scrape] Already running, skipping...');
      return resolve({ ok: false, reason: 'already_running' });
    }

    SCRAPE_STATE.isRunning = true;
    
    // Determine batch to scrape (null = scrape all)
    const startIdx = batchIndex !== null ? batchIndex * SCRAPE_STATE.batchSize : 0;
    const endIdx = batchIndex !== null ? (batchIndex + 1) * SCRAPE_STATE.batchSize : SCRAPE_STATE.totalProfiles;
    
    console.log(`[scrape] Starting scrape at ${new Date().toISOString()}`);
    console.log(`[scrape] Batch mode: ${batchIndex !== null ? `batch ${batchIndex} (profiles ${startIdx}-${endIdx})` : 'ALL profiles'}`);

    const outPath = OUTPUT_JSON;
    const script = 'batch_from_csv.py';
    const args = [script, '--out', outPath, '--workers', '3'];
    
    // Add batch parameters if needed
    if (batchIndex !== null) {
      args.push('--start', startIdx.toString(), '--limit', SCRAPE_STATE.batchSize.toString());
    }
    
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
      SCRAPE_STATE.isRunning = false;
      
      if (code === 0) {
        console.log('[scrape] Completed successfully');
        // Refresh cache from latest file
        const latest = readJsonSafe(outPath);
        if (Array.isArray(latest)) {
          CACHE.data = latest;
          CACHE.updatedAt = new Date().toISOString();
          console.log(`[scrape] Cache updated: ${CACHE.data.length} profiles`);
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
console.log('[init] Serving cached data. Full scraping will start at scheduled interval.');
console.log(`[init] Cached profiles: ${CACHE.data.length}`);

// Schedule FULL scrape every 20 minutes
// This will scrape ALL 187 profiles but with optimized settings (3 workers)
cron.schedule('*/20 * * * *', async () => {
  console.log('[cron] Starting full scrape of all 187 profiles...');
  await runScrape(null); // null = scrape all
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
