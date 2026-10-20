'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { openBillingPortal } from '../actions';

export function BillingCard({ statusLabel, healthy, canEdit }: { statusLabel: string; healthy: boolean; canEdit: boolean }) {
  const [state, action, pending] = useActionState(openBillingPortal, {});
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          Billing <Badge variant={healthy ? 'success' : 'warning'}>{statusLabel}</Badge>
        </CardTitle>
        <CardDescription>Update your card, download invoices, or cancel your subscription.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
        {canEdit ? (
          <form action={action}>
            <Button type="submit" variant="outline" disabled={pending}>
              {pending ? 'Opening…' : 'Manage billing'}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">Only owners and admins can manage billing.</p>
        )}
      </CardContent>
    </Card>
  );
}
