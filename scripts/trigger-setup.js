const http = require("http");

function fetch(url) {
  return new Promise((resolve, reject) => {
    console.log(`Fetching ${url}...`);
    http
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          console.log(`Response from ${url}: Status ${res.statusCode}`);
          console.log(data);
          resolve();
        });
      })
      .on("error", (err) => {
        console.log(`Error fetching ${url}: ${err.message}`);
        resolve(); // Resolve anyway to try next
      });
  });
}

async function run() {
  await fetch("http://localhost:5173/api/setup-db");
  await fetch("http://localhost:3000/api/setup-db");
  await fetch("http://localhost:3001/api/setup-db");
}

run();
