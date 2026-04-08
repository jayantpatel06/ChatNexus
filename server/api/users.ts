import type { Express, NextFunction, Request, Response } from "express";
import type { Server as SocketIOServer } from "socket.io";
import {
  updateUserProfileSchema,
  type DbUser,
  type SelfUserProfile,
  type UpdateUserProfile,
  type User,
} from "@shared/schema";
import { jwtAuth, primeJwtUserCache } from "../middleware/jwt-auth";
import { signToken } from "../lib/jwt";
import { isPrismaUniqueConstraintError } from "../lib/prisma-errors";
import { toPublicUser } from "../lib/user-utils";
import { emitSidebarUsers, getSidebarUsersForUser } from "../socket";
import { storage } from "../storage";


function toSelfUserProfile(user: DbUser): SelfUserProfile {
  const { passwordHash: _passwordHash, ...profile } = user;
  return profile;
}

function validateUsername(username: unknown, currentUsername: string) {
  if (!username || typeof username !== "string" || username.trim().length === 0) {
    return { error: "Username is required" };
  }

  const trimmedUsername = username.trim();

  if (trimmedUsername.length < 2) {
    return { error: "Username must be at least 2 characters long" };
  }

  if (trimmedUsername.length > 20) {
    return { error: "Username must be less than 20 characters" };
  }

  if (trimmedUsername === currentUsername) {
    return { error: "Please choose a different username" };
  }

  return { username: trimmedUsername };
}

function parseTargetUserId(rawUserId: unknown) {
  const userId = Number(rawUserId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return { error: "Invalid user ID" as const };
  }

  return { userId };
}

function parseFriendRequestId(rawRequestId: unknown) {
  const requestId = Number(rawRequestId);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return { error: "Invalid friend request ID" as const };
  }

  return { requestId };
}

function parseFriendRequestAction(action: unknown) {
  if (action === "accept" || action === "reject") {
    return { action: action as "accept" | "reject" };
  }

  return { error: "Invalid friend request action" as const };
}

function parseUserIdsQuery(rawValue: unknown) {
  if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
    return { error: "At least one user ID is required" as const };
  }

  const userIds = Array.from(
    new Set(
      rawValue
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  );

  if (userIds.length === 0) {
    return { error: "Invalid user IDs" as const };
  }

  if (userIds.length > 100) {
    return { error: "Too many user IDs requested" as const };
  }

  return { userIds };
}

function parseProfileUpdatePayload(body: unknown): UpdateUserProfile {
  return updateUserProfileSchema.parse(body);
}

function buildFriendshipStatus(
  userId: number,
  friendship: Awaited<ReturnType<typeof storage.getFriendship>>,
  block?: Awaited<ReturnType<typeof storage.getBlockBetweenUsers>>,
  pendingRequest?: Awaited<ReturnType<typeof storage.getPendingFriendRequestBetweenUsers>>,
) {
  return {
    isFriend: !!friendship,
    friendship,
    isBlocked: !!block,
    block: block ?? null,
    blockedByMe: block?.blockerId === userId,
    blockedByUser: block?.blockedId === userId,
    pendingRequest: block ? null : (pendingRequest ?? null),
    pendingDirection:
      block || !pendingRequest
        ? null
        : pendingRequest.senderId === userId
          ? ("outgoing" as const)
          : ("incoming" as const),
  };
}


async function getRelationshipStatus(userId: number, otherUserId: number) {
  const [friendship, block] = await Promise.all([
    storage.getFriendship(userId, otherUserId),
    storage.getBlockBetweenUsers(userId, otherUserId),
  ]);

  const pendingRequest =
    friendship || block
      ? undefined
      : await storage.getPendingFriendRequestBetweenUsers(userId, otherUserId);

  return buildFriendshipStatus(userId, friendship, block, pendingRequest);
}

async function emitRelationshipStatusUpdate(
  io: SocketIOServer,
  userAId: number,
  userBId: number,
  reason: "friend_request" | "remove_friend" | "block_user" | "unblock_user",
  extra?: Record<string, unknown>,
) {
  const [userAStatus, userBStatus] = await Promise.all([
    getRelationshipStatus(userAId, userBId),
    getRelationshipStatus(userBId, userAId),
  ]);

  const payload = {
    userAId,
    userBId,
    reason,
    userAStatus,
    userBStatus,
    ...extra,
  };

  io.to(`user:${userAId}`).emit("relationship_status_updated", payload);
  io.to(`user:${userBId}`).emit("relationship_status_updated", payload);
}

