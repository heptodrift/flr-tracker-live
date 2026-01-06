/**
 * API Route: /api/solar
 * 
 * Fetches REAL solar activity data from NOAA Space Weather Prediction Center.
 * 
 * DATA SOURCE:
 * ─────────────────────────────────────────────────────────────────
 * Daily Sunspot Number
 *    Source: NOAA Space Weather Prediction Center (SWPC)
 *    URL: https://services.swpc.noaa.gov/json/solar-cycle/observed-solar-cycle-indices.json
 *    Frequency: Daily
 *    
 * Alternative Source (for verification):
 *    SILSO World Data Center
 *    URL: https://www.sidc.be/silso/datafiles
 * ─────────────────────────────────────────────────────────────────
 */

let cache = {
  data: null,
  timestamp: 0
};
const CACHE_TTL = 60 * 60 * 1000; // 1 hour (solar data updates daily)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (cache.data && Date.now() - cache.timestamp < CACHE_TTL) {
    return res.status(200).json({
      ...cache.data,
      cached: true,
      cacheAge: Math.round((Date.now() - cache.timestamp) / 1000)
    });
  }

  try {
    // NOAA SWPC provides comprehensive solar cycle data
    const response = await fetch(
      'https://services.swpc.noaa.gov/json/solar-cycle/observed-solar-cycle-indices.json'
    );

    if (!response.ok) {
      throw new Error(`NOAA API returned ${response.status}`);
    }

    const rawData = await response.json();

    // Process the data - NOAA format has time-series array
    // Each entry has: time-tag, ssn (sunspot number), f10.7 (solar flux), etc.
    const cutoffDate = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000);
    
    const timeSeries = rawData
      .filter(entry => {
        const entryDate = new Date(entry['time-tag']);
        return entryDate >= cutoffDate && entry.ssn !== null;
      })
      .map(entry => ({
        date: entry['time-tag'].split('T')[0],
        sunspots: Math.round(entry.ssn),
        solarFlux: entry['f10.7'] ? Math.round(entry['f10.7'] * 10) / 10 : null
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Get latest values and calculate cycle position
    const latest = timeSeries[timeSeries.length - 1];
    
    // Solar cycle 25 started December 2019
    const cycleStart = new Date('2019-12-01');
    const now = new Date();
    const cycleYears = (now - cycleStart) / (365.25 * 24 * 60 * 60 * 1000);
    const cyclePhase = (cycleYears / 11) * 100; // % through ~11 year cycle

    // Determine activity level
    let activityLevel = 'Low';
    if (latest?.sunspots > 150) activityLevel = 'Very High';
    else if (latest?.sunspots > 100) activityLevel = 'High';
    else if (latest?.sunspots > 50) activityLevel = 'Moderate';

    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      source: {
        name: 'NOAA Space Weather Prediction Center',
        url: 'https://www.swpc.noaa.gov/products/solar-cycle-progression',
        dataUrl: 'https://services.swpc.noaa.gov/json/solar-cycle/observed-solar-cycle-indices.json',
        frequency: 'Daily',
        lastUpdate: latest?.date
      },
      latest: {
        date: latest?.date,
        sunspots: latest?.sunspots,
        solarFlux: latest?.solarFlux,
        activityLevel,
        cycleNumber: 25,
        cyclePhase: Math.round(cyclePhase * 10) / 10
      },
      timeSeries,
      recordCount: timeSeries.length
    };

    cache = { data: result, timestamp: Date.now() };

    return res.status(200).json(result);

  } catch (error) {
    console.error('Solar API Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch solar data',
      message: error.message
    });
  }
}
