import { spawn } from "node:child_process";

const command = process.argv.slice(2).join(" ").trim();

if (!command) {
  console.error("Usage: npm run arena:relay -- <command>");
  process.exit(1);
}

const notifyArena = async (body) => {
  try {
    await fetch("http://localhost:3000/api/terminal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    console.warn(`Arena relay warning: ${error.message}`);
  }
};

const forwardStream = (stream, writer) => {
  let remainder = "";

  stream.on("data", (chunk) => {
    const text = chunk.toString();
    writer.write(text);

    const lines = `${remainder}${text}`.split(/\r?\n/);
    remainder = lines.pop() ?? "";
    if (lines.length > 0) {
      notifyArena({ lines, cwd: process.cwd() }).catch(() => {});
    }
  });

  stream.on("end", () => {
    if (remainder) {
      notifyArena({ line: remainder, cwd: process.cwd() }).catch(() => {});
    }
  });
};

await notifyArena({
  command,
  cwd: process.cwd()
});

const child = spawn(command, {
  shell: true,
  stdio: ["inherit", "pipe", "pipe"]
});

forwardStream(child.stdout, process.stdout);
forwardStream(child.stderr, process.stderr);

child.on("exit", (code) => {
  process.exitCode = code ?? 0;
});

child.on("close", (code) => {
  process.exitCode = code ?? 0;
});

child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
