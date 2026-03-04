/**
 * Basic Usage Example
 * Demonstrates how to use the feature flags SDK in a Node.js application
 */

const { initialize, initializeGlobal } = require('../dist/index');

let appSdk;
let globalSdk;

async function main() {
  console.log('=== Feature Flags SDK - Basic Usage Example ===\n');

  // Step 1: Initialize both app-scoped and global instances
  console.log('1. Initializing feature flags SDK...');
  try {
    // App-scoped instance — uses the default OpenFeature domain
    appSdk = await initialize({
      sdkKey: 'app-sdk-key',
      enableTelemetry: true,
      options: { timeout: 5000 }
    });

    // Global/shared instance — uses the 'global' OpenFeature domain
    globalSdk = await initializeGlobal({
      sdkKey: 'global-sdk-key',
      enableTelemetry: true,
      options: { timeout: 5000 }
    });

    console.log('   ✓ Both instances initialized\n');
  } catch (error) {
    console.error('   ✗ Initialization failed:', error.message);
    process.exit(1);
  }

  // Step 2: Check readiness
  console.log('2. Checking readiness...');
  console.log(`   App ready:    ${appSdk.isReady()}`);
  console.log(`   Global ready: ${globalSdk.isReady()}\n`);

  // Step 3: Get status from each instance
  console.log('3. Getting status...');
  console.log('   App status:   ', JSON.stringify(appSdk.getStatus(), null, 2));
  console.log('   Global status:', JSON.stringify(globalSdk.getStatus(), null, 2));
  console.log();

  // Step 4: Evaluate flags from each instance independently
  console.log('4. Evaluating feature flags...\n');

  const userContext = {
    targetingKey: 'user-12345',
    email: 'john.doe@example.com',
    customAttributes: { tier: 'premium', region: 'us-east' }
  };

  // App-specific flag
  const showNewDashboard = await appSdk.getBooleanValue('new-dashboard', false, userContext);
  console.log(`   [app]    new-dashboard: ${showNewDashboard}`);

  // Global/org-wide flag
  const maintenanceMode = await globalSdk.getBooleanValue('maintenance-mode', false, userContext);
  console.log(`   [global] maintenance-mode: ${maintenanceMode}`);

  // Detailed evaluation from either instance
  const details = await appSdk.getBooleanDetails('new-dashboard', false, userContext);
  console.log('\n   Detailed evaluation:', JSON.stringify(details, null, 2));

  // Step 5: Application logic using both instances
  console.log('\n5. Using flags in application logic...\n');

  if (maintenanceMode) {
    console.log('   → Showing maintenance page (global flag)');
  } else if (showNewDashboard) {
    console.log('   → Rendering NEW dashboard (app flag)');
  } else {
    console.log('   → Rendering LEGACY dashboard');
  }

  // Step 6: Graceful shutdown
  console.log('\n6. Shutting down...');
  await appSdk.shutdown();
  await globalSdk.shutdown();
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
  if (appSdk) await appSdk.shutdown();
  if (globalSdk) await globalSdk.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  if (appSdk) await appSdk.shutdown();
  if (globalSdk) await globalSdk.shutdown();
  process.exit(0);
});
