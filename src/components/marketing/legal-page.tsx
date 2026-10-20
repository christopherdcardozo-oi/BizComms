import { siteConfig } from '@/lib/site';

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-title">{title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">Effective {siteConfig.legalEffectiveDate}</p>
      <div className="mt-10 flex max-w-[56ch] flex-col gap-8 text-[15px] leading-relaxed [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:font-semibold [&_ol]:mt-3 [&_ol]:flex [&_ol]:list-decimal [&_ol]:flex-col [&_ol]:gap-1.5 [&_ol>li]:list-decimal [&_li]:ml-5 [&_li]:list-disc [&_p+p]:mt-3 [&_ul]:mt-3 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
        {children}
      </div>
    </article>
  );
}
