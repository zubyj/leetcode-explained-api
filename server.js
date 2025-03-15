// server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { body, validationResult } = require('express-validator');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    methods: ['POST'],
}));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

// OpenRouter API route
app.post(
    '/api/generate',
    [
        body('prompt').isString().notEmpty().withMessage('Prompt is required'),
        body('model').optional().isString(),
        body('action').isIn(['analyze', 'fix']).withMessage('Valid action is required'),
    ],
    async (req, res) => {
        try {
            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { prompt, model = 'amazon/nova-micro-v1', action } = req.body;

            // Make request to OpenRouter API
            const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'HTTP-Referer': 'https://github.com/zubyj/leetcode-explained',
                    'X-Title': 'Leetcode Explained'
                },
                body: JSON.stringify({
                    model: model,
                    messages: [{
                        role: 'user',
                        content: prompt
                    }],
                    stream: false
                })
            });

            if (!openRouterResponse.ok) {
                const errorData = await openRouterResponse.json();
                console.error('OpenRouter API error:', errorData);
                return res.status(openRouterResponse.status).json({
                    error: 'OpenRouter API error',
                    details: errorData
                });
            }

            const data = await openRouterResponse.json();

            if (data.choices && data.choices[0]) {
                return res.json({
                    type: 'answer',
                    data: { text: data.choices[0].message.content },
                    action: action
                });
            } else {
                return res.status(500).json({ error: 'Unexpected response format from OpenRouter' });
            }
        } catch (error) {
            console.error('Server error:', error);
            res.status(500).json({ error: 'Server error', message: error.message });
        }
    }
);

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});