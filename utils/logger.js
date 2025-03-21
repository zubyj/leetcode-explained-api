// utils/logger.js
const pino = require('pino');
const { hostname } = require('os');
const crypto = require('crypto');
const axios = require('axios');

// Environment detection
const isProduction = process.env.NODE_ENV === 'production';

// Debug: Log environment variables
console.log('Logger initialization:');
console.log('LOKI_HOST:', process.env.LOKI_HOST);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DISABLE_LOKI:', process.env.DISABLE_LOKI);

// Simple logging factory
function createLogger() {
  // Base configuration
  const config = {
    level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
    base: {
      env: process.env.NODE_ENV || 'development',
      host: hostname(),
      app: process.env.APP_NAME || 'leetcode-explained-api'
    }
  };
  
  // Add prettification for dev mode
  if (!isProduction) {
    config.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard'
      }
    };
  }
  
  // Create the logger
  const logger = pino(config);
  
  // If Loki is enabled, set up a simple sender
  if (process.env.LOKI_HOST && process.env.DISABLE_LOKI !== 'true') {
    // Periodically send logs to Loki
    const queue = [];
    const interval = setInterval(async () => {
      if (queue.length === 0) return;
      
      const batch = [...queue];
      queue.length = 0;
      
      try {
        await sendLogsToLoki(batch);
      } catch (err) {
        console.error('Failed to send logs to Loki:', err.message);
      }
    }, 5000).unref(); // Don't keep Node.js alive just for this
    
    // Intercept logs and queue them for Loki
    const originalWrite = logger.write;
    logger.write = function(obj) {
      // Normal log processing
      originalWrite.apply(this, arguments);
      
      // Also queue for Loki if not a system message
      if (obj && obj.msg && !obj.msg.startsWith('Server is')) {
        queue.push(obj);
      }
    };
  }
  
  return logger;
}

// Simple HTTP middleware that adds request ID and timing
function createHttpLogger(logger) {
  return (req, res, next) => {
    // Generate a request ID
    req.id = req.headers['x-request-id'] || crypto.randomUUID();
    
    // Add timing
    req.startTime = Date.now();
    
    // Add a logger to the request
    req.log = logger.child({ requestId: req.id });
    
    // Log once on response finish
    res.on('finish', () => {
      // Extract business data
      const businessData = {
        userId: req.body?.userId || 'anonymous',
        action: req.body?.action || '',
        model: req.body?.model || '',
        problemTitle: req.body?.problemTitle || '',
        version: req.body?.version || ''
      };
      
      // Create the log entry
      req.log.info({
        ...businessData,
        method: req.method,
        url: req.url,
        status: res.statusCode,
        responseTime: Date.now() - req.startTime,
        userAgent: req.headers['user-agent']
      }, 'Request completed');
    });
    
    next();
  };
}

// Simple function to send logs to Loki
async function sendLogsToLoki(logs) {
  if (!logs.length) return;
  
  const lokiUrl = `${process.env.LOKI_HOST}/loki/api/v1/push`;
  
  // Build the Loki payload - similar structure to your current setup but much simpler
  const streams = [];
  
  // Group logs by level (info, error, etc)
  const logsByLevel = {};
  
  logs.forEach(log => {
    const level = log.level ? String(log.level) : 'info';
    if (!logsByLevel[level]) logsByLevel[level] = [];
    logsByLevel[level].push(log);
  });
  
  // Create streams for each level
  Object.entries(logsByLevel).forEach(([level, levelLogs]) => {
    const values = levelLogs.map(log => {
      // Format timestamp in nanoseconds
      const timestampNs = String((log.time || Date.now()) * 1000000);
      
      // Format the message with important fields first
      let message = '';
      
      // Add business data if present
      const businessFields = ['action', 'userId', 'model', 'problemTitle', 'version'];
      const businessData = {};
      
      businessFields.forEach(field => {
        if (log[field]) businessData[field] = log[field];
      });
      
      if (Object.keys(businessData).length > 0) {
        const parts = [];
        if (businessData.action) parts.push(`action=${businessData.action}`);
        if (businessData.userId) parts.push(`userId=${businessData.userId}`);
        if (businessData.model) parts.push(`model=${businessData.model}`);
        if (businessData.problemTitle) parts.push(`problem="${businessData.problemTitle}"`);
        if (businessData.version) parts.push(`version=${businessData.version}`);
        
        message = parts.join(' ') + ' | ';
      }
      
      // Add the main message and key metadata
      message += log.msg;
      
      if (log.responseTime) message += ` | responseTime=${log.responseTime}ms`;
      if (log.status) message += ` | status=${log.status}`;
      
      return [timestampNs, message];
    });
    
    streams.push({
      stream: {
        app: process.env.APP_NAME || 'leetcode-explained-api',
        host: hostname(),
        level,
        action: levelLogs[0].action || '',
        userId: levelLogs[0].userId || ''
      },
      values
    });
  });
  
  // Headers for Loki
  const headers = { 'Content-Type': 'application/json' };
  
  // Add basic auth if credentials provided
  if (process.env.LOKI_USERNAME && process.env.LOKI_PASSWORD) {
    const token = Buffer.from(`${process.env.LOKI_USERNAME}:${process.env.LOKI_PASSWORD}`).toString('base64');
    headers['Authorization'] = `Basic ${token}`;
  }
  
  // Send to Loki
  await axios.post(lokiUrl, { streams }, { headers, timeout: 5000 });
}

// Create and export logger instances
const logger = createLogger();
const httpLogger = createHttpLogger(logger);

module.exports = { logger, httpLogger };

