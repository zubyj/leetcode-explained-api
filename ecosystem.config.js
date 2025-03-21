 module.exports = {
     apps: [{
       name: "leetcode-explained-api",
       script: "server.js",
       instances: 1,
       exec_mode: "fork",
       env: {
         NODE_ENV: "production",
         PORT: 3000
       },
       env_production: {
         NODE_ENV: "production"
       }
     }]
   }
