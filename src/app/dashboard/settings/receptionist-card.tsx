'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { updateReceptionist } from '../actions';

export function ReceptionistCard({
  enabled,
  afterHoursDirectToAi,
  ringSeconds,
  canEdit,
}: {
  enabled: boolean;
  afterHoursDirectToAi: boolean;
  ringSeconds: number;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(updateReceptionist, {});
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          AI receptionist <Badge variant={enabled ? 'success' : 'secondary'}>{enabled ? 'On' : 'Off'}</Badge>
        </CardTitle>
        <CardDescription>
          When you don&apos;t answer within {ringSeconds} seconds, an AI receptionist picks up, takes a message, and you get a summary in your call log.
          If the caller hangs up on the AI right away, they still get your text-back.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <fieldset disabled={!canEdit || pending} className="flex flex-col gap-4">
            <label className="flex items-center gap-3 text-sm font-medium">
              <input type="checkbox" name="afterHoursDirectToAi" defaultChecked={afterHoursDirectToAi} className="h-4 w-4 accent-primary" />
              Outside business hours, send calls straight to the AI (skip ringing my phone)
            </label>
            <p className="text-xs text-muted-foreground">
              Callers hear: &quot;You&apos;ve reached our automated assistant, and this call may be recorded.&quot; Some states require this disclosure.
            </p>
            <div className="flex gap-2">
              <Button type="submit" name="intent" value="enable">
                {pending ? 'Saving…' : enabled ? 'Save' : 'Turn on AI receptionist'}
              </Button>
              {enabled ? (
                <Button type="submit" name="intent" value="disable" variant="outline">
                  Turn off
                </Button>
              ) : null}
            </div>
          </fieldset>
          {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
          {state.saved && !state.error ? <Alert variant="success">Saved. Applies to new calls within a minute.</Alert> : null}
          {!canEdit ? <p className="text-sm text-muted-foreground">Only owners and admins can change this.</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}
