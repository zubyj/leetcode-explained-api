const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { body, validationResult } = require('express-validator');
const axios = require('axios');

// Load environment variables
dotenv.config();

const app = express();

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
}));

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

app.post(
    '/api/generate',
    [
        body('prompt').isString().notEmpty().withMessage('Prompt is required'),
        body('model').optional().isString(),
        body('action').isIn(['analyze', 'fix']).withMessage('Valid action is required'),
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
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

            return res.json({
                type: 'answer',
                data: { text: openRouterResponse.data.choices[0].message.content },
                action: action
            });

        } catch (error) {
            console.error('Server error:', error.response?.data || error.message);
            res.status(500).json({
                error: 'Server error',
                message: error.response?.data?.error || error.message
            });
        }
    }
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
