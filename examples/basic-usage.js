/**
 * Basic Usage Example
 * Demonstrates how to use the feature flags SDK in a Node.js application
 */

const { initialize } = require('../dist/index');

async function main() {
  console.log('=== Feature Flags SDK - Basic Usage Example ===\n');

  // Step 1: Initialize the SDK — returns an instance ready for use
  console.log('1. Initializing feature flags SDK...');
  let sdk;
  try {
    sdk = await initialize({
      sdkKey: 'mock-sdkkey',
      enableTelemetry: true,
      options: {
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
  console.log(`   Ready: ${sdk.isReady()}\n`);

  // Step 3: Get detailed status
  console.log('3. Getting detailed status...');
  console.log('   Status:', JSON.stringify(sdk.getStatus(), null, 2));
  console.log();

  // Step 4: Evaluate feature flags
  console.log('4. Evaluating feature flags...\n');

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
  const showNewDashboard = await sdk.getBooleanValue(
    'dav-testing-flag',
    false,
    userContext
  );
  console.log(`   - dav-testing-flag: ${showNewDashboard}`);

  // Example 2: Detailed evaluation
  console.log('\n   Example 2: Detailed Evaluation');
  const details = await sdk.getBooleanDetails(
    'dav-testing-flag',
    false,
    userContext
  );
  console.log('   - Detailed evaluation:', JSON.stringify(details, null, 2));

  // Step 5: Simulate application logic based on flags
  console.log('\n5. Using feature flags in application logic...\n');

  if (showNewDashboard) {
    console.log('   → Rendering NEW dashboard for user');
  } else {
    console.log('   → Rendering LEGACY dashboard for user');
  }

  // Step 6: Graceful shutdown
  console.log('\n6. Shutting down...');
  await sdk.shutdown();
  console.log('   ✓ Shutdown complete\n');

  console.log('=== Example Complete ===');
}

// Run the example
main().catch(error => {
  console.error('Example failed:', error);
  process.exit(1);
});

// Handle graceful shutdown on SIGTERM/SIGINT
let sdkInstance;
process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  if (sdkInstance) await sdkInstance.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  if (sdkInstance) await sdkInstance.shutdown();
  process.exit(0);
});
