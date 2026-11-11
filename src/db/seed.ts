// Seeds roles, fictional users, items, and suppliers. Safe to run again: rows
// that already exist are kept. Run with `npm run db:seed`; reads `.env`.

import "dotenv/config";

import { createClient } from "@supabase/supabase-js";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import type { Tx } from "@/db";

import * as schema from "./schema";

type RoleName = (typeof schema.appRoleEnum.enumValues)[number];

const ATTACHMENT_BUCKET = "documents";
const seedDeliveryDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
}).format(new Date());

// All people, companies, and products below are made up.
const seedUsers: {
  email: string;
  fullName: string;
  role: RoleName;
  approverEmail?: string;
}[] = [
  { email: "approver@rcwheels.test", fullName: "Marites Lim", role: "requisition_approver" },
  { email: "depthead@rcwheels.test", fullName: "Ramon Go", role: "requisition_approver" },
  { email: "requester@rcwheels.test", fullName: "Rosa Villareal", role: "requester", approverEmail: "approver@rcwheels.test" },
  { email: "mechanic1@rcwheels.test", fullName: "Dante Abellana", role: "requester", approverEmail: "depthead@rcwheels.test" },
  { email: "mechanic2@rcwheels.test", fullName: "Jun Paredes", role: "requester", approverEmail: "depthead@rcwheels.test" },
  { email: "custodian@rcwheels.test", fullName: "Liza Cabrera", role: "inventory_custodian" },
  { email: "invmanager@rcwheels.test", fullName: "Nestor Uy", role: "inventory_manager" },
  { email: "purchasing@rcwheels.test", fullName: "Carla Mendez", role: "purchasing_staff" },
  { email: "accounting@rcwheels.test", fullName: "Paolo Sy", role: "accounting_associate" },
  { email: "delivery@rcwheels.test", fullName: "Arnel Bacus", role: "delivery_operations" },
  { email: "admin@rcwheels.test", fullName: "Grace Tan", role: "system_administrator" },
];

const seedItems = [
  { itemCode: "TIRE-1757013", itemName: "Passenger tire 175/70 R13", specification: "Tubeless radial", unit: "pc", reorderPoint: "8" },
  { itemCode: "TIRE-1956515", itemName: "Passenger tire 195/65 R15", specification: "Tubeless radial", unit: "pc", reorderPoint: "8" },
  { itemCode: "RIM-15ALLOY", itemName: "Alloy rim 15 inch", specification: "4 x 100 bolt pattern", unit: "pc", reorderPoint: "4" },
  { itemCode: "VALVE-TR413", itemName: "Tire valve TR413", specification: "Rubber snap-in", unit: "pc", reorderPoint: "50" },
  { itemCode: "WEIGHT-10G", itemName: "Wheel balancing weight 10 g", specification: "Adhesive, steel", unit: "pc", reorderPoint: "100" },
  { itemCode: "LUG-M12", itemName: "Lug nut M12 x 1.5", specification: "Chrome, conical seat", unit: "pc", reorderPoint: "40" },
];

const seedSuppliers = [
  { supplierName: "Sugbo Tire Trading", contactPerson: "Elena Ramos", contactDetails: "elena@sugbotire.test", address: "Mandaue City, Cebu" },
  { supplierName: "Visayas Wheel Supply", contactPerson: "Victor Chiu", contactDetails: "victor@visayaswheel.test", address: "Cebu City, Cebu" },
  { supplierName: "Mactan Auto Parts", contactPerson: "Irene Dela Cruz", contactDetails: "irene@mactanparts.test", address: "Lapu-Lapu City, Cebu" },
];

