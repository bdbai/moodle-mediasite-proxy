/**
 * @typedef {{
 *   dictFw: boolean,
 *   manifestFw: boolean,
 *   mediaFw: boolean,
 *   extractInfo: boolean
 * }} Setting
 */


/**
 * @type {Setting}
 */
export const defaultSettings = {
    dictFw: false,
    manifestFw: false,
    mediaFw: false,
    extractInfo: true,
    autoplay: true,
}

/**
 * @typedef {typeof(defaultSettings)} Setting
 */


/**
 * Get settings with defaults
 * @returns {Promise<Setting>}
 */
export const getSettings = () => new Promise((resolve, _reject) => {
    chrome.storage.sync.get(defaultSettings, resolve)
})

/**
 * Save a setting value
 * @template {keyof(Setting)} K
 * @param {K} key 
 * @param {Setting[K]} value 
 */
export const saveSettingValue = (key, value) => new Promise((resolve, _reject) => {
    chrome.storage.sync.set({ [key]: value }, resolve)
})
