// utils/logger.js
const pino = require('pino');
const crypto = require('crypto');
const { hostname } = require('os');
const { createLokiTransport } = require('./loki-direct');

// Debug: Log environment variables
console.log('Logger initialization:');
console.log('LOKI_HOST:', process.env.LOKI_HOST);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DISABLE_LOKI:', process.env.DISABLE_LOKI);

const isProduction = process.env.NODE_ENV === 'production';

// Create base logger configuration without custom formatters when using transport
const baseConfig = {
    level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
    timestamp: pino.stdTimeFunctions.isoTime,
    base: undefined, // Removes pid, hostname
};

let logger;

// Configure transports based on environment
if (process.env.DISABLE_LOKI !== 'true') {
    // Ensure we have required environment variables
    if (!process.env.LOKI_HOST) {
        console.warn('LOKI_HOST environment variable is not set. Disabling Loki logging.');
        process.env.DISABLE_LOKI = 'true';
    } else {
        try {
            console.log('Creating logger with custom Loki transport');
            
            // Create a multi destination stream
            const multiStream = require('pino-multi-stream').multistream;
            const streams = [];
            
            // Add pretty print in dev mode
            if (!isProduction) {
                streams.push({
                    stream: pino.transport({
                        target: 'pino-pretty',
                        options: {
                            colorize: true,
                            translateTime: 'SYS:standard',
                            ignore: 'pid,hostname',
                        }
                    })
                });
            }
            
            // Add our custom Loki transport
            streams.push({
                stream: createLokiTransport({
                    host: process.env.LOKI_HOST,
                    username: process.env.LOKI_USERNAME,
                    password: process.env.LOKI_PASSWORD,
                    labels: {
                        app: process.env.APP_NAME || 'leetcode-explained-api',
                        environment: process.env.NODE_ENV || 'development',
                        host: hostname()
                    },
                    batchSize: 10,
                    interval: 5000 // 5 seconds
                })
            });
            
            // Create the logger with multiple destinations
            logger = pino(baseConfig, multiStream(streams));
            console.log('Custom Loki logger configured successfully');
            
        } catch (error) {
            console.error('Error configuring custom Loki logger:', error.message);
            process.env.DISABLE_LOKI = 'true';
        }
    }
}

// Fallback if Loki is disabled or not properly configured
if (!logger) {
    console.log('Using fallback logger (without Loki)');
    // When no transport is used, we can use formatters
    baseConfig.formatters = {
        level: (label) => ({ level: label }),
    };
    
    if (!isProduction) {
        // Development transport with pino-pretty only
        logger = pino({
            ...baseConfig,
            transport: {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                    translateTime: 'SYS:standard',
                    ignore: 'pid,hostname',
                }
            }
        });
    } else {
        logger = pino(baseConfig);
    }
}

// Add utility functions to logger
logger.metrics = (metrics) => {
    logger.info({ metrics }, 'Application metrics');
};

const httpLogger = require('pino-http')({
    logger,
    genReqId: (req) => req.id || req.headers['x-request-id'] || crypto.randomUUID(),
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
            query: req.query,
            headers: {
                'user-agent': req.headers['user-agent'],
                'content-length': req.headers['content-length'],
                'x-request-id': req.headers['x-request-id'],
            },
            remoteAddress: req.remoteAddress,
            // Add business logic data if available
            ...(req.businessData || {})
        }),
        res: (res) => ({
            statusCode: res.statusCode,
            responseTime: res.responseTime,
        }),
    },
});

// Add utility functions to req.log
httpLogger.logger.metrics = (metrics) => {
    httpLogger.logger.info({ metrics }, 'Request metrics');
};

// Replace apiRequest with a function that adds business data to the request
httpLogger.logger.apiRequest = (data) => {
    // Store business data in the request object
    if (httpLogger.logger.req) {
        httpLogger.logger.req.businessData = {
            ...data,
            timestamp: new Date().toISOString()
        };
    }
};

module.exports = { logger, httpLogger };

