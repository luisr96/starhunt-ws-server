const WebSocket = require("ws");
const http = require("http");

const server = http.createServer();
const wss = new WebSocket.Server({ server });

// Store stars by their unique location identifier
const starMap = new Map();
const clients = new Set();

wss.on("connection", (ws, req) => {
  console.log("Client connected");
  clients.add(ws);

  // Send existing stars to newly connected client
  for (const [starId, star] of starMap.entries()) {
    const message = JSON.stringify({
      type: "STAR_UPDATE",
      data: star,
    });
    ws.send(message);
  }

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      console.log("Received message:", data);

      if (data.type === "STAR_UPDATE" && data.data) {
        const newStar = data.data;
        // World is unique enough to identify a star
        const starId = newStar.world;

        // Check if this star already exists in our map
        const existingStar = starMap.get(starId);

        if (existingStar) {
          // Backup can only change from true to false
          if (existingStar.backup === false && newStar.backup === true) {
            newStar.backup = false;
          }

          // Update the star in the map with the new data
          starMap.set(starId, newStar);
        } else {
          // This is a new star, just save it
          starMap.set(starId, newStar);
        }

        // Broadcast to all clients
        broadcastStar(ws, data);
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

function broadcastStar(sender, starData) {
  const message = JSON.stringify(starData);

  // Let everyone know about this star
  for (const client of clients) {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// Clean up old stars periodically
setInterval(() => {
  const now = new Date();
  for (const [starId, star] of starMap.entries()) {
    // Parse the lastUpdate timestamp
    const lastUpdate = new Date(star.lastUpdate);
    // Remove stars that haven't been updated in the last 30 minutes
    if (now - lastUpdate > 30 * 60 * 1000) {
      starMap.delete(starId);
      console.log(
        `Removed expired star: World ${star.world}, Location: ${star.location}`
      );
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

setInterval(() => {
  console.log("Stars in system");
  console.log(starMap);
}, 10 * 1000); // Log star count every minute

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Starhunt WebSocket server listening on port ${PORT}`);
});
