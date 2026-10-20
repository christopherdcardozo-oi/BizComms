export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-12">
      <p className="text-xl font-semibold tracking-tight">BizComms</p>
      {children}
    </main>
  );
}
