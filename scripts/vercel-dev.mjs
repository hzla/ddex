import { spawn } from "node:child_process";
import { constants as osConstants } from "node:os";

const child = spawn("vercel", ["dev", ...process.argv.slice(2)], {
  env: {
    ...process.env,
    NO_UPDATE_NOTIFIER: process.env.NO_UPDATE_NOTIFIER || "1",
  },
  shell: process.platform === "win32",
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(128 + (osConstants.signals[signal] || 1));
  }
  process.exit(code ?? 1);
});
