/**
 * API Route: /api/analyze
 * Fetches all data and runs CSD/LPPL analysis
 * NOW WITH 10 YEARS OF HISTORY
 */

// ============ STATISTICAL ENGINE ============
class StatisticalEngine {
  static gaussianKernel(x, bandwidth) {
    return Math.exp(-0.5 * Math.pow(x / bandwidth, 2)) / (bandwidth * Math.sqrt(2 * Math.PI));
  }

  static detrend(data, bandwidth = 50) {
    const n = data.length;
    const trend = [];
    const residuals = [];
    
    for (let i = 0; i < n; i++) {
      let weightSum = 0;
      let valueSum = 0;
      for (let j = 0; j < n; j++) {
        const weight = this.gaussianKernel(i - j, bandwidth);
        weightSum += weight;
        valueSum += weight * data[j];
      }
      trend[i] = valueSum / weightSum;
      residuals[i] = data[i] - trend[i];
    }
    return { trend, residuals };
  }

  static rollingAR1(residuals, windowSize = 250) {
    const n = residuals.length;
    const ar1 = [];
    
    for (let i = 0; i < n; i++) {
      if (i < windowSize + 1) { ar1[i] = null; continue; }
      
      const currentWindow = [];
      const lagWindow = [];
      
      for (let j = 0; j < windowSize; j++) {
        currentWindow.push(residuals[i - windowSize + j]);
        lagWindow.push(residuals[i - windowSize + j - 1]);
      }
      
      const meanCurrent = currentWindow.reduce((a, b) => a + b, 0) / windowSize;
      const meanLag = lagWindow.reduce((a, b) => a + b, 0) / windowSize;
      
      let cov = 0, varCurrent = 0, varLag = 0;
      for (let j = 0; j < windowSize; j++) {
        const dCurrent = currentWindow[j] - meanCurrent;
        const dLag = lagWindow[j] - meanLag;
        cov += dCurrent * dLag;
        varCurrent += dCurrent * dCurrent;
        varLag += dLag * dLag;
      }
      
      const correlation = (varCurrent > 0 && varLag > 0) ? cov / Math.sqrt(varCurrent * varLag) : 0;
      ar1[i] = Math.max(-1, Math.min(1, correlation));
    }
    return ar1;
  }

  static rollingVariance(residuals, windowSize = 250) {
    const n = residuals.length;
    const variance = [];
    for (let i = 0; i < n; i++) {
      if (i < windowSize) { variance[i] = null; continue; }
      const window = residuals.slice(i - windowSize, i);
      const mean = window.reduce((a, b) => a + b, 0) / windowSize;
      const sumSq = window.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0);
      variance[i] = sumSq / (windowSize - 1);
    }
    return variance;
  }

  static kendallTau(ar1Series, lookback = 100) {
    const validAr1 = ar1Series.filter(v => v !== null);
    const recent = validAr1.slice(-lookback);
    if (recent.length < 10) return 0;
    
    let concordant = 0, discordant = 0;
    for (let i = 0; i < recent.length - 1; i++) {
      for (let j = i + 1; j < recent.length; j++) {
        const xDiff = j - i;
        const yDiff = recent[j] - recent[i];
        if (xDiff * yDiff > 0) concordant++;
        else if (xDiff * yDiff < 0) discordant++;
      }
    }
    const pairs = (recent.length * (recent.length - 1)) / 2;
    return pairs > 0 ? (concordant - discordant) / pairs : 0;
  }
}

// ============ LPPL MODEL ============
class LPPLModel {
  static lpplFunction(t, tc, A, B, C, m, omega, phi) {
    const dt = tc - t;
    if (dt <= 0) return A;
    const dtm = Math.pow(dt, m);
    return A + B * dtm + C * dtm * Math.cos(omega * Math.log(dt) + phi);
  }

