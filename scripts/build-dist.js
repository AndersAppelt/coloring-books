const { buildDist } = require("./build-site");

buildDist().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
