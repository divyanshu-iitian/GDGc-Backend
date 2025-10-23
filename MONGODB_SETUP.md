# MongoDB Setup Guide for Render

## What Changed? 🎉

Your backend now uses **MongoDB Atlas** for permanent data storage! 

### Benefits:
- ✅ **Data Persistence**: No data loss on backend restart
- ✅ **Auto-Sync**: Every scrape automatically saves to MongoDB
- ✅ **Fast Recovery**: Backend loads data from MongoDB on startup
- ✅ **Dual Backup**: MongoDB + local JSON files for reliability

---

## Render Environment Variable Setup

### Step 1: Go to Render Dashboard
https://dashboard.render.com

### Step 2: Select Your Service
Click on `gdgc-backend-1` (or your service name)

### Step 3: Go to Environment Variables
Left sidebar → **Environment** tab

### Step 4: Add MongoDB Connection

Click **"Add Environment Variable"** and add:

```
Key: MONGODB_URI
Value: mongodb+srv://divyanshumishra0806_db_user:77K64gX5xX14nxmW@cluster0.xrv8slm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
```

### Step 5: Save Changes
Click **"Save Changes"** button

### Step 6: Wait for Auto-Deploy
- Render will automatically redeploy with new env variable
- Build takes ~5-10 minutes
- Watch the logs for: `[MongoDB] ✅ Connected successfully`

---

## How It Works 🔄

### On Backend Startup:
1. Connects to MongoDB
2. Loads existing data from database
3. If MongoDB empty, loads from local JSON files
4. Updates cache for instant API responses

### After Each Scrape:
1. Saves all 187 profiles to MongoDB
2. Also saves to local JSON (backup)
3. Updates in-memory cache
4. Logs: `[MongoDB] 💾 Saved X profiles`

### MongoDB Collection Structure:
```javascript
{
  "_id": ObjectId("..."),
  "url": "https://www.cloudskillsboost.google/...",
  "name": "Participant Name",
  "titles": ["Badge 1", "Badge 2", ...],
  "badge_count": 15,
  "updatedAt": ISODate("2025-10-23T...")
}
```

### Unique Index:
- **Field**: `url` (prevents duplicates)
- **Type**: Unique index for fast lookups

---

## Testing After Deployment

### 1. Check Logs
```bash
# In Render Dashboard → Logs
Look for these messages:
[MongoDB] Connecting...
[MongoDB] ✅ Connected successfully
[Cache] ✅ Loaded 187 profiles from MongoDB
```

### 2. Test API
```bash
# Check if data is being returned
curl https://gdgc-backend-1.onrender.com/api/leaderboard | jq 'length'
# Should return: 187
```

### 3. Verify MongoDB
- Go to MongoDB Atlas: https://cloud.mongodb.com
- Navigate to: Cluster0 → Browse Collections
- Database: `gdgc-leaderboard`
- Collection: `profiles`
- Should see 187 documents

---

## Troubleshooting

### ❌ "MongoServerError: bad auth"
- **Cause**: Wrong MongoDB credentials
- **Fix**: Double-check MONGODB_URI in Render env vars

### ❌ "Connection timeout"
- **Cause**: MongoDB Atlas IP whitelist
- **Fix**: In Atlas → Network Access → Add IP → **Allow Access from Anywhere** (0.0.0.0/0)

### ❌ "Cannot find module 'mongodb'"
- **Cause**: Package not installed
- **Fix**: Already done! `mongodb` is in package.json dependencies

### ⚠️ Logs show "Failed to persist to MongoDB"
- **Cause**: Network issue or connection lost
- **Fix**: Backend will auto-reconnect. Local JSON backup ensures no data loss

---

## Advanced: MongoDB Atlas Dashboard

### View Your Data:
1. Go to https://cloud.mongodb.com
2. Login with your account
3. Click on **"Cluster0"**
4. Click **"Browse Collections"**
5. Select database: `gdgc-leaderboard`
6. Select collection: `profiles`

### Run Queries:
```javascript
// Find top 10 by badges
{ badge_count: { $gte: 10 } }

// Search by name
{ name: { $regex: "Bhaskar", $options: "i" } }

// Recently updated
{ updatedAt: { $gte: ISODate("2025-10-23T00:00:00Z") } }
```

---

## Summary

✨ Your backend is now **production-ready** with:
- ✅ MongoDB Atlas integration
- ✅ Playwright browser automation
- ✅ Auto-scraping every 20 minutes
- ✅ Data persistence across restarts
- ✅ Dual backup system (MongoDB + JSON)

**Next Deployment:** Just wait for Render to redeploy (5-10 mins) and check logs! 🚀
