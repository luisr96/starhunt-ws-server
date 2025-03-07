const WebSocket = require("ws");
const http = require("http");

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const fetchAndParseCSV = require("./starSpawnData");

// Message types
const MESSAGE_TYPES = {
  STAR_UPDATE: "STAR_UPDATE",
  STAR_REMOVE: "STAR_REMOVE",
  STAR_SYNC: "STAR_SYNC",
  SPAWN_TIMES: "SPAWN_TIMES",
};

// Store stars by their unique world identifier
const starMap = new Map();
const clients = new Set();

// Initialize spawn data with an empty array
let currentSpawnData = [];

// Fetch initial spawn data
(async function initializeSpawnData() {
  try {
    currentSpawnData = await fetchAndParseCSV();
    console.log("Initial spawn data loaded");
  } catch (error) {
    console.error("Error loading initial spawn data:", error);
    currentSpawnData = []; // Ensure it's an empty array if fetch fails
  }
})();

wss.on("connection", (ws) => {
  console.log("Client connected");
  clients.add(ws);

  // Send all known stars and spawn data immediately to the new client
  broadcastSync([ws]);

  // Send spawn data to the new client (even if it's empty)
  broadcastMessage(
    {
      type: "SPAWN_TIMES",
      data: currentSpawnData,
    },
    [ws]
  );

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      // console.log("Received message:", data);

      if (!data.type || (data.type && !data.data)) {
        console.warn("Received malformed message:", data);
        return;
      }

      // Handle message based on type
      switch (data.type) {
        case MESSAGE_TYPES.STAR_UPDATE:
          handleStarUpdate(data.data);
          break;
        case MESSAGE_TYPES.STAR_REMOVE:
          handleStarRemove(data.data);
          break;
        default:
          console.warn(`Unhandled message type: ${data.type}`);
      }
    } catch (error) {
      console.error("Error handling message:", error);
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    clients.delete(ws);
  });
});

/**
 * Handle star update messages
 */
function handleStarUpdate(data) {
  const starId = data.world;
  const existingStar = starMap.get(starId);

  // Don't overwrite non-backup with backup
  if (existingStar && existingStar.backup === false && data.backup === true) {
    data.backup = false;
  }

  starMap.set(starId, data);
}

/**
 * Handle star remove messages
 */
function handleStarRemove(data) {
  const starId = data.world;

  if (starMap.has(starId)) {
    console.log(`Removing star from world ${starId} due to despawn`);
    starMap.delete(starId);

    // Broadcast updated star list to all clients
    broadcastSync();
  }
}

/**
 * Broadcasts a message to specified clients or all clients
 */
function broadcastMessage(messageObj, targetClients = null) {
  const clientList = targetClients || clients;
  if (clientList.size === 0) return;

  const message = JSON.stringify(messageObj);

  for (const client of clientList) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }

  console.log(messageObj);
}

/**
 * Broadcasts current star sync to specified clients or all clients
 */
function broadcastSync(targetClients = null) {
  const clientList = targetClients || clients;
  if (clientList.size === 0) return;

  const syncMessage = {
    type: MESSAGE_TYPES.STAR_SYNC,
    data: Array.from(starMap.values()),
  };

  const message = JSON.stringify(syncMessage);

  for (const client of clientList) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }

  console.log("Sent star sync to clients");
  console.log(syncMessage);
}

/**
 * Periodically sync all known stars to clients
 */
setInterval(() => {
  if (clients.size === 0 || starMap.size === 0) return;
  broadcastSync();
}, 5 * 1000); // Every 5 seconds

/**
 * Clean up old stars (longer than 93 min) every 5 minutes
 */
setInterval(() => {
  if (starMap.size === 0) return;

  const now = Date.now();
  let removed = false;

  for (const [starId, star] of starMap.entries()) {
    if (!star.firstFound) continue;

    const firstFoundTime = new Date(star.firstFound).getTime();
    if (now - firstFoundTime > 93 * 60 * 1000) {
      starMap.delete(starId);
      console.log(
        `Removed expired star: ${starId} (found at ${star.firstFound})`
      );
      removed = true;
    }
  }

  // If any stars were removed, broadcast the updated list
  if (removed) {
    broadcastSync();
  }
}, 5 * 60 * 1000); // Every 5 minutes

// Update and broadcast spawn data every minute
setInterval(async () => {
  try {
    currentSpawnData = await fetchAndParseCSV();

    broadcastMessage({
      type: "SPAWN_TIMES",
      data: currentSpawnData,
    });
  } catch (error) {
    console.error("Error fetching spawn data:", error);
  }
}, 1 * 60 * 1000); // Every minute

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Starhunt WebSocket server listening on port ${PORT}`);
});
