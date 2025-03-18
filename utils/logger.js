// utils/logger.js
const pino = require('pino');
const crypto = require('crypto');

const isProduction = process.env.NODE_ENV === 'production';

const logger = pino({
    level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
        level: (label) => ({ level: label }),
    },
    base: undefined, // Removes pid, hostname
    transport: !isProduction
        ? {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
            },
        }
        : undefined, // No prettifier in prod, logs JSON directly to stdout
});

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
        }),
        res: (res) => ({
            statusCode: res.statusCode,
            responseTime: res.responseTime,
        }),
    },
});

module.exports = { logger, httpLogger };