async function updateUsername(userId: number, username: string) {
  const existingUser = await storage.getUserByUsername(username);
  if (existingUser) {
    return { error: "Username already exists" as const, status: 400 as const };
  }

  let updatedUser: DbUser | undefined;
  try {
    updatedUser = await storage.updateUserUsername(userId, username);
  } catch (error) {
    if (isPrismaUniqueConstraintError(error, "username")) {
      return { error: "Username already exists" as const, status: 400 as const };
    }
    throw error;
  }

  if (!updatedUser) {
    return {
      error: "Failed to update username" as const,
      status: 500 as const,
    };
  }

  primeJwtUserCache(updatedUser);
  return { user: toPublicUser(updatedUser), token: signToken(updatedUser) };
}

async function getSelfProfile(userId: number) {
  const user = await storage.getUser(userId);
  if (!user) {
    return { error: "User not found" as const, status: 404 as const };
  }

  return { profile: toSelfUserProfile(user) };
}

async function getBlockedUsers(userId: number) {
  return { users: await storage.getBlockedUsers(userId) };
}

async function updateMemberProfile(user: DbUser, profile: UpdateUserProfile) {
  if (user.isGuest) {
    return {
      error: "Guest accounts cannot edit profile details" as const,
      status: 403 as const,
    };
  }

  if (profile.username !== user.username) {
    const existingUser = await storage.getUserByUsername(profile.username);
    if (existingUser && existingUser.userId !== user.userId) {
      return { error: "Username already exists" as const, status: 400 as const };
    }
  }

  let updatedUser: DbUser | undefined;
  try {
    updatedUser = await storage.updateUserProfile(user.userId, {
      username: profile.username,
      age: profile.age,
    });
  } catch (error) {
    if (isPrismaUniqueConstraintError(error, "username")) {
      return { error: "Username already exists" as const, status: 400 as const };
    }
    throw error;
  }

  if (!updatedUser) {
    return {
      error: "Failed to update profile" as const,
      status: 500 as const,
    };
  }

  primeJwtUserCache(updatedUser);
  return {
    user: toPublicUser(updatedUser),
    profile: toSelfUserProfile(updatedUser),
    token: signToken(updatedUser),
  };
}

async function getFriendshipStatus(userId: number, otherUserId: number) {
  return getRelationshipStatus(userId, otherUserId);
}

async function sendFriendRequest(userId: number, otherUserId: number) {
  if (userId === otherUserId) {
    return {
      error: "You cannot add yourself as a friend" as const,
      status: 400 as const,
    };
  }

  const currentUser = await storage.getUser(userId);
  const otherUser = await storage.getUser(otherUserId);

  if (!currentUser || !otherUser) {
    return { error: "User not found" as const, status: 404 as const };
  }

  if (currentUser.isGuest) {
    return {
      error: "Register an account to add friends" as const,
      status: 400 as const,
    };
  }

  if (otherUser.isGuest) {
    return {
      error: "Guest accounts cannot be added as friends" as const,
      status: 400 as const,
    };
  }

  const relationshipBlock = await storage.getBlockBetweenUsers(userId, otherUserId);
  if (relationshipBlock) {
    return {
      error:
        relationshipBlock.blockerId === userId
          ? ("Unblock this user before sending a friend request" as const)
          : ("This user has blocked you" as const),
      status: 400 as const,
    };
  }

  const existingFriendship = await storage.getFriendship(userId, otherUserId);
  if (existingFriendship) {
    return buildFriendshipStatus(userId, existingFriendship, undefined);
  }

  const existingPendingRequest = await storage.getPendingFriendRequestBetweenUsers(
    userId,
    otherUserId,
  );
  if (existingPendingRequest) {
    return buildFriendshipStatus(
      userId,
      undefined,
      undefined,
      existingPendingRequest,
    );
  }

  const pendingRequest = await storage.createFriendRequest(userId, otherUserId);
  if (!pendingRequest) {
    return {
      error: "Failed to send friend request" as const,
      status: 500 as const,
    };
  }

  return buildFriendshipStatus(userId, undefined, undefined, pendingRequest);
}

