export default {
  'frontend/**/*.{ts,tsx}': () => 'npm run lint -w frontend',
  'backend/**/*.ts': () => 'npm run lint -w backend',
  '*.{ts,tsx,js,jsx,mjs,json,css,html,md,yml,yaml}': 'prettier --write',
};
