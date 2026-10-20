'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AuthFormState } from './actions';

export function AuthForm({
  mode,
  action,
  next,
  initialError,
}: {
  mode: 'login' | 'signup';
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  next?: string;
  initialError?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { error: initialError });
  const isLogin = mode === 'login';

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{isLogin ? 'Sign in' : 'Create your account'}</CardTitle>
        <CardDescription>
          {isLogin ? 'Welcome back to BizComms.' : 'Never lose a customer to a missed call again.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" defaultValue={state.email} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              minLength={10}
              required
            />
          </div>
          {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
          {state.notice ? <Alert variant="success">{state.notice}</Alert> : null}
          <Button type="submit" disabled={pending}>
            {pending ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
            <Link className="font-medium text-primary underline-offset-4 hover:underline" href={isLogin ? '/signup' : '/login'}>
              {isLogin ? 'Sign up' : 'Sign in'}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
