import { getSettings, defaultSettings } from './settings.js'

const dictUrl = 'https://mymedia.xmu.edu.cn/Mediasite/Play/Localization/Dictionary.ashx?version=3474'
const cfOrigin = 'https://myv.xmu.edu.cn'
const localOrigin = 'http://127.0.0.1:10384'
const localDictUrl = localOrigin + '/dict'

let settings = defaultSettings
getSettings().then(s => settings = s).then(onSettingsChanged)

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
    onSettingsChanged()
})

/**
 * @param {chrome.webRequest.WebRequestBodyDetails} req 
 */
function onBeforeRequestHandler(req) {
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
    if (!req.url.includes('manifest') && !req.url.includes('Fragment')) {
        return
    }
    const redirectUrl = req.url.replace(cfOrigin, localOrigin)
        + (req.url.includes('?') ? '&url=' : '?url=')
        + encodeURIComponent(req.url.replace(localOrigin, cfOrigin))
    console.log(`Redirect ${req.url} to ${redirectUrl}`)
    return { redirectUrl }
}

let isListening = false
function onSettingsChanged() {
    const needFw = settings.dictFw || settings.manifestFw || settings.mediaFw
    if (needFw && !isListening) {
        chrome.webRequest.onBeforeRequest.addListener(onBeforeRequestHandler, {
            urls: [
                dictUrl,
                'http://127.0.0.1/*', // Requests from m3u8 player
                'https://myv.xmu.edu.cn/MediasiteDeliver/*'
            ]
        }, ['blocking'])
        console.log('Request listener on')
        isListening = true
    } else if (!needFw && isListening) {
        chrome.webRequest.onBeforeRequest.removeListener(onBeforeRequestHandler)
        isListening = false
        console.log('Request listener off')
    }
}
