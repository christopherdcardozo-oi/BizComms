'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { syncReviewsNow } from './actions';

export function SyncButton() {
  const [state, action, pending] = useActionState(syncReviewsNow, {});
  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? 'Syncing…' : 'Sync now'}
      </Button>
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      {state.notice ? <Alert variant="success">{state.notice}</Alert> : null}
    </form>
  );
}
