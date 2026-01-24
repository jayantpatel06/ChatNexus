import { Socket } from 'socket.io';

// Extend Socket.io Socket interface with userId
declare module 'socket.io' {
  interface Socket {
    userId: number;
  }
}

// Socket event payload types
export interface PrivateMessagePayload {
  receiverId: number;
  message?: string;
  clientMessageId?: string;
  attachment?: {
    url: string;
    filename: string;
    fileType: string;
  };
}

export interface GlobalMessagePayload {
  message: string;
}

export interface TypingPayload {
  receiverId: number;
}

// Socket emit event types
export interface NewMessageEvent {
  message: {
    msgId: number;
    senderId: number;
    receiverId: number;
    conversationId: string;
    message: string;
    timestamp: Date;
    attachments: Array<{
      id: number;
      url: string;
      filename: string;
      fileType: string;
    }>;
  };
}

export interface MessageSentEvent {
  message: NewMessageEvent['message'];
  clientMessageId?: string;
}

export interface UserTypingEvent {
  userId: number;
  isTyping: boolean;
}

export interface OnlineUsersUpdatedEvent {
  users: Array<{
    userId: number;
    username: string;
    isOnline: boolean;
    isGuest: boolean;
  }>;
}
