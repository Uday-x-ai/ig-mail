const db = require("../data/db");

function increment(command) {
  db.prepare(
    `INSERT INTO command_usage (command, total_count)
     VALUES (?, 1)
     ON CONFLICT(command)
     DO UPDATE SET total_count = total_count + 1, last_used_at = CURRENT_TIMESTAMP`
  ).run(command);
}

function getTop(limit = 20) {
  return db
    .prepare("SELECT command, total_count, last_used_at FROM command_usage ORDER BY total_count DESC LIMIT ?")
    .all(limit);
}

module.exports = {
  increment,
  getTop,
};
