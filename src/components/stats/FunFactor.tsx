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

function getMessage(pct: number, firstName: string, vehicle: string): { emoji: string; text: string } {
  if (pct >= 90) return { emoji: '🪥', text: `${firstName}, t'as laissé une brosse à dents dans le ${vehicle} ?` };
  if (pct >= 80) return { emoji: '🔑', text: `Apparemment, le ${vehicle} c'est ton VL perso, ${firstName} !` };
  if (pct >= 75) return { emoji: '🏠', text: `Le ${vehicle} est devenu ton bureau mobile, ${firstName}.` };
  if (pct >= 65) return { emoji: '🐾', text: `On dirait que tu as adopté ce véhicule, ${firstName}.` };
  return { emoji: '😏', text: `${firstName}, tu commences à prendre tes aises avec le ${vehicle}...` };
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
