'use client';

import { StatsData } from './types';

interface FunFactorProps {
  byDriver: StatsData['byDriver'];
}

interface DominanceItem {
  message: string;
  emoji: string;
  context: string;
  pct: number;
}

function getFirstName(fullName: string): string {
  return fullName.trim().split(' ')[0];
}

function pickByHash<T>(arr: T[], key: string): T {
  const hash = key.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return arr[hash % arr.length];
}

const TIER_90 = [
  { emoji: '🪥', text: (f: string, v: string) => `${f}, t'as laissé une brosse à dents dans le ${v} ?` },
  { emoji: '🛖', text: (f: string, v: string) => `Le ${v}, c'est devenu ton adresse postale, ${f} ?` },
  { emoji: '🔐', text: (f: string, v: string) => `${f}, t'as changé le code du ${v} pour être sûr ?` },
  { emoji: '🏷️', text: (f: string, v: string) => `${f} a mis son nom dessus — le ${v} est pris.` },
];

const TIER_80 = [
  { emoji: '🔑', text: (f: string, v: string) => `Apparemment, le ${v} c'est ton VL perso, ${f} !` },
  { emoji: '🧰', text: (f: string, v: string) => `${f} a rangé ses affaires dans le ${v}, non ?` },
  { emoji: '🎯', text: (f: string, v: string) => `Le ${v} est ton véhicule attitré, ${f}.` },
  { emoji: '🚗', text: (f: string, v: string) => `Le ${v} a déjà programmé "maison" dans son GPS, ${f} ?` },
];

const TIER_75 = [
  { emoji: '🏠', text: (f: string, v: string) => `Le ${v} est devenu ton bureau mobile, ${f}.` },
  { emoji: '📦', text: (f: string, v: string) => `${f} utilise le ${v} comme entrepôt personnel.` },
  { emoji: '🛋️', text: (f: string, v: string) => `Le ${v}, c'est ton deuxième salon, ${f} ?` },
  { emoji: '☕', text: (f: string, v: string) => `${f}, tu déjeunes dans le ${v} aussi ?` },
];

const TIER_65 = [
  { emoji: '🐾', text: (f: string, v: string) => `On dirait que tu as adopté le ${v}, ${f}.` },
  { emoji: '🤝', text: (f: string, v: string) => `${f} et le ${v} : une relation exclusive.` },
  { emoji: '👀', text: (f: string, v: string) => `Les autres chauffeurs sont jaloux du ${v}, ${f}.` },
  { emoji: '🌱', text: (f: string, v: string) => `${f} a apprivoisé le ${v}.` },
];

function getMessage(pct: number, firstName: string, vehicle: string): { emoji: string; text: string } {
  const key = firstName + vehicle;
  let pool = TIER_65;
  if (pct >= 90) pool = TIER_90;
  else if (pct >= 80) pool = TIER_80;
  else if (pct >= 75) pool = TIER_75;
  const entry = pickByHash(pool, key);
  return { emoji: entry.emoji, text: entry.text(firstName, vehicle) };
}

export default function FunFactor({ byDriver }: FunFactorProps) {
  const dominanceItems: DominanceItem[] = [];

  byDriver.forEach((driver) => {
    driver.byVehicle.forEach((veh) => {
      if (veh.percentOfVehicleTotal >= 65 && veh.tripCount >= 3) {
        const firstName = getFirstName(driver.driverName);
        const { emoji, text } = getMessage(veh.percentOfVehicleTotal, firstName, veh.vehicleName);
        dominanceItems.push({
          emoji,
          message: text,
          context: `${driver.driverName} représente ${veh.percentOfVehicleTotal}% des emprunts du ${veh.vehicleName} sur la période`,
          pct: veh.percentOfVehicleTotal,
        });
      }
    });
  });

  dominanceItems.sort((a, b) => b.pct - a.pct);

  if (dominanceItems.length === 0) return null;

  return (
    <div className="fun-factor">
      <div className="fun-header">
        <div>
          <div className="fun-title">Fun Fact</div>
          <div className="fun-subtitle">Observations statistiquement humoristiques</div>
        </div>
      </div>
      <div className="fun-items">
        {dominanceItems.map((item, idx) => (
          <div key={idx} className="fun-item">
            <div className="fun-emoji">{item.emoji}</div>
            <div>
              <div className="fun-message">{item.message}</div>
              <div className="fun-context">{item.context}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
