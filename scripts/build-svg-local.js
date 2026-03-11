const { buildSvgLocal } = require("./build-site");

buildSvgLocal().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
