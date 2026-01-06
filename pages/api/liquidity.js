/**
 * API Route: /api/liquidity
 * Fetches Fed liquidity data from FRED and Treasury
 */

let cache = { data: null, timestamp: 0 };
const CACHE_TTL = 5 * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (cache.data && Date.now() - cache.timestamp < CACHE_TTL) {
    return res.status(200).json({ ...cache.data, cached: true });
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

    // Fetch from FRED (these work)
    const [balanceSheetRes, rrpRes, reservesRes] = await Promise.all([
      fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=WALCL&api_key=${FRED_API_KEY}&file_type=json&observation_start=${startDate}&observation_end=${endDate}`),
      fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=RRPONTSYD&api_key=${FRED_API_KEY}&file_type=json&observation_start=${startDate}&observation_end=${endDate}`),
      fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=WRESBAL&api_key=${FRED_API_KEY}&file_type=json&observation_start=${startDate}&observation_end=${endDate}`)
    ]);

    // Also try to get TGA from FRED (series WTREGEN)
    const tgaRes = await fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=WTREGEN&api_key=${FRED_API_KEY}&file_type=json&observation_start=${startDate}&observation_end=${endDate}`);

    const [balanceSheetData, rrpData, reservesData, tgaData] = await Promise.all([
      balanceSheetRes.json(),
      rrpRes.json(),
      reservesRes.json(),
      tgaRes.json()
    ]);

    if (balanceSheetData.error_message) {
      throw new Error(`FRED API Error: ${balanceSheetData.error_message}`);
    }

    // Process into lookup maps
    const balanceSheetMap = {};
    (balanceSheetData.observations || []).forEach(obs => {
      if (obs.value !== '.') {
        balanceSheetMap[obs.date] = parseFloat(obs.value) / 1000; // to Billions
      }
    });

    const rrpMap = {};
    (rrpData.observations || []).forEach(obs => {
      if (obs.value !== '.') {
        rrpMap[obs.date] = parseFloat(obs.value); // Already Billions
      }
    });

    const reservesMap = {};
    (reservesData.observations || []).forEach(obs => {
      if (obs.value !== '.') {
        reservesMap[obs.date] = parseFloat(obs.value) / 1000; // to Billions
      }
    });

    const tgaMap = {};
    (tgaData.observations || []).forEach(obs => {
      if (obs.value !== '.') {
        tgaMap[obs.date] = parseFloat(obs.value) / 1000; // to Billions
      }
    });

    // Get all dates from RRP (daily)
    const allDates = Object.keys(rrpMap).sort();

    // Forward-fill weekly data
    const forwardFill = (map, dates) => {
      const filled = {};
      let lastValue = null;
      dates.forEach(date => {
        if (map[date] !== undefined) lastValue = map[date];
        if (lastValue !== null) filled[date] = lastValue;
      });
      return filled;
    };

    const filledBS = forwardFill(balanceSheetMap, allDates);
    const filledTGA = forwardFill(tgaMap, allDates);
    const filledReserves = forwardFill(reservesMap, allDates);

    // Build time series
    const timeSeries = allDates
      .filter(date => filledBS[date] && filledTGA[date] && rrpMap[date] !== undefined)
      .map(date => {
        const bs = filledBS[date];
        const tga = filledTGA[date];
        const rrp = rrpMap[date];
        const reserves = filledReserves[date];
        const netLiquidity = bs - tga - rrp;

        return {
          date,
          balanceSheet: Math.round(bs * 10) / 10,
          tga: Math.round(tga * 10) / 10,
          rrp: Math.round(rrp * 10) / 10,
          reserves: reserves ? Math.round(reserves * 10) / 10 : null,
          netLiquidity: Math.round(netLiquidity * 10) / 10
        };
      });

    const latest = timeSeries[timeSeries.length - 1];

    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      sources: {
        balanceSheet: {
          name: 'Fed Total Assets (WALCL)',
          url: 'https://fred.stlouisfed.org/series/WALCL',
          frequency: 'Weekly'
        },
        tga: {
          name: 'Treasury General Account (WTREGEN)',
          url: 'https://fred.stlouisfed.org/series/WTREGEN',
          frequency: 'Weekly'
        },
        rrp: {
          name: 'Overnight Reverse Repo (RRPONTSYD)',
          url: 'https://fred.stlouisfed.org/series/RRPONTSYD',
          frequency: 'Daily'
        },
        reserves: {
          name: 'Reserve Balances (WRESBAL)',
          url: 'https://fred.stlouisfed.org/series/WRESBAL',
          frequency: 'Weekly'
        }
      },
      latest,
      timeSeries,
      recordCount: timeSeries.length
    };

    cache = { data: result, timestamp: Date.now() };
    return res.status(200).json(result);

  } catch (error) {
    console.error('Liquidity API Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch liquidity data',
      message: error.message
    });
  }
} */