  static optimize(prices) {
    const n = prices.length;
    if (n < 100) return { isBubble: false, confidence: 0, r2: 0 };
    
    // Only use last 500 days for LPPL (bubble detection is recent)
    const recentPrices = prices.slice(-500);
    const rn = recentPrices.length;
    
    const logPrices = recentPrices.map(p => Math.log(p));
    const t = Array.from({ length: rn }, (_, i) => i);
    
    let bestFit = null;
    let bestR2 = -Infinity;
    
    const tcRange = [];
    for (let tc = rn + 5; tc <= rn + 200; tc += 15) tcRange.push(tc);
    
    for (const tc of tcRange) {
      for (const m of [0.2, 0.33, 0.5, 0.67, 0.8]) {
        for (const omega of [6, 8, 10, 12]) {
          for (const phi of [0, Math.PI/2, Math.PI, 3*Math.PI/2]) {
            const X = [], y = [];
            let valid = true;
            
            for (let i = 0; i < rn; i++) {
              const dt = tc - t[i];
              if (dt <= 0) { valid = false; break; }
              const dtm = Math.pow(dt, m);
              X.push([1, dtm, dtm * Math.cos(omega * Math.log(dt) + phi)]);
              y.push(logPrices[i]);
            }
            if (!valid) continue;
            
            const coeffs = this.solveOLS(X, y);
            if (!coeffs) continue;
            const [A, B, C] = coeffs;
            
            if (B >= 0 || Math.abs(C) > Math.abs(B)) continue;
            
            const predicted = t.map(ti => this.lpplFunction(ti, tc, A, B, C, m, omega, phi));
            const ssRes = logPrices.reduce((sum, yi, i) => sum + Math.pow(yi - predicted[i], 2), 0);
            const meanY = logPrices.reduce((a, b) => a + b, 0) / rn;
            const ssTot = logPrices.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0);
            const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
            
            if (r2 > bestR2 && r2 > 0.75) {
              bestR2 = r2;
              bestFit = { tc, A, B, C, m, omega, phi, r2 };
            }
          }
        }
      }
    }
    
    if (!bestFit || bestFit.r2 < 0.75) {
      return { isBubble: false, confidence: 0, r2: bestFit?.r2 || 0, tcDays: null };
    }
    
    const confidence = Math.min(1, Math.max(0, (bestFit.r2 - 0.75) / 0.2));
    const tcDays = Math.round(bestFit.tc - rn + 1);
    
    return {
      ...bestFit,
      confidence,
      tcDays,
      isBubble: confidence > 0.3 && tcDays > 5 && tcDays < 200
    };
  }

  static solveOLS(X, y) {
    const n = X.length, p = 3;
    const XtX = [[0,0,0],[0,0,0],[0,0,0]];
    const Xty = [0,0,0];
    
    for (let i = 0; i < p; i++) {
      for (let j = 0; j < p; j++) {
        for (let k = 0; k < n; k++) XtX[i][j] += X[k][i] * X[k][j];
      }
      for (let k = 0; k < n; k++) Xty[i] += X[k][i] * y[k];
    }
    
    const A = XtX;
    const det = A[0][0]*(A[1][1]*A[2][2]-A[1][2]*A[2][1]) - A[0][1]*(A[1][0]*A[2][2]-A[1][2]*A[2][0]) + A[0][2]*(A[1][0]*A[2][1]-A[1][1]*A[2][0]);
    if (Math.abs(det) < 1e-10) return null;
    
    const inv = 1/det;
    const adj = [
      [(A[1][1]*A[2][2]-A[1][2]*A[2][1])*inv, (A[0][2]*A[2][1]-A[0][1]*A[2][2])*inv, (A[0][1]*A[1][2]-A[0][2]*A[1][1])*inv],
      [(A[1][2]*A[2][0]-A[1][0]*A[2][2])*inv, (A[0][0]*A[2][2]-A[0][2]*A[2][0])*inv, (A[0][2]*A[1][0]-A[0][0]*A[1][2])*inv],
      [(A[1][0]*A[2][1]-A[1][1]*A[2][0])*inv, (A[0][1]*A[2][0]-A[0][0]*A[2][1])*inv, (A[0][0]*A[1][1]-A[0][1]*A[1][0])*inv]
    ];
    
    return [
      adj[0][0]*Xty[0] + adj[0][1]*Xty[1] + adj[0][2]*Xty[2],
      adj[1][0]*Xty[0] + adj[1][1]*Xty[1] + adj[1][2]*Xty[2],
      adj[2][0]*Xty[0] + adj[2][1]*Xty[1] + adj[2][2]*Xty[2]
    ];
  }
}