async function respondToFriendRequest(
  userId: number,
  requestId: number,
  action: "accept" | "reject",
) {
  const request = await storage.getFriendRequestById(requestId);
  if (!request) {
    return {
      error: "Friend request not found" as const,
      status: 404 as const,
    };
  }

  if (request.receiverId !== userId) {
    return {
      error: "You can only respond to requests sent to you" as const,
      status: 403 as const,
    };
  }

  if (request.status !== "pending") {
    return {
      error: "This friend request has already been handled" as const,
      status: 400 as const,
    };
  }

  const relationshipBlock = await storage.getBlockBetweenUsers(
    request.senderId,
    request.receiverId,
  );
  if (relationshipBlock) {
    return {
      error: "Blocked users cannot complete friend requests" as const,
      status: 400 as const,
    };
  }

  const updatedRequest = await storage.updateFriendRequestStatus(
    requestId,
    action === "accept" ? "accepted" : "rejected",
  );
  if (!updatedRequest) {
    return {
      error: "Failed to update friend request" as const,
      status: 500 as const,
    };
  }

  let friendship = await storage.getFriendship(request.senderId, request.receiverId);
  if (action === "accept" && !friendship) {
    friendship = await storage.addFriend(request.senderId, request.receiverId);
  }

  if (action === "accept" && !friendship) {
    return {
      error: "Failed to create friendship" as const,
      status: 500 as const,
    };
  }

  return {
    action,
    request: updatedRequest,
    friendshipStatus: buildFriendshipStatus(userId, friendship, undefined),
  };
}

async function removeFriend(userId: number, otherUserId: number) {
  if (userId === otherUserId) {
    return {
      error: "You cannot remove yourself" as const,
      status: 400 as const,
    };
  }

  const currentUser = await storage.getUser(userId);
  const otherUser = await storage.getUser(otherUserId);
  if (!currentUser || !otherUser) {
    return { error: "User not found" as const, status: 404 as const };
  }

  if (currentUser.isGuest) {
    return {
      error: "Guest accounts cannot manage friends" as const,
      status: 400 as const,
    };
  }

  const removed = await storage.removeFriend(userId, otherUserId);
  await storage.clearPendingFriendRequestsBetweenUsers(userId, otherUserId);

  return {
    removed,
    friendshipStatus: await getRelationshipStatus(userId, otherUserId),
  };
}

async function blockUser(userId: number, otherUserId: number) {
  if (userId === otherUserId) {
    return {
      error: "You cannot block yourself" as const,
      status: 400 as const,
    };
  }

  const [currentUser, otherUser] = await Promise.all([
    storage.getUser(userId),
    storage.getUser(otherUserId),
  ]);
  if (!currentUser || !otherUser) {
    return { error: "User not found" as const, status: 404 as const };
  }

  await storage.removeFriend(userId, otherUserId);
  await storage.clearPendingFriendRequestsBetweenUsers(userId, otherUserId);

  const block = await storage.blockUser(userId, otherUserId);
  if (!block) {
    return { error: "Failed to block user" as const, status: 500 as const };
  }

  return {
    block,
    friendshipStatus: await getRelationshipStatus(userId, otherUserId),
  };
}

async function unblockUser(userId: number, otherUserId: number) {
  if (userId === otherUserId) {
    return {
      error: "You cannot unblock yourself" as const,
      status: 400 as const,
    };
  }

  const [currentUser, otherUser, block] = await Promise.all([
    storage.getUser(userId),
    storage.getUser(otherUserId),
    storage.getBlockBetweenUsers(userId, otherUserId),
  ]);
  if (!currentUser || !otherUser) {
    return { error: "User not found" as const, status: 404 as const };
  }

  if (!block || block.blockerId !== userId) {
    return {
      error: "User is not blocked by you" as const,
      status: 400 as const,
    };
  }

  const unblocked = await storage.unblockUser(userId, otherUserId);
  if (!unblocked) {
    return { error: "Failed to unblock user" as const, status: 500 as const };
  }

  return {
    unblocked: true,
    friendshipStatus: await getRelationshipStatus(userId, otherUserId),
  };
}

async function getOnlineUsersController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res.json(await storage.getOnlineUsers());
  } catch (error) {
    next(error);
  }
}

async function getSidebarUsersController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res.json(await getSidebarUsersForUser(req.jwtUser!.userId));
  } catch (error) {
    next(error);
  }
}

async function getConversationUsersController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res.json(await storage.getConversationUsers(req.jwtUser!.userId));
  } catch (error) {
    next(error);
  }
}

