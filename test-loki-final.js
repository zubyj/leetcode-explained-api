require('dotenv').config();

const pino = require('pino');
const { hostname } = require('os');

// Parse the URL to get components
const url = new URL(`${process.env.LOKI_HOST}/loki/api/v1/push`);
console.log('URL Analysis:');
console.log('- Protocol:', url.protocol);
console.log('- Host:', url.host);
console.log('- Hostname:', url.hostname);
console.log('- Port:', url.port || (url.protocol === 'https:' ? '443' : '80'));
console.log('- Pathname:', url.pathname);
console.log('- Full URL:', url.toString());

// Create authentication token for headers
const authToken = Buffer.from(`${process.env.LOKI_USERNAME}:${process.env.LOKI_PASSWORD}`).toString('base64');

// Create logger with simplified configuration
const logger = pino({
  level: 'debug'
}, pino.transport({
  targets: [
    {
      target: 'pino-loki',
      options: {
        // Use URL components separately for better control
        host: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        // Explicitly set protocol based on URL
        useTls: url.protocol === 'https:',
        
        // App labels
        labels: {
          app: 'leetcode-explained-api-final-test',
          environment: process.env.NODE_ENV || 'development',
          host: hostname(),
          level: '{level}'
        },
        
        // Add headers for authentication
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authToken}`
        },
        
        // Turn off batching for immediate sending
        batching: false,
        interval: 2
      }
    },
    {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard'
      }
    }
  ]
}));

// Log test messages
console.log('Sending test logs to Loki...');
logger.info('Final test - INFO message');
logger.warn('Final test - WARNING message');
logger.error(new Error('Final test - ERROR message'));

// Add a custom structured log
logger.info({
  testId: 'final-test',
  success: true,
  timestamp: new Date().toISOString()
}, 'Structured log test');

// Keep the process running for logs to be sent
setTimeout(() => {
  console.log('Test complete - check Grafana Loki for logs');
  process.exit(0);
}, 6000); 