interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  className?: string;
}

export default function Logo({ size = 'md', showSubtitle = true, className = '' }: LogoProps) {
  const sizes = {
    sm: { icon: 24, text: 'text-base', sub: 'text-[7px]', gap: 'gap-2' },
    md: { icon: 30, text: 'text-xl', sub: 'text-[9px]', gap: 'gap-2.5' },
    lg: { icon: 48, text: 'text-3xl', sub: 'text-[10px]', gap: 'gap-4' },
  };
  const s = sizes[size];

  return (
    <div className={`flex items-center ${s.gap} ${className}`}>
      {/* Hexagon icon */}
      <svg width={s.icon} height={s.icon} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Outer hexagon */}
        <path
          d="M20 2L36.66 11V29L20 38L3.34 29V11L20 2Z"
          stroke="#f5a623"
          strokeWidth="2"
          fill="#f5a623"
          fillOpacity="0.1"
        />
        {/* Inner upward trending line */}
        <path 
          d="M12 26L18 19L23 23L29 14" 
          stroke="#0a0a0f" 
          strokeWidth="2.5" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
        />
        {/* Highlight over the trend line to make it pop inside the semi-transparent dark */}
        <path 
          d="M12 26L18 19L23 23L29 14" 
          stroke="#f5a623" 
          strokeWidth="1.5" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
        />
        {/* Sparkle node at the end of the trend line */}
        <circle cx="29" cy="14" r="2.5" fill="#f5a623" />
      </svg>
      {/* Text */}
      <div className="flex flex-col justify-center">
        <h1 className={`${s.text} font-black tracking-wider text-[#f5a623] uppercase leading-none`}>
          Aurelia
        </h1>
        {showSubtitle && (
          <p className={`${s.sub} font-bold tracking-[0.25em] text-[#4a4a6a] mt-1 uppercase leading-none`}>
            Pricing Intelligence
          </p>
        )}
      </div>
    </div>
  );
}
