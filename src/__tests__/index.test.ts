import { initialize, initializeGlobal } from '../index';
import type { FeatureFlagsInstance } from '../index';
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
  let sdk: FeatureFlagsInstance | null;

  beforeEach(() => {
    sdk = null;
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
    if (sdk) await sdk.shutdown();
    jest.restoreAllMocks();
  });

  describe('isReady', () => {
    it('returns true after successful initialization', async () => {
      sdk = await initialize({ sdkKey: 'test-key' });
      expect(sdk.isReady()).toBe(true);
    });

    it('returns false after shutdown', async () => {
      sdk = await initialize({ sdkKey: 'test-key' });
      await sdk.shutdown();
      expect(sdk.isReady()).toBe(false);
      sdk = null;
    });
  });

  describe('getStatus', () => {
    it('returns ready status after successful initialization', async () => {
      sdk = await initialize({ sdkKey: 'test-key' });
      const status = sdk.getStatus();
      expect(status.isInitialized).toBe(true);
      expect(status.isReady).toBe(true);
      expect(status.hasError).toBe(false);
      expect(status.provider).toEqual({ name: 'LaunchDarkly', status: 'READY' });
      expect(status.initializationTime).toBeGreaterThanOrEqual(0);
    });

    it('resets status after shutdown', async () => {
      sdk = await initialize({ sdkKey: 'test-key' });
      await sdk.shutdown();
      const status = sdk.getStatus();
      expect(status.isInitialized).toBe(false);
      expect(status.isReady).toBe(false);
      expect(status.provider).toBeNull();
      sdk = null;
    });

    it('includes a valid ISO timestamp', async () => {
      sdk = await initialize({ sdkKey: 'test-key' });
      const status = sdk.getStatus();
      expect(new Date(status.timestamp).toISOString()).toBe(status.timestamp);
    });
  });

  describe('initialize', () => {
    it('calls ldInit with the provided SDK key and options', async () => {
      sdk = await initialize({ sdkKey: 'my-key', options: { timeout: 3000 } });
      expect(mockLdInit).toHaveBeenCalledWith('my-key', { timeout: 3000 });
    });

    it('passes stream: false to ldInit when isStreaming is false', async () => {
      sdk = await initialize({ sdkKey: 'test-key', isStreaming: false });
      expect(mockLdInit).toHaveBeenCalledWith('test-key', expect.objectContaining({ stream: false }));
    });

    it('passes pollInterval to ldInit when pollingFrequencySeconds is provided', async () => {
      sdk = await initialize({ sdkKey: 'test-key', isStreaming: false, pollingFrequencySeconds: 60 });
      expect(mockLdInit).toHaveBeenCalledWith(
        'test-key',
        expect.objectContaining({ stream: false, pollInterval: 60 }),
      );
    });

    it('merges isStreaming/pollingFrequencySeconds with other options', async () => {
      sdk = await initialize({ sdkKey: 'test-key', isStreaming: false, pollingFrequencySeconds: 30, options: { timeout: 5000 } });
      expect(mockLdInit).toHaveBeenCalledWith(
        'test-key',
        expect.objectContaining({ timeout: 5000, stream: false, pollInterval: 30 }),
      );
    });

    it('does not pass stream/pollInterval when not set', async () => {
      sdk = await initialize({ sdkKey: 'test-key' });
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
      sdk = await initialize({ sdkKey: 'test-key' });
      expect(callOrder).toEqual(['waitForInitialization', 'setProviderAndWait']);
    });

    it('adds telemetry hook by default', async () => {
      sdk = await initialize({ sdkKey: 'test-key' });
      expect(MockTelemetryHook).toHaveBeenCalled();
      expect(mockOpenFeature.addHooks).toHaveBeenCalledWith(expect.any(Object));
    });

    it('does not add telemetry hook when enableTelemetry is false', async () => {
      sdk = await initialize({ sdkKey: 'test-key', enableTelemetry: false });
      expect(MockTelemetryHook).not.toHaveBeenCalled();
      expect(mockOpenFeature.addHooks).not.toHaveBeenCalled();
    });

    it('wraps and rethrows errors with context', async () => {
      mockLdClient.waitForInitialization.mockRejectedValue(new Error('Connection refused'));
      await expect(initialize({ sdkKey: 'test-key' })).rejects.toThrow(
        'Failed to initialize feature flags SDK: Connection refused',
      );
    });
  });

  describe('shutdown', () => {
    it('calls clearProviders on OpenFeature', async () => {
      sdk = await initialize({ sdkKey: 'test-key' });
      await sdk.shutdown();
      sdk = null;
      expect(mockOpenFeature.clearProviders).toHaveBeenCalled();
    });

    it('closes the LD client', async () => {
      sdk = await initialize({ sdkKey: 'test-key' });
      await sdk.shutdown();
      sdk = null;
      expect(mockLdClient.close).toHaveBeenCalled();
    });

    it('warns when called a second time', async () => {
      sdk = await initialize({ sdkKey: 'test-key' });
      await sdk.shutdown();
      await sdk.shutdown();
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('not initialized'));
      sdk = null;
    });
  });

  describe('flag evaluation helpers', () => {
    const ctx = { targetingKey: 'user-1' };

    beforeEach(async () => {
      sdk = await initialize({ sdkKey: 'test-key' });
    });

    it('getBooleanValue calls client and returns value', async () => {
      mockClient.getBooleanValue.mockResolvedValue(true);
      const result = await sdk!.getBooleanValue('my-flag', false, ctx);
      expect(mockClient.getBooleanValue).toHaveBeenCalledWith('my-flag', false, ctx);
      expect(result).toBe(true);
    });

    it('getStringValue calls client and returns value', async () => {
      mockClient.getStringValue.mockResolvedValue('dark');
      const result = await sdk!.getStringValue('theme', 'light', ctx);
      expect(mockClient.getStringValue).toHaveBeenCalledWith('theme', 'light', ctx);
      expect(result).toBe('dark');
    });

    it('getNumberValue calls client and returns value', async () => {
      mockClient.getNumberValue.mockResolvedValue(42);
      const result = await sdk!.getNumberValue('limit', 0, ctx);
      expect(mockClient.getNumberValue).toHaveBeenCalledWith('limit', 0, ctx);
      expect(result).toBe(42);
    });

    it('getObjectValue calls client and returns value', async () => {
      const config = { timeout: 5000 };
      mockClient.getObjectValue.mockResolvedValue(config);
      const result = await sdk!.getObjectValue('config', {}, ctx);
      expect(mockClient.getObjectValue).toHaveBeenCalledWith('config', {}, ctx);
      expect(result).toEqual(config);
    });

    it('getBooleanDetails calls client and returns details', async () => {
      const details = { value: true, variant: '1', reason: 'TARGETING_MATCH', flagKey: 'my-flag', flagMetadata: {} };
      mockClient.getBooleanDetails.mockResolvedValue(details);
      const result = await sdk!.getBooleanDetails('my-flag', false, ctx);
      expect(mockClient.getBooleanDetails).toHaveBeenCalledWith('my-flag', false, ctx);
      expect(result).toEqual(details);
    });

    it('getStringDetails calls client and returns details', async () => {
      const details = { value: 'v2', variant: '1', reason: 'FALLTHROUGH', flagKey: 'version', flagMetadata: {} };
      mockClient.getStringDetails.mockResolvedValue(details);
      const result = await sdk!.getStringDetails('version', 'v1', ctx);
      expect(mockClient.getStringDetails).toHaveBeenCalledWith('version', 'v1', ctx);
      expect(result).toEqual(details);
    });

    it('getNumberDetails calls client and returns details', async () => {
      const details = { value: 10, variant: '0', reason: 'FALLTHROUGH', flagKey: 'limit', flagMetadata: {} };
      mockClient.getNumberDetails.mockResolvedValue(details);
      const result = await sdk!.getNumberDetails('limit', 0, ctx);
      expect(mockClient.getNumberDetails).toHaveBeenCalledWith('limit', 0, ctx);
      expect(result).toEqual(details);
    });

    it('getObjectDetails calls client and returns details', async () => {
      const details = { value: { x: 1 }, variant: '0', reason: 'FALLTHROUGH', flagKey: 'cfg', flagMetadata: {} };
      mockClient.getObjectDetails.mockResolvedValue(details);
      const result = await sdk!.getObjectDetails('cfg', {}, ctx);
      expect(mockClient.getObjectDetails).toHaveBeenCalledWith('cfg', {}, ctx);
      expect(result).toEqual(details);
    });

    it('works without a context argument', async () => {
      mockClient.getBooleanValue.mockResolvedValue(false);
      await sdk!.getBooleanValue('flag', false);
      expect(mockClient.getBooleanValue).toHaveBeenCalledWith('flag', false, undefined);
    });
  });

  describe('initializeGlobal', () => {
    it('uses the global OpenFeature domain', async () => {
      sdk = await initializeGlobal({ sdkKey: 'global-key' });
      expect(mockOpenFeature.setProviderAndWait).toHaveBeenCalledWith('global', expect.any(Object));
      expect(mockOpenFeature.getClient).toHaveBeenCalledWith('global');
    });

    it('returns a ready instance', async () => {
      sdk = await initializeGlobal({ sdkKey: 'global-key' });
      expect(sdk.isReady()).toBe(true);
    });

    it('does not call clearProviders on shutdown', async () => {
      sdk = await initializeGlobal({ sdkKey: 'global-key' });
      await sdk.shutdown();
      expect(mockOpenFeature.clearProviders).not.toHaveBeenCalled();
      sdk = null;
    });

    it('closes the LD client on shutdown', async () => {
      sdk = await initializeGlobal({ sdkKey: 'global-key' });
      await sdk.shutdown();
      expect(mockLdClient.close).toHaveBeenCalled();
      sdk = null;
    });

    it('can run alongside initialize without conflict', async () => {
      const globalSdk = await initializeGlobal({ sdkKey: 'global-key' });
      sdk = await initialize({ sdkKey: 'app-key' });

      expect(mockOpenFeature.setProviderAndWait).toHaveBeenCalledWith('global', expect.any(Object));
      expect(mockOpenFeature.setProviderAndWait).toHaveBeenCalledWith(expect.any(Object));
      expect(globalSdk.isReady()).toBe(true);
      expect(sdk.isReady()).toBe(true);

      await globalSdk.shutdown();
    });
  });
});
