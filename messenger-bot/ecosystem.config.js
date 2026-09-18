module.exports = {
  apps: [{
    name: "asesores-bot",
    script: "server-manychat.js",
    env: {
      BRAIN_URL: "https://asesoresprevisionales.com/manychat-brain"
    }
  }]
};
