Package.describe({
  name: 'tosinek:friendly-slugs',
  version: '0.7.0',
  summary: 'Generate URL friendly slugs from a field with auto-incrementation to ensure unique URLs.',
  git: 'https://github.com/tosinek/meteor-friendly-slugs.git',
  documentation: 'README.md',
})

Package.onUse(function (api) {
  api.use(['underscore', 'check', 'matb33:collection-hooks'])
  api.versionsFrom('1.0')
  api.mainModule('slugs.js')
})
