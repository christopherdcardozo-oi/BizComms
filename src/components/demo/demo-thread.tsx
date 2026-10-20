'use client';

import { useState } from 'react';
import { MessageThread, OPTED_OUT_REASON, ThreadHeader } from '@/components/dashboard/views';
import { Card, CardContent } from '@/components/ui/card';
import { ReplyForm } from '@/app/dashboard/inbox/[contact]/reply-form';
import type { ReplyState } from '@/app/dashboard/actions';
import type { InboxMessage } from '@/lib/dashboard/conversations';
import { MAX_REPLY_LENGTH } from '@/lib/sms/outbound';

// Demo inbox thread: replies appear instantly in the conversation and are never sent.
export function DemoThread({
  contact,
  initialMessages,
  optedOut,
  timezone,
  from,
}: {
  contact: string;
  initialMessages: InboxMessage[];
  optedOut: boolean;
  timezone: string;
  from: string;
}) {
  const [messages, setMessages] = useState(initialMessages);

  async function demoReply(_prev: ReplyState, formData: FormData): Promise<ReplyState> {
    const body = String(formData.get('body') ?? '').trim();
    if (!body) return { error: 'Type a message first.' };
    if (body.length > MAX_REPLY_LENGTH) return { error: 'Keep replies under 640 characters.' };
    setMessages((current) => [
      ...current,
      {
        id: `demo-${Date.now()}`,
        direction: 'outbound_api',
        from_number: from,
        to_number: contact,
        body,
        status: 'delivered',
        type: 'manual_chat',
        error_code: null,
        created_at: new Date().toISOString(),
      },
    ]);
    return { sentAt: Date.now() };
  }

  return (
    <Card>
      <ThreadHeader contact={contact} optedOut={optedOut} basePath="/demo" />
      <CardContent className="flex flex-col gap-6">
        <MessageThread messages={messages} timezone={timezone} />
        <ReplyForm to={contact} action={demoReply} disabledReason={optedOut ? OPTED_OUT_REASON : undefined} />
      </CardContent>
    </Card>
  );
}
