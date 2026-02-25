import { OpenFeature as OpenFeatureAPI, Client, EvaluationContext } from '@openfeature/server-sdk';

/**
 * Configuration for initializing the feature flags SDK
 */
export interface FeatureFlagsConfig {
  /**
   * LaunchDarkly SDK key
   * Can also be set via LAUNCHDARKLY_SDK_KEY environment variable
   */
  sdkKey?: string;

  /**
   * Additional LaunchDarkly provider options
   */
  options?: Record<string, any>;

  /**
   * Enable telemetry logging (default: true)
   */
  enableTelemetry?: boolean;

  /**
   * Custom logger function
   */
  logger?: (message: string) => void;
}

/**
 * Status object returned by getFeatureFlagsStatus()
 */
export interface FeatureFlagsStatus {
  /**
   * Whether the SDK has been initialized
   */
  isInitialized: boolean;

  /**
   * Whether the SDK is ready for flag evaluations
   */
  isReady: boolean;

  /**
   * Time taken to initialize in milliseconds
   */
  initializationTime: number | null;

  /**
   * Whether an error occurred during initialization
   */
  hasError: boolean;

  /**
   * Error details if initialization failed
   */
  error: {
    message: string;
    name: string;
  } | null;

  /**
   * Provider information
   */
  provider: {
    name: string;
    status: string;
  } | null;

  /**
   * ISO timestamp of when status was retrieved
   */
  timestamp: string;
}

/**
 * Initialize the feature flag system at application startup
 * @param config - Configuration object
 * @returns Promise that resolves when initialization is complete
 */
export function initializeFeatureFlags(config?: FeatureFlagsConfig): Promise<void>;

/**
 * Check if feature flags system is ready
 * Lightweight readiness signal for health endpoints and runtime checks
 * @returns true if ready, false otherwise
 */
export function isFeatureFlagsReady(): boolean;

/**
 * Get structured status object for operational diagnostics
 * @returns Detailed status information
 */
export function getFeatureFlagsStatus(): FeatureFlagsStatus;

/**
 * Gracefully shutdown the feature flags system
 * Release resources during application shutdown
 * @returns Promise that resolves when shutdown is complete
 */
export function shutdownFeatureFlags(): Promise<void>;

/**
 * OpenFeature instance for direct API access
 * Use openFeature.getClient() to get a client for flag evaluations
 *
 * @example
 * const client = openFeature.getClient();
 * const boolValue = await client.getBooleanValue('my-flag', false, context);
 * const stringValue = await client.getStringValue('my-string-flag', 'default', context);
 */
export const openFeature: typeof OpenFeatureAPI;
