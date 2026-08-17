const apiPort = process.env.API_PORT || 3000;

module.exports = {
  '/api': {
    target: `http://localhost:${apiPort}`,
    secure: false,
  },
  '/assistant': {
    target: 'http://localhost:4201',
    pathRewrite: { '^/assistant': '' },
    secure: false,
  },
};
