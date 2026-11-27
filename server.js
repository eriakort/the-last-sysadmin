const express = require('express');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const ROOT = __dirname;

app.use(express.static(ROOT, {
  dotfiles: 'ignore',
  extensions: ['html'],
}));

app.listen(PORT, HOST, () => {
  console.log(`The Last Sysadmin listening on http://${HOST}:${PORT}`);
});
