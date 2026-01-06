/**
 * Statistical Engine for Critical Slowing Down (CSD) Analysis
 * 
 * Implements methods from:
 * - Scheffer et al. (2009) "Early-warning signals for critical transitions"
 * - Dakos et al. (2012) "Methods for Detecting Early Warnings of Critical Transitions"
 * 
 * Key Indicators:
 * - AR(1) coefficient: Lag-1 autocorrelation of residuals (rises toward 1 near transition)
 * - Variance: Increases as system approaches critical point
 * - Kendall's Tau: Detects monotonic trend in AR(1)
 */

export class StatisticalEngine {
  /**
   * Gaussian kernel for Nadaraya-Watson smoother
   */
  static gaussianKernel(x, bandwidth) {
    return Math.exp(-0.5 * Math.pow(x / bandwidth, 2)) / (bandwidth * Math.sqrt(2 * Math.PI));
  }

  /**
   * Detrend time series using Gaussian kernel smoother
   * This extracts the trend and returns residuals for CSD analysis
   * 
   * @param {number[]} data - Raw price series
   * @param {number} bandwidth - Kernel bandwidth (larger = smoother trend)
   * @returns {{ trend: number[], residuals: number[] }}
   */
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

  /**
   * Calculate rolling AR(1) coefficient
   * This is the primary CSD indicator - approaches 1 as system loses resilience
   * 
   * @param {number[]} residuals - Detrended residuals
   * @param {number} windowSize - Rolling window size
   * @returns {(number|null)[]} AR(1) series (null for insufficient data)
   */
  static rollingAR1(residuals, windowSize = 250) {
    const n = residuals.length;
    const ar1 = [];
    
    for (let i = 0; i < n; i++) {
      if (i < windowSize + 1) {
        ar1[i] = null;
        continue;
      }
      
      // Build aligned windows for correlation
      const currentWindow = [];
      const lagWindow = [];
      
      for (let j = 0; j < windowSize; j++) {
        currentWindow.push(residuals[i - windowSize + j]);
        lagWindow.push(residuals[i - windowSize + j - 1]);
      }
      
      // Calculate Pearson correlation between window and lagged window
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
      
      const correlation = (varCurrent > 0 && varLag > 0) 
        ? cov / Math.sqrt(varCurrent * varLag)
        : 0;
      
      ar1[i] = Math.max(-1, Math.min(1, correlation));
    }
    
    return ar1;
  }

  /**
   * Calculate rolling variance of residuals
   * Variance increases near critical transitions
   */
  static rollingVariance(residuals, windowSize = 250) {
    const n = residuals.length;
    const variance = [];
    
    for (let i = 0; i < n; i++) {
      if (i < windowSize) {
        variance[i] = null;
        continue;
      }
      
      const window = residuals.slice(i - windowSize, i);
      const mean = window.reduce((a, b) => a + b, 0) / windowSize;
      const sumSq = window.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0);
      variance[i] = sumSq / (windowSize - 1);
    }
    
    return variance;
  }

  /**
   * Kendall's Tau rank correlation
   * Used to detect monotonic trend in AR(1) series
   * Positive tau = AR(1) rising = increasing risk
   */
  static kendallTau(ar1Series, lookback = 100) {
    const validAr1 = ar1Series.filter(v => v !== null);
    const recent = validAr1.slice(-lookback);
    
    if (recent.length < 10) return 0;
    
    let concordant = 0;
    let discordant = 0;
    
    for (let i = 0; i < recent.length - 1; i++) {
      for (let j = i + 1; j < recent.length; j++) {
        const xDiff = j - i; // Always positive (time increases)
        const yDiff = recent[j] - recent[i];
        
        if (xDiff * yDiff > 0) concordant++;
        else if (xDiff * yDiff < 0) discordant++;
      }
    }
    
    const n = recent.length;
    const pairs = (n * (n - 1)) / 2;
    
    return pairs > 0 ? (concordant - discordant) / pairs : 0;
  }
}

/**
 * Analyze full CSD indicators from raw data
 */
export function analyzeCSD(prices, config = {}) {
  const { 
    detrendBandwidth = 50, 
    csdWindow = 250, 
    tauLookback = 100 
  } = config;
  
  const { trend, residuals } = StatisticalEngine.detrend(prices, detrendBandwidth);
  const ar1Series = StatisticalEngine.rollingAR1(residuals, csdWindow);
  const varianceSeries = StatisticalEngine.rollingVariance(residuals, csdWindow);
  const kendallTau = StatisticalEngine.kendallTau(ar1Series, tauLookback);
  
  const validAr1 = ar1Series.filter(v => v !== null);
  const currentAR1 = validAr1.length > 0 ? validAr1[validAr1.length - 1] : 0;
  
  // Determine status
  let status = 'NORMAL';
  if (currentAR1 > 0.8) status = 'CRITICAL';
  else if (currentAR1 > 0.7) status = 'ELEVATED';
  else if (currentAR1 > 0.6) status = 'RISING';
  
  return {
    trend,
    residuals,
    ar1Series,
    varianceSeries,
    currentAR1,
    kendallTau,
    status,
    currentVariance: varianceSeries.filter(v => v !== null).slice(-1)[0] || 0
  };
}
