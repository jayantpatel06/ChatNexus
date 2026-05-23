import type { Server as SocketIOServer, Socket } from "socket.io";
import { storage } from "../storage";
import { messageRateLimiter } from "../middleware/rate-limit";
import { hasActiveSocketForUser } from "./connection";
import type {
  RandomChatRequestPayload,
  RandomChatMessagePayload,
  RandomChatPreferences,
  RandomChatQueueEntry,
  RandomChatSession,
} from "./types";

export const randomChatActiveUsers = new Set<number>();
export const randomChatPreferencesByUser = new Map<number, RandomChatPreferences>();
export const randomChatQueueByUser = new Map<number, RandomChatQueueEntry>();
export const randomChatSessionsByUser = new Map<number, RandomChatSession>();

export let pendingRandomChatMatchProcessing: Promise<void> | null = null;
export let rerunRandomChatMatchProcessing = false;

export function sanitizeRandomChatPreferences(
  payload?: RandomChatRequestPayload | null,
): RandomChatPreferences {
  const resolvedPayload = payload ?? {};
  const rawInterests = Array.isArray(resolvedPayload.interests)
    ? resolvedPayload.interests
    : [];
  const interests = Array.from(
    new Set(
      rawInterests
        .map((interest) =>
          typeof interest === "string" ? interest.trim().slice(0, 24) : "",
        )
        .filter(Boolean),
    ),
  ).slice(0, 10);

  const rawMaxWaitDurationSeconds =
    typeof resolvedPayload.maxWaitDurationSeconds === "number"
      ? resolvedPayload.maxWaitDurationSeconds
      : typeof resolvedPayload.maxWaitDurationSeconds === "string"
        ? Number(resolvedPayload.maxWaitDurationSeconds)
        : Number.NaN;
  const maxWaitDurationSeconds = !Number.isFinite(rawMaxWaitDurationSeconds)
    ? 15
    : rawMaxWaitDurationSeconds === 0
      ? 0
      : Math.min(120, Math.max(5, Math.round(rawMaxWaitDurationSeconds)));

  return {
    interests,
    interestsMatchingEnabled: resolvedPayload.interestsMatchingEnabled !== false,
    maxWaitDurationSeconds,
  };
}

export function shouldPreserveRandomChatQueuePosition(
  payload?: RandomChatRequestPayload | null,
): boolean {
  return payload?.preserveQueuePosition === true;
}

export function getRandomChatSearchMessage(
  payload?: RandomChatRequestPayload | null,
): string | null {
  if (typeof payload?.searchMessage !== "string") {
    return null;
  }

  const message = payload.searchMessage.trim();
  return message ? message.slice(0, 140) : null;
}

export function getRandomChatPartnerId(userId: number): number | null {
  const session = randomChatSessionsByUser.get(userId);
  if (!session) {
    return null;
  }

  return session.userAId === userId ? session.userBId : session.userAId;
}

export function getRandomChatSharedInterests(
  left: RandomChatPreferences,
  right: RandomChatPreferences,
): string[] {
  const rightInterests = new Set(
    right.interests.map((interest) => interest.toLowerCase()),
  );

  return left.interests.filter((interest) =>
    rightInterests.has(interest.toLowerCase()),
  );
}

export function queueRandomChatUser(
  userId: number,
  preferences?: RandomChatPreferences,
  queuedAt = Date.now(),
): RandomChatQueueEntry {
  const resolvedPreferences =
    preferences ??
    randomChatPreferencesByUser.get(userId) ?? {
      interests: [],
      interestsMatchingEnabled: true,
      maxWaitDurationSeconds: 15,
    };

  randomChatPreferencesByUser.set(userId, resolvedPreferences);

  const queueEntry: RandomChatQueueEntry = {
    userId,
    queuedAt,
    ...resolvedPreferences,
  };

  randomChatQueueByUser.set(userId, queueEntry);
  randomChatActiveUsers.add(userId);

  return queueEntry;
}

export function removeRandomChatSession(userId: number): number | null {
  const partnerId = getRandomChatPartnerId(userId);
  if (partnerId === null) {
    return null;
  }

  randomChatSessionsByUser.delete(userId);
  randomChatSessionsByUser.delete(partnerId);

  return partnerId;
}

export function emitRandomChatSearching(
  io: SocketIOServer,
  userId: number,
  message = "Looking for a new conversation...",
) {
  io.to(`user:${userId}`).emit("random_chat_searching", { message });
}

