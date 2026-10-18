import { MigrationInterface, QueryRunner } from "typeorm";

export class MultiPropertyAndStays1792302810391 implements MigrationInterface {
    name = 'MultiPropertyAndStays1792302810391'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "locations" (
                "id" SERIAL NOT NULL,
                "name" character varying(120) NOT NULL,
                "notes" text,
                CONSTRAINT "PK_locations_id" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "houses" (
                "id" SERIAL NOT NULL,
                "locationId" integer NOT NULL,
                "name" character varying(120) NOT NULL,
                "address" text,
                "active" boolean NOT NULL DEFAULT true,
                CONSTRAINT "PK_houses_id" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "stays" (
                "id" SERIAL NOT NULL,
                "roomId" integer NOT NULL,
                "guestName" character varying(120) NOT NULL,
                "phone" character varying(30),
                "checkIn" date NOT NULL,
                "checkOut" date,
                "dailyRate" integer NOT NULL,
                "status" character varying(10) NOT NULL DEFAULT 'ACTIVE',
                "notes" text,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_stays_id" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "stay_payments" (
                "id" SERIAL NOT NULL,
                "stayId" integer NOT NULL,
                "amount" integer NOT NULL,
                "paidOn" date NOT NULL,
                "method" character varying(10) NOT NULL,
                "referenceNo" character varying(80),
                "note" text,
                "recordedById" integer,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_stay_payments_id" PRIMARY KEY ("id")
            )
        `);

        // --- seed one Location + one House from existing settings, and point existing floors at it ---
        await queryRunner.query(`
            INSERT INTO "locations" ("name") VALUES (COALESCE((SELECT value FROM settings WHERE key = 'propertyName'), 'My Building'))
        `);
        await queryRunner.query(`
            INSERT INTO "houses" ("locationId", "name", "address")
            SELECT l.id, COALESCE((SELECT value FROM settings WHERE key = 'propertyName'), 'My Building'),
                   (SELECT value FROM settings WHERE key = 'propertyAddress')
              FROM locations l ORDER BY l.id LIMIT 1
        `);
        const [{ id: defaultHouseId }] = await queryRunner.query(`SELECT id FROM houses ORDER BY id LIMIT 1`);

        // --- floors: add houseId, backfill, drop old global-unique, add per-house unique ---
        await queryRunner.query(`ALTER TABLE "floors" ADD "houseId" integer`);
        await queryRunner.query(`UPDATE "floors" SET "houseId" = $1`, [defaultHouseId]);
        await queryRunner.query(`ALTER TABLE "floors" ALTER COLUMN "houseId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "floors" DROP CONSTRAINT "UQ_6731ed87cee194edce992bfc12a"`);
        await queryRunner.query(`ALTER TABLE "floors" ADD CONSTRAINT "UQ_floors_houseId_number" UNIQUE ("houseId", "number")`);
        await queryRunner.query(`
            ALTER TABLE "floors" ADD CONSTRAINT "FK_floors_houseId" FOREIGN KEY ("houseId") REFERENCES "houses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);

        // --- rooms: add houseId (denormalized from floor) + rentalType, backfill, drop old global-unique ---
        await queryRunner.query(`ALTER TABLE "rooms" ADD "houseId" integer`);
        await queryRunner.query(`UPDATE "rooms" r SET "houseId" = f."houseId" FROM floors f WHERE f.id = r."floorId"`);
        await queryRunner.query(`ALTER TABLE "rooms" ALTER COLUMN "houseId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "rooms" ADD "rentalType" character varying(10) NOT NULL DEFAULT 'MONTHLY'`);
        await queryRunner.query(`ALTER TABLE "rooms" DROP CONSTRAINT "UQ_82a975f8999493b4cf1fbd9f880"`);
        await queryRunner.query(`ALTER TABLE "rooms" ADD CONSTRAINT "UQ_rooms_houseId_number" UNIQUE ("houseId", "number")`);
        await queryRunner.query(`
            ALTER TABLE "rooms" ADD CONSTRAINT "FK_rooms_houseId" FOREIGN KEY ("houseId") REFERENCES "houses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);

        // --- room_rent_history: add rentalType, backfill MONTHLY on all existing rows ---
        await queryRunner.query(`ALTER TABLE "room_rent_history" ADD "rentalType" character varying(10) NOT NULL DEFAULT 'MONTHLY'`);

        // --- stays / stay_payments FKs ---
        await queryRunner.query(`
            ALTER TABLE "houses" ADD CONSTRAINT "FK_houses_locationId" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "stays" ADD CONSTRAINT "FK_stays_roomId" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "stay_payments" ADD CONSTRAINT "FK_stay_payments_stayId" FOREIGN KEY ("stayId") REFERENCES "stays"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "stay_payments" DROP CONSTRAINT "FK_stay_payments_stayId"`);
        await queryRunner.query(`ALTER TABLE "stays" DROP CONSTRAINT "FK_stays_roomId"`);
        await queryRunner.query(`ALTER TABLE "houses" DROP CONSTRAINT "FK_houses_locationId"`);

        await queryRunner.query(`ALTER TABLE "room_rent_history" DROP COLUMN "rentalType"`);

        await queryRunner.query(`ALTER TABLE "rooms" DROP CONSTRAINT "FK_rooms_houseId"`);
        await queryRunner.query(`ALTER TABLE "rooms" DROP CONSTRAINT "UQ_rooms_houseId_number"`);
        await queryRunner.query(`ALTER TABLE "rooms" ADD CONSTRAINT "UQ_82a975f8999493b4cf1fbd9f880" UNIQUE ("number")`);
        await queryRunner.query(`ALTER TABLE "rooms" DROP COLUMN "rentalType"`);
        await queryRunner.query(`ALTER TABLE "rooms" DROP COLUMN "houseId"`);

        await queryRunner.query(`ALTER TABLE "floors" DROP CONSTRAINT "FK_floors_houseId"`);
        await queryRunner.query(`ALTER TABLE "floors" DROP CONSTRAINT "UQ_floors_houseId_number"`);
        await queryRunner.query(`ALTER TABLE "floors" ADD CONSTRAINT "UQ_6731ed87cee194edce992bfc12a" UNIQUE ("number")`);
        await queryRunner.query(`ALTER TABLE "floors" DROP COLUMN "houseId"`);

        await queryRunner.query(`DROP TABLE "stay_payments"`);
        await queryRunner.query(`DROP TABLE "stays"`);
        await queryRunner.query(`DROP TABLE "houses"`);
        await queryRunner.query(`DROP TABLE "locations"`);
    }

}
