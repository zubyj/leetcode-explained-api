// test-loki-minimal.js
require('dotenv').config();

// Test URL constructor behavior
const host = process.env.LOKI_HOST;

// Try different endpoint formats
const endpoints = [
  'loki/api/v1/push',
  '/loki/api/v1/push',
  undefined  // This will use the default from pino-loki
];

console.log('Testing URL construction with different endpoint formats:');
for (const endpoint of endpoints) {
  try {
    const url = new URL(endpoint ?? "loki/api/v1/push", host);
    console.log(`✅ Success with endpoint "${endpoint}": ${url.toString()}`);
  } catch (error) {
    console.error(`❌ Error with endpoint "${endpoint}": ${error.message}`);
  }
}

// Test with URL constructor directly
console.log('\nDirect URL construction test:');
try {
  const url = new URL('/loki/api/v1/push', process.env.LOKI_HOST);
  console.log(`Success: ${url.toString()}`);
} catch (error) {
  console.error(`Error: ${error.message}`);
} 