/** Standalone handoff: wait for the old process AND listening socket to go away. */
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { writeFileSync } from "node:fs";
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
function listening(port) {
    return new Promise((done) => {
        const socket = connect({ host: "127.0.0.1", port });
        const finish = (value) => { socket.destroy(); done(value); };
        socket.setTimeout(500, () => finish(true));
        socket.once("connect", () => finish(true));
        socket.once("error", () => finish(false));
    });
}
function alive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return error.code !== "ESRCH";
    }
}
const waiting = setTimeout(() => process.exit(1), 10000);
process.once("message", async (launch) => {
    // Only stage codes and process ids, never argv, environment, auth URLs or host output.
    const note = (stage, childPid, exitCode) => {
        try {
            writeFileSync(launch.trace, JSON.stringify({ stage, parentPid: launch.pid, childPid, exitCode, at: new Date().toISOString() }), { mode: 0o600 });
        }
        catch { /* best effort */ }
    };
    clearTimeout(waiting);
    note("waiting-for-exit");
    process.send?.("armed");
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline && (alive(launch.pid) || await listening(launch.port)))
        await sleep(200);
    // Never spawn a duplicate if the old process refused to stop.
    if (alive(launch.pid) || await listening(launch.port)) {
        note("old-host-still-running");
        process.exitCode = 1;
        return;
    }
    await sleep(300);
    const child = spawn(launch.file, launch.args, { cwd: launch.cwd, env: launch.env, detached: true, stdio: "ignore", windowsHide: true });
    note("starting", child.pid);
    child.once("error", () => { note("spawn-failed"); process.exitCode = 1; });
    child.once("exit", (code) => note("replacement-exited", child.pid, code));
    child.unref();
    // Keep the helper alive briefly for detached launch initialization on Windows.
    await sleep(3000);
});
process.send?.("ready");
