'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { replyToConversation } from '../../actions';

export function ReplyForm({ to, disabledReason }: { to: string; disabledReason?: string }) {
  const [state, action, pending] = useActionState(replyToConversation, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.sentAt) formRef.current?.reset();
  }, [state.sentAt]);

  if (disabledReason) return <Alert>{disabledReason}</Alert>;

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="to" value={to} />
      <label htmlFor="body" className="sr-only">
        Reply
      </label>
      <Textarea id="body" name="body" placeholder="Type a reply…" maxLength={640} rows={3} required />
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </form>
  );
}