async function getSelfProfileController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const payload = await getSelfProfile(req.jwtUser!.userId);
    if ("error" in payload) {
      return res.status(payload.status ?? 500).json({ message: payload.error });
    }

    res.json(payload.profile);
  } catch (error) {
    next(error);
  }
}

async function getBlockedUsersController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res.json(await getBlockedUsers(req.jwtUser!.userId));
  } catch (error) {
    next(error);
  }
}

function createUpdateUsernameController(io: SocketIOServer) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.jwtUser!;
      const validation = validateUsername(req.body?.username, user.username);
      if ("error" in validation) {
        return res.status(400).json({ message: validation.error });
      }

      const payload = await updateUsername(user.userId, validation.username);
      if ("error" in payload) {
        return res.status(payload.status ?? 500).json({ message: payload.error });
      }

      if (process.env.NODE_ENV === "development") {
        console.log(
          `[API] Updated username for user ${user.userId} to ${validation.username}`,
        );
      }

      await emitSidebarUsers(io);
      res.json(payload);
    } catch (error) {
      console.error("Error updating username:", error);
      next(error);
    }
  };
}

function createUpdateProfileController(io: SocketIOServer) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = parseProfileUpdatePayload(req.body);
      const result = await updateMemberProfile(req.jwtUser!, payload);
      if ("error" in result) {
        return res.status(result.status ?? 500).json({ message: result.error });
      }

      await emitSidebarUsers(io);
      res.json(result);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid input data" });
      }

      console.error("Error updating profile:", error);
      next(error);
    }
  };
}

async function getFriendshipStatusController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsed = parseTargetUserId(req.params.userId);
    if ("error" in parsed) {
      return res.status(400).json({ message: parsed.error });
    }

    res.json(await getFriendshipStatus(req.jwtUser!.userId, parsed.userId));
  } catch (error) {
    next(error);
  }
}

async function getBatchFriendshipStatusesController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsed = parseUserIdsQuery(req.query.userIds);
    if ("error" in parsed) {
      return res.status(400).json({ message: parsed.error });
    }

    const entries = await Promise.all(
      parsed.userIds.map(async (otherUserId) => [
        otherUserId,
        await getRelationshipStatus(req.jwtUser!.userId, otherUserId),
      ] as const),
    );

    res.json(Object.fromEntries(entries));
  } catch (error) {
    next(error);
  }
}

function createSendFriendRequestController(io: SocketIOServer) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = parseTargetUserId(req.params.userId);
      if ("error" in parsed) {
        return res.status(400).json({ message: parsed.error });
      }

      const result = await sendFriendRequest(req.jwtUser!.userId, parsed.userId);
      if ("error" in result) {
        return res.status(result.status ?? 500).json({ message: result.error });
      }

      const pendingRequest = result.pendingRequest;
      if (pendingRequest) {
        const receiverStatus = await getFriendshipStatus(
          pendingRequest.receiverId,
          pendingRequest.senderId,
        );
        const eventPayload = {
          requestId: pendingRequest.id,
          senderId: pendingRequest.senderId,
          receiverId: pendingRequest.receiverId,
          status: pendingRequest.status,
          senderStatus: result,
          receiverStatus,
        };

        io.to(`user:${pendingRequest.senderId}`).emit(
          "friend_request_updated",
          eventPayload,
        );
        io.to(`user:${pendingRequest.receiverId}`).emit(
          "friend_request_updated",
          eventPayload,
        );
      }

      await emitSidebarUsers(
        io,
        pendingRequest
          ? [pendingRequest.senderId, pendingRequest.receiverId]
          : [req.jwtUser!.userId, parsed.userId],
      );
      await emitRelationshipStatusUpdate(
        io,
        req.jwtUser!.userId,
        parsed.userId,
        "friend_request",
        pendingRequest
          ? {
              requestId: pendingRequest.id,
              requestStatus: pendingRequest.status,
            }
          : undefined,
      );
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };
}