// ============ MAIN HANDLER ============
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const config = {
    detrendBandwidth: parseInt(req.query.detrendBandwidth) || 50,
    csdWindow: parseInt(req.query.csdWindow) || 250,
    tauLookback: parseInt(req.query.tauLookback) || 100
  };

  const FRED_API_KEY = process.env.FRED_API_KEY;
  if (!FRED_API_KEY) {
    return res.status(500).json({ error: 'FRED_API_KEY not configured' });
  }

  try {
    const endDate = new Date().toISOString().split('T')[0];
    // GO BACK 10 YEARS (TGA data starts 2015)
    const startDate = '2015-01-01';

    // Fetch ALL data directly from external APIs
    const [walclRes, rrpRes, wresbalRes, wtregenRes, sp500Res, solarRes] = await Promise.all([
      fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=WALCL&api_key=${FRED_API_KEY}&file_type=json&observation_start=${startDate}&observation_end=${endDate}`),
      fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=RRPONTSYD&api_key=${FRED_API_KEY}&file_type=json&observation_start=${startDate}&observation_end=${endDate}`),
      fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=WRESBAL&api_key=${FRED_API_KEY}&file_type=json&observation_start=${startDate}&observation_end=${endDate}`),
      fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=WTREGEN&api_key=${FRED_API_KEY}&file_type=json&observation_start=${startDate}&observation_end=${endDate}`),
      fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=SP500&api_key=${FRED_API_KEY}&file_type=json&observation_start=${startDate}&observation_end=${endDate}`),
      fetch('https://services.swpc.noaa.gov/json/solar-cycle/observed-solar-cycle-indices.json')
    ]);

    const [walcl, rrp, wresbal, wtregen, sp500, solar] = await Promise.all([
      walclRes.json(),
      rrpRes.json(),
      wresbalRes.json(),
      wtregenRes.json(),
      sp500Res.json(),
      solarRes.json()
    ]);

    if (walcl.error_message) throw new Error(`FRED: ${walcl.error_message}`);

    // Build lookup maps
    const toMap = (obs, divisor = 1) => {
      const map = {};
      (obs || []).forEach(o => { if (o.value !== '.') map[o.date] = parseFloat(o.value) / divisor; });
      return map;
    };

    const bsMap = toMap(walcl.observations, 1000);
    const rrpMap = toMap(rrp.observations, 1);
    const resMap = toMap(wresbal.observations, 1000);
    const tgaMap = toMap(wtregen.observations, 1000);
    const spxMap = toMap(sp500.observations, 1);

    // FIXED: Better solar data parsing - handle both date formats
    const solarMap = {};
    (solar || []).forEach(s => {
      if (s.ssn != null) {
        // NOAA uses "time-tag" field with format "YYYY-MM-01"
        let dateStr = s['time-tag'];
        if (dateStr) {
          // Normalize to YYYY-MM-DD
          dateStr = dateStr.split('T')[0];
          // Store for the whole month
          const yearMonth = dateStr.substring(0, 7); // "YYYY-MM"
          solarMap[yearMonth] = Math.round(s.ssn);
        }
      }
    });

    // Get dates where we have S&P data (most granular)
    const allDates = Object.keys(spxMap).sort();

    // Forward fill weekly data
    const ffill = (map, dates) => {
      const out = {};
      let last = null;
      dates.forEach(d => { if (map[d] !== undefined) last = map[d]; if (last !== null) out[d] = last; });
      return out;
    };

    const fBS = ffill(bsMap, allDates);
    const fTGA = ffill(tgaMap, allDates);
    const fRRP = ffill(rrpMap, allDates);
    const fRes = ffill(resMap, allDates);

    // Build unified time series
    const timeSeries = allDates
      .filter(d => fBS[d] && fTGA[d] && fRRP[d] !== undefined && spxMap[d])
      .map(d => {
        // Get sunspot by matching year-month
        const yearMonth = d.substring(0, 7);
        const sunspots = solarMap[yearMonth] || null;
        
        return {
          date: d,
          balanceSheet: Math.round(fBS[d] * 10) / 10,
          tga: Math.round(fTGA[d] * 10) / 10,
          rrp: Math.round(fRRP[d] * 10) / 10,
          reserves: fRes[d] ? Math.round(fRes[d] * 10) / 10 : null,
          netLiquidity: Math.round((fBS[d] - fTGA[d] - fRRP[d]) * 10) / 10,
          spx: Math.round(spxMap[d] * 100) / 100,
          sunspots
        };
      });

    if (timeSeries.length < 100) {
      return res.status(400).json({ error: 'Insufficient data', count: timeSeries.length });
    }

    // Run CSD analysis
    const prices = timeSeries.map(d => d.spx);
    const { trend, residuals } = StatisticalEngine.detrend(prices, config.detrendBandwidth);
    const ar1Series = StatisticalEngine.rollingAR1(residuals, config.csdWindow);
    const varianceSeries = StatisticalEngine.rollingVariance(residuals, config.csdWindow);
    const kendallTau = StatisticalEngine.kendallTau(ar1Series, config.tauLookback);
    
    const validAr1 = ar1Series.filter(v => v !== null);
    const currentAR1 = validAr1.length > 0 ? validAr1[validAr1.length - 1] : 0;

    let csdStatus = 'NORMAL';
    if (currentAR1 > 0.8) csdStatus = 'CRITICAL';
    else if (currentAR1 > 0.7) csdStatus = 'ELEVATED';
    else if (currentAR1 > 0.6) csdStatus = 'RISING';

    // Run LPPL
    const lpplResult = LPPLModel.optimize(prices);

    // Add analysis to time series
    const analyzed = timeSeries.map((d, i) => ({
      ...d,
      trend: trend[i] ? Math.round(trend[i] * 100) / 100 : null,
      ar1: ar1Series[i] !== null ? Math.round(ar1Series[i] * 1000) / 1000 : null,
      variance: varianceSeries[i] !== null ? Math.round(varianceSeries[i] * 100) / 100 : null
    }));

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      config,
      sources: {
        liquidity: {
          balanceSheet: { name: 'WALCL', url: 'https://fred.stlouisfed.org/series/WALCL', frequency: 'Weekly' },
          tga: { name: 'WTREGEN', url: 'https://fred.stlouisfed.org/series/WTREGEN', frequency: 'Weekly' },
          rrp: { name: 'RRPONTSYD', url: 'https://fred.stlouisfed.org/series/RRPONTSYD', frequency: 'Daily' },
          reserves: { name: 'WRESBAL', url: 'https://fred.stlouisfed.org/series/WRESBAL', frequency: 'Weekly' }
        },
        market: { name: 'SP500', url: 'https://fred.stlouisfed.org/series/SP500', frequency: 'Daily' },
        solar: { name: 'NOAA SWPC', url: 'https://www.swpc.noaa.gov/products/solar-cycle-progression', frequency: 'Monthly' }
      },
      csd: {
        currentAR1: Math.round(currentAR1 * 1000) / 1000,
        kendallTau: Math.round(kendallTau * 1000) / 1000,
        status: csdStatus
      },
      lppl: {
        isBubble: lpplResult.isBubble,
        confidence: Math.round((lpplResult.confidence || 0) * 100),
        tcDays: lpplResult.tcDays,
        r2: lpplResult.r2 ? Math.round(lpplResult.r2 * 1000) / 1000 : null,
        omega: lpplResult.omega ? Math.round(lpplResult.omega * 100) / 100 : null,
        interpretation: lpplResult.isBubble
          ? `Bubble signature detected. ~${lpplResult.tcDays} days to critical time.`
          : 'No LPPL bubble signature detected.'
      },
      latest: analyzed[analyzed.length - 1],
      timeSeries: analyzed,
      recordCount: analyzed.length,
      dateRange: { start: analyzed[0]?.date, end: analyzed[analyzed.length - 1]?.date }
    });

  } catch (error) {
    console.error('Analysis API Error:', error);
    return res.status(500).json({ error: 'Analysis failed', message: error.message });
  }
}
