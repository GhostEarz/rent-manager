import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Multi-tenancy: every owner gets an organization; locations/houses/users/tenants/categories/settings
 * belong to one. Managers are limited to the houses listed in user_houses. Expenses become per-house.
 * Existing single-property data is moved into one default organization.
 */
export class MultiTenantOrgs1792900000000 implements MigrationInterface {
    name = "MultiTenantOrgs1792900000000";

    public async up(q: QueryRunner): Promise<void> {
        await q.query(`CREATE TABLE "organizations" (
            "id" SERIAL NOT NULL,
            "name" character varying(120) NOT NULL,
            "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            CONSTRAINT "PK_organizations_id" PRIMARY KEY ("id"))`);
        await q.query(`INSERT INTO "organizations" ("name")
            SELECT COALESCE((SELECT value FROM settings WHERE key = 'propertyName'), 'My Rentals')`);
        const [{ id: orgId }] = await q.query(`SELECT id FROM organizations ORDER BY id LIMIT 1`);

        // users
        await q.query(`ALTER TABLE "users" ADD "orgId" integer`);
        await q.query(`UPDATE "users" SET "orgId" = $1`, [orgId]);
        await q.query(`ALTER TABLE "users" ALTER COLUMN "orgId" SET NOT NULL`);
        await q.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_users_orgId" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE RESTRICT`);
        await q.query(`UPDATE "users" SET "role" = CASE "role" WHEN 'ADMIN' THEN 'OWNER' ELSE 'MANAGER' END`);
        await q.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'MANAGER'`);

        // locations, houses
        await q.query(`ALTER TABLE "locations" ADD "orgId" integer`);
        await q.query(`UPDATE "locations" SET "orgId" = $1`, [orgId]);
        await q.query(`ALTER TABLE "locations" ALTER COLUMN "orgId" SET NOT NULL`);
        await q.query(`ALTER TABLE "locations" ADD CONSTRAINT "FK_locations_orgId" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE RESTRICT`);
        await q.query(`ALTER TABLE "houses" ADD "orgId" integer`);
        await q.query(`UPDATE "houses" h SET "orgId" = l."orgId" FROM locations l WHERE l.id = h."locationId"`);
        await q.query(`ALTER TABLE "houses" ALTER COLUMN "orgId" SET NOT NULL`);
        await q.query(`ALTER TABLE "houses" ADD CONSTRAINT "FK_houses_orgId" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE RESTRICT`);

        // manager → house assignments
        await q.query(`CREATE TABLE "user_houses" (
            "userId" integer NOT NULL,
            "houseId" integer NOT NULL,
            CONSTRAINT "PK_user_houses" PRIMARY KEY ("userId", "houseId"),
            CONSTRAINT "FK_user_houses_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
            CONSTRAINT "FK_user_houses_houseId" FOREIGN KEY ("houseId") REFERENCES "houses"("id") ON DELETE CASCADE)`);

        // tenants: belong to an org and (for manager scoping) a house
        await q.query(`ALTER TABLE "tenants" ADD "orgId" integer`);
        await q.query(`ALTER TABLE "tenants" ADD "houseId" integer`);
        await q.query(`UPDATE "tenants" SET "orgId" = $1`, [orgId]);
        await q.query(`UPDATE "tenants" t SET "houseId" = x."houseId" FROM (
            SELECT DISTINCT ON (y."tenantId") y."tenantId", r."houseId"
              FROM tenancies y JOIN rooms r ON r.id = y."roomId"
             ORDER BY y."tenantId", (y.status = 'ACTIVE') DESC, y."startDate" DESC) x
            WHERE x."tenantId" = t.id`);
        await q.query(`UPDATE "tenants" SET "houseId" = (SELECT id FROM houses ORDER BY id LIMIT 1) WHERE "houseId" IS NULL`);
        await q.query(`ALTER TABLE "tenants" ALTER COLUMN "orgId" SET NOT NULL`);
        await q.query(`ALTER TABLE "tenants" ALTER COLUMN "houseId" SET NOT NULL`);
        await q.query(`ALTER TABLE "tenants" ADD CONSTRAINT "FK_tenants_orgId" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE RESTRICT`);
        await q.query(`ALTER TABLE "tenants" ADD CONSTRAINT "FK_tenants_houseId" FOREIGN KEY ("houseId") REFERENCES "houses"("id") ON DELETE RESTRICT`);

        // expense categories: per org
        await q.query(`ALTER TABLE "expense_categories" ADD "orgId" integer`);
        await q.query(`UPDATE "expense_categories" SET "orgId" = $1`, [orgId]);
        await q.query(`ALTER TABLE "expense_categories" ALTER COLUMN "orgId" SET NOT NULL`);
        await q.query(`ALTER TABLE "expense_categories" DROP CONSTRAINT "UQ_6bdb3db95dd955d3c701e935426"`);
        await q.query(`ALTER TABLE "expense_categories" ADD CONSTRAINT "UQ_expense_categories_org_name" UNIQUE ("orgId", "name")`);
        await q.query(`ALTER TABLE "expense_categories" ADD CONSTRAINT "FK_expense_categories_orgId" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE RESTRICT`);

        // expenses: always against one building
        await q.query(`ALTER TABLE "expenses" ADD "houseId" integer`);
        await q.query(`UPDATE "expenses" e SET "houseId" = r."houseId" FROM rooms r WHERE r.id = e."roomId"`);
        await q.query(`UPDATE "expenses" SET "houseId" = (SELECT id FROM houses ORDER BY id LIMIT 1) WHERE "houseId" IS NULL`);
        await q.query(`ALTER TABLE "expenses" ALTER COLUMN "houseId" SET NOT NULL`);
        await q.query(`ALTER TABLE "expenses" ADD CONSTRAINT "FK_expenses_houseId" FOREIGN KEY ("houseId") REFERENCES "houses"("id") ON DELETE RESTRICT`);
        await q.query(`CREATE INDEX "IDX_expenses_house_month" ON "expenses" ("houseId", "billMonth")`);

        // audit log + settings: per org
        await q.query(`ALTER TABLE "audit_logs" ADD "orgId" integer`);
        await q.query(`UPDATE "audit_logs" SET "orgId" = $1`, [orgId]);
        await q.query(`ALTER TABLE "settings" ADD "orgId" integer`);
        await q.query(`UPDATE "settings" SET "orgId" = $1`, [orgId]);
        await q.query(`ALTER TABLE "settings" ALTER COLUMN "orgId" SET NOT NULL`);
        await q.query(`ALTER TABLE "settings" DROP CONSTRAINT "PK_c8639b7626fa94ba8265628f214"`);
        await q.query(`ALTER TABLE "settings" ADD CONSTRAINT "PK_settings" PRIMARY KEY ("orgId", "key")`);
    }

    public async down(q: QueryRunner): Promise<void> {
        await q.query(`ALTER TABLE "settings" DROP CONSTRAINT "PK_settings"`);
        await q.query(`DELETE FROM "settings" s USING (SELECT MIN("orgId") AS o FROM settings) m WHERE s."orgId" <> m.o`);
        await q.query(`ALTER TABLE "settings" DROP COLUMN "orgId"`);
        await q.query(`ALTER TABLE "settings" ADD CONSTRAINT "PK_c8639b7626fa94ba8265628f214" PRIMARY KEY ("key")`);
        await q.query(`ALTER TABLE "audit_logs" DROP COLUMN "orgId"`);
        await q.query(`DROP INDEX "IDX_expenses_house_month"`);
        await q.query(`ALTER TABLE "expenses" DROP COLUMN "houseId"`);
        await q.query(`ALTER TABLE "expense_categories" DROP CONSTRAINT "UQ_expense_categories_org_name"`);
        await q.query(`ALTER TABLE "expense_categories" DROP COLUMN "orgId"`);
        await q.query(`ALTER TABLE "expense_categories" ADD CONSTRAINT "UQ_6bdb3db95dd955d3c701e935426" UNIQUE ("name")`);
        await q.query(`ALTER TABLE "tenants" DROP COLUMN "houseId"`);
        await q.query(`ALTER TABLE "tenants" DROP COLUMN "orgId"`);
        await q.query(`DROP TABLE "user_houses"`);
        await q.query(`ALTER TABLE "houses" DROP COLUMN "orgId"`);
        await q.query(`ALTER TABLE "locations" DROP COLUMN "orgId"`);
        await q.query(`UPDATE "users" SET "role" = CASE "role" WHEN 'OWNER' THEN 'ADMIN' ELSE 'STAFF' END`);
        await q.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'STAFF'`);
        await q.query(`ALTER TABLE "users" DROP COLUMN "orgId"`);
        await q.query(`DROP TABLE "organizations"`);
    }
}
