const TICK_MS = 60_000; // placeholder: 1 minute dev tick

setInterval(() => {
  console.log(`[tick] ${new Date().toISOString()} game loop heartbeat`);
}, TICK_MS);

console.log("Game server worker started.");
