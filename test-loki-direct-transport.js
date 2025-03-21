// test-loki-direct-transport.js
require('dotenv').config();

const pino = require('pino');
const { hostname } = require('os');
const { createLokiTransport } = require('./utils/loki-direct');

console.log('Testing with direct Loki transport');
console.log(`LOKI_HOST: ${process.env.LOKI_HOST}`);

// Create a pino-pretty transport for console output
const prettyTransport = pino.transport({
  target: 'pino-pretty',
  options: {
    colorize: true,
    translateTime: 'SYS:standard'
  }
});

// Create our custom Loki transport
const lokiTransport = createLokiTransport({
  host: process.env.LOKI_HOST,
  username: process.env.LOKI_USERNAME,
  password: process.env.LOKI_PASSWORD,
  labels: {
    app: 'leetcode-explained-api-direct-transport',
    environment: process.env.NODE_ENV || 'development',
    host: hostname()
  },
  batchSize: 5,
  interval: 3000 // 3 seconds
});

// Create a multi-destination stream
const multiStream = require('pino-multi-stream').multistream;
const streams = [
  { stream: prettyTransport },
  { stream: lokiTransport }
];

// Create the logger
const logger = pino({
  level: 'debug',
  timestamp: pino.stdTimeFunctions.isoTime
}, multiStream(streams));

// Log test messages
console.log('Sending test logs to Loki...');
logger.info('Direct transport - INFO message');
logger.debug('Direct transport - DEBUG message');
logger.warn('Direct transport - WARNING message');
logger.error(new Error('Direct transport - ERROR message'));

// Add a structured log
logger.info({
  testId: 'direct-transport',
  success: true,
  timestamp: new Date().toISOString()
}, 'Direct transport - structured log test');

// Keep the process running for logs to be sent
console.log('Waiting for logs to be sent...');
setTimeout(() => {
  console.log('Test complete - check Grafana Loki for logs');
  process.exit(0);
}, 10000); // Give it 10 seconds to send all logs 