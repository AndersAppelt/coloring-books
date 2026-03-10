const { buildSite } = require("./build-site");

buildSite().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
