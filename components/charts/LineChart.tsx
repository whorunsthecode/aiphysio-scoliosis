"use client";

// Compact SVG line chart with optional error band. No deps. Designed to slot
// into a card alongside a title + numeric readout.

import type { TrendDirection, TrendPoint } from "@/lib/session/trend";

type ChartColor = {
  line: string;
  band: string;
  dot: string;
};

const COLORS: Record<TrendDirection, ChartColor> = {
  improving: {
    line: "#6b9077", // sage-dark
    band: "rgba(127, 167, 138, 0.18)",
    dot: "#6b9077",
  },
  drifting: {
    line: "#b27460", // terracotta-dark
    band: "rgba(232, 163, 151, 0.22)",
    dot: "#b27460",
  },
  stable: {
    line: "#8a7f76", // ink-secondary
    band: "rgba(184, 174, 164, 0.20)",
    dot: "#8a7f76",
  },
};

interface LineChartProps {
  points: TrendPoint[];
  ideal?: number;
  direction?: TrendDirection;
  width?: number;
  height?: number;
  showBand?: boolean;
}

export function LineChart({
  points,
  ideal,
  direction = "stable",
  width = 320,
  height = 100,
  showBand = true,
}: LineChartProps) {
  const padding = { top: 10, right: 10, bottom: 14, left: 10 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const color = COLORS[direction];

  if (points.length === 0) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          fontSize="11"
          fill="#b8aea4"
          fontFamily="system-ui, sans-serif"
        >
          no sessions yet
        </text>
      </svg>
    );
  }

  // Y bounds: include all data ± std + the ideal line if provided.
  const minVal = Math.min(
    ...points.map((p) => p.value - p.std),
    ideal ?? Infinity,
  );
  const maxVal = Math.max(
    ...points.map((p) => p.value + p.std),
    ideal ?? -Infinity,
  );
  // Add a tiny pad so points don't kiss the edges.
  const yPad = Math.max(0.5, (maxVal - minVal) * 0.1);
  const yMin = minVal - yPad;
  const yMax = maxVal + yPad;
  const ySpan = Math.max(1, yMax - yMin);

  const x = (i: number) =>
    points.length === 1
      ? padding.left + innerW / 2
      : padding.left + (i / (points.length - 1)) * innerW;
  const y = (v: number) => padding.top + (1 - (v - yMin) / ySpan) * innerH;

  const pts = points.map((p, i) => ({ x: x(i), y: y(p.value) }));
  const linePath = smoothPath(pts);

  // Error band — upper edge then reverse lower.
  const upperPts = points.map((p, i) => ({ x: x(i), y: y(p.value + p.std) }));
  const lowerPts = points
    .map((p, i) => ({ x: x(i), y: y(p.value - p.std) }))
    .reverse();
  const bandPath =
    smoothPath(upperPts) +
    " L " +
    lowerPts.map((p) => `${p.x} ${p.y}`).join(" L ") +
    " Z";

  const idealOnChart =
    ideal !== undefined && ideal >= yMin && ideal <= yMax;

  const dateFmt = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  });
  const firstDate = dateFmt.format(new Date(points[0].t));
  const lastDate = dateFmt.format(new Date(points[points.length - 1].t));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto"
      role="img"
      aria-label="Trend chart"
    >
      {idealOnChart ? (
        <line
          x1={padding.left}
          y1={y(ideal!)}
          x2={width - padding.right}
          y2={y(ideal!)}
          stroke="rgba(127, 167, 138, 0.35)"
          strokeDasharray="3 4"
          strokeWidth={1}
        />
      ) : null}
      {showBand && points.length >= 2 ? (
        <path d={bandPath} fill={color.band} stroke="none" />
      ) : null}
      <path
        d={linePath}
        fill="none"
        stroke={color.line}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={color.dot} />
      ))}
      {points.length >= 2 ? (
        <>
          <text
            x={padding.left}
            y={height - 2}
            fontSize="9"
            fill="#b8aea4"
            fontFamily="system-ui, sans-serif"
          >
            {firstDate}
          </text>
          <text
            x={width - padding.right}
            y={height - 2}
            fontSize="9"
            fill="#b8aea4"
            textAnchor="end"
            fontFamily="system-ui, sans-serif"
          >
            {lastDate}
          </text>
        </>
      ) : null}
    </svg>
  );
}

// Smooth a polyline with quadratic-bezier midpoint smoothing.
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2)
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];
    const midX = (curr.x + next.x) / 2;
    const midY = (curr.y + next.y) / 2;
    d += ` Q ${curr.x} ${curr.y} ${midX} ${midY}`;
  }
  d += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;
  return d;
}
