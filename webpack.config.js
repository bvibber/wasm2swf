const path = require('path');

module.exports = {
    entry: './demo/demo.js',
    output: {
        filename: 'index.js',
        path: path.resolve(__dirname, 'build'),
    },
    mode: 'development',
};
