/** Small, muted "Beta" pill for companion apps (AQUILA, FABULA) in the sidebars. Theme-aware via
    the same --theme-* tokens the sidebar items use, so it stays subtle in light and dark. */
export default function BetaBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`shrink-0 px-1.5 py-px rounded-full text-[9px] font-semibold uppercase tracking-wider leading-[14px] ${className}`}
      style={{
        color: 'hsl(var(--theme-text-sec))',
        border: '1px solid hsl(var(--theme-border))',
        opacity: 0.85,
      }}
    >
      Beta
    </span>
  );
}
