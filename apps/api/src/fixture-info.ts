import { db } from "./db.js";
import {
  formatFixtureInfoOutput,
  getFixtureInfo,
} from "./development/fixture-info.js";
import { assertSafeDevelopmentEnvironment } from "./development/safety.js";

assertSafeDevelopmentEnvironment();

try {
  const info = await getFixtureInfo();
  console.log(formatFixtureInfoOutput(info));
} finally {
  await db.destroy();
}
