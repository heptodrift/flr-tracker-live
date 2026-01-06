# FLR Tracker - Fractal Liquidity Regime Monitor

Real-time market phase transition detection using **Critical Slowing Down (CSD)** analysis and **Log-Periodic Power Law (LPPL)** bubble detection.

All data is sourced from official U.S. government APIs and is fully verifiable.

---

## 📊 Data Sources (100% Auditable)

| Metric | Source | Frequency | Verification URL |
|--------|--------|-----------|------------------|
| **Fed Balance Sheet** | FRED (WALCL) | Weekly | [fred.stlouisfed.org/series/WALCL](https://fred.stlouisfed.org/series/WALCL) |
| **Treasury General Account** | Treasury Fiscal Data | Daily | [fiscaldata.treasury.gov](https://fiscaldata.treasury.gov/datasets/daily-treasury-statement/) |
| **Reverse Repo (ON RRP)** | FRED (RRPONTSYD) | Daily | [fred.stlouisfed.org/series/RRPONTSYD](https://fred.stlouisfed.org/series/RRPONTSYD) |
| **Bank Reserves** | FRED (WRESBAL) | Weekly | [fred.stlouisfed.org/series/WRESBAL](https://fred.stlouisfed.org/series/WRESBAL) |
| **S&P 500** | FRED (SP500) | Daily | [fred.stlouisfed.org/series/SP500](https://fred.stlouisfed.org/series/SP500) |
| **Sunspots** | NOAA SWPC | Daily | [swpc.noaa.gov](https://www.swpc.noaa.gov/products/solar-cycle-progression) |

---

## 🚀 Quick Deploy to Vercel

### Step 1: Get a Free FRED API Key

1. Go to [https://fred.stlouisfed.org/docs/api/api_key.html](https://fred.stlouisfed.org/docs/api/api_key.html)
2. Click "Request API Key"
3. Create an account (free)
4. Copy your API key

### Step 2: Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/flr-tracker-live)

Or manually:

```bash
# Clone the repo
git clone <your-repo-url>
cd flr-tracker-live

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local
# Edit .env.local and add your FRED_API_KEY

# Run locally
npm run dev

# Deploy to Vercel
npx vercel --prod
```

### Step 3: Set Environment Variable in Vercel

1. Go to your Vercel project settings
2. Navigate to "Environment Variables"
3. Add: `FRED_API_KEY` = your key

---

## 📈 API Endpoints

### `GET /api/liquidity`
Returns Fed balance sheet components with full provenance.

### `GET /api/market`
Returns S&P 500 price data with statistics.

### `GET /api/solar`
Returns sunspot and solar flux data.

### `GET /api/analyze`
Combined endpoint that fetches all data and runs CSD/LPPL analysis.

**Query Parameters:**
- `detrendBandwidth` (default: 50) - Gaussian kernel width
- `csdWindow` (default: 250) - Rolling window for AR(1)
- `tauLookback` (default: 100) - Kendall's Tau lookback

---

## 🔬 Methodology

### Critical Slowing Down (CSD)

Based on Scheffer et al. (2009) "Early-warning signals for critical transitions":

1. **Detrend** price series using Gaussian kernel smoother
2. **Calculate AR(1)** - lag-1 autocorrelation of residuals
3. **Calculate variance** - rolling variance of residuals
4. **Kendall's Tau** - trend detection in AR(1)

As systems approach critical transitions, they lose resilience and AR(1) → 1.

### Log-Periodic Power Law (LPPL)

Based on Sornette (2003) "Why Stock Markets Crash":

```
ln(p(t)) = A + B(tc - t)^m + C(tc - t)^m * cos(ω * ln(tc - t) + φ)
```

Detects unsustainable bubble dynamics with characteristic log-periodic oscillations.

---

## 📁 Project Structure

```
flr-tracker-live/
├── pages/
│   ├── api/
│   │   ├── liquidity.js   # Fed data from FRED + Treasury
│   │   ├── market.js      # S&P 500 from FRED
│   │   ├── solar.js       # Sunspots from NOAA
│   │   └── analyze.js     # Combined analysis endpoint
│   ├── _app.js
│   └── index.js
├── lib/
│   ├── statistical-engine.js  # CSD calculations
│   └── lppl-model.js          # LPPL bubble detection
├── src/
│   └── FLRTrackerLive.jsx     # Main React component
├── styles/
│   └── globals.css
├── .env.example
├── next.config.js
├── tailwind.config.js
└── package.json
```

---

## ⚠️ Disclaimer

This tool is for educational and research purposes only. It is **not financial advice**. Past performance and statistical indicators do not guarantee future results. Always do your own research and consult qualified financial advisors.

---

## 📜 License

MIT License - See LICENSE file for details.

---

## 🙏 Acknowledgments

- Federal Reserve Bank of St. Louis (FRED)
- U.S. Department of Treasury
- NOAA Space Weather Prediction Center
- Scheffer et al. for CSD methodology
- Didier Sornette for LPPL model
