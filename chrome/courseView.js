const DEFAULT_PLAYER_HEIGHT_SESSION_KEY = 'defaultPlayerHeightSessionKey'

const $mediaLis = Array
    .from(document.querySelectorAll('li.activity.mediasite.modtype_mediasite'))

/**
 * @type {(() => void)[]}
 */
const coverplayReadyCallbacks = []

/**
 * @param {string} moodleId 
 * @returns {Promise<any>}
 */
const getPlayerOptionsAsync = moodleId => new Promise((resolve, _reject) => chrome.runtime.sendMessage({
    type: 'getPlayerOptions',
    moodleId
}, resolve))

/**
 * @param {string} url
 * @returns {Promise<ArrayBuffer>}
 */
const getDataUrlAsync = url => new Promise((resolve, reject) => chrome.runtime.sendMessage({
    type: 'getDataUrl',
    url
}, res => {
    if (res instanceof Error) {
        reject(res)
    } else {
        resolve(res)
    }
}))

/**
 * @param {Element} $el 
 */
function removeYuiIds($el) {
    if (typeof $el.id === 'string' && $el.id.startsWith('yui_')) {
        $el.id = ''
    }
    Array.from($el.children).forEach(removeYuiIds)
}

const playerResizeObserver = new ResizeObserver(([{ contentRect: { height } }]) => {
    sessionStorage.setItem(DEFAULT_PLAYER_HEIGHT_SESSION_KEY, height)
})

/**
 * 
 * @param {Element} $li
 */
async function collectFromGetPlayerOptions($li) {
    const { extractInfo, showThumbnail } = await settingsAsync
    if (!extractInfo) {
        return
    }
    const $backup = $li.cloneNode(true)
    removeYuiIds($backup)
    const id = $li.id.substr(7) // module-76543
    const {
        directUrls,
        slideStreams,
        title,
        mediasiteId,
        coverages, // second!
        duration,
        bookmark, // second!
        thumbnail
    } = await getPlayerOptionsAsync(id)

    const $con = document.createElement('details')
    const $summary = document.createElement('summary')

    function reload() {
        $li.before($backup)
        // TODO: remove event listeners
        $li.remove()
        collectFromGetPlayerOptions($backup)
    }

    const $a = $li.querySelector('a')
    $a.addEventListener('click', e => {
        e.preventDefault()
        location.href = $a.getAttribute('href')
    })

    for (const $el of Array.from($li.childNodes)) {
        $li.removeChild($el)
        $el.classList.add('item-header')
        $summary.appendChild($el)
    }
    if (showThumbnail && thumbnail) {
        const $thumbCon = document.createElement('div')
        const $thumb = document.createElement('img')
        $thumbCon.appendChild($thumb)
        if (typeof $thumb.loading === 'string') {
            $thumb.loading = 'lazy'
        }
        $thumbCon.className = 'thumbnail'
        // Load image through background page (for CORS) with cookie
        // `ASP.NET_SessionId` omitted. Otherwise, we will get a 401.
        getDataUrlAsync(thumbnail)
            // A trick to load data URLs generated from background pages
            .then(fetch)
            .then(res => (URL.revokeObjectURL(res.url), res.blob()))
            .then(blob => {
                $thumb.src = URL.createObjectURL(blob)
                $summary.appendChild($thumbCon)
            }, console.error)
    }
    $con.appendChild($summary)

    // Append embedded player
    {
        const $embedText = document.createElement('h5')
        $embedText.innerText = 'Embedded Player'
        const $btn = document.createElement('button')
        $btn.innerText = 'Load Embedded Player'
        $btn.className = 'center btn btn-primary'
        $btn.addEventListener('click', async e => {
            e.preventDefault()
            const $player = document.createElement('iframe')
            $player.allowFullscreen = true
            $player.src = `https://l.xmu.edu.my/mod/mediasite/content_launch.php?id=${id}&coverplay=1`
            $player.className = 'mediasite-content-iframe'
            $con.classList.add('playing')
            const $resizer = document.createElement('div')
            const initialHeight = sessionStorage.getItem(DEFAULT_PLAYER_HEIGHT_SESSION_KEY)
            if (initialHeight) {
                $resizer.style.height = initialHeight.toString() + 'px'
            }
            $resizer.className = 'resizer'
            $resizer.appendChild($player)
            playerResizeObserver.observe($resizer)
            $btn.before($resizer)
            $btn.remove()

            if ((await settingsAsync).autoplay) {
                coverplayReadyCallbacks.push(() => {
                    setTimeout(() => {
                        const $playerWindow = $player.contentWindow
                        if ($playerWindow) {
                            $playerWindow.postMessage({ type: 'play' }, MEDIASITE_ORIGIN)
                        }
                    }, 500)
                })
            }

            // When the container collapses, reload
            $summary.addEventListener('click', function onDetailClick(_e) {
                if ($con.open) {
                    // Manually trigger a coverage report
                    $player.contentWindow.postMessage({ type: 'updateCoverage' }, MEDIASITE_ORIGIN)
                    setTimeout(reload, 400)
                    $summary.removeEventListener('click', onDetailClick)
                    playerResizeObserver.unobserve($resizer)
                }
            })
        })

        $con.appendChild($embedText)
        $con.appendChild(document.createElement('hr'))
        $con.appendChild($btn)
    }

    // Append media info
    const $urlText = document.createElement('h5')
    $urlText.innerText = 'Direct URLs'
    $con.appendChild($urlText)
    $con.appendChild(document.createElement('hr'))

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
    const totalSecondsStr = formatTime(totalSeconds)
    // Assume coverages do not overlap
    const unwatchedPeriods = []
    let coveredSeconds = 0
    let lastWatchedSecond = 0
    for (const {
        Duration: duration,
        StartTime: startTime
    } of coverages) {
        const endTime = Math.min(duration + startTime, totalSeconds)
        coveredSeconds += endTime - startTime
        if (startTime > lastWatchedSecond) {
            unwatchedPeriods.push([lastWatchedSecond, startTime])
        }
        lastWatchedSecond = Math.min(totalSeconds, duration + startTime)
    }
    if (lastWatchedSecond < totalSeconds) {
        unwatchedPeriods.push([lastWatchedSecond, totalSeconds])
    }

    const $unwatchedList = document.createElement('ol')
    if (unwatchedPeriods.length > 0) {
        const $unwatchedTitle = document.createElement('h5')
        $unwatchedTitle.innerText = 'Unwatched portions'
        $con.appendChild($unwatchedTitle)
        $con.appendChild(document.createElement('hr'))
    }
    for (const [start, end] of unwatchedPeriods) {
        const $unwatched = document.createElement('li')
        const period = end - start
        $unwatched.innerText = `${formatTime(start)} - ${formatTime(end)} (${period} second${period === 1 ? '' : 's'})`
        $unwatchedList.appendChild($unwatched)
    }
    if (unwatchedPeriods.length > 0) {
        $con.appendChild($unwatchedList)
    }

    // Show bookmark position
    const bookmarkTime = formatTime(bookmark?.position ?? 0)
    const $instanceNameNode = $con.querySelector('span.instancename')
    const $instanceNameTextNode = $instanceNameNode.childNodes[0]

    // Unwatched periods
    const appendix = `[Est. completeness = ${Math.min(1, coveredSeconds / totalSeconds)
        .toLocaleString('en-US', {
            style: 'percent',
            maximumFractionDigits: 2
        })
        }]`
    $instanceNameNode.setAttribute('data-original-text', $instanceNameTextNode.textContent)
    $instanceNameTextNode.textContent += appendix //` [bookmark at 1:3(5%)][Est. completeness = %]`

    $li.appendChild($con)

    const $portionCanvas = document.createElement('canvas')
    $portionCanvas.className = 'mediasite-proxy-portion'
    $li.appendChild($portionCanvas)
    const redraw = () => {
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
            const { position } = bookmark
            const x = position * width / duration * 1000 - 5 / 2
            canvasCtx.fillRect(x, 15, 5, 5)
        }
        canvasCtx.fillStyle = '#555'
        canvasCtx.font = '16px sans-serif';
        const totalTimeWidth = canvasCtx.measureText(totalSecondsStr).width
        const totalTimeX = width - totalTimeWidth
        canvasCtx.fillText(totalSecondsStr, totalTimeX, 12)
        if (bookmark?.position) {
            const bookmarkTimeWidth = canvasCtx.measureText(bookmarkTime).width
            canvasCtx.fillText(bookmarkTime, Math.max(0, Math.min(
                bookmark.position * width / duration * 1000 - bookmarkTimeWidth / 2,
                totalTimeX - 8 - bookmarkTimeWidth
            )), 12)
        }
    }
    requestAnimationFrame(redraw)
    window.addEventListener('resize', _e => requestAnimationFrame(redraw))
}

