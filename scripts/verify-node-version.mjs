const major = Number.parseInt(process.versions.node.split(".")[0], 10);

if (major !== 24) {
  throw new Error(`GENERAL SCREENER requires Node.js 24.x; current runtime is ${process.versions.node}.`);
}

process.stdout.write(`Node.js ${process.versions.node} matches the required 24.x runtime.\n`);
