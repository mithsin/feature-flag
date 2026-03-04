import { OpenFeature } from '@openfeature/server-sdk';
import type { Provider, EvaluationContext, EvaluationDetails, JsonValue } from '@openfeature/server-sdk';
import { LaunchDarklyProvider } from '@launchdarkly/openfeature-node-server';
import { init as ldInit } from 'launchdarkly-node-server-sdk';
import type { LDClient } from 'launchdarkly-node-server-sdk';
import { TelemetryHook } from './hooks/telemetry-hook';

export type FeatureFlagsClient = 'global' | 'app';

export interface FeatureFlagsConfig {
  /** Which client instance to initialize (default: 'app') */
  client?: FeatureFlagsClient;
  /** LaunchDarkly SDK key */
  sdkKey: string;
  /** Additional LaunchDarkly provider options */
  options?: Record<string, unknown>;
  /** Enable telemetry logging (default: true) */
  enableTelemetry?: boolean;
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

const sdkInstances = new Map<FeatureFlagsClient, SdkState>();

async function _initializeClient(config: FeatureFlagsConfig): Promise<void> {
  const { client = 'app' } = config;
  if (sdkInstances.get(client)?.isInitialized) {
    throw new Error(`Feature flags '${client}' client is already initialized`);
  }

  const startTime = Date.now();
  const state: SdkState = {
    isInitialized: false,
    isReady: false,
    ldClient: null,
    provider: null,
    initializationError: null,
    initializationTime: null,
    sdkKey: null,
  };

  try {
    const { sdkKey } = config;
    state.sdkKey = sdkKey;

    const ldClient = ldInit(sdkKey, config.options);
    await ldClient.waitForInitialization();
    const provider = new LaunchDarklyProvider(ldClient);

    if (config.enableTelemetry !== false) {
      const telemetryHook = new TelemetryHook({
        ...config.telemetryOptions,
      });
      OpenFeature.addHooks(telemetryHook);
    }

    if (client === 'global') {
      await OpenFeature.setProviderAndWait(provider as unknown as Provider);
    } else {
      await OpenFeature.setProviderAndWait(client, provider as unknown as Provider);
    }

    state.ldClient = ldClient;
    state.provider = provider as unknown as Provider;
    state.isInitialized = true;
    state.isReady = true;
    state.initializationTime = Date.now() - startTime;
    state.initializationError = null;

    sdkInstances.set(client, state);

  } catch (error) {
    state.initializationError = error instanceof Error ? error : new Error(String(error));
    state.isInitialized = false;
    state.isReady = false;
    sdkInstances.set(client, state);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to initialize feature flags SDK: ${message}`);
  }
}

export async function initializeGlobalClient(
  config: Omit<FeatureFlagsConfig, 'client'>,
): Promise<void> {
  return _initializeClient({ ...config, client: 'global' });
}

export async function initializeAppClient(
  config: Omit<FeatureFlagsConfig, 'client'>,
): Promise<void> {
  return _initializeClient({ ...config, client: 'app' });
}

/** @deprecated Use initializeGlobalClient instead */
export async function initializeFeatureFlags(
  config: Omit<FeatureFlagsConfig, 'client'>,
): Promise<void> {
  return initializeGlobalClient(config);
}

export function isFeatureFlagsReady(client: FeatureFlagsClient = 'app'): boolean {
  return sdkInstances.get(client)?.isReady ?? false;
}

export function getFeatureFlagsStatus(client: FeatureFlagsClient = 'app'): FeatureFlagsStatus {
  const state = sdkInstances.get(client);
  if (!state) {
    return {
      isInitialized: false,
      isReady: false,
      initializationTime: null,
      hasError: false,
      error: null,
      provider: null,
      timestamp: new Date().toISOString(),
    };
  }
  return {
    isInitialized: state.isInitialized,
    isReady: state.isReady,
    initializationTime: state.initializationTime,
    hasError: state.initializationError !== null,
    error: state.initializationError
      ? { message: state.initializationError.message, name: state.initializationError.name }
      : null,
    provider: state.provider ? { name: 'LaunchDarkly', status: 'READY' } : null,
    timestamp: new Date().toISOString(),
  };
}

export async function shutdownFeatureFlags(client: FeatureFlagsClient = 'app'): Promise<void> {
  const state = sdkInstances.get(client);
  if (!state?.isInitialized) {
    console.warn(`Feature flags '${client}' client is not initialized, nothing to shut down`);
    return;
  }

  try {
    // clearProviders() clears all OpenFeature domains — only call it when shutting down global
    if (client === 'global') {
      await OpenFeature.clearProviders();
    }

    if (state.ldClient) {
      state.ldClient.close();
    }

    sdkInstances.delete(client);
    console.log('Feature flags SDK shut down successfully');
  } catch (error) {
    console.error('Error during feature flags shutdown:', error);
    throw error;
  }
}

export const openFeature = OpenFeature;

function requireClient(client: FeatureFlagsClient = 'app') {
  const instance = sdkInstances.get(client);
  if (!instance?.isReady) {
    throw new Error('Feature flags SDK is not initialized. Call initializeFeatureFlags() first.');
  }
  return client === 'global' ? OpenFeature.getClient() : OpenFeature.getClient(client);
}

export async function getBooleanValue(
  flagKey: string,
  defaultValue: boolean,
  context?: EvaluationContext,
  client?: FeatureFlagsClient,
): Promise<boolean> {
  return requireClient(client).getBooleanValue(flagKey, defaultValue, context);
}

export async function getStringValue(
  flagKey: string,
  defaultValue: string,
  context?: EvaluationContext,
  client?: FeatureFlagsClient,
): Promise<string> {
  return requireClient(client).getStringValue(flagKey, defaultValue, context);
}

export async function getNumberValue(
  flagKey: string,
  defaultValue: number,
  context?: EvaluationContext,
  client?: FeatureFlagsClient,
): Promise<number> {
  return requireClient(client).getNumberValue(flagKey, defaultValue, context);
}

export async function getObjectValue<T extends JsonValue = JsonValue>(
  flagKey: string,
  defaultValue: T,
  context?: EvaluationContext,
  client?: FeatureFlagsClient,
): Promise<T> {
  return requireClient(client).getObjectValue(flagKey, defaultValue, context) as Promise<T>;
}

export async function getBooleanDetails(
  flagKey: string,
  defaultValue: boolean,
  context?: EvaluationContext,
  client?: FeatureFlagsClient,
): Promise<EvaluationDetails<boolean>> {
  return requireClient(client).getBooleanDetails(flagKey, defaultValue, context);
}

export async function getStringDetails(
  flagKey: string,
  defaultValue: string,
  context?: EvaluationContext,
  client?: FeatureFlagsClient,
): Promise<EvaluationDetails<string>> {
  return requireClient(client).getStringDetails(flagKey, defaultValue, context);
}

export async function getNumberDetails(
  flagKey: string,
  defaultValue: number,
  context?: EvaluationContext,
  client?: FeatureFlagsClient,
): Promise<EvaluationDetails<number>> {
  return requireClient(client).getNumberDetails(flagKey, defaultValue, context);
}

export async function getObjectDetails<T extends JsonValue = JsonValue>(
  flagKey: string,
  defaultValue: T,
  context?: EvaluationContext,
  client?: FeatureFlagsClient,
): Promise<EvaluationDetails<T>> {
  return requireClient(client).getObjectDetails(flagKey, defaultValue, context) as Promise<EvaluationDetails<T>>;
}
