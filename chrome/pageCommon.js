const MEDIASITE_ORIGIN = 'https://mymedia.xmu.edu.cn'

/**
 * @param {number} ms 
 */
const delay = ms => new Promise((resolve, _reject) => setTimeout(resolve, ms))

function formatTime(seconds) {
    let hour = ''
    if (seconds >= 3600) {
        hour = Math.floor(seconds / 3600).toString() + ':'
        seconds = seconds % 3600
    }
    const minute = Math.floor(seconds / 60).toString().padStart(2, '0')
    return `${hour}${minute}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`
}

/**
 * @type {Promise<{
 *  autoplay: boolean,
 *  extractInfo: boolean,
 *  showThumbnail: boolean
 * }>}
 */
const settingsAsync = new Promise((resolve, _reject) =>
    chrome.storage.sync.get({
        autoplay: true,
        extractInfo: true,
        showThumbnail: true
    }, resolve))

/**
 * @param {EventTarget} $el 
 */
function dismissDialog($el) {
    let $dialog = $el.parentElement
    while (!$dialog.classList.contains('mediasite-proxy-dialog')) {
        $dialog = $dialog.parentElement
    }
    $dialog.style.visibility = 'hidden'
}

/**
 * @param {{ Duration: number, StartTime: number }[]} coverages
 * @param {number} totalSeconds
 * @return {[number, number][]}
 */
function convertCoverageToUnwatched(coverages, totalSeconds) {
    // Assume coverages do not overlap
    /** @type {[number, number][]} */
    const unwatchedPeriods = []
    let lastWatchedSecond = 0
    for (const {
        Duration: duration,
        StartTime: startTime
    } of coverages) {
        if (startTime > lastWatchedSecond) {
            unwatchedPeriods.push([lastWatchedSecond, startTime])
        }
        lastWatchedSecond = Math.min(duration + startTime, totalSeconds)
    }
    if (lastWatchedSecond < totalSeconds) {
        unwatchedPeriods.push([lastWatchedSecond, totalSeconds])
    }
    return unwatchedPeriods
}

/**
 * @param {Object} playerOptions
 * @param {string} playerOptions.title
 * @param {unknown[]} playerOptions.slideStreams
 * @param {string[]} playerOptions.directUrls
 * @param {number} playerOptions.duration
 * @param {{ Duration: number, StartTime: number }} playerOptions.coverages
 * @param {Object} [options]
 * @param {Node} options.$con
 * @param {boolean} [options.header]
 * @param {boolean} [options.mediaTitle]
 * @param {boolean} [options.compact]
 * @param {'h5' | 'strong'} [options.titleEl]
 * @param {Node} [options.$unwatchedCon]
 * @param {string} [options.unwatchedAnchorPrefix]
 * @param {ChildNode} [options.$unwatchedAnchor]
 * @param {(position: number) => Window | undefined} [options.findPlayerWindow]
 */
function attachMediaInfo(playerOptions, options = {}) {
    const { title, slideStreams, directUrls, duration, coverages } = playerOptions
    const {
        $con,
        $unwatchedCon = $con,
        header = false,
        mediaTitle = false,
        compact = true,
        titleEl = 'h5',
        unwatchedAnchorPrefix = 'video',
        $unwatchedAnchor,
        findPlayerWindow = undefined
    } = options
    if (header) {
        const $header = document.createElement('h4')
        $header.innerText = 'Media information'
        $con.appendChild($header)
        $con.appendChild(document.createElement('hr'))
    }
    if (mediaTitle) {
        const $title = document.createElement('p')
        $title.innerText = 'Title: ' + title
        $con.appendChild($title)
    }
    const $urlText = document.createElement(titleEl)
    $urlText.innerText = 'Direct URLs'
    $con.appendChild($urlText)
    if (!compact) {
        $con.appendChild(document.createElement('hr'))
    }

    // Append direct URLs
    const $urlList = document.createElement('ul')
    for (const url of directUrls) {
        const $li = document.createElement('li')
        const $a = document.createElement('a')
        $a.href = url
        $a.innerText = url
        $li.appendChild($a)
        $urlList.appendChild($li)
    }
    $con.appendChild($urlList)

    for (const slideStream of slideStreams) {
        const $copySlideDataBtn = document.createElement('button')
        $copySlideDataBtn.innerText = 'Copy slide data'
        $copySlideDataBtn.addEventListener('click', ev => {
            ev.preventDefault()
            navigator.clipboard
                .writeText(JSON.stringify(slideStream))
                .then(() => alert('Slide data copied'))
                .catch(e => alert('Cannot copy slide data: ' + e.toString()))
        })
        $con.appendChild($copySlideDataBtn)
    }

    // Append unwatched periods
    const totalSeconds = Math.floor(duration / 1e3)
    const unwatchedPeriods = convertCoverageToUnwatched(coverages, totalSeconds)

    const $unwatchedList = document.createElement('ol')
    if (unwatchedPeriods.length > 0) {
        const $unwatchedTitle = document.createElement(titleEl)
        $unwatchedTitle.innerText = 'Unwatched portions'
        $con.appendChild($unwatchedTitle)
        if (!compact) {
            $con.appendChild(document.createElement('hr'))
        }
    }
    /**
     * @param {MouseEvent} e
     */
    function unwatchedClickHandler(e) {
        /** @type {HTMLLIElement} */
        const $el = e.target
        const position = Number.parseInt($el.getAttribute('data-position'))
        const $playerWindow = findPlayerWindow(position)
        $playerWindow?.postMessage({ type: 'seek', position }, MEDIASITE_ORIGIN)
        // In case autoplay is disabled
        $playerWindow?.postMessage({ type: 'play' }, MEDIASITE_ORIGIN)
    }
    for (const [start, end] of unwatchedPeriods) {
        const $unwatchedLi = document.createElement('li')
        const $unwatched = document.createElement('a')
        const $dummy = document.createElement('a')
        if ($unwatchedAnchor) {
            $dummy.id = `${unwatchedAnchorPrefix}-seek-${start}`
            $unwatchedAnchor?.before($dummy)
        }
        const period = end - start
        $unwatched.innerText = `${formatTime(start)} - ${formatTime(end)} (${period} second${period === 1 ? '' : 's'})`
        $unwatched.setAttribute('data-position', Math.max(start - 2, 0))
        if (findPlayerWindow) {
            $unwatched.addEventListener('click', unwatchedClickHandler)
            $unwatched.href = '#' + $dummy.id
        }
        $unwatchedLi.appendChild($unwatched)
        $unwatchedList.appendChild($unwatchedLi)
    }
    if (unwatchedPeriods.length > 0) {
        $unwatchedCon.appendChild($unwatchedList)
    }
}