function createRespondFriendRequestController(io: SocketIOServer) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsedRequestId = parseFriendRequestId(req.params.requestId);
      if ("error" in parsedRequestId) {
        return res.status(400).json({ message: parsedRequestId.error });
      }

      const parsedAction = parseFriendRequestAction(req.body?.action);
      if ("error" in parsedAction) {
        return res.status(400).json({ message: parsedAction.error });
      }

      const result = await respondToFriendRequest(
        req.jwtUser!.userId,
        parsedRequestId.requestId,
        parsedAction.action,
      );
      if ("error" in result) {
        return res.status(result.status ?? 500).json({ message: result.error });
      }

      const senderStatus = await getFriendshipStatus(
        result.request.senderId,
        result.request.receiverId,
      );
      const eventPayload = {
        requestId: result.request.id,
        senderId: result.request.senderId,
        receiverId: result.request.receiverId,
        status: result.request.status,
        senderStatus,
        receiverStatus: result.friendshipStatus,
      };

      io.to(`user:${result.request.senderId}`).emit(
        "friend_request_updated",
        eventPayload,
      );
      io.to(`user:${result.request.receiverId}`).emit(
        "friend_request_updated",
        eventPayload,
      );

      await emitSidebarUsers(io, [
        result.request.senderId,
        result.request.receiverId,
      ]);
      await emitRelationshipStatusUpdate(
        io,
        result.request.senderId,
        result.request.receiverId,
        "friend_request",
        {
          requestId: result.request.id,
          requestStatus: result.request.status,
        },
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
}

function createRemoveFriendController(io: SocketIOServer) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = parseTargetUserId(req.params.userId);
      if ("error" in parsed) {
        return res.status(400).json({ message: parsed.error });
      }

      const result = await removeFriend(req.jwtUser!.userId, parsed.userId);
      if ("error" in result) {
        return res.status(result.status ?? 500).json({ message: result.error });
      }

      await emitSidebarUsers(io, [req.jwtUser!.userId, parsed.userId]);
      await emitRelationshipStatusUpdate(
        io,
        req.jwtUser!.userId,
        parsed.userId,
        "remove_friend",
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
}

function createBlockUserController(io: SocketIOServer) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = parseTargetUserId(req.params.userId);
      if ("error" in parsed) {
        return res.status(400).json({ message: parsed.error });
      }

      const result = await blockUser(req.jwtUser!.userId, parsed.userId);
      if ("error" in result) {
        return res.status(result.status ?? 500).json({ message: result.error });
      }

      await emitSidebarUsers(io, [req.jwtUser!.userId, parsed.userId]);
      await emitRelationshipStatusUpdate(
        io,
        req.jwtUser!.userId,
        parsed.userId,
        "block_user",
      );
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };
}

function createUnblockUserController(io: SocketIOServer) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = parseTargetUserId(req.params.userId);
      if ("error" in parsed) {
        return res.status(400).json({ message: parsed.error });
      }

      const result = await unblockUser(req.jwtUser!.userId, parsed.userId);
      if ("error" in result) {
        return res.status(result.status ?? 500).json({ message: result.error });
      }

      await emitSidebarUsers(io, [req.jwtUser!.userId, parsed.userId]);
      await emitRelationshipStatusUpdate(
        io,
        req.jwtUser!.userId,
        parsed.userId,
        "unblock_user",
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
}

export function registerUserRoutes(app: Express, io: SocketIOServer) {
  app.get("/api/users/online", jwtAuth, getOnlineUsersController);
  app.get("/api/users/sidebar", jwtAuth, getSidebarUsersController);
  app.get("/api/users/history", jwtAuth, getConversationUsersController);
  app.get("/api/user/profile", jwtAuth, getSelfProfileController);
  app.get("/api/users/blocked", jwtAuth, getBlockedUsersController);
  app.get(
    "/api/users/friendship-status",
    jwtAuth,
    getBatchFriendshipStatusesController,
  );
  app.get("/api/users/:userId/friendship", jwtAuth, getFriendshipStatusController);
  app.post(
    "/api/users/:userId/friendship",
    jwtAuth,
    createSendFriendRequestController(io),
  );
  app.delete(
    "/api/users/:userId/friendship",
    jwtAuth,
    createRemoveFriendController(io),
  );
  app.post(
    "/api/friend-requests/:requestId/respond",
    jwtAuth,
    createRespondFriendRequestController(io),
  );
  app.post("/api/users/:userId/block", jwtAuth, createBlockUserController(io));
  app.delete(
    "/api/users/:userId/block",
    jwtAuth,
    createUnblockUserController(io),
  );
  app.put("/api/user/profile", jwtAuth, createUpdateProfileController(io));
  app.put("/api/user/username", jwtAuth, createUpdateUsernameController(io));
}
