// Capacitor 7.6.9 convierte SPM a minúsculas antes de compararlo con 'SPM'.
// Usar su misma operación add, conservando los controles, con el valor correcto.
const { loadConfig } = require('@capacitor/cli/dist/config');
const { addCommand } = require('@capacitor/cli/dist/tasks/add');
const path = require('node:path');
(async () => {
  const config = await loadConfig();
  config.ios.packageManager = Promise.resolve('SPM');
  config.cli.assets.ios.platformTemplateArchive = 'ios-spm-template.tar.gz';
  config.cli.assets.ios.platformTemplateArchiveAbs = path.join(config.cli.assetsDirAbs, 'ios-spm-template.tar.gz');
  await addCommand(config, 'ios');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
