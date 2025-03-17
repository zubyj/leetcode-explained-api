const pinoHttp = require('pino-http');

const logger = pinoHttp({
    logger: require('pino')({
        level: process.env.LOG_LEVEL || 'info',
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:standard'
            }
        }
    }),
    // Customize automatic request logging
    autoLogging: {
        ignorePaths: ['/health']  // Add paths to ignore if needed
    },
    customLogLevel: function (res, err) {
        if (res.statusCode >= 400 && res.statusCode < 500) return 'warn'
        if (res.statusCode >= 500 || err) return 'error'
        return 'info'
    }
});

module.exports = logger;
