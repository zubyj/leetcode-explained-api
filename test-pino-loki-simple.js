// test-pino-loki-simple.js
require('dotenv').config();

// Enable debug logs
process.env.DEBUG = '*';

const pino = require('pino');
const { hostname } = require('os');

console.log('Testing with simplified pino-loki configuration');
console.log(`LOKI_HOST: ${process.env.LOKI_HOST}`);

// Create authentication token
const token = Buffer.from(`${process.env.LOKI_USERNAME}:${process.env.LOKI_PASSWORD}`).toString('base64');

// Try a completely different approach using direct pino-loki configuration
const pinoLoki = require('pino-loki');
const streamToLoki = pinoLoki.createWriteStreamToLoki({
  // Don't use the host variable from the normal configuration
  // Instead use the complete URL directly
  host: process.env.LOKI_HOST,
  basicAuth: {
    username: process.env.LOKI_USERNAME,
    password: process.env.LOKI_PASSWORD
  },
  // This is the key difference - add the path explicitly
  path: '/loki/api/v1/push',
  // Add labels like in the direct test
  labels: {
    app: 'leetcode-explained-api-simple-test',
    environment: process.env.NODE_ENV || 'development',
    host: hostname(),
    level: '{level}'
  },
  // Add debug information
  verbose: true
});

// Create the logger with the stream
const logger = pino({
  level: 'debug'
}, streamToLoki);

// Log some test messages
console.log('Sending test logs to Loki...');
logger.info('Simple test - INFO message');
logger.warn('Simple test - WARNING message');
logger.error('Simple test - ERROR message');

// Wait for logs to be sent
console.log('Waiting for logs to be sent...');
setTimeout(() => {
  console.log('Test complete - check Grafana Loki for logs');
  process.exit(0);
}, 10000); 