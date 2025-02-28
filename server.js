const WebSocket = require("ws");
const http = require("http");
const url = require("url");

const server = http.createServer();
const wss = new WebSocket.Server({ server });

// Store stars by their unique location identifier
const starMap = new Map();
const clients = new Set();

// Track usage metrics
let messageRateCounter = 0;
let lastRateReset = Date.now();
const stats = {
  totalConnections: 0,
  peakConcurrentConnections: 0,
  messagesPerMinute: 0,
  totalMessages: 0,
  activeStars: 0,
};

wss.on("connection", (ws, req) => {
  console.log("Client connected");
  clients.add(ws);

  // Update connection stats
  stats.totalConnections++;
  stats.peakConcurrentConnections = Math.max(
    stats.peakConcurrentConnections,
    clients.size
  );

  // Send current star data to new clients
  const stars = Array.from(starMap.values());
  if (stars.length > 0) {
    ws.send(
      JSON.stringify({
        type: "STAR_UPDATE",
        data: stars,
      })
    );
  }

  ws.on("message", (message) => {
    try {
      messageRateCounter++;
      stats.totalMessages++;

      const data = JSON.parse(message);

      if (data.type === "STAR_UPDATE" && data.data) {
        const star = data.data;
        const starId = `${star.world}_${star.worldPoint.x}_${star.worldPoint.y}`;

        // Only broadcast if we have new/better data
        const updated = processStarUpdate(star, starId);
        if (updated) {
          broadcastStar(ws, starMap.get(starId));
        }

        console.log(
          `Star update: World ${star.world}, Tier ${star.tier}, Location: ${star.location}`
        );
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

function processStarUpdate(star, starId) {
  const existingStar = starMap.get(starId);

  // New star - just store it
  if (!existingStar) {
    starMap.set(starId, star);
    return true;
  }

  // Merge with existing star data based on our priority rules
  let updated = false;

  // Higher tier = fresher star, always take this data
  if (star.tier > existingStar.tier) {
    existingStar.tier = star.tier;
    existingStar.active = true;
    existingStar.health = 100; // Reset health for new tier
    updated = true;
  }

  // Take newer health readings
  if (
    star.health >= 0 &&
    (existingStar.health < 0 || star.lastUpdate > existingStar.lastUpdate)
  ) {
    existingStar.health = star.health;
    updated = true;
  }

  // Better miner count data
  if (
    star.miners !== "?" &&
    (existingStar.miners === "?" || star.lastUpdate > existingStar.lastUpdate)
  ) {
    existingStar.miners = star.miners;
    updated = true;
  }

  // Stars can go inactive but not the other way around
  if (existingStar.active && !star.active) {
    existingStar.active = false;
    updated = true;
  }

  if (updated) {
    existingStar.lastUpdate = star.lastUpdate;
  }

  return updated;
}

function broadcastStar(sender, star) {
  const message = JSON.stringify({
    type: "STAR_UPDATE",
    data: star,
  });

  // Let everyone know about this star
  let broadcastCount = 0;
  for (const client of clients) {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(message);
      broadcastCount++;
    }
  }

  // Also tell the original sender so they see the final merged data
  if (sender && sender.readyState === WebSocket.OPEN) {
    sender.send(message);
  }
}

// Log server performance each minute
setInterval(() => {
  const now = Date.now();
  const minutesPassed = (now - lastRateReset) / 60000;

  stats.messagesPerMinute = Math.round(messageRateCounter / minutesPassed);
  stats.activeStars = starMap.size;

  console.log("Server stats:", stats);

  messageRateCounter = 0;
  lastRateReset = now;
}, 60000);

// Clean up stale data every 5 minutes
setInterval(() => {
  const now = Date.now();
  const twoHoursAgo = now - 2 * 60 * 60 * 1000;

  for (const [starId, star] of starMap.entries()) {
    if (
      !star.active ||
      (star.lastUpdate && new Date(star.lastUpdate).getTime() < twoHoursAgo)
    ) {
      starMap.delete(starId);
      console.log(`Removed old star: ${starId}`);
    }
  }
}, 5 * 60 * 1000);

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Starhunt WebSocket server listening on port ${PORT}`);
});
