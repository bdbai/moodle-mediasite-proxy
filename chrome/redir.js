import { getSettings, defaultSettings } from './settings.js'

const dictUrl = 'https://xmum.mediasitecloud.jp/Mediasite/Play/Localization/Dictionary.ashx?version=3474'
const cfOrigin = 'https://dut6paa3rdk42.cloudfront.net'
const localOrigin = 'http://127.0.0.1:10384'
const localDictUrl = localOrigin + '/dict'

let settings = defaultSettings
getSettings().then(s => settings = s)

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') {
        return
    }
    settings = {
        ...settings,
        ...Object
            .fromEntries(Object
                .entries(changes)
                .map(([k, change]) => [k, change.newValue]))
    }
})

chrome.webRequest.onBeforeRequest.addListener(req => {
    if (settings.dictFw && req.url === dictUrl) {
        console.log('Redirect dict')
        return { redirectUrl: localDictUrl }
    }
    if (req.url.includes('url=')) {
        return
    }
    if (req.url.includes('manifest') && !settings.manifestFw) {
        return
    }
    if (req.url.includes('Fragment') && !settings.mediaFw) {
        return
    }
    if (!req.url.startsWith(cfOrigin) && !req.url.startsWith(localOrigin)) {
        return
    }
    const redirectUrl = req.url.replace(cfOrigin, localOrigin)
        + (req.url.includes('?') ? '&url=' : '?url=')
        + encodeURIComponent(req.url.replace(localOrigin, cfOrigin))
    console.log(`Redirect ${req.url} to ${redirectUrl}`)
    return { redirectUrl }
}, {
    urls: [
        dictUrl,
        'http://127.0.0.1/*', // Requests from m3u8 player
        'https://dut6paa3rdk42.cloudfront.net/MediasiteDeliver/MP4_amoiuniv/*site=xmum.mediasitecloud.jp'
    ]
}, ['blocking'])
