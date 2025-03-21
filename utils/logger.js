// utils/logger.js
const pino = require('pino');
const pinoHttp = require('pino-http');
const crypto = require('crypto');
const { hostname } = require('os');

console.log('Logger initialization:');
console.log('LOKI_HOST:', process.env.LOKI_HOST);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DISABLE_LOKI:', process.env.DISABLE_LOKI);

const isProduction = process.env.NODE_ENV === 'production';

// Create a transport stream for Loki
const transport = pino.transport({
  targets: [{
    target: 'pino-loki',
    options: {
      host: process.env.LOKI_HOST,
      basicAuth: {
        username: process.env.LOKI_USERNAME,
        password: process.env.LOKI_PASSWORD
      },
      batching: false,
      labels: {
        app: process.env.APP_NAME || 'leetcode-explained-api',
        env: process.env.NODE_ENV || 'development',
        host: hostname(),
        serverInstance: crypto.randomUUID().split('-')[0]
      }
    },
    level: 'info'
  }, {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard'
    },
    level: 'debug'
  }]
});

// Create the logger instance
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    env: process.env.NODE_ENV || 'development',
    host: hostname(),
    app: process.env.APP_NAME || 'leetcode-explained-api'
  }
}, transport);

// When debugging, log startup information
if (process.env.DEBUG_LOGGING === 'true') {
  console.log('Logger created with Loki configuration');
}

// Create HTTP logger middleware
const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    else if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      ...(req.businessData || {}),
      headers: {
        'user-agent': req.headers['user-agent'],
        'content-length': req.headers['content-length'],
        'x-request-id': req.headers['x-request-id']
      },
      remoteAddress: req.ip || req.remoteAddress
    })
  }
});

// Add helper method to attach business data
httpLogger.logger.apiRequest = function(data) {
  if (this.req) {
    this.req.businessData = {
      ...data,
      timestamp: new Date().toISOString()
    };
    
    // Log an explicit message with business data
    logger.info({
      ...data,
      msg: 'API request received',
      reqId: this.req.id
    });
  }
};

logger.info('Logger initialized and ready');

module.exports = { logger, httpLogger };

