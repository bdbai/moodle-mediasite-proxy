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

/**
 * @param {string} url 
 * @returns {Promise<boolean>}
 */
const checkAvailability = url => new Promise((resolve, _) => chrome.runtime.sendMessage({
    type: 'getUrlAvailability',
    url
}, resolve))

/**
 * @param {HTMLElement} $el 
 */
async function updateAvailabilityEl($el) {
    const url = $el.getAttribute('data-test-url')
    $el.classList.remove('error')
    $el.classList.remove('success')
    $el.classList.add('pending')
    if (await checkAvailability(url)) {
        $el.classList.remove('pending')
        $el.classList.add('success')
    } else {
        $el.classList.remove('pending')
        $el.classList.add('error')
    }
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
                            origins: ['http://127.0.0.1/*']
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

    const $availabilityEls = document.querySelectorAll('ul.availability-list li[data-test-url]')
    for (const $el of $availabilityEls) {
        $el.addEventListener('click', async e => {
            e.preventDefault()
            updateAvailabilityEl($el);
        })
    }
    $availabilityEls.forEach(updateAvailabilityEl)
}

main()
