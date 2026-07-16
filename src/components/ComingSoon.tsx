export function ComingSoon({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: string[];
}) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-800">{title}</h2>
      <div className="rounded-xl bg-white p-8 shadow-sm">
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
          Segera Hadir
        </span>
        <p className="mt-4 text-slate-600">{description}</p>
        <ul className="mt-4 space-y-2 text-sm text-slate-500">
          {items.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="mt-0.5 text-indigo-600">✓</span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
