import type { CSSProperties, KeyboardEvent } from "react";
import { MAX_LEVEL, MAX_SERVERS, SERVERS, canBuy, upgradeCost } from "../state/prod";
import type { Progress } from "../state/progress";
import { compact, plural } from "../utils/text";
import type { Unit } from "./Prod";
import "./ProdMap.css";

/*
 * Prod as an architecture diagram that fills in as you buy: dashed boxes are upgrades still to
 * install, solid ones are running, red ones are paged. Requests flow along the wires as dots,
 * faster as throughput grows. A box you can afford is also a button that buys its next level.
 */

type Box = { x: number; y: number; w: number; h: number };

const USERS: Box = { x: 16, y: 24, w: 130, h: 60 };
const APP: Box = { x: 560, y: 140, w: 384, h: 170 };
const DB: Box = { x: 16, y: 140, w: 340, h: 170 };

/** Where each lesson's upgrade sits, by upgrade id, with a label short enough to fit. A lesson missing here isn't drawn. */
const SPOTS: Record<string, Box & { label: string }> = {
  http: { label: "HTTP caching", x: 196, y: 24, w: 170, h: 60 },
  security: { label: "Rate limiting", x: 416, y: 24, w: 170, h: 60 },
  sysdesign: { label: "Load balancing", x: 636, y: 24, w: 170, h: 60 },
  cache: { label: "Cache tier", x: 400, y: 190, w: 120, h: 60 },
  // Inside the app tier: what changed in the code.
  bigo: { label: "Code paths", x: 572, y: 244, w: 84, h: 52 },
  ds: { label: "Structures", x: 664, y: 244, w: 84, h: 52 },
  solid: { label: "Boundaries", x: 756, y: 244, w: 84, h: 52 },
  patterns: { label: "Patterns", x: 848, y: 244, w: 84, h: 52 },
  // Inside the database.
  indexes: { label: "Indexes", x: 28, y: 244, w: 154, h: 52 },
  tx: { label: "Transactions", x: 190, y: 244, w: 154, h: 52 },
  dist: { label: "Replicas", x: 16, y: 344, w: 160, h: 56 },
  jobs: { label: "Background jobs", x: 376, y: 344, w: 160, h: 56 },
  testing: { label: "CI pipeline", x: 620, y: 344, w: 150, h: 56 },
  story: { label: "Teammate", x: 790, y: 344, w: 154, h: 56 },
};

/** Requests: users → edge → app → cache → database → replicas, plus the branch to the job queue. */
const TRAFFIC = [
  "M146 54 H196",
  "M366 54 H416",
  "M586 54 H636",
  "M721 84 V140",
  "M560 220 H520",
  "M400 220 H356",
  "M96 310 V344",
  "M600 310 V372 H536",
];

/** Not traffic: CI deploys into the app tier, and the app pages whoever is on call. */
const SUPPORT = ["M695 344 V310", "M867 310 V344"];

/** The server grid: the laptop, then a slot for every server the rack holds. */
const GRID = { x: 572, y: 176, columns: 14, step: 16, size: 12 };

type Props = {
  progress: Progress;
  units: Unit[];
  rps: number;
  /** The last purchase; `n` counts purchases, so buying the same box twice flashes it twice. */
  bought: { id: string; n: number } | null;
  onBuy: (unit: Unit) => void;
};

export function ProdMap({ progress, units, rps, bought, onBuy }: Props) {
  const servers = units.find((unit) => unit.id === SERVERS)!;
  const installed = units.filter((unit) => unit.id !== SERVERS && unit.level > 0).length;
  // 1 req/s to a billion, as 0 to 1: dots grow and speed up with it.
  const flow = Math.min(1, Math.log10(Math.max(1, rps)) / 9);
  const style = {
    "--flow-speed": `${1.2 - 1.05 * flow}s`,
    "--flow-size": `${3 + 3 * flow}px`,
  } as CSSProperties;
  const flash = bought && (bought.id === SERVERS ? APP : SPOTS[bought.id]);

  return (
    <div className="map-scroll">
      <svg
        className="map"
        viewBox="0 0 960 416"
        role="group"
        aria-label={`Diagram of your service: ${installed} of ${units.length - 1} upgrades installed`}
        style={style}
      >
        <defs>
          <marker
            id="prod-map-arrow"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="8"
            markerHeight="8"
            orient="auto"
          >
            <path d="M0 0 L8 4 L0 8 Z" />
          </marker>
        </defs>

        {TRAFFIC.map((d) => (
          <g key={d}>
            <path d={d} className="map-wire" markerEnd="url(#prod-map-arrow)" />
            <path d={d} className="map-flow" />
          </g>
        ))}
        {SUPPORT.map((d) => (
          <path key={d} d={d} className="map-wire support" markerEnd="url(#prod-map-arrow)" />
        ))}

        <g className="map-node running">
          <rect x={USERS.x} y={USERS.y} width={USERS.w} height={USERS.h} rx={8} />
          <text x={USERS.x + 12} y={USERS.y + 23} className="map-label">
            Users
          </text>
          <text x={USERS.x + 12} y={USERS.y + USERS.h - 12} className="map-tag">
            {compact(rps)} req/s
          </text>
        </g>

        <Frame box={DB} title="Database" />
        <path
          className="map-glyph"
          d="M36 184 v30 a18 6 0 0 0 36 0 v-30 a18 6 0 0 0 -36 0 a18 6 0 0 0 36 0"
        />
        <text x={84} y={205} className="map-tag">
          primary
        </text>

        <Frame box={APP} title="App tier" />
        <ServerGrid level={servers.level} />
        <text x={812} y={190} className="map-tag">
          {servers.level ? `laptop + ${plural(servers.level, "server")}` : "just your laptop"}
        </text>
        <ServerButton progress={progress} unit={servers} onBuy={onBuy} />

        {units.map((unit) => {
          const spot = SPOTS[unit.id];
          return spot && <Node key={unit.id} spot={spot} unit={unit} progress={progress} onBuy={onBuy} />;
        })}

        {flash && (
          <rect
            key={bought.n}
            className="map-flash"
            x={flash.x}
            y={flash.y}
            width={flash.w}
            height={flash.h}
            rx={8}
          />
        )}
      </svg>
    </div>
  );
}

