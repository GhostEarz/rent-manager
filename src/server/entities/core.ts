import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

// Columns declare explicit types (no emitDecoratorMetadata). Relations use
// string targets so entity modules never import each other at runtime.

export type Role = "ADMIN" | "STAFF";
export type RoomStatus = "VACANT" | "OCCUPIED" | "MAINTENANCE";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn({ type: "int" }) id!: number;
  @Column({ type: "varchar", length: 120 }) name!: string;
  @Column({ type: "varchar", length: 200, unique: true }) email!: string;
  @Column({ type: "varchar", length: 200 }) passwordHash!: string;
  @Column({ type: "varchar", length: 10, default: "STAFF" }) role!: Role;
  @Column({ type: "boolean", default: true }) active!: boolean;
  @CreateDateColumn({ type: "timestamptz" }) createdAt!: Date;
}

@Entity("floors")
export class Floor {
  @PrimaryGeneratedColumn({ type: "int" }) id!: number;
  @Column({ type: "int", unique: true }) number!: number;
  @Column({ type: "varchar", length: 80 }) name!: string;
}

@Entity("rooms")
export class Room {
  @PrimaryGeneratedColumn({ type: "int" }) id!: number;
  @Column({ type: "varchar", length: 20, unique: true }) number!: string;
  @Column({ type: "int" }) floorId!: number;
  @ManyToOne("Floor", { onDelete: "RESTRICT" })
  @JoinColumn({ name: "floorId" })
  floor!: Floor;
  @Column({ type: "int" }) currentRent!: number;
  @Column({ type: "varchar", length: 12, default: "VACANT" }) status!: RoomStatus;
  @Column({ type: "text", nullable: true }) notes!: string | null;
}

@Entity("room_rent_history")
export class RoomRentHistory {
  @PrimaryGeneratedColumn({ type: "int" }) id!: number;
  @Column({ type: "int" }) roomId!: number;
  @ManyToOne("Room", { onDelete: "CASCADE" })
  @JoinColumn({ name: "roomId" })
  room!: Room;
  @Column({ type: "int" }) rent!: number;
  @Column({ type: "date" }) effectiveFrom!: string;
}

@Entity("tenants")
export class Tenant {
  @PrimaryGeneratedColumn({ type: "int" }) id!: number;
  @Column({ type: "varchar", length: 120 }) name!: string;
  @Column({ type: "varchar", length: 30, nullable: true }) phone!: string | null;
  @Column({ type: "varchar", length: 200, nullable: true }) email!: string | null;
  @Column({ type: "varchar", length: 40, nullable: true }) idProofType!: string | null;
  @Column({ type: "varchar", length: 80, nullable: true }) idProofNumber!: string | null;
  @Column({ type: "text", nullable: true }) address!: string | null;
  @Column({ type: "varchar", length: 200, nullable: true }) emergencyContact!: string | null;
  @Column({ type: "varchar", length: 500, nullable: true }) docUrl!: string | null;
  @Column({ type: "text", nullable: true }) notes!: string | null;
  @CreateDateColumn({ type: "timestamptz" }) createdAt!: Date;
}

@Entity("tenancies")
export class Tenancy {
  @PrimaryGeneratedColumn({ type: "int" }) id!: number;
  @Column({ type: "int" }) tenantId!: number;
  @ManyToOne("Tenant", { onDelete: "RESTRICT" })
  @JoinColumn({ name: "tenantId" })
  tenant!: Tenant;
  @Column({ type: "int" }) roomId!: number;
  @ManyToOne("Room", { onDelete: "RESTRICT" })
  @JoinColumn({ name: "roomId" })
  room!: Room;
  @Column({ type: "date" }) startDate!: string;
  @Column({ type: "date", nullable: true }) endDate!: string | null;
  /** Rent locked at check-in. Only used for billing when rentOverride is true. */
  @Column({ type: "int" }) monthlyRent!: number;
  /** false = follow the room's rent history; true = use monthlyRent as-is. */
  @Column({ type: "boolean", default: false }) rentOverride!: boolean;
  @Column({ type: "int", default: 0 }) securityDeposit!: number;
  @Column({ type: "int", default: 0 }) depositReturned!: number;
  @Column({ type: "varchar", length: 10, default: "ACTIVE" }) status!: "ACTIVE" | "ENDED";
}

