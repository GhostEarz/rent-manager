import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1791783135461 implements MigrationInterface {
    name = 'Init1791783135461'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "users" (
                "id" SERIAL NOT NULL,
                "name" character varying(120) NOT NULL,
                "email" character varying(200) NOT NULL,
                "passwordHash" character varying(200) NOT NULL,
                "role" character varying(10) NOT NULL DEFAULT 'STAFF',
                "active" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"),
                CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "floors" (
                "id" SERIAL NOT NULL,
                "number" integer NOT NULL,
                "name" character varying(80) NOT NULL,
                CONSTRAINT "UQ_6731ed87cee194edce992bfc12a" UNIQUE ("number"),
                CONSTRAINT "PK_dae78234002afa84842d3a08ee0" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "rooms" (
                "id" SERIAL NOT NULL,
                "number" character varying(20) NOT NULL,
                "floorId" integer NOT NULL,
                "currentRent" integer NOT NULL,
                "status" character varying(12) NOT NULL DEFAULT 'VACANT',
                "notes" text,
                CONSTRAINT "UQ_82a975f8999493b4cf1fbd9f880" UNIQUE ("number"),
                CONSTRAINT "PK_0368a2d7c215f2d0458a54933f2" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "room_rent_history" (
                "id" SERIAL NOT NULL,
                "roomId" integer NOT NULL,
                "rent" integer NOT NULL,
                "effectiveFrom" date NOT NULL,
                CONSTRAINT "PK_a44d3d953d30dd8ff49380bc7a8" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "tenants" (
                "id" SERIAL NOT NULL,
                "name" character varying(120) NOT NULL,
                "phone" character varying(30),
                "email" character varying(200),
                "idProofType" character varying(40),
                "idProofNumber" character varying(80),
                "address" text,
                "emergencyContact" character varying(200),
                "docUrl" character varying(500),
                "notes" text,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_53be67a04681c66b87ee27c9321" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "tenancies" (
                "id" SERIAL NOT NULL,
                "tenantId" integer NOT NULL,
                "roomId" integer NOT NULL,
                "startDate" date NOT NULL,
                "endDate" date,
                "monthlyRent" integer NOT NULL,
                "rentOverride" boolean NOT NULL DEFAULT false,
                "securityDeposit" integer NOT NULL DEFAULT '0',
                "depositReturned" integer NOT NULL DEFAULT '0',
                "status" character varying(10) NOT NULL DEFAULT 'ACTIVE',
                CONSTRAINT "PK_1bc09e717213c5806a4d855c38a" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "rent_charges" (
                "id" SERIAL NOT NULL,
                "tenancyId" integer NOT NULL,
                "month" character(7) NOT NULL,
                "amountDue" integer NOT NULL,
                "dueDate" date NOT NULL,
                "status" character varying(10) NOT NULL DEFAULT 'UNPAID',
                CONSTRAINT "UQ_7a2593c744b94637e2b6329c673" UNIQUE ("tenancyId", "month"),
                CONSTRAINT "PK_f21ca51a3830b537a1ab1ee4f9f" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "payments" (
                "id" SERIAL NOT NULL,
                "tenancyId" integer NOT NULL,
                "amount" integer NOT NULL,
                "paidOn" date NOT NULL,
                "method" character varying(10) NOT NULL,
                "referenceNo" character varying(80),
                "receivedIntoAccount" character varying(120),
                "note" text,
                "recordedById" integer,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "payment_allocations" (
                "id" SERIAL NOT NULL,
                "paymentId" integer NOT NULL,
                "chargeId" integer NOT NULL,
                "amount" integer NOT NULL,
                CONSTRAINT "PK_a5c6ff22065ac772620c85f4efb" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "expense_categories" (
                "id" SERIAL NOT NULL,
                "name" character varying(80) NOT NULL,
                CONSTRAINT "UQ_6bdb3db95dd955d3c701e935426" UNIQUE ("name"),
                CONSTRAINT "PK_d0ef31e189d9523461215b62775" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "expenses" (
                "id" SERIAL NOT NULL,
                "categoryId" integer NOT NULL,
                "amount" integer NOT NULL,
                "date" date NOT NULL,
                "billMonth" character(7) NOT NULL,
                "vendor" character varying(120),
                "billNo" character varying(80),
                "paymentMethod" character varying(10),
                "roomId" integer,
                "attachmentUrl" character varying(500),
                "note" text,
                CONSTRAINT "PK_94c3ceb17e3140abc9282c20610" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "audit_logs" (
                "id" SERIAL NOT NULL,
                "userId" integer,
                "userName" character varying(120),
                "action" character varying(40) NOT NULL,
                "entity" character varying(40) NOT NULL,
                "entityId" character varying(40),
                "before" jsonb,
                "after" jsonb,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "settings" (
                "key" character varying(60) NOT NULL,
                "value" text NOT NULL,
                CONSTRAINT "PK_c8639b7626fa94ba8265628f214" PRIMARY KEY ("key")
            )
        `);
        await queryRunner.query(`
            ALTER TABLE "rooms"
            ADD CONSTRAINT "FK_4d1c2078e85df4b86a6e80348e5" FOREIGN KEY ("floorId") REFERENCES "floors"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "room_rent_history"
            ADD CONSTRAINT "FK_7c577430da2dc5679422c8dcdea" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "tenancies"
            ADD CONSTRAINT "FK_763c36d7be9e0a8f2321c5c8398" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "tenancies"
            ADD CONSTRAINT "FK_30521b8270815d11e9bd39d5875" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "rent_charges"
            ADD CONSTRAINT "FK_675c449b9c4f6f903d6276d1f54" FOREIGN KEY ("tenancyId") REFERENCES "tenancies"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "payments"
            ADD CONSTRAINT "FK_c0235ee4fb98009750cbe1829d7" FOREIGN KEY ("tenancyId") REFERENCES "tenancies"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "payment_allocations"
            ADD CONSTRAINT "FK_68129272bde8768a20d6967a62c" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "payment_allocations"
            ADD CONSTRAINT "FK_52bb6adc68d0910ad0034b8e2ab" FOREIGN KEY ("chargeId") REFERENCES "rent_charges"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "expenses"
            ADD CONSTRAINT "FK_ac0801a1760c5f9ce43c03bacd0" FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "expenses"
            ADD CONSTRAINT "FK_3c4c1fe7581cd54429441e4cb2b" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "expenses" DROP CONSTRAINT "FK_3c4c1fe7581cd54429441e4cb2b"
        `);
        await queryRunner.query(`
            ALTER TABLE "expenses" DROP CONSTRAINT "FK_ac0801a1760c5f9ce43c03bacd0"
        `);
        await queryRunner.query(`
            ALTER TABLE "payment_allocations" DROP CONSTRAINT "FK_52bb6adc68d0910ad0034b8e2ab"
        `);
        await queryRunner.query(`
            ALTER TABLE "payment_allocations" DROP CONSTRAINT "FK_68129272bde8768a20d6967a62c"
        `);
        await queryRunner.query(`
            ALTER TABLE "payments" DROP CONSTRAINT "FK_c0235ee4fb98009750cbe1829d7"
        `);
        await queryRunner.query(`
            ALTER TABLE "rent_charges" DROP CONSTRAINT "FK_675c449b9c4f6f903d6276d1f54"
        `);
        await queryRunner.query(`
            ALTER TABLE "tenancies" DROP CONSTRAINT "FK_30521b8270815d11e9bd39d5875"
        `);
        await queryRunner.query(`
            ALTER TABLE "tenancies" DROP CONSTRAINT "FK_763c36d7be9e0a8f2321c5c8398"
        `);
        await queryRunner.query(`
            ALTER TABLE "room_rent_history" DROP CONSTRAINT "FK_7c577430da2dc5679422c8dcdea"
        `);
        await queryRunner.query(`
            ALTER TABLE "rooms" DROP CONSTRAINT "FK_4d1c2078e85df4b86a6e80348e5"
        `);
        await queryRunner.query(`
            DROP TABLE "settings"
        `);
        await queryRunner.query(`
            DROP TABLE "audit_logs"
        `);
        await queryRunner.query(`
            DROP TABLE "expenses"
        `);
        await queryRunner.query(`
            DROP TABLE "expense_categories"
        `);
        await queryRunner.query(`
            DROP TABLE "payment_allocations"
        `);
        await queryRunner.query(`
            DROP TABLE "payments"
        `);
        await queryRunner.query(`
            DROP TABLE "rent_charges"
        `);
        await queryRunner.query(`
            DROP TABLE "tenancies"
        `);
        await queryRunner.query(`
            DROP TABLE "tenants"
        `);
        await queryRunner.query(`
            DROP TABLE "room_rent_history"
        `);
        await queryRunner.query(`
            DROP TABLE "rooms"
        `);
        await queryRunner.query(`
            DROP TABLE "floors"
        `);
        await queryRunner.query(`
            DROP TABLE "users"
        `);
    }

}
