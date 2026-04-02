import { appendFile, mkdir, unlink } from "fs/promises";
import { spawn } from "child_process";
import express, { type Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import { setupAuth } from "./auth";
import { apiRateLimiter } from "../middleware/rate-limit";
import {
  escapeXml,
  getSiteUrl,
  getSitemapEntries,
  resolveAbsoluteUrl,
} from "../seo";
import {
  createSocketServer,
  setupSocketAuth,
  setupSocketHandlers,
} from "../socket";
import { registerChatRoutes } from "./chat";
import { jwtAuth } from "../middleware/jwt-auth";
import { registerUserRoutes } from "./users";

const MAX_UPLOAD_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_UPLOAD_VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);
const NORMALIZED_VIDEO_MIME_TYPE = "video/mp4";

const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: MAX_UPLOAD_FILE_SIZE_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype.startsWith("image/") ||
      ALLOWED_UPLOAD_VIDEO_TYPES.has(file.mimetype)
    ) {
      cb(null, true);
      return;
    }

    const error = new Error("Only images, MP4, and WebM files are allowed.");
    (error as Error & { status?: number }).status = 400;
    cb(error);
  },
});

const ALLOWED_SUPPORT_ISSUE_TYPES = new Set([
  "account_deletion",
  "deletion_follow_up",
  "login_problem",
  "privacy_report",
  "other",
]);
const DEFAULT_SUPPORT_REQUESTS_PATH = "runtime/support-requests.ndjson";

type SupportPayload = {
  issueType: string;
  message: string;
};

type SupportRequestRecord = SupportPayload & {
  submittedAt: string;
  ip: string | undefined;
  userAgent: string;
};

function getSupportPayloadValue(body: unknown, key: keyof SupportPayload): string {
  if (!body || typeof body !== "object") {
    return "";
  }

  const value = (body as Partial<Record<keyof SupportPayload, unknown>>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function validateSupportPayload(body: unknown) {
  const issueType = getSupportPayloadValue(body, "issueType");
  const message = getSupportPayloadValue(body, "message");

  if (!ALLOWED_SUPPORT_ISSUE_TYPES.has(issueType)) {
    return { error: "Invalid issue type selected" };
  }

  if (message.length < 20) {
    return { error: "Message must be at least 20 characters long" };
  }

  if (message.length > 5000) {
    return { error: "Message must be less than 5000 characters" };
  }

  return { issueType, message };
}

function resolveSupportRequestsPath() {
  const configuredPath =
    process.env.SUPPORT_REQUESTS_PATH?.trim() || DEFAULT_SUPPORT_REQUESTS_PATH;

  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(process.cwd(), configuredPath);
}

async function persistSupportRequest(request: SupportRequestRecord): Promise<void> {
  const supportRequestsPath = resolveSupportRequestsPath();
  await mkdir(path.dirname(supportRequestsPath), { recursive: true });
  await appendFile(supportRequestsPath, `${JSON.stringify(request)}\n`, "utf8");
}

async function deleteUploadedFile(filePath: string) {
  await unlink(filePath).catch(() => undefined);
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", args, {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";

    ffmpeg.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `ffmpeg exited with code ${code ?? -1}`));
    });
  });
}

async function normalizeUploadedVideo(file: Express.Multer.File) {
  const inputPath = file.path;
  const outputFilename = `${file.filename}.mp4`;
  const outputPath = path.join(path.dirname(inputPath), outputFilename);
  const parsedOriginalName = path.parse(file.originalname);
  const normalizedOriginalName = `${parsedOriginalName.name || "video"}.mp4`;

  try {
    await runFfmpeg([
      "-y",
      "-i",
      inputPath,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-movflags",
      "+faststart",
      "-vf",
      "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "28",
      "-tag:v",
      "avc1",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      outputPath,
    ]);

    await deleteUploadedFile(inputPath);

    return {
      url: `/uploads/${outputFilename}`,
      filename: normalizedOriginalName,
      fileType: NORMALIZED_VIDEO_MIME_TYPE,
    };
  } catch (error) {
    await deleteUploadedFile(outputPath);
    throw error;
  }
}

function registerSystemRoutes(app: Express) {
  app.get("/favicon.ico", (_req, res) => {
    res.redirect(301, "/assets/images/logo-48.png");
  });

  app.get("/robots.txt", (req, res) => {
    const siteUrl = getSiteUrl(req);

    res.set("Cache-Control", "public, max-age=3600").type("text/plain").send(
      ["User-agent: *", "Allow: /", `Sitemap: ${siteUrl}/sitemap.xml`].join(
        "\n",
      ),
    );
  });

  app.get("/sitemap.xml", async (req, res, next) => {
    const siteUrl = getSiteUrl(req);
    try {
      const sitemapEntries = await getSitemapEntries();
      const sitemapXml = sitemapEntries
        .map((entry) => {
          const absoluteUrl = resolveAbsoluteUrl(siteUrl, entry.path);
          const lastModifiedTag = entry.lastModified
            ? `\n    <lastmod>${entry.lastModified}</lastmod>`
            : "";

          return `  <url>
    <loc>${escapeXml(absoluteUrl)}</loc>${lastModifiedTag}
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`;
        })
        .join("\n");

      res
        .set("Cache-Control", "public, max-age=3600")
        .type("application/xml")
        .send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapXml}
</urlset>`);
    } catch (error) {
      next(error);
    }
  });
}

function registerSupportRoutes(app: Express) {
  app.post("/api/help-center", async (req, res, next) => {
    const validation = validateSupportPayload(req.body);

    if ("error" in validation) {
      return res.status(400).json({ message: validation.error });
    }

    const payload: SupportRequestRecord = {
      issueType: validation.issueType,
      message: validation.message,
      submittedAt: new Date().toISOString(),
      ip: req.ip,
      userAgent: req.get("user-agent") ?? "",
    };

    try {
      await persistSupportRequest(payload);
      return res.status(201).json({
        message: "Support request received",
      });
    } catch (error) {
      next(error);
      return;
    }
  });
}

function registerUploadRoutes(app: Express) {
  app.use("/uploads", express.static("uploads"));
  app.post("/api/upload", jwtAuth, (req, res, next) => {
    upload.single("file")(req, res, (error) => {
      if (error) {
        if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
          return res
            .status(400)
            .json({ message: "File size must be less than 5MB" });
        }

        next(error);
        return;
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const uploadedFile = req.file;

      const respondWithUpload = async () => {
        if (ALLOWED_UPLOAD_VIDEO_TYPES.has(uploadedFile.mimetype)) {
          try {
            const normalizedVideo = await normalizeUploadedVideo(uploadedFile);
            return res.json(normalizedVideo);
          } catch (processingError) {
            console.error("Video normalization failed:", processingError);
            await deleteUploadedFile(uploadedFile.path);
            return res.status(500).json({
              message:
                "Video processing failed. Try a different video or upload from another device.",
            });
          }
        }

        return res.json({
          url: `/uploads/${uploadedFile.filename}`,
          filename: uploadedFile.originalname,
          fileType: uploadedFile.mimetype,
        });
      };

      void respondWithUpload().catch(next);
    });
  });
}

export function registerRoutes(app: Express): Server {
  setupAuth(app);
  app.use("/api", apiRateLimiter);
  registerSystemRoutes(app);
  registerSupportRoutes(app);
  registerUploadRoutes(app);

  const httpServer = createServer(app);
  const io = createSocketServer(httpServer);

  registerChatRoutes(app, io);
  registerUserRoutes(app, io);

  setupSocketAuth(io);
  setupSocketHandlers(io);

  return httpServer;
}
