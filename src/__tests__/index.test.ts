import {
  initializeFeatureFlags,
  isFeatureFlagsReady,
  getFeatureFlagsStatus,
  shutdownFeatureFlags,
  getBooleanValue,
  getStringValue,
  getNumberValue,
  getObjectValue,
  getBooleanDetails,
  getStringDetails,
  getNumberDetails,
  getObjectDetails,
} from '../index';
import { OpenFeature } from '@openfeature/server-sdk';
import { init as ldInit } from 'launchdarkly-node-server-sdk';
import { TelemetryHook } from '../hooks/telemetry-hook';

jest.mock('@openfeature/server-sdk', () => ({
  OpenFeature: {
    setProviderAndWait: jest.fn().mockResolvedValue(undefined),
    addHooks: jest.fn(),
    clearProviders: jest.fn().mockResolvedValue(undefined),
    getClient: jest.fn(),
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
  getClient: jest.Mock;
};
const mockLdInit = ldInit as jest.Mock;
const MockTelemetryHook = TelemetryHook as jest.Mock;

describe('Feature Flags SDK', () => {
  let mockLdClient: { waitForInitialization: jest.Mock; close: jest.Mock };
  let mockClient: {
    getBooleanValue: jest.Mock;
    getStringValue: jest.Mock;
    getNumberValue: jest.Mock;
    getObjectValue: jest.Mock;
    getBooleanDetails: jest.Mock;
    getStringDetails: jest.Mock;
    getNumberDetails: jest.Mock;
    getObjectDetails: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockLdClient = {
      waitForInitialization: jest.fn().mockResolvedValue(undefined),
      close: jest.fn(),
    };
    mockClient = {
      getBooleanValue: jest.fn().mockResolvedValue(false),
      getStringValue: jest.fn().mockResolvedValue(''),
      getNumberValue: jest.fn().mockResolvedValue(0),
      getObjectValue: jest.fn().mockResolvedValue({}),
      getBooleanDetails: jest.fn().mockResolvedValue({ value: false, flagKey: 'test', flagMetadata: {} }),
      getStringDetails: jest.fn().mockResolvedValue({ value: '', flagKey: 'test', flagMetadata: {} }),
      getNumberDetails: jest.fn().mockResolvedValue({ value: 0, flagKey: 'test', flagMetadata: {} }),
      getObjectDetails: jest.fn().mockResolvedValue({ value: {}, flagKey: 'test', flagMetadata: {} }),
    };
    mockLdInit.mockReturnValue(mockLdClient);
    mockOpenFeature.setProviderAndWait.mockResolvedValue(undefined);
    mockOpenFeature.clearProviders.mockResolvedValue(undefined);
    mockOpenFeature.getClient.mockReturnValue(mockClient);
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

  describe('flag evaluation helpers', () => {
    it('throws when SDK is not initialized', async () => {
      await expect(getBooleanValue('flag', false)).rejects.toThrow('not initialized');
      await expect(getStringValue('flag', '')).rejects.toThrow('not initialized');
      await expect(getNumberValue('flag', 0)).rejects.toThrow('not initialized');
      await expect(getObjectValue('flag', {})).rejects.toThrow('not initialized');
      await expect(getBooleanDetails('flag', false)).rejects.toThrow('not initialized');
      await expect(getStringDetails('flag', '')).rejects.toThrow('not initialized');
      await expect(getNumberDetails('flag', 0)).rejects.toThrow('not initialized');
      await expect(getObjectDetails('flag', {})).rejects.toThrow('not initialized');
    });

    describe('after initialization', () => {
      const ctx = { targetingKey: 'user-1' };

      beforeEach(async () => {
        await initializeFeatureFlags({ sdkKey: 'test-key' });
      });

      it('getBooleanValue calls client and returns value', async () => {
        mockClient.getBooleanValue.mockResolvedValue(true);
        const result = await getBooleanValue('my-flag', false, ctx);
        expect(mockClient.getBooleanValue).toHaveBeenCalledWith('my-flag', false, ctx);
        expect(result).toBe(true);
      });

      it('getStringValue calls client and returns value', async () => {
        mockClient.getStringValue.mockResolvedValue('dark');
        const result = await getStringValue('theme', 'light', ctx);
        expect(mockClient.getStringValue).toHaveBeenCalledWith('theme', 'light', ctx);
        expect(result).toBe('dark');
      });

      it('getNumberValue calls client and returns value', async () => {
        mockClient.getNumberValue.mockResolvedValue(42);
        const result = await getNumberValue('limit', 0, ctx);
        expect(mockClient.getNumberValue).toHaveBeenCalledWith('limit', 0, ctx);
        expect(result).toBe(42);
      });

      it('getObjectValue calls client and returns value', async () => {
        const config = { timeout: 5000 };
        mockClient.getObjectValue.mockResolvedValue(config);
        const result = await getObjectValue('config', {}, ctx);
        expect(mockClient.getObjectValue).toHaveBeenCalledWith('config', {}, ctx);
        expect(result).toEqual(config);
      });

      it('getBooleanDetails calls client and returns details', async () => {
        const details = { value: true, variant: '1', reason: 'TARGETING_MATCH', flagKey: 'my-flag', flagMetadata: {} };
        mockClient.getBooleanDetails.mockResolvedValue(details);
        const result = await getBooleanDetails('my-flag', false, ctx);
        expect(mockClient.getBooleanDetails).toHaveBeenCalledWith('my-flag', false, ctx);
        expect(result).toEqual(details);
      });

      it('getStringDetails calls client and returns details', async () => {
        const details = { value: 'v2', variant: '1', reason: 'FALLTHROUGH', flagKey: 'version', flagMetadata: {} };
        mockClient.getStringDetails.mockResolvedValue(details);
        const result = await getStringDetails('version', 'v1', ctx);
        expect(mockClient.getStringDetails).toHaveBeenCalledWith('version', 'v1', ctx);
        expect(result).toEqual(details);
      });

      it('getNumberDetails calls client and returns details', async () => {
        const details = { value: 10, variant: '0', reason: 'FALLTHROUGH', flagKey: 'limit', flagMetadata: {} };
        mockClient.getNumberDetails.mockResolvedValue(details);
        const result = await getNumberDetails('limit', 0, ctx);
        expect(mockClient.getNumberDetails).toHaveBeenCalledWith('limit', 0, ctx);
        expect(result).toEqual(details);
      });

      it('getObjectDetails calls client and returns details', async () => {
        const details = { value: { x: 1 }, variant: '0', reason: 'FALLTHROUGH', flagKey: 'cfg', flagMetadata: {} };
        mockClient.getObjectDetails.mockResolvedValue(details);
        const result = await getObjectDetails('cfg', {}, ctx);
        expect(mockClient.getObjectDetails).toHaveBeenCalledWith('cfg', {}, ctx);
        expect(result).toEqual(details);
      });

      it('works without a context argument', async () => {
        mockClient.getBooleanValue.mockResolvedValue(false);
        await getBooleanValue('flag', false);
        expect(mockClient.getBooleanValue).toHaveBeenCalledWith('flag', false, undefined);
      });
    });
  });
});
