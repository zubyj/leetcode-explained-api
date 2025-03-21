// test-loki.js
require('dotenv').config();

// Enable debug mode for pino-loki
process.env.DEBUG = 'pino-loki:*';

const pino = require('pino');
const { hostname } = require('os');

// Log Grafana Loki connection details
console.log(`Testing connection to Loki host: ${process.env.LOKI_HOST}`);
console.log(`Using username: ${process.env.LOKI_USERNAME}`);
console.log(`Password length: ${process.env.LOKI_PASSWORD ? process.env.LOKI_PASSWORD.length : 0} characters`);

// Make sure we have a valid URL
if (!process.env.LOKI_HOST) {
  console.error('Error: LOKI_HOST environment variable is not set.');
  process.exit(1);
}

// Prepare push endpoint exactly as in the direct test
const pushEndpoint = `${process.env.LOKI_HOST}/loki/api/v1/push`;
console.log(`Sending logs to: ${pushEndpoint}`);

// Create token exactly as in the direct test
const token = Buffer.from(`${process.env.LOKI_USERNAME}:${process.env.LOKI_PASSWORD}`).toString('base64');

// Configure the logger with transport
const logger = pino({
  level: 'debug',
  timestamp: pino.stdTimeFunctions.isoTime,
  base: undefined, // Removes pid, hostname
}, pino.transport({
  targets: [
    {
      target: 'pino-loki',
      options: {
        batching: true,
        interval: 5,
        labels: {
          app: process.env.APP_NAME || 'leetcode-explained-api-test',
          environment: process.env.NODE_ENV || 'test',
          host: hostname(),
          level: '{level}'
        },
        // Debug - try different combinations
        host: pushEndpoint,
        // Explicitly set port to null to avoid URL path interpretation problems
        port: null,
        // No path/endpoint settings
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${token}`
        }
      }
    },
    {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      }
    }
  ]
}));

// Log some test messages
logger.info('This is a test INFO message');
logger.debug('This is a test DEBUG message');
logger.warn('This is a test WARNING message');
logger.error(new Error('This is a test ERROR message'));

// Add a custom object
logger.info({
  customField1: 'value1',
  customField2: 'value2',
  timestamp: new Date().toISOString()
}, 'Message with custom fields');

// Keep the process running a bit to ensure logs are sent
console.log('Waiting to ensure logs are sent...');
setTimeout(() => {
  console.log('Done. Check Grafana Cloud Loki for logs.');
  process.exit(0);
}, 10000); // Wait 10 seconds for more debug output 