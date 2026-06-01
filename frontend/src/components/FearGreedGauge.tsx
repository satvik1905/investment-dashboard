import type { FearGreedData } from "../hooks/useNews";

function getColor(score: number): string {
  if (score <= 25) return "#F43F5E";
  if (score <= 45) return "#F97316";
  if (score <= 55) return "#F59E0B";
  if (score <= 75) return "#10B981";
  return "#06B6D4";
}

function getSentimentText(score: number): string {
  if (score < 25) return "Extreme fear often signals buying opportunities.";
  if (score > 75) return "Extreme greed — market may be due for a correction. Be cautious.";
  if (score >= 45 && score <= 55) return "Neutral market sentiment — no strong directional signal.";
  if (score < 45) return "Fear in the market — consider looking for strong setups.";
  return "Greed building — tighten stop losses on open positions.";
}

interface Props {
  data: FearGreedData;
}

function GaugeSVG({ score, color }: { score: number; color: string }) {
  // Semicircle from left (180°) to right (0°), score maps 0→180 to 180°→0°
  const W = 260, H = 150, CX = 130, CY = 130, R = 100;
  const strokeW = 14;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const arcPoint = (deg: number) => ({
    x: CX + R * Math.cos(toRad(deg)),
    y: CY + R * Math.sin(toRad(deg)),
  });

  // Background arc: 180° → 0° (left to right, top half)
  const bgStart = arcPoint(180);
  const bgEnd = arcPoint(0);

  // Score arc: 180° → angle for score
  const scoreAngle = 180 + score * 1.8; // 0→180° (left), 50→270° (top), 100→360° (right)
  const scoreEnd = arcPoint(scoreAngle);
  const largeArc = 0; // arc is always ≤180° on a semicircle gauge

  // Needle
  const needleAngle = toRad(180 + score * 1.8);
  const needleLen = R - 8;
  const nx = CX + needleLen * Math.cos(needleAngle);
  const ny = CY + needleLen * Math.sin(needleAngle);

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      {/* Background arc */}
      <path
        d={`M ${bgStart.x} ${bgStart.y} A ${R} ${R} 0 0 1 ${bgEnd.x} ${bgEnd.y}`}
        fill="none"
        stroke="rgba(255,255,255,0.07)"
        strokeWidth={strokeW}
        strokeLinecap="round"
      />
      {/* Score arc */}
      {score > 0 && (
        <path
          d={`M ${bgStart.x} ${bgStart.y} A ${R} ${R} 0 ${largeArc} 1 ${scoreEnd.x} ${scoreEnd.y}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeW}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${color}66)` }}
        />
      )}
      {/* Needle */}
      <line
        x1={CX} y1={CY}
        x2={nx} y2={ny}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.9}
      />
      {/* Center dot */}
      <circle cx={CX} cy={CY} r={5} fill={color} />
      {/* Score label */}
      <text
        x={CX} y={CY - 22}
        textAnchor="middle"
        fill="#F8FAFC"
        fontSize="36"
        fontWeight="700"
        fontFamily="DM Mono, monospace"
      >
        {score}
      </text>
      {/* Range labels */}
      <text x={22} y={CY + 20} fill="var(--text-disabled)" fontSize="10" fontFamily="DM Sans">0</text>
      <text x={CX - 8} y={32} fill="var(--text-disabled)" fontSize="10" fontFamily="DM Sans">50</text>
      <text x={W - 30} y={CY + 20} fill="var(--text-disabled)" fontSize="10" fontFamily="DM Sans">100</text>
    </svg>
  );
}

function ComparisonPill({
  label, from, to,
}: { label: string; from: number | null; to: number; }) {
  if (from == null) return null;
  const diff = to - from;
  const up = diff >= 0;
  return (
    <div
      className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
    >
      <span className="text-xs font-sans" style={{ color: "var(--text-muted)" }}>{label}</span>
      <div className="flex items-center gap-2 font-mono text-xs">
        <span style={{ color: "var(--text-secondary)" }}>{from}</span>
        <span style={{ color: "var(--text-muted)" }}>→</span>
        <span style={{ color: "var(--text-primary)" }}>{to}</span>
        <span style={{ color: up ? "var(--green)" : "var(--red)" }}>
          {up ? "↑" : "↓"} {up ? "+" : ""}{diff}
        </span>
      </div>
    </div>
  );
}

export function FearGreedGauge({ data }: Props) {
  if (!data.score) {
    return (
      <div className="flex items-center justify-center h-40 text-sm font-sans" style={{ color: "var(--text-muted)" }}>
        Market sentiment unavailable
      </div>
    );
  }

  const color = getColor(data.score);

  return (
    <div className="flex flex-col md:flex-row items-center gap-8 p-6">
      {/* Gauge */}
      <div className="flex flex-col items-center gap-2 shrink-0">
        <GaugeSVG score={data.score} color={color} />
        <div className="text-center">
          <div
            className="text-sm font-semibold font-sans uppercase tracking-widest"
            style={{ color }}
          >
            {data.rating}
          </div>
          <div className="text-xs font-sans mt-1.5 max-w-[220px] text-center" style={{ color: "var(--text-muted)" }}>
            {getSentimentText(data.score)}
          </div>
        </div>
      </div>

      {/* Comparisons */}
      <div className="flex flex-col gap-2.5 w-full md:w-64">
        <div className="text-[10px] uppercase tracking-widest font-sans mb-1" style={{ color: "var(--text-muted)" }}>
          Compared to
        </div>
        <ComparisonPill label="Yesterday" from={data.previous_close} to={data.score} />
        <ComparisonPill label="Last Week" from={data.previous_1_week} to={data.score} />
        {data.previous_1_month != null && (
          <ComparisonPill label="Last Month" from={data.previous_1_month} to={data.score} />
        )}
      </div>
    </div>
  );
}

export function FearGreedSkeleton() {
  return <div className="skeleton h-48 rounded-xl" />;
}
