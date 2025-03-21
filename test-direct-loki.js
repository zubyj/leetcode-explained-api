// test-direct-loki.js
require('dotenv').config();

const lokiUrl = `${process.env.LOKI_HOST}/loki/api/v1/push`;
const timestamp = Date.now() * 1000000; // Convert to nanoseconds
const lokiUsername = process.env.LOKI_USERNAME;
const lokiPassword = process.env.LOKI_PASSWORD;

console.log(`Sending direct request to Loki at: ${lokiUrl}`);
console.log(`Using username: ${lokiUsername}`);

// Prepare the request body
const requestBody = {
  streams: [
    {
      stream: {
        app: 'leetcode-explained-api-direct-test',
        environment: 'test',
        source: 'direct-test'
      },
      values: [
        [timestamp.toString(), 'Direct test log message to Loki']
      ]
    }
  ]
};

// Base64 encode the credentials for basic auth - standard HTTP Basic Auth format
const basicAuth = Buffer.from(`${lokiUsername}:${lokiPassword}`).toString('base64');

// Send the request using fetch
fetch(lokiUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Scope-OrgID': lokiUsername,
    'Authorization': `Basic ${basicAuth}`
  },
  body: JSON.stringify(requestBody)
})
.then(response => {
  console.log(`Status: ${response.status} ${response.statusText}`);
  if (!response.ok) {
    return response.text().then(text => {
      console.error('Error response:', text);
      throw new Error(`HTTP error! status: ${response.status}`);
    });
  }
  return response.text();
})
.then(data => {
  console.log('Success:', data);
  console.log('Check your Grafana Cloud Loki logs now!');
})
.catch(error => {
  console.error('Error:', error);
}); 