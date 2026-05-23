import { appendFile, mkdir } from "fs/promises";
import type { Express } from "express";
import path from "path";

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

export function registerSupportRoutes(app: Express) {
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
