// Force console email provider during fixture seeding to prevent external API calls
process.env.EMAIL_PROVIDER = "console";

import { db } from "./db.js";
import {
  formatFixtureInfoOutput,
  getFixtureInfo,
} from "./development/fixture-info.js";
import { assertSafeDevelopmentEnvironment } from "./development/safety.js";
import { seedDevelopmentFixtures } from "./development/seed-fixtures.js";

assertSafeDevelopmentEnvironment();

try {
  await seedDevelopmentFixtures();
  const info = await getFixtureInfo();
  console.log(formatFixtureInfoOutput(info));
} finally {
  await db.destroy();
}
