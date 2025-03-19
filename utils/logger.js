// utils/logger.js
const pino = require('pino');
const crypto = require('crypto');

const isProduction = process.env.NODE_ENV === 'production';

// Create base logger configuration
const loggerConfig = {
    level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
        level: (label) => ({ level: label }),
    },
    base: undefined, // Removes pid, hostname
};

// Add pino-loki transport in production if LOKI_HOST is configured
if (isProduction && process.env.LOKI_HOST) {
    loggerConfig.transport = {
        targets: [
            {
                target: 'pino-loki',
                level: process.env.LOG_LEVEL || 'info',
                options: {
                    batching: true,
                    interval: 5,
                    labels: {
                        app: process.env.APP_NAME || 'leetcode-explained-api',
                        environment: process.env.NODE_ENV || 'production'
                    },
                    host: process.env.LOKI_HOST,
                    basicAuth: process.env.LOKI_BASIC_AUTH ? {
                        username: process.env.LOKI_USERNAME,
                        password: process.env.LOKI_PASSWORD
                    } : undefined
                }
            }
        ]
    };
} else if (!isProduction) {
    // Development transport with pino-pretty
    loggerConfig.transport = {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
        }
    };
}

const logger = pino(loggerConfig);

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

