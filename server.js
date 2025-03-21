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

// Trust proxy for rate limiter
app.set('trust proxy', 1);

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
}));

// Rate limiter configuration
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    keyGenerator: (req) => {
        // Use X-Forwarded-For if available, otherwise use IP
        return req.headers['x-forwarded-for'] || req.ip;
    }
});

// Apply rate limiter to all routes
app.use(limiter);

// CORS configuration
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
app.listen(PORT, () => {
    // Use logger directly for application-level logging
    logger.info({ msg: `Server running on port ${PORT}`, port: PORT });
});

