// test-loki-direct.js
require('dotenv').config();

// Setup for direct testing
const axios = require('axios');
const { hostname } = require('os');

// Log Grafana Loki connection details (redacted for security)
console.log(`Testing connection to Loki host: ${process.env.LOKI_HOST.replace(/\/\/.+@/, '//****:****@')}`);
console.log(`Using username: ${process.env.LOKI_USERNAME}`);
console.log(`Password length: ${process.env.LOKI_PASSWORD ? process.env.LOKI_PASSWORD.length : 0} characters`);

// Current timestamp in nanoseconds
const now = Date.now() * 1000000;

// Prepare log entry in Loki format
const logEntry = {
  streams: [
    {
      stream: {
        app: process.env.APP_NAME || 'leetcode-explained-api-direct-test',
        environment: process.env.NODE_ENV || 'test',
        host: hostname(),
        level: 'info'
      },
      values: [
        [now.toString(), "Test log from direct test script"]
      ]
    }
  ]
};

// Endpoint for pushing logs
const pushEndpoint = `${process.env.LOKI_HOST}/loki/api/v1/push`;

// Create base64 authentication token
const token = Buffer.from(`${process.env.LOKI_USERNAME}:${process.env.LOKI_PASSWORD}`).toString('base64');

// Send logs directly to Loki
async function sendToLoki() {
  try {
    console.log(`Sending log to: ${pushEndpoint}`);
    const response = await axios.post(
      pushEndpoint,
      logEntry,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${token}`
        },
        timeout: 5000
      }
    );
    
    console.log('Logs sent successfully!');
    console.log(`Status: ${response.status}`);
    console.log(`Response: ${JSON.stringify(response.data)}`);
    return true;
  } catch (error) {
    console.error('Error sending logs:');
    console.error(`Status: ${error.response?.status || 'No status'}`);
    console.error(`Message: ${error.message}`);
    console.error(`Response data: ${JSON.stringify(error.response?.data || {})}`);
    
    if (error.request) {
      console.error('Request details:');
      console.error(`URL: ${error.config?.url}`);
      console.error(`Method: ${error.config?.method}`);
      console.error(`Headers: ${JSON.stringify(error.config?.headers || {})}`);
    }
    
    return false;
  }
}

// Run the test
sendToLoki().then(success => {
  console.log(success ? 'Test completed successfully' : 'Test failed');
}); 