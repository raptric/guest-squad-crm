export function SettingsHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h1 className="text-xl font-semibold text-zinc-900">{title}</h1>
      <p className="text-sm text-zinc-500">{description}</p>
    </div>
  );
}
