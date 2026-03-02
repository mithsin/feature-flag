/**
 * Basic Usage Example
 * Demonstrates how to use the feature flags SDK in a Node.js application
 */

const {
  initializeFeatureFlags,
  isFeatureFlagsReady,
  getFeatureFlagsStatus,
  shutdownFeatureFlags,
  openFeature
} = require('../dist/index');

async function main() {
  console.log('=== Feature Flags SDK - Basic Usage Example ===\n');

  // Step 1: Initialize the SDK
  console.log('1. Initializing feature flags SDK...');
  try {
    await initializeFeatureFlags({
      // SDK key from environment variable or hardcoded (not recommended for production)
      sdkKey: 'sdk-6ea49384-e02d-48ad-95be-2c4bbee64650',
      enableTelemetry: true,
      logger: (message) => {
        console.log('[TELEMETRY]', message);
      },
      options: {
        // Additional LaunchDarkly options
        timeout: 5000
      }
    });

    console.log('   ✓ Initialization complete\n');
  } catch (error) {
    console.error('   ✗ Initialization failed:', error.message);
    process.exit(1);
  }

  // Step 2: Check readiness
  console.log('2. Checking readiness...');
  const ready = isFeatureFlagsReady();
  console.log(`   Ready: ${ready}\n`);

  // Step 3: Get detailed status
  console.log('3. Getting detailed status...');
  const status = getFeatureFlagsStatus();
  console.log('   Status:', JSON.stringify(status, null, 2));
  console.log();

  // Step 4: Evaluate feature flags
  console.log('4. Evaluating feature flags...\n');

  // Get OpenFeature client
  const client = openFeature.getClient();

  // Define evaluation context (user/session information)
  const userContext = {
    targetingKey: 'user-12345',
    email: 'john.doe@example.com',
    name: 'John Doe',
    customAttributes: {
      tier: 'premium',
      region: 'us-east',
      accountAge: 365
    }
  };

  // Example 1: Boolean flag
  console.log('   Example 1: Boolean Flag');
  const showNewDashboard = await client.getBooleanValue(
    'dav-testing-flag',
    false, // default value if flag not found
    userContext
  );
  console.log(`dav,   - dav-testing-flag: ${showNewDashboard}`);

  
  // Example 5: Get detailed evaluation information
  console.log('\n   Example 5: Detailed Evaluation');
  const details = await client.getBooleanDetails(
    'dav-testing-flag',
    false,
    userContext
  );
  console.log('   - Detailed evaluation:', JSON.stringify(details, null, 2));

  // Step 5: Simulate application logic based on flags
  console.log('\n5. Using feature flags in application logic...\n');

  if (showNewDashboard) {
    console.log('   → Rendering NEW dashboard for user');

    console.log('dav, showNewDashboard-1: ', showNewDashboard)
  } else {
    console.log('   → Rendering LEGACY dashboard for user');
    console.log('dav, showNewDashboard-2: ', showNewDashboard)

  }

  // Step 6: Graceful shutdown
  console.log('\n6. Shutting down...');
  await shutdownFeatureFlags();
  console.log('   ✓ Shutdown complete\n');

  console.log('=== Example Complete ===');
}

// Run the example
main().catch(error => {
  console.error('Example failed:', error);
  process.exit(1);
});

// Handle graceful shutdown on SIGTERM/SIGINT
process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  await shutdownFeatureFlags();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  await shutdownFeatureFlags();
  process.exit(0);
});
