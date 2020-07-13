/**
 * @param {string} txt
 * @returns {string}
 */
const getActionFromHtml = txt => txt.match(/action=("|')(.*?)("|')/)[2]

const unescapeMap = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#x27;": "'", "&#x60;": "`" }
const unescapeMapRegex = new RegExp('(?:' + Object.keys(unescapeMap).join('|') + ')', 'g')
const delay = ms => new Promise((resolve, _reject) => setTimeout(resolve, ms))

/**
 * @param {string} txt 
 * @returns {URLSearchParams}
 */
const getUrlSearchParamsFromHtml = txt => new URLSearchParams(
    Array
        .from(txt.matchAll(/name=("|')(.*)("|').*?value=("|')(.*)("|')/g))
        .map(([_1, _2, name, _3, _4, value, _5]) => [
            name,
            value.replace(unescapeMapRegex, e => unescapeMap[e])]))

/**
 * @template T
 * @param {() => Promise<T>} func 
 * @param {(ret: T) => boolean} predicate 
 * @returns {T}
 */
async function withRetry(func, predicate) {
    let ret = await func()
    let retryCnt = 3
    while (!predicate(ret) && retryCnt-- > 0) {
        await delay(3000)
        ret = await func()
    }
    return ret
}

/**
 * @param {string} landingUrl
 */
async function getPlayerOptions(landingUrl) {
    // Moodle ID => Mediasite credentials
    /** @type {string} */
    const moodleLandingTxt = await fetch(landingUrl, {
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
    const authTicket = getUrlSearchParamsFromHtml(coverPlayRes).get('AuthTicket')
    const mediasiteId = moodleLandingParams.get('mediasiteid')
    // Finally,
    const getPlayerOptionsRes = await withRetry(() => fetch("https://mymedia.xmu.edu.cn/Mediasite/PlayerService/PlayerService.svc/json/GetPlayerOptions", {
        method: 'post',
        body: JSON.stringify({
            getPlayerOptionsRequest: {
                ResourceId: mediasiteId,
                QueryString: '?authTicket=' + authTicket,
                UseScreenReader: false,
                UrlReferrer: launcherUrl
            }
        }),
        credentials: 'omit',
        headers: {
            'content-type': 'application/json'
        }
    })
        .then(res => res.json()), r => r.d.PlayerPresentationStatus === 1)

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
    const thumbnailStream = streams.find(s => s.ThumbnailUrl)

    return {
        type: 'getPlayerOptions',
        directUrls,
        slideStreams,
        title,
        mediasiteId,
        coverages,
        duration,
        bookmark,
        thumbnail: thumbnailStream
            && 'https://mymedia.xmu.edu.cn' + thumbnailStream.ThumbnailUrl
    }
}

/**
 * 
 * @param {chrome.cookies.Details} cookie 
 */
const removeCookieAsync = cookie => new Promise((resolve, _reject) => chrome.cookies.remove(cookie, resolve))

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const { type } = msg
    switch (type) {
        case 'getPlayerOptions':
            const { moodleId, customLandingUrl } = msg
            if (customLandingUrl) {
                getPlayerOptions(customLandingUrl).then(sendResponse)
            } else {
                getPlayerOptions(`https://l.xmu.edu.my/mod/mediasite/content_launch.php?id=${moodleId}&coverplay=1`).then(sendResponse)
            }
            return true
        case 'clearCookies':
            chrome.cookies.getAll({ domain: 'mymedia.xmu.edu.cn', secure: true }, cookies =>
                Promise
                    .all(cookies.map(({ domain, name, path, storeId }) =>
                        removeCookieAsync({ name, url: `https://${domain}${path}`, storeId })))
                    .then(sendResponse))
            return true
    }
})

console.log('Listening messages from background')
