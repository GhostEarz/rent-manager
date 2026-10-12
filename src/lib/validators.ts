import { z } from "zod";

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
export const str = z.string().trim().min(1, "Required");
export const optStr = z.preprocess(blank, z.string().trim().optional()).transform((v) => v ?? null);
export const int = z.coerce.number().int("Whole rupees only").nonnegative();
export const posInt = z.coerce.number().int("Whole rupees only").positive("Must be greater than zero");
export const optInt = z.preprocess(blank, z.coerce.number().int().nonnegative().optional()).transform((v) => v ?? null);
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
export const month = z.string().regex(/^\d{4}-\d{2}$/, "Pick a month");
export const method = z.enum(["UPI", "CASH", "BANK", "CHEQUE"]);
export const id = z.coerce.number().int().positive();

export const obj = (fd: FormData) => Object.fromEntries(fd.entries());
