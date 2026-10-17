interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  className?: string;
  /** Use inside the authenticated app shell (light background) — the pre-login pages stay dark
      and keep the original fixed brand hex, so their appearance is untouched by this retheme. */
  light?: boolean;
  /** Explicit wordmark/subtitle color classes, taking precedence over `light`. For surfaces (like
      the public landing page) that must render a fixed palette independent of the shared theme
      tokens, which can carry a signed-out visitor's stale dark-mode preference from localStorage. */
  wordmarkClassName?: string;
  subtitleClassName?: string;
  /** Renders just the hexagon mark, no wordmark/subtitle — for a collapsed icon-only sidebar. */
  iconOnly?: boolean;
}

export default function Logo({ size = 'md', showSubtitle = true, className = '', light = false, wordmarkClassName, subtitleClassName, iconOnly = false }: LogoProps) {
  const sizes = {
    sm: { icon: 24, text: 'text-base', sub: 'text-[7px]', gap: 'gap-2' },
    md: { icon: 30, text: 'text-xl', sub: 'text-[9px]', gap: 'gap-2.5' },
    lg: { icon: 48, text: 'text-3xl', sub: 'text-[10px]', gap: 'gap-4' },
  };
  const s = sizes[size];

  return (
    <div className={`flex items-center ${s.gap} ${className}`}>
      {/* Brand mark (public/aurelia-logo.png — the "A" with the rising gold graph line),
          replacing the old inline hexagon SVG. Fixed-color raster asset (navy + gold baked in),
          so unlike the old SVG it isn't recolored by `light`/currentColor — only the wordmark
          text next to it still responds to that. Source is 512x512, comfortably sharp up to 3x
          pixel density at every size this component actually renders. */}
      <img
        src="/aurelia-logo.png"
        alt="AURELIA"
        width={s.icon}
        height={s.icon}
        className="shrink-0 object-contain"
        style={{ width: s.icon, height: s.icon }}
      />
      {/* Text */}
      {!iconOnly && (
        <div className="flex flex-col justify-center">
          <h1 className={`${s.text} font-black tracking-wider ${wordmarkClassName ?? (light ? 'text-gold' : 'text-[#f5a623]')} uppercase leading-none`}>
            Aurelia
          </h1>
          {showSubtitle && (
            <p className={`${s.sub} font-bold tracking-[0.25em] ${subtitleClassName ?? (light ? 'text-muted-foreground' : 'text-[#4a4a6a]')} mt-1 uppercase leading-none`}>
              Pricing Intelligence
            </p>
          )}
        </div>
      )}
    </div>
  );
}
