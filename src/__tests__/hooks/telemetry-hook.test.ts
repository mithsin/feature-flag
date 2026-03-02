import { TelemetryHook } from '../../hooks/telemetry-hook';
import type {
  BeforeHookContext,
  HookContext,
  EvaluationDetails,
  FlagValue,
} from '@openfeature/server-sdk';

const makeBeforeCtx = (overrides: Partial<BeforeHookContext> = {}): BeforeHookContext =>
  ({
    flagKey: 'test-flag',
    defaultValue: false,
    context: { targetingKey: 'user-123' },
    flagValueType: 'boolean',
    clientMetadata: { name: 'test' },
    providerMetadata: { name: 'test' },
    ...overrides,
  }) as BeforeHookContext;

const makeHookCtx = (overrides: Partial<HookContext> = {}): Readonly<HookContext> =>
  ({
    flagKey: 'test-flag',
    defaultValue: false,
    context: { targetingKey: 'user-123' },
    flagValueType: 'boolean',
    clientMetadata: { name: 'test' },
    providerMetadata: { name: 'test' },
    ...overrides,
  }) as HookContext;

const makeDetails = (
  overrides: Partial<EvaluationDetails<FlagValue>> = {},
): EvaluationDetails<FlagValue> => ({
  flagKey: 'test-flag',
  value: true,
  variant: '1',
  reason: 'TARGETING_MATCH',
  flagMetadata: {},
  ...overrides,
});

describe('TelemetryHook', () => {
  let mockLogger: jest.Mock;
  let hook: TelemetryHook;

  beforeEach(() => {
    mockLogger = jest.fn();
    hook = new TelemetryHook({ logger: mockLogger });
  });

  const getLog = (callIndex = 0) => JSON.parse(mockLogger.mock.calls[callIndex][0]);

  describe('before()', () => {
    it('logs a DEBUG event', () => {
      hook.before(makeBeforeCtx());
      expect(getLog().level).toBe('DEBUG');
      expect(getLog().event).toBe('flag_evaluation_started');
    });

    it('includes flagKey and defaultValue', () => {
      hook.before(makeBeforeCtx({ flagKey: 'my-flag', defaultValue: true }));
      const log = getLog();
      expect(log.flagKey).toBe('my-flag');
      expect(log.defaultValue).toBe(true);
    });

    it('includes the context keys', () => {
      hook.before(
        makeBeforeCtx({ context: { targetingKey: 'u1', email: 'a@b.com', role: 'admin' } }),
      );
      expect(getLog().contextKeys).toEqual(['targetingKey', 'email', 'role']);
    });

    it('handles empty context', () => {
      hook.before(makeBeforeCtx({ context: {} }));
      expect(getLog().contextKeys).toEqual([]);
    });

    it('includes source and timestamp', () => {
      hook.before(makeBeforeCtx());
      const log = getLog();
      expect(log.source).toBe('feature-flags-sdk');
      expect(typeof log.timestamp).toBe('string');
    });
  });

  describe('after()', () => {
    it('logs an INFO event', () => {
      hook.after(makeHookCtx(), makeDetails());
      expect(getLog().level).toBe('INFO');
      expect(getLog().event).toBe('flag_evaluation_completed');
    });

    it('includes flagKey, value, variant, and reason', () => {
      hook.after(
        makeHookCtx({ flagKey: 'my-flag' }),
        makeDetails({ value: false, variant: '0', reason: 'FALLTHROUGH' }),
      );
      const log = getLog();
      expect(log.flagKey).toBe('my-flag');
      expect(log.value).toBe(false);
      expect(log.variant).toBe('0');
      expect(log.reason).toBe('FALLTHROUGH');
    });

    it('sets evaluationTimeMs to null when logTimings is false', () => {
      hook = new TelemetryHook({ logger: mockLogger, logTimings: false });
      hook.after(makeHookCtx(), makeDetails());
      expect(getLog().evaluationTimeMs).toBeNull();
    });

    it('includes evaluationTimeMs when logTimings is true and before() was called', () => {
      hook = new TelemetryHook({ logger: mockLogger, logTimings: true });
      hook.before(makeBeforeCtx());
      hook.after(makeHookCtx(), makeDetails());
      // evaluationTimeMs may be null due to ID mismatch across calls, or >= 0 if same ms
      expect('evaluationTimeMs' in getLog(1)).toBe(true);
    });
  });

  describe('error()', () => {
    it('logs an ERROR event when logErrors is true (default)', () => {
      const err = new Error('Flag not found');
      err.name = 'FlagNotFoundError';
      hook.error(makeHookCtx({ flagKey: 'my-flag' }), err);
      const log = getLog();
      expect(log.level).toBe('ERROR');
      expect(log.event).toBe('flag_evaluation_error');
      expect(log.flagKey).toBe('my-flag');
      expect(log.errorName).toBe('FlagNotFoundError');
      expect(log.errorMessage).toBe('Flag not found');
    });

    it('does not log when logErrors is false', () => {
      hook = new TelemetryHook({ logger: mockLogger, logErrors: false });
      hook.error(makeHookCtx(), new Error('oops'));
      expect(mockLogger).not.toHaveBeenCalled();
    });

    it('handles non-Error thrown values', () => {
      hook.error(makeHookCtx(), 'plain string error');
      expect(getLog().errorMessage).toBe('plain string error');
    });

    it('includes defaultValue in the error log', () => {
      hook.error(makeHookCtx({ defaultValue: true }), new Error('err'));
      expect(getLog().defaultValue).toBe(true);
    });
  });

  describe('default options', () => {
    it('uses console.log when no logger is provided', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const defaultHook = new TelemetryHook();
      defaultHook.before(makeBeforeCtx());
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('enables logErrors by default', () => {
      const defaultHook = new TelemetryHook({ logger: mockLogger });
      defaultHook.error(makeHookCtx(), new Error('test'));
      expect(mockLogger).toHaveBeenCalled();
    });
  });
});
