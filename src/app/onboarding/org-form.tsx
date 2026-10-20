'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { US_TIMEZONE_LABELS, US_TIMEZONES } from '@/lib/timezones';
import { createOrganization } from './actions';

export function OrgForm() {
  const [state, action, pending] = useActionState(createOrganization, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Business name</Label>
        <Input id="name" name="name" placeholder="Acme Plumbing" required minLength={2} maxLength={100} />
        <p className="text-xs text-muted-foreground">This is how your business is named in texts to customers.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="timezone">Time zone</Label>
        <select
          id="timezone"
          name="timezone"
          defaultValue="America/New_York"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {US_TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {US_TIMEZONE_LABELS[tz]}
            </option>
          ))}
        </select>
      </div>
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Creating…' : 'Continue'}
      </Button>
    </form>
  );
}
