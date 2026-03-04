import {
  initializeFeatureFlags,
  initializeGlobalClient,
  initializeAppClient,
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

// ─── helpers ────────────────────────────────────────────────────────────────

function makeLdClient() {
  return {
    waitForInitialization: jest.fn().mockResolvedValue(undefined),
    close: jest.fn(),
  };
}

function makeMockClient() {
  return {
    getBooleanValue: jest.fn().mockResolvedValue(false),
    getStringValue: jest.fn().mockResolvedValue(''),
    getNumberValue: jest.fn().mockResolvedValue(0),
    getObjectValue: jest.fn().mockResolvedValue({}),
    getBooleanDetails: jest.fn().mockResolvedValue({ value: false, flagKey: 'test', flagMetadata: {} }),
    getStringDetails: jest.fn().mockResolvedValue({ value: '', flagKey: 'test', flagMetadata: {} }),
    getNumberDetails: jest.fn().mockResolvedValue({ value: 0, flagKey: 'test', flagMetadata: {} }),
    getObjectDetails: jest.fn().mockResolvedValue({ value: {}, flagKey: 'test', flagMetadata: {} }),
  };
}

// ─── suite ──────────────────────────────────────────────────────────────────

describe('Feature Flags SDK', () => {
  let mockLdClient: ReturnType<typeof makeLdClient>;
  let mockClient: ReturnType<typeof makeMockClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    mockLdClient = makeLdClient();
    mockClient = makeMockClient();

    mockLdInit.mockReturnValue(mockLdClient);
    mockOpenFeature.setProviderAndWait.mockResolvedValue(undefined);
    mockOpenFeature.clearProviders.mockResolvedValue(undefined);
    mockOpenFeature.getClient.mockReturnValue(mockClient);
  });

  afterEach(async () => {
    await shutdownFeatureFlags('global');
    await shutdownFeatureFlags('app');
    jest.restoreAllMocks();
  });

  // ── isFeatureFlagsReady ──────────────────────────────────────────────────

  describe('isFeatureFlagsReady', () => {
    it('returns false before initialization', () => {
      expect(isFeatureFlagsReady()).toBe(false);
    });

    it('returns true after initializeGlobalClient', async () => {
      await initializeGlobalClient({ sdkKey: 'test-key' });
      expect(isFeatureFlagsReady('global')).toBe(true);
    });

    it('returns false after shutdown', async () => {
      await initializeGlobalClient({ sdkKey: 'test-key' });
      await shutdownFeatureFlags('global');
      expect(isFeatureFlagsReady('global')).toBe(false);
    });

    it('app client ready state is independent of global', async () => {
      await initializeGlobalClient({ sdkKey: 'global-key' });
      expect(isFeatureFlagsReady('app')).toBe(false);
      await initializeAppClient({ sdkKey: 'app-key' });
      expect(isFeatureFlagsReady('app')).toBe(true);
      expect(isFeatureFlagsReady('global')).toBe(true);
    });
  });

  // ── getFeatureFlagsStatus ────────────────────────────────────────────────

  describe('getFeatureFlagsStatus', () => {
    it('returns not-ready status before initialization', () => {
      const status = getFeatureFlagsStatus();
      expect(status.isInitialized).toBe(false);
      expect(status.isReady).toBe(false);
      expect(status.hasError).toBe(false);
      expect(status.provider).toBeNull();
      expect(status.initializationTime).toBeNull();
    });

    it('returns ready status after initializeGlobalClient', async () => {
      await initializeGlobalClient({ sdkKey: 'test-key' });
      const status = getFeatureFlagsStatus('global');
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

  // ── initializeGlobalClient / initializeFeatureFlags ─────────────────────

  describe('initializeGlobalClient', () => {
    it('throws if already initialized', async () => {
      await initializeGlobalClient({ sdkKey: 'test-key' });
      await expect(initializeGlobalClient({ sdkKey: 'test-key' })).rejects.toThrow(
        "Feature flags 'global' client is already initialized",
      );
    });

    it('calls ldInit with SDK key and options', async () => {
      await initializeGlobalClient({ sdkKey: 'my-key', options: { timeout: 3000 } });
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
      await initializeGlobalClient({ sdkKey: 'test-key' });
      expect(callOrder).toEqual(['waitForInitialization', 'setProviderAndWait']);
    });

    it('calls setProviderAndWait WITHOUT a domain for global client', async () => {
      await initializeGlobalClient({ sdkKey: 'test-key' });
      expect(mockOpenFeature.setProviderAndWait).toHaveBeenCalledWith(expect.any(Object));
      expect(mockOpenFeature.setProviderAndWait).not.toHaveBeenCalledWith(
        'global',
        expect.anything(),
      );
    });

    it('adds telemetry hook when enableTelemetry is not false', async () => {
      await initializeGlobalClient({ sdkKey: 'test-key' });
      expect(MockTelemetryHook).toHaveBeenCalled();
      expect(mockOpenFeature.addHooks).toHaveBeenCalledWith(expect.any(Object));
    });

    it('does not add telemetry hook when enableTelemetry is false', async () => {
      await initializeGlobalClient({ sdkKey: 'test-key', enableTelemetry: false });
      expect(MockTelemetryHook).not.toHaveBeenCalled();
      expect(mockOpenFeature.addHooks).not.toHaveBeenCalled();
    });

    it('wraps and rethrows errors', async () => {
      mockLdClient.waitForInitialization.mockRejectedValue(new Error('Connection refused'));
      await expect(initializeGlobalClient({ sdkKey: 'test-key' })).rejects.toThrow(
        'Failed to initialize feature flags SDK: Connection refused',
      );
    });

    it('records error state on failed init', async () => {
      mockLdClient.waitForInitialization.mockRejectedValue(new Error('timeout'));
      await expect(initializeGlobalClient({ sdkKey: 'test-key' })).rejects.toThrow();
      const status = getFeatureFlagsStatus('global');
      expect(status.isReady).toBe(false);
      expect(status.hasError).toBe(true);
      expect(status.error?.message).toBe('timeout');
    });

    it('initializeFeatureFlags is a backward-compat alias', async () => {
      await initializeFeatureFlags({ sdkKey: 'test-key' });
      expect(isFeatureFlagsReady('global')).toBe(true);
    });
  });

  // ── initializeAppClient ──────────────────────────────────────────────────

  describe('initializeAppClient', () => {
    it('initializes independently from global', async () => {
      await initializeAppClient({ sdkKey: 'app-key' });
      expect(isFeatureFlagsReady('app')).toBe(true);
      expect(isFeatureFlagsReady('global')).toBe(false);
    });

    it('calls setProviderAndWait WITH "app" domain', async () => {
      await initializeAppClient({ sdkKey: 'app-key' });
      expect(mockOpenFeature.setProviderAndWait).toHaveBeenCalledWith('app', expect.any(Object));
    });

    it('throws if app client already initialized', async () => {
      await initializeAppClient({ sdkKey: 'app-key' });
      await expect(initializeAppClient({ sdkKey: 'app-key' })).rejects.toThrow(
        "Feature flags 'app' client is already initialized",
      );
    });

    it('both clients can run simultaneously', async () => {
      const globalLd = makeLdClient();
      const appLd = makeLdClient();
      mockLdInit.mockReturnValueOnce(globalLd).mockReturnValueOnce(appLd);

      await initializeGlobalClient({ sdkKey: 'global-key' });
      await initializeAppClient({ sdkKey: 'app-key' });

      expect(isFeatureFlagsReady('global')).toBe(true);
      expect(isFeatureFlagsReady('app')).toBe(true);
      expect(mockLdInit).toHaveBeenCalledTimes(2);
    });
  });

  // ── shutdownFeatureFlags ─────────────────────────────────────────────────

  describe('shutdownFeatureFlags', () => {
    it('warns when global client is not initialized', async () => {
      await shutdownFeatureFlags('global');
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("'global' client is not initialized"),
      );
    });

    it('warns when app client is not initialized', async () => {
      await shutdownFeatureFlags('app');
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("'app' client is not initialized"),
      );
    });

    it('calls clearProviders when shutting down global', async () => {
      await initializeGlobalClient({ sdkKey: 'test-key' });
      await shutdownFeatureFlags('global');
      expect(mockOpenFeature.clearProviders).toHaveBeenCalled();
    });

    it('does NOT call clearProviders when shutting down app', async () => {
      await initializeAppClient({ sdkKey: 'app-key' });
      await shutdownFeatureFlags('app');
      expect(mockOpenFeature.clearProviders).not.toHaveBeenCalled();
    });

    it('closes the LD client on shutdown', async () => {
      await initializeGlobalClient({ sdkKey: 'test-key' });
      await shutdownFeatureFlags('global');
      expect(mockLdClient.close).toHaveBeenCalled();
    });

    it('shutting down app does not affect global', async () => {
      const globalLd = makeLdClient();
      const appLd = makeLdClient();
      mockLdInit.mockReturnValueOnce(globalLd).mockReturnValueOnce(appLd);

      await initializeGlobalClient({ sdkKey: 'global-key' });
      await initializeAppClient({ sdkKey: 'app-key' });
      await shutdownFeatureFlags('app');

      expect(isFeatureFlagsReady('app')).toBe(false);
      expect(isFeatureFlagsReady('global')).toBe(true);
      expect(appLd.close).toHaveBeenCalled();
      expect(globalLd.close).not.toHaveBeenCalled();
    });

    it('resets state after shutdown', async () => {
      await initializeGlobalClient({ sdkKey: 'test-key' });
      await shutdownFeatureFlags('global');
      const status = getFeatureFlagsStatus('global');
      expect(status.isInitialized).toBe(false);
      expect(status.isReady).toBe(false);
      expect(status.provider).toBeNull();
    });
  });

  // ── flag evaluation helpers ──────────────────────────────────────────────

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

    describe('global client', () => {
      const ctx = { targetingKey: 'user-1' };

      beforeEach(async () => {
        await initializeGlobalClient({ sdkKey: 'test-key' });
      });

      it('getBooleanValue routes to global OpenFeature client', async () => {
        mockClient.getBooleanValue.mockResolvedValue(true);
        expect(await getBooleanValue('my-flag', false, ctx, 'global')).toBe(true);
        expect(mockOpenFeature.getClient).toHaveBeenCalledWith(/* no args — default domain */);
        expect(mockClient.getBooleanValue).toHaveBeenCalledWith('my-flag', false, ctx);
      });

      it('getStringValue calls client and returns value', async () => {
        mockClient.getStringValue.mockResolvedValue('dark');
        expect(await getStringValue('theme', 'light', ctx, 'global')).toBe('dark');
        expect(mockClient.getStringValue).toHaveBeenCalledWith('theme', 'light', ctx);
      });

      it('getNumberValue calls client and returns value', async () => {
        mockClient.getNumberValue.mockResolvedValue(42);
        expect(await getNumberValue('limit', 0, ctx, 'global')).toBe(42);
      });

      it('getObjectValue calls client and returns value', async () => {
        const config = { timeout: 5000 };
        mockClient.getObjectValue.mockResolvedValue(config);
        expect(await getObjectValue('config', {}, ctx, 'global')).toEqual(config);
      });

      it('getBooleanDetails returns full details', async () => {
        const details = { value: true, variant: '1', reason: 'TARGETING_MATCH', flagKey: 'my-flag', flagMetadata: {} };
        mockClient.getBooleanDetails.mockResolvedValue(details);
        expect(await getBooleanDetails('my-flag', false, ctx, 'global')).toEqual(details);
      });

      it('getStringDetails returns full details', async () => {
        const details = { value: 'v2', variant: '1', reason: 'FALLTHROUGH', flagKey: 'version', flagMetadata: {} };
        mockClient.getStringDetails.mockResolvedValue(details);
        expect(await getStringDetails('version', 'v1', ctx, 'global')).toEqual(details);
      });

      it('getNumberDetails returns full details', async () => {
        const details = { value: 10, variant: '0', reason: 'FALLTHROUGH', flagKey: 'limit', flagMetadata: {} };
        mockClient.getNumberDetails.mockResolvedValue(details);
        expect(await getNumberDetails('limit', 0, ctx, 'global')).toEqual(details);
      });

      it('getObjectDetails returns full details', async () => {
        const details = { value: { x: 1 }, variant: '0', reason: 'FALLTHROUGH', flagKey: 'cfg', flagMetadata: {} };
        mockClient.getObjectDetails.mockResolvedValue(details);
        expect(await getObjectDetails('cfg', {}, ctx, 'global')).toEqual(details);
      });
    });

    describe('app client', () => {
      const ctx = { targetingKey: 'user-1' };
      let appMockClient: ReturnType<typeof makeMockClient>;

      beforeEach(async () => {
        appMockClient = makeMockClient();
        // getClient() with no args → global, getClient('app') → app
        mockOpenFeature.getClient.mockImplementation((domain?: string) =>
          domain === 'app' ? appMockClient : mockClient,
        );
        await initializeAppClient({ sdkKey: 'app-key' });
      });

      it('getBooleanValue routes to app OpenFeature client', async () => {
        appMockClient.getBooleanValue.mockResolvedValue(true);
        const result = await getBooleanValue('flag', false, ctx, 'app');
        expect(mockOpenFeature.getClient).toHaveBeenCalledWith('app');
        expect(appMockClient.getBooleanValue).toHaveBeenCalledWith('flag', false, ctx);
        expect(result).toBe(true);
      });

      it('omitting client defaults to app', async () => {
        appMockClient.getBooleanValue.mockResolvedValue(true);
        const result = await getBooleanValue('flag', false, ctx);
        expect(mockOpenFeature.getClient).toHaveBeenCalledWith('app');
        expect(result).toBe(true);
      });

      it('works without a context argument', async () => {
        await getBooleanValue('flag', false);
        expect(mockClient.getBooleanValue ?? appMockClient.getBooleanValue).toBeDefined();
        expect(appMockClient.getBooleanValue).toHaveBeenCalledWith('flag', false, undefined);
      });

      it('app and global can evaluate the same flag independently', async () => {
        const globalLd = makeLdClient();
        const appLd = makeLdClient();
        mockLdInit.mockReturnValueOnce(globalLd).mockReturnValueOnce(appLd);

        await initializeGlobalClient({ sdkKey: 'global-key' });

        mockClient.getBooleanValue.mockResolvedValue(false);
        appMockClient.getBooleanValue.mockResolvedValue(true);

        const globalResult = await getBooleanValue('flag', false, ctx, 'global');
        const appResult = await getBooleanValue('flag', false, ctx, 'app');

        expect(globalResult).toBe(false);
        expect(appResult).toBe(true);
      });
    });
  });
});
