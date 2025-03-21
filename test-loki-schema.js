// test-loki-schema.js
require('dotenv').config();

// Enable detailed debug logging
process.env.DEBUG = 'pino*,loki*,*loki*';

const pino = require('pino');
const { hostname } = require('os');
const http = require('http');
const https = require('https');

// Log parsed URL information to diagnose URL issues
const url = new URL(`${process.env.LOKI_HOST}/loki/api/v1/push`);
console.log('URL Analysis:');
console.log('- Protocol:', url.protocol);
console.log('- Username:', url.username);
console.log('- Password:', url.password ? 'set (length: ' + url.password.length + ')' : 'not set');
console.log('- Host:', url.host);
console.log('- Hostname:', url.hostname);
console.log('- Port:', url.port);
console.log('- Pathname:', url.pathname);
console.log('- Full URL:', url.toString());

// Test with explicit configuration
const logger = pino({
  level: 'debug',
  transport: {
    targets: [
      {
        target: 'pino-loki',
        options: {
          batching: false, // Disable batching for immediate sending
          labels: {
            app: 'test-loki-schema',
            environment: 'test',
            host: hostname()
          },
          // Use URL object for precise control
          host: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname,
          useTls: url.protocol === 'https:',
          
          // Add HTTP options for better error handling
          httpAgent: new http.Agent({ keepAlive: true }),
          httpsAgent: new https.Agent({ 
            keepAlive: true,
            rejectUnauthorized: false // For testing only
          }),
          
          // Only add auth if we have credentials
          ...(url.username && url.password ? {
            basicAuth: {
              username: url.username || process.env.LOKI_USERNAME,
              password: url.password || process.env.LOKI_PASSWORD
            }
          } : {}),
          
          // Enable verbose output
          verbose: true,
          // Debugging for URL issues
          replaceTimestamp: false,
          interval: 2
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
  }
});

// Log test messages
console.log('Sending test logs to Loki...');
logger.info('Schema test - INFO message');
logger.warn('Schema test - WARNING message');
logger.error(new Error('Schema test - ERROR message'));

// Wait for logs to be sent and debug information to display
console.log('Waiting for logs to be sent...');
setTimeout(() => {
  console.log('Test complete - check Grafana Loki for logs');
  process.exit(0);
}, 10000); 