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
  /** Polling interval in seconds when isStreaming is false */
  pollingFrequencySeconds?: number;
  /** Additional LaunchDarkly options */
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

export interface FeatureFlagsInstance {
  isReady(): boolean;
  getStatus(): FeatureFlagsStatus;
  shutdown(): Promise<void>;
  getBooleanValue(flagKey: string, defaultValue: boolean, context?: EvaluationContext): Promise<boolean>;
  getStringValue(flagKey: string, defaultValue: string, context?: EvaluationContext): Promise<string>;
  getNumberValue(flagKey: string, defaultValue: number, context?: EvaluationContext): Promise<number>;
  getObjectValue<T extends JsonValue = JsonValue>(flagKey: string, defaultValue: T, context?: EvaluationContext): Promise<T>;
  getBooleanDetails(flagKey: string, defaultValue: boolean, context?: EvaluationContext): Promise<EvaluationDetails<boolean>>;
  getStringDetails(flagKey: string, defaultValue: string, context?: EvaluationContext): Promise<EvaluationDetails<string>>;
  getNumberDetails(flagKey: string, defaultValue: number, context?: EvaluationContext): Promise<EvaluationDetails<number>>;
  getObjectDetails<T extends JsonValue = JsonValue>(flagKey: string, defaultValue: T, context?: EvaluationContext): Promise<EvaluationDetails<T>>;
}

export async function initialize(config: FeatureFlagsConfig): Promise<FeatureFlagsInstance> {
  const startTime = Date.now();

  let isInitialized = false;
  let isReady = false;
  let ldClientRef: LDClient | null = null;
  let providerRef: Provider | null = null;
  let initializationTime: number | null = null;

  try {
    const ldOptions = {
      ...config.options,
      ...(config.isStreaming !== undefined && { stream: config.isStreaming }),
      ...(config.pollingFrequencySeconds !== undefined && { pollInterval: config.pollingFrequencySeconds }),
    };
    const ldClient = ldInit(config.sdkKey, ldOptions);
    await ldClient.waitForInitialization();
    const provider = new LaunchDarklyProvider(ldClient);

    if (config.enableTelemetry !== false) {
      OpenFeature.addHooks(new TelemetryHook({ ...config.telemetryOptions }));
    }

    await OpenFeature.setProviderAndWait(provider as unknown as Provider);
    const client = OpenFeature.getClient();

    ldClientRef = ldClient;
    providerRef = provider as unknown as Provider;
    isInitialized = true;
    isReady = true;
    initializationTime = Date.now() - startTime;

    return {
      isReady: () => isReady,

      getStatus: () => ({
        isInitialized,
        isReady,
        initializationTime,
        hasError: false,
        error: null,
        provider: providerRef ? { name: 'LaunchDarkly', status: 'READY' } : null,
        timestamp: new Date().toISOString(),
      }),

      shutdown: async () => {
        if (!isInitialized) {
          console.warn('Feature flags SDK is not initialized, nothing to shut down');
          return;
        }
        try {
          await OpenFeature.clearProviders();
          if (ldClientRef) ldClientRef.close();
          isInitialized = false;
          isReady = false;
          ldClientRef = null;
          providerRef = null;
          console.log('Feature flags SDK shut down successfully');
        } catch (error) {
          console.error('Error during feature flags shutdown:', error);
          throw error;
        }
      },

      getBooleanValue: (flagKey, defaultValue, context) =>
        client.getBooleanValue(flagKey, defaultValue, context),

      getStringValue: (flagKey, defaultValue, context) =>
        client.getStringValue(flagKey, defaultValue, context),

      getNumberValue: (flagKey, defaultValue, context) =>
        client.getNumberValue(flagKey, defaultValue, context),

      getObjectValue: <T extends JsonValue = JsonValue>(flagKey: string, defaultValue: T, context?: EvaluationContext) =>
        client.getObjectValue(flagKey, defaultValue, context) as Promise<T>,

      getBooleanDetails: (flagKey, defaultValue, context) =>
        client.getBooleanDetails(flagKey, defaultValue, context),

      getStringDetails: (flagKey, defaultValue, context) =>
        client.getStringDetails(flagKey, defaultValue, context),

      getNumberDetails: (flagKey, defaultValue, context) =>
        client.getNumberDetails(flagKey, defaultValue, context),

      getObjectDetails: <T extends JsonValue = JsonValue>(flagKey: string, defaultValue: T, context?: EvaluationContext) =>
        client.getObjectDetails(flagKey, defaultValue, context) as Promise<EvaluationDetails<T>>,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to initialize feature flags SDK: ${message}`);
  }
}

export const openFeature = OpenFeature;
