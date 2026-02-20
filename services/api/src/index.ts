import express from "express";

const app = express();
app.use(express.json());

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "api", ts: new Date().toISOString() });
});

app.listen(8080, () => {
  console.log("API listening on :8080");
});
