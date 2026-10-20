'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/ui/cn';
import { purchaseNumber, searchNumbers } from './actions';

export function NumberStep() {
  const [search, searchAction, searching] = useActionState(searchNumbers, {});
  const [purchase, purchaseAction, purchasing] = useActionState(purchaseNumber, {});
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <form action={searchAction} className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="areaCode">Area code</Label>
          <Input
            id="areaCode"
            name="areaCode"
            inputMode="numeric"
            pattern="[2-9][0-9]{2}"
            maxLength={3}
            placeholder="312"
            defaultValue={search.areaCode}
            required
          />
        </div>
        <Button type="submit" variant="secondary" disabled={searching}>
          {searching ? 'Searching…' : 'Find numbers'}
        </Button>
      </form>
      {search.error ? <Alert variant="destructive">{search.error}</Alert> : null}

      {search.results?.length ? (
        <form action={purchaseAction} className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Choose your business number</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {search.results.map((n) => (
                <label
                  key={n.phoneNumber}
                  className={cn(
                    'press flex cursor-pointer flex-col rounded-md border p-3 text-sm transition-[transform,background-color,border-color,box-shadow] duration-150 ease-out hover:bg-accent',
                    selected === n.phoneNumber && 'border-primary ring-2 ring-primary/30'
                  )}
                >
                  <input
                    type="radio"
                    name="phoneNumber"
                    value={n.phoneNumber}
                    className="sr-only"
                    required
                    onChange={() => setSelected(n.phoneNumber)}
                  />
                  <span className="font-medium">{n.friendlyName}</span>
                  {n.locality ? (
                    <span className="text-xs text-muted-foreground">
                      {n.locality}
                      {n.region ? `, ${n.region}` : ''}
                    </span>
                  ) : null}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-col gap-2">
            <Label htmlFor="forwardTo">Ring this phone when customers call</Label>
            <Input id="forwardTo" name="forwardTo" type="tel" autoComplete="tel" placeholder="(312) 555-0123" required />
            <p className="text-xs text-muted-foreground">
              Your cell or office line. If nobody answers in 15 seconds, we text the caller back automatically.
            </p>
          </div>
          {purchase.error ? <Alert variant="destructive">{purchase.error}</Alert> : null}
          <Button type="submit" disabled={purchasing || !selected}>
            {purchasing ? 'Setting up your number…' : 'Get this number'}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