export async function findBestRandomChatCandidate(
  userId: number,
): Promise<{ otherUserId: number; sharedInterests: string[] } | null> {
  const sourceEntry = randomChatQueueByUser.get(userId);
  if (!sourceEntry) {
    return null;
  }

  const restrictedUserIds = new Set(await storage.getRestrictedUserIds(userId));

  let bestCandidate:
    | {
        otherUserId: number;
        queuedAt: number;
        score: number;
        sharedInterests: string[];
      }
    | null = null;

  for (const [otherUserId, otherEntry] of randomChatQueueByUser.entries()) {
    if (otherUserId === userId) {
      continue;
    }

    if (
      randomChatSessionsByUser.has(otherUserId) ||
      !randomChatActiveUsers.has(otherUserId) ||
      !hasActiveSocketForUser(otherUserId) ||
      restrictedUserIds.has(otherUserId)
    ) {
      continue;
    }

    const sharedInterests = getRandomChatSharedInterests(sourceEntry, otherEntry);
    const now = Date.now();
    const sourceRequiresInterestMatch =
      sourceEntry.interestsMatchingEnabled &&
      sourceEntry.interests.length > 0 &&
      (sourceEntry.maxWaitDurationSeconds === 0 ||
        now - sourceEntry.queuedAt <
          sourceEntry.maxWaitDurationSeconds * 1000);
    const otherRequiresInterestMatch =
      otherEntry.interestsMatchingEnabled &&
      otherEntry.interests.length > 0 &&
      (otherEntry.maxWaitDurationSeconds === 0 ||
        now - otherEntry.queuedAt <
          otherEntry.maxWaitDurationSeconds * 1000);

    if (
      (sourceRequiresInterestMatch || otherRequiresInterestMatch) &&
      sharedInterests.length === 0
    ) {
      continue;
    }

    const score = sharedInterests.length * 1000 - otherEntry.queuedAt;

    if (
      !bestCandidate ||
      score > bestCandidate.score ||
      (score === bestCandidate.score && otherEntry.queuedAt < bestCandidate.queuedAt)
    ) {
      bestCandidate = {
        otherUserId,
        queuedAt: otherEntry.queuedAt,
        score,
        sharedInterests,
      };
    }
  }

  if (!bestCandidate) {
    return null;
  }

  return {
    otherUserId: bestCandidate.otherUserId,
    sharedInterests: bestCandidate.sharedInterests,
  };
}

export async function createRandomChatSession(
  io: SocketIOServer,
  userAId: number,
  userBId: number,
  sharedInterests: string[],
): Promise<void> {
  const users = await storage.getUsersByIds([userAId, userBId]);
  const userMap = new Map(users.map((user) => [user.userId, user]));
  const userA = userMap.get(userAId);
  const userB = userMap.get(userBId);

  if (!userA || !userB) {
    randomChatQueueByUser.delete(userAId);
    randomChatQueueByUser.delete(userBId);
    return;
  }

  if (!hasActiveSocketForUser(userAId) || !hasActiveSocketForUser(userBId)) {
    if (!hasActiveSocketForUser(userAId)) {
      randomChatQueueByUser.delete(userAId);
      randomChatActiveUsers.delete(userAId);
    }

    if (!hasActiveSocketForUser(userBId)) {
      randomChatQueueByUser.delete(userBId);
      randomChatActiveUsers.delete(userBId);
    }

    return;
  }

  randomChatQueueByUser.delete(userAId);
  randomChatQueueByUser.delete(userBId);

  const session: RandomChatSession = {
    userAId,
    userBId,
    startedAt: Date.now(),
  };

  randomChatSessionsByUser.set(userAId, session);
  randomChatSessionsByUser.set(userBId, session);

  io.to(`user:${userAId}`).emit("random_chat_matched", {
    partner: userB,
    sharedInterests,
  });
  io.to(`user:${userBId}`).emit("random_chat_matched", {
    partner: userA,
    sharedInterests,
  });
}

export async function processRandomChatQueue(io: SocketIOServer): Promise<void> {
  if (pendingRandomChatMatchProcessing) {
    rerunRandomChatMatchProcessing = true;
    return pendingRandomChatMatchProcessing;
  }

  pendingRandomChatMatchProcessing = (async () => {
    do {
      rerunRandomChatMatchProcessing = false;

      for (const userId of Array.from(randomChatQueueByUser.keys())) {
        if (
          !randomChatQueueByUser.has(userId) ||
          randomChatSessionsByUser.has(userId) ||
          !randomChatActiveUsers.has(userId) ||
          !hasActiveSocketForUser(userId)
        ) {
          continue;
        }

        const candidate = await findBestRandomChatCandidate(userId);
        if (!candidate) {
          continue;
        }

        if (
          !randomChatQueueByUser.has(userId) ||
          !randomChatQueueByUser.has(candidate.otherUserId)
        ) {
          continue;
        }

        await createRandomChatSession(
          io,
          userId,
          candidate.otherUserId,
          candidate.sharedInterests,
        );
      }
    } while (rerunRandomChatMatchProcessing);
  })()
    .catch((error) => {
      console.error("Random chat matchmaking failed:", error);
    })
    .finally(() => {
      pendingRandomChatMatchProcessing = null;
    });

  return pendingRandomChatMatchProcessing;
}

