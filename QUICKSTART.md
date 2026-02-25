# Quick Start Guide

Get up and running with the Feature Flags SDK in 5 minutes.

## Installation

```bash
npm install @your-org/feature-flags-sdk
```

## Setup

### 1. Get Your LaunchDarkly SDK Key

1. Log in to [LaunchDarkly](https://app.launchdarkly.com)
2. Go to Account Settings → Projects
3. Copy your SDK key for the environment you want to use

### 2. Set Environment Variable

Create a `.env` file in your project root:

```bash
LAUNCHDARKLY_SDK_KEY=sdk-your-key-here
```

Or export it in your shell:

```bash
export LAUNCHDARKLY_SDK_KEY=sdk-your-key-here
```

### 3. Initialize in Your Application

```javascript
const {
  initializeFeatureFlags,
  openFeature
} = require('@your-org/feature-flags-sdk');

async function main() {
  // Initialize SDK (reads from LAUNCHDARKLY_SDK_KEY env var)
  await initializeFeatureFlags();

  // Get a client
  const client = openFeature.getClient();

  // Evaluate a flag
  const context = { targetingKey: 'user-123' };
  const enabled = await client.getBooleanValue('my-feature', false, context);

  console.log('Feature enabled:', enabled);
}

main();
```

## Next Steps

- [Read the full README](README.md) for detailed API documentation
- [Check out the examples](examples/) for more use cases:
  - [Basic Usage](examples/basic-usage.js)
  - [Express.js Integration](examples/express-app.js)
- Set up health checks using `isFeatureFlagsReady()`
- Add monitoring with `getFeatureFlagsStatus()`

## Common Patterns

### Express.js Middleware

```javascript
app.use((req, res, next) => {
  req.featureFlags = openFeature.getClient();
  next();
});
```

### Health Check Endpoint

```javascript
app.get('/health', (req, res) => {
  res.json({
    status: isFeatureFlagsReady() ? 'ok' : 'unhealthy'
  });
});
```

### Graceful Shutdown

```javascript
process.on('SIGTERM', async () => {
  await shutdownFeatureFlags();
  process.exit(0);
});
```

## Troubleshooting

**SDK won't initialize**
- Check that `LAUNCHDARKLY_SDK_KEY` is set correctly
- Verify your SDK key is valid in LaunchDarkly
- Check network connectivity to LaunchDarkly servers

**Flags always return default values**
- Ensure the flag exists in LaunchDarkly
- Check that targeting rules are configured
- Verify the evaluation context includes required attributes

**Need help?**
- Check the [README](README.md) for detailed documentation
- Review the [examples](examples/) directory
- Open an issue on GitHub