// In-memory cache to respect API rate limits
let cache = {
  data: null,
  timestamp: 0
};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export default async function handler(req, res) {
  // CORS headers
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
      message: 'Please set FRED_API_KEY environment variable. Get a free key at https://fred.stlouisfed.org/docs/api/api_key.html'
    });
  }

  try {
    // Calculate date range (2 years of data)
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Fetch all data in parallel
    const [balanceSheetRes, rrpRes, reservesRes, tgaRes] = await Promise.all([
      // 1. Fed Balance Sheet (WALCL) - Weekly
      fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=WALCL&api_key=${FRED_API_KEY}&file_type=json&observation_start=${startDate}&observation_end=${endDate}`),
      
      // 2. Reverse Repo (RRPONTSYD) - Daily
      fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=RRPONTSYD&api_key=${FRED_API_KEY}&file_type=json&observation_start=${startDate}&observation_end=${endDate}`),
      
      // 3. Bank Reserves (WRESBAL) - Weekly
      fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=WRESBAL&api_key=${FRED_API_KEY}&file_type=json&observation_start=${startDate}&observation_end=${endDate}`),
      
      // 4. TGA from Treasury Fiscal Data - Daily
      fetch(`https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/dts/dts_table_1?filter=record_date:gte:${startDate}&sort=-record_date&page[size]=750`)
    ]);

    // Parse responses
    const [balanceSheetData, rrpData, reservesData, tgaData] = await Promise.all([
      balanceSheetRes.json(),
      rrpRes.json(),
      reservesRes.json(),
      tgaRes.json()
    ]);

    // Validate FRED responses
    if (balanceSheetData.error_message) {
      throw new Error(`FRED API Error: ${balanceSheetData.error_message}`);
    }

    // Process FRED data into lookup maps
    const balanceSheetMap = {};
    (balanceSheetData.observations || []).forEach(obs => {
      if (obs.value !== '.') {
        balanceSheetMap[obs.date] = parseFloat(obs.value) / 1000; // Convert to Billions
      }
    });

    const rrpMap = {};
    (rrpData.observations || []).forEach(obs => {
      if (obs.value !== '.') {
        rrpMap[obs.date] = parseFloat(obs.value); // Already in Billions
      }
    });

    const reservesMap = {};
    (reservesData.observations || []).forEach(obs => {
      if (obs.value !== '.') {
        reservesMap[obs.date] = parseFloat(obs.value) / 1000; // Convert to Billions
      }
    });

    // Process Treasury TGA data
    const tgaMap = {};
    (tgaData.data || []).forEach(row => {
      // Find "Federal Reserve Account" closing balance
      if (row.account_type === 'Federal Reserve Account' && row.close_today_bal) {
        const date = row.record_date;
        tgaMap[date] = parseFloat(row.close_today_bal) / 1000; // Convert to Billions
      }
    });

    // Build unified daily time series
    // Use RRP dates as base since it's daily
    const allDates = [...new Set([
      ...Object.keys(rrpMap),
      ...Object.keys(tgaMap)
    ])].sort();

    // Forward-fill weekly data to daily
    const forwardFill = (map, dates) => {
      const filled = {};
      let lastValue = null;
      
      dates.forEach(date => {
        if (map[date] !== undefined) {
          lastValue = map[date];
        }
        if (lastValue !== null) {
          filled[date] = lastValue;
        }
      });
      
      return filled;
    };

    const filledBalanceSheet = forwardFill(balanceSheetMap, allDates);
    const filledReserves = forwardFill(reservesMap, allDates);

    // Combine into time series
    const timeSeries = allDates
      .filter(date => {
        // Only include dates where we have both RRP and TGA
        return rrpMap[date] !== undefined || tgaMap[date] !== undefined;
      })
      .map(date => {
        const balanceSheet = filledBalanceSheet[date];
        const tga = tgaMap[date];
        const rrp = rrpMap[date];
        const reserves = filledReserves[date];
        
        // Calculate Net Liquidity = Balance Sheet - TGA - RRP
        let netLiquidity = null;
        if (balanceSheet !== undefined && tga !== undefined && rrp !== undefined) {
          netLiquidity = balanceSheet - tga - rrp;
        }

        return {
          date,
          balanceSheet: balanceSheet !== undefined ? Math.round(balanceSheet * 10) / 10 : null,
          tga: tga !== undefined ? Math.round(tga * 10) / 10 : null,
          rrp: rrp !== undefined ? Math.round(rrp * 10) / 10 : null,
          reserves: reserves !== undefined ? Math.round(reserves * 10) / 10 : null,
          netLiquidity: netLiquidity !== null ? Math.round(netLiquidity * 10) / 10 : null
        };
      })
      .filter(d => d.netLiquidity !== null); // Only keep complete records

    // Get latest values
    const latest = timeSeries[timeSeries.length - 1];

    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      sources: {
        balanceSheet: {
          name: 'Fed Total Assets (WALCL)',
          url: 'https://fred.stlouisfed.org/series/WALCL',
          frequency: 'Weekly',
          lastUpdate: Object.keys(balanceSheetMap).sort().pop()
        },
        tga: {
          name: 'Treasury General Account',
          url: 'https://fiscaldata.treasury.gov/datasets/daily-treasury-statement/',
          frequency: 'Daily',
          lastUpdate: Object.keys(tgaMap).sort().pop()
        },
        rrp: {
          name: 'Overnight Reverse Repo (RRPONTSYD)',
          url: 'https://fred.stlouisfed.org/series/RRPONTSYD',
          frequency: 'Daily',
          lastUpdate: Object.keys(rrpMap).sort().pop()
        },
        reserves: {
          name: 'Reserve Balances (WRESBAL)',
          url: 'https://fred.stlouisfed.org/series/WRESBAL',
          frequency: 'Weekly',
          lastUpdate: Object.keys(reservesMap).sort().pop()
        }
      },
      latest,
      timeSeries,
      recordCount: timeSeries.length
    };

    // Update cache
    cache = {
      data: result,
      timestamp: Date.now()
    };

    return res.status(200).json(result);

  } catch (error) {
    console.error('Liquidity API Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch liquidity data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
