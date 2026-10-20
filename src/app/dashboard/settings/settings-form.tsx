'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { renderRescueSms } from '@/lib/telephony/rescue-sms';
import { updateLineSettings } from '../actions';

export function SettingsForm({
  businessName,
  forwardTo,
  forwardTimeoutSeconds,
  missedCallSmsEnabled,
  missedCallSmsTemplate,
  canEdit,
}: {
  businessName: string;
  forwardTo: string;
  forwardTimeoutSeconds: number;
  missedCallSmsEnabled: boolean;
  missedCallSmsTemplate: string;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(updateLineSettings, {});
  const [template, setTemplate] = useState(missedCallSmsTemplate);
  const preview = renderRescueSms(template, businessName);

  return (
    <form action={action} className="flex flex-col gap-6">
      <fieldset disabled={!canEdit} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor="forwardTo">Ring this phone</Label>
          <Input id="forwardTo" name="forwardTo" type="tel" defaultValue={forwardTo} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="forwardTimeoutSeconds">Seconds to ring before texting the caller back</Label>
          <Input
            id="forwardTimeoutSeconds"
            name="forwardTimeoutSeconds"
            type="number"
            min={5}
            max={60}
            defaultValue={forwardTimeoutSeconds}
            className="w-28"
          />
          <p className="text-xs text-muted-foreground">
            Keep this shorter than your cell&apos;s voicemail pickup (usually 20–25 seconds), or voicemail will answer first.
          </p>
        </div>
        <label className="flex items-center gap-3 text-sm font-medium">
          <input type="checkbox" name="missedCallSmsEnabled" defaultChecked={missedCallSmsEnabled} className="h-4 w-4 accent-primary" />
          Text back callers I miss
        </label>
        <div className="flex flex-col gap-2">
          <Label htmlFor="missedCallSmsTemplate">Text-back message</Label>
          <Textarea
            id="missedCallSmsTemplate"
            name="missedCallSmsTemplate"
            maxLength={300}
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Use {'{{business_name}}'} for your business name. &quot;Reply STOP to opt out.&quot; is added automatically if missing.
          </p>
          <div className="rounded-md bg-muted px-3 py-2 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Preview</span>
            <p>{preview}</p>
          </div>
        </div>
      </fieldset>
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      {state.saved && !state.error ? <Alert variant="success">Saved. Changes apply to new calls within a minute.</Alert> : null}
      {canEdit ? (
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Only owners and admins can change these settings.</p>
      )}
    </form>
  );
}
