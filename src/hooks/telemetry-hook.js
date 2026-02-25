const { HookContext } = require('@openfeature/server-sdk');

/**
 * TelemetryHook - OpenFeature hook for logging and telemetry
 * Implements the OpenFeature hook lifecycle for observability
 */
class TelemetryHook {
  /**
   * @param {Object} options
   * @param {Function} options.logger - Logger function (default: console.log)
   * @param {boolean} options.logTimings - Log evaluation timings (default: true)
   * @param {boolean} options.logErrors - Log errors (default: true)
   */
  constructor(options = {}) {
    this.logger = options.logger || console.log;
    this.logTimings = options.logTimings !== false;
    this.logErrors = options.logErrors !== false;
    this.evaluations = new Map(); // Store evaluation start times
  }

  /**
   * Before hook - called before flag evaluation
   * @param {HookContext} hookContext
   * @param {Object} hints
   */
  before(hookContext, hints) {
    const { flagKey, context, defaultValue } = hookContext;

    // Store start time for timing measurements
    if (this.logTimings) {
      const evaluationId = this._generateEvaluationId(flagKey, context);
      this.evaluations.set(evaluationId, {
        startTime: Date.now(),
        flagKey,
        context
      });
    }

    this._log('DEBUG', {
      event: 'flag_evaluation_started',
      flagKey,
      defaultValue,
      contextKeys: context ? Object.keys(context) : [],
      timestamp: new Date().toISOString()
    });
  }

  /**
   * After hook - called after successful flag evaluation
   * @param {HookContext} hookContext
   * @param {Object} evaluationDetails
   * @param {Object} hints
   */
  after(hookContext, evaluationDetails, hints) {
    const { flagKey, context } = hookContext;
    const { value, variant, reason } = evaluationDetails;

    // Calculate evaluation time
    let evaluationTime = null;
    if (this.logTimings) {
      const evaluationId = this._generateEvaluationId(flagKey, context);
      const evaluation = this.evaluations.get(evaluationId);
      if (evaluation) {
        evaluationTime = Date.now() - evaluation.startTime;
        this.evaluations.delete(evaluationId); // Clean up
      }
    }

    this._log('INFO', {
      event: 'flag_evaluation_completed',
      flagKey,
      value,
      variant,
      reason,
      evaluationTimeMs: evaluationTime,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Error hook - called when flag evaluation fails
   * @param {HookContext} hookContext
   * @param {Error} error
   * @param {Object} hints
   */
  error(hookContext, error, hints) {
    const { flagKey, context, defaultValue } = hookContext;

    if (this.logErrors) {
      this._log('ERROR', {
        event: 'flag_evaluation_error',
        flagKey,
        errorMessage: error.message,
        errorName: error.name,
        defaultValue,
        timestamp: new Date().toISOString()
      });
    }

    // Clean up timing data
    if (this.logTimings) {
      const evaluationId = this._generateEvaluationId(flagKey, context);
      this.evaluations.delete(evaluationId);
    }
  }

  /**
   * Finally hook - always called after evaluation (success or error)
   * @param {HookContext} hookContext
   * @param {Object} hints
   */
  finally(hookContext, hints) {
    // This can be used for final cleanup or always-run telemetry
    // For now, we'll keep it minimal
  }

  /**
   * Generate unique ID for evaluation tracking
   * @private
   */
  _generateEvaluationId(flagKey, context) {
    const contextId = context && context.targetingKey ? context.targetingKey : 'anonymous';
    return `${flagKey}_${contextId}_${Date.now()}`;
  }

  /**
   * Internal logging method
   * @private
   */
  _log(level, data) {
    const logEntry = {
      level,
      source: 'feature-flags-sdk',
      ...data
    };

    this.logger(JSON.stringify(logEntry));
  }
}

module.exports = { TelemetryHook };
