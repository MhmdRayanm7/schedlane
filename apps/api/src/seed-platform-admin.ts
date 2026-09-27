import {
  assertPlatformAdminBootstrapAllowed,
  grantPlatformAdmin,
  normalizePlatformAdminEmail,
} from "./development/platform-admin.js";

assertPlatformAdminBootstrapAllowed(process.env.NODE_ENV);
const email = normalizePlatformAdminEmail(
  process.argv.slice(2).find((argument) => argument !== "--"),
);
const { db } = await import("./db.js");

try {
  const result = await db
    .transaction()
    .execute((trx) => grantPlatformAdmin(trx, email));
  console.log(
    `${result.email} (${result.userId}) now has active Platform Admin access.`,
  );
} finally {
  await db.destroy();
}
