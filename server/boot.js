'use strict';
// Entry point. In Docker the container starts as root; we make sure the data folder
// belongs to PUID:PGID (Unraid default 99:100 = nobody:users) and then drop to that user.
const fs = require('fs');
const path = require('path');

if (typeof process.getuid === 'function' && process.getuid() === 0) {
  const uid = Number(process.env.PUID ?? 99);
  const gid = Number(process.env.PGID ?? 100);
  if (uid !== 0) {
    const dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data-local');
    fs.mkdirSync(dir, { recursive: true });
    const chownR = (p) => {
      fs.chownSync(p, uid, gid);
      if (fs.statSync(p).isDirectory()) for (const f of fs.readdirSync(p)) chownR(path.join(p, f));
    };
    chownR(dir);
    process.setgid(gid);
    process.setuid(uid);
  }
}

require('./index.js').start();
