const webpush = require('web-push');

// Generate VAPID key pair
const vapidKeys = webpush.generateVAPIDKeys();

console.log('Public Key:\n', vapidKeys.publicKey);
console.log('Private Key:\n', vapidKeys.privateKey);
