/** 通知が届いた瞬間にロック画面・ホーム画面のウィジェットを書き換える（アプリを開いていなくても動く） */
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'notification-service',
  name: 'NowmojiNSE',
  bundleIdentifier: '.nse',
  deploymentTarget: '16.4',
  entitlements: { 'com.apple.security.application-groups': ['group.com.fukuda.nowmoji'] },
};
