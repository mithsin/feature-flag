const { OpenFeature } = require('@openfeature/server-sdk');
const { LaunchDarklyProvider } = require('@launchdarkly/openfeature-node-server');
const { TelemetryHook } = require('./hooks/telemetry-hook');

/**
 * SDK State Management
 */
let sdkState = {
  isInitialized: false,
  isReady: false,
  provider: null,
  initializationError: null,
  initializationTime: null,
  sdkKey: null
};

/**
 * Initialize the feature flag system
 * @param {Object} config - Configuration object
 * @param {string} config.sdkKey - LaunchDarkly SDK key (can be from env variable)
 * @param {Object} config.options - Additional LaunchDarkly options
 * @param {boolean} config.enableTelemetry - Enable telemetry logging (default: true)
 * @param {Function} config.logger - Custom logger function
 * @returns {Promise<void>}
 */
async function initializeFeatureFlags(config = {}) {
  if (sdkState.isInitialized) {
    throw new Error('Feature flags SDK is already initialized');
  }

  const startTime = Date.now();

  try {
    // Get SDK key from config or environment variable
    const sdkKey = config.sdkKey || process.env.LAUNCHDARKLY_SDK_KEY;

    if (!sdkKey) {
      throw new Error('LaunchDarkly SDK key is required. Provide it via config.sdkKey or LAUNCHDARKLY_SDK_KEY environment variable');
    }

    sdkState.sdkKey = sdkKey;

    // Create LaunchDarkly provider with options
    const providerOptions = config.options || {};
    const provider = new LaunchDarklyProvider(sdkKey, providerOptions);

    // Add telemetry hook if enabled (default: true)
    if (config.enableTelemetry !== false) {
      const telemetryHook = new TelemetryHook({
        logger: config.logger || console.log
      });
      OpenFeature.addHooks(telemetryHook);
    }

    // Set the provider
    await OpenFeature.setProviderAndWait(provider);

    sdkState.provider = provider;
    sdkState.isInitialized = true;
    sdkState.isReady = true;
    sdkState.initializationTime = Date.now() - startTime;
    sdkState.initializationError = null;

    if (config.logger) {
      config.logger(`Feature flags SDK initialized successfully in ${sdkState.initializationTime}ms`);
    }
  } catch (error) {
    sdkState.initializationError = error;
    sdkState.isInitialized = false;
    sdkState.isReady = false;
    throw new Error(`Failed to initialize feature flags SDK: ${error.message}`);
  }
}

/**
 * Check if feature flags system is ready
 * Lightweight readiness signal for health endpoints
 * @returns {boolean}
 */
function isFeatureFlagsReady() {
  return sdkState.isReady;
}

/**
 * Get detailed status of feature flags system
 * Structured status object for operational diagnostics
 * @returns {Object} Status object with detailed information
 */
function getFeatureFlagsStatus() {
  return {
    isInitialized: sdkState.isInitialized,
    isReady: sdkState.isReady,
    initializationTime: sdkState.initializationTime,
    hasError: sdkState.initializationError !== null,
    error: sdkState.initializationError ? {
      message: sdkState.initializationError.message,
      name: sdkState.initializationError.name
    } : null,
    provider: sdkState.provider ? {
      name: 'LaunchDarkly',
      status: sdkState.provider.status || 'READY'
    } : null,
    timestamp: new Date().toISOString()
  };
}

/**
 * Gracefully shutdown feature flags system
 * Release resources during application shutdown
 * @returns {Promise<void>}
 */
async function shutdownFeatureFlags() {
  if (!sdkState.isInitialized) {
    console.warn('Feature flags SDK is not initialized, nothing to shut down');
    return;
  }

  try {
    // Clear the provider
    await OpenFeature.clearProviders();

    // Close the LaunchDarkly client if it has a close method
    if (sdkState.provider && typeof sdkState.provider.close === 'function') {
      await sdkState.provider.close();
    }

    // Reset state
    sdkState = {
      isInitialized: false,
      isReady: false,
      provider: null,
      initializationError: null,
      initializationTime: null,
      sdkKey: null
    };

    console.log('Feature flags SDK shut down successfully');
  } catch (error) {
    console.error('Error during feature flags shutdown:', error);
    throw error;
  }
}

/**
 * Export OpenFeature instance for direct access
 * Allows users to call openFeature.getClient() and use all OpenFeature APIs
 */
const openFeature = OpenFeature;

// Export public API
module.exports = {
  initializeFeatureFlags,
  isFeatureFlagsReady,
  getFeatureFlagsStatus,
  shutdownFeatureFlags,
  openFeature
};