async function seedItemAvailabilityExample(tx: Tx, userIds: Map<string, number>) {
  const sampleItemCode = "TIRE-1757013";
  const sampleRequesterId = userIds.get("requester@rcwheels.test");
  const sampleApproverId = userIds.get("approver@rcwheels.test");

  if (!sampleRequesterId || !sampleApproverId) {
    throw new Error("The sample request needs the seeded requester and approver.");
  }

  const [sampleItem] = await tx
    .select({ itemId: schema.items.itemId })
    .from(schema.items)
    .where(eq(schema.items.itemCode, sampleItemCode));

  if (!sampleItem) {
    throw new Error(`Could not find the seed item ${sampleItemCode}.`);
  }

  const [usableBalance] = await tx
    .select({
      stockBalanceId: schema.stockBalances.stockBalanceId,
    })
    .from(schema.stockBalances)
    .where(
      and(
        eq(schema.stockBalances.itemId, sampleItem.itemId),
        eq(schema.stockBalances.condition, "usable"),
      ),
    )
    .for("update");

  if (!usableBalance) {
    throw new Error(`Could not find the seed balance for ${sampleItemCode}.`);
  }

  // Give the sample reservation enough stock on a fresh seed. The movement
  // key makes this opening balance a one-time, auditable seed event.
  const openingBalanceEventKey = `opening_balance:seed:${sampleItemCode}`;
  const [openingBalanceMovement] = await tx
    .insert(schema.stockMovements)
    .values({
      stockBalanceId: usableBalance.stockBalanceId,
      movementType: "opening_balance",
      quantityDelta: "8",
      eventKey: openingBalanceEventKey,
    })
    .onConflictDoNothing()
    .returning({ movementId: schema.stockMovements.movementId });

  if (openingBalanceMovement) {
    await tx
      .update(schema.stockBalances)
      .set({
        quantityOnHand: sql`${schema.stockBalances.quantityOnHand} + 8::numeric`,
        updatedAt: new Date(),
      })
      .where(eq(schema.stockBalances.stockBalanceId, usableBalance.stockBalanceId));
  }

  const samplePurpose = "Seed example for inventory item availability";
  const [existingSampleRequest] = await tx
    .select({ requisitionId: schema.requisitions.requisitionId })
    .from(schema.requisitions)
    .where(
      and(
        eq(schema.requisitions.submittedBy, sampleRequesterId),
        eq(schema.requisitions.purpose, samplePurpose),
      ),
    )
    .limit(1);

  let sampleRequisitionId = existingSampleRequest?.requisitionId;

  if (!sampleRequisitionId) {
    const [sampleRequest] = await tx
      .insert(schema.requisitions)
      .values({
        submittedBy: sampleRequesterId,
        requesterName: "Rosa Villareal",
        purpose: samplePurpose,
        deliveryDate: seedDeliveryDate,
        deliveryLocation: "RCWheels main workshop",
        status: "approved",
      })
      .returning({ requisitionId: schema.requisitions.requisitionId });

    sampleRequisitionId = sampleRequest.requisitionId;
    await tx.insert(schema.requisitionStatusHistory).values({
      requisitionId: sampleRequisitionId,
      changedBy: sampleApproverId,
      fromStatus: null,
      toStatus: "approved",
      reason: "Seeded sample for inventory availability.",
    });
  }

  const [existingSampleLine] = await tx
    .select({ requisitionLineId: schema.requisitionLines.requisitionLineId })
    .from(schema.requisitionLines)
    .where(
      and(
        eq(schema.requisitionLines.requisitionId, sampleRequisitionId),
        eq(schema.requisitionLines.itemId, sampleItem.itemId),
      ),
    )
    .limit(1);

  let sampleRequisitionLineId = existingSampleLine?.requisitionLineId;

  if (!sampleRequisitionLineId) {
    const [sampleLine] = await tx
      .insert(schema.requisitionLines)
      .values({
        requisitionId: sampleRequisitionId,
        itemId: sampleItem.itemId,
        requestedQty: "2",
        approvedQty: "2",
      })
      .returning({ requisitionLineId: schema.requisitionLines.requisitionLineId });

    sampleRequisitionLineId = sampleLine.requisitionLineId;
  }

  const reservationEventKey = `reserve:seed-item-list:${sampleRequisitionLineId}`;
  const [existingSeedReservation] = await tx
    .select({ reservationId: schema.stockReservations.reservationId })
    .from(schema.stockReservations)
    .where(
      and(
        eq(schema.stockReservations.requisitionLineId, sampleRequisitionLineId),
        eq(schema.stockReservations.status, "active"),
      ),
    )
    .limit(1);
  const [existingReservationEvent] = await tx
    .select({ movementId: schema.stockMovements.movementId })
    .from(schema.stockMovements)
    .where(eq(schema.stockMovements.eventKey, reservationEventKey));

  if (!existingSeedReservation && !existingReservationEvent) {
    await tx.insert(schema.stockMovements).values({
      stockBalanceId: usableBalance.stockBalanceId,
      movementType: "reservation",
      quantityDelta: "0",
      eventKey: reservationEventKey,
    });
    await tx.insert(schema.stockReservations).values({
      requisitionLineId: sampleRequisitionLineId,
      stockBalanceId: usableBalance.stockBalanceId,
      reservedQty: "2",
      status: "active",
    });
  }
}

