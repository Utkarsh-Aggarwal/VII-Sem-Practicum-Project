export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`rounded-xl bg-surface-2 ${className}`} style={{ animation: "skeleton 1.4s ease-in-out infinite" }} />;
}
