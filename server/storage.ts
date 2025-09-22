import { type User, type InsertUser, type Message, type InsertMessage } from "@shared/schema";
import { prisma } from "./db";
import session from "express-session";
import { nanoid } from "nanoid";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByGmail(gmail: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserOnlineStatus(id: number, isOnline: boolean): Promise<void>;
  getOnlineUsers(): Promise<User[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  getMessagesBetweenUsers(user1Id: number, user2Id: number): Promise<Message[]>;
  getRecentMessagesForUser(userId: number): Promise<Message[]>;
  sessionStore: any;
}

export class DatabaseStorage implements IStorage {
  public sessionStore: any;
  constructor() {
    // Use MemoryStore for sessions since we're using Supabase
    // In production, consider using Redis or another persistent session store
    this.sessionStore = new session.MemoryStore();
  }
  
  async getUser(id: number): Promise<User | undefined> {
    if (!prisma) return undefined;
    try {
      const user = await prisma.user.findUnique({
        where: { userId: id }
      });
      return user || undefined;
    } catch (error) {
      console.error('Error getting user:', error);
      return undefined;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    if (!prisma) return undefined;
    try {
      const user = await prisma.user.findFirst({
        where: { username }
      });
      return user || undefined;
    } catch (error) {
      console.error('Error getting user by username:', error);
      return undefined;
    }
  }

  async getUserByGmail(gmail: string): Promise<User | undefined> {
    if (!prisma) return undefined;
    try {
      const user = await prisma.user.findUnique({
        where: { gmail }
      });
      return user || undefined;
    } catch (error) {
      console.error('Error getting user by email:', error);
      return undefined;
    }
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    if (!prisma) throw new Error('Database not initialized');
    try {
      const user = await prisma.user.create({
        data: insertUser
      });
      return user;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  async updateUserOnlineStatus(id: number, isOnline: boolean): Promise<void> {
    if (!prisma) return;
    try {
      await prisma.user.update({
        where: { userId: id },
        data: { isOnline }
      });
    } catch (error) {
      console.error('Error updating user online status:', error);
    }
  }

  async getOnlineUsers(): Promise<User[]> {
    if (!prisma) return [];
    try {
      return await prisma.user.findMany({
        where: { isOnline: true }
      });
    } catch (error) {
      console.error('Error getting online users:', error);
      return [];
    }
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    if (!prisma) throw new Error('Database not initialized');
    try {
      const createdMessage = await prisma.message.create({
        data: message
      });
      return createdMessage;
    } catch (error) {
      console.error('Error creating message:', error);
      throw error;
    }
  }

  async getMessagesBetweenUsers(user1Id: number, user2Id: number): Promise<Message[]> {
    if (!prisma) return [];
    try {
      return await prisma.message.findMany({
        where: {
          OR: [
            { senderId: user1Id, receiverId: user2Id },
            { senderId: user2Id, receiverId: user1Id }
          ]
        },
        orderBy: { timestamp: 'asc' }
      });
    } catch (error) {
      console.error('Error getting messages between users:', error);
      return [];
    }
  }

  async getRecentMessagesForUser(userId: number): Promise<Message[]> {
    if (!prisma) return [];
    try {
      return await prisma.message.findMany({
        where: {
          OR: [
            { senderId: userId },
            { receiverId: userId }
          ]
        },
        orderBy: { timestamp: 'desc' },
        take: 50 // Get last 50 messages
      });
    } catch (error) {
      console.error('Error getting recent messages for user:', error);
      return [];
    }
  }
}

class InMemoryStorage implements IStorage {
  public sessionStore: any;
  private users: User[] = [] as unknown as User[];
  private messages: Message[] = [] as unknown as Message[];
  private userIdCounter = 1;
  private messageIdCounter = 1;

  constructor() {
    this.sessionStore = new session.MemoryStore();
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.find((u) => u.userId === id) as User | undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.users.find((u) => u.username === username) as User | undefined;
  }

  async getUserByGmail(gmail: string): Promise<User | undefined> {
    if (gmail === null || gmail === undefined) return undefined;
    return this.users.find((u) => u.gmail === gmail) as User | undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const userId = this.userIdCounter++;
    const user = {
      userId,
      gmail: (insertUser as any).gmail ?? null,
      passwordHash: (insertUser as any).passwordHash ?? null,
      username: (insertUser as any).username ?? `guest_${userId}`,
      age: (insertUser as any).age ?? null,
      gender: (insertUser as any).gender ?? null,
      isOnline: (insertUser as any).isOnline ?? false,
      isGuest: (insertUser as any).isGuest ?? false,
    } as unknown as User;

    this.users.push(user);
    return user;
  }

  async updateUserOnlineStatus(id: number, isOnline: boolean): Promise<void> {
    const u = this.users.find((x) => x.userId === id);
    if (u) u.isOnline = isOnline as any;
  }

  async getOnlineUsers(): Promise<User[]> {
    return this.users.filter((u) => u.isOnline) as User[];
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const msgId = this.messageIdCounter++;
    const timestamp = new Date();
    const msg = {
      msgId,
      senderId: (message as any).senderId,
      receiverId: (message as any).receiverId,
      message: (message as any).message,
      timestamp,
    } as unknown as Message;

    this.messages.push(msg);
    return msg;
  }

  async getMessagesBetweenUsers(user1Id: number, user2Id: number): Promise<Message[]> {
    return this.messages.filter((m) =>
      (m.senderId === user1Id && m.receiverId === user2Id) ||
      (m.senderId === user2Id && m.receiverId === user1Id)
    );
  }

  async getRecentMessagesForUser(userId: number): Promise<Message[]> {
    return this.messages
      .filter((m) => m.senderId === userId || m.receiverId === userId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 50);
  }
}

export const storage: IStorage = prisma ? new DatabaseStorage() : new InMemoryStorage();
