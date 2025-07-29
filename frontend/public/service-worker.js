// public/service-worker.js

self.addEventListener("install", (event) => {
  console.log("Service Worker installing.");
  // Skip waiting to activate the new service worker immediately
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("Service Worker activating.");
  // Claim clients to take control of unhandled pages
  event.waitUntil(clients.claim());
});

self.addEventListener("push", (event) => {
  console.log("[Service Worker] Push Received.");
  let data;
  try {
    // Attempt to parse the push data as JSON
    data = event.data.json();
    console.log(`[Service Worker] Push had this data: "${JSON.stringify(data)}"`);
  } catch (error) {
    console.error("[Service Worker] Error parsing push data:", error);
    // Default to an empty object if parsing fails to prevent errors
    data = {};
  }

  const title = data.title || "TrimTadka Update";
  const options = {
    body: data.body || "You have a new update from TrimTadka.",
    icon: data.icon || "/trimtadka.png", // Path to your app's icon, ensure this file exists in your public directory
    badge: data.badge || "/trimtadka.png", // Optional: badge icon, ensure this file exists
    vibrate: [200, 100, 200],
    data: {
      url: data.url || "/", // URL to open when notification is clicked
      bookingId: data.bookingId, // Optional: for specific booking details
      type: data.type, // Added for consistency with backend payload if a 'type' field is sent
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  console.log("[Service Worker] Notification click Received.");
  event.notification.close();

  const urlToOpen = event.notification.data.url;

  event.waitUntil(
    clients
      .matchAll({
        type: "window",
        includeUncontrolled: true, // Include clients that are not yet controlled by this service worker
      })
      .then((clientList) => {
        // Look for an existing client that already has the app open.
        for (const client of clientList) {
          if (client.url === urlToOpen && "focus" in client) {
            return client.focus();
          }
        }
        // If no such client is found, open a new window.
        return clients.openWindow(urlToOpen);
      })
  );
});