/**
 * @type {string}
 */
let defaultWindowState = 'maximized'
!function () {
    // Collect information from GetPlayerOptions
    settingsAsync.then(({ extractInfo }) => {
        if (!extractInfo) {
            return
        }

        // Remove builtin embedded player
        for (const $mediasiteContent of document.querySelectorAll('li.mediasite .contentafterlink')) {
            $mediasiteContent.remove()
        }

        /** @type {Map<string, number>} */
        const videoEntryTimeouts = new Map()
        const observer = new IntersectionObserver(e => {
            for (const entry of e) {
                const targetId = entry.target.id
                if (entry.isIntersecting) {
                    videoEntryTimeouts.set(targetId, setTimeout(($li, targetId) => {
                        observer.unobserve($li)
                        collectFromGetPlayerOptions($li)
                        videoEntryTimeouts.delete(targetId)
                    }, 1000, entry.target, targetId))
                } else if (videoEntryTimeouts.has(targetId)) {
                    clearTimeout(videoEntryTimeouts.get(targetId))
                    videoEntryTimeouts.delete(targetId)
                }
            }
        }, { threshold: 1.0 })
        $mediaLis.forEach($li => observer.observe($li))
    })

    // Allow Mediasite content iframes to enter fullscreen mode
    for (const $iframe of document.querySelectorAll('iframe.mediasite-content-iframe')) {
        $iframe.allowFullscreen = true
    }

    // Collect media titles and links
    const courseId = window.location.href.match(/id=(\d+)/)[1]
    const titles = $mediaLis.map($li => {
        const id = $li.id.substr(7) // module-76543
        const $instanceName = $li.querySelector('span.instancename')
        const instancename = $instanceName.getAttribute('data-original-text')
            || $instanceName.childNodes[0].textContent
        return [id, instancename]
    })
    localStorage.setItem('mediasite_video_ids_' + courseId, JSON.stringify(titles))
}()

window.addEventListener('message', e => {
    if (typeof e.data === 'string') {
        const { event = '' } = JSON.parse(e.data)
        if (event === 'playcoverready') {
            coverplayReadyCallbacks.forEach(fn => fn())
            coverplayReadyCallbacks.splice(0, coverplayReadyCallbacks.length)
        }
    }
})

console.log('Listening on messages')
