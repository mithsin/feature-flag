import { initialize, initializeGlobal } from '../index';
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

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('initialize', () => {
    it('returns a FeatureFlagClient', async () => {
      const client = await initialize({ sdkKey: 'test-key' });
      expect(client).toBeDefined();
      expect(typeof client.getBooleanValue).toBe('function');
      expect(typeof client.isReady).toBe('function');
      expect(typeof client.getStatus).toBe('function');
      expect(typeof client.shutdown).toBe('function');
    });

    it('uses a domain-scoped provider (setProviderAndWait called with domain "app")', async () => {
      await initialize({ sdkKey: 'test-key' });
      expect(mockOpenFeature.setProviderAndWait).toHaveBeenCalledWith('app', expect.any(Object));
    });

    it('gets the client by the "app" domain', async () => {
      await initialize({ sdkKey: 'test-key' });
      expect(mockOpenFeature.getClient).toHaveBeenCalledWith('app');
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

    it('calls ldInit with the provided SDK key and options', async () => {
      await initialize({ sdkKey: 'my-key', options: { timeout: 3000 } });
      expect(mockLdInit).toHaveBeenCalledWith('my-key', { timeout: 3000, pollInterval: 30 });
    });

    it('passes stream: false to ldInit when isStreaming is false', async () => {
      await initialize({ sdkKey: 'test-key', isStreaming: false });
      expect(mockLdInit).toHaveBeenCalledWith('test-key', expect.objectContaining({ stream: false }));
    });

    it('defaults pollInterval to 30 when pollingFrequencySeconds is not set', async () => {
      await initialize({ sdkKey: 'test-key' });
      expect(mockLdInit).toHaveBeenCalledWith('test-key', expect.objectContaining({ pollInterval: 30 }));
    });

    it('passes pollInterval to ldInit when pollingFrequencySeconds is provided', async () => {
      await initialize({ sdkKey: 'test-key', isStreaming: false, pollingFrequencySeconds: 60 });
      expect(mockLdInit).toHaveBeenCalledWith('test-key', expect.objectContaining({ stream: false, pollInterval: 60 }));
    });

    it('wraps and rethrows errors with context', async () => {
      mockLdClient.waitForInitialization.mockRejectedValue(new Error('network error'));
      await expect(initialize({ sdkKey: 'test-key' })).rejects.toThrow(
        'Failed to initialize feature flags SDK: network error',
      );
    });
  });

  describe('initializeGlobal', () => {
    it('returns a FeatureFlagClient', async () => {
      const client = await initializeGlobal({ sdkKey: 'test-key' });
      expect(client).toBeDefined();
      expect(typeof client.getBooleanValue).toBe('function');
      expect(typeof client.isReady).toBe('function');
      expect(typeof client.getStatus).toBe('function');
      expect(typeof client.shutdown).toBe('function');
      await client.shutdown();
    });

    it('uses the global provider (setProviderAndWait called with one argument)', async () => {
      const client = await initializeGlobal({ sdkKey: 'test-key' });
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

    it('shutdown calls clearProviders and closes the LD client', async () => {
      const client = await initializeGlobal({ sdkKey: 'test-key' });
      await client.shutdown();
      expect(mockOpenFeature.clearProviders).toHaveBeenCalled();
      expect(mockLdClient.close).toHaveBeenCalled();
    });

    it('can be re-initialized after shutdown', async () => {
      const client = await initializeGlobal({ sdkKey: 'test-key' });
      await client.shutdown();
      const client2 = await initializeGlobal({ sdkKey: 'test-key' });
      expect(client2.isReady()).toBe(true);
      await client2.shutdown();
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

      expect(featureFlags1.isReady()).toBe(true);
      expect(featureFlags2.isReady()).toBe(true);

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