// TODO: type
function drawProgressOnce(insertCanvas, unwatchedPeriods, bookmark, totalSeconds, duration) {
    const $portionCanvas = document.createElement('canvas')
    $portionCanvas.className = 'mediasite-proxy-portion'
    insertCanvas($portionCanvas)

    const {
        paddingLeft: parentPaddingLeft,
        paddingRight: parentPaddingRight
    } = window.getComputedStyle($portionCanvas.parentElement)
    const width = $portionCanvas.parentElement.clientWidth - parseFloat(parentPaddingLeft) - parseFloat(parentPaddingRight)
    const height = $portionCanvas.clientHeight
    $portionCanvas.width = width * devicePixelRatio
    $portionCanvas.height = height * devicePixelRatio
    $portionCanvas.style.width = width + 'px';
    $portionCanvas.style.height = height + 'px';
    const canvasCtx = $portionCanvas.getContext('2d')
    canvasCtx.clearRect(0, 0, width, height)
    canvasCtx.scale(devicePixelRatio, devicePixelRatio)
    canvasCtx.fillStyle = '#33bbe4'
    for (const [start, end] of unwatchedPeriods) {
        const x = start * width / totalSeconds
        const rectWidth = (end - start) * width / totalSeconds
        canvasCtx.fillRect(x, 15, rectWidth, 5)
    }
    if (bookmark?.position) {
        canvasCtx.fillStyle = 'black'
        const x = bookmark.position * width / duration * 1000 - 5 / 2
        canvasCtx.fillRect(x, 15, 5, 5)
    }
    canvasCtx.fillStyle = '#555'
    canvasCtx.font = '16px sans-serif';
    const totalSecondsStr = formatTime(totalSeconds)
    const totalTimeWidth = canvasCtx.measureText(totalSecondsStr).width
    const totalTimeX = width - totalTimeWidth
    canvasCtx.fillText(totalSecondsStr, totalTimeX, 12)
    if (bookmark?.position) {
        const bookmarkTime = formatTime(bookmark.position)
        const bookmarkTimeWidth = canvasCtx.measureText(bookmarkTime).width
        canvasCtx.fillText(bookmarkTime, Math.max(0, Math.min(
            bookmark.position * width / duration * 1000 - bookmarkTimeWidth / 2,
            totalTimeX - 8 - bookmarkTimeWidth
        )), 12)
    }
}

const fixCookieDialog = document.createElement('div')
fixCookieDialog.className = 'mediasite-proxy-dialog'
fixCookieDialog.innerHTML = `<div class="dialog">
    <p class="title">Bad ticket detected</p>
    <hr>
    <p>Fix and reload this page?</p>
    <button id="mediasite-proxy-fix-cookie-reload-btn" class="btn btn-primary">Fix</button>
    <button class="mediasite-proxy-dismiss-btn btn btn-light">Cancel</button>
</div>`
document.body.appendChild(fixCookieDialog)
document.getElementById('mediasite-proxy-fix-cookie-reload-btn').addEventListener('click', e => {
    e.preventDefault()
    chrome.runtime.sendMessage({ type: 'clearCookies' }, () => {
        location.reload()
    })
    dismissDialog(e.target)
})
for (const $el of document.getElementsByClassName('mediasite-proxy-dismiss-btn')) {
    $el.addEventListener('click', e => {
        e.preventDefault()
        dismissDialog(e.target)
    })
}

window.addEventListener('message', e => {
    if (e.origin === MEDIASITE_ORIGIN) {
        let data = { event: '', type: '' }
        if (typeof e.data === 'string') {
            try {
                data = JSON.parse(e.data)
            } catch (syntaxErr) {
                return
            }
        } else {
            data = e.data
        }

        if (data.type === 'requestFixCookie') {
            fixCookieDialog.style.visibility = 'visible'
        }
    }
})
