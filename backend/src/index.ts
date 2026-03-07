import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import processRoutes from "./routes/process.js";
import logsRoutes from "./routes/logs.js";
import queryRoutes from "./routes/query.js";
import transcribeRoutes from "./routes/transcribe.js";
import digestRoutes from "./routes/digest.js";
import insightsRoutes from "./routes/insights.js";

const app = new Hono();

app.use("/*", logger());
app.use("/*", cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type"],
}));

app.route("/api/process", processRoutes);
app.route("/api/logs", logsRoutes);
app.route("/api/query", queryRoutes);
app.route("/api/transcribe", transcribeRoutes);
app.route("/api/digest", digestRoutes);
app.route("/api/insights", insightsRoutes);

app.get("/api/health", (c) => c.json({ status: "ok" }));

const port = parseInt(process.env.PORT || "3001", 10);

serve({ fetch: app.fetch, port }, () => {
  console.log(`Backend running on http://localhost:${port}`);
});
