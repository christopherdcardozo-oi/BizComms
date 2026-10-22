import { redirect } from 'next/navigation';
import { launch } from '@/lib/site';
import { signUp } from '../actions';
import { AuthForm } from '../auth-form';

export const metadata = { title: 'Sign up · BizComms' };

export default function SignupPage() {
  if (!launch.signupsOpen) redirect('/book');
  return <AuthForm mode="signup" action={signUp} />;
}
