// jest does not read vite's config, so it needs its own way to understand
// typescript and JSX. babel handles both and compiles the ES modules down to
// commonjs for the test run. this file is .cjs because package.json sets
// "type": "module", which would otherwise make node treat it as an ES module.
module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
    '@babel/preset-typescript',
  ],
};
