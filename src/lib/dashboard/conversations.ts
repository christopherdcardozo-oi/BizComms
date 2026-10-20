import type { MessageDirection, MessageStatus, MessageType } from '../../types/database.types';

export interface InboxMessage {
  id: string;
  direction: MessageDirection;
  from_number: string;
  to_number: string;
  body: string;
  status: MessageStatus;
  type: MessageType;
  error_code: string | null;
  created_at: string;
}

export interface Conversation {
  contact: string;
  lastMessage: InboxMessage;
  messageCount: number;
  // The customer spoke last, so the business probably owes them a reply.
  awaitingReply: boolean;
}

export function contactOf(message: Pick<InboxMessage, 'direction' | 'from_number' | 'to_number'>): string {
  return message.direction === 'inbound' ? message.from_number : message.to_number;
}

// Groups a newest-first message list into one row per customer, newest conversation first.
export function groupConversations(messagesNewestFirst: InboxMessage[]): Conversation[] {
  const byContact = new Map<string, Conversation>();
  for (const message of messagesNewestFirst) {
    const contact = contactOf(message);
    const existing = byContact.get(contact);
    if (existing) {
      existing.messageCount++;
    } else {
      byContact.set(contact, {
        contact,
        lastMessage: message,
        messageCount: 1,
        awaitingReply: message.direction === 'inbound',
      });
    }
  }
  return [...byContact.values()];
}
