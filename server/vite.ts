import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger, type UserConfigExport } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import {
  applySeoToHtml,
  getSiteUrl,
  isAssetLikePath,
  normalizePathname,
  resolveSeoPage,
} from "./seo";

const viteLogger = createLogger();

async function resolveViteConfig(config: UserConfigExport) {
  return typeof config === 'function'
    ? await config({ command: 'serve', mode: process.env.NODE_ENV ?? 'development' })
    : config;
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

function setRobotsHeader(
  res: express.Response,
  robots: string,
) {
  if (/noindex/i.test(robots)) {
    res.setHeader("X-Robots-Tag", robots);
  } else {
    res.removeHeader("X-Robots-Tag");
  }
}

function sendSeoDocument(
  res: express.Response,
  pathname: string,
  template: string,
  siteUrl: string,
) {
  const seoPage = resolveSeoPage(pathname);
  const html = applySeoToHtml(
    template,
    seoPage,
    siteUrl,
    res.locals.cspNonce ?? "",
  );

  setRobotsHeader(res, seoPage.robots);

  res
    .status(seoPage.statusCode)
    .set({ "Content-Type": "text/html; charset=utf-8" })
    .end(html);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const resolvedViteConfig = await resolveViteConfig(viteConfig);

  const vite = await createViteServer({
    ...resolvedViteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use(async (req, res, next) => {
    const url = req.originalUrl;
    const pathname = normalizePathname(req.path);

    if (isAssetLikePath(pathname)) {
      res.status(404).end();
      return;
    }

    try {
      const clientTemplate = path.resolve(
        process.cwd(),
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      sendSeoDocument(res, pathname, page, getSiteUrl(req));
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(process.cwd(), "dist", "public");
  let cachedTemplate: string | null = null;

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath, { index: false }));

  // fall through to index.html if the file doesn't exist
  app.use(async (req, res, next) => {
    const pathname = normalizePathname(req.path);
    if (isAssetLikePath(pathname)) {
      res.status(404).end();
      return;
    }

    try {
      if (!cachedTemplate) {
        cachedTemplate = await fs.promises.readFile(
          path.resolve(distPath, "index.html"),
          "utf-8",
        );
      }

      sendSeoDocument(res, pathname, cachedTemplate, getSiteUrl(req));
    } catch (error) {
      next(error);
    }
  });
}