/**
 * Creates the Supabase Auth accounts that are missing and returns each seeded
 * email's auth ID. Returns null when the secret key or password is not set.
 */
async function ensureAuthUsers(): Promise<Map<string, string> | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const password = process.env.SEED_USER_PASSWORD;

  if (!url || !secretKey || !password) {
    return null;
  }

  const supabase = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const authIds = new Map<string, string>();

  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });

    if (error) {
      throw new Error(`Could not list Supabase Auth users: ${error.message}`);
    }

    for (const user of data.users) {
      if (user.email) {
        authIds.set(user.email, user.id);
      }
    }

    if (data.users.length < 200) {
      break;
    }
  }

  for (const { email } of seedUsers) {
    if (authIds.has(email)) {
      continue;
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error || !data.user) {
      throw new Error(`Could not create the auth account for ${email}: ${error?.message}`);
    }

    authIds.set(email, data.user.id);
  }

  const { error: bucketError } = await supabase.storage.createBucket(ATTACHMENT_BUCKET, {
    public: false,
  });

  if (bucketError && !/already exists/i.test(bucketError.message)) {
    throw new Error(`Could not create the storage bucket: ${bucketError.message}`);
  }

  return authIds;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to seed the database.");
  }

  const authIds = await ensureAuthUsers();
  const client = postgres(databaseUrl, { prepare: false, max: 1 });
  const db = drizzle({ client, schema });

  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(schema.roles)
        .values(schema.appRoleEnum.enumValues.map((roleName) => ({ roleName })))
        .onConflictDoNothing();

      const roleRows = await tx.select().from(schema.roles);
      const roleIds = new Map(roleRows.map((role) => [role.roleName, role.roleId]));

      for (const user of seedUsers) {
        const authUserId = authIds?.get(user.email);

        await tx
          .insert(schema.users)
          .values({
            // Without a Supabase account the ID is a placeholder nobody can sign in with.
            authUserId: authUserId ?? crypto.randomUUID(),
            email: user.email,
            fullName: user.fullName,
            roleId: roleIds.get(user.role)!,
          })
          .onConflictDoUpdate({
            target: schema.users.email,
            set: {
              fullName: user.fullName,
              roleId: roleIds.get(user.role)!,
              ...(authUserId ? { authUserId } : {}),
            },
          });
      }

      const userRows = await tx.select().from(schema.users);
      const userIds = new Map(userRows.map((user) => [user.email, user.userId]));

      for (const user of seedUsers) {
        if (user.approverEmail) {
          await tx
            .update(schema.users)
            .set({ approverId: userIds.get(user.approverEmail)! })
            .where(eq(schema.users.email, user.email));
        }
      }

      await tx.insert(schema.items).values(seedItems).onConflictDoNothing();

      // One balance row per item and condition, starting at zero.
      await tx.execute(sql`
        insert into stock_balances (item_id, condition)
        select item_id, condition
        from items cross join unnest(enum_range(null::stock_condition)) as condition
        on conflict do nothing
      `);

      await seedItemAvailabilityExample(tx, userIds);

      const existingSuppliers = await tx
        .select({ supplierName: schema.suppliers.supplierName })
        .from(schema.suppliers);
      const existingNames = new Set(existingSuppliers.map((row) => row.supplierName));
      const newSuppliers = seedSuppliers.filter(
        (supplier) => !existingNames.has(supplier.supplierName),
      );

      if (newSuppliers.length > 0) {
        await tx.insert(schema.suppliers).values(newSuppliers);
      }
    });
  } finally {
    await client.end();
  }

  console.log(
    `Seeded ${schema.appRoleEnum.enumValues.length} roles, ${seedUsers.length} users, ${seedItems.length} items, ${seedSuppliers.length} suppliers.`,
  );
  console.log("Seeded an approved sample request with an active reservation for TIRE-1757013.");
  console.log(
    authIds
      ? "Supabase Auth accounts and the storage bucket are in place. Sign in with a seeded email and SEED_USER_PASSWORD."
      : "Supabase Auth was skipped: set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, and SEED_USER_PASSWORD in .env, then run the seed again so the users can sign in.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