function Frame({ box, title }: { box: Box; title: string }) {
  return (
    <g className="map-frame">
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={10} />
      <text x={box.x + 16} y={box.y + 26} className="map-title">
        {title}
      </text>
    </g>
  );
}

type NodeProps = {
  spot: Box & { label: string };
  unit: Unit;
  progress: Progress;
  onBuy: (unit: Unit) => void;
};

function Node({ spot, unit, progress, onBuy }: NodeProps) {
  const { x, y, w, h, label } = spot;
  const cost = upgradeCost(unit.id, unit.level);
  const buyable = unit.state !== "paged" && canBuy(progress, unit.id);
  const maxed = unit.level >= MAX_LEVEL;

  return (
    <g
      className={`map-node ${unit.state}${maxed ? " maxed" : ""}`}
      {...(buyable
        ? buttonProps(`${unit.level ? "Upgrade" : "Install"} ${unit.name}, ${cost} XP`, () => onBuy(unit))
        : {})}
    >
      <title>{nodeTitle(unit, cost, maxed)}</title>
      <rect x={x} y={y} width={w} height={h} rx={8} />
      <text x={x + 12} y={y + 22} className={w < 100 ? "map-label narrow" : "map-label"}>
        {label}
      </text>
      {unit.state === "running" ? (
        <Pips x={x + 12} y={y + h - 17} level={unit.level} />
      ) : (
        <text x={x + 12} y={y + h - 11} className="map-tag">
          {nodeTag(unit, cost)}
        </text>
      )}
    </g>
  );
}

function Pips({ x, y, level }: { x: number; y: number; level: number }) {
  return (
    <g className="map-pips">
      {Array.from({ length: MAX_LEVEL }, (_, i) => (
        <rect
          key={i}
          className={i < level ? "on" : undefined}
          x={x + i * 13}
          y={y}
          width={10}
          height={6}
          rx={1}
        />
      ))}
    </g>
  );
}

/** The laptop, the servers you bought (each newly lit one pops in), and the empty slots left. */
function ServerGrid({ level }: { level: number }) {
  return (
    <g className="map-servers">
      {Array.from({ length: 1 + MAX_SERVERS }, (_, i) => (
        <rect
          key={i}
          className={i === 0 ? "laptop" : i <= level ? "on" : undefined}
          style={{ "--i": i } as CSSProperties}
          x={GRID.x + (i % GRID.columns) * GRID.step}
          y={GRID.y + Math.floor(i / GRID.columns) * GRID.step}
          width={GRID.size}
          height={GRID.size}
          rx={2}
        />
      ))}
    </g>
  );
}

function ServerButton({
  progress,
  unit,
  onBuy,
}: {
  progress: Progress;
  unit: Unit;
  onBuy: (unit: Unit) => void;
}) {
  if (!canBuy(progress, SERVERS)) return null;

  const cost = upgradeCost(SERVERS, unit.level);
  return (
    <g className="map-add" {...buttonProps(`Add a server, ${cost} XP`, () => onBuy(unit))}>
      <rect x={808} y={202} width={124} height={26} rx={13} />
      <text x={870} y={219} textAnchor="middle">
        + server · {cost} XP
      </text>
    </g>
  );
}

/** Makes an SVG group act like a button: focusable, named, and pressed with a click, Enter or Space. */
function buttonProps(label: string, press: () => void) {
  return {
    role: "button",
    tabIndex: 0,
    "aria-label": label,
    onClick: press,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      press();
    },
  };
}

function nodeTag(unit: Unit, cost: number) {
  if (unit.state === "locked") return `lesson ${unit.lesson?.n}`;
  if (unit.state === "paged") return "paged";
  return `${cost} XP`;
}

function nodeTitle(unit: Unit, cost: number, maxed: boolean) {
  if (unit.state === "locked") return `${unit.name}: finish lesson ${unit.lesson?.n} to unlock`;
  if (unit.state === "paged") return `${unit.name}: paged. Review its lesson's cards to bring it back.`;
  if (maxed) return `${unit.name}: maxed`;
  return `${unit.name}: level ${unit.level} of ${MAX_LEVEL}. Next level ${cost} XP.`;
}
