export default function Footer() {
  return (
    <footer className="relative mt-10 overflow-hidden">
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 120% at 50% 0%, #EEF6FF 0%, transparent 60%), #FAFBFC",
        }}
      />
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="glass rounded-3xl px-8 py-14 text-center">
          <h2 className="font-display text-[clamp(1.75rem,3.5vw,2.75rem)] font-extrabold tracking-tightest text-ink">
            Stop fighting monday.com&apos;s limits
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[1.05rem] text-muted">
            Import subitems, bulk-update, run queries. Everything you wish monday.com had —
            free, right now.
          </p>
          <div className="mt-8 flex justify-center">
            <a
              href="https://chromewebstore.google.com/detail/kmmmfnkjdcmemcmjipidodnipidadaeg"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-[15px] font-semibold text-white shadow-[0_12px_34px_rgba(62,123,250,.38)]"
              style={{ background: "linear-gradient(120deg,#3E7BFA,#6161FF)" }}
            >
              Add to Chrome — it&apos;s free →
            </a>
          </div>
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-hairline pt-8 text-[13px] text-muted sm:flex-row">
          <div className="flex items-center gap-2">
            <img src="/icon.png" alt="" className="h-6 w-6 rounded-md" />
            <span className="font-display font-bold text-ink">
              monday<span className="text-brand-indigo">.inspector</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <a href="/changelog.html" className="hover:text-ink">Changelog</a>
            <a href="/privacy.html" className="hover:text-ink">Privacy</a>
            <a href="https://github.com/sametivon/monday.inspector" target="_blank" rel="noopener noreferrer" className="hover:text-ink">GitHub</a>
            <a href="https://www.fruitionservices.io" target="_blank" rel="noopener noreferrer" className="hover:text-ink">Fruition Services</a>
          </div>
          <span>© 2026 Fruition Services</span>
        </div>
      </div>
    </footer>
  );
}
