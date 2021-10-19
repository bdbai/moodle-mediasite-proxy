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

let cachedSettings = {}
/**
 * @type {Promise<{
 *  autoplay: boolean,
 *  extractInfo: boolean,
 *  showThumbnail: boolean,
 *  barFgColorStart: string,
 *  barFgColorEnd: string
 * }>}
 */
const settingsAsync = new Promise((resolve, _reject) =>
    chrome.storage.sync.get({
        autoplay: true,
        extractInfo: true,
        showThumbnail: true,
        barFgColorStart: '#a7dcec',
        barFgColorEnd: '#33bbe4',
    }, resolve))
settingsAsync.then(s => cachedSettings = s)

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
    let onTitleChange = (_title) => { }
    if (mediaTitle) {
        const $title = document.createElement('p')
        onTitleChange = title => $title.innerText = 'Title: ' + title
        onTitleChange(title)
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
    const onDirectUrlChange = directUrls => {
        $urlList.innerHTML = ''
        for (const url of directUrls) {
            const $li = document.createElement('li')
            const $a = document.createElement('a')
            $a.href = url
            $a.innerText = url
            $li.appendChild($a)
            $urlList.appendChild($li)
        }
    }
    onDirectUrlChange(directUrls)
    $con.appendChild($urlList)

    const onSlideStreamsChange = slideStreams => {
        [...$con.querySelectorAll('button.copy-slide-data-btn')].forEach($el => $el.remove())
        for (const slideStream of slideStreams) {
            const $copySlideDataBtn = document.createElement('button')
            $copySlideDataBtn.innerText = 'Copy slide data'
            $copySlideDataBtn.className = 'copy-slide-data-btn'
            $copySlideDataBtn.addEventListener('click', ev => {
                ev.preventDefault()
                navigator.clipboard
                    .writeText(JSON.stringify(slideStream))
                    .then(() => alert('Slide data copied'))
                    .catch(e => alert('Cannot copy slide data: ' + e.toString()))
            })
            $urlList.after($copySlideDataBtn)
        }
    }
    onSlideStreamsChange(slideStreams)

    // Append unwatched periods
    const $unwatchedList = document.createElement('ol')
    const $unwatchedTitle = document.createElement(titleEl)
    $unwatchedTitle.innerText = 'Unwatched portions'
    $con.appendChild($unwatchedTitle)
    const $unwatchedHr = document.createElement('hr')
    if (!compact) {
        $con.appendChild($unwatchedHr)
    }

    const onCoverageChange = (duration, coverages) => {
        $unwatchedList.innerHTML = ''
        const totalSeconds = Math.floor(duration / 1e3)
        const unwatchedPeriods = convertCoverageToUnwatched(coverages, totalSeconds)

        if (unwatchedPeriods.length > 0) {
            $unwatchedTitle.style.display = 'block'
            $unwatchedHr.style.display = 'block'
            $unwatchedList.style.display = 'block'
        } else {
            $unwatchedTitle.style.display = 'none'
            $unwatchedHr.style.display = 'none'
            $unwatchedList.style.display = 'none'
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
    }
    onCoverageChange(duration, coverages)

    $unwatchedCon.appendChild($unwatchedList)

    return newPlayerOptions => {
        onTitleChange(newPlayerOptions.title)
        onDirectUrlChange(newPlayerOptions.directUrls)
        onSlideStreamsChange(newPlayerOptions.slideStreams)
        onCoverageChange(newPlayerOptions.duration, newPlayerOptions.coverages)
    }
}

function drawProgress(insertCanvas, unwatchedPeriods, bookmark, duration) {
    const $portionCanvas = document.createElement('canvas')
    $portionCanvas.className = 'mediasite-proxy-portion'
    insertCanvas($portionCanvas)

    let drawOptions = {}
    const onResize = () => {
        const {
            paddingLeft: parentPaddingLeft,
            paddingRight: parentPaddingRight
        } = window.getComputedStyle($portionCanvas.parentElement)
        const width = $portionCanvas.parentElement.clientWidth - parseFloat(parentPaddingLeft) - parseFloat(parentPaddingRight)
        const height = $portionCanvas.clientHeight
        drawOptions.width = width
        $portionCanvas.width = width * devicePixelRatio
        $portionCanvas.height = height * devicePixelRatio
        $portionCanvas.style.width = width + 'px';
        $portionCanvas.style.height = height + 'px';
        return [width, height]
    }
    const [width, height] = onResize()
    const ctx = $portionCanvas.getContext('2d')
    drawOptions = {
        ctx,
        width,
        unwatchedPeriods,
        bmPosition: bookmark?.position,
        bgColor: '#fdf8ff',
        fgColor: cachedSettings.barFgColorStart,
        duration,
        animationProgress: 1
    }
    ctx.clearRect(0, 0, width, height)
    ctx.scale(devicePixelRatio, devicePixelRatio)
    ctx.font = '16px sans-serif';

    const finalBgColor = '#fdf8ff'
    const finalFgColor = cachedSettings.barFgColorEnd
    drawProgressText(drawOptions)
    drawProgressBar(drawOptions)

    window.addEventListener('resize', () => {
        onResize()
        ctx.scale(devicePixelRatio, devicePixelRatio)
        ctx.font = '16px sans-serif';
        drawProgressText(drawOptions)
        drawProgressBar(drawOptions)
    })

    let updateRequest = 1
    return (finalUnwatchedPeriods, finalBookmark, finalDuration) => {
        updateRequest += 1
        drawOptions.bgColor = finalBgColor
        drawOptions.fgColor = finalFgColor
        drawOptions.duration = finalDuration
        if (finalDuration !== duration) {
            drawOptions.bmPosition = finalBookmark?.position
            drawOptions.unwatchedPeriods = finalUnwatchedPeriods
            drawProgressText(drawOptions)
            drawProgressBar(drawOptions)
            unwatchedPeriods = finalUnwatchedPeriods
            bookmark = finalBookmark
            duration = finalDuration
            return
        }
        const finalBmPos = Number(finalBookmark?.position)
        const initialBmPos = bookmark?.position || 0
        const bmPosDelta = finalBmPos - initialBmPos

        // Split into smaller chunks
        const intermediateUnwatchedPeriods = []
        let oldIndex = 0, newIndex = 0
        let oldPeriods = [...unwatchedPeriods.map(([s, e]) => [s, e]), [duration, duration]]
        let newPeriods = [...finalUnwatchedPeriods.map(([s, e]) => [s, e]), [duration, duration]]
        while (oldIndex < oldPeriods.length && newIndex < newPeriods.length) {
            let oldPeriod = oldPeriods[oldIndex]
            let newPeriod = newPeriods[newIndex]
            while (oldPeriod[1] <= newPeriod[1]) {
                if (oldPeriod[1] <= newPeriod[0]) {
                    intermediateUnwatchedPeriods.push([oldPeriod[0], oldPeriod[1], -1])
                } else if (oldPeriod[0] <= newPeriod[0]) {
                    intermediateUnwatchedPeriods.push([oldPeriod[0], newPeriod[0], -1])
                    intermediateUnwatchedPeriods.push([newPeriod[0], oldPeriod[1], 0])
                    newPeriod[0] = oldPeriod[1]
                } else {
                    intermediateUnwatchedPeriods.push([newPeriod[0], oldPeriod[0], 1])
                    intermediateUnwatchedPeriods.push([oldPeriod[0], oldPeriod[1], 0])
                    newPeriod[0] = oldPeriod[1]
                }
                oldIndex += 1;
                if (oldIndex < oldPeriods.length) {
                    oldPeriod = oldPeriods[oldIndex]
                } else {
                    break
                }
            }
            while (newPeriod[1] <= oldPeriod[1]) {
                if (newPeriod[1] <= oldPeriod[0]) {
                    intermediateUnwatchedPeriods.push([newPeriod[0], newPeriod[1], 1])
                } else if (newPeriod[0] <= oldPeriod[0]) {
                    intermediateUnwatchedPeriods.push([newPeriod[0], oldPeriod[0], 1])
                    intermediateUnwatchedPeriods.push([oldPeriod[0], newPeriod[1], 0])
                    oldPeriod[0] = newPeriod[1]
                } else {
                    intermediateUnwatchedPeriods.push([oldPeriod[0], newPeriod[0], -1])
                    intermediateUnwatchedPeriods.push([newPeriod[0], newPeriod[1], 0])
                    oldPeriod[0] = newPeriod[1]
                }
                newIndex += 1;
                if (newIndex < newPeriods.length) {
                    newPeriod = newPeriods[newIndex]
                } else {
                    break
                }
            }
        }

        drawOptions.unwatchedPeriods = intermediateUnwatchedPeriods

        const currentUpdateRequest = updateRequest
        let isLastFrame = false
        const startTime = Date.now()
        const animationDuration = 2000
        const endTime = startTime + animationDuration
        requestAnimationFrame(function redraw() {
            if (updateRequest !== currentUpdateRequest) {
                return
            }
            if (!isLastFrame) {
                requestAnimationFrame(redraw)
            }

            const now = Date.now()
            if (now < endTime) {
                const progress = (Date.now() - startTime) / animationDuration
                drawOptions.animationProgress = Math.sin(progress * Math.PI / 2)
                if (!Number.isNaN(finalBmPos)) {
                    drawOptions.bmPosition = initialBmPos + bmPosDelta * Math.sin(progress * Math.PI / 2)
                }
            } else {
                drawOptions.animationProgress = 1
                drawOptions.unwatchedPeriods = unwatchedPeriods = finalUnwatchedPeriods
                drawOptions.bmPosition = finalBmPos
                bookmark = finalBookmark
                duration = finalDuration
                isLastFrame = true
            }

            drawProgressText(drawOptions)
            drawProgressBar(drawOptions)
        })
    }
}
/**
 * @param {Object} param0 
 * @param {CanvasRenderingContext2D} param0.ctx 
 * @param {number} param0.width 
 * @param {[number, number, boolean][]} param0.unwatchedPeriods 
 * @param {number | undefined} param0.bmPosition 
 * @param {number} param0.duration 
 * @param {string} param0.bgColor
 * @param {string} param0.fgColor
 * @param {number} [param0.animationProgress]
 */
function drawProgressBar({ ctx, width, unwatchedPeriods, bmPosition, duration, bgColor, fgColor, animationProgress = 1 }) {
    ctx.fillStyle = bgColor
    ctx.clearRect(0, 15, width, 20)
    ctx.fillStyle = fgColor
    const totalSeconds = Math.floor(duration / 1000)
    for (const [start, end, animationDirection] of unwatchedPeriods) {
        if (start === end) {
            continue
        }
        const x = start * width / totalSeconds
        const rectWidth = (end - start) * width / totalSeconds
        const leftWidth = rectWidth * animationProgress
        if (animationDirection === 1) {
            ctx.fillRect(x, 15, leftWidth, 5)
        } else if (animationDirection === -1) {
            ctx.fillRect(x + leftWidth, 15, rectWidth - leftWidth, 5)
        } else {
            ctx.fillRect(x, 15, rectWidth, 5)
        }
    }
    if (!isNaN(bmPosition)) {
        ctx.fillStyle = 'black'
        const x = bmPosition * width / duration * 1000 - 5 / 2
        ctx.fillRect(x, 15, 5, 5)
    }
}
/**
 * @param {Object} param0
 * @param {CanvasRenderingContext2D} param0.ctx 
 * @param {number} param0.width
 * @param {number | undefined} param0.bmPosition
 * @param {number} param0.duration
 */
function drawProgressText({ ctx, width, bmPosition, duration }) {
    ctx.fillStyle = '#fff'
    ctx.clearRect(0, 0, width, 15)
    ctx.fillStyle = '#555'
    const totalTimeStr = formatTime(Math.floor(duration / 1000))
    const totalTimeWidth = ctx.measureText(totalTimeStr).width
    const totalTimeX = width - totalTimeWidth
    ctx.fillText(totalTimeStr, totalTimeX, 12)
    if (!isNaN(bmPosition)) {
        const bookmarkTime = formatTime(bmPosition)
        const bookmarkTimeWidth = ctx.measureText(bookmarkTime).width
        ctx.fillText(bookmarkTime, Math.max(0, Math.min(
            bmPosition * width / duration * 1000 - bookmarkTimeWidth / 2,
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
