const startupDetails = {
  port: "Another service is using the local API port. Close the other Sleeper window or service, then retry.",
  configuration: "The local API port setting is invalid. Correct the PORT environment setting, then restart the app.",
};

class StartupError extends Error {
  constructor(code) {
    super("Sleeper Draft Assistant could not start.");
    this.code = code;
  }
}

async function startWithRecovery({ start, cleanup, showMessageBox, quit }) {
  for (;;) {
    try {
      await start();
      return;
    } catch (error) {
      await cleanup();
      const { response } = await showMessageBox({
        type: "error",
        title: "Sleeper Draft Assistant",
        message: "The app could not start.",
        detail: startupDetails[error instanceof StartupError ? error.code : ""]
          ?? "The local service or app window could not load. Retry, or close the app and restart it. If the problem continues, check the installation and local data backup.",
        buttons: ["Retry", "Exit"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (response !== 0) {
        quit();
        return;
      }
    }
  }
}

function stopChild(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timeout);
      child.removeListener("exit", finish);
      resolve();
    };
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish();
    }, 2000);
    child.once("exit", finish);
    child.kill();
  });
}

module.exports = { StartupError, startWithRecovery, stopChild };
