import type {
  Hook,
  HookContext,
  BeforeHookContext,
  EvaluationDetails,
  FlagValue,
  HookHints,
  EvaluationContext,
} from '@openfeature/server-sdk';

interface TelemetryHookOptions {
  logger?: (message: string) => void;
  logTimings?: boolean;
  logErrors?: boolean;
}

interface EvaluationRecord {
  startTime: number;
  flagKey: string;
}

export class TelemetryHook implements Hook {
  private logger: (message: string) => void;
  private logTimings: boolean;
  private logErrors: boolean;
  private evaluations: Map<string, EvaluationRecord>;

  constructor(options: TelemetryHookOptions = {}) {
    this.logger = options.logger || console.log;
    this.logTimings = options.logTimings !== false;
    this.logErrors = options.logErrors !== false;
    this.evaluations = new Map();
  }

  before(hookContext: BeforeHookContext, hints?: HookHints): void {
    const { flagKey, context, defaultValue } = hookContext;

    if (this.logTimings) {
      const evaluationId = this._generateEvaluationId(flagKey, context);
      this.evaluations.set(evaluationId, { startTime: Date.now(), flagKey });
    }

    this._log('DEBUG', {
      event: 'flag_evaluation_started',
      flagKey,
      defaultValue,
      contextKeys: context ? Object.keys(context) : [],
      timestamp: new Date().toISOString(),
    });
  }

  after(
    hookContext: Readonly<HookContext>,
    evaluationDetails: EvaluationDetails<FlagValue>,
    hints?: HookHints,
  ): void {
    const { flagKey, context } = hookContext;
    const { value, variant, reason } = evaluationDetails;

    let evaluationTime: number | null = null;
    if (this.logTimings) {
      const evaluationId = this._generateEvaluationId(flagKey, context);
      const evaluation = this.evaluations.get(evaluationId);
      if (evaluation) {
        evaluationTime = Date.now() - evaluation.startTime;
        this.evaluations.delete(evaluationId);
      }
    }

    this._log('INFO', {
      event: 'flag_evaluation_completed',
      flagKey,
      value,
      variant,
      reason,
      evaluationTimeMs: evaluationTime,
      timestamp: new Date().toISOString(),
    });
  }

  error(
    hookContext: Readonly<HookContext>,
    error: unknown,
    hints?: HookHints,
  ): void {
    const { flagKey, context, defaultValue } = hookContext;

    if (this.logErrors) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      this._log('ERROR', {
        event: 'flag_evaluation_error',
        flagKey,
        errorMessage: errorObj.message,
        errorName: errorObj.name,
        defaultValue,
        timestamp: new Date().toISOString(),
      });
    }

    if (this.logTimings) {
      const evaluationId = this._generateEvaluationId(flagKey, context);
      this.evaluations.delete(evaluationId);
    }
  }

  finally(
    hookContext: Readonly<HookContext>,
    evaluationDetails: EvaluationDetails<FlagValue>,
    hints?: HookHints,
  ): void {
    // Reserved for cleanup
  }

  private _generateEvaluationId(flagKey: string, context: EvaluationContext): string {
    const contextId = context?.targetingKey ?? 'anonymous';
    return `${flagKey}_${contextId}_${Date.now()}`;
  }

  private _log(level: string, data: Record<string, unknown>): void {
    const logEntry = {
      level,
      source: 'feature-flags-sdk',
      ...data,
    };
    this.logger(JSON.stringify(logEntry));
  }
}
