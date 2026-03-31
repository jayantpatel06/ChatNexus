import "dotenv/config";
import express from "express";

import type { NextFunction, Request, Response } from "express";
import { setupVite, serveStatic, log } from "./vite";

const APP_HOST = "0.0.0.0";

function getServerPort() {
  return parseInt(process.env.PORT || "5000", 10);
}

function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  res.status(status).json({ message });
  console.error("Unhandled error:", err);
}

function requestLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      const contentLength = res.getHeader("content-length");
      const sizeSuffix =
        typeof contentLength === "number" || typeof contentLength === "string"
          ? ` ${contentLength}b`
          : "";

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms${sizeSuffix}`;

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 77) + "...";
      }

      log(logLine);
    }
  });

  next();
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(requestLoggingMiddleware);

(async () => {
  const [{ registerRoutes }, { ensureDatabaseReady }, { assertJwtSecretConfigured }] =
    await Promise.all([
      import("./api/routes"),
      import("./db/prisma"),
      import("./lib/jwt"),
    ]);

  assertJwtSecretConfigured();
  await ensureDatabaseReady();

  const server = registerRoutes(app);

  app.use(errorHandler);

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = getServerPort();
  server.listen(
    {
      port,
      host: APP_HOST,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})().catch((error) => {
  console.error("Server bootstrap failed:", error);
  process.exit(1);
});
