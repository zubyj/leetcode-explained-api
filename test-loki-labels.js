// test-loki-labels.js
require('dotenv').config();

// Setup for direct testing
const axios = require('axios');

// Log Grafana Loki connection details (redacted for security)
console.log(`Testing connection to Loki host: ${process.env.LOKI_HOST.replace(/\/\/.+@/, '//****:****@')}`);
console.log(`Using username: ${process.env.LOKI_USERNAME}`);
console.log(`Password length: ${process.env.LOKI_PASSWORD ? process.env.LOKI_PASSWORD.length : 0} characters`);

// Endpoint for getting labels
const labelsEndpoint = `${process.env.LOKI_HOST}/loki/api/v1/labels`;

// Create base64 authentication token
const token = Buffer.from(`${process.env.LOKI_USERNAME}:${process.env.LOKI_PASSWORD}`).toString('base64');

// Send labels request to Loki
async function getLabelsFromLoki() {
  try {
    console.log(`Sending request to: ${labelsEndpoint}`);
    const response = await axios.get(
      labelsEndpoint,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${token}`
        },
        timeout: 5000
      }
    );
    
    console.log('Request successful!');
    console.log(`Status: ${response.status}`);
    console.log(`Response: ${JSON.stringify(response.data)}`);
    return true;
  } catch (error) {
    console.error('Error getting labels:');
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
getLabelsFromLoki().then(success => {
  console.log(success ? 'Test completed successfully' : 'Test failed');
}); 