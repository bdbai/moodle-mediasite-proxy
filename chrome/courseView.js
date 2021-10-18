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

function comparePlayerOptions(opt1, opt2) {
    if (opt1 === opt2) {
        return true
    }
    if (typeof opt1 === 'undefined' || typeof opt2 === 'undefined') {
        return false
    }
    return opt1.mediasiteId === opt2.mediasiteId
        && opt1.duration === opt2.duration
        && opt1.coverages.length === opt2.coverages.length
        && opt1.bookmark?.position === opt2.bookmark?.position
}

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

/**
 * @param {Element} $li
 */
function liIdToModuleId($li) {
    return $li.id.substr(7) // module-76543
}

const playerResizeObserver = new ResizeObserver(([{ contentRect: { height } }]) => {
    sessionStorage.setItem(DEFAULT_PLAYER_HEIGHT_SESSION_KEY, height)
})


/**
 * @param {Element} $li
 * @param {Object} playerOptions
 * @param {boolean} showThumbnail
 * @param {() => void} requestUpdate
 * @returns {{ update: (playerOptions: any) => void }}
 */
function displayPlayerOptions($li, playerOptions, showThumbnail, requestUpdate) {
    const $backup = $li.cloneNode(true)
    removeYuiIds($backup)
    const id = liIdToModuleId($li)
    const {
        mediasiteId,
        coverages, // second!
        duration,
        bookmark, // second!
        thumbnail
    } = playerOptions

    const $con = document.createElement('details')
    const $summary = document.createElement('summary')

    const $a = $li.querySelector('a')
    $a.addEventListener('click', e => {
        e.preventDefault()
        location.href = $a.getAttribute('href')
    })

    // In case load fails, recover old elements and do nothing on them
    let eventuallyAttachedChild = false
    setTimeout(() => {
        if (eventuallyAttachedChild) {
            return
        }
        $li.before($backup)
        // TODO: remove event listeners
        $li.remove()
    }, 50)
    for (const $el of Array.from($li.childNodes)) {
        $li.removeChild($el)
        $el.classList.add('item-header')
        $summary.appendChild($el)
    }
    let onThumbnailChange = _thumbnail => { }
    if (showThumbnail) {
        const $thumbCon = document.createElement('div')
        const $thumb = document.createElement('img')
        $thumbCon.appendChild($thumb)
        if (typeof $thumb.loading === 'string') {
            $thumb.loading = 'lazy'
        }
        $thumbCon.className = 'thumbnail'
        /** @type {AbortController} */
        let abortHandle = undefined
        onThumbnailChange = thumbnail => {
            if (abortHandle) {
                $summary.removeChild($thumbCon)
                abortHandle?.abort()
            }
            abortHandle = new AbortController()
            // Load image through background page (for CORS) with cookie
            // `ASP.NET_SessionId` omitted. Otherwise, we will get a 401.
            return getDataUrlAsync(thumbnail)
                // A trick to load data URLs generated from background pages
                .then(url => fetch(url, { signal: abortHandle.signal }))
                .then(res => (URL.revokeObjectURL(res.url), res.blob()))
                .then(blob => {
                    $thumb.src = URL.createObjectURL(blob)
                    $summary.appendChild($thumbCon)
                }, e => {
                    console.error(e)
                    throw e
                })
        }
        // Cached thumbnail URLs are very likely to expire. Do not load them.
        // onThumbnailChange(thumbnail)
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

            // When the container collapses, pause
            $summary.addEventListener('click', function onDetailClick(_e) {
                if ($con.open) {
                    // Manually trigger a coverage report
                    $player.contentWindow.postMessage({ type: 'updateCoverage' }, MEDIASITE_ORIGIN)
                    $player.contentWindow.postMessage({ type: 'pause' }, MEDIASITE_ORIGIN)
                    requestUpdate()
                }
            })
        })

        $con.appendChild($embedText)
        $con.appendChild(document.createElement('hr'))
        $con.appendChild($loadPlayerBtn)
    }

    // Append media info
    const onMediainfoChange = attachMediaInfo(playerOptions, {
        $con,
        compact: false,
        unwatchedAnchorPrefix: mediasiteId,
        $unwatchedAnchor: $loadPlayerBtn,
        findPlayerWindow: position => $playerWindow || ($loadPlayerBtn.click(), desiredInitialPosition = position, undefined)
    })

    const $instanceNameNode = $con.querySelector('span.instancename')
    const $instanceNameTextNode = $instanceNameNode.childNodes[0]
    const originalText = $instanceNameTextNode.textContent
    $instanceNameNode.setAttribute('data-original-text', originalText)
    let unwatchedPeriods
    const onCoverageChange = (duration, coverages) => {
        const totalSeconds = Math.floor(duration / 1e3)
        unwatchedPeriods = convertCoverageToUnwatched(coverages, totalSeconds)
        const coveredSeconds = totalSeconds - unwatchedPeriods.map(([a, b]) => b - a).reduce((p, c) => p + c, 0)

        // Show bookmark position
        const appendix = `[Est. completeness = ${Math.min(1, coveredSeconds / totalSeconds)
            .toLocaleString('en-US', {
                style: 'percent',
                maximumFractionDigits: 2
            })
            }]`
        $instanceNameTextNode.textContent = originalText + appendix //` [bookmark at 1:3(5%)][Est. completeness = %]`
    }
    onCoverageChange(duration, coverages)

    $li.appendChild($con)
    eventuallyAttachedChild = true

    const onProgressChange = drawProgress(
        $c => $li.appendChild($c),
        unwatchedPeriods,
        bookmark,
        duration
    )
    return {
        update: newPlayerOptions => {
            onThumbnailChange(newPlayerOptions.thumbnail)
            onMediainfoChange(newPlayerOptions)
            onCoverageChange(newPlayerOptions.duration, newPlayerOptions.coverages)
            onProgressChange(
                // Updated in onCoverageChange
                unwatchedPeriods,
                newPlayerOptions.bookmark, newPlayerOptions.duration)
        }
    }
}

