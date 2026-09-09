const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('Client :: ready');
  conn.exec(`cd /home/ubuntu/teman/life-scheduler && cp scheduler.db /tmp/scheduler.db && git add . && git stash && git pull origin main && cp /tmp/scheduler.db scheduler.db && node -e "const Database = require('better-sqlite3'); const db = new Database('scheduler.db'); try { db.exec('ALTER TABLE users ADD COLUMN categories TEXT DEFAULT null;'); console.log('Added categories'); } catch(e) { console.log(e.message); }" && pm2 restart life-scheduler`, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      console.log('Stream :: close :: code: ' + code + ', signal: ' + signal);
      conn.end();
    }).on('data', (data) => {
      console.log('STDOUT: ' + data);
    }).stderr.on('data', (data) => {
      console.log('STDERR: ' + data);
    });
  });
}).connect({
  host: '43.157.228.247',
  port: 22,
  username: 'ubuntu',
  password: 'VNd-CwN-6zP-q3X'
});
