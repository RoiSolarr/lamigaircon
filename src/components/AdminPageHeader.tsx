// Title, one line of context and optional actions, at the top of each admin page.
export function AdminPageHeader({ title, children, actions }: { title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="title text-3xl sm:text-4xl">{title}</h1>
        {children && <div className="mt-2 max-w-3xl text-steel">{children}</div>}
      </div>
      {actions}
    </div>
  );
}

// A row of numbers at the top of an admin page.
export function StatStrip({ stats }: { stats: { label: string; value: number | string; tone?: "bad" | "warn"; note?: string }[] }) {
  return (
    <dl className="panel mt-8 grid grid-cols-2 divide-mist/70 overflow-hidden lg:grid-cols-4 lg:divide-x [&>div:nth-child(-n+2)]:border-b [&>div:nth-child(-n+2)]:border-mist/70 lg:[&>div:nth-child(-n+2)]:border-b-0">
      {stats.map((s, i) => (
        <div key={s.label} className={`p-5 ${i % 2 === 1 ? "border-l border-mist/70 lg:border-l-0" : ""}`}>
          <dt className="text-sm text-steel">{s.label}</dt>
          <dd className={`readout mt-1 text-4xl leading-none ${s.tone === "bad" ? "text-bad" : s.tone === "warn" ? "text-sun-deep" : ""}`}>
            {s.value}
          </dd>
          {s.note && <dd className="mt-1 text-xs text-steel">{s.note}</dd>}
        </div>
      ))}
    </dl>
  );
}
