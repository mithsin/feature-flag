/**
 * Express.js Integration Example
 * Shows how to integrate the feature flags SDK with an Express application
 */

const express = require('express');
const {
  initializeFeatureFlags,
  isFeatureFlagsReady,
  getFeatureFlagsStatus,
  shutdownFeatureFlags,
  openFeature
} = require('../src/index');

const app = express();
app.use(express.json());

// Middleware to add feature flag client to request
app.use((req, res, next) => {
  if (isFeatureFlagsReady()) {
    req.featureFlags = openFeature.getClient();
  }
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  const ready = isFeatureFlagsReady();
  res.status(ready ? 200 : 503).json({
    status: ready ? 'healthy' : 'unhealthy',
    featureFlags: ready ? 'ready' : 'not ready',
    timestamp: new Date().toISOString()
  });
});

// Detailed status endpoint for monitoring/debugging
app.get('/status', (req, res) => {
  res.json(getFeatureFlagsStatus());
});

// Example API endpoint: Get user-specific features
app.get('/api/user/:userId/features', async (req, res) => {
  try {
    const { userId } = req.params;

    // Build evaluation context from user data
    const context = {
      targetingKey: userId,
      email: `user${userId}@example.com`,
      customAttributes: {
        userId,
        timestamp: Date.now()
      }
    };

    // Evaluate multiple feature flags
    const features = {
      newDashboard: await req.featureFlags.getBooleanValue(
        'show-new-dashboard',
        false,
        context
      ),
      theme: await req.featureFlags.getStringValue(
        'ui-theme',
        'light',
        context
      ),
      maxUploads: await req.featureFlags.getNumberValue(
        'max-uploads-per-day',
        10,
        context
      ),
      experimentalFeatures: await req.featureFlags.getObjectValue(
        'experimental-features',
        {},
        context
      )
    };

    res.json({
      userId,
      features,
      evaluatedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to evaluate features',
      message: error.message
    });
  }
});

// Example: Feature-flagged endpoint
app.get('/api/dashboard', async (req, res) => {
  try {
    const userId = req.query.userId || 'anonymous';

    const context = {
      targetingKey: userId,
      customAttributes: {
        userAgent: req.headers['user-agent']
      }
    };

    const useNewDashboard = await req.featureFlags.getBooleanValue(
      'show-new-dashboard',
      false,
      context
    );

    if (useNewDashboard) {
      res.json({
        version: 'v2',
        layout: 'grid',
        widgets: ['analytics', 'revenue', 'users', 'realtime']
      });
    } else {
      res.json({
        version: 'v1',
        layout: 'list',
        widgets: ['analytics', 'revenue']
      });
    }
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load dashboard',
      message: error.message
    });
  }
});

// Example: A/B testing endpoint
app.post('/api/checkout', async (req, res) => {
  try {
    const userId = req.body.userId || 'anonymous';

    const context = {
      targetingKey: userId,
      customAttributes: {
        cartValue: req.body.cartValue || 0,
        itemCount: req.body.itemCount || 0
      }
    };

    // Get checkout flow variant
    const checkoutVariant = await req.featureFlags.getStringValue(
      'checkout-flow-variant',
      'classic',
      context
    );

    // Get discount eligibility
    const discountEnabled = await req.featureFlags.getBooleanValue(
      'enable-checkout-discount',
      false,
      context
    );

    // Different checkout flows based on variant
    const response = {
      userId,
      variant: checkoutVariant,
      discountEnabled
    };

    if (checkoutVariant === 'one-click') {
      response.steps = ['confirm'];
      response.message = 'Using streamlined one-click checkout';
    } else if (checkoutVariant === 'express') {
      response.steps = ['shipping', 'payment'];
      response.message = 'Using express checkout';
    } else {
      response.steps = ['shipping', 'payment', 'review', 'confirm'];
      response.message = 'Using classic checkout';
    }

    res.json(response);
  } catch (error) {
    res.status(500).json({
      error: 'Checkout failed',
      message: error.message
    });
  }
});

// Start server function
async function startServer() {
  console.log('Starting Express server with feature flags...\n');

  try {
    // Initialize feature flags SDK
    console.log('Initializing feature flags...');
    await initializeFeatureFlags({
      sdkKey: process.env.LAUNCHDARKLY_SDK_KEY,
      enableTelemetry: true,
      logger: (message) => {
        // Parse and pretty-print telemetry
        try {
          const data = JSON.parse(message);
          console.log(`[${data.level}] ${data.event}:`, data);
        } catch {
          console.log(message);
        }
      }
    });
    console.log('Feature flags initialized ✓\n');

    // Start HTTP server
    const PORT = process.env.PORT || 3000;
    const server = app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`Status: http://localhost:${PORT}/status`);
      console.log('\nPress Ctrl+C to stop\n');
    });

    // Graceful shutdown handlers
    const shutdown = async (signal) => {
      console.log(`\n${signal} received, shutting down gracefully...`);

      server.close(async () => {
        console.log('HTTP server closed');

        try {
          await shutdownFeatureFlags();
          console.log('Feature flags SDK shut down ✓');
          process.exit(0);
        } catch (error) {
          console.error('Error during shutdown:', error);
          process.exit(1);
        }
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Run the server
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
