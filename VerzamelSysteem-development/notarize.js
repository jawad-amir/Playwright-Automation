/* eslint-disable import/no-extraneous-dependencies */
require('dotenv').config();
const { notarize } = require('electron-notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') {
    return null;
  }
  const appName = context.packager.appInfo.productFilename;
  return notarize({
    appBundleId: 'com.internetpreneur.verzamelsysteem',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLEID,
    appleIdPassword: process.env.APPLEIDPASS,
  });
};
