// Entry point for the TypeORM CLI (migration:generate / run / revert).
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import { DataSource } from "typeorm";
import { dataSourceOptions } from "./data-source";

export default new DataSource({
  ...dataSourceOptions(),
  migrations: ["src/server/migrations/*.ts"],
} as ConstructorParameters<typeof DataSource>[0]);
