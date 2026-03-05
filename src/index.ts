import { OpenFeature } from '@openfeature/server-sdk';
import type { Provider, EvaluationContext, EvaluationDetails, JsonValue, Client } from '@openfeature/server-sdk';
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

export interface FeatureFlagClient {
  getBooleanValue(flagKey: string, defaultValue: boolean, context?: EvaluationContext): Promise<boolean>;
  getStringValue(flagKey: string, defaultValue: string, context?: EvaluationContext): Promise<string>;
  getNumberValue(flagKey: string, defaultValue: number, context?: EvaluationContext): Promise<number>;
  getObjectValue<T extends JsonValue = JsonValue>(flagKey: string, defaultValue: T, context?: EvaluationContext): Promise<T>;
  getBooleanDetails(flagKey: string, defaultValue: boolean, context?: EvaluationContext): Promise<EvaluationDetails<boolean>>;
  getStringDetails(flagKey: string, defaultValue: string, context?: EvaluationContext): Promise<EvaluationDetails<string>>;
  getNumberDetails(flagKey: string, defaultValue: number, context?: EvaluationContext): Promise<EvaluationDetails<number>>;
  getObjectDetails<T extends JsonValue = JsonValue>(flagKey: string, defaultValue: T, context?: EvaluationContext): Promise<EvaluationDetails<T>>;
  isReady(): boolean;
  getStatus(): FeatureFlagsStatus;
  shutdown(): Promise<void>;
}

interface SdkState {
  isInitialized: boolean;
  isReady: boolean;
  ldClient: LDClient | null;
  provider: Provider | null;
  initializationError: Error | null;
  initializationTime: number | null;
}

let globalState: SdkState = {
  isInitialized: false,
  isReady: false,
  ldClient: null,
  provider: null,
  initializationError: null,
  initializationTime: null,
};

function buildLdOptions(config: FeatureFlagsConfig): Record<string, unknown> {
  return {
    ...config.options,
    ...(config.isStreaming !== undefined && { stream: config.isStreaming }),
    ...(config.pollingFrequencySeconds !== undefined && { pollInterval: config.pollingFrequencySeconds }),
  };
}

function wrapClient(
  ofClient: Client,
  getStatus: () => FeatureFlagsStatus,
  onShutdown: () => Promise<void>,
): FeatureFlagClient {
  return {
    getBooleanValue: (flagKey, defaultValue, context) => ofClient.getBooleanValue(flagKey, defaultValue, context),
    getStringValue: (flagKey, defaultValue, context) => ofClient.getStringValue(flagKey, defaultValue, context),
    getNumberValue: (flagKey, defaultValue, context) => ofClient.getNumberValue(flagKey, defaultValue, context),
    getObjectValue: <T extends JsonValue = JsonValue>(flagKey: string, defaultValue: T, context?: EvaluationContext) =>
      ofClient.getObjectValue(flagKey, defaultValue, context) as Promise<T>,
    getBooleanDetails: (flagKey, defaultValue, context) => ofClient.getBooleanDetails(flagKey, defaultValue, context),
    getStringDetails: (flagKey, defaultValue, context) => ofClient.getStringDetails(flagKey, defaultValue, context),
    getNumberDetails: (flagKey, defaultValue, context) => ofClient.getNumberDetails(flagKey, defaultValue, context),
    getObjectDetails: <T extends JsonValue = JsonValue>(flagKey: string, defaultValue: T, context?: EvaluationContext) =>
      ofClient.getObjectDetails(flagKey, defaultValue, context) as Promise<EvaluationDetails<T>>,
    isReady: () => getStatus().isReady,
    getStatus,
    shutdown: onShutdown,
  };
}

async function initLdAndProvider(config: FeatureFlagsConfig): Promise<{ ldClient: LDClient; provider: Provider }> {
  const ldOptions = buildLdOptions(config);
  const ldClient = ldInit(config.sdkKey, ldOptions);
  await ldClient.waitForInitialization();
  const provider = new LaunchDarklyProvider(ldClient) as unknown as Provider;

  if (config.enableTelemetry !== false) {
    OpenFeature.addHooks(new TelemetryHook({ ...config.telemetryOptions }));
  }

  return { ldClient, provider };
}

export async function initialize(config: FeatureFlagsConfig): Promise<FeatureFlagClient> {
  const domain = 'app';
  const startTime = Date.now();
  const state: SdkState = {
    isInitialized: false,
    isReady: false,
    ldClient: null,
    provider: null,
    initializationError: null,
    initializationTime: null,
  };

  try {
    const { ldClient, provider } = await initLdAndProvider(config);
    await OpenFeature.setProviderAndWait(domain, provider);

    state.ldClient = ldClient;
    state.provider = provider;
    state.isInitialized = true;
    state.isReady = true;
    state.initializationTime = Date.now() - startTime;

    return wrapClient(
      OpenFeature.getClient(domain),
      () => ({
        isInitialized: state.isInitialized,
        isReady: state.isReady,
        initializationTime: state.initializationTime,
        hasError: state.initializationError !== null,
        error: state.initializationError
          ? { message: state.initializationError.message, name: state.initializationError.name }
          : null,
        provider: state.provider ? { name: 'LaunchDarkly', status: 'READY' } : null,
        timestamp: new Date().toISOString(),
      }),
      async () => {
        if (state.ldClient) {
          state.ldClient.close();
        }
        state.isInitialized = false;
        state.isReady = false;
        state.ldClient = null;
        state.provider = null;
      },
    );
  } catch (error) {
    state.initializationError = error instanceof Error ? error : new Error(String(error));
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to initialize feature flags SDK: ${message}`);
  }
}

export async function initializeGlobal(config: FeatureFlagsConfig): Promise<FeatureFlagClient> {
  if (globalState.isInitialized) {
    throw new Error('Global feature flags SDK is already initialized');
  }

  const startTime = Date.now();

  try {
    const { ldClient, provider } = await initLdAndProvider(config);
    await OpenFeature.setProviderAndWait(provider);

    globalState.ldClient = ldClient;
    globalState.provider = provider;
    globalState.isInitialized = true;
    globalState.isReady = true;
    globalState.initializationTime = Date.now() - startTime;
    globalState.initializationError = null;

    return wrapClient(
      OpenFeature.getClient(),
      () => ({
        isInitialized: globalState.isInitialized,
        isReady: globalState.isReady,
        initializationTime: globalState.initializationTime,
        hasError: globalState.initializationError !== null,
        error: globalState.initializationError
          ? { message: globalState.initializationError.message, name: globalState.initializationError.name }
          : null,
        provider: globalState.provider ? { name: 'LaunchDarkly', status: 'READY' } : null,
        timestamp: new Date().toISOString(),
      }),
      async () => {
        await OpenFeature.clearProviders();
        if (globalState.ldClient) {
          globalState.ldClient.close();
        }
        globalState = {
          isInitialized: false,
          isReady: false,
          ldClient: null,
          provider: null,
          initializationError: null,
          initializationTime: null,
        };
      },
    );
  } catch (error) {
    globalState.initializationError = error instanceof Error ? error : new Error(String(error));
    globalState.isInitialized = false;
    globalState.isReady = false;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to initialize feature flags SDK: ${message}`);
  }
}
