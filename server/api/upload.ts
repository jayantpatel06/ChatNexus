import { spawn } from "child_process";
import express, { type Express } from "express";
import multer from "multer";
import path from "path";
import { unlink } from "fs/promises";
import { jwtAuth } from "../middleware/jwt-auth";

const UPLOAD_COMPRESSION_THRESHOLD_BYTES = 5 * 1024 * 1024;
const MAX_UPLOAD_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const ALLOWED_UPLOAD_VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);
const NORMALIZED_VIDEO_MIME_TYPE = "video/mp4";
const NORMALIZED_IMAGE_MIME_TYPE = "image/webp";

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
      "-threads",
      process.env.FFMPEG_THREADS || "1",
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-movflags",
      "+faststart",
      "-vf",
      "scale='min(854,iw)':-2",
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
      "-max_muxing_queue_size",
      "1024",
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

async function normalizeUploadedImage(file: Express.Multer.File) {
  const inputPath = file.path;
  const outputFilename = `${file.filename}.webp`;
  const outputPath = path.join(path.dirname(inputPath), outputFilename);
  const parsedOriginalName = path.parse(file.originalname);
  const normalizedOriginalName = `${parsedOriginalName.name || "image"}.webp`;

  try {
    await runFfmpeg([
      "-y",
      "-i",
      inputPath,
      "-threads",
      process.env.FFMPEG_THREADS || "1",
      "-vf",
      "scale='min(1920,iw)':-2:force_original_aspect_ratio=decrease",
      "-quality",
      "75",
      "-compression_level",
      "6",
      outputPath,
    ]);

    await deleteUploadedFile(inputPath);

    return {
      url: `/uploads/${outputFilename}`,
      filename: normalizedOriginalName,
      fileType: NORMALIZED_IMAGE_MIME_TYPE,
    };
  } catch (error) {
    await deleteUploadedFile(outputPath);
    throw error;
  }
}

export function registerUploadRoutes(app: Express) {
  app.use("/uploads", express.static("uploads", {
    dotfiles: "deny",
    index: false,
    setHeaders: (res) => {
      res.set("X-Content-Type-Options", "nosniff");
    },
  }));
  app.post("/api/upload", jwtAuth, (req, res, next) => {
    upload.single("file")(req, res, (error) => {
      if (error) {
        if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
          return res
            .status(400)
            .json({ message: "File size must be less than 20MB" });
        }

        next(error);
        return;
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const uploadedFile = req.file;

      const respondWithUpload = async () => {
        if (uploadedFile.size > UPLOAD_COMPRESSION_THRESHOLD_BYTES) {
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

          try {
            const normalizedImage = await normalizeUploadedImage(uploadedFile);
            return res.json(normalizedImage);
          } catch (processingError) {
            console.error("Image normalization failed:", processingError);
            await deleteUploadedFile(uploadedFile.path);
            return res.status(500).json({
              message:
                "Image processing failed. Try a different image or upload from another device.",
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
