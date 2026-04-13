import { Wrench } from 'lucide-react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  white?: boolean;
}

export default function Logo({ size = 'md', white = false }: LogoProps) {
  const sizes = {
    sm: { icon: 20, text: 'text-lg', sub: 'text-xs' },
    md: { icon: 28, text: 'text-xl', sub: 'text-sm' },
    lg: { icon: 40, text: 'text-3xl', sub: 'text-base' },
  };

  const s = sizes[size];
  const colorClass = white ? 'text-white' : 'text-[#0f3460]';
  const subColorClass = white ? 'text-blue-200' : 'text-[#1a5fa8]';
  const iconBg = white ? 'bg-white/20' : 'bg-[#0f3460]';
  const iconColor = white ? 'text-white' : 'text-white';

  return (
    <div className="flex items-center gap-3">
      <div className={`${iconBg} rounded-xl p-2 flex items-center justify-center`}>
        <Wrench size={s.icon} className={iconColor} />
      </div>
      <div>
        <div className={`font-bold ${s.text} ${colorClass} leading-tight`}>
          Mister Service
        </div>
        <div className={`font-semibold ${s.sub} ${subColorClass} leading-tight`}>
          RD
        </div>
      </div>
    </div>
  );
}
