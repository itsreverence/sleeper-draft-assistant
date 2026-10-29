// Resolve from the workspace package so both npm workspace and root CLI builds work.
module.exports = async (context) => {
  const { default: checkPackagedNotices } = await import("../../scripts/third-party-notices.mjs");
  checkPackagedNotices(context);
};
