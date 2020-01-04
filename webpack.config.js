const path = require('path');

module.exports = {
    entry: './src/demo.js',
    output: {
        filename: 'index.js',
        path: path.resolve(__dirname, 'demo'),
    },
    mode: 'development',
};
