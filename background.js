'use strict';

chrome.browserAction.onClicked.addListener(() => chrome.storage.local.get({
  width: 700,
  height: 500,
  left: screen.availLeft + Math.round((screen.availWidth - 700) / 2),
  top: screen.availTop + Math.round((screen.availHeight - 500) / 2)
}, prefs => {
  chrome.windows.create({
    url: 'data/window/index.html',
    width: prefs.width,
    height: prefs.height,
    left: prefs.left,
    top: prefs.top,
    type: 'popup'
  });
}));

// FAQS and Feedback
{
  const {onInstalled, setUninstallURL, getManifest} = chrome.runtime;
  const {name, version} = getManifest();
  const page = getManifest().homepage_url;
  onInstalled.addListener(({reason, previousVersion}) => {
    chrome.storage.local.get({
      'faqs': true,
      'last-update': 0
    }, prefs => {
      if (reason === 'install' || (prefs.faqs && reason === 'update')) {
        const doUpdate = (Date.now() - prefs['last-update']) / 1000 / 60 / 60 / 24 > 45;
        if (doUpdate && previousVersion !== version) {
          chrome.tabs.create({
            url: page + '?version=' + version +
              (previousVersion ? '&p=' + previousVersion : '') +
              '&type=' + reason,
            active: reason === 'install'
          });
          chrome.storage.local.set({'last-update': Date.now()});
        }
      }
    });
  });
  setUninstallURL(page + '?rd=feedback&name=' + encodeURIComponent(name) + '&version=' + version);
}
