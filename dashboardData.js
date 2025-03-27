const axios = require("axios");
const csv = require("csv-parser");

// Base URL for the CSV export
const BASE_CSV_URL =
  "https://docs.google.com/spreadsheets/d/17rGbgylW_IPQHaHUW1WsJAhuWI7y2WhplQR79g-obqg/export?format=csv&gid=1500701349";

async function fetchDashboardData() {
  try {
    // Add cache-busting timestamp to prevent cached responses
    const timestamp = Date.now();
    const csvUrl = `${BASE_CSV_URL}&cachebust=${timestamp}`;

    const response = await axios.get(csvUrl, {
      responseType: "stream",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });

    return new Promise((resolve, reject) => {
      const rows = [];

      response.data
        .pipe(csv({ headers: false }))
        .on("data", (row) => {
          // Convert object values to array for easier access
          const rowArray = Object.values(row).map((value) =>
            value ? value.toString().normalize("NFKC") : ""
          );
          rows.push(rowArray);
        })
        .on("end", () => {
          // Initialize with default values
          const dashboardData = {
            waveEndsIn: "Unknown",
            timeSinceWaveBegan: "Unknown",
            startScoutingIn: "Scout now",
            spawnPhaseStatus: "Unknown",
          };

          // Look through all rows for matching patterns, being more flexible
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length < 2) continue;

            // Get all cell values, trimming whitespace
            const cells = row.map((cell) => (cell ? cell.trim() : ""));

            // Search all cells for our key patterns, extracting values from next column
            for (let j = 0; j < cells.length - 1; j++) {
              const cellText = cells[j].toLowerCase();

              // Look for keywords regardless of special characters
              if (
                cellText.includes("minutes until end of wave") ||
                cellText.includes("wave ends")
              ) {
                // Value should be in the next column
                const value = cells[j + 1];
                if (value && value !== "") {
                  dashboardData.waveEndsIn = value;
                }
              } else if (
                cellText.includes("time since wave began") ||
                cellText.includes("wave began")
              ) {
                const value = cells[j + 1];
                if (value && value !== "") {
                  dashboardData.timeSinceWaveBegan = value;
                }
              } else if (
                cellText.includes("when to start scouting") ||
                cellText.includes("start scouting")
              ) {
                const value = cells[j + 1];
                if (value && value !== "") {
                  dashboardData.startScoutingIn = value;
                } else {
                  console.log(
                    "Empty startScoutingIn value, defaulting to 'Scout now'"
                  );
                }
              } else if (
                cellText.includes("time until spawn phase ends") ||
                cellText.includes("spawn phase")
              ) {
                const value = cells[j + 1];
                if (value && value !== "") {
                  if (value.toLowerCase().includes("fully")) {
                    dashboardData.spawnPhaseStatus = "Fully spawned";
                  } else {
                    dashboardData.spawnPhaseStatus = value;
                  }
                }
              }
            }
          }

          resolve(dashboardData);
        })
        .on("error", (error) => {
          console.error("Error parsing dashboard CSV:", error);
          reject(error);
        });
    });
  } catch (error) {
    console.error("Error fetching dashboard CSV:", error);
    return {
      waveEndsIn: "Unknown",
      timeSinceWaveBegan: "Unknown",
      startScoutingIn: "Scout now",
      spawnPhaseStatus: "Unknown",
    };
  }
}

module.exports = fetchDashboardData;
