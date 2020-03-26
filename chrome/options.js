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
}

async function main() {
    const settings = await getSettings()
    Object
        .entries(settingKeyToId)
        .forEach(([k, v]) => {
            const $el = document.getElementById(v)
            $el.checked = settings[k]
            console.log(`Set ${k} to ${v}`)
            $el.addEventListener('change', async _e => {
                await saveSettingValue(k, $el.checked)
            })
        })
}

main()
