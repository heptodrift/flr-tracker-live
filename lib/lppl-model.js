/**
 * LPPL (Log-Periodic Power Law) Bubble Detection Model
 * 
 * Implements the model from:
 * - Sornette, Johansen & Bouchaud (1996) "Stock market crashes, Precursors and Replicas"
 * - Sornette (2003) "Why Stock Markets Crash: Critical Events in Complex Financial Systems"
 * 
 * The LPPL equation models bubble dynamics:
 * ln(p(t)) = A + B(tc - t)^m + C(tc - t)^m * cos(ω * ln(tc - t) + φ)
 * 
 * Where:
 * - tc: Critical time (predicted crash/correction date)
 * - m: Power law exponent (0.1 < m < 0.9)
 * - ω: Log-periodic frequency (typically 6-13)
 * - A, B, C: Linear parameters
 * - φ: Phase
 * 
 * Key constraints:
 * - B < 0 (finite-time singularity)
 * - |C| < |B| (oscillations subordinate to power law)
 */

export class LPPLModel {
  /**
   * LPPL function value at time t
   */
  static lpplFunction(t, tc, A, B, C, m, omega, phi) {
    const dt = tc - t;
    if (dt <= 0) return A;
    
    const dtm = Math.pow(dt, m);
    return A + B * dtm + C * dtm * Math.cos(omega * Math.log(dt) + phi);
  }

  /**
   * Fit LPPL model using grid search over nonlinear parameters
   * and OLS for linear parameters (A, B, C)
   * 
   * @param {number[]} prices - Price series
   * @param {string[]} dates - Date labels for reference
   * @returns {Object|null} Fitted model parameters or null if no valid fit
   */
  static optimize(prices, dates) {
    const n = prices.length;
    if (n < 100) return { isBubble: false, confidence: 0, r2: 0 };
    
    const logPrices = prices.map(p => Math.log(p));
    const t = Array.from({ length: n }, (_, i) => i);
    
    let bestFit = null;
    let bestR2 = -Infinity;
    
    // Grid search ranges based on empirical bubble characteristics
    const tcRange = [];
    for (let tc = n + 5; tc <= n + 200; tc += 10) tcRange.push(tc);
    
    const mRange = [0.15, 0.2, 0.25, 0.33, 0.4, 0.5, 0.6, 0.7, 0.8];
    const omegaRange = [5, 6, 7, 8, 9, 10, 11, 12, 13];
    const phiRange = [0, Math.PI/4, Math.PI/2, 3*Math.PI/4, Math.PI, 5*Math.PI/4, 3*Math.PI/2, 7*Math.PI/4];
    
    for (const tc of tcRange) {
      for (const m of mRange) {
        for (const omega of omegaRange) {
          for (const phi of phiRange) {
            // Build design matrix for linear regression
            const X = [];
            const y = [];
            
            let valid = true;
            for (let i = 0; i < n; i++) {
              const dt = tc - t[i];
              if (dt <= 0) { valid = false; break; }
              
              const dtm = Math.pow(dt, m);
              const cosVal = Math.cos(omega * Math.log(dt) + phi);
              
              X.push([1, dtm, dtm * cosVal]);
              y.push(logPrices[i]);
            }
            
            if (!valid) continue;
            
            // Solve OLS for [A, B, C]
            const result = this.linearRegression(X, y);
            if (!result) continue;
            
            const [A, B, C] = result.coefficients;
            
            // Apply LPPL constraints
            if (B >= 0) continue;           // Must have singularity
            if (Math.abs(C) > Math.abs(B)) continue;  // Oscillations subordinate
            if (m < 0.1 || m > 0.9) continue;
            if (omega < 5 || omega > 15) continue;
            
            // Calculate R²
            const predicted = t.map(ti => this.lpplFunction(ti, tc, A, B, C, m, omega, phi));
            const ssRes = logPrices.reduce((sum, yi, i) => sum + Math.pow(yi - predicted[i], 2), 0);
            const meanY = logPrices.reduce((a, b) => a + b, 0) / n;
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
      return { 
        isBubble: false, 
        confidence: 0, 
        r2: bestFit?.r2 || 0,
        tcDays: null
      };
    }
    
    // Calculate confidence based on R² quality
    const confidence = Math.min(1, Math.max(0, (bestFit.r2 - 0.75) / 0.2));
    const tcDays = Math.round(bestFit.tc - n + 1);
    
    return {
      ...bestFit,
      confidence,
      tcDays,
      isBubble: confidence > 0.3 && tcDays > 5 && tcDays < 200
    };
  }

  /**
   * Solve 3x3 linear system using Cramer's rule
   */
  static linearRegression(X, y) {
    const n = X.length;
    const p = X[0].length;
    
    // X'X
    const XtX = Array(p).fill(null).map(() => Array(p).fill(0));
    for (let i = 0; i < p; i++) {
      for (let j = 0; j < p; j++) {
        for (let k = 0; k < n; k++) {
          XtX[i][j] += X[k][i] * X[k][j];
        }
      }
    }
    
    // X'y
    const Xty = Array(p).fill(0);
    for (let i = 0; i < p; i++) {
      for (let k = 0; k < n; k++) {
        Xty[i] += X[k][i] * y[k];
      }
    }
    
    const coefficients = this.solve3x3(XtX, Xty);
    if (!coefficients) return null;
    
    return { coefficients };
  }

  static solve3x3(A, b) {
    const det = A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1])
              - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0])
              + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
    
    if (Math.abs(det) < 1e-10) return null;
    
    const invDet = 1 / det;
    
    const inv = [
      [(A[1][1] * A[2][2] - A[1][2] * A[2][1]) * invDet,
       (A[0][2] * A[2][1] - A[0][1] * A[2][2]) * invDet,
       (A[0][1] * A[1][2] - A[0][2] * A[1][1]) * invDet],
      [(A[1][2] * A[2][0] - A[1][0] * A[2][2]) * invDet,
       (A[0][0] * A[2][2] - A[0][2] * A[2][0]) * invDet,
       (A[0][2] * A[1][0] - A[0][0] * A[1][2]) * invDet],
      [(A[1][0] * A[2][1] - A[1][1] * A[2][0]) * invDet,
       (A[0][1] * A[2][0] - A[0][0] * A[2][1]) * invDet,
       (A[0][0] * A[1][1] - A[0][1] * A[1][0]) * invDet]
    ];
    
    return [
      inv[0][0] * b[0] + inv[0][1] * b[1] + inv[0][2] * b[2],
      inv[1][0] * b[0] + inv[1][1] * b[1] + inv[1][2] * b[2],
      inv[2][0] * b[0] + inv[2][1] * b[1] + inv[2][2] * b[2]
    ];
  }

  /**
   * Generate LPPL fitted curve for plotting
   */
  static generateFittedCurve(params, startT, endT) {
    if (!params || !params.isBubble) return [];
    
    const { tc, A, B, C, m, omega, phi } = params;
    const curve = [];
    
    for (let t = startT; t <= Math.min(endT, tc - 1); t++) {
      const value = Math.exp(this.lpplFunction(t, tc, A, B, C, m, omega, phi));
      curve.push({ t, value });
    }
    
    return curve;
  }
}

export function optimizeLPPL(prices, dates) {
  return LPPLModel.optimize(prices, dates);
}

export function generateFittedCurve(params, startT, endT) {
  return LPPLModel.generateFittedCurve(params, startT, endT);
}
