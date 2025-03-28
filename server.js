// Load environment variables first
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const axios = require('axios');
const { logger, httpLogger } = require('./utils/logger');

const app = express();

// Disable the X-Powered-By header for security
app.disable('x-powered-by');

// Trust proxy for rate limiter
app.set('trust proxy', 1);

// Basic middleware
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://openrouter.ai"],
        },
    },
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
    hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true
    }
}));

// Global error handler
app.use((err, req, res, next) => {
    req.log.error({
        msg: 'Unhandled error',
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
        stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
    });

    res.status(500).json({
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
    });
});

// IP blacklist middleware
const blacklistedIPs = new Set();
app.use((req, res, next) => {
    const clientIP = req.headers['x-forwarded-for'] || req.ip;
    if (blacklistedIPs.has(clientIP)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    next();
});

// Enhanced rate limiter configuration
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.headers['x-forwarded-for'] || req.ip,
    handler: (req, res) => {
        const clientIP = req.headers['x-forwarded-for'] || req.ip;
        if (req.rateLimit.remaining === 0) {
            // If client has exhausted their rate limit multiple times, blacklist them
            const strikes = (req.rateLimit.strikes || 0) + 1;
            if (strikes >= 3) {
                blacklistedIPs.add(clientIP);
            }
            req.rateLimit.strikes = strikes;
        }
        res.status(429).json({
            error: 'Too many requests',
            retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
        });
    }
});

// Apply rate limiter to API routes
app.use('/api/', apiLimiter);

// CORS configuration - strict configuration for Chrome extension
app.use(cors({
    origin: 'chrome-extension://hkbmmebmjcgpkfmlpjhghcpbokomngga',
    methods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin'],
    credentials: true,
    optionsSuccessStatus: 200
}));

// Add options handling
app.options('/api/generate', cors());

// Add pino-http middleware
app.use(httpLogger);

// Token authentication middleware
app.use((req, res, next) => {
    const expectedToken = process.env.AUTH_TOKEN;
    if (!expectedToken) {
        logger.error('AUTH_TOKEN not configured in environment variables');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ error: 'No authorization token provided' });
    }

    // Handle 'Bearer' prefix and trim whitespace
    const token = authHeader.replace('Bearer', '').trim();
    
    if (token !== expectedToken) {
        // Log invalid token attempts but don't expose which part was wrong
        logger.warn({
            msg: 'Invalid token attempt',
            ip: req.ip,
            path: req.path
        });
        return res.status(403).json({ error: 'Invalid authorization token' });
    }

    next();
});

// Log server start with environment info
logger.info({
    msg: 'Server starting',
    loki_host: process.env.LOKI_HOST ? 'configured' : 'not configured',
    disable_loki: process.env.DISABLE_LOKI,
    debug_logging: process.env.DEBUG_LOGGING,
    app_name: process.env.APP_NAME
});

app.post(
    '/api/generate',
    [
        body('prompt').isString().notEmpty().withMessage('Prompt is required'),
        body('model').optional().isString(),
        body('action').isIn(['analyze', 'fix']).withMessage('Valid action is required'),
    ],
    async (req, res) => {
        try {
            // Add business data to the request log
            const businessData = {
                userId: req.body.userId || 'anonymous',
                version: req.body.version || '',
                problemTitle: req.body.problemTitle || '',
                action: req.body.action || 'unknown',
                model: req.body.model || 'default',
                requestType: 'generation'
            };

            // Log business data with request
            req.log.apiRequest(businessData);

            // Debug log for troubleshooting
            if (process.env.DEBUG_LOGGING === 'true') {
                console.log('Business data in handler:', businessData);
            }

            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                req.log.warn({ errors: errors.array() }, 'Validation failed');
                return res.status(400).json({ errors: errors.array() });
            }

            const { prompt, model = 'amazon/nova-micro-v1', action } = req.body;

            // Make request to OpenRouter API using axios
            const openRouterResponse = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                model: model,
                messages: [{
                    role: 'user',
                    content: prompt
                }],
                stream: false
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'HTTP-Referer': 'https://github.com/zubyj/leetcode-explained',
                    'X-Title': 'Leetcode Explained'
                }
            });

            const responseData = {
                type: 'answer',
                data: { text: openRouterResponse.data.choices[0].message.content },
                action: action
            };

            // Add response context to the logger
            req.log.addResponseContext({
                responseType: 'answer',
                action: action,
                model: model
            });

            return res.json(responseData);

        } catch (error) {
            // Detailed error logging
            req.log.error({
                msg: 'Error processing request',
                error: error.message,
                stack: error.stack,
                response: error.response?.data
            });

            res.status(500).json({
                error: 'Server error',
                message: error.response?.data?.error || error.message
            });
        }
    }
);

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    logger.info({ msg: `Server running on port ${PORT}`, port: PORT });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
    logger.info('SIGTERM received. Starting graceful shutdown...');
    server.close(() => {
        logger.info('Server closed. Process terminating...');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    logger.info('SIGINT received. Starting graceful shutdown...');
    server.close(() => {
        logger.info('Server closed. Process terminating...');
        process.exit(0);
    });
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
    logger.fatal({
        msg: 'Uncaught exception',
        error: error.message,
        stack: error.stack
    });
    // Give the logger time to flush
    setTimeout(() => {
        process.exit(1);
    }, 1000);
});

// Unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
    logger.fatal({
        msg: 'Unhandled rejection',
        reason: reason,
        promise: promise
    });
});

