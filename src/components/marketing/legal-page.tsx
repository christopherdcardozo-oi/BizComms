import { siteConfig } from '@/lib/site';

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-title">{title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">Effective {siteConfig.legalEffectiveDate}</p>
      <div className="mt-10 flex flex-col gap-8 text-[15px] leading-relaxed [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_li]:ml-5 [&_li]:list-disc [&_p+p]:mt-3 [&_ul]:mt-3 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
        {children}
      </div>
    </article>
  );
}
