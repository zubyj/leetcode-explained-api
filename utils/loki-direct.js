// loki-direct.js
const axios = require('axios');
const { hostname } = require('os');
const { Transform } = require('stream');

/**
 * Custom pino transport that sends logs directly to Loki
 * This avoids the URL resolution issues in pino-loki
 */
class LokiTransport extends Transform {
  constructor(options = {}) {
    super({ objectMode: true });
    
    // Configuration
    this.lokiUrl = `${options.host}/loki/api/v1/push`;
    this.batchSize = options.batchSize || 10;
    this.interval = options.interval || 5000; // ms
    this.labels = options.labels || {
      app: 'nodejs-app',
      environment: process.env.NODE_ENV || 'development',
      host: hostname()
    };
    this.username = options.username;
    this.password = options.password;
    
    // Setup
    this.batch = [];
    this.timer = null;
    this.setupTimer();
    
    // Debug info
    console.log(`LokiTransport: Configured to send logs to ${this.lokiUrl}`);
    console.log(`LokiTransport: Using labels ${JSON.stringify(this.labels)}`);
  }
  
  setupTimer() {
    this.timer = setInterval(() => {
      this.flush();
    }, this.interval);
    this.timer.unref(); // Don't keep the process alive just for this timer
  }
  
  _transform(chunk, encoding, callback) {
    try {
      // Parse the log message
      const log = typeof chunk === 'string' ? JSON.parse(chunk) : chunk;
      
      // Add to batch
      this.batch.push(log);
      
      // Flush if batch size reached
      if (this.batch.length >= this.batchSize) {
        this.flush();
      }
      
      // Pass through for other transports
      this.push(chunk);
      callback();
    } catch (err) {
      console.error('LokiTransport: Error transforming log:', err);
      this.push(chunk); // Still pass through even if there was an error
      callback();
    }
  }
  
  _flush(callback) {
    this.flush();
    if (this.timer) {
      clearInterval(this.timer);
    }
    callback();
  }
  
  /**
   * Get a numeric timestamp in nanoseconds
   */
  getNanoseconds(log) {
    // If we have a numeric time in the log, use it (assumed to be milliseconds)
    if (log.time && typeof log.time === 'number') {
      return String(log.time * 1000000);
    }
    
    // Otherwise use current time
    return String(Date.now() * 1000000);
  }
  
  // Format logs for Loki
  formatLogs() {
    if (this.batch.length === 0) return null;
    
    // Create Loki log entries
    const streams = [];
    
    // Group by level to create separate streams
    const logsByLevel = {};
    
    this.batch.forEach(log => {
      // Extract level
      const level = log.level ? String(log.level) : 'info';
      
      // Initialize level group if needed
      if (!logsByLevel[level]) {
        logsByLevel[level] = [];
      }
      
      // Add to level group
      logsByLevel[level].push(log);
    });
    
    // Create streams for each level
    Object.entries(logsByLevel).forEach(([level, logs]) => {
      const streamLabels = {
        ...this.labels,
        level
      };
      
      const values = logs.map(log => {
        // Get timestamp in nanoseconds
        const timestampNs = this.getNanoseconds(log);
        
        // Format the log message
        let message;
        
        // Handle error objects specially
        if (log.err) {
          message = `ERROR: ${log.msg || ''} - ${log.err.message || 'Unknown error'}`;
        } else if (log.msg) {
          // For regular logs with a message
          const objCopy = { ...log };
          delete objCopy.time;
          delete objCopy.level;
          delete objCopy.msg;
          delete objCopy.pid;
          delete objCopy.hostname;
          
          // Only include extra fields if they exist
          if (Object.keys(objCopy).length > 0) {
            message = `${log.msg} | ${JSON.stringify(objCopy).slice(1, -1)}`; // Remove outer {}
          } else {
            message = log.msg;
          }
        } else {
          // For logs without a message field
          message = JSON.stringify(log);
        }
        
        return [timestampNs, message];
      });
      
      streams.push({
        stream: streamLabels,
        values
      });
    });
    
    return { streams };
  }
  
  async flush() {
    if (this.batch.length === 0) return;
    
    const logs = this.formatLogs();
    if (!logs) return;
    
    try {
      // Create auth header if credentials provided
      const headers = {
        'Content-Type': 'application/json'
      };
      
      if (this.username && this.password) {
        const token = Buffer.from(`${this.username}:${this.password}`).toString('base64');
        headers['Authorization'] = `Basic ${token}`;
      }
      
      // Debug output
      console.log(`LokiTransport: Sending ${this.batch.length} logs to Loki`);
      
      // Send logs to Loki
      const response = await axios.post(
        this.lokiUrl,
        logs,
        { headers, timeout: 5000 }
      );
      
      if (response.status >= 200 && response.status < 300) {
        console.log(`LokiTransport: Successfully sent ${this.batch.length} logs`);
      } else {
        console.error(`LokiTransport: Error response: ${response.status} ${response.statusText}`);
      }
      
      // Clear the batch
      this.batch = [];
    } catch (err) {
      console.error('LokiTransport: Error sending logs:', err.message);
      if (err.response) {
        console.error(`Status: ${err.response.status}`);
        console.error(`Response data: ${JSON.stringify(err.response.data)}`);
      }
      // For debugging
      console.error('Payload that caused the error:', JSON.stringify(logs, null, 2));
      
      // Clear the batch anyway to avoid building up failed logs
      this.batch = [];
    }
  }
}

/**
 * Create a pino-compatible transport factory
 */
function createLokiTransport(opts) {
  return new LokiTransport(opts);
}

module.exports = { 
  createLokiTransport,
  LokiTransport
}; 