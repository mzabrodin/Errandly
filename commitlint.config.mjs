export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      1,
      'always',
      ['frontend', 'backend', 'db', 'ci', 'docker', 'deps', 'deps-dev', 'docs'],
    ],
  },
  // Dependabot bodies contain release notes with lines longer than body-max-line-length
  ignores: [(message) => message.includes('Signed-off-by: dependabot[bot]')],
};
