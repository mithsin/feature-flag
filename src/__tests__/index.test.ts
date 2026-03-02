import {
  initializeFeatureFlags,
  isFeatureFlagsReady,
  getFeatureFlagsStatus,
  shutdownFeatureFlags,
} from '../index';
import { OpenFeature } from '@openfeature/server-sdk';
import { init as ldInit } from 'launchdarkly-node-server-sdk';
import { TelemetryHook } from '../hooks/telemetry-hook';

jest.mock('@openfeature/server-sdk', () => ({
  OpenFeature: {
    setProviderAndWait: jest.fn().mockResolvedValue(undefined),
    addHooks: jest.fn(),
    clearProviders: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('launchdarkly-node-server-sdk', () => ({
  init: jest.fn(),
}));

jest.mock('@launchdarkly/openfeature-node-server', () => ({
  LaunchDarklyProvider: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../hooks/telemetry-hook', () => ({
  TelemetryHook: jest.fn().mockImplementation(() => ({})),
}));

const mockOpenFeature = OpenFeature as unknown as {
  setProviderAndWait: jest.Mock;
  addHooks: jest.Mock;
  clearProviders: jest.Mock;
};
const mockLdInit = ldInit as jest.Mock;
const MockTelemetryHook = TelemetryHook as jest.Mock;

describe('Feature Flags SDK', () => {
  let mockLdClient: { waitForInitialization: jest.Mock; close: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockLdClient = {
      waitForInitialization: jest.fn().mockResolvedValue(undefined),
      close: jest.fn(),
    };
    mockLdInit.mockReturnValue(mockLdClient);
    mockOpenFeature.setProviderAndWait.mockResolvedValue(undefined);
    mockOpenFeature.clearProviders.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await shutdownFeatureFlags();
    jest.restoreAllMocks();
  });

  describe('isFeatureFlagsReady', () => {
    it('returns false before initialization', () => {
      expect(isFeatureFlagsReady()).toBe(false);
    });

    it('returns true after successful initialization', async () => {
      await initializeFeatureFlags({ sdkKey: 'test-key' });
      expect(isFeatureFlagsReady()).toBe(true);
    });

    it('returns false after shutdown', async () => {
      await initializeFeatureFlags({ sdkKey: 'test-key' });
      await shutdownFeatureFlags();
      expect(isFeatureFlagsReady()).toBe(false);
    });
  });

  describe('getFeatureFlagsStatus', () => {
    it('returns not-ready status before initialization', () => {
      const status = getFeatureFlagsStatus();
      expect(status.isInitialized).toBe(false);
      expect(status.isReady).toBe(false);
      expect(status.hasError).toBe(false);
      expect(status.provider).toBeNull();
      expect(status.initializationTime).toBeNull();
    });

    it('returns ready status after successful initialization', async () => {
      await initializeFeatureFlags({ sdkKey: 'test-key' });
      const status = getFeatureFlagsStatus();
      expect(status.isInitialized).toBe(true);
      expect(status.isReady).toBe(true);
      expect(status.hasError).toBe(false);
      expect(status.provider).toEqual({ name: 'LaunchDarkly', status: 'READY' });
      expect(status.initializationTime).toBeGreaterThanOrEqual(0);
    });

    it('includes a valid ISO timestamp', () => {
      const status = getFeatureFlagsStatus();
      expect(new Date(status.timestamp).toISOString()).toBe(status.timestamp);
    });
  });

  describe('initializeFeatureFlags', () => {
    it('throws if SDK key is not provided', async () => {
      await expect(initializeFeatureFlags({})).rejects.toThrow(
        'LaunchDarkly SDK key is required',
      );
    });

    it('uses LAUNCHDARKLY_SDK_KEY env variable when no sdkKey in config', async () => {
      process.env['LAUNCHDARKLY_SDK_KEY'] = 'env-sdk-key';
      await initializeFeatureFlags({});
      expect(mockLdInit).toHaveBeenCalledWith('env-sdk-key', undefined);
      delete process.env['LAUNCHDARKLY_SDK_KEY'];
    });

    it('throws if called when already initialized', async () => {
      await initializeFeatureFlags({ sdkKey: 'test-key' });
      await expect(initializeFeatureFlags({ sdkKey: 'test-key' })).rejects.toThrow(
        'already initialized',
      );
    });

    it('calls ldInit with the provided SDK key and options', async () => {
      await initializeFeatureFlags({ sdkKey: 'my-key', options: { timeout: 3000 } });
      expect(mockLdInit).toHaveBeenCalledWith('my-key', { timeout: 3000 });
    });

    it('calls waitForInitialization before setProviderAndWait', async () => {
      const callOrder: string[] = [];
      mockLdClient.waitForInitialization.mockImplementation(async () => {
        callOrder.push('waitForInitialization');
      });
      mockOpenFeature.setProviderAndWait.mockImplementation(async () => {
        callOrder.push('setProviderAndWait');
      });

      await initializeFeatureFlags({ sdkKey: 'test-key' });
      expect(callOrder).toEqual(['waitForInitialization', 'setProviderAndWait']);
    });

    it('adds telemetry hook by default using console.log as logger', async () => {
      await initializeFeatureFlags({ sdkKey: 'test-key' });
      expect(MockTelemetryHook).toHaveBeenCalledWith(
        expect.objectContaining({ logger: console.log }),
      );
      expect(mockOpenFeature.addHooks).toHaveBeenCalledWith(expect.any(Object));
    });

    it('passes custom logger to TelemetryHook', async () => {
      const mockLogger = jest.fn();
      await initializeFeatureFlags({ sdkKey: 'test-key', logger: mockLogger });
      expect(MockTelemetryHook).toHaveBeenCalledWith(
        expect.objectContaining({ logger: mockLogger }),
      );
      expect(mockOpenFeature.addHooks).toHaveBeenCalled();
    });

    it('does not add telemetry hook when enableTelemetry is false', async () => {
      await initializeFeatureFlags({ sdkKey: 'test-key', enableTelemetry: false });
      expect(MockTelemetryHook).not.toHaveBeenCalled();
      expect(mockOpenFeature.addHooks).not.toHaveBeenCalled();
    });

    it('calls custom logger with success message on init', async () => {
      const mockLogger = jest.fn();
      await initializeFeatureFlags({ sdkKey: 'test-key', logger: mockLogger });
      expect(mockLogger).toHaveBeenCalledWith(
        expect.stringContaining('initialized successfully'),
      );
    });

    it('wraps and rethrows errors with context', async () => {
      mockLdClient.waitForInitialization.mockRejectedValue(new Error('Connection refused'));
      await expect(initializeFeatureFlags({ sdkKey: 'test-key' })).rejects.toThrow(
        'Failed to initialize feature flags SDK: Connection refused',
      );
    });

    it('sets isReady to false and records error on failed init', async () => {
      mockLdClient.waitForInitialization.mockRejectedValue(new Error('timeout'));
      await expect(initializeFeatureFlags({ sdkKey: 'test-key' })).rejects.toThrow();

      const status = getFeatureFlagsStatus();
      expect(status.isReady).toBe(false);
      expect(status.hasError).toBe(true);
      expect(status.error?.message).toBe('timeout');
    });
  });

  describe('shutdownFeatureFlags', () => {
    it('warns and returns early when not initialized', async () => {
      await shutdownFeatureFlags();
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('not initialized'));
    });

    it('calls clearProviders on OpenFeature', async () => {
      await initializeFeatureFlags({ sdkKey: 'test-key' });
      await shutdownFeatureFlags();
      expect(mockOpenFeature.clearProviders).toHaveBeenCalled();
    });

    it('closes the LD client', async () => {
      await initializeFeatureFlags({ sdkKey: 'test-key' });
      await shutdownFeatureFlags();
      expect(mockLdClient.close).toHaveBeenCalled();
    });

    it('resets all state after shutdown', async () => {
      await initializeFeatureFlags({ sdkKey: 'test-key' });
      await shutdownFeatureFlags();

      const status = getFeatureFlagsStatus();
      expect(status.isInitialized).toBe(false);
      expect(status.isReady).toBe(false);
      expect(status.provider).toBeNull();
    });
  });
});
