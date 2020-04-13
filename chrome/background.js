/**
 * @type {chrome.windows.Window}
 */
let currentWindow = undefined

chrome.windows.getCurrent(w => currentWindow = w)

/**
 * @param {string} txt
 * @returns {string}
 */
const getActionFromHtml = txt => txt.match(/action=("|')(.*?)("|')/)[2]

/**
 * @param {string} txt 
 * @returns {URLSearchParams}
 */
const getUrlSearchParamsFromHtml = txt => new URLSearchParams(
    Array
        .from(txt.matchAll(/name=("|')(.*?)("|').*?value=("|')(.*?)("|')/g))
        .map(([_1, _2, name, _3, _4, value, _5]) => [name, value]))

/**
 * @param {string} moodleId 
 */
async function getPlayerOptions(moodleId) {
    // Moodle ID => Mediasite credentials
    /** @type {string} */
    const moodleLandingTxt = await fetch(`https://l.xmu.edu.my/mod/mediasite/content_launch.php?id=${moodleId}&coverplay=1`, {
        credentials: 'include'
    })
        .then(res => res.text())
    const coverPlayUrl = getActionFromHtml(moodleLandingTxt)
    const moodleLandingParams = getUrlSearchParamsFromHtml(moodleLandingTxt)
    // Mediasite credentials => auth ticket
    const coverPlayRes = await fetch(coverPlayUrl, {
        method: 'post',
        body: moodleLandingParams,
        credentials: 'omit'
    })
        .then(res => res.text())
    const launcherUrl = getActionFromHtml(coverPlayRes)
    const launcherParams = getUrlSearchParamsFromHtml(coverPlayRes)
    const mediasiteId = moodleLandingParams.get('mediasiteid')
    // Auth ticket => cookie stored
    launcherParams.set('cookiesEnabled', true)
    launcherParams.set('CookieSupport', true)
    launcherParams.set('IsBetterCookieSupportForm', true)
    await fetch(launcherUrl, {
        method: 'post',
        body: launcherParams
    })
    // Finally,
    const getPlayerOptionsRes = await fetch("https://mymedia.xmu.edu.cn/Mediasite/PlayerService/PlayerService.svc/json/GetPlayerOptions", {
        method: 'post',
        body: JSON.stringify({
            getPlayerOptionsRequest: {
                ResourceId: mediasiteId,
                QueryString: '',
                UseScreenReader: false,
                UrlReferrer: launcherUrl
            }
        }),
        credentials: 'include',
        headers: {
            'content-type': 'application/json'
        }
    })
        .then(res => res.json())

    const {
        d: {
            CoverageEvents: coverages,
            Presentation: {
                Title: title,
                Streams: streams,
                Duration: duration
            },
            PresentationBookmark: bookmark
        }
    } = getPlayerOptionsRes
    const directUrls = streams
        .filter(s => s.VideoUrls.length > 0)
        .map(s => s.VideoUrls[0].Location)
    const slideStreams = streams
        .filter(s => s.StreamType === 2)
    return {
        type: 'getPlayerOptions',
        directUrls,
        slideStreams,
        title,
        mediasiteId,
        coverages,
        duration,
        bookmark
    }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const { type } = msg
    if (typeof currentWindow === 'undefined') {
        return
    }
    switch (type) {
        case 'getPlayerOptions':
            getPlayerOptions(msg.moodleId).then(sendResponse)
            return true
        case 'getWindowState':
            const gotState = currentWindow.state || 'maximized'
            sendResponse(gotState)
            console.debug('getwindowstate', gotState)
            break
        case 'setWindowState':
            console.debug('setwindowstate', msg)
            const { state } = msg
            chrome.windows.update(currentWindow.id, { state }, _w => sendResponse())
            return true
    }
})

console.log('Listening messages from background')