/**
 * @type {string}
 */
let defaultWindowState = 'maximized'
!function () {
    const courseId = window.location.href.match(/id=(\d+)/)[1]
    // Collect information from GetPlayerOptions
    settingsAsync.then(({ extractInfo, showThumbnail }) => {
        if (!extractInfo) {
            return
        }

        // Remove builtin embedded player
        for (const $mediasiteContent of document.querySelectorAll('li.mediasite .contentafterlink')) {
            $mediasiteContent.remove()
        }

        const cachedPlayerOptionsKey = 'mediasite_cached_player_options_' + courseId
        let cachedPlayerOptionses = {}
        try {
            cachedPlayerOptionses = JSON.parse(localStorage.getItem(cachedPlayerOptionsKey) || '{}')
        } catch (_) { }
        const onMediaLiLinger = Object.fromEntries(
            $mediaLis.map($li => {
                /** @type {() => void} */
                let onLinger
                const linger = new Promise((resolve, _) => onLinger = resolve)

                    ; (async () => {
                        const moduleId = liIdToModuleId($li)
                        let cachedPlayerOptions = cachedPlayerOptionses[moduleId]
                        let playerOptions, update
                        function savePlayerOptions() {
                            if (!comparePlayerOptions(cachedPlayerOptions, playerOptions)) {
                                playerOptions.directUrls = []
                                playerOptions.slideStreams = []
                                playerOptions.thumbnail = undefined
                                playerOptions.type = undefined
                                playerOptions.title = undefined
                                cachedPlayerOptionses[moduleId] = playerOptions
                                localStorage.setItem(cachedPlayerOptionsKey, JSON.stringify(cachedPlayerOptionses))
                                cachedPlayerOptions = playerOptions
                            }
                        }
                        async function requestUpdate() {
                            playerOptions = await getPlayerOptionsAsync(moduleId)
                            update(playerOptions)
                            savePlayerOptions()
                        }
                        if (cachedPlayerOptions) {
                            update = displayPlayerOptions($li, cachedPlayerOptions, showThumbnail, requestUpdate).update
                            await linger
                            playerOptions = await getPlayerOptionsAsync(moduleId)
                            update(playerOptions)
                        } else {
                            await linger
                            playerOptions = await getPlayerOptionsAsync(moduleId)
                            update = displayPlayerOptions($li, playerOptions, showThumbnail, requestUpdate).update
                            update(playerOptions)
                        }
                        savePlayerOptions()
                    })()

                return [$li.id, onLinger]
            })
        )

        /** @type {Map<string, number>} */
        const videoEntryTimeouts = new Map()
        const observer = new IntersectionObserver(e => {
            for (const entry of e) {
                const targetId = entry.target.id
                if (entry.isIntersecting) {
                    videoEntryTimeouts.set(targetId, setTimeout(($li, targetId) => {
                        observer.unobserve($li)
                        videoEntryTimeouts.delete(targetId)
                        onMediaLiLinger[targetId]?.()
                        onMediaLiLinger[targetId] = undefined
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
    const titles = $mediaLis.map($li => {
        const id = liIdToModuleId($li)
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
