# Feature Flags SDK

A fully functional Node.js SDK for feature flags using OpenFeature with LaunchDarkly provider. This SDK provides a thin wrapper around OpenFeature, making it easy to integrate feature flags into your application with built-in telemetry and lifecycle management.

## Features

- **OpenFeature Integration**: Built on OpenFeature standard for vendor-agnostic feature flag management
- **LaunchDarkly Provider**: Uses LaunchDarkly as the feature flag service provider
- **Lifecycle Management**: Initialize, health checks, status monitoring, and graceful shutdown
- **Telemetry Hooks**: Built-in logging and observability throughout the flag evaluation lifecycle
- **TypeScript Support**: Full TypeScript definitions included
- **Health Check Ready**: Lightweight readiness checks for Kubernetes and health endpoints

## Installation

```bash
npm install @your-org/feature-flags-sdk
```

## Quick Start

### 1. Initialize the SDK

```javascript
const {
  initializeFeatureFlags,
  isFeatureFlagsReady,
  getFeatureFlagsStatus,
  shutdownFeatureFlags,
  openFeature
} = require('@your-org/feature-flags-sdk');

// Initialize with SDK key from environment variable
async function setup() {
  try {
    await initializeFeatureFlags({
      sdkKey: process.env.LAUNCHDARKLY_SDK_KEY, // or set LAUNCHDARKLY_SDK_KEY env var
      enableTelemetry: true,
      logger: console.log
    });

    console.log('Feature flags ready:', isFeatureFlagsReady());
  } catch (error) {
    console.error('Failed to initialize:', error);
  }
}
```

### 2. Evaluate Feature Flags

```javascript
// Get an OpenFeature client
const client = openFeature.getClient();

// Evaluation context (user/session data)
const context = {
  targetingKey: 'user-123',
  email: 'user@example.com',
  customAttributes: {
    tier: 'premium'
  }
};

// Boolean flag
const showNewFeature = await client.getBooleanValue(
  'show-new-feature',
  false, // default value
  context
);

// String flag
const theme = await client.getStringValue(
  'ui-theme',
  'light',
  context
);

// Number flag
const maxItems = await client.getNumberValue(
  'max-items-per-page',
  10,
  context
);

// JSON/Object flag
const config = await client.getObjectValue(
  'feature-config',
  { enabled: false },
  context
);
```

## API Reference

### `initializeFeatureFlags(config)`

Initialize the feature flag system at application startup.

**Parameters:**
- `config.sdkKey` (string, optional): LaunchDarkly SDK key. Falls back to `LAUNCHDARKLY_SDK_KEY` environment variable
- `config.options` (object, optional): Additional LaunchDarkly provider options
- `config.enableTelemetry` (boolean, optional): Enable telemetry logging (default: true)
- `config.logger` (function, optional): Custom logger function

**Returns:** `Promise<void>`

**Example:**
```javascript
await initializeFeatureFlags({
  sdkKey: 'sdk-key-123',
  enableTelemetry: true,
  logger: (msg) => console.log(msg),
  options: {
    timeout: 5000
  }
});
```

### `isFeatureFlagsReady()`

Lightweight readiness check for health endpoints and runtime checks.

**Returns:** `boolean`

**Example:**
```javascript
// Health check endpoint
app.get('/health', (req, res) => {
  const ready = isFeatureFlagsReady();
  res.status(ready ? 200 : 503).json({
    featureFlags: ready ? 'ready' : 'not ready'
  });
});
```

### `getFeatureFlagsStatus()`

Get detailed status information for operational diagnostics and monitoring.

**Returns:** `FeatureFlagsStatus` object

**Example:**
```javascript
const status = getFeatureFlagsStatus();
console.log(status);
/*
{
  isInitialized: true,
  isReady: true,
  initializationTime: 1250,
  hasError: false,
  error: null,
  provider: {
    name: 'LaunchDarkly',
    status: 'READY'
  },
  timestamp: '2026-02-25T10:30:00.000Z'
}
*/
```

### `shutdownFeatureFlags()`

