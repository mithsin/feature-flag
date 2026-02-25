# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-25

### Added
- Initial release of the feature flags SDK
- OpenFeature integration with LaunchDarkly provider
- Core API functions:
  - `initializeFeatureFlags(config)` - Initialize SDK with configuration
  - `isFeatureFlagsReady()` - Lightweight readiness check
  - `getFeatureFlagsStatus()` - Detailed status for monitoring
  - `shutdownFeatureFlags()` - Graceful shutdown
  - `openFeature` - Direct access to OpenFeature API
- Telemetry hooks for logging throughout flag evaluation lifecycle
- TypeScript definitions for type safety
- Comprehensive documentation and examples
- Health check support for Kubernetes/monitoring
- Environment variable support for SDK key

### Features
- Automatic telemetry logging with timing information
- Structured status reporting for operational diagnostics
- Graceful error handling and initialization
- Support for all OpenFeature evaluation methods:
  - `getBooleanValue()`
  - `getStringValue()`
  - `getNumberValue()`
  - `getObjectValue()`
  - Detailed evaluation methods with `*Details()` variants
