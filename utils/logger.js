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

// Create a simpler HTTP logger
const httpLogger = (req, res, next) => {
  // Generate a request ID
  const reqId = req.headers['x-request-id'] || crypto.randomUUID();
  req.id = reqId;
  
  // Create a logger specific to this request
  req.log = logger.child({ reqId });
  
  // Store business data as a property on the request object
  req.businessData = {};
  
  // Add helper method to attach business data
  req.log.apiRequest = function(data) {
    // Store directly on req
    req.businessData = {
      ...data,
      timestamp: new Date().toISOString()
    };
    
    if (process.env.DEBUG_LOGGING === 'true') {
      console.log(`Stored business data for request ${reqId}:`, req.businessData);
    }
  };
  
  // Store response data
  req.responseData = {};
  
  // Add helper method to attach response context
  req.log.addResponseContext = function(data) {
    req.responseData = {
      ...data,
      status: 'success'
    };
    
    if (process.env.DEBUG_LOGGING === 'true') {
      console.log(`Stored response data for request ${reqId}:`, req.responseData);
    }
  };
  
  // Capture end of request
  const originalEnd = res.end;
  res.end = function(...args) {
    // Call the original end method
    originalEnd.apply(res, args);
    
    // Log the complete request with all data
    logger.info({
      req: {
        id: reqId,
        method: req.method,
        url: req.url,
        // Include all business data fields
        ...req.businessData,
        // Only include essential headers
        headers: {
          'user-agent': req.headers['user-agent'],
          'x-request-id': req.headers['x-request-id']
        },
        remoteAddress: req.ip || req.socket.remoteAddress
      },
      res: {
        statusCode: res.statusCode,
        // Include response data
        ...req.responseData
      },
      responseTime: Date.now() - req._startTime,
      msg: 'request completed'
    });
  };
  
  // Start time tracking
  req._startTime = Date.now();
  
  // Continue to the next middleware
  next();
};

logger.info('Logger initialized and ready');

module.exports = { logger, httpLogger };

