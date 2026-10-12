import "reflect-metadata";
import { types } from "pg";
import { DataSource, type DataSourceOptions } from "typeorm";
import { ALL_ENTITIES } from "../entities/core";

// Keep `date` columns as "YYYY-MM-DD" strings in raw queries (no timezone shifts).
types.setTypeParser(1082, (v: string) => v);

export function dataSourceOptions(): DataSourceOptions {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return {
    type: "postgres",
    url,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
    entities: ALL_ENTITIES,
    synchronize: false,
    migrationsRun: false,
    extra: { max: 3 },
  };
}

const g = globalThis as unknown as { __rmDb?: Promise<DataSource> };

/** Single DataSource cached on globalThis (survives hot reload / warm serverless invocations). */
export function getDb(): Promise<DataSource> {
  if (!g.__rmDb) {
    g.__rmDb = new DataSource(dataSourceOptions()).initialize().catch((e) => {
      g.__rmDb = undefined;
      throw e;
    });
  }
  return g.__rmDb;
}
