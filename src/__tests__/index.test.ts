import {
  initialize,
  initializeGlobal,
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

    it('passes stream: false to ldInit when isStreaming is false', async () => {
      await initializeFeatureFlags({ sdkKey: 'test-key', isStreaming: false });
      expect(mockLdInit).toHaveBeenCalledWith('test-key', expect.objectContaining({ stream: false }));
    });

    it('passes pollInterval to ldInit when pollingFrequencySeconds is provided', async () => {
      await initializeFeatureFlags({ sdkKey: 'test-key', isStreaming: false, pollingFrequencySeconds: 60 });
      expect(mockLdInit).toHaveBeenCalledWith(
        'test-key',
        expect.objectContaining({ stream: false, pollInterval: 60 }),
      );
    });

    it('merges isStreaming/pollingFrequencySeconds with other options', async () => {
      await initializeFeatureFlags({ sdkKey: 'test-key', isStreaming: false, pollingFrequencySeconds: 30, options: { timeout: 5000 } });
      expect(mockLdInit).toHaveBeenCalledWith(
        'test-key',
        expect.objectContaining({ timeout: 5000, stream: false, pollInterval: 30 }),
      );
    });

    it('does not pass stream/pollInterval when not set', async () => {
      await initializeFeatureFlags({ sdkKey: 'test-key' });
      const ldOptions = mockLdInit.mock.calls[0][1];
      expect(ldOptions).not.toHaveProperty('stream');
      expect(ldOptions).not.toHaveProperty('pollInterval');
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

    it('adds telemetry hook by default', async () => {
      await initializeFeatureFlags({ sdkKey: 'test-key' });
      expect(MockTelemetryHook).toHaveBeenCalled();
      expect(mockOpenFeature.addHooks).toHaveBeenCalledWith(expect.any(Object));
    });

    it('does not add telemetry hook when enableTelemetry is false', async () => {
      await initializeFeatureFlags({ sdkKey: 'test-key', enableTelemetry: false });
      expect(MockTelemetryHook).not.toHaveBeenCalled();
      expect(mockOpenFeature.addHooks).not.toHaveBeenCalled();
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

  describe('initialize', () => {
    it('returns a FeatureFlagClient', async () => {
      const client = await initialize({ sdkKey: 'test-key' });
      expect(client).toBeDefined();
      expect(typeof client.getBooleanValue).toBe('function');
      expect(typeof client.getStatus).toBe('function');
      expect(typeof client.shutdown).toBe('function');
    });

    it('uses a domain-scoped provider (setProviderAndWait called with domain "app")', async () => {
      await initialize({ sdkKey: 'test-key' });
      expect(mockOpenFeature.setProviderAndWait).toHaveBeenCalledWith('app', expect.any(Object));
    });

    it('adds telemetry hook by default', async () => {
      await initialize({ sdkKey: 'test-key' });
      expect(MockTelemetryHook).toHaveBeenCalled();
      expect(mockOpenFeature.addHooks).toHaveBeenCalled();
    });

    it('does not add telemetry hook when enableTelemetry is false', async () => {
      await initialize({ sdkKey: 'test-key', enableTelemetry: false });
      expect(MockTelemetryHook).not.toHaveBeenCalled();
    });

    it('isReady returns true after initialization', async () => {
      const client = await initialize({ sdkKey: 'test-key' });
      expect(client.isReady()).toBe(true);
    });

    it('getStatus returns ready status after initialization', async () => {
      const client = await initialize({ sdkKey: 'test-key' });
      const status = client.getStatus();
      expect(status.isInitialized).toBe(true);
      expect(status.isReady).toBe(true);
      expect(status.hasError).toBe(false);
      expect(status.provider).toEqual({ name: 'LaunchDarkly', status: 'READY' });
      expect(status.initializationTime).toBeGreaterThanOrEqual(0);
    });

    it('shutdown closes the LD client', async () => {
      const client = await initialize({ sdkKey: 'test-key' });
      await client.shutdown();
      expect(mockLdClient.close).toHaveBeenCalled();
    });

    it('wraps and rethrows errors with context', async () => {
      mockLdClient.waitForInitialization.mockRejectedValue(new Error('network error'));
      await expect(initialize({ sdkKey: 'test-key' })).rejects.toThrow(
        'Failed to initialize feature flags SDK: network error',
      );
    });

    it('gets the client by the "app" domain', async () => {
      await initialize({ sdkKey: 'test-key' });
      expect(mockOpenFeature.getClient).toHaveBeenCalledWith('app');
    });
  });

  describe('initializeGlobal', () => {
    it('returns a FeatureFlagClient', async () => {
      const client = await initializeGlobal({ sdkKey: 'test-key' });
      expect(client).toBeDefined();
      expect(typeof client.getBooleanValue).toBe('function');
      expect(typeof client.getStatus).toBe('function');
      expect(typeof client.shutdown).toBe('function');
      await client.shutdown();
    });

    it('uses the global provider (setProviderAndWait called with one argument)', async () => {
      const client = await initializeGlobal({ sdkKey: 'test-key' });
      // Global call: setProviderAndWait(provider) — only one argument
      const calls = mockOpenFeature.setProviderAndWait.mock.calls;
      const globalCall = calls.find((args: unknown[]) => args.length === 1);
      expect(globalCall).toBeDefined();
      await client.shutdown();
    });

    it('throws if called when already initialized', async () => {
      const client = await initializeGlobal({ sdkKey: 'test-key' });
      await expect(initializeGlobal({ sdkKey: 'test-key' })).rejects.toThrow('already initialized');
      await client.shutdown();
    });

    it('isReady returns true after initialization', async () => {
      const client = await initializeGlobal({ sdkKey: 'test-key' });
      expect(client.isReady()).toBe(true);
      await client.shutdown();
    });

    it('getStatus returns ready status after initialization', async () => {
      const client = await initializeGlobal({ sdkKey: 'test-key' });
      const status = client.getStatus();
      expect(status.isInitialized).toBe(true);
      expect(status.isReady).toBe(true);
      expect(status.hasError).toBe(false);
      expect(status.provider).toEqual({ name: 'LaunchDarkly', status: 'READY' });
      await client.shutdown();
    });

    it('shutdown closes the LD client', async () => {
      const client = await initializeGlobal({ sdkKey: 'test-key' });
      await client.shutdown();
      expect(mockLdClient.close).toHaveBeenCalled();
    });

    it('wraps and rethrows errors with context', async () => {
      mockLdClient.waitForInitialization.mockRejectedValue(new Error('timeout'));
      await expect(initializeGlobal({ sdkKey: 'test-key' })).rejects.toThrow(
        'Failed to initialize feature flags SDK: timeout',
      );
    });
  });

  describe('initialize and initializeGlobal coexistence', () => {
    it('featureFlags1 (initialize) and featureFlags2 (initializeGlobal) can be active simultaneously', async () => {
      const mockClient2 = { ...mockClient, getBooleanValue: jest.fn().mockResolvedValue(true) };
      mockOpenFeature.getClient
        .mockReturnValueOnce(mockClient)   // domain-scoped for featureFlags1
        .mockReturnValueOnce(mockClient2); // global for featureFlags2

      const featureFlags1 = await initialize({ sdkKey: 'key-1' });
      const featureFlags2 = await initializeGlobal({ sdkKey: 'key-2' });

      // Both are ready at the same time
      expect(featureFlags1.getStatus().isReady).toBe(true);
      expect(featureFlags2.getStatus().isReady).toBe(true);

      // Each client delegates to its own OpenFeature client
      mockClient.getBooleanValue.mockResolvedValue(false);
      const val1 = await featureFlags1.getBooleanValue('flag', false);
      const val2 = await featureFlags2.getBooleanValue('flag', false);
      expect(val1).toBe(false);
      expect(val2).toBe(true);

      await featureFlags1.shutdown();
      await featureFlags2.shutdown();
    });

    it('setProviderAndWait uses "app" domain for initialize and global for initializeGlobal', async () => {
      const featureFlags1 = await initialize({ sdkKey: 'key-1' });
      const featureFlags2 = await initializeGlobal({ sdkKey: 'key-2' });

      expect(mockOpenFeature.setProviderAndWait).toHaveBeenCalledWith('app', expect.any(Object));
      expect(mockOpenFeature.setProviderAndWait).toHaveBeenCalledWith(expect.any(Object));

      await featureFlags1.shutdown();
      await featureFlags2.shutdown();
    });
  });
});
