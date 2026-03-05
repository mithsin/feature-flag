/**
 * Basic Usage Example
 * Demonstrates how initialize() and initializeGlobal() can coexist simultaneously
 */

const { initialize, initializeGlobal } = require('../dist/index');

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

async function main() {
  console.log('=== Feature Flags SDK - Basic Usage Example ===\n');

  try {
    // Both can be initialized at the same time:
    // featureFlags1 uses an isolated domain-scoped instance
    // featureFlags2 uses the global singleton
    const featureFlags1 = await initialize({
      sdkKey: 'mock-sdkkey',
      enableTelemetry: true,
      options: { timeout: 5000 }
    });

    const featureFlags2 = await initializeGlobal({
      sdkKey: 'mock-sdkkey',
      enableTelemetry: true,
      options: { timeout: 5000 }
    });

    console.log('=== featureFlags1 (initialize - isolated instance) ===\n');

    console.log(`isReady: ${featureFlags1.isReady()}`);

    const value1 = await featureFlags1.getBooleanValue('dav-testing-flag', false, userContext);
    console.log(`dav-testing-flag: ${value1}`);

    const details1 = await featureFlags1.getBooleanDetails('dav-testing-flag', false, userContext);
    console.log('Detailed evaluation:', JSON.stringify(details1, null, 2));

    console.log('Status:', JSON.stringify(featureFlags1.getStatus(), null, 2));

    console.log('\n=== featureFlags2 (initializeGlobal - global singleton) ===\n');

    console.log(`isReady: ${featureFlags2.isReady()}`);

    const value2 = await featureFlags2.getBooleanValue('dav-testing-flag', false, userContext);
    console.log(`dav-testing-flag: ${value2}`);

    const details2 = await featureFlags2.getBooleanDetails('dav-testing-flag', false, userContext);
    console.log('Detailed evaluation:', JSON.stringify(details2, null, 2));

    console.log('Status:', JSON.stringify(featureFlags2.getStatus(), null, 2));

    // Shut down both
    await featureFlags1.shutdown();
    console.log('\nfeatureFlags1 (instance) shut down');

    await featureFlags2.shutdown();
    console.log('featureFlags2 (global) shut down');
  } catch (error) {
    console.error('Example failed:', error.message);
    process.exit(1);
  }

  console.log('\n=== Example Complete ===');
}

main().catch(error => {
  console.error('Example failed:', error);
  process.exit(1);
});
