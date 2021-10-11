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
    const playerOptions = await getPlayerOptionsAsync(id)
    const {
        mediasiteId,
        coverages, // second!
        duration,
        bookmark, // second!
        thumbnail
    } = playerOptions

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
    /** @type {Window | undefined} */
    let $playerWindow = undefined
    /** @type {number | undefined} */
    let desiredInitialPosition = undefined
    const $loadPlayerBtn = document.createElement('button')
    {
        const $embedText = document.createElement('h5')
        $embedText.innerText = 'Embedded Player'
        $loadPlayerBtn.innerText = 'Load Embedded Player'
        $loadPlayerBtn.className = 'center btn btn-primary'
        $loadPlayerBtn.addEventListener('click', async e => {
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
            $loadPlayerBtn.before($resizer)
            $loadPlayerBtn.remove()
            $playerWindow = $player.contentWindow

            coverplayReadyCallbacks.push(async () => {
                await delay(500)
                if ((await settingsAsync).autoplay) {
                    $playerWindow?.postMessage({ type: 'play' }, MEDIASITE_ORIGIN)
                }
                if (typeof desiredInitialPosition === 'number') {
                    $playerWindow?.postMessage({
                        type: 'seek',
                        position: desiredInitialPosition
                    }, MEDIASITE_ORIGIN)
                    // In case autoplay is disabled
                    $playerWindow?.postMessage({ type: 'play' }, MEDIASITE_ORIGIN)
                }
            })

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
        $con.appendChild($loadPlayerBtn)
    }

    // Append media info
    attachMediaInfo(playerOptions, {
        $con,
        compact: false,
        unwatchedAnchorPrefix: mediasiteId,
        $unwatchedAnchor: $loadPlayerBtn,
        findPlayerWindow: position => $playerWindow || ($loadPlayerBtn.click(), desiredInitialPosition = position, undefined)
    })

    const totalSeconds = Math.floor(duration / 1e3)
    const unwatchedPeriods = convertCoverageToUnwatched(coverages, totalSeconds)
    const coveredSeconds = totalSeconds - unwatchedPeriods.map(([a, b]) => b - a).reduce((p, c) => p + c, 0)

    // Show bookmark position
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

    const redraw = () => drawProgressOnce(
        $c => $li.appendChild($c),
        unwatchedPeriods,
        bookmark,
        totalSeconds,
        duration
    )
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
