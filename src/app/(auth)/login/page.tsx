import { signIn } from '../actions';
import { AuthForm } from '../auth-form';
import { siteConfig } from '@/lib/site';

export const metadata = { title: `Sign in · ${siteConfig.name}` };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <AuthForm
      mode="login"
      action={signIn}
      next={next}
      initialError={error === 'confirmation' ? 'That confirmation link is invalid or expired. Sign in or sign up again.' : undefined}
    />
  );
}
