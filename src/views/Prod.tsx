import { useEffect, useEffectEvent, useState, type CSSProperties } from "react";
import { lessons } from "../content/lessons";
import type { Lesson } from "../content/types";
import { SERVERS_UPGRADE, upgradeFor } from "../content/upgrades";
import { hrefFor } from "../router";
import {
  BOOST,
  SERVERS,
  canBuy,
  isUnlocked,
  maxLevel,
  pagedCount,
  servedBy,
  stageInfo,
  throughput,
  upgradeCost,
  xpToSpend,
  type Health,
  type Prod as ProdState,
} from "../state/prod";
import { useProgress } from "../state/ProgressContext";
import type { Progress } from "../state/progress";
import { prodHealth } from "../state/selectors";
import { useNow } from "../utils/clock";
import { today } from "../utils/dates";
import { bigCount, compact, plural, twoDigits } from "../utils/text";
// The stage bar is drawn like the XP bar.
import "../components/LevelBar.css";
import "./Prod.css";
import { ProdMap } from "./ProdMap";

export function Prod() {
  const { progress, dispatch } = useProgress();
  const health = prodHealth(lessons, progress, today());
  const speed = throughput(progress.prod.owned, health);
  const [away] = useState(() => awayNote(progress.prod, speed.rps, Date.now()));
  const units = rackUnits(progress, health);
  const [announcement, setAnnouncement] = useState("");
  const [bought, setBought] = useState<{ id: string; n: number } | null>(null);

  // Opening prod counts what it served since your last visit, and boots it the first time.
  const count = useEffectEvent(() => dispatch({ type: "bank", rps: speed.rps, now: Date.now() }));
  useEffect(() => count(), []);

  function buy(unit: Unit) {
    const level = unit.level + 1;
    const rps = throughput({ ...progress.prod.owned, [unit.id]: level }, health).rps;

    dispatch({ type: "buy", id: unit.id, rps: speed.rps, now: Date.now() });
    setBought((last) => ({ id: unit.id, n: (last?.n ?? 0) + 1 }));
    setAnnouncement(`${unit.name}: level ${level}. Prod now serves ${compact(rps)} requests a second.`);
  }

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Prod</p>
        <h1>Your service, in production</h1>
        <p>
          Every XP you earn is budget for its infrastructure, and spending it never lowers your level.
          Finishing a lesson unlocks an upgrade, and your flashcards are its cache.
        </p>
      </div>
      <Status progress={progress} health={health} speed={speed} away={away} />
      <section className="panel prod-panel" aria-labelledby="map-title">
        <div className="prod-panel-head">
          <h2 id="map-title">What you've built</h2>
          <span className="mono-note">Click a box you can afford to buy it</span>
        </div>
        <ProdMap progress={progress} units={units} rps={speed.rps} bought={bought} onBuy={buy} />
        <p className="prod-note">
          Dots are requests, and they speed up as prod grows. Dashed boxes are still to install; red ones are
          paged.
        </p>
      </section>
      <Rack progress={progress} units={units} onBuy={buy} />
      <p className="live" aria-live="polite">
        {announcement}
      </p>
    </>
  );
}

type Speed = ReturnType<typeof throughput>;

function Status({
  progress,
  health,
  speed,
  away,
}: {
  progress: Progress;
  health: Health;
  speed: Speed;
  away: string | null;
}) {
  const stage = stageInfo(speed.rps);
  const paged = pagedCount(progress.prod.owned, health);

  return (
    <section className="panel prod-status">
      <div className="prod-served">
        <p className="eyebrow">Requests served</p>
        <ServedCounter prod={progress.prod} rps={speed.rps} />
        <p className="prod-rate">
          <b>{compact(speed.rps)}</b> req/s
        </p>
        {away && <p className="muted">{away}</p>}
      </div>

      <div className="prod-stage">
        <p className="eyebrow">Stage</p>
        <h2>{stage.name}</h2>
        <div
          className="xp-bar"
          role="progressbar"
          aria-label="Way to the next stage"
          aria-valuenow={Math.round(stage.percent)}
        >
          <i style={{ width: `${stage.percent}%` }} />
        </div>
        <p className="mono-note">
          {stage.next ? `${stage.next.name} at ${compact(stage.next.rps)} req/s` : "As big as it gets"}
        </p>
      </div>

      <dl className="prod-factors">
        <Factor
          term="Machines"
          value={String(speed.base)}
          note={speed.base === 1 ? "your laptop" : "laptop + servers"}
        />
        <Factor
          term="Upgrades"
          value={`×${speed.boost.toFixed(2)}`}
          note={paged ? `${paged} paged` : "all running"}
        />
        <Factor
          term="Cache"
          value={`×${speed.cache.toFixed(2)}`}
          note={`${Math.round(health.warmth * 100)}% warm`}
        />
        <Factor term="To spend" value={`${xpToSpend(progress)} XP`} note={`of ${progress.xp} earned`} />
      </dl>

      <p className="prod-note">
        {paged ? (
          <>
            {plural(paged, "upgrade")} paged: {paged === 1 ? "its lesson" : "their lessons"} went cold.{" "}
            <a href={hrefFor({ view: "review" })}>Review the due cards</a> to bring{" "}
            {paged === 1 ? "it" : "them"} back.
          </>
        ) : (
          "Cards in higher tiers serve more cache hits; a due card is a miss. A lesson left cold for a week pages its upgrade offline."
        )}
      </p>
    </section>
  );
}

function Factor({ term, value, note }: { term: string; value: string; note: string }) {
  return (
    <div>
      <dt>{term}</dt>
      <dd>
        <b>{value}</b>
        <span>{note}</span>
      </dd>
    </div>
  );
}

