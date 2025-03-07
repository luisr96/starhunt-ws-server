const axios = require("axios");
const csv = require("csv-parser");

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/17rGbgylW_IPQHaHUW1WsJAhuWI7y2WhplQR79g-obqg/gviz/tq?tqx=out:csv&gid=1417940817";

async function fetchAndParseCSV() {
  try {
    const response = await axios.get(CSV_URL, { responseType: "stream" });

    const results = [];
    let rowCount = 0;

    return new Promise((resolve, reject) => {
      response.data
        .pipe(csv({ headers: false })) // Don't use first row as headers
        .on("data", (row) => {
          rowCount++;
          if (rowCount <= 3) return; // Skip 3 rows

          const rowArray = Object.values(row).map((value) =>
            value ? value.toString().normalize("NFKC") : ""
          );

          if (rowArray.length >= 2) {
            results.push({
              world: rowArray[0], // Column A (World)
              avgSpawn: rowArray[1], // Column B (Avg spawn)
            });
          }
        })
        .on("end", () => {
          resolve(results); // Return the results when parsing finishes
        })
        .on("error", (error) => {
          reject(error); // Handle any errors during streaming
        });
    });
  } catch (error) {
    console.error("Error fetching CSV:", error);
  }
}

module.exports = fetchAndParseCSV;
