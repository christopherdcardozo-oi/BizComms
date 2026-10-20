'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { BusinessHours } from '@/lib/telephony/business-hours';
import { US_TIMEZONE_LABELS, US_TIMEZONES } from '@/lib/timezones';
import { updateBusinessProfile } from '../actions';

const WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const DEFAULT_DAY = { open: '09:00', close: '17:00', closed: false };

export function ProfileCard({
  timezone,
  hours,
  instructions,
  aiProvisioned,
  canEdit,
}: {
  timezone: string;
  hours: BusinessHours | null;
  instructions: string;
  aiProvisioned: boolean;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(updateBusinessProfile, {});
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Business hours &amp; receptionist instructions</CardTitle>
        <CardDescription>
          Outside these hours, calls can go straight to the AI receptionist. Instructions tell it how to talk about your business.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-6">
          <fieldset disabled={!canEdit || pending} className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="timezone">Time zone</Label>
              <select
                id="timezone"
                name="timezone"
                defaultValue={(US_TIMEZONES as readonly string[]).includes(timezone) ? timezone : 'America/New_York'}
                className="h-10 w-48 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {US_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {US_TIMEZONE_LABELS[tz]}
                  </option>
                ))}
              </select>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Hours</legend>
              {WEEK.map((day) => {
                const value = hours?.[day] ?? DEFAULT_DAY;
                return (
                  <div key={day} className="grid grid-cols-[6.5rem_1fr] items-center gap-2 sm:grid-cols-[6.5rem_auto_auto_auto]">
                    <span className="text-sm capitalize">{day}</span>
                    <label className="flex items-center gap-2 text-sm text-muted-foreground sm:order-last">
                      <input type="checkbox" name={`${day}.closed`} defaultChecked={value.closed} className="h-4 w-4 accent-primary" />
                      Closed
                    </label>
                    <Input type="time" name={`${day}.open`} defaultValue={value.open} aria-label={`${day} opens`} className="col-start-2 w-32 sm:col-start-auto" />
                    <Input type="time" name={`${day}.close`} defaultValue={value.close} aria-label={`${day} closes`} className="col-start-2 w-32 sm:col-start-auto" />
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">Overnight hours work (e.g. 22:00 to 02:00). Same open and close time means open 24 hours.</p>
            </fieldset>

            <div className="flex flex-col gap-2">
              <Label htmlFor="instructions">Instructions for the AI receptionist</Label>
              <Textarea
                id="instructions"
                name="instructions"
                rows={4}
                maxLength={1000}
                defaultValue={instructions}
                placeholder="e.g. We offer 24/7 emergency plumbing. Service area is the north suburbs. Always ask for the street address."
              />
              <p className="text-xs text-muted-foreground">
                It will never quote prices, promise appointment times, or give advice, whatever you write here.
              </p>
            </div>
          </fieldset>

          {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
          {state.saved && !state.error ? (
            <Alert variant="success">Saved{state.aiUpdated ? ' and sent to your AI receptionist' : ''}. Applies to new calls within a minute.</Alert>
          ) : null}
          {canEdit ? (
            <div>
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Only owners and admins can change these settings.</p>
          )}
          {!aiProvisioned ? <p className="text-xs text-muted-foreground">Instructions take effect once you turn on the AI receptionist.</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}
