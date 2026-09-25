import {
  assertDemoOwnerBootstrapAllowed,
  linkDemoOrganizationOwner,
  normalizeDemoOwnerEmail,
} from "./development/link-demo-owner.js";

assertDemoOwnerBootstrapAllowed(process.env.NODE_ENV);
const email = normalizeDemoOwnerEmail(
  process.argv.slice(2).find((argument) => argument !== "--"),
);
const { db } = await import("./db.js");

try {
  const result = await db
    .transaction()
    .execute((trx) => linkDemoOrganizationOwner(trx, email));

  console.log(
    `${result.email} is now Owner of ${result.organization.name} (${result.organization.slug}).`,
  );
} finally {
  await db.destroy();
}
