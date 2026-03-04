import { OpenFeature } from '@openfeature/server-sdk';
import type { Provider, EvaluationContext, EvaluationDetails, JsonValue } from '@openfeature/server-sdk';
import { LaunchDarklyProvider } from '@launchdarkly/openfeature-node-server';
import { init as ldInit } from 'launchdarkly-node-server-sdk';
import type { LDClient } from 'launchdarkly-node-server-sdk';
import { TelemetryHook } from './hooks/telemetry-hook';

export interface FeatureFlagsConfig {
  /** LaunchDarkly SDK key */
  sdkKey: string;
  /** Use streaming connection (default: true). Set to false to use polling instead */
  isStreaming?: boolean;
  /** Polling interval in seconds when stream is false (default: 30) */
  pollingFrequencySeconds?: number;
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
  isStreaming: boolean;
}

let sdkState: SdkState = {
  isInitialized: false,
  isReady: false,
  ldClient: null,
  provider: null,
  initializationError: null,
  initializationTime: null,
  sdkKey: null,
  isStreaming: false,
};

export async function initializeFeatureFlags(config: FeatureFlagsConfig): Promise<void> {
  if (sdkState.isInitialized) {
    throw new Error('Feature flags SDK is already initialized');
  }

  const startTime = Date.now();

  try {
    sdkState.sdkKey = config.sdkKey;
    sdkState.isStreaming = config.isStreaming ?? true;

    const ldOptions = {
      ...config.options,
      ...(config.isStreaming !== undefined && { stream: config.isStreaming }),
      ...(config.pollingFrequencySeconds !== undefined && { pollInterval: config.pollingFrequencySeconds }),
    };
    const ldClient = ldInit(config.sdkKey, ldOptions);
    await ldClient.waitForInitialization();
    const provider = new LaunchDarklyProvider(ldClient);

    if (config.enableTelemetry !== false) {
      const telemetryHook = new TelemetryHook({
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
      isStreaming: false,
    };

    console.log('Feature flags SDK shut down successfully');
  } catch (error) {
    console.error('Error during feature flags shutdown:', error);
    throw error;
  }
}

export const openFeature = OpenFeature;

function requireClient() {
  if (!sdkState.isReady) {
    throw new Error('Feature flags SDK is not initialized. Call initializeFeatureFlags() first.');
  }
  return OpenFeature.getClient();
}

export async function getBooleanValue(
  flagKey: string,
  defaultValue: boolean,
  context?: EvaluationContext,
): Promise<boolean> {
  return requireClient().getBooleanValue(flagKey, defaultValue, context);
}

export async function getStringValue(
  flagKey: string,
  defaultValue: string,
  context?: EvaluationContext,
): Promise<string> {
  return requireClient().getStringValue(flagKey, defaultValue, context);
}

export async function getNumberValue(
  flagKey: string,
  defaultValue: number,
  context?: EvaluationContext,
): Promise<number> {
  return requireClient().getNumberValue(flagKey, defaultValue, context);
}

export async function getObjectValue<T extends JsonValue = JsonValue>(
  flagKey: string,
  defaultValue: T,
  context?: EvaluationContext,
): Promise<T> {
  return requireClient().getObjectValue(flagKey, defaultValue, context) as Promise<T>;
}

export async function getBooleanDetails(
  flagKey: string,
  defaultValue: boolean,
  context?: EvaluationContext,
): Promise<EvaluationDetails<boolean>> {
  return requireClient().getBooleanDetails(flagKey, defaultValue, context);
}

export async function getStringDetails(
  flagKey: string,
  defaultValue: string,
  context?: EvaluationContext,
): Promise<EvaluationDetails<string>> {
  return requireClient().getStringDetails(flagKey, defaultValue, context);
}

export async function getNumberDetails(
  flagKey: string,
  defaultValue: number,
  context?: EvaluationContext,
): Promise<EvaluationDetails<number>> {
  return requireClient().getNumberDetails(flagKey, defaultValue, context);
}

export async function getObjectDetails<T extends JsonValue = JsonValue>(
  flagKey: string,
  defaultValue: T,
  context?: EvaluationContext,
): Promise<EvaluationDetails<T>> {
  return requireClient().getObjectDetails(flagKey, defaultValue, context) as Promise<EvaluationDetails<T>>;
}
