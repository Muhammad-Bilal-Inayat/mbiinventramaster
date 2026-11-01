import "dotenv/config";
import express from "express";
import compression from "compression";
import cors from "cors";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pino from "pino";
import { buildRouter } from "./routes.js";
import { createStore } from "./store.js";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const port = Number(process.env.PORT || 3000);
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../public");

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
// CORS: never reflect any origin in production. Same-origin PWA requests
// do not need CORS. Set CORS_ORIGIN to a comma-separated allow-list for
// any separate frontend origin. Localhost is allowed only outside production.
const allowedOrigins = (process.env.CORS_ORIGIN || "").split(",").map((o) => o.trim()).filter(Boolean);
app.use(cors({
  credentials: true,
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (process.env.NODE_ENV !== "production" && origin.startsWith("http://localhost:")) return callback(null, true);
    return callback(new Error("CORS origin not allowed"));
  },
}));
app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use((request, response, next) => { response.setHeader("x-content-type-options", "nosniff"); response.setHeader("x-frame-options", "SAMEORIGIN"); next(); });

const store = await createStore();
app.use(buildRouter(store));
app.use(express.static(publicDir, { extensions: ["html"] }));
app.use((_request, response) => response.sendFile(path.join(publicDir, "index.html")));

const server = app.listen(port, "0.0.0.0", () => logger.info({ port, publicDir }, "MBI Inventra API ready"));
const shutdown = () => server.close(() => process.exit(0));
process.on("SIGTERM", shutdown); process.on("SIGINT", shutdown);
