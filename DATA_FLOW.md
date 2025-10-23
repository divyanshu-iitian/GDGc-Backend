# 🔄 Complete Data Flow - GDGC Leaderboard

## Simple Flow (As You Wanted):

```
1. Python Script Scrapes Data (187 profiles)
   ↓
2. Data Saved to MongoDB (replaces old data)
   ↓
3. Backend Serves Data to Frontend from MongoDB
   ↓
4. On Restart/New Scrape: MongoDB data gets replaced
```

---

## Detailed Flow:

### 🚀 Backend Startup (index.js starts)
```javascript
1. Server starts on PORT 4000
   ↓
2. connectMongoDB() → Connects to MongoDB Atlas
   ↓
3. initCache() runs:
   - Tries to load data from MongoDB
   - If MongoDB has data → CACHE = MongoDB data ✅
   - If MongoDB empty → loads from local JSON (fallback)
   - CACHE now has 187 profiles in memory
   ↓
4. Server ready to serve /api/leaderboard
```

### 📊 Frontend Requests Data
```javascript
GET /api/leaderboard
   ↓
res.json(CACHE.data)  // Instant response from memory
   ↓
Frontend receives 187 profiles
```

### 🕐 Every 20 Minutes (Cron Job)
```javascript
cron.schedule('*/20 * * * *')
   ↓
1. runScrape() starts
   - Spawns: python3 batch_from_csv.py
   ↓
2. Python scrapes all 187 profiles from Google Cloud Skills
   ↓
3. Python writes to: data/results.json
   ↓
4. Backend reads the new data
   ↓
5. saveToMongoDB(newData) → REPLACES all profiles in MongoDB
   - Each profile upserted by URL (unique key)
   - Old data with same URL = updated
   - New URLs = inserted
   ↓
6. CACHE.data = newData (memory updated)
   ↓
7. Frontend fetches and sees new data immediately
```

### 🔄 Backend Restarts (Deploy/Crash)
```javascript
1. Server restarts
   ↓
2. connectMongoDB() → Connects to Atlas
   ↓
3. initCache() → Loads 187 profiles from MongoDB
   ↓
4. CACHE ready with last scraped data ✅
   ↓
5. No data loss! Frontend keeps working
```

---

## Current Status ✅

### What's Working:
- ✅ MongoDB connection successful
- ✅ 187 profiles already in MongoDB
- ✅ Backend loads from MongoDB on startup
- ✅ Scraping every 20 minutes
- ✅ Auto-save to MongoDB after each scrape
- ✅ Frontend auto-fetches every 5 seconds
- ✅ Data persists across restarts

### Files:
```
GDGc-Backend/
├── index.js                     # Main server (YOU ARE HERE)
├── batch_from_csv.py            # Python scraper
├── gform.csv                    # 187 profile URLs
├── data/
│   └── results.json             # Latest scrape (local backup)
└── results_from_gform.json      # Fallback data
```

### MongoDB:
```
Database: gdgc-leaderboard
Collection: profiles
Documents: 187 profiles
Index: url (unique)
```

---

## Simple Test Commands:

### 1. Check Current Data in MongoDB:
```bash
node test-mongo.js
```

### 2. Start Backend Locally:
```bash
cd C:/Users/hp/OneDrive/Desktop/scraper/GDGc-Backend
$env:PORT=4000
node index.js
```

### 3. Test API:
```bash
# Get all profiles
curl http://localhost:4000/api/leaderboard

# Check status
curl http://localhost:4000/api/status

# Manual scrape
curl -X POST http://localhost:4000/api/scrape
```

### 4. Test Frontend:
```bash
cd C:/Users/hp/OneDrive/Desktop/scraper/leaderboard-website
npm run dev
```
Open: http://localhost:5173

---

## How Data Gets Replaced:

### MongoDB Upsert Strategy:
```javascript
{
  updateOne: {
    filter: { url: "https://profile-url" },  // Find by URL
    update: { $set: { ...newData } },        // Replace data
    upsert: true                              // Insert if not exists
  }
}
```

### What Happens:
- **Same URL** → Data updated (name, badges, titles replaced)
- **New URL** → New profile inserted
- **Old URL not in new scrape** → Stays in MongoDB (not deleted)

### Simple Replacement Logic:
```
Scrape completes → 187 new profiles
   ↓
For each profile:
   - Find in MongoDB by URL
   - If exists: UPDATE with new data
   - If not exists: INSERT new profile
   ↓
MongoDB now has latest data
```

---

## Summary (Bilkul Simple):

1. **Scraping**: Python scrapes → 187 profiles
2. **Saving**: Backend saves to MongoDB (replaces by URL)
3. **Serving**: Frontend gets data from MongoDB (via backend cache)
4. **Restart**: Backend loads from MongoDB → No data loss

**Bas! Itna hi simple hai! 🎉**

---

## Ready to Deploy?

Your backend is 100% ready! Just:
1. Push to GitHub (already done ✅)
2. Add `MONGODB_URI` env var in Render
3. Backend auto-deploys
4. Frontend connects and works! 🚀
