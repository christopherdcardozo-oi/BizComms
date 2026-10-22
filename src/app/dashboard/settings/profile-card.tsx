'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  PROFILE_LIMITS,
  TRADE_IDS,
  TRADE_PRESETS,
  receptionistContext,
  type BusinessProfile,
  type TradeId,
} from '@/lib/business-profile';
import type { BusinessHours } from '@/lib/telephony/business-hours';
import { US_TIMEZONE_LABELS, US_TIMEZONES } from '@/lib/timezones';
import { updateBusinessProfile } from '../actions';

const WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const DEFAULT_DAY = { open: '09:00', close: '17:00', closed: false };
const PRESET_FIELDS = ['services', 'emergencies', 'askCallers'] as const;
const SELECT =
  'h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function ProfileCard({
  timezone,
  hours,
  instructions,
  profile: saved,
  aiProvisioned,
  canEdit,
}: {
  timezone: string;
  hours: BusinessHours | null;
  instructions: string;
  profile: BusinessProfile;
  aiProvisioned: boolean;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(updateBusinessProfile, {});
  const [profile, setProfile] = useState(saved);
  const [prefilled, setPrefilled] = useState<string | null>(null);
  const set = (field: keyof BusinessProfile, value: string) => setProfile((p) => ({ ...p, [field]: value }));

  // Picking a trade fills in its starting text, but only where the owner hasn't written their own:
  // a field that is empty or still holds the previous trade's starting text gets the new one.
  function chooseTrade(trade: TradeId | '') {
    setProfile((p) => {
      const previous = p.trade ? TRADE_PRESETS[p.trade] : null;
      const next = trade ? TRADE_PRESETS[trade] : null;
      const updated = { ...p, trade };
      for (const field of PRESET_FIELDS) {
        if (!p[field] || p[field] === previous?.[field]) updated[field] = next?.[field] ?? '';
      }
      return updated;
    });
    setPrefilled(trade && trade !== 'other' ? TRADE_PRESETS[trade].label : null);
  }

  const preview = receptionistContext(profile, hours, timezone);

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Your business</CardTitle>
        <CardDescription>
          This is what your AI receptionist and Google review replies know about you. Pick your trade to start from good defaults, then edit
          anything.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-6">
          <fieldset disabled={!canEdit || pending} className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="trade">Trade</Label>
              <select
                id="trade"
                name="trade"
                value={profile.trade}
                onChange={(e) => chooseTrade(e.target.value as TradeId | '')}
                className={`${SELECT} w-56`}
              >
                <option value="">Choose your trade…</option>
                {TRADE_IDS.map((id) => (
                  <option key={id} value={id}>
                    {TRADE_PRESETS[id].label}
                  </option>
                ))}
              </select>
              {prefilled ? (
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  Filled in starting text for {prefilled.toLowerCase()}. Edit it to match how you work.
                </p>
              ) : null}
            </div>

            <Field id="services" label="Services you offer" hint="The receptionist uses this to tell callers what you do.">
              <Textarea
                id="services"
                name="services"
                rows={2}
                maxLength={PROFILE_LIMITS.services}
                value={profile.services}
                onChange={(e) => set('services', e.target.value)}
                placeholder="e.g. Water heaters, drain cleaning, leak repairs"
              />
            </Field>

            <Field id="serviceArea" label="Towns you serve">
              <Input
                id="serviceArea"
                name="serviceArea"
                maxLength={PROFILE_LIMITS.serviceArea}
                value={profile.serviceArea}
                onChange={(e) => set('serviceArea', e.target.value)}
                placeholder="e.g. Ames, Nevada, Boone and Story City"
              />
            </Field>

            <Field id="emergencies" label="What counts as urgent" hint="These calls get marked URGENT in your call summary.">
              <Textarea
                id="emergencies"
                name="emergencies"
                rows={2}
                maxLength={PROFILE_LIMITS.emergencies}
                value={profile.emergencies}
                onChange={(e) => set('emergencies', e.target.value)}
                placeholder="e.g. Burst pipes and flooding"
              />
            </Field>

            <Field id="askCallers" label="What to ask every caller">
              <Textarea
                id="askCallers"
                name="askCallers"
                rows={2}
                maxLength={PROFILE_LIMITS.askCallers}
                value={profile.askCallers}
                onChange={(e) => set('askCallers', e.target.value)}
                placeholder="e.g. Ask for the job address"
              />
            </Field>

            <Field id="reviewSignOff" label="Sign-off for Google review replies" hint="Leave empty to sign as the business.">
              <Input
                id="reviewSignOff"
                name="reviewSignOff"
                maxLength={PROFILE_LIMITS.reviewSignOff}
                value={profile.reviewSignOff}
                onChange={(e) => set('reviewSignOff', e.target.value)}
                placeholder="e.g. Mike, owner"
                className="w-72"
              />
            </Field>

            <div className="flex flex-col gap-2">
              <Label htmlFor="timezone">Time zone</Label>
              <select
                id="timezone"
                name="timezone"
                defaultValue={(US_TIMEZONES as readonly string[]).includes(timezone) ? timezone : 'America/New_York'}
                className={`${SELECT} w-48`}
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
              <p className="text-xs text-muted-foreground">
                Outside these hours, calls can go straight to the AI receptionist, and it can tell callers when you&apos;re open. Same open and
                close time means open 24 hours.
              </p>
            </fieldset>

            <Field id="instructions" label="Anything else for the AI receptionist (optional)">
              <Textarea
                id="instructions"
                name="instructions"
                rows={3}
                maxLength={1000}
                defaultValue={instructions}
                placeholder="e.g. We're family-owned. Spanish-speaking callers can ask for Maria."
              />
              <p className="text-xs text-muted-foreground">
                It will never quote prices, promise appointment times, or give repair advice, whatever you write here.
              </p>
            </Field>

            {preview.length ? (
              <details className="rounded-md border px-4 py-3 text-sm">
                <summary className="cursor-pointer font-medium">What your AI receptionist will know</summary>
                <ul className="mt-3 flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
                  {preview.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">Hours shown are your last saved hours.</p>
              </details>
            ) : null}
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
          {!aiProvisioned ? <p className="text-xs text-muted-foreground">Receptionist details take effect once you turn on the AI receptionist.</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
