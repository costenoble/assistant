/** Affiché pendant la récupération du mail sur le serveur (une ou deux secondes la première fois). */
export default function Loading() {
  return (
    <div className="max-w-4xl animate-pulse space-y-5" aria-busy="true" aria-label="Chargement du mail">
      <div className="h-4 w-20 rounded bg-surface-2" />
      <div className="h-8 w-3/4 rounded bg-surface-2" />
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-full bg-surface-2" />
        <div className="space-y-2">
          <div className="h-3.5 w-48 rounded bg-surface-2" />
          <div className="h-3 w-32 rounded bg-surface-2" />
        </div>
      </div>
      <div className="h-96 rounded-xl bg-surface-2" />
    </div>
  );
}
