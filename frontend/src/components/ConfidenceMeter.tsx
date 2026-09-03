interface Props {
  confidence: number; // 0-100
  size?: number;
}

export function ConfidenceMeter({ confidence, size = 80 }: Props) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  // Only show 270° arc (bottom gap = 90°)
  const arcLength = circumference * 0.75;

  const color =
    confidence >= 70 ? "#22c55e" : confidence >= 45 ? "#f59e0b" : "#ef4444";

  // Start at 135° (bottom-left), sweep clockwise
  const startAngle = 135;
  const endAngle = startAngle + 270 * (confidence / 100);

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const cx = size / 2;
  const cy = size / 2;

  const x1 = cx + radius * Math.cos(toRad(startAngle));
  const y1 = cy + radius * Math.sin(toRad(startAngle));
  const x2 = cx + radius * Math.cos(toRad(endAngle));
  const y2 = cy + radius * Math.sin(toRad(endAngle));
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={6}
          strokeDasharray={`${arcLength} ${circumference - arcLength}`}
          strokeDashoffset={circumference * 0.125}
          strokeLinecap="round"
          transform={`rotate(90 ${cx} ${cy})`}
        />
        {/* Arc */}
        {confidence > 0 && (
          <path
            d={`M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`}
            fill="none"
            stroke={color}
            strokeWidth={6}
            strokeLinecap="round"
          />
        )}
        {/* Label */}
        <text
          x={cx}
          y={cy + 5}
          textAnchor="middle"
          fill="#F8FAFC"
          fontSize={size * 0.22}
          fontFamily="Roboto Mono, monospace"
          fontWeight="500"
        >
          {confidence}
        </text>
        <text
          x={cx}
          y={cy + size * 0.22}
          textAnchor="middle"
          fill="var(--text-disabled)"
          fontSize={size * 0.14}
          fontFamily="Roboto, sans-serif"
        >
          %
        </text>
      </svg>
    </div>
  );
}