/** The running total, ticking up live. Its own component, so only it re-renders every tick. */
function ServedCounter({ prod, rps }: { prod: ProdState; rps: number }) {
  const now = useNow(200);
  return <p className="prod-counter">{bigCount(servedBy(prod, rps, now))}</p>;
}

type UnitState = "locked" | "empty" | "running" | "paged";

export type Unit = {
  id: string;
  name: string;
  line: string;
  lesson?: Lesson;
  level: number;
  state: UnitState;
};

function Rack({
  progress,
  units,
  onBuy,
}: {
  progress: Progress;
  units: Unit[];
  onBuy: (unit: Unit) => void;
}) {
  const running = units.filter((unit) => unit.state === "running").length;

  return (
    <section className="panel prod-panel" aria-labelledby="rack-title">
      <div className="prod-panel-head">
        <h2 id="rack-title">The rack</h2>
        <span className="mono-note">
          {running}/{units.length} units running · {xpToSpend(progress)} XP to spend
        </span>
      </div>
      <ol className="rack-units">
        {units.map((unit, i) => (
          <RackUnit
            key={unit.id}
            unit={unit}
            slot={i + 1}
            affordable={canBuy(progress, unit.id)}
            onBuy={onBuy}
          />
        ))}
      </ol>
    </section>
  );
}

function rackUnits(progress: Progress, health: Health): Unit[] {
  const servers = progress.prod.owned[SERVERS] ?? 0;

  return [
    { id: SERVERS, ...SERVERS_UPGRADE, level: servers, state: "running" },
    ...lessons.map((lesson): Unit => {
      const level = progress.prod.owned[lesson.id] ?? 0;
      return {
        id: lesson.id,
        ...upgradeFor(lesson),
        lesson,
        level,
        state: unitState(progress, health, lesson.id, level),
      };
    }),
  ];
}

function unitState(progress: Progress, health: Health, id: string, level: number): UnitState {
  if (!isUnlocked(progress, id)) return "locked";
  if (!level) return "empty";
  return health.cold.has(id) ? "paged" : "running";
}

type RackUnitProps = { unit: Unit; slot: number; affordable: boolean; onBuy: (unit: Unit) => void };

function RackUnit({ unit, slot, affordable, onBuy }: RackUnitProps) {
  const isServers = unit.id === SERVERS;

  return (
    <li className={`unit ${unit.state}`} style={{ "--i": slot } as CSSProperties}>
      <span className="unit-slot">U{twoDigits(slot)}</span>
      <i className="led" aria-hidden="true" />
      <div className="unit-name">
        <h3>{unit.name}</h3>
        <p>{unitLine(unit)}</p>
      </div>
      {isServers ? (
        <span className="unit-level mono-note">{plural(unit.level, "server")}</span>
      ) : (
        <Pips level={unit.level} max={maxLevel(unit.id)} />
      )}
      <span className="unit-effect">{unitEffect(unit)}</span>
      <UnitAction unit={unit} affordable={affordable} onBuy={onBuy} />
    </li>
  );
}

function Pips({ level, max }: { level: number; max: number }) {
  return (
    <span className="unit-level pips" role="img" aria-label={`Level ${level} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={i < level ? "on" : undefined} />
      ))}
    </span>
  );
}

function UnitAction({
  unit,
  affordable,
  onBuy,
}: {
  unit: Unit;
  affordable: boolean;
  onBuy: (unit: Unit) => void;
}) {
  if (unit.state === "locked" && unit.lesson) {
    return (
      <a className="btn ghost small" href={hrefFor({ view: "lesson", id: unit.lesson.id })}>
        Lesson {unit.lesson.n}
      </a>
    );
  }

  if (unit.state === "paged") {
    return (
      <a className="btn small" href={hrefFor({ view: "review" })}>
        Review
      </a>
    );
  }

  if (unit.level >= maxLevel(unit.id)) return <span className="pill hot">maxed</span>;

  const verb = unit.id === SERVERS ? "Add one" : unit.level ? "Upgrade" : "Install";
  return (
    <button className="btn small" disabled={!affordable} onClick={() => onBuy(unit)}>
      {verb} · {upgradeCost(unit.id, unit.level)} XP<span className="sr-only">: {unit.name}</span>
    </button>
  );
}

function unitLine(unit: Unit) {
  if (unit.state === "locked" && unit.lesson)
    return `Finish lesson ${unit.lesson.n}, ${unit.lesson.title}, to install.`;
  if (unit.state === "paged") return "Paged: its lesson went cold. Reviewing its cards brings it back.";
  return unit.line;
}

function unitEffect(unit: Unit) {
  if (unit.id === SERVERS) return `${1 + unit.level} req/s base`;
  if (unit.state === "paged") return "offline";
  if (!unit.level) return `×${BOOST} a level`;
  return `×${(BOOST ** unit.level).toFixed(2)}`;
}

/** "While you were away (3 days), prod served 2.1M requests.", or null right after the last visit. */
function awayNote(prod: ProdState, rps: number, now: number): string | null {
  const minutes = Math.floor((now - prod.at) / 60_000);
  if (!prod.at || minutes < 1) return null;

  const served = compact(servedBy(prod, rps, now) - prod.served);
  return `While you were away (${awayTime(minutes)}), prod served ${served} requests.`;
}

function awayTime(minutes: number) {
  if (minutes < 60) return plural(minutes, "minute");
  if (minutes < 60 * 24) return plural(Math.floor(minutes / 60), "hour");
  return plural(Math.floor(minutes / (60 * 24)), "day");
}
