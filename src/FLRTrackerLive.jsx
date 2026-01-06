import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, ComposedChart, ReferenceLine, ReferenceArea } from 'recharts';
import { Activity, Sun, DollarSign, Shield, Database, AlertCircle, Layers, X, HelpCircle, RefreshCw, Sliders, ExternalLink, CheckCircle2, AlertTriangle, TrendingUp } from 'lucide-react';

/**
 * FLR Tracker - Live Version with Real Data
 * 
 * All data sourced from:
 * - Federal Reserve Bank of St. Louis (FRED)
 * - U.S. Department of Treasury Fiscal Data
 * - NOAA Space Weather Prediction Center
 * 
 * Every data point is verifiable at the source URLs provided.
 */

const FLRTrackerLive = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [sources, setSources] = useState(null);
  const [config, setConfig] = useState({
    detrendBandwidth: 50,
    csdWindow: 250,
    tauLookback: 100
  });
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSources, setShowSources] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        detrendBandwidth: config.detrendBandwidth,
        csdWindow: config.csdWindow,
        tauLookback: config.tauLookback
      });
      
      const response = await fetch(`/api/analyze?${params}`);
      const result = await response.json();
      
      if (!response.ok || result.error) {
        throw new Error(result.message || result.error || 'Failed to fetch data');
      }
      
      setData(result);
      setSources(result.sources);
      setLastUpdated(new Date(result.timestamp));
    } catch (err) {
      console.error('Load error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Calculate regime score
  const regime = useMemo(() => {
    if (!data) return null;
    
    const { csd, lppl, latest } = data;
    
    // AR1 score (0-100): 0.3 baseline, 0.8 critical
    const ar1Score = Math.min(100, Math.max(0, (csd.currentAR1 - 0.3) / 0.5 * 100));
    
    // Tau score: positive trend = rising risk
    const tauScore = Math.min(100, Math.max(0, (csd.kendallTau + 0.5) / 1 * 100));
    
    // LPPL score
    const lpplScore = lppl.isBubble ? lppl.confidence : 0;
    
    // Liquidity score: low = high risk (scale: 4500-6500B)
    const liquidityScore = Math.min(100, Math.max(0, (6500 - latest.netLiquidity) / 20));
    
    // Weighted composite
    const composite = ar1Score * 0.35 + tauScore * 0.2 + lpplScore * 0.25 + liquidityScore * 0.2;
    
    let status, color, signal;
    if (composite > 70) {
      status = 'CRITICAL'; color = 'rose'; signal = 'STRONG SELL';
    } else if (composite > 55) {
      status = 'ELEVATED'; color = 'amber'; signal = 'REDUCE RISK';
    } else if (composite > 40) {
      status = 'CAUTION'; color = 'yellow'; signal = 'HOLD';
    } else if (composite > 25) {
      status = 'NORMAL'; color = 'emerald'; signal = 'ACCUMULATE';
    } else {
      status = 'FAVORABLE'; color = 'cyan'; signal = 'STRONG BUY';
    }
    
    return { composite, status, color, signal, ar1Score, tauScore, lpplScore, liquidityScore };
  }, [data]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    
    return (
      <div className="bg-slate-900/95 border border-slate-700 rounded-lg p-3 shadow-xl backdrop-blur">
        <p className="text-xs font-mono text-slate-400 mb-2">{label}</p>
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center gap-2 text-xs font-mono">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-slate-400">{entry.name}:</span>
            <span className="text-white font-medium">
              {typeof entry.value === 'number' ? entry.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const getRegimeColors = (color) => ({
    rose: { bg: 'from-rose-950/50 to-rose-900/30', border: 'border-rose-800', text: 'text-rose-400', textLight: 'text-rose-300' },
    amber: { bg: 'from-amber-950/50 to-amber-900/30', border: 'border-amber-800', text: 'text-amber-400', textLight: 'text-amber-300' },
    yellow: { bg: 'from-yellow-950/50 to-yellow-900/30', border: 'border-yellow-800', text: 'text-yellow-400', textLight: 'text-yellow-300' },
    emerald: { bg: 'from-emerald-950/50 to-emerald-900/30', border: 'border-emerald-800', text: 'text-emerald-400', textLight: 'text-emerald-300' },
    cyan: { bg: 'from-cyan-950/50 to-cyan-900/30', border: 'border-cyan-800', text: 'text-cyan-400', textLight: 'text-cyan-300' }
  }[color]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-24 h-24 mx-auto mb-6">
            <div className="absolute inset-0 border-2 border-cyan-500/30 rounded-full animate-ping" />
            <div className="absolute inset-2 border-2 border-cyan-400/50 rounded-full animate-pulse" />
            <div className="absolute inset-4 border-2 border-cyan-300/70 rounded-full animate-spin" style={{ animationDuration: '3s' }} />
            <Activity className="absolute inset-0 m-auto w-8 h-8 text-cyan-400" />
          </div>
          <p className="text-cyan-400 font-mono text-sm tracking-wider">FETCHING LIVE DATA</p>
          <p className="text-slate-600 font-mono text-xs mt-2">Connecting to FRED, Treasury, NOAA...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-rose-950/30 border border-rose-800 rounded-xl p-6 max-w-lg">
          <AlertCircle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
          <h2 className="text-rose-400 font-mono text-center text-lg mb-2">Data Fetch Error</h2>
          <p className="text-slate-400 text-sm text-center mb-4">{error}</p>
          
          <div className="bg-slate-900/50 rounded-lg p-4 mb-4 text-xs text-slate-500">
            <p className="font-semibold text-slate-400 mb-2">Troubleshooting:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Ensure <code className="text-cyan-400">FRED_API_KEY</code> is set in environment</li>
              <li>Get a free key at <a href="https://fred.stlouisfed.org/docs/api/api_key.html" className="text-cyan-400 hover:underline" target="_blank" rel="noopener noreferrer">fred.stlouisfed.org</a></li>
              <li>Check network connectivity to api.stlouisfed.org</li>
            </ul>
          </div>
          
          <button 
            onClick={loadData}
            className="w-full py-2 bg-rose-900/50 hover:bg-rose-800/50 border border-rose-700 rounded-lg text-rose-300 font-mono text-sm transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { latest, timeSeries, csd, lppl, dateRange } = data;
  const regimeColors = regime ? getRegimeColors(regime.color) : null;

  const metricCards = [
    { label: 'Fed Balance Sheet', value: `$${(latest.balanceSheet / 1000).toFixed(2)}T`, icon: Database, colorClass: 'text-blue-400' },
    { label: 'TGA', value: `$${latest.tga.toFixed(0)}B`, icon: DollarSign, colorClass: 'text-emerald-400' },
    { label: 'Reverse Repo', value: `$${latest.rrp.toFixed(0)}B`, icon: Layers, colorClass: 'text-purple-400' },
    { label: 'Bank Reserves', value: latest.reserves ? `$${(latest.reserves / 1000).toFixed(2)}T` : 'N/A', icon: Shield, colorClass: 'text-cyan-400' },
    { label: 'S&P 500', value: latest.spx?.toLocaleString() || 'N/A', icon: TrendingUp, colorClass: 'text-amber-400' },
    { label: 'Sunspots', value: latest.sunspots?.toString() || 'N/A', icon: Sun, colorClass: 'text-orange-400' },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 1px)',
          backgroundSize: '48px 48px'
        }} />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {/* Header */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 sm:mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold tracking-tight">Fractal Liquidity Regime Tracker</h1>
              <p className="text-xs text-slate-500 font-mono">Live Data • {dateRange?.start} to {dateRange?.end}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-end flex-wrap">
            {lastUpdated && (
              <span className="text-xs text-slate-600 font-mono hidden sm:block">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => setShowSources(true)}
              className="p-2 rounded-lg bg-emerald-900/30 hover:bg-emerald-800/30 border border-emerald-700 transition-colors"
              title="Data Sources"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700 transition-colors"
              title="Settings"
            >
              <Sliders className="w-4 h-4 text-slate-400" />
            </button>
            <button
              onClick={() => setShowHelp(true)}
              className="p-2 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700 transition-colors"
              title="Help"
            >
              <HelpCircle className="w-4 h-4 text-slate-400" />
            </button>
            <button
              onClick={loadData}
              className="p-2 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4 text-slate-400" />
            </button>
            <div className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-full bg-emerald-950/50 border border-emerald-800">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-mono text-emerald-400">LIVE</span>
            </div>
          </div>
        </header>

        {/* Regime Banner */}
        {regime && regimeColors && (
          <div className={`mb-4 sm:mb-6 p-3 sm:p-4 rounded-xl sm:rounded-2xl border bg-gradient-to-r ${regimeColors.bg} ${regimeColors.border}`}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={`text-3xl sm:text-4xl font-bold font-mono ${regimeColors.text}`}>
                  {regime.composite.toFixed(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-base sm:text-lg font-semibold ${regimeColors.textLight}`}>{regime.status}</span>
                    <span className="text-slate-500 hidden sm:inline">•</span>
                    <span className={`font-mono text-sm ${regimeColors.text}`}>{regime.signal}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">Composite regime score (0-100)</p>
                </div>
              </div>
              
              <div className="grid grid-cols-4 gap-3 sm:gap-6 w-full sm:w-auto">
                <div className="text-center">
                  <p className="text-xs text-slate-500 mb-1">AR(1)</p>
                  <p className={`font-mono text-sm ${csd.currentAR1 > 0.7 ? 'text-rose-400' : csd.currentAR1 > 0.5 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {csd.currentAR1.toFixed(3)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-500 mb-1">τ Trend</p>
                  <p className={`font-mono text-sm ${csd.kendallTau > 0.3 ? 'text-rose-400' : csd.kendallTau > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {csd.kendallTau.toFixed(3)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-500 mb-1">LPPL</p>
                  <p className={`font-mono text-sm ${lppl.isBubble ? 'text-rose-400' : 'text-slate-400'}`}>
                    {lppl.isBubble ? `${lppl.confidence}%` : 'N/A'}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-500 mb-1">Net Liq</p>
                  <p className="font-mono text-sm text-slate-300">${(latest.netLiquidity / 1000).toFixed(2)}T</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Metric Cards */}
        <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 mb-4 sm:mb-6">
          {metricCards.map((metric, i) => (
            <div key={i} className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-colors">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-2">
                <metric.icon className={`w-3 h-3 sm:w-4 sm:h-4 ${metric.colorClass}`} />
                <span className="text-[10px] sm:text-xs text-slate-500 truncate">{metric.label}</span>
              </div>
              <p className="text-sm sm:text-lg font-mono font-medium">{metric.value}</p>
            </div>
          ))}
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
          {/* Price & Trend */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 sm:p-4">
            <h3 className="text-xs sm:text-sm font-mono text-cyan-400 mb-3 sm:mb-4">S&P 500 • Price & Gaussian Trend</h3>
            <div className="h-48 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={timeSeries.slice(-252)} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 9 }} tickFormatter={(val) => val?.slice(5, 7)} interval={40} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 9 }} domain={['auto', 'auto']} tickFormatter={(val) => (val/1000).toFixed(1) + 'k'} width={35} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="spx" fill="url(#priceGradient)" stroke="#06b6d4" strokeWidth={1.5} name="S&P 500" />
                  <Line type="monotone" dataKey="trend" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Trend" />
                  <defs>
                    <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* AR(1) */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 sm:p-4">
            <h3 className="text-xs sm:text-sm font-mono text-cyan-400 mb-3 sm:mb-4">Critical Slowing Down • AR(1)</h3>
            <div className="h-48 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={timeSeries.slice(-252)} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 9 }} tickFormatter={(val) => val?.slice(5, 7)} interval={40} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 9 }} domain={[0, 1]} ticks={[0, 0.3, 0.5, 0.7, 1]} width={25} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceArea y1={0.7} y2={1} fill="#f43f5e" fillOpacity={0.1} />
                  <ReferenceLine y={0.7} stroke="#f43f5e" strokeDasharray="3 3" />
                  <Area type="monotone" dataKey="ar1" fill="url(#ar1Gradient)" stroke="#10b981" strokeWidth={1.5} name="AR(1)" connectNulls />
                  <defs>
                    <linearGradient id="ar1Gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Net Liquidity */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 sm:p-4">
            <h3 className="text-xs sm:text-sm font-mono text-cyan-400 mb-3 sm:mb-4">Net Liquidity • (BS - TGA - RRP)</h3>
            <div className="h-48 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeSeries.slice(-252)} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 9 }} tickFormatter={(val) => val?.slice(5, 7)} interval={40} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 9 }} domain={['auto', 'auto']} tickFormatter={(val) => `${(val/1000).toFixed(1)}T`} width={35} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="netLiquidity" fill="url(#liquidityGradient)" stroke="#8b5cf6" strokeWidth={1.5} name="Net Liquidity ($B)" />
                  <defs>
                    <linearGradient id="liquidityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Variance */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 sm:p-4">
            <h3 className="text-xs sm:text-sm font-mono text-cyan-400 mb-3 sm:mb-4">Rolling Variance • Residual Vol</h3>
            <div className="h-48 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeSeries.slice(-252)} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 9 }} tickFormatter={(val) => val?.slice(5, 7)} interval={40} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 9 }} domain={['auto', 'auto']} width={35} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="variance" fill="url(#varianceGradient)" stroke="#f59e0b" strokeWidth={1.5} name="Variance" connectNulls />
                  <defs>
                    <linearGradient id="varianceGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* LPPL Panel */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6">
          <h3 className="text-xs sm:text-sm font-mono text-cyan-400 mb-3 sm:mb-4">LPPL Bubble Detection</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Bubble Detected</p>
              <p className={`font-mono font-semibold ${lppl.isBubble ? 'text-rose-400' : 'text-emerald-400'}`}>
                {lppl.isBubble ? 'YES' : 'NO'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Confidence</p>
              <p className="font-mono text-white">{lppl.confidence}%</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Days to tc</p>
              <p className="font-mono text-white">{lppl.tcDays ?? 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">R² Fit</p>
              <p className="font-mono text-white">{lppl.r2 ?? 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">ω (frequency)</p>
              <p className="font-mono text-white">{lppl.omega ?? 'N/A'}</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-3">{lppl.interpretation}</p>
        </div>

        {/* Footer */}
        <footer className="text-center text-xs text-slate-600 font-mono space-y-1">
          <p>FLR Tracker v2.2 • Live Data from FRED, Treasury, NOAA • Not Financial Advice</p>
          <p>{data.recordCount} data points • Click <CheckCircle2 className="inline w-3 h-3 text-emerald-400" /> to verify sources</p>
        </footer>
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setShowHelp(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 sm:p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">How to Read This Dashboard</h2>
              <button onClick={() => setShowHelp(false)} className="p-1 hover:bg-slate-800 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4 text-sm text-slate-300">
              <div>
                <h3 className="font-semibold text-cyan-400 mb-1">AR(1) Coefficient</h3>
                <p>Autocorrelation of price residuals. Values →1.0 indicate "critical slowing down".</p>
                <p className="text-xs text-slate-500 mt-1">• &lt;0.5 Normal • 0.5-0.7 Caution • &gt;0.7 Critical</p>
              </div>
              <div>
                <h3 className="font-semibold text-cyan-400 mb-1">Kendall's Tau (τ)</h3>
                <p>Trend in AR(1). Positive = rising (warning). Negative = recovering.</p>
              </div>
              <div>
                <h3 className="font-semibold text-cyan-400 mb-1">LPPL Bubble Detection</h3>
                <p>Fits Log-Periodic Power Law to detect super-exponential growth. High confidence + near tc = danger.</p>
              </div>
              <div>
                <h3 className="font-semibold text-cyan-400 mb-1">Net Liquidity</h3>
                <p>Fed Balance Sheet − TGA − RRP. Rising = supportive. Declining = headwinds.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setShowSettings(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 sm:p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Analysis Parameters</h2>
              <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-slate-800 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-slate-400 mb-2 block">Detrend Bandwidth: {config.detrendBandwidth}</label>
                <input type="range" min="20" max="100" value={config.detrendBandwidth} onChange={(e) => setConfig(prev => ({ ...prev, detrendBandwidth: parseInt(e.target.value) }))} className="w-full accent-cyan-500" />
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-2 block">CSD Window: {config.csdWindow}</label>
                <input type="range" min="100" max="500" step="50" value={config.csdWindow} onChange={(e) => setConfig(prev => ({ ...prev, csdWindow: parseInt(e.target.value) }))} className="w-full accent-cyan-500" />
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-2 block">Tau Lookback: {config.tauLookback}</label>
                <input type="range" min="30" max="200" step="10" value={config.tauLookback} onChange={(e) => setConfig(prev => ({ ...prev, tauLookback: parseInt(e.target.value) }))} className="w-full accent-cyan-500" />
              </div>
            </div>
            <button onClick={() => { setShowSettings(false); loadData(); }} className="mt-6 w-full py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-medium transition-colors">
              Apply & Recalculate
            </button>
          </div>
        </div>
      )}

      {/* Data Sources Modal */}
      {showSources && sources && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setShowSources(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 sm:p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <h2 className="text-lg font-semibold">Data Provenance</h2>
              </div>
              <button onClick={() => setShowSources(false)} className="p-1 hover:bg-slate-800 rounded"><X className="w-5 h-5" /></button>
            </div>
            
            <p className="text-sm text-slate-400 mb-4">All data comes from official U.S. government sources. Click any link to verify.</p>
            
            <div className="space-y-4">
              {sources.liquidity && Object.entries(sources.liquidity).map(([key, source]) => (
                <div key={key} className="p-3 bg-slate-800/50 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-white text-sm">{source.name}</p>
                      <p className="text-xs text-slate-500 mt-1">Frequency: {source.frequency} • Last: {source.lastUpdate}</p>
                    </div>
                    <a href={source.url} target="_blank" rel="noopener noreferrer" className="p-1.5 bg-cyan-900/30 hover:bg-cyan-800/30 rounded text-cyan-400">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                  <code className="text-xs text-slate-600 mt-2 block break-all">{source.url}</code>
                </div>
              ))}
              
              {sources.market && (
                <div className="p-3 bg-slate-800/50 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-white text-sm">{sources.market.name}</p>
                      <p className="text-xs text-slate-500 mt-1">Provider: {sources.market.provider}</p>
                      <p className="text-xs text-slate-500">Frequency: {sources.market.frequency} • Last: {sources.market.lastUpdate}</p>
                    </div>
                    <a href={sources.market.url} target="_blank" rel="noopener noreferrer" className="p-1.5 bg-cyan-900/30 hover:bg-cyan-800/30 rounded text-cyan-400">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                  <code className="text-xs text-slate-600 mt-2 block break-all">{sources.market.url}</code>
                </div>
              )}
              
              {sources.solar && (
                <div className="p-3 bg-slate-800/50 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-white text-sm">{sources.solar.name}</p>
                      <p className="text-xs text-slate-500 mt-1">Frequency: {sources.solar.frequency} • Last: {sources.solar.lastUpdate}</p>
                    </div>
                    <a href={sources.solar.url} target="_blank" rel="noopener noreferrer" className="p-1.5 bg-cyan-900/30 hover:bg-cyan-800/30 rounded text-cyan-400">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                  <code className="text-xs text-slate-600 mt-2 block break-all">{sources.solar.dataUrl}</code>
                </div>
              )}
            </div>
            
            <div className="mt-6 p-3 bg-emerald-950/30 border border-emerald-800 rounded-lg">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5" />
                <div className="text-xs text-emerald-300">
                  <p className="font-medium">Audit Trail</p>
                  <p className="text-emerald-400/70 mt-1">Every data point can be independently verified by querying the source APIs directly. No data is simulated or estimated.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FLRTrackerLive;
