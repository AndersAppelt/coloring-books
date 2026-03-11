const { buildDistSvg } = require("./build-site");

buildDistSvg().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
