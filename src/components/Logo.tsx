interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  white?: boolean;
  compact?: boolean;
}

/** Marca de la aplicación; originales conservados en public/logo-full.png. */
export default function Logo({ size = 'md', compact, white = false }: LogoProps) {
  const small = compact ?? size === 'sm';
  const height = { sm: 36, md: 48, lg: 64 }[size];
  return (
    <div className="flex items-center gap-3 min-w-0" aria-label="Mister Service RD">
      <img src="/logo-app-2026.png" alt="" width={height} height={height}
        style={{ height, width: height }} className="block rounded-2xl select-none shrink-0" draggable={false} />
      {!small && <div className={`leading-tight ${white ? 'text-white' : 'text-[#12345a]'}`}>
        <span className="block text-xs font-semibold tracking-[.18em] uppercase">Mister</span>
        <span className={`${size === 'lg' ? 'text-2xl' : 'text-xl'} font-extrabold tracking-tight`}>Service <span className="text-sky-400">RD</span></span>
      </div>}
    </div>
  );
}