@Entity("rent_charges")
@Unique(["tenancyId", "month"])
export class RentCharge {
  @PrimaryGeneratedColumn({ type: "int" }) id!: number;
  @Column({ type: "int" }) tenancyId!: number;
  @ManyToOne("Tenancy", { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenancyId" })
  tenancy!: Tenancy;
  @Column({ type: "char", length: 7 }) month!: string;
  @Column({ type: "int" }) amountDue!: number;
  @Column({ type: "date" }) dueDate!: string;
  @Column({ type: "varchar", length: 10, default: "UNPAID" }) status!: "PAID" | "PARTIAL" | "UNPAID";
}

export type PayMethod = "UPI" | "CASH" | "BANK" | "CHEQUE";

@Entity("payments")
export class Payment {
  @PrimaryGeneratedColumn({ type: "int" }) id!: number;
  @Column({ type: "int" }) tenancyId!: number;
  @ManyToOne("Tenancy", { onDelete: "RESTRICT" })
  @JoinColumn({ name: "tenancyId" })
  tenancy!: Tenancy;
  @Column({ type: "int" }) amount!: number;
  @Column({ type: "date" }) paidOn!: string;
  @Column({ type: "varchar", length: 10 }) method!: PayMethod;
  @Column({ type: "varchar", length: 80, nullable: true }) referenceNo!: string | null;
  @Column({ type: "varchar", length: 120, nullable: true }) receivedIntoAccount!: string | null;
  @Column({ type: "text", nullable: true }) note!: string | null;
  @Column({ type: "int", nullable: true }) recordedById!: number | null;
  @CreateDateColumn({ type: "timestamptz" }) createdAt!: Date;
}

/** How much of a payment went to which charge. Unallocated remainder = advance credit. */
@Entity("payment_allocations")
export class PaymentAllocation {
  @PrimaryGeneratedColumn({ type: "int" }) id!: number;
  @Column({ type: "int" }) paymentId!: number;
  @ManyToOne("Payment", { onDelete: "CASCADE" })
  @JoinColumn({ name: "paymentId" })
  payment!: Payment;
  @Column({ type: "int" }) chargeId!: number;
  @ManyToOne("RentCharge", { onDelete: "CASCADE" })
  @JoinColumn({ name: "chargeId" })
  charge!: RentCharge;
  @Column({ type: "int" }) amount!: number;
}

@Entity("expense_categories")
export class ExpenseCategory {
  @PrimaryGeneratedColumn({ type: "int" }) id!: number;
  @Column({ type: "varchar", length: 80, unique: true }) name!: string;
}

@Entity("expenses")
export class Expense {
  @PrimaryGeneratedColumn({ type: "int" }) id!: number;
  @Column({ type: "int" }) categoryId!: number;
  @ManyToOne("ExpenseCategory", { onDelete: "RESTRICT" })
  @JoinColumn({ name: "categoryId" })
  category!: ExpenseCategory;
  @Column({ type: "int" }) amount!: number;
  @Column({ type: "date" }) date!: string;
  @Column({ type: "char", length: 7 }) billMonth!: string;
  @Column({ type: "varchar", length: 120, nullable: true }) vendor!: string | null;
  @Column({ type: "varchar", length: 80, nullable: true }) billNo!: string | null;
  @Column({ type: "varchar", length: 10, nullable: true }) paymentMethod!: PayMethod | null;
  @Column({ type: "int", nullable: true }) roomId!: number | null;
  @ManyToOne("Room", { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "roomId" })
  room!: Room | null;
  @Column({ type: "varchar", length: 500, nullable: true }) attachmentUrl!: string | null;
  @Column({ type: "text", nullable: true }) note!: string | null;
}

@Entity("audit_logs")
export class AuditLog {
  @PrimaryGeneratedColumn({ type: "int" }) id!: number;
  @Column({ type: "int", nullable: true }) userId!: number | null;
  @Column({ type: "varchar", length: 120, nullable: true }) userName!: string | null;
  @Column({ type: "varchar", length: 40 }) action!: string;
  @Column({ type: "varchar", length: 40 }) entity!: string;
  @Column({ type: "varchar", length: 40, nullable: true }) entityId!: string | null;
  @Column({ type: "jsonb", nullable: true }) before!: unknown;
  @Column({ type: "jsonb", nullable: true }) after!: unknown;
  @CreateDateColumn({ type: "timestamptz" }) createdAt!: Date;
}

@Entity("settings")
export class Setting {
  @PrimaryColumn({ type: "varchar", length: 60 }) key!: string;
  @Column({ type: "text" }) value!: string;
}

export const ALL_ENTITIES = [
  User, Floor, Room, RoomRentHistory, Tenant, Tenancy, RentCharge,
  Payment, PaymentAllocation, ExpenseCategory, Expense, AuditLog, Setting,
];
