import { OpenFeature } from '@openfeature/server-sdk';
import type { Provider } from '@openfeature/server-sdk';
import { LaunchDarklyProvider } from '@launchdarkly/openfeature-node-server';
import { init as ldInit } from 'launchdarkly-node-server-sdk';
import type { LDClient } from 'launchdarkly-node-server-sdk';
import { TelemetryHook } from './hooks/telemetry-hook';

export interface FeatureFlagsConfig {
  /** LaunchDarkly SDK key. Can also be set via LAUNCHDARKLY_SDK_KEY env variable */
  sdkKey?: string;
  /** Additional LaunchDarkly provider options */
  options?: Record<string, unknown>;
  /** Enable telemetry logging (default: true) */
  enableTelemetry?: boolean;
  /** Custom logger function */
  logger?: (message: string) => void;
  /** Options passed directly to TelemetryHook */
  telemetryOptions?: {
    logTimings?: boolean;
    logErrors?: boolean;
  };
}

export interface FeatureFlagsStatus {
  isInitialized: boolean;
  isReady: boolean;
  initializationTime: number | null;
  hasError: boolean;
  error: { message: string; name: string } | null;
  provider: { name: string; status: string } | null;
  timestamp: string;
}

interface SdkState {
  isInitialized: boolean;
  isReady: boolean;
  ldClient: LDClient | null;
  provider: Provider | null;
  initializationError: Error | null;
  initializationTime: number | null;
  sdkKey: string | null;
}

let sdkState: SdkState = {
  isInitialized: false,
  isReady: false,
  ldClient: null,
  provider: null,
  initializationError: null,
  initializationTime: null,
  sdkKey: null,
};

export async function initializeFeatureFlags(config: FeatureFlagsConfig = {}): Promise<void> {
  if (sdkState.isInitialized) {
    throw new Error('Feature flags SDK is already initialized');
  }

  const startTime = Date.now();

  try {
    const sdkKey = config.sdkKey || process.env['LAUNCHDARKLY_SDK_KEY'];

    if (!sdkKey) {
      throw new Error(
        'LaunchDarkly SDK key is required. Provide it via config.sdkKey or LAUNCHDARKLY_SDK_KEY environment variable',
      );
    }

    sdkState.sdkKey = sdkKey;

    const ldClient = ldInit(sdkKey, config.options);
    const provider = new LaunchDarklyProvider(ldClient);

    if (config.enableTelemetry !== false) {
      const telemetryHook = new TelemetryHook({
        logger: config.logger || console.log,
        ...config.telemetryOptions,
      });
      OpenFeature.addHooks(telemetryHook);
    }

    await OpenFeature.setProviderAndWait(provider as unknown as Provider);

    sdkState.ldClient = ldClient;
    sdkState.provider = provider as unknown as Provider;
    sdkState.isInitialized = true;
    sdkState.isReady = true;
    sdkState.initializationTime = Date.now() - startTime;
    sdkState.initializationError = null;

    if (config.logger) {
      config.logger(`Feature flags SDK initialized successfully in ${sdkState.initializationTime}ms`);
    }
  } catch (error) {
    sdkState.initializationError = error instanceof Error ? error : new Error(String(error));
    sdkState.isInitialized = false;
    sdkState.isReady = false;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to initialize feature flags SDK: ${message}`);
  }
}

export function isFeatureFlagsReady(): boolean {
  return sdkState.isReady;
}

export function getFeatureFlagsStatus(): FeatureFlagsStatus {
  return {
    isInitialized: sdkState.isInitialized,
    isReady: sdkState.isReady,
    initializationTime: sdkState.initializationTime,
    hasError: sdkState.initializationError !== null,
    error: sdkState.initializationError
      ? { message: sdkState.initializationError.message, name: sdkState.initializationError.name }
      : null,
    provider: sdkState.provider
      ? { name: 'LaunchDarkly', status: 'READY' }
      : null,
    timestamp: new Date().toISOString(),
  };
}

export async function shutdownFeatureFlags(): Promise<void> {
  if (!sdkState.isInitialized) {
    console.warn('Feature flags SDK is not initialized, nothing to shut down');
    return;
  }

  try {
    await OpenFeature.clearProviders();

    if (sdkState.ldClient) {
      sdkState.ldClient.close();
    }

    sdkState = {
      isInitialized: false,
      isReady: false,
      ldClient: null,
      provider: null,
      initializationError: null,
      initializationTime: null,
      sdkKey: null,
    };

    console.log('Feature flags SDK shut down successfully');
  } catch (error) {
    console.error('Error during feature flags shutdown:', error);
    throw error;
  }
}

export const openFeature = OpenFeature;
