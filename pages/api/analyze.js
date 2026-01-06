/**
 * API Route: /api/analyze
 * 
 * Combined endpoint that:
 * 1. Fetches all real data from /api/liquidity, /api/market, /api/solar
 * 2. Runs CSD (Critical Slowing Down) analysis
 * 3. Runs LPPL (Log-Periodic Power Law) bubble detection
 * 4. Returns unified dataset with analysis results
 * 
 * All data is sourced from official government APIs and is fully auditable.
 */

import { analyzeCSD } from '../../lib/statistical-engine';
import { optimizeLPPL } from '../../lib/lppl-model';

let cache = {
  data: null,
  timestamp: 0
};
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes (analysis is expensive)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  // Parse config from query params
  const config = {
    detrendBandwidth: parseInt(req.query.detrendBandwidth) || 50,
    csdWindow: parseInt(req.query.csdWindow) || 250,
    tauLookback: parseInt(req.query.tauLookback) || 100
  };

  // Create cache key based on config
  const cacheKey = JSON.stringify(config);
  
  if (cache.data && cache.key === cacheKey && Date.now() - cache.timestamp < CACHE_TTL) {
    return res.status(200).json({
      ...cache.data,
      cached: true,
      cacheAge: Math.round((Date.now() - cache.timestamp) / 1000)
    });
  }

  try {
    // Get base URL for internal API calls
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host;
    const baseUrl = `${protocol}://${host}`;

    // Fetch all data sources in parallel
    const [liquidityRes, marketRes, solarRes] = await Promise.all([
      fetch(`${baseUrl}/api/liquidity`),
      fetch(`${baseUrl}/api/market`),
      fetch(`${baseUrl}/api/solar`)
    ]);

    const [liquidityData, marketData, solarData] = await Promise.all([
      liquidityRes.json(),
      marketRes.json(),
      solarRes.json()
    ]);

    // Check for errors
    if (liquidityData.error) {
      return res.status(500).json({ 
        error: 'Failed to fetch liquidity data', 
        details: liquidityData 
      });
    }
    if (marketData.error) {
      return res.status(500).json({ 
        error: 'Failed to fetch market data', 
        details: marketData 
      });
    }

    // Build unified time series by date
    const liquidityMap = {};
    (liquidityData.timeSeries || []).forEach(d => {
      liquidityMap[d.date] = d;
    });

    const marketMap = {};
    (marketData.timeSeries || []).forEach(d => {
      marketMap[d.date] = d;
    });

    const solarMap = {};
    (solarData.timeSeries || []).forEach(d => {
      solarMap[d.date] = d;
    });

    // Get all unique dates and sort
    const allDates = [...new Set([
      ...Object.keys(liquidityMap),
      ...Object.keys(marketMap)
    ])].sort();

    // Build unified dataset (only dates with both liquidity AND market data)
    const unifiedData = allDates
      .filter(date => liquidityMap[date] && marketMap[date])
      .map(date => {
        const liq = liquidityMap[date] || {};
        const mkt = marketMap[date] || {};
        const sol = solarMap[date] || {};
        
        return {
          date,
          balanceSheet: liq.balanceSheet,
          tga: liq.tga,
          rrp: liq.rrp,
          reserves: liq.reserves,
          netLiquidity: liq.netLiquidity,
          spx: mkt.close,
          sunspots: sol.sunspots || null
        };
      })
      .filter(d => d.spx !== undefined && d.netLiquidity !== undefined);

    if (unifiedData.length < 100) {
      return res.status(400).json({
        error: 'Insufficient data for analysis',
        message: `Need at least 100 data points, got ${unifiedData.length}`,
        suggestion: 'Check that FRED_API_KEY is configured correctly'
      });
    }

    // Extract price series for analysis
    const prices = unifiedData.map(d => d.spx);
    const dates = unifiedData.map(d => d.date);

    // Run CSD analysis
    const csdResult = analyzeCSD(prices, config);

    // Run LPPL analysis
    const lpplResult = optimizeLPPL(prices, dates);

    // Merge analysis results into time series
    const analyzedData = unifiedData.map((d, i) => ({
      ...d,
      trend: csdResult.trend[i] ? Math.round(csdResult.trend[i] * 100) / 100 : null,
      residual: csdResult.residuals[i] ? Math.round(csdResult.residuals[i] * 100) / 100 : null,
      ar1: csdResult.ar1Series[i] !== null ? Math.round(csdResult.ar1Series[i] * 1000) / 1000 : null,
      variance: csdResult.varianceSeries[i] !== null ? Math.round(csdResult.varianceSeries[i] * 100) / 100 : null
    }));

    // Build response with full provenance
    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      config,
      sources: {
        liquidity: liquidityData.sources,
        market: marketData.source,
        solar: solarData.source
      },
      csd: {
        currentAR1: Math.round(csdResult.currentAR1 * 1000) / 1000,
        kendallTau: Math.round(csdResult.kendallTau * 1000) / 1000,
        status: csdResult.status,
        currentVariance: Math.round(csdResult.currentVariance * 100) / 100,
        interpretation: {
          ar1: csdResult.currentAR1 > 0.7 
            ? 'System showing signs of critical slowing down' 
            : csdResult.currentAR1 > 0.5 
              ? 'Elevated autocorrelation, monitor closely'
              : 'Normal resilience',
          tau: csdResult.kendallTau > 0.3 
            ? 'AR(1) trending upward - warning signal'
            : csdResult.kendallTau < -0.3
              ? 'AR(1) trending downward - recovering'
              : 'No significant trend in AR(1)'
        }
      },
      lppl: {
        isBubble: lpplResult.isBubble,
        confidence: Math.round((lpplResult.confidence || 0) * 100),
        tcDays: lpplResult.tcDays,
        r2: lpplResult.r2 ? Math.round(lpplResult.r2 * 1000) / 1000 : null,
        omega: lpplResult.omega ? Math.round(lpplResult.omega * 100) / 100 : null,
        m: lpplResult.m ? Math.round(lpplResult.m * 100) / 100 : null,
        interpretation: lpplResult.isBubble
          ? `LPPL bubble signature detected. Estimated ${lpplResult.tcDays} days to critical time.`
          : 'No significant LPPL bubble signature detected.'
      },
      latest: analyzedData[analyzedData.length - 1],
      timeSeries: analyzedData,
      recordCount: analyzedData.length,
      dateRange: {
        start: analyzedData[0]?.date,
        end: analyzedData[analyzedData.length - 1]?.date
      }
    };

    // Update cache
    cache = {
      data: result,
      key: cacheKey,
      timestamp: Date.now()
    };

    return res.status(200).json(result);

  } catch (error) {
    console.error('Analysis API Error:', error);
    return res.status(500).json({
      error: 'Analysis failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
