/**
 * API Route: /api/market
 * 
 * Fetches REAL S&P 500 market data from official sources.
 * 
 * DATA SOURCE:
 * ─────────────────────────────────────────────────────────────────
 * S&P 500 Index
 *    Source: Federal Reserve Bank of St. Louis (FRED)
 *    Series: SP500
 *    URL: https://fred.stlouisfed.org/series/SP500
 *    Frequency: Daily (business days)
 *    Units: Index
 *    Note: Data provided by S&P Dow Jones Indices LLC
 * ─────────────────────────────────────────────────────────────────
 */

let cache = {
  data: null,
  timestamp: 0
};
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes (market data updates during trading hours)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  // Check cache
  if (cache.data && Date.now() - cache.timestamp < CACHE_TTL) {
    return res.status(200).json({
      ...cache.data,
      cached: true,
      cacheAge: Math.round((Date.now() - cache.timestamp) / 1000)
    });
  }

  const FRED_API_KEY = process.env.FRED_API_KEY;

  if (!FRED_API_KEY) {
    return res.status(500).json({
      error: 'FRED_API_KEY not configured',
      message: 'Please set FRED_API_KEY environment variable'
    });
  }

  try {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const response = await fetch(
      `https://api.stlouisfed.org/fred/series/observations?series_id=SP500&api_key=${FRED_API_KEY}&file_type=json&observation_start=${startDate}&observation_end=${endDate}`
    );

    const data = await response.json();

    if (data.error_message) {
      throw new Error(`FRED API Error: ${data.error_message}`);
    }

    const timeSeries = (data.observations || [])
      .filter(obs => obs.value !== '.')
      .map(obs => ({
        date: obs.date,
        close: parseFloat(obs.value)
      }));

    // Calculate basic statistics
    const prices = timeSeries.map(d => d.close);
    const latest = prices[prices.length - 1];
    const prev = prices[prices.length - 2];
    const change1d = prev ? ((latest - prev) / prev * 100) : 0;
    
    const price30dAgo = prices[Math.max(0, prices.length - 22)]; // ~22 trading days
    const change30d = price30dAgo ? ((latest - price30dAgo) / price30dAgo * 100) : 0;

    const price252dAgo = prices[Math.max(0, prices.length - 252)];
    const change1y = price252dAgo ? ((latest - price252dAgo) / price252dAgo * 100) : 0;

    // Calculate realized volatility (20-day)
    const returns = [];
    for (let i = 1; i < Math.min(21, prices.length); i++) {
      returns.push(Math.log(prices[prices.length - i] / prices[prices.length - i - 1]));
    }
    const volatility = returns.length > 0 
      ? Math.sqrt(returns.reduce((sum, r) => sum + r * r, 0) / returns.length) * Math.sqrt(252) * 100
      : 0;

    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      source: {
        name: 'S&P 500 (SP500)',
        url: 'https://fred.stlouisfed.org/series/SP500',
        provider: 'S&P Dow Jones Indices LLC via FRED',
        frequency: 'Daily',
        lastUpdate: timeSeries[timeSeries.length - 1]?.date
      },
      latest: {
        date: timeSeries[timeSeries.length - 1]?.date,
        close: latest,
        change1d: Math.round(change1d * 100) / 100,
        change30d: Math.round(change30d * 100) / 100,
        change1y: Math.round(change1y * 100) / 100,
        volatility20d: Math.round(volatility * 10) / 10
      },
      timeSeries,
      recordCount: timeSeries.length
    };

    cache = { data: result, timestamp: Date.now() };

    return res.status(200).json(result);

  } catch (error) {
    console.error('Market API Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch market data',
      message: error.message
    });
  }
}
