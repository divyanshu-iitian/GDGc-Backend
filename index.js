import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import cron from 'node-cron';
import { MongoClient } from 'mongodb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prevent server crash on uncaught errors
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://divyanshumishra0806_db_user:77K64gX5xX14nxmW@cluster0.xrv8slm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = 'gdgc-leaderboard';
const COLLECTION_NAME = 'profiles';

let mongoClient = null;
let db = null;
let profilesCollection = null;

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

// MongoDB Connection
async function connectMongoDB() {
  try {
    if (!mongoClient) {
      console.log('[MongoDB] Connecting...');
      mongoClient = new MongoClient(MONGODB_URI, {
        serverSelectionTimeoutMS: 5000, // 5 second timeout
        connectTimeoutMS: 10000,
        socketTimeoutMS: 45000,
      });
      
      await mongoClient.connect();
      db = mongoClient.db(DB_NAME);
      profilesCollection = db.collection(COLLECTION_NAME);
      
      // Create index on URL for faster queries
      await profilesCollection.createIndex({ url: 1 }, { unique: true });
      
      console.log('[MongoDB] ✅ Connected successfully');
    }
    return profilesCollection;
  } catch (error) {
    console.error('[MongoDB] ❌ Connection failed:', error.message);
    console.log('[MongoDB] ℹ️ Will continue with local files only');
    mongoClient = null; // Reset so it can retry later
    return null;
  }
}

// Save data to MongoDB
async function saveToMongoDB(profiles) {
  try {
    const collection = await connectMongoDB();
    if (!collection || !Array.isArray(profiles) || profiles.length === 0) {
      console.log('[MongoDB] ⏭️ Skipping save (no connection or no data)');
      return;
    }

    // Upsert each profile (update if exists, insert if new)
    // Save ALL profiles, even if incomplete
    const operations = profiles
      .filter(p => p.url) // Only need valid URL
      .map(profile => ({
        updateOne: {
          filter: { url: profile.url },
          update: {
            $set: {
              url: profile.url,
              name: profile.name || 'Unknown', // Default name if missing
              titles: Array.isArray(profile.titles) ? profile.titles : [],
              badge_count: Array.isArray(profile.titles) ? profile.titles.length : 0, // Calculate badge_count
              error: profile.error || null,
              updatedAt: new Date()
            }
          },
          upsert: true
        }
      }));

    if (operations.length > 0) {
      const result = await collection.bulkWrite(operations);
      console.log(`[MongoDB] 💾 Saved ${result.upsertedCount + result.modifiedCount} profiles`);
    }
  } catch (error) {
    console.error('[MongoDB] ❌ Save error:', error.message);
    console.log('[MongoDB] ℹ️ Data saved to local files only');
  }
}

// Load data from MongoDB
async function loadFromMongoDB() {
  try {
    const collection = await connectMongoDB();
    if (!collection) {
      console.log('[MongoDB] ⏭️ Skipping load (no connection)');
      return null;
    }

    const profiles = await collection
      .find({})
      .sort({ badge_count: -1, name: 1 })
      .toArray();
    
    console.log(`[MongoDB] 📥 Loaded ${profiles.length} profiles from database`);
    return profiles;
  } catch (error) {
    console.error('[MongoDB] ❌ Load error:', error.message);
    return null;
  }
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

// Initialize cache from MongoDB first, then fallback to files
async function initCache() {
  console.log('[Cache] Initializing...');
  
  // Try loading from MongoDB first
  const mongoData = await loadFromMongoDB();
  
  if (mongoData && mongoData.length > 0) {
    CACHE.data = mongoData;
    console.log(`[Cache] ✅ Loaded ${mongoData.length} profiles from MongoDB`);
  } else {
    // Fallback to local files
    const initial = readJsonSafe(OUTPUT_JSON) || readJsonSafe(FALLBACK_JSON) || [];
    CACHE.data = Array.isArray(initial) ? initial : [];
    console.log(`[Cache] ℹ️ Loaded ${CACHE.data.length} profiles from local files`);
    
    // If we have local data but not in MongoDB, save it
    if (CACHE.data.length > 0) {
      await saveToMongoDB(CACHE.data);
    }
  }
  
  CACHE.updatedAt = new Date().toISOString();
  
  // Ensure an output file exists for visibility
  try {
    if (!fs.existsSync(OUTPUT_JSON)) {
      fs.writeFileSync(OUTPUT_JSON, JSON.stringify(CACHE.data, null, 2));
    }
  } catch {}
}

// Call initCache asynchronously
initCache().catch(console.error);

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
          
          // IMPORTANT: Save to MongoDB for permanent persistence
          saveToMongoDB(latest).then(() => {
            console.log('[scrape] ✅ Data synced to MongoDB');
          }).catch(err => {
            console.error('[scrape] MongoDB sync error:', err.message);
          });
          
          // Also backup to fallback file for local access
          try {
            fs.writeFileSync(FALLBACK_JSON, JSON.stringify(latest, null, 2));
            console.log('[scrape] Persisted data to fallback file');
          } catch (err) {
            console.error('[scrape] Failed to persist to fallback:', err.message);
          }
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

// Start immediate scrape on startup (non-blocking) - DISABLED
// console.log('[init] Starting immediate scrape on startup...');
// console.log(`[init] Currently cached profiles: ${CACHE.data.length}`);

// Trigger first scrape immediately but don't wait for it - COMPLETELY DISABLED
// setTimeout(() => {
//   runScrape(null).then((res) => {
//     if (res.ok) {
//       console.log('[init] ✅ Startup scrape completed and synced to MongoDB');
//     } else {
//       console.warn('[init] ⚠️ Startup scrape failed, will retry at next cron interval');
//     }
//   }).catch(err => {
//     console.error('[init] ❌ Startup scrape error:', err.message);
//   });
// }, 5000); // Wait 5 seconds after server starts

// Schedule FULL scrape every 20 minutes - AUTO UPDATE TO MONGODB
// This will scrape ALL 187 profiles and immediately update MongoDB
cron.schedule('*/20 * * * *', async () => {
  console.log('[cron] Starting scheduled full scrape of all 187 profiles...');
  const result = await runScrape(null); // null = scrape all
  if (result.ok) {
    console.log('[cron] ✅ Scrape completed and data synced to MongoDB');
  } else {
    console.log('[cron] ⚠️ Scrape failed, will retry in next cycle');
  }
});

app.get('/api/leaderboard', (req, res) => {
  // Ensure badge_count is always present for frontend
  const data = (CACHE.data || []).map(profile => ({
    ...profile,
    badge_count: Array.isArray(profile.titles) ? profile.titles.length : 0,
    name: profile.name || 'Unknown'
  }));
  res.json(data);
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