Gracefully shutdown the feature flags system and release resources.

**Returns:** `Promise<void>`

**Example:**
```javascript
// Application shutdown
process.on('SIGTERM', async () => {
  await shutdownFeatureFlags();
  process.exit(0);
});
```

### `openFeature`

Direct access to the OpenFeature API for advanced usage.

**Example:**
```javascript
const client = openFeature.getClient();

// Get detailed evaluation information
const details = await client.getBooleanDetails(
  'my-flag',
  false,
  context
);

console.log(details);
/*
{
  value: true,
  reason: 'TARGETING_MATCH',
  variant: 'on',
  flagKey: 'my-flag'
}
*/
```

## Complete Application Example

```javascript
const express = require('express');
const {
  initializeFeatureFlags,
  isFeatureFlagsReady,
  getFeatureFlagsStatus,
  shutdownFeatureFlags,
  openFeature
} = require('@your-org/feature-flags-sdk');

const app = express();

// Initialize feature flags on startup
async function startServer() {
  try {
    // Initialize SDK
    await initializeFeatureFlags({
      sdkKey: process.env.LAUNCHDARKLY_SDK_KEY,
      enableTelemetry: true,
      logger: console.log
    });

    console.log('Feature flags initialized successfully');

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        featureFlags: isFeatureFlagsReady() ? 'ready' : 'not ready'
      });
    });

    // Status endpoint for monitoring
    app.get('/status', (req, res) => {
      res.json(getFeatureFlagsStatus());
    });

    // Example API endpoint using feature flags
    app.get('/api/features', async (req, res) => {
      const client = openFeature.getClient();

      const context = {
        targetingKey: req.user?.id || 'anonymous',
        email: req.user?.email
      };

      const features = {
        newUI: await client.getBooleanValue('new-ui', false, context),
        maxUploadSize: await client.getNumberValue('max-upload-mb', 10, context),
        theme: await client.getStringValue('theme', 'light', context)
      };

      res.json(features);
    });

    // Start server
    const PORT = process.env.PORT || 3000;
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('SIGTERM received, shutting down gracefully');
      server.close(async () => {
        await shutdownFeatureFlags();
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
```

## Telemetry and Logging

The SDK includes built-in telemetry hooks that log throughout the OpenFeature lifecycle:

- **flag_evaluation_started**: When a flag evaluation begins
- **flag_evaluation_completed**: When evaluation succeeds (includes timing)
- **flag_evaluation_error**: When evaluation fails

All telemetry events are logged as structured JSON:

```json
{
  "level": "INFO",
  "source": "feature-flags-sdk",
  "event": "flag_evaluation_completed",
  "flagKey": "my-feature",
  "value": true,
  "variant": "on",
  "reason": "TARGETING_MATCH",
  "evaluationTimeMs": 15,
  "timestamp": "2026-02-25T10:30:00.000Z"
}
```

## Environment Variables

- `LAUNCHDARKLY_SDK_KEY`: LaunchDarkly SDK key (can be overridden by config)

## TypeScript Support

Full TypeScript definitions are included:

```typescript
import {
  initializeFeatureFlags,
  isFeatureFlagsReady,
  getFeatureFlagsStatus,
  shutdownFeatureFlags,
  openFeature,
  FeatureFlagsConfig,
  FeatureFlagsStatus
} from '@your-org/feature-flags-sdk';

const config: FeatureFlagsConfig = {
  sdkKey: process.env.LAUNCHDARKLY_SDK_KEY,
  enableTelemetry: true
};

await initializeFeatureFlags(config);
```

## Best Practices

1. **Initialize Early**: Call `initializeFeatureFlags()` during application startup, before accepting traffic
2. **Health Checks**: Use `isFeatureFlagsReady()` in your health check endpoints
3. **Graceful Shutdown**: Always call `shutdownFeatureFlags()` during application shutdown
4. **Error Handling**: Wrap initialization in try-catch and handle failures appropriately
5. **Context**: Always provide evaluation context with user/session information for proper targeting

## License

MIT
