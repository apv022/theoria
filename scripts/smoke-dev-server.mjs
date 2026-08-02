import { spawn } from "node:child_process";
import { get } from "node:http";

const url = "http://127.0.0.1:3000/";
const timeoutMs = 120_000;
const child = spawn("corepack", ["pnpm", "dev"], {
  cwd: process.cwd(),
  detached: true,
  stdio: "inherit",
});

let exited = false;
const childExit = new Promise((resolve) => {
  child.once("exit", (code, signal) => {
    resolve({ code, signal });
  });
});
child.once("exit", () => {
  exited = true;
});

const stop = async () => {
  if (child.exitCode !== null || child.signalCode) return;
  try {
    process.kill(-child.pid, "SIGINT");
  } catch {
    child.kill("SIGINT");
  }
  await Promise.race([
    childExit,
    new Promise((resolve) => setTimeout(resolve, 10_000)),
  ]);
  if (child.exitCode === null && !child.signalCode) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
};

const request = () =>
  new Promise((resolve, reject) => {
    const pending = get(url, (response) => {
      response.resume();
      if (response.statusCode && response.statusCode < 500) {
        resolve();
      } else {
        reject(new Error(`GET / returned ${response.statusCode}`));
      }
    });
    pending.once("error", reject);
    pending.setTimeout(2_000, () =>
      pending.destroy(new Error("request timed out")),
    );
  });

try {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (exited) throw new Error("root pnpm dev exited before becoming ready");
    try {
      await request();
      console.log("Root dev server responded successfully.");
      break;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  if (Date.now() >= deadline)
    throw new Error(
      `root pnpm dev did not become ready: ${lastError?.message}`,
    );
} finally {
  stop();
}
