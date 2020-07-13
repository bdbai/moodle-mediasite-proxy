import {
    getSettings,
    saveSettingValue,
    defaultSettings
} from './settings.js'

/**
 * @typedef {keyof(defaultSettings)} SettingKeys
 */

/**
 * @type {Record<SettingKeys, string>}
 */
const settingKeyToId = {
    dictFw: 'dict-fw-box',
    manifestFw: 'manifest-fw-box',
    mediaFw: 'media-fw-box',
    extractInfo: 'extract-info-box',
    autoplay: 'autoplay-box',
    showThumbnail: 'show-thumbnail-box'
}

async function main() {
    const settings = await getSettings()
    Object
        .entries(settingKeyToId)
        .forEach(([k, v]) => {
            /** @type {HTMLInputElement} */
            const $el = document.getElementById(v)
            $el.checked = settings[k]
            console.log(`Set ${k} to ${v}`)
            if (k.endsWith('Fw')) {
                $el.addEventListener('change', _e => {
                    if ($el.checked) {
                        chrome.permissions.request({
                            permissions: ['webRequest', 'webRequestBlocking'],
                            origins: ['http://127.0.0.1/*', 'https://myv.xmu.edu.cn/*']
                        }, granted => {
                            if (granted) {
                                saveSettingValue(k, granted)
                            } else {
                                $el.checked = false
                            }
                        })
                    } else {
                        return saveSettingValue(k, false)
                    }
                })
            } else {
                $el.addEventListener('change', _e => {
                    return saveSettingValue(k, $el.checked)
                })
            }
        })
}

main()