export async function endRandomChatForUser(
  io: SocketIOServer,
  userId: number,
  options?: {
    notifyPartner?: boolean;
    partnerMessage?: string;
    requeuePartner?: boolean;
  },
): Promise<void> {
  const partnerId = removeRandomChatSession(userId);
  if (partnerId === null) {
    return;
  }

  const shouldRequeuePartner =
    options?.requeuePartner === true &&
    randomChatActiveUsers.has(partnerId) &&
    hasActiveSocketForUser(partnerId);

  if (options?.notifyPartner !== false) {
    io.to(`user:${partnerId}`).emit("random_chat_session_ended", {
      message:
        options?.partnerMessage ??
        (shouldRequeuePartner
          ? "The user has skipped the chat. Looking for a new conversation..."
          : "The user has skipped the chat."),
      requeued: shouldRequeuePartner,
    });
  }

  if (shouldRequeuePartner) {
    queueRandomChatUser(partnerId);
    emitRandomChatSearching(
      io,
      partnerId,
      options?.partnerMessage ??
        "The user has skipped the chat. Looking for a new conversation...",
    );
    await processRandomChatQueue(io);
  }
}

export async function handleRandomChatRequestMatch(
  socket: Socket,
  io: SocketIOServer,
  payload: RandomChatRequestPayload,
): Promise<void> {
  if (!socket.userId) {
    return;
  }

  const preferences = sanitizeRandomChatPreferences(payload);
  randomChatPreferencesByUser.set(socket.userId, preferences);
  randomChatActiveUsers.add(socket.userId);
  randomChatQueueByUser.delete(socket.userId);

  await endRandomChatForUser(io, socket.userId, {
    partnerMessage: "The user has skipped the chat.",
  });

  queueRandomChatUser(socket.userId, preferences);
  emitRandomChatSearching(
    io,
    socket.userId,
    getRandomChatSearchMessage(payload) ?? "Looking for a new conversation...",
  );
  await processRandomChatQueue(io);
}

export async function handleRandomChatUpdatePreferences(
  socket: Socket,
  io: SocketIOServer,
  payload: RandomChatRequestPayload,
): Promise<void> {
  if (!socket.userId) {
    return;
  }

  const preferences = sanitizeRandomChatPreferences(payload);
  randomChatPreferencesByUser.set(socket.userId, preferences);

  if (randomChatQueueByUser.has(socket.userId)) {
    const queuedAt = shouldPreserveRandomChatQueuePosition(payload)
      ? randomChatQueueByUser.get(socket.userId)?.queuedAt ?? Date.now()
      : Date.now();
    queueRandomChatUser(socket.userId, preferences, queuedAt);
    emitRandomChatSearching(
      io,
      socket.userId,
      getRandomChatSearchMessage(payload) ?? "Looking for a new conversation...",
    );
    await processRandomChatQueue(io);
  }
}

export async function handleRandomChatLeave(
  socket: Socket,
  io: SocketIOServer,
): Promise<void> {
  if (!socket.userId) {
    return;
  }

  randomChatActiveUsers.delete(socket.userId);
  randomChatQueueByUser.delete(socket.userId);
  await endRandomChatForUser(io, socket.userId, {
    partnerMessage: "The user has skipped the chat.",
  });
}

export function handleRandomChatMessage(
  socket: Socket,
  io: SocketIOServer,
  payload?: RandomChatMessagePayload | null,
): void {
  if (!socket.userId) {
    return;
  }

  const rateLimit = messageRateLimiter.consume(`random:${socket.userId}`);
  if (!rateLimit.allowed) {
    socket.emit("random_chat_error", {
      message: messageRateLimiter.message,
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
    return;
  }

  const partnerId = getRandomChatPartnerId(socket.userId);
  if (partnerId === null) {
    socket.emit("random_chat_error", {
      message: "You are not currently matched with anyone.",
    });
    return;
  }

  const message =
    typeof payload?.message === "string"
      ? payload.message.trim().slice(0, 2000)
      : "";
  if (!message) {
    socket.emit("random_chat_error", {
      message: "Message cannot be empty.",
    });
    return;
  }

  const eventPayload = {
    message: {
      id: `r-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      senderId: socket.userId,
      message,
      timestamp: new Date().toISOString(),
    },
  };

  io.to(`user:${socket.userId}`)
    .to(`user:${partnerId}`)
    .emit("random_chat_message", eventPayload);
}

export function handleRandomChatTyping(
  socket: Socket,
  io: SocketIOServer,
  isTyping: boolean,
): void {
  if (!socket.userId) {
    return;
  }

  const partnerId = getRandomChatPartnerId(socket.userId);
  if (partnerId === null) {
    return;
  }

  io.to(`user:${partnerId}`).emit("random_chat_typing", {
    isTyping,
    userId: socket.userId,
  });
}
