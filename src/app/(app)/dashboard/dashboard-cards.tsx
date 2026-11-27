import Link from "next/link";

import type { DashboardCard } from "@/modules/core";

const cardClass = "flex h-full flex-col gap-1 rounded-lg border p-4";

function CardBody({ card }: { card: DashboardCard }) {
  return (
    <>
      <span className="text-3xl font-semibold tabular-nums">{card.count}</span>
      <span className="text-sm text-muted-foreground">{card.label}</span>
    </>
  );
}

export function DashboardCards({ cards }: { cards: DashboardCard[] }) {
  return (
    <ul aria-label="At a glance" className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <li key={card.label}>
          {card.href === null ? (
            <div className={cardClass}>
              <CardBody card={card} />
            </div>
          ) : (
            <Link href={card.href} className={`${cardClass} hover:bg-muted`}>
              <CardBody card={card} />
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
