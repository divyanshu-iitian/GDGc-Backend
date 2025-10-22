# GDG Cloud GGV - Backend Server

Backend server for the GDG Cloud GGV Leaderboard that automatically scrapes Google Skills profile data every hour.

## Features

- 🔄 **Auto-refresh**: Scrapes data every hour using node-cron
- 🚀 **REST API**: Simple endpoints to fetch leaderboard data
- 🐍 **Python Integration**: Runs existing Python scraper scripts
- 📊 **JSON Storage**: Stores results in `data/results.json`

## Tech Stack

- Node.js + Express
- node-cron (scheduled tasks)
- CORS enabled
- Python (for scraping)

## API Endpoints

### `GET /api/leaderboard`
Returns the current leaderboard data.

**Response:**
```json
[
  {
    "url": "https://...",
    "name": "Participant Name",
    "titles": ["Badge 1", "Badge 2", ...],
    "badgeCount": 5
  }
]
```

### `POST /api/scrape`
Manually trigger a scrape operation.

**Response:**
```json
{
  "ok": true,
  "stdout": "..."
}
```

## Setup & Installation

### Prerequisites
- Node.js 18+ 
- Python 3.12+
- `batch_from_csv.py` script in parent directory
- `gform.csv` with profile URLs

### Local Development

1. **Clone the repository:**
```bash
git clone https://github.com/divyanshu-iitian/GDGc-Backend.git
cd GDGc-Backend
```

2. **Install dependencies:**
```bash
npm install
```

3. **Set Python path (if needed):**
```bash
# Windows
$env:PYTHON = "python3.12"

# Linux/Mac
export PYTHON="python3"
```

4. **Start the server:**
```bash
npm start
```

Server will start on `http://localhost:4000`

## Deployment on Render

### Step 1: Prepare Repository
Your backend is ready! Just push to GitHub:

```bash
cd GDGc-Backend
git add .
git commit -m "Initial backend setup"
git push origin main
```

### Step 2: Create Render Account
1. Go to https://render.com
2. Sign up with GitHub

### Step 3: Deploy Web Service

1. **Click "New +" → "Web Service"**

2. **Connect Repository:**
   - Select `divyanshu-iitian/GDGc-Backend`
   - Click "Connect"

3. **Configure Service:**
   - **Name:** `gdgc-ggv-backend` (or any name)
   - **Region:** Choose closest (e.g., Singapore, Frankfurt)
   - **Branch:** `main`
   - **Root Directory:** Leave empty
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free` (for testing)

4. **Environment Variables:**
   Click "Add Environment Variable" and add:
   ```
   Key: PYTHON
   Value: python3
   ```

5. **Advanced Settings (Optional):**
   - **Auto-Deploy:** Yes (deploys on every git push)
   - **Health Check Path:** `/api/leaderboard`

6. **Click "Create Web Service"**

### Step 4: Wait for Deployment
- First deploy takes 5-10 minutes
- Watch build logs in real-time
- Once deployed, you'll get a URL like: `https://gdgc-ggv-backend.onrender.com`

### Step 5: Test Your API

```bash
# Test leaderboard endpoint
curl https://gdgc-ggv-backend.onrender.com/api/leaderboard

# Manual scrape (if needed)
curl -X POST https://gdgc-ggv-backend.onrender.com/api/scrape
```

### Step 6: Update Frontend

Update your frontend API URL:
```javascript
// In leaderboard-website/src/App.jsx
const API_URL = 'https://gdgc-ggv-backend.onrender.com'
```

## Scheduled Scraping

- **Frequency:** Every hour at minute 0
- **Cron Expression:** `0 * * * *`
- **Example:** 1:00, 2:00, 3:00, etc.

On startup, server runs scrape immediately, then every hour.

## Important Notes for Render

⚠️ **Free Tier Limitations:**
- Service sleeps after 15 min of inactivity
- First request after sleep takes ~1 min to wake up
- 750 hours/month free (enough for 1 service)

⚠️ **Python Script Requirements:**
- Ensure `batch_from_csv.py` and `gform.csv` exist in repo root
- Install Python dependencies if needed (add to build command)

⚠️ **Environment Variables:**
- Set `PYTHON=python3` on Render
- Add any other env vars your scraper needs

## Troubleshooting

### Build fails on Render
- Check build logs for missing dependencies
- Ensure `package.json` has all deps listed
- Verify Node.js version compatibility

### Scraping fails
- Check if Python script path is correct
- Verify Python command (`python3` vs `python`)
- Check logs: Render Dashboard → Service → Logs

### API returns empty array
- Check if scrape completed successfully
- Verify `data/results.json` exists
- Check fallback to parent `results_from_gform.json`

## Project Structure

```
GDGc-Backend/
├── index.js              # Main Express server
├── package.json          # Dependencies
├── .gitignore           # Git ignore rules
├── README.md            # This file
├── data/                # Scraped data storage
│   └── results.json     # Latest scrape results
└── [parent dir]/
    ├── batch_from_csv.py    # Python scraper
    ├── gform.csv            # Profile URLs
    └── results_from_gform.json  # Fallback data
```

## License

MIT

## Support

For issues, contact: divyanshu-iitian on GitHub

---
Built with ❤️ by GDG Cloud GGV
