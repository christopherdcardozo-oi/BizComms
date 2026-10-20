'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface AuthFormState {
  error?: string;
  notice?: string;
  email?: string; // echoed back so a failed attempt doesn't clear the field
}

const UNAVAILABLE = 'Sign-in is temporarily unavailable. Please try again in a minute.';

// 4xx from Supabase Auth means the request itself was rejected; anything else (network
// failure, 5xx) is an outage and must not be reported as a wrong password.
function isClientError(error: { status?: number }): boolean {
  return typeof error.status === 'number' && error.status >= 400 && error.status < 500;
}

const credentials = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(10, 'Use at least 10 characters.').max(128),
});

function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === 'string' ? value : '';
  // Only same-site relative paths: never an open redirect.
  return next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '');
  const parsed = credentials.safeParse({ email, password: formData.get('password') });
  if (!parsed.success) return { error: parsed.error.issues[0].message, email };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    const wrongCredentials = error.code === 'invalid_credentials' || error.status === 400;
    return { error: wrongCredentials ? 'Incorrect email or password.' : UNAVAILABLE, email };
  }
  redirect(safeNext(formData.get('next')));
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '');
  const parsed = credentials.safeParse({ email, password: formData.get('password') });
  if (!parsed.success) return { error: parsed.error.issues[0].message, email };

  const supabase = await createSupabaseServerClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${appUrl}/auth/confirm?next=/onboarding` },
  });
  if (error) return { error: isClientError(error) ? error.message : UNAVAILABLE, email };
  // With email confirmation enabled there is no session until the link is clicked.
  if (!data.session) return { notice: 'Check your email for a confirmation link to finish signing up.' };
  redirect('/onboarding');
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